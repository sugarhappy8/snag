// More business events (registered in events.ts EVENTS, so the same yearly frequency cap applies):
// a franchise pitch, the food critic, an influencer collaboration, a data breach, a union drive,
// a big contract bid, a local copycat, an employee's product idea, a rent hike, a bidding war for a
// prime location, a celebrity investor and a trend wave. (The tax audit lives in events.ts.)
//
// Every choice is a real trade-off with fixed, honest odds. The Business talent's purple hint is
// scored with the same odds and amounts the resolver uses (economy.fxValue / expectedFx, rd.rdValue,
// franchise.franchiseValue), never touching g's RNG. Era and industry gates apply both to when an
// event can appear and to the words it uses.
import { addHidden, formatMoney, log, notice, scriptChoice } from '../core'
import { marketOf } from '../data/markets'
import { chance, pick, rand, randInt } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent } from '../talents'
import type { Asset, ChoiceOption, GameState, Json } from '../types'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { hasBoard } from './board'
import { marketDef } from './competition-data'
import { inGroup } from './conglomerate-state'
import { isDeepTech } from './deeptech-state'
import { bestPlan, bizWorth, ceoSkill, expectedFx, fxValue, localEcon, maxProduction, planFor, refreshValue, staffPower, startupCost, valuationOf, type BizFx, type Worth } from './economy'
import { bizHas } from './era'
import { isFinanceFirm } from './finance-firm'
import { laborProtection, unionStrength } from './flavor'
import { franchiseBlock, franchiseFee, franchiseUnits, franchiseValue, isFranchiseIndustry, maxSellable, netFee, ONBOARDING, ROYALTY, sellFranchises } from './franchise'
import { isStudio } from './gamestudio'
import { industryDef } from './industries'
import { productIdeas } from './products'
import { rdBase, rdMinBudget, rdValue, roundBudget, startRd } from './rd'
import { bizOf, diluteBusinessEquity, findBusiness, totalOutlets, type BizState } from './state'
import { aPct, clampN, markBest, money, num, pct, rec, str } from './util'

/** The shape events.ts picks from (weight 0: can't happen to this company now). */
export interface ExtraEvent {
  id: string
  weight: (g: GameState, b: BizState) => number
  present: (g: GameState, a: Asset, b: BizState) => void
}

interface Ctx {
  a: Asset
  b: BizState
  d: Record<string, Json>
}

function ctx(g: GameState, data: Json | undefined): Ctx | null {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d) return null
  return { a, b: bizOf(g, a), d }
}

/** A one-off cost from company cash (may go negative; the year-end review deals with that). */
function pay(b: BizState, amount: number): number {
  const n = Math.max(0, Math.round(amount))
  b.cash -= n
  b.yearCosts += n
  return n
}

/** One-off income into company cash, booked once (yearIncome). */
function earn(b: BizState, amount: number): number {
  const n = Math.max(0, Math.round(amount))
  b.cash += n
  b.yearIncome += n
  return n
}

function tell(g: GameState, title: string, text: string, emoji: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
  notice(g, title, text, { emoji, tone })
}

/** A cost that scales with the size of the company and the local price level (as in events.ts). */
function scaled(b: BizState, usBase: number): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  const size = Math.sqrt(Math.max(1, totalOutlets(b)))
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return Math.round(Math.max(usBase * e.level * size, revenue * (usBase / 400_000)))
}

type Branch = { p: number; fx: BizFx }

/** Expected value per choice id from outcome branches (nothing without the talent: no work for nothing). */
function scorer(g: GameState, b: BizState, build: (w: Worth) => Record<string, Branch[]>): (id: string) => number | null {
  if (!hasTalent(g, 'Business')) return () => null
  const w = bizWorth(g, b)
  const table = build(w)
  return (id) => (table[id] ? expectedFx(g, b, w, table[id]) : null)
}

const brandUp = (b: BizState, n: number) => (b.brand = clampN(b.brand + n, 0, 100))
const moraleUp = (b: BizState, n: number) => (b.morale = clampN(b.morale + n, 0, 100))

/** Classic price-and-production companies (not studios, deep tech or finance firms). */
function classic(b: BizState): boolean {
  return !isStudio(b) && !isDeepTech(b) && !isFinanceFirm(b)
}

/** Companies whose customers are the public (shops, food, services people walk into). */
const CONSUMER = new Set(['foodTruck', 'restaurant', 'cafe', 'bakery', 'bar', 'brewery', 'grocery', 'fashion', 'beauty', 'salon', 'gym', 'autoShop', 'hotel', 'ecommerce', 'entertainment', 'education', 'petCare', 'homeCare', 'travel', 'nightclub', 'casino'])

function consumer(b: BizState): boolean {
  return CONSUMER.has(b.industry) && classic(b)
}

function someone(g: GameState, b: BizState): string {
  return `${randomFirstName(g, b.countryId, chance(g, 0.5) ? 'male' : 'female')} ${randomLastName(g, b.countryId)}`
}

function otherCity(g: GameState, b: BizState): string {
  const cities = getCountry(b.countryId).cities.slice(0, 10).filter((c) => c !== b.city)
  return cities.length ? pick(g, cities) : b.city
}

// ---------------------------------------------------------------------------
// Franchise pitch: an entrepreneur wants to open your first franchise

/** Chance an entrepreneur accepts a fee 50% above the going rate. */
export const PITCH_PREMIUM_P = 0.5

const PITCH = defineScript('business.ev.franchisePitch', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const fee = num(x.d.fee)
  const who = str(x.d.who, 'The entrepreneur')
  const city = str(x.d.city, b.city)
  if (choice === 'decline') {
    tell(g, 'Not Yet', `You told ${who} that ${a.name} isn't franchising yet. They said they'd wait.`, '\u{1F645}')
    return
  }
  if (choice === 'premium' && !chance(g, PITCH_PREMIUM_P)) {
    tell(g, 'They Walked', `${who} said ${money(fee * 1.5)} was too rich for them and went off to open a sandwich place instead.`, '\u{1F6B6}')
    return
  }
  const gross = choice === 'premium' ? Math.round(fee * 1.5) : fee
  if (franchiseBlock(b) || sellFranchises(g, a, b, 1, gross) < 1) {
    tell(g, 'Deal Fell Through', `By the time the lawyers finished, ${a.name} no longer qualified to franchise. ${who} walked away.`, '\u{1F4C4}')
    return
  }
  log(g, `${a.name} sold its first franchise to ${who} in ${city}.`, 'good')
  tell(g, 'First Franchise!', `${who} will open a ${a.name} in ${city} with their own money. You keep ${formatMoney(Math.round(gross * (1 - ONBOARDING)))} of the ${formatMoney(gross)} fee after training them, plus ${Math.round(ROYALTY * 100)}% of their sales every year. More would-be franchisees can apply under Franchising.`, '\u{1F3EA}', 'good')
})

function presentFranchisePitch(g: GameState, a: Asset, b: BizState): void {
  const who = someone(g, b)
  const city = otherCity(g, b)
  const fee = franchiseFee(b)
  const choices: ChoiceOption[] = [
    { id: 'accept', label: `Sign: ${money(fee)} fee + ${Math.round(ROYALTY * 100)}% royalties`, emoji: '\u{270D}\u{FE0F}' },
    { id: 'premium', label: `Ask for ${money(fee * 1.5)} instead`, emoji: '\u{1F4C8}' },
    { id: 'decline', label: 'Not yet', emoji: '\u{1F645}' },
  ]
  markBest(g, choices, scorer(g, b, (w) => {
    const one = franchiseValue(g, b, 1, w)
    return {
      accept: [{ p: 1, fx: { value: one } }],
      premium: [{ p: PITCH_PREMIUM_P, fx: { value: one + Math.round(fee * 0.5 * (1 - ONBOARDING)) } }],
      decline: [],
    }
  }), (id) => (id === 'premium' ? `Best move: a coin flip at 50% more beats taking the going fee` : id === 'accept' ? 'Best move: the fee plus years of royalties, on their money' : undefined))
  scriptChoice(g, PITCH, 'A Franchise Pitch', `${who} loves ${a.name} and wants to open one in ${city}. They'd put up the money, follow your rules, pay a ${formatMoney(fee)} fee and ${Math.round(ROYALTY * 100)}% of their sales.`, choices, {
    emoji: '\u{1F3EA}',
    data: { assetId: a.id, fee, who, city },
  })
}

// ---------------------------------------------------------------------------
// The food critic

export function criticGoodP(b: BizState, choice: string): number {
  const q = clampN(0.15 + b.quality / 110 + 0.06 * staffPower(b, 'quality'), 0.05, 0.85)
  return clampN(q + (choice === 'prep' ? 0.15 : choice === 'vip' ? 0.05 : 0), 0.05, 0.95)
}

export function criticBadP(b: BizState, choice: string): number {
  return (1 - criticGoodP(b, choice)) * (choice === 'prep' ? 0.4 : choice === 'vip' ? 0.7 : 0.55)
}

function criticBranches(b: BizState, choice: string): Branch[] {
  const good = criticGoodP(b, choice)
  const bad = criticBadP(b, choice)
  return [
    ...(choice === 'prep' ? [{ p: 1, fx: { cash: -scaled(b, 3_000) } }] : []),
    { p: good, fx: { brand: 8, demandTo: 1.12 } },
    { p: 1 - good - bad, fx: { brand: 1 } },
    { p: bad, fx: { brand: -7, demandTo: 0.9 } },
  ]
}

const CRITIC = defineScript('business.ev.critic', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const critic = str(x.d.critic, 'The critic')
  const outlet = bizHas(g, b.countryId, 'internet') ? 'review site' : 'paper'
  if (choice === 'prep') pay(b, scaled(b, 3_000))
  const u = rand(g)
  const good = criticGoodP(b, choice)
  const bad = criticBadP(b, choice)
  if (u < good) {
    brandUp(b, 8)
    b.demandShock = Math.max(b.demandShock, 1.12)
    log(g, `${critic} gave ${a.name} a glowing review.`, 'good')
    tell(g, 'Five Stars!', `${critic}'s ${outlet} called ${a.name} "the best meal in ${b.city} this year." There is a line out the door.`, '\u{2B50}', 'good')
  } else if (u < good + bad) {
    brandUp(b, -7)
    b.demandShock = Math.min(b.demandShock, 0.9)
    log(g, `${critic} panned ${a.name}.`, 'bad')
    tell(g, 'Panned', `${critic} wrote that ${a.name}'s food "tasted like a long apology."${choice === 'vip' ? ' The red carpet made it worse: critics hate being recognized.' : ''} Bookings dropped.`, '\u{1F4C9}', 'bad')
  } else {
    brandUp(b, 1)
    tell(g, 'A Fair Review', `${critic} called ${a.name} "perfectly pleasant." Not the headline you dreamed of, but not a disaster.`, '\u{1F37D}\u{FE0F}')
  }
})

function presentCritic(g: GameState, a: Asset, b: BizState): void {
  const critic = someone(g, b)
  const where = bizHas(g, b.countryId, 'internet') ? 'the most-read food review site' : 'the biggest newspaper'
  const choices: ChoiceOption[] = [
    { id: 'normal', label: 'Treat them like anyone else', emoji: '\u{1F37D}\u{FE0F}' },
    { id: 'prep', label: `Premium ingredients all week (${money(scaled(b, 3_000))})`, emoji: '\u{1F969}' },
    { id: 'vip', label: 'Spot them and roll out the red carpet', emoji: '\u{1F451}' },
  ]
  markBest(g, choices, scorer(g, b, () => ({ normal: criticBranches(b, 'normal'), prep: criticBranches(b, 'prep'), vip: criticBranches(b, 'vip') })), (id) => `Best move: about ${aPct(criticGoodP(b, id))} chance of a rave`)
  scriptChoice(g, CRITIC, 'The Critic Is Coming', `Word is that ${critic}, the feared food critic of ${where}, is eating at ${a.name} in ${b.city} this week.`, choices, {
    emoji: '\u{1F575}\u{FE0F}',
    data: { assetId: a.id, critic },
  })
}

// ---------------------------------------------------------------------------
// Influencer collaboration (2010 and later, where social media exists)

export const INFLUENCER = {
  paid: { hit: 0.55, backlash: 0.1 },
  free: { hit: 0.3, backlash: 0.05 },
}

function influencerOk(g: GameState, b: BizState): boolean {
  return g.year >= 2010 && bizHas(g, b.countryId, 'socialMedia') && consumer(b)
}

function influencerBranches(b: BizState, choice: string): Branch[] {
  if (choice === 'paid') return [{ p: 1, fx: { cash: -scaled(b, 6_000) } }, { p: INFLUENCER.paid.hit, fx: { brand: 6, demandTo: 1.1 } }, { p: INFLUENCER.paid.backlash, fx: { brand: -5 } }]
  if (choice === 'free') return [{ p: 1, fx: { cash: -scaled(b, 800) } }, { p: INFLUENCER.free.hit, fx: { brand: 4, demandTo: 1.05 } }, { p: INFLUENCER.free.backlash, fx: { brand: -3 } }]
  return []
}

const COLLAB = defineScript('business.ev.influencer', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const handle = str(x.d.handle, 'the influencer')
  if (choice === 'pass' || (choice !== 'paid' && choice !== 'free')) {
    tell(g, 'Passed', `You left ${handle}'s message on read. They'll survive.`, '\u{1F645}')
    return
  }
  const o = INFLUENCER[choice]
  pay(b, scaled(b, choice === 'paid' ? 6_000 : 800))
  const u = rand(g)
  if (u < o.hit) {
    brandUp(b, choice === 'paid' ? 6 : 4)
    b.demandShock = Math.max(b.demandShock, choice === 'paid' ? 1.1 : 1.05)
    log(g, `An influencer collab put ${a.name} on everyone's feed.`, 'good')
    tell(g, 'It Landed', `The posts by ${handle} about ${a.name} took off. New customers keep showing you their screens at the counter.`, '\u{1F4F1}', 'good')
  } else if (u < o.hit + o.backlash) {
    brandUp(b, choice === 'paid' ? -5 : -3)
    tell(g, 'Backlash', `The followers of ${handle} decided the collab was "so obviously an ad" and said so in the comments, all of them. Brand down to ${b.brand}%.`, '\u{1F926}', 'bad')
  } else tell(g, 'Crickets', `The creator ${handle} posted, a few hundred people liked it, and that was that.`, '\u{1F997}')
})

function presentInfluencer(g: GameState, a: Asset, b: BizState): void {
  const first = randomFirstName(g, b.countryId, chance(g, 0.5) ? 'male' : 'female')
  const handle = `@${first.toLowerCase().replace(/[^a-z]/g, '') || 'creator'}${pick(g, ['eats', 'lifestyle', 'daily', 'vibes', 'finds'])}`
  const followers = randInt(g, 2, 9) * 100
  const choices: ChoiceOption[] = [
    { id: 'paid', label: `Pay for a sponsored series (${money(scaled(b, 6_000))})`, emoji: '\u{1F4B8}' },
    { id: 'free', label: `Just send free stuff (${money(scaled(b, 800))})`, emoji: '\u{1F381}' },
    { id: 'pass', label: 'Pass', emoji: '\u{1F645}' },
  ]
  markBest(g, choices, scorer(g, b, () => ({ paid: influencerBranches(b, 'paid'), free: influencerBranches(b, 'free'), pass: [] })), (id) =>
    id === 'pass' ? 'Best move: neither deal is worth its price for you' : `Best move: about ${aPct(INFLUENCER[id as 'paid' | 'free'].hit)} chance it takes off`,
  )
  scriptChoice(g, COLLAB, 'Influencer Collab', `The creator ${handle} (${followers}K followers) wants to feature ${a.name}. They have a rate card, a ring light and opinions about your logo.`, choices, {
    emoji: '\u{1F933}',
    data: { assetId: a.id, handle },
  })
}

// ---------------------------------------------------------------------------
// Data breach (online businesses, once there is an internet to breach)

const BREACH_INDUSTRIES = new Set(['software', 'ecommerce', 'telecom', 'dataCenter', 'marketing', 'travel', 'cybersecurity', 'aiLab'])

export const BREACH = {
  disclose: { fine: 0.1 },
  experts: { fine: 0.05 },
  quiet: { leak: 0.45 },
}

function breachBranches(b: BizState, choice: string): Branch[] {
  if (choice === 'disclose') return [{ p: 1, fx: { cash: -scaled(b, 15_000), brand: -4 } }, { p: BREACH.disclose.fine, fx: { cash: -scaled(b, 20_000) } }]
  if (choice === 'experts') return [{ p: 1, fx: { cash: -scaled(b, 30_000), brand: -2 } }, { p: BREACH.experts.fine, fx: { cash: -scaled(b, 20_000) } }]
  return [{ p: 1, fx: { karma: -4 } }, { p: BREACH.quiet.leak, fx: { brand: -15, demandTo: 0.85, cash: -scaled(b, 60_000) } }]
}

const BREACH_EV = defineScript('business.ev.breach', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  if (choice === 'quiet') {
    addHidden(g, 'karma', -4)
    if (chance(g, BREACH.quiet.leak)) {
      const fine = pay(b, scaled(b, 60_000))
      brandUp(b, -15)
      b.demandShock = Math.min(b.demandShock, 0.85)
      log(g, `${a.name}'s hidden data breach came out.`, 'bad')
      tell(g, 'The Cover-Up Came Out', `A journalist found out about the breach and the silence. Regulators fined ${a.name} ${formatMoney(fine)}, and customers are leaving in droves.`, '\u{1F4F0}', 'bad')
    } else tell(g, 'Patched', `Your engineers patched the hole over a long weekend. Nobody outside the company ever found out. Your conscience did.`, '\u{1F92B}')
    return
  }
  const cost = pay(b, scaled(b, choice === 'experts' ? 30_000 : 15_000))
  brandUp(b, choice === 'experts' ? -2 : -4)
  const fined = chance(g, choice === 'experts' ? BREACH.experts.fine : BREACH.disclose.fine)
  const fine = fined ? pay(b, scaled(b, 20_000)) : 0
  log(g, `${a.name} owned up to a data breach.`, 'neutral')
  tell(g, choice === 'experts' ? 'Experts Called In' : 'Owned Up', `${choice === 'experts' ? `A crack incident-response team sealed the breach and wrote the report regulators like to see (${formatMoney(cost)}).` : `You told every customer and paid for their protection (${formatMoney(cost)}).`} ${fined ? `The regulator still fined ${a.name} ${formatMoney(fine)}.` : 'The regulator let it go with a warning.'} Customers grumbled, but most stayed.`, '\u{1F510}', fined ? 'bad' : 'neutral')
})

function presentBreach(g: GameState, a: Asset, b: BizState): void {
  const records = randInt(g, 2, 90) * 1000
  const choices: ChoiceOption[] = [
    { id: 'disclose', label: `Tell customers now (${money(scaled(b, 15_000))})`, emoji: '\u{1F4E2}' },
    { id: 'experts', label: `Call in incident responders (${money(scaled(b, 30_000))})`, emoji: '\u{1F9D1}\u{200D}\u{1F4BB}' },
    { id: 'quiet', label: 'Patch it quietly and say nothing', emoji: '\u{1F92B}' },
  ]
  markBest(g, choices, scorer(g, b, () => ({ disclose: breachBranches(b, 'disclose'), experts: breachBranches(b, 'experts'), quiet: breachBranches(b, 'quiet') })), (id) =>
    id === 'quiet' ? `Best move by the numbers: about ${aPct(1 - BREACH.quiet.leak)} chance it never comes out` : undefined,
  )
  scriptChoice(g, BREACH_EV, 'Data Breach', `Hackers got into ${a.name}'s systems and copied about ${records.toLocaleString('en-US')} customer records. Your engineers found the hole this morning.`, choices, {
    emoji: '\u{1F513}',
    data: { assetId: a.id },
  })
}

// ---------------------------------------------------------------------------
// Union drive

/** Chance better perks talk the staff out of unionizing; chance union-busting works. */
export const PERKS_P = 0.5
export const BUST_P = 0.55

function wageStep(b: BizState, x: number): number {
  return clampN(Math.round((b.wageLevel + x) * 100) / 100, 0.7, 1.5) - b.wageLevel
}

function perksCost(b: BizState): number {
  return Math.round(Math.max(1, b.employees) * 400 * localEcon(b.industry, b.countryId, b.city).level)
}

function unionBranches(b: BizState, choice: string): Branch[] {
  if (choice === 'recognize') return [{ p: 1, fx: { wage: wageStep(b, 0.03), morale: 12, karma: 3 } }]
  if (choice === 'perks') return [{ p: 1, fx: { cash: -perksCost(b) } }, { p: PERKS_P, fx: { morale: 6 } }, { p: 1 - PERKS_P, fx: { wage: wageStep(b, 0.04), morale: -2 } }]
  return [{ p: 1, fx: { cash: -scaled(b, 8_000), karma: -5 } }, { p: BUST_P, fx: { morale: -6 } }, { p: 1 - BUST_P, fx: { wage: wageStep(b, 0.05), morale: -12, brand: -4 } }]
}

const UNION = defineScript('business.ev.union', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const raise = (n: number) => (b.wageLevel = clampN(Math.round((b.wageLevel + n) * 100) / 100, 0.7, 1.5))
  if (choice === 'recognize') {
    raise(0.03)
    moraleUp(b, 12)
    addHidden(g, 'karma', 3)
    log(g, `I recognized the union at ${a.name}.`, 'good')
    tell(g, 'Union Recognized', `You shook hands with the new shop stewards. The first contract adds 3% to pay, and morale jumped to ${b.morale}%.`, '\u{1F91D}', 'good')
    return
  }
  if (choice === 'perks') {
    const cost = pay(b, perksCost(b))
    if (chance(g, PERKS_P)) {
      moraleUp(b, 6)
      tell(g, 'Perks Worked', `Better breaks, a new staff room and free lunches (${formatMoney(cost)}) did the trick. The union drive fizzled out.`, '\u{1F96A}', 'good')
    } else {
      raise(0.04)
      moraleUp(b, -2)
      tell(g, 'They Voted Yes Anyway', `The staff enjoyed the perks (${formatMoney(cost)}) and voted for the union anyway. Their first contract adds 4% to pay.`, '\u{1F5F3}\u{FE0F}', 'bad')
    }
    return
  }
  const cost = pay(b, scaled(b, 8_000))
  addHidden(g, 'karma', -5)
  if (chance(g, BUST_P)) {
    moraleUp(b, -6)
    log(g, `I fought off a union drive at ${a.name}.`, 'neutral')
    tell(g, 'Drive Defeated', `Your consultants (${formatMoney(cost)}) ran a lot of "information sessions." The vote failed, and the break room got very quiet.`, '\u{1F6AB}')
  } else {
    raise(0.05)
    moraleUp(b, -12)
    brandUp(b, -4)
    log(g, `A union won its vote at ${a.name} after a nasty fight.`, 'bad')
    tell(g, 'Union Won', `The staff voted the union in after your expensive campaign (${formatMoney(cost)}) made the local news. Their first contract adds 5% to pay, and nobody waves at you anymore.`, '\u{1F4E2}', 'bad')
  }
})

function presentUnion(g: GameState, a: Asset, b: BizState): void {
  const choices: ChoiceOption[] = [
    { id: 'recognize', label: 'Recognize the union (3% raise)', emoji: '\u{1F91D}' },
    { id: 'perks', label: `Offer better perks instead (${money(perksCost(b))})`, emoji: '\u{1F96A}' },
  ]
  if (laborProtection(b.countryId) < 0.6) choices.push({ id: 'fight', label: `Hire union-busting consultants (${money(scaled(b, 8_000))})`, emoji: '\u{1F6AB}' })
  markBest(g, choices, scorer(g, b, () => ({ recognize: unionBranches(b, 'recognize'), perks: unionBranches(b, 'perks'), fight: unionBranches(b, 'fight') })), (id) =>
    id === 'perks' ? `Best move: about ${aPct(PERKS_P)} chance the drive fizzles` : id === 'fight' ? `Best move by the numbers: about ${aPct(BUST_P)} chance the vote fails` : undefined,
  )
  scriptChoice(g, UNION, 'Union Drive', `Staff at ${a.name} have collected signatures to form a union. They want a seat at the table on pay and shifts, and they want an answer.`, choices, {
    emoji: '\u{270A}',
    data: { assetId: a.id },
  })
}

// ---------------------------------------------------------------------------
// A big contract bid (companies that sell to governments and other companies)

const B2B = new Set(['construction', 'software', 'logistics', 'marketing', 'manufacturing', 'packaging', 'energy', 'dataCenter', 'telecom', 'furniture', 'recycling', 'water', 'solar', 'battery'])

export const BID = {
  low: { win: 0.7, margin: 0.09, overrun: 0.2 },
  fair: { win: 0.33, margin: 0.2, overrun: 0.1 },
}

export function bidWinP(b: BizState, choice: 'low' | 'fair'): number {
  return clampN(BID[choice].win + 0.06 * staffPower(b, 'sales'), 0.05, 0.92)
}

function bidBranches(b: BizState, choice: string, value: number): Branch[] {
  if (choice !== 'low' && choice !== 'fair') return []
  const o = BID[choice]
  const win = bidWinP(b, choice)
  return [
    { p: 1, fx: { cash: -scaled(b, 2_000) } },
    { p: win, fx: { cash: Math.round(value * o.margin), brand: 2, capacityTo: 0.05 } },
    { p: win * o.overrun, fx: { cash: -Math.round(value * 0.1) } },
  ]
}

const BID_EV = defineScript('business.ev.bid', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const value = num(x.d.value)
  const client = str(x.d.client, 'the client')
  if (choice !== 'low' && choice !== 'fair') {
    tell(g, 'Sat This One Out', `You skipped the tender. ${client} gave the contract to someone else.`, '\u{1F937}')
    return
  }
  const prep = pay(b, scaled(b, 2_000))
  if (!chance(g, bidWinP(b, choice))) {
    tell(g, 'Lost the Bid', `${client} picked another bidder. Preparing the bid cost ${formatMoney(prep)}.`, '\u{1F4C4}', 'bad')
    return
  }
  const profit = earn(b, value * BID[choice].margin)
  brandUp(b, 2)
  b.capacityLoss = Math.max(b.capacityLoss, 0.05)
  const over = chance(g, BID[choice].overrun) ? pay(b, value * 0.1) : 0
  log(g, `${a.name} won a ${money(value)} contract from ${client}.`, 'good')
  tell(g, 'Contract Won!', `${a.name} won the ${formatMoney(value)} contract from ${client}. It should leave about ${formatMoney(profit)} of profit after the work is done.${over ? ` Then the costs ran over by ${formatMoney(over)}. Of course they did.` : ''} A busy team means a little less capacity for everyone else this year.`, '\u{1F4DD}', over > profit ? 'neutral' : 'good')
})

function presentBid(g: GameState, a: Asset, b: BizState): void {
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  const value = Math.max(scaled(b, 20_000), Math.round((revenue * (0.15 + rand(g) * 0.25)) / 1000) * 1000)
  const client = pick(g, [`the ${b.city} city council`, `a national rail operator`, `${getCountry(b.countryId).name}'s biggest retailer`, 'a hospital group', 'the ministry of public works'])
  const choices: ChoiceOption[] = [
    { id: 'low', label: `Bid low (thin margin, likelier win)`, emoji: '\u{1F4C9}' },
    { id: 'fair', label: `Bid at a fair price`, emoji: '\u{2696}\u{FE0F}' },
    { id: 'skip', label: 'Skip it', emoji: '\u{1F937}' },
  ]
  markBest(g, choices, scorer(g, b, () => ({ low: bidBranches(b, 'low', value), fair: bidBranches(b, 'fair', value), skip: [] })), (id) =>
    id === 'skip' ? 'Best move: the bid costs more than it is likely to earn' : `Best move: about ${aPct(bidWinP(b, id as 'low' | 'fair'))} chance to win it`,
  )
  scriptChoice(g, BID_EV, 'Big Contract', `${client.charAt(0).toUpperCase()}${client.slice(1)} put out a tender worth about ${formatMoney(value)}. Preparing a bid costs ${formatMoney(scaled(b, 2_000))}; a low bid wins more often, a fair one pays more.`, choices, {
    emoji: '\u{1F4DD}',
    data: { assetId: a.id, value, client },
  })
}

// ---------------------------------------------------------------------------
// A local copycat (local trades: a rival copies your look across town)

export function copycatWinP(b: BizState): number {
  return clampN(0.35 + b.brand / 200, 0.2, 0.8)
}

function copycatBranches(b: BizState, choice: string): Branch[] {
  if (choice === 'lawyer') {
    const win = copycatWinP(b)
    return [{ p: 1, fx: { cash: -scaled(b, 4_000) } }, { p: win, fx: { brand: 1 } }, { p: 1 - win, fx: { pressureTo: 0.12 } }]
  }
  if (choice === 'refresh') return [{ p: 1, fx: { cash: -scaled(b, 9_000), quality: 4, brand: 2, pressureTo: 0.06 } }]
  return [{ p: 1, fx: { pressureTo: 0.16, brand: -1 } }]
}

const COPYCAT = defineScript('business.ev.localCopycat', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const rival = str(x.d.rival, 'the copycat')
  if (choice === 'lawyer') {
    const cost = pay(b, scaled(b, 4_000))
    if (chance(g, copycatWinP(b))) {
      brandUp(b, 1)
      tell(g, 'They Backed Down', `One stern letter (${formatMoney(cost)}) later, ${rival} repainted the sign and changed the menu. Everyone in town knows who the original is.`, '\u{2696}\u{FE0F}', 'good')
    } else {
      b.pressure = Math.max(b.pressure, 0.12)
      tell(g, 'No Case', `Your lawyer (${formatMoney(cost)}) explained that you can't own "a vibe." ${rival} carries on.`, '\u{2696}\u{FE0F}', 'bad')
    }
    return
  }
  if (choice === 'refresh') {
    const cost = pay(b, scaled(b, 9_000))
    b.quality = clampN(b.quality + 4, 0, 100)
    brandUp(b, 2)
    b.pressure = Math.max(b.pressure, 0.06)
    tell(g, 'Fresh Look', `You spent ${formatMoney(cost)} reinventing ${a.name}: new signature items, sharper service. Let them copy last year's version.`, '\u{2728}', 'good')
    return
  }
  b.pressure = Math.max(b.pressure, 0.16)
  brandUp(b, -1)
  tell(g, 'Imitation Is Flattery', `You let ${rival} be. Some of your customers can't tell the difference, which stings.`, '\u{1F937}')
})

function presentCopycat(g: GameState, a: Asset, b: BizState): void {
  const def = industryDef(b.industry)
  const words = marketOf(b.countryId).nameWords
  const rival = `${words.length ? pick(g, words) : randomLastName(g, b.countryId)} ${pick(g, def.suffixes)}`
  const choices: ChoiceOption[] = [
    { id: 'lawyer', label: `Send a lawyer's letter (${money(scaled(b, 4_000))})`, emoji: '\u{2696}\u{FE0F}' },
    { id: 'refresh', label: `Reinvent your concept (${money(scaled(b, 9_000))})`, emoji: '\u{2728}' },
    { id: 'ignore', label: 'Let it go', emoji: '\u{1F937}' },
  ]
  markBest(g, choices, scorer(g, b, () => ({ lawyer: copycatBranches(b, 'lawyer'), refresh: copycatBranches(b, 'refresh'), ignore: copycatBranches(b, 'ignore') })), (id) =>
    id === 'lawyer' ? `Best move: about ${aPct(copycatWinP(b))} chance they back down` : undefined,
  )
  scriptChoice(g, COPYCAT, 'Copycat in Town', `${rival} opened in ${b.city} with your colors, your signature ${def.unitOne}, and a logo in a suspiciously similar font.`, choices, {
    emoji: '\u{1F46F}',
    data: { assetId: a.id, rival },
  })
}

// ---------------------------------------------------------------------------
// An employee's product idea (classic companies that make products)

function ideaBudget(b: BizState): number {
  return Math.max(rdMinBudget(b), roundBudget(rdBase(b) * 0.6))
}

function ideaBranches(g: GameState, b: BizState, w: Worth, choice: string): Branch[] {
  if (choice === 'fund') return [{ p: 1, fx: { value: rdValue(g, b, ideaBudget(b), w).value, morale: 5 } }]
  if (choice === 'bonus') return [{ p: 1, fx: { cash: -scaled(b, 1_500), morale: 3 } }]
  return [{ p: 1, fx: { morale: -3 } }]
}

const IDEA = defineScript('business.ev.employeeIdea', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const who = str(x.d.who, 'An employee')
  const idea = str(x.d.idea)
  if (choice === 'fund' && idea) {
    const budget = ideaBudget(b)
    if (b.cash < budget || !startRd(g, a, b, idea, budget)) {
      moraleUp(b, 1)
      return
    }
    moraleUp(b, 5)
    log(g, `${a.name} started work on ${who}'s idea, ${idea}.`, 'good')
    return
  }
  if (choice === 'bonus') {
    const cost = pay(b, scaled(b, 1_500))
    moraleUp(b, 3)
    tell(g, 'Thanks, But No', `You gave ${who} a ${formatMoney(cost)} bonus for the idea and shelved it. They seem happy enough.`, '\u{1F4B5}')
    return
  }
  moraleUp(b, -3)
  tell(g, 'Shot Down', `You told ${who} to stick to the day job. The team noticed.`, '\u{1F645}')
})

function presentIdea(g: GameState, a: Asset, b: BizState): void {
  const ideas = productIdeas(g, b, 3)
  if (!ideas.length) return
  const idea = pick(g, ideas)
  const s = b.staff.length ? pick(g, b.staff) : null
  const who = s ? `${s.firstName} ${s.lastName}` : someone(g, b)
  const role = s ? `, your ${s.role},` : ' from the floor staff'
  const budget = ideaBudget(b)
  const choices: ChoiceOption[] = []
  if (b.cash >= budget) choices.push({ id: 'fund', label: `Fund it (${money(budget)} of R&D)`, emoji: '\u{1F9EA}' })
  choices.push({ id: 'bonus', label: `A bonus for the idea (${money(scaled(b, 1_500))})`, emoji: '\u{1F4B5}' }, { id: 'pass', label: 'Not now', emoji: '\u{1F645}' })
  markBest(g, choices, scorer(g, b, (w) => ({ fund: ideaBranches(g, b, w, 'fund'), bonus: ideaBranches(g, b, w, 'bonus'), pass: ideaBranches(g, b, w, 'pass') })), (id) =>
    id === 'fund' ? `Best move: about ${aPct(rdValue(g, b, budget).odds)} odds it works, and the team loves being heard` : undefined,
  )
  scriptChoice(g, IDEA, 'A Bright Idea', `${who}${role} pitched you an idea over lunch: "${idea}". They've clearly thought about it a lot.`, choices, {
    emoji: '\u{1F4A1}',
    data: { assetId: a.id, who, idea },
  })
}

// ---------------------------------------------------------------------------
// Landlord rent hike

export function rentDealP(g: GameState, b: BizState): number {
  return clampN(0.35 + ceoSkill(g, b) / 250 + 0.1 * staffPower(b, 'finance'), 0.2, 0.8)
}

function moveCost(b: BizState): number {
  return Math.round(localEcon(b.industry, b.countryId, b.city).capital * 0.12)
}

function rentBranches(g: GameState, b: BizState, choice: string, extra: number): Branch[] {
  if (choice === 'pay') return [{ p: 1, fx: { cash: -extra } }]
  if (choice === 'negotiate') {
    const p = rentDealP(g, b)
    return [{ p, fx: { cash: -Math.round(extra * 0.4) } }, { p: 1 - p, fx: { cash: -Math.round(extra * 1.15) } }]
  }
  const loss = Math.round((0.08 / Math.max(1, Math.sqrt(totalOutlets(b)))) * 100) / 100
  return [{ p: 1, fx: { cash: -moveCost(b), capacityTo: loss, brand: -2 } }]
}

const RENT = defineScript('business.ev.rent', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const extra = num(x.d.extra)
  if (choice === 'negotiate') {
    if (chance(g, rentDealP(g, b))) {
      const cost = pay(b, extra * 0.4)
      tell(g, 'Talked Down', `After three meetings and a fruit basket the landlord settled for a smaller increase: ${formatMoney(cost)} more this year.`, '\u{1F91D}', 'good')
    } else {
      const cost = pay(b, extra * 1.15)
      tell(g, 'Landlord Dug In', `The landlord didn't budge and billed you for their lawyer too: ${formatMoney(cost)} more this year.`, '\u{1F3E0}', 'bad')
    }
    return
  }
  if (choice === 'move') {
    const cost = pay(b, moveCost(b))
    const loss = Math.round((0.08 / Math.max(1, Math.sqrt(totalOutlets(b)))) * 100) / 100
    b.capacityLoss = Math.max(b.capacityLoss, loss)
    brandUp(b, -2)
    log(g, `${a.name} moved to new premises in ${b.city}.`, 'neutral')
    tell(g, 'Moving Day', `${a.name} moved down the street (${formatMoney(cost)} for the move and fit-out). A few weeks closed, a few regulars confused, but no rent hike.`, '\u{1F69A}')
    return
  }
  const cost = pay(b, extra)
  tell(g, 'Rent Paid', `You signed the new lease. ${formatMoney(cost)} more rent this year.`, '\u{1F3E0}')
})

function presentRent(g: GameState, a: Asset, b: BizState): void {
  const e = localEcon(b.industry, b.countryId, b.city)
  const hike = Math.round((0.15 + rand(g) * 0.25) * 100) / 100
  const extra = Math.round(e.rent * hike)
  const def = industryDef(b.industry)
  const choices: ChoiceOption[] = [
    { id: 'pay', label: `Pay it (${money(extra)} this year)`, emoji: '\u{1F4B8}' },
    { id: 'negotiate', label: 'Negotiate', emoji: '\u{1F5E3}\u{FE0F}' },
    { id: 'move', label: `Move down the street (${money(moveCost(b))})`, emoji: '\u{1F69A}' },
  ]
  markBest(g, choices, scorer(g, b, () => ({ pay: rentBranches(g, b, 'pay', extra), negotiate: rentBranches(g, b, 'negotiate', extra), move: rentBranches(g, b, 'move', extra) })), (id) =>
    id === 'negotiate' ? `Best move: about ${aPct(rentDealP(g, b))} chance the landlord gives way` : undefined,
  )
  scriptChoice(g, RENT, 'Rent Hike', `The landlord of your ${def.site} in ${b.city} wants ${Math.round(hike * 100)}% more rent for the coming year: about ${formatMoney(extra)} extra.`, choices, {
    emoji: '\u{1F3E0}',
    data: { assetId: a.id, extra },
  })
}

// ---------------------------------------------------------------------------
// A prime location comes up (bidding war against a rival)

export const LOWBALL_P = 0.4

function primePremium(b: BizState, choice: string): number {
  const capital = startupCost(b.industry, b.countryId, b.city).capital
  return Math.round(capital * (choice === 'bid' ? 0.25 : 0.1))
}

/** Yearly profit one more outlet in the city adds (the planner, no dice) over a few years, net of its fit-out. */
function outletWorth(g: GameState, b: BizState, city: string): number {
  const withOne: BizState = {
    ...b,
    outlets: b.outlets.some((o) => o.countryId === b.countryId && o.city === city)
      ? b.outlets.map((o) => (o.countryId === b.countryId && o.city === city ? { ...o, count: o.count + 1 } : o))
      : [...b.outlets, { countryId: b.countryId, city, count: 1, opened: g.year }],
  }
  const gain = bestPlan(g, withOne, { fast: true }).profit - bestPlan(g, b, { fast: true }).profit
  const capital = startupCost(b.industry, b.countryId, city).capital
  return gain * 4 - capital * 0.65
}

function primeBranches(g: GameState, b: BizState, choice: string, city: string): Branch[] {
  if (choice === 'pass') return [{ p: 1, fx: { pressureTo: 0.08 } }]
  const win = choice === 'bid' ? 1 : LOWBALL_P
  const worth = outletWorth(g, b, city)
  return [
    { p: win, fx: { value: worth, cash: -primePremium(b, choice), brand: 3, demandTo: 1.04 } },
    { p: 1 - win, fx: { pressureTo: 0.08 } },
  ]
}

function openPrime(g: GameState, a: Asset, b: BizState, city: string, premium: number): boolean {
  const capital = startupCost(b.industry, b.countryId, city).capital
  if (b.cash < capital + premium) return false
  // The fit-out is capital spending (like any opening); the key money is a cost of the year.
  b.cash -= capital
  pay(b, premium)
  const o = b.outlets.find((x) => x.countryId === b.countryId && x.city === city)
  if (o) o.count += 1
  else b.outlets.push({ countryId: b.countryId, city, count: 1, opened: g.year })
  brandUp(b, 3)
  b.demandShock = Math.max(b.demandShock, 1.04)
  // The plan grows with the new site (as when opening any location).
  b.production = Math.min(maxProduction(g, b), Math.round(b.production + planFor(g, b, g.year, { calm: true }).demand / Math.max(1, totalOutlets(b))))
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  log(g, `${a.name} opened a flagship ${industryDef(b.industry).site} on a prime corner of ${city}.`, 'good')
  return true
}

const PRIME = defineScript('business.ev.prime', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const city = str(x.d.city, b.city)
  const rival = str(x.d.rival, 'a rival')
  if (choice === 'pass' || (choice === 'lowball' && !chance(g, LOWBALL_P))) {
    b.pressure = Math.max(b.pressure, 0.08)
    tell(g, 'Lost the Spot', `${rival} got the corner in ${city}. Their grand-opening balloons are visible from your door.`, '\u{1F388}', 'bad')
    return
  }
  const premium = primePremium(b, choice)
  if (!openPrime(g, a, b, city, premium)) {
    tell(g, 'Cash Fell Short', `By signing day ${a.name} couldn't cover the fit-out and the key money. ${rival} got the corner.`, '\u{1F4B8}', 'bad')
    return
  }
  tell(g, 'Prime Corner!', `${a.name} won the corner in ${city} (${formatMoney(premium)} in key money on top of the fit-out). A flagship like this is its own billboard.`, '\u{1F3D9}\u{FE0F}', 'good')
})

function presentPrime(g: GameState, a: Asset, b: BizState): void {
  const def = industryDef(b.industry)
  const city = pick(g, getCountry(b.countryId).cities.slice(0, 3))
  const words = marketOf(b.countryId).nameWords
  const rival = `${words.length ? pick(g, words) : randomLastName(g, b.countryId)} ${pick(g, def.suffixes)}`
  const capital = startupCost(b.industry, b.countryId, city).capital
  const choices: ChoiceOption[] = [
    { id: 'bid', label: `Outbid them (${money(primePremium(b, 'bid'))} key money)`, emoji: '\u{1F4B0}' },
    { id: 'lowball', label: `Lowball (${money(primePremium(b, 'lowball'))})`, emoji: '\u{1F3B2}' },
    { id: 'pass', label: 'Let them have it', emoji: '\u{1F937}' },
  ]
  markBest(g, choices, scorer(g, b, () => ({ bid: primeBranches(g, b, 'bid', city), lowball: primeBranches(g, b, 'lowball', city), pass: primeBranches(g, b, 'pass', city) })), (id) =>
    id === 'pass' ? `Best move: another ${def.site} there wouldn't earn its cost back` : id === 'lowball' ? `Best move: about ${aPct(LOWBALL_P)} chance they take it` : undefined,
  )
  scriptChoice(g, PRIME, 'Prime Location', `The best corner in ${city} is up for lease, and ${rival} wants it too. Opening a ${def.site} there costs about ${formatMoney(capital)} for the fit-out, plus key money to win the lease.`, choices, {
    emoji: '\u{1F3D9}\u{FE0F}',
    data: { assetId: a.id, city, rival },
  })
}

// ---------------------------------------------------------------------------
// Celebrity investor

/** Chance the star takes half the stake at the same price. */
export const HALF_STAKE_P = 0.6

/**
 * What a new-money deal is worth to the owner: their stake of the company after the cash comes in,
 * minus their stake before (positive when the star pays above the company's value), plus their
 * part of the brand boost.
 */
export function equityGain(g: GameState, b: BizState, w: Worth, stake: number, invest: number): number {
  const after = b.share * (1 - stake)
  return after * (Math.max(0, b.valuation) + invest) - b.share * Math.max(0, b.valuation) + after * fxValue(g, b, w, { brand: 8 })
}

/** The cash a star puts in for `stake` of the company at a pre-money valuation `pre`. */
export function stakePrice(stake: number, pre: number): number {
  return Math.round((stake / (1 - stake)) * pre)
}

function sellStake(g: GameState, a: Asset, b: BizState, stake: number, invest: number, who: string): void {
  b.cash += invest
  b.share = clampN(b.share * (1 - stake), 0.01, 1)
  diluteBusinessEquity(b, 1 - stake)
  brandUp(b, 8)
  b.demandShock = Math.max(b.demandShock, 1.05)
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  log(g, `${who} bought ${pct(stake)} of ${a.name}.`, 'good')
  tell(g, 'Star Investor', `${who} put ${formatMoney(invest)} into ${a.name} for ${pct(stake)} of the company, and won't stop talking about it in interviews. You own ${pct(b.share)} now, and the company has a board to answer to.`, '\u{1F31F}', 'good')
}

const STAR = defineScript('business.ev.starInvestor', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const who = str(x.d.who, 'The star')
  const stake = num(x.d.stake)
  const pre = num(x.d.pre)
  if (choice === 'decline' || !(stake > 0) || !(pre > 0) || b.public || b.share < 0.999) {
    tell(g, 'Thanks, But No', `You told ${who} that ${a.name} isn't looking for investors. They took it well, on camera.`, '\u{1F645}')
    return
  }
  if (choice === 'half') {
    if (!chance(g, HALF_STAKE_P)) {
      tell(g, 'Deal Off', `${who}'s manager said it was the full stake or nothing. It was nothing.`, '\u{1F6B6}')
      return
    }
    sellStake(g, a, b, stake / 2, stakePrice(stake / 2, pre), who)
    return
  }
  sellStake(g, a, b, stake, stakePrice(stake, pre), who)
})

function presentStar(g: GameState, a: Asset, b: BizState): void {
  const who = someone(g, b)
  const what = pick(g, ['the famous actor', 'the champion athlete', 'the famous singer', 'the much-loved comedian'])
  const stake = Math.round((0.1 + rand(g) * 0.1) * 100) / 100
  // Stars don't always pay full price: some offers are generous, some lean on the fame they bring.
  const pre = Math.round(Math.max(1, b.valuation) * (0.85 + rand(g) * 0.5))
  const invest = stakePrice(stake, pre)
  const choices: ChoiceOption[] = [
    { id: 'accept', label: `Sell ${pct(stake)} for ${money(invest)}`, emoji: '\u{1F91D}' },
    { id: 'half', label: `Offer half as much (${pct(stake / 2)})`, emoji: '\u{2702}\u{FE0F}' },
    { id: 'decline', label: 'Keep it all', emoji: '\u{1F645}' },
  ]
  markBest(g, choices, scorer(g, b, (w) => ({
    accept: [{ p: 1, fx: { value: equityGain(g, b, w, stake, invest) } }],
    half: [{ p: HALF_STAKE_P, fx: { value: equityGain(g, b, w, stake / 2, stakePrice(stake / 2, pre)) } }],
    decline: [],
  })), (id) => (id === 'decline' ? 'Best move: your stake is worth more than the star pays' : pre >= b.valuation ? `Best move: they pay ${pct(pre / Math.max(1, b.valuation) - 1)} above what ${a.name} is worth, and bring the fans` : 'Best move: the fans they bring are worth more than the discount'))
  scriptChoice(g, STAR, 'Celebrity Investor', `${who}, ${what}, is a huge fan of ${a.name} and wants to invest ${formatMoney(invest)} for ${pct(stake)} of it. That values the company at ${formatMoney(pre)} before the money (your accountant says about ${money(b.valuation)}). New shares mean a board.`, choices, {
    emoji: '\u{1F31F}',
    data: { assetId: a.id, who, stake, pre },
  })
}

// ---------------------------------------------------------------------------
// A trend wave sweeps the country

interface Trend {
  label: string
  industries: string[]
  from: number
  to?: number
}

const FOOD = ['restaurant', 'cafe', 'bakery', 'foodTruck', 'grocery']
const TRENDS: Trend[] = [
  { label: 'plant-based eating', industries: FOOD, from: 2015 },
  { label: 'gourmet burgers', industries: ['restaurant', 'foodTruck', 'bar'], from: 2008 },
  { label: 'cupcakes', industries: ['bakery', 'cafe'], from: 2004, to: 2014 },
  { label: 'frozen yogurt', industries: ['cafe', 'foodTruck'], from: 2006, to: 2014 },
  { label: 'cold brew coffee', industries: ['cafe', 'grocery'], from: 2014 },
  { label: 'espresso drinks', industries: ['cafe'], from: 1990 },
  { label: 'sushi', industries: ['restaurant', 'grocery'], from: 1980 },
  { label: 'organic food', industries: FOOD, from: 1990 },
  { label: 'low-carb diets', industries: FOOD, from: 2002, to: 2008 },
  { label: 'fondue parties', industries: ['restaurant', 'grocery'], from: 1965, to: 1980 },
  { label: 'milkshake bars', industries: ['cafe', 'restaurant'], from: 1930, to: 1960 },
  { label: 'craft beer', industries: ['bar', 'brewery'], from: 1990 },
  { label: 'cocktail lounges', industries: ['bar'], from: 2005 },
  { label: 'tiki bars', industries: ['bar'], from: 1940, to: 1965 },
  { label: 'athleisure', industries: ['fashion'], from: 2014 },
  { label: 'disco fashion', industries: ['fashion'], from: 1975, to: 1980 },
  { label: 'grunge style', industries: ['fashion'], from: 1991, to: 1996 },
  { label: 'natural skincare', industries: ['beauty', 'salon'], from: 2010 },
  { label: 'aerobics', industries: ['gym'], from: 1980, to: 1992 },
  { label: 'yoga', industries: ['gym', 'education'], from: 1990 },
  { label: 'high-intensity workouts', industries: ['gym'], from: 2010 },
  { label: 'bold hair colors', industries: ['salon'], from: 2010 },
  { label: 'the perm', industries: ['salon'], from: 1975, to: 1990 },
  { label: 'adventure holidays', industries: ['travel', 'hotel'], from: 1995 },
  { label: 'eco-friendly products', industries: ['grocery', 'fashion', 'beauty', 'homeCare', 'petCare', 'ecommerce'], from: 1990 },
  { label: 'pampered pets', industries: ['petCare'], from: 1995 },
]

/** The trends this company could ride this year. */
export function trendsFor(g: GameState, b: BizState): Trend[] {
  if (!consumer(b)) return []
  return TRENDS.filter((t) => t.industries.includes(b.industry) && g.year >= t.from && (t.to === undefined || g.year <= t.to))
}

/** Chance a trend lasts long enough to matter (nobody knows which ones will). */
export const TREND_LASTS = 0.55

function trendBranches(b: BizState, choice: string): Branch[] {
  if (choice === 'jump') return [{ p: 1, fx: { cash: -scaled(b, 10_000) } }, { p: TREND_LASTS, fx: { demandTo: 1.15, brand: 3 } }]
  if (choice === 'test') return [{ p: 1, fx: { cash: -scaled(b, 3_000) } }, { p: TREND_LASTS, fx: { demandTo: 1.06 } }]
  return [{ p: TREND_LASTS, fx: { demandTo: 0.96 } }]
}

const TREND = defineScript('business.ev.trend', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const label = str(x.d.trend, 'the new craze')
  const lasts = chance(g, TREND_LASTS)
  if (choice === 'jump' || choice === 'test') {
    const cost = pay(b, scaled(b, choice === 'jump' ? 10_000 : 3_000))
    if (lasts) {
      b.demandShock = Math.max(b.demandShock, choice === 'jump' ? 1.15 : 1.06)
      if (choice === 'jump') brandUp(b, 3)
      log(g, `${a.name} rode the ${label} wave.`, 'good')
      tell(g, 'Riding the Wave', `The craze for ${label} is still going strong, and ${a.name} ${choice === 'jump' ? 'is leading it' : 'caught a piece of it'} (${formatMoney(cost)} well spent).`, '\u{1F3C4}', 'good')
    } else tell(g, 'Fad Fizzled', `By the time ${a.name} was ready, everyone had moved on from ${label}. ${formatMoney(cost)} for a lesson in fads.`, '\u{1F4A8}', 'bad')
    return
  }
  if (lasts) {
    b.demandShock = Math.min(b.demandShock, 0.96)
    tell(g, 'Left Behind', `The craze for ${label} lasted, and some of your customers went where it was.`, '\u{1F62C}', 'bad')
  } else tell(g, 'Dodged a Fad', `The craze for ${label} came and went. ${a.name} never changed a thing and is glad of it.`, '\u{1F60C}', 'good')
})

function presentTrend(g: GameState, a: Asset, b: BizState): void {
  const list = trendsFor(g, b)
  if (!list.length) return
  const t = pick(g, list)
  const choices: ChoiceOption[] = [
    { id: 'jump', label: `Go all in (${money(scaled(b, 10_000))})`, emoji: '\u{1F3C4}' },
    { id: 'test', label: `Test a small range (${money(scaled(b, 3_000))})`, emoji: '\u{1F9EA}' },
    { id: 'ignore', label: 'Stick to what you do', emoji: '\u{1F9D8}' },
  ]
  markBest(g, choices, scorer(g, b, () => ({ jump: trendBranches(b, 'jump'), test: trendBranches(b, 'test'), ignore: trendBranches(b, 'ignore') })), () => `Best move by the numbers: about ${aPct(TREND_LASTS)} chance the craze lasts`)
  scriptChoice(g, TREND, 'Trend Wave', `A craze for ${t.label} is sweeping ${getCountry(b.countryId).name}, and customers keep asking ${a.name} about it. Nobody knows yet if it will last.`, choices, {
    emoji: '\u{1F30A}',
    data: { assetId: a.id, trend: t.label },
  })
}

// ---------------------------------------------------------------------------
// The list (weights 0 when the event can't happen to this company)

export const EXTRA_EVENTS: ExtraEvent[] = [
  {
    id: 'franchisePitch',
    weight: (g, b) => (isFranchiseIndustry(b.industry) && franchiseUnits(b) === 0 && !franchiseBlock(b) && maxSellable(g, b) >= 1 ? 0.5 : 0),
    present: presentFranchisePitch,
  },
  { id: 'critic', weight: (_g, b) => (classic(b) && industryDef(b.industry).food ? 0.45 : 0), present: presentCritic },
  { id: 'influencer', weight: (g, b) => (influencerOk(g, b) ? 0.45 : 0), present: presentInfluencer },
  { id: 'breach', weight: (g, b) => (BREACH_INDUSTRIES.has(b.industry) && !isFinanceFirm(b) && bizHas(g, b.countryId, 'internet') ? 0.35 : 0), present: presentBreach },
  { id: 'union', weight: (_g, b) => (!isFinanceFirm(b) && b.employees >= 15 && b.morale < 70 && unionStrength(b.countryId) > 0.1 ? 0.2 + unionStrength(b.countryId) * 0.3 : 0), present: presentUnion },
  { id: 'bid', weight: (_g, b) => (B2B.has(b.industry) && classic(b) && (b.last?.revenue ?? 0) > 0 ? 0.4 : 0), present: presentBid },
  { id: 'localCopycat', weight: (_g, b) => (consumer(b) && marketDef(b.industry).scope === 'national' && b.brand >= 35 && b.history.length >= 2 ? 0.35 : 0), present: presentCopycat },
  { id: 'employeeIdea', weight: (g, b) => (classic(b) && b.employees + b.staff.length >= 3 && productIdeas(g, b, 1).length > 0 ? 0.35 : 0), present: presentIdea },
  { id: 'rent', weight: (_g, b) => (isFinanceFirm(b) ? 0 : classic(b) ? 0.35 : 0.2), present: presentRent },
  {
    id: 'prime',
    weight: (g, b) => (consumer(b) && !hasBoard(g, b) && b.history.length >= 1 && b.cash >= startupCost(b.industry, b.countryId, b.city).capital * 1.3 ? 0.3 : 0),
    present: presentPrime,
  },
  {
    id: 'starInvestor',
    weight: (g, b) => (!isFinanceFirm(b) && !b.public && b.share >= 0.999 && !b.group && !inGroup(g, b) && !(b.familyShares?.length) && b.valuation > 0 && b.history.length >= 2 && (b.last?.net ?? 0) > 0 ? 0.25 : 0),
    present: presentStar,
  },
  { id: 'trend', weight: (g, b) => (trendsFor(g, b).length ? 0.35 : 0), present: presentTrend },
]

/** For tests: shared numbers the hints and resolvers use. */
export const extraEventInternals = { netFee, outletWorth, primePremium, ideaBudget, moveCost, perksCost, scaled }
