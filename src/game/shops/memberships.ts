// Memberships & subscriptions: gyms, spas, tennis and golf clubs, country / yacht / private
// members' clubs, coworking, streaming, music, games, meal kits, wine club, culture pass,
// warehouse club, a private jet card and dating-app premium. Each is an Asset of kind
// 'membership' (value 0, upkeep = the yearly fee): assets.ts yearlyAssets charges the fee as upkeep
// every year, and yearlyMemberships (which runs earlier in the year) lets a membership lapse when
// the player can't cover it, hands out small perks and the odd guilt trip. Event tickets live in
// memberships-tickets.ts and are re-exported from here.
import { addCondition } from '../activities/common'
import { findAsset, globalGoodsMult, goodsMult, localGoodsMult, nicePrice, salesTaxNote } from '../assets'
import {
  addHidden,
  addMoney,
  addRelationship,
  addStat,
  count,
  currentPartner,
  formatMoney,
  inPrison,
  log,
  netWorth,
  notice,
  remember,
  scriptChoice,
  shortMoney,
  spend,
  useYearAction,
} from '../core'
import { isIndustryLegal, localMarket } from '../data/markets'
import { incomeTax, livingCost, yearlyDebtPayments } from '../finance'
import { dateAgeRange, makeCandidate, startDating, type Candidate } from '../love'
import { createPerson, notePerson } from '../people'
import { chance, pick, randInt, uid } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import type { Asset, GameState, Json, MenuGroup, MenuNode, Person } from '../types'
import { getCountry } from '../world'
import { PLANS, SPA_STYLE, type FeeBasis, type PlanDef, type TierDef } from './memberships-data'
import { isRealBrandName, steadyBrand } from './everyday-brands'
import { hasTech } from '../history/timeline'

export { ticketsMenu } from './memberships-tickets'

// ---------------------------------------------------------------------------
// Helpers

function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function str(v: Json | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function safe(n: number, fallback = 1): number {
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h | 0)
}

function blockReason(g: GameState): string | null {
  if (!g.character.alive) return "You're dead. Even the gym stopped charging you."
  if (inPrison(g)) return "You can't do that from prison."
  return null
}

export function planById(id: string): PlanDef | undefined {
  return PLANS.find((p) => p.id === id)
}

function tierOf(plan: PlanDef, tierId: string): TierDef {
  return plan.tiers.find((t) => t.id === tierId) ?? plan.tiers[0]
}

/** The player's memberships. */
export function memberships(g: GameState): Asset[] {
  return g.assets.filter((a) => a.kind === 'membership')
}

function membershipFor(g: GameState, planId: string): Asset | undefined {
  return memberships(g).find((a) => str(a.details.planId) === planId)
}

function wealth(g: GameState): number {
  const w = getCountry(g.character.countryId).wealth
  return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 1
}

/** Local fee multiplier for a plan (gyms follow wages and rents, streaming has regional prices...). */
export function feeMult(g: GameState, basis: FeeBasis): number {
  const m = localMarket(g)
  const labor = 0.15 + 0.85 * safe(m.laborCost)
  const rent = clamp(safe(m.rentCost), 0.15, 3)
  switch (basis) {
    case 'service':
      return clamp(0.6 * labor + 0.4 * rent, 0.2, 2)
    case 'club':
      return clamp(0.5 * labor + 0.5 * rent, 0.35, 2.5)
    case 'digital':
      return clamp(0.2 + 0.8 * Math.min(1.2, wealth(g)), 0.25, 1.15)
    case 'food':
      return safe(localGoodsMult(g, 'food'))
    case 'alcohol':
      return safe(localGoodsMult(g, 'alcohol'))
    case 'goods':
      return safe(goodsMult(g))
    case 'global':
      return safe(globalGoodsMult(g))
  }
}

/** Yearly fee for a plan tier where the player lives (finite, > 0). */
export function planFee(g: GameState, plan: PlanDef, tier: TierDef): number {
  return Math.max(1, nicePrice(tier.fee * feeMult(g, plan.basis)))
}

export function initiationFee(g: GameState, plan: PlanDef): number {
  return plan.initiation ? nicePrice(planFee(g, plan, plan.tiers[0]) * plan.initiation) : 0
}

/** A local-sounding name for the plan, stable per country. */
export function planName(g: GameState, plan: PlanDef): string {
  const cid = g.character.countryId
  if (plan.id === 'spa' && SPA_STYLE[cid]) return SPA_STYLE[cid].name
  for (const c of plan.chains ?? []) {
    const real = steadyBrand(g, c.category, `plan:${plan.id}`, { ...(c.segment ? { segment: c.segment } : {}), ...(c.tiers ? { tiers: c.tiers } : {}) })
    if (real) return real.name
  }
  const words = localMarket(g).nameWords.filter((w) => typeof w === 'string' && w.trim() !== '')
  const usable = plan.names.filter((n) => !n.includes('{w}') || words.length > 0)
  if (usable.length === 0) return plan.fallback
  const h = hashString(`${cid}|plan|${plan.id}`)
  const pattern = usable[h % usable.length]
  const word = words.length ? words[(h >> 4) % words.length].trim() : ''
  return pattern.replace('{w}', word).replace('{city}', g.character.city || 'City')
}

function drinkingAge(g: GameState): number {
  return Math.max(18, getCountry(g.character.countryId).drinkingAge ?? 18)
}

function alcoholLegal(g: GameState): boolean {
  return isIndustryLegal(g.character.countryId, 'bar')
}

const NET_WORTH_FLOOR: Record<string, number> = { country: 8, golf: 4, yacht: 3, private: 4 }

/** True when this kind of plan exists where the player lives this year. */
export function planInEra(g: GameState, plan: PlanDef): boolean {
  const e = plan.era
  if (!e) return true
  if (e.from !== undefined && g.year < e.from) return false
  return !e.tech || hasTech(g, e.tech)
}

/** Is the plan offered to this player at all (hidden otherwise)? */
function planVisible(g: GameState, plan: PlanDef): boolean {
  const c = g.character
  if (c.age < plan.minAge - 3) return false
  // Plans of later eras (streaming, meal kits, coworking) appear when they exist; members keep theirs.
  if (!planInEra(g, plan) && !membershipFor(g, plan.id)) return false
  if (plan.id === 'wine' && !alcoholLegal(g)) return false
  if (plan.id === 'jet' && netWorth(g) < 1_000_000 && !membershipFor(g, 'jet')) return false
  if (plan.id === 'dating' && c.age < 18) return false
  return true
}

/** Why the player can't join this plan right now, or null. */
export function joinReason(g: GameState, plan: PlanDef): string | null {
  const b = blockReason(g)
  if (b) return b
  const c = g.character
  if (!planInEra(g, plan) && !membershipFor(g, plan.id)) return `Nothing like that exists in ${g.year}.`
  if (c.age < plan.minAge) return `You must be at least ${plan.minAge} to join.`
  if (plan.id === 'wine') {
    if (!alcoholLegal(g)) return `Alcohol is illegal in ${getCountry(c.countryId).name}.`
    if (c.age < drinkingAge(g)) return `You must be at least ${drinkingAge(g)} (the drinking age here) to join a wine club.`
  }
  if (plan.id === 'yacht' && !g.assets.some((a) => a.kind === 'boat')) return 'You need a boat to join a yacht club.'
  if (plan.id === 'jet' && netWorth(g) < 5_000_000) return `AeroCard only takes clients worth ${shortMoney(5_000_000)} or more.`
  if (plan.id === 'dating') {
    const p = currentPartner(g)
    if (p) return `You're in a relationship with ${p.firstName}.`
  }
  const floor = NET_WORTH_FLOOR[plan.id]
  if (floor) {
    const need = planFee(g, plan, plan.tiers[0]) * floor
    if (netWorth(g) < need) return `The membership committee wants members worth at least ${formatMoney(nicePrice(need))}.`
  }
  return null
}

// ---------------------------------------------------------------------------
// Joining, switching tiers, canceling

const REJECTIONS = [
  'The committee found your shoes "unacceptable."',
  'A board member thinks you "lack gravitas."',
  'The committee searched your name online. It did not go well.',
  'Your application was "lost." Twice.',
  "The chairman's spouse didn't like your laugh.",
]

/** A reason the committee gives; before the internet, it had to ask around instead. */
function rejection(g: GameState): string {
  const reason = pick(g, REJECTIONS)
  return reason.includes('online') && !hasTech(g, 'internet') ? 'The committee asked around about you. It did not go well.' : reason
}

/** Join a plan at a tier: pays the first year (plus any initiation fee). */
export function joinMembership(g: GameState, planId: string, tierId: string): Asset | null {
  const plan = planById(planId)
  if (!plan) return null
  const reason = joinReason(g, plan)
  if (reason) {
    notice(g, 'Memberships', reason, { emoji: plan.emoji })
    return null
  }
  if (membershipFor(g, planId)) {
    notice(g, 'Already a Member', `You're already a member of ${planName(g, plan)}. You can switch tiers from your membership.`, { emoji: plan.emoji })
    return null
  }
  const c = g.character
  const tier = tierOf(plan, tierId)
  const fee = planFee(g, plan, tier)
  const initiation = initiationFee(g, plan)
  const name = planName(g, plan)
  if (plan.vetted) {
    if (!useYearAction(g, `member.apply:${plan.id}`, 1)) {
      notice(g, 'Application Pending', `${name} only reviews one application from you a year. Try again next year.`, { emoji: plan.emoji })
      return null
    }
    const convicted = c.criminalRecord.some((r) => r.convicted)
    let p = 0.08
    if (convicted) p = 0.6
    else if (c.hidden.notoriety > 50) p = 0.5
    if (c.hidden.fame >= 70) p = Math.min(p, 0.03)
    if (chance(g, p)) {
      const why = convicted ? 'The committee found your criminal record during the background check.' : rejection(g)
      log(g, `My application to ${name} was rejected.`, 'bad')
      addStat(g, 'happiness', -randInt(g, 2, 5))
      notice(g, 'Application Rejected', `${name} turned down your application. ${why} You can apply again next year.`, { emoji: '📜', tone: 'bad' })
      return null
    }
  }
  const total = fee + initiation
  if (!spend(g, total, 'leisure')) {
    notice(g, 'Insufficient Funds', `Joining ${name} costs ${formatMoney(total)}${initiation ? ` (${formatMoney(initiation)} initiation fee + ${formatMoney(fee)} for the first year)` : ' for the first year'}. You have ${formatMoney(Math.max(0, c.money))}.`, { emoji: '💸', tone: 'bad' })
    return null
  }
  const asset: Asset = {
    id: uid(g, 'a'),
    kind: 'membership',
    name,
    emoji: plan.emoji,
    purchasePrice: total,
    value: 0,
    condition: 100,
    purchasedAge: c.age,
    upkeep: fee,
    details: {
      category: plan.category,
      planId: plan.id,
      tier: tier.id,
      perks: tier.perks,
      joinedAge: c.age,
      joinedYear: g.year,
      usesYear: g.year,
      uses: 0,
      unusedYears: 0,
    },
  }
  g.assets.push(asset)
  count(g, 'memberships')
  addStat(g, 'happiness', randInt(g, 1, 3))
  log(g, `I joined ${name} (${tier.label}).`, 'good')
  const tax = salesTaxNote(g, fee)
  const welcome = plan.vetted ? `The committee approved your application. Welcome to ${name}!` : `Welcome to ${name}!`
  const init = initiation ? ` You paid a ${formatMoney(initiation)} initiation fee plus ${formatMoney(fee)} for the first year.` : ` You paid ${formatMoney(fee)} for the first year.`
  notice(g, 'Membership', `${welcome}${init} It renews automatically every year at ${formatMoney(fee)} until you cancel.${tax ? ` ${tax}` : ''}`, { emoji: plan.emoji, tone: 'good' })
  return asset
}

/** Move to another tier: upgrades pay the difference now, downgrades take effect at renewal. */
export function changeTier(g: GameState, assetId: string, tierId: string): boolean {
  const a = findAsset(g, assetId)
  const plan = a ? planById(str(a.details.planId)) : undefined
  if (!a || !plan) return false
  const from = tierOf(plan, str(a.details.tier))
  const to = tierOf(plan, tierId)
  if (from.id === to.id) return false
  const oldFee = a.upkeep
  const newFee = planFee(g, plan, to)
  if (newFee > oldFee) {
    const diff = newFee - oldFee
    if (!spend(g, diff, 'leisure')) {
      notice(g, 'Insufficient Funds', `Upgrading to ${to.label} costs ${formatMoney(diff)} now. You have ${formatMoney(Math.max(0, g.character.money))}.`, { emoji: '💸', tone: 'bad' })
      return false
    }
    notice(g, 'Upgraded', `You upgraded to ${a.name} ${to.label} for ${formatMoney(diff)}. New perks: ${to.perks.join(', ')}. It renews at ${formatMoney(newFee)} a year.`, { emoji: a.emoji, tone: 'good' })
    log(g, `I upgraded my ${a.name} membership to ${to.label}.`)
  } else {
    notice(g, 'Downgraded', `You switched to ${a.name} ${to.label}. It renews at ${formatMoney(newFee)} a year. No refunds for this year: the fine print was very clear about that.`, { emoji: a.emoji })
    log(g, `I downgraded my ${a.name} membership to ${to.label}.`)
  }
  a.upkeep = newFee
  a.details.tier = to.id
  a.details.perks = to.perks
  return true
}

const CANCEL_LINES: Record<string, string[]> = {
  fitness: ['It took a certified letter, two phone calls and a notarized form, but you are free.', 'The front desk tried three retention offers. You stayed strong.'],
  club: ['The secretary sighed, crossed your name out of the ledger and asked for your tie back.', 'Your locker has been reassigned to someone named Chip.'],
  subscription: ['They sent four emails begging you to come back. One had a crying emoji.', 'You canceled in one click. Just kidding: it took eleven.'],
  box: ['The last box arrived the day after you canceled. Of course it did.', 'Customer service asked you to rate your experience from 1 to 10 eleven times.'],
  work: ['You took your mug and your plant. The kombucha tap will miss you.'],
  culture: ['The museum gift shop will miss you most of all.'],
  travel: ['You will fly commercial again, like some kind of animal.'],
  dating: ['Your premium badge faded. The algorithm will now show you exclusively people named Steve.'],
}

/** Cancellation lines that make no claim about how a real company treats its customers. */
const NEUTRAL_CANCEL_LINES: Record<string, string[]> = {
  fitness: ['You handed in your key tag and swore you would exercise at home. You will not.', 'Your gym bag spent the next week by the door, looking disappointed.'],
  subscription: ['Your watchlist stayed behind, still full of things you will never watch.', 'Your evenings are suddenly free. You are not sure what to do with them.'],
  box: ['The last box was already on its way, so you got a farewell dinner out of it.', 'The fridge magnets stayed. You kept the knife.'],
  work: ['You took your mug and your plant. The coffee machine will miss you.'],
  dating: ['Your premium badge faded. Your matches were not informed.'],
}

export function cancelMembership(g: GameState, assetId: string): boolean {
  const a = findAsset(g, assetId)
  if (!a || a.kind !== 'membership') return false
  g.assets = g.assets.filter((x) => x.id !== a.id)
  const cat = str(a.details.category)
  const lines = cat === 'subscription' && (g.year < 2010 || !hasTech(g, 'internet'))
    ? ['You filled out the cancellation form. The paperwork seemed longer than the original application.', 'You declined the renewal offer and kept the receipt.']
    : (isRealBrandName(a.name) ? NEUTRAL_CANCEL_LINES[cat] : undefined) ?? CANCEL_LINES[cat] ?? CANCEL_LINES.subscription
  log(g, `I canceled my ${a.name} membership.`)
  notice(g, 'Canceled', `You canceled your ${a.name} membership. ${pick(g, lines)}`, { emoji: a.emoji })
  return true
}

// ---------------------------------------------------------------------------
// Using a membership

const RICH_OCCUPATIONS = ['Surgeon', 'Investment Banker', 'Corporate Lawyer', 'Tech Founder', 'Real Estate Developer', 'Hedge Fund Manager', 'Shipping Heir', 'Orthodontist']
const CREATIVE_OCCUPATIONS = ['Film Producer', 'Art Director', 'Novelist', 'Architect', 'Startup Founder', 'Fashion Designer', 'Music Producer', 'Gallery Owner']
const COWORK_OCCUPATIONS = ['Startup Founder', 'Freelance Designer', 'App Developer', 'Copywriter', 'Podcaster', 'UX Researcher']
const SHOWS = ['a Scandinavian crime drama', 'a baking competition', 'a true-crime docuseries', 'a medieval fantasy epic', 'a reality show about rich people\'s dogs', 'a Korean thriller', 'a sitcom you\'ve already seen six times', 'a nature documentary narrated by a very calm man']
const JET_TRIPS = ['to the Maldives for a long weekend', 'to Paris for lunch', 'to the Alps for one ski run', 'to Ibiza and back before dinner', 'to a private island you heard about at a party', 'to Tokyo for sushi', 'to New York for a single meeting', 'to the Amalfi Coast "for the light"']

interface UseOutcome {
  title: string
  text: string
  log: string
}

function meetSomeone(g: GameState, where: string, opts: { occupations?: string[]; rich?: boolean } = {}): Person {
  const c = g.character
  const age = clamp(c.age + randInt(g, -8, 10), Math.min(c.age, 18), 90)
  const occupation = opts.occupations ? pick(g, opts.occupations) : undefined
  const money = opts.rich ? randInt(g, 1_000_000, 40_000_000) : undefined
  const p = createPerson(g, { relation: 'friend', age, occupation, money, relationship: randInt(g, 45, 70) })
  p.data.metAt = where
  notePerson(p, `Met the player at ${where} at age ${c.age}.`)
  log(g, `I met ${p.firstName} ${p.lastName} at ${where}.`, 'good')
  return p
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function boostJob(g: GameState, lo: number, hi: number): boolean {
  const c = g.character
  const job = c.job ?? c.partTimeJob
  if (!job) return false
  job.performance = Math.round(clamp(job.performance + randInt(g, lo, hi), 0, 100))
  return true
}

function useOutcome(g: GameState, a: Asset, plan: PlanDef, tier: TierDef, usedBefore: number): UseOutcome | null {
  const c = g.character
  const name = a.name
  const diminish = [1, 0.8, 0.6, 0.4, 0.4, 0.3][usedBefore] ?? 0.3
  const r = (lo: number, hi: number) => Math.round(randInt(g, lo, hi) * diminish)
  switch (plan.id) {
    case 'gym': {
      const boost = tier.id === 'boutique' ? 1.25 : tier.id === 'premium' ? 1.1 : 1
      addStat(g, 'health', Math.round(r(2, 4) * boost * (c.age >= 65 ? 0.6 : 1)))
      addStat(g, 'looks', r(1, 2))
      addHidden(g, 'athleticism', randInt(g, 1, 3))
      if (tier.id !== 'budget') addStat(g, 'happiness', r(1, 3))
      count(g, 'gym')
      if (chance(g, 0.03)) {
        const injury = pick(g, ['Pulled Muscle', 'Strained Back', 'Sprained Ankle'])
        addCondition(g, injury, 'injury', randInt(g, 8, 16))
        addStat(g, 'health', -randInt(g, 3, 6))
        return { title: 'Ouch!', text: `You tried to lift what the guy next to you was lifting and got a ${injury.toLowerCase()}.`, log: `I got a ${injury.toLowerCase()} at the gym.` }
      }
      let text = pick(g, [
        tier.id === 'boutique' ? 'Your trainer yelled encouraging things over thumping music. You have never sweated this much in a room this pretty.' : hasTech(g, 'smartphone') ? 'You lifted, you ran, you took a mirror selfie. A productive session.' : 'You lifted, you ran, you flexed in the mirror. A productive session.',
        'You did a spin class and briefly saw your ancestors.',
        'You finally used the gym membership you\'re paying for. Your bank account sighed with relief.',
        'Someone was hogging the squat rack, so you did 40 minutes of "core." You lay on a mat.',
      ])
      if (chance(g, 0.05) && c.age >= 14) text += ` You got talking with ${meetSomeone(g, name).firstName} between sets. New gym buddy!`
      return { title: 'Gym', text, log: `I worked out at ${name}.` }
    }
    case 'spa': {
      addStat(g, 'health', r(1, 3))
      addStat(g, 'happiness', r(3, 6))
      if (chance(g, 0.4)) addStat(g, 'looks', 1)
      const style = SPA_STYLE[c.countryId]
      const text = style ? style.line : pickLine(g, ['A hot-stone massage, a eucalyptus steam and a nap in a robe. You are a new person.', 'Someone put cucumbers on your eyes and you fell asleep for an hour.', 'The masseuse found knots you didn\'t know you had and destroyed them.'])
      return { title: 'Spa Day', text, log: style ? `I spent the day at ${style.place}.` : `I had a spa day at ${name}.` }
    }
    case 'tennis': {
      addStat(g, 'health', r(2, 3))
      addStat(g, 'happiness', r(1, 3))
      addHidden(g, 'athleticism', randInt(g, 1, 2))
      let text = pickLine(g, ['You won a tight three-setter and shook hands like a gracious winner. Then you gloated in the car.', 'You lost 6-0, 6-0 to a 70-year-old with a wicked slice.', 'You played doubles and only hit your partner once.'])
      if (chance(g, 0.2)) text += ` Your doubles partner, ${meetSomeone(g, name).firstName}, invited you to play again next week.`
      return { title: 'Tennis', text, log: `I played tennis at ${name}.` }
    }
    case 'golf': {
      addStat(g, 'happiness', r(2, 5))
      addStat(g, 'health', r(1, 2))
      if (chance(g, 0.015)) {
        addStat(g, 'happiness', 10)
        count(g, 'holeInOne')
        remember(g, `Hit a hole-in-one at ${name}.`)
        return { title: 'Hole in One!', text: 'HOLE IN ONE! The ball rolled in like it had somewhere to be. Your name is going on the clubhouse wall, and tradition says you buy the bar a round.', log: `I hit a hole-in-one at ${name}!` }
      }
      let text = pickLine(g, ['You shot 18 over par and blamed the new clubs.', 'You hit a perfect drive on the 7th and talked about nothing else at the bar.', 'You spent more time in the sand traps than a beach volleyball team.'])
      if (chance(g, 0.25)) text += ` You played a round with ${meetSomeone(g, name, { rich: chance(g, 0.5) }).firstName} and hit it off.`
      return { title: 'Golf', text, log: `I played 18 holes at ${name}.` }
    }
    case 'country': {
      addStat(g, 'happiness', r(3, 6))
      let text = pickLine(g, ['You lounged by the pool, ordered things with "truffle" in the name and charged it all to your member number.', 'You attended a charity gala in the ballroom. You understood about half the jokes.', 'You played tennis, then golf, then napped in the lounge. A perfect club day.'])
      if (chance(g, 0.35)) {
        const p = meetSomeone(g, name, { occupations: RICH_OCCUPATIONS, rich: true })
        text += ` You were introduced to ${p.firstName} ${p.lastName}, ${article(p.occupation)} ${p.occupation.toLowerCase()} with a very firm handshake.`
      }
      return { title: 'At the Club', text, log: `I spent the day at ${name}.` }
    }
    case 'yacht': {
      const boat = g.assets.find((x) => x.kind === 'boat')
      if (!boat) {
        addStat(g, 'happiness', r(2, 4))
        return { title: 'Yacht Club', text: "You don't have a boat anymore, so you watched the regatta from the clubhouse bar in a blazer. Nobody asked.", log: `I watched the regatta at ${name}.` }
      }
      addStat(g, 'happiness', r(4, 7))
      let text = pickSite(g, [`You raced your ${boat.name.toLowerCase()} in the club regatta and finished a respectable fourth.`, `You took your ${boat.name.toLowerCase()} out with the club fleet and nobody crashed into anybody. A great day.`], 0xf1598295)
      if (chance(g, 0.12)) {
        count(g, 'regattasWon')
        addStat(g, 'happiness', 5)
        text = `You won the club regatta in your ${boat.name.toLowerCase()}! The commodore handed you a silver cup roughly the size of a bucket.`
      }
      if (chance(g, 0.3)) text += ` Afterwards you had drinks with ${meetSomeone(g, name, { rich: true }).firstName}, who owns a much bigger boat.`
      return { title: 'Regatta Day', text, log: `I sailed in a regatta at ${name}.` }
    }
    case 'private': {
      addStat(g, 'happiness', r(2, 5))
      let text = pickLine(g, ['You took meetings on the rooftop terrace and felt extremely important.', 'You watched a film in the private screening room and had opinions about it afterwards.', 'You saw a famous actor in the corner and played it very cool. You did not play it cool.'])
      if (chance(g, 0.4)) {
        const p = meetSomeone(g, name, { occupations: CREATIVE_OCCUPATIONS })
        text += ` You swapped numbers with ${p.firstName}, ${article(p.occupation)} ${p.occupation.toLowerCase()}.`
      }
      if (boostJob(g, 2, 4)) text += ' The networking should help at work, too.'
      return { title: 'Members Only', text, log: `I spent the evening at ${name}.` }
    }
    case 'cowork': {
      addStat(g, 'happiness', r(1, 3))
      if (chance(g, 0.3)) addStat(g, 'smarts', 1)
      let text = pickLine(g, ['You got more done in a day than in a week at home. The free coffee helped.', 'You spent the morning working and the afternoon listening to someone pitch an app for dogs.', 'You booked a phone booth and took an important call. You felt very official.'])
      if (boostJob(g, 3, 6)) text += ' Your work has never looked better.'
      if (chance(g, 0.2)) {
        const p = meetSomeone(g, name, { occupations: COWORK_OCCUPATIONS })
        text += ` You made friends with ${p.firstName}, ${article(p.occupation)} ${p.occupation.toLowerCase()} at the next desk.`
      }
      return { title: 'Coworking', text, log: `I worked from ${name}.` }
    }
    case 'streaming': {
      addStat(g, 'happiness', r(2, 4))
      if (chance(g, 0.25)) addStat(g, 'health', -1)
      const show = pickLine(g, SHOWS)
      return { title: 'Binge-Watching', text: pickSite(g, [`You watched an entire season of ${show} in one sitting. The app asked if you were still watching. Rude.`, `You finished ${show} at 4 a.m. and immediately started it again.`, `You spent 40 minutes choosing something to watch, then rewatched ${show}.`], 0xe8d3e706), log: `I binge-watched ${show}.` }
    }
    case 'music': {
      addStat(g, 'happiness', r(1, 3))
      return { title: 'Music', text: pickLine(g, ['You discovered a band nobody has heard of and will now be insufferable about it.', 'You made a playlist for every mood. There are 46 playlists.', 'You listened to one song on repeat 112 times. The app is concerned.']), log: 'I spent the day listening to music.' }
    }
    case 'games': {
      addStat(g, 'happiness', r(2, 4))
      if (chance(g, 0.25)) addStat(g, 'smarts', 1)
      return { title: 'Gaming Marathon', text: pickLine(g, ['You tried six new games and finished none of them. A perfect night.', 'You played online until 3 a.m. and got called a very creative name by a 12-year-old.', 'You beat a boss on your 47th attempt and screamed so loud the neighbors checked on you.']), log: 'I had a gaming marathon.' }
    }
    case 'mealkit': {
      addStat(g, 'health', r(1, 2))
      addStat(g, 'happiness', r(1, 3))
      const partner = currentPartner(g)
      let text = pickLine(g, ['The recipe said 30 minutes. It took 90. It was delicious.', 'You burned the garlic, salvaged the sauce and plated it like a TV chef.', 'You learned what "julienne" means. Your fingers survived.'])
      if (partner && chance(g, 0.6)) {
        addRelationship(g, partner, randInt(g, 2, 5))
        text += ` You cooked it with ${partner.firstName}, who only criticized your knife skills twice.`
      }
      return { title: 'Dinner Is Served', text, log: 'I cooked a meal kit dinner.' }
    }
    case 'wine': {
      addStat(g, 'happiness', r(2, 4))
      if (chance(g, 0.3)) addStat(g, 'health', -1)
      return { title: 'Wine Night', text: pickLine(g, ['You swirled, sniffed and declared it "oaky." You have no idea what that means.', 'You opened a bottle with friends and had very strong opinions about cheese.', 'You read the tasting notes out loud in a fancy accent. Everyone left early.']), log: 'I opened a bottle from my wine club.' }
    }
    case 'culture': {
      const zoo = chance(g, 0.4)
      if (zoo) addStat(g, 'happiness', r(2, 4))
      else {
        addStat(g, 'smarts', r(1, 3))
        addStat(g, 'happiness', r(1, 2))
      }
      if (tier.id === 'family') {
        for (const p of g.people.filter((x) => x.alive && (x.relation === 'child' || x.relation === 'spouse' || x.relation === 'partner')).slice(0, 4)) addRelationship(g, p, randInt(g, 2, 4))
      }
      count(g, zoo ? 'zooVisits' : 'museumVisits')
      return zoo
        ? { title: 'Zoo Day', text: pickLine(g, ['A penguin waddled right up to the glass and judged you.', 'You watched the lions nap for an hour. Relatable.', 'A monkey threw something at the crowd. You were the crowd.']), log: 'I spent the day at the zoo.' }
        : { title: 'Museum Day', text: pickLine(g, ['You stared at a painting for ten minutes and felt something. Possibly hunger.', 'You learned an alarming amount about medieval plumbing.', 'You read every single placard. A guard asked if you were okay.']), log: 'I spent the day at a museum.' }
    }
    case 'warehouse': {
      addStat(g, 'happiness', r(1, 2))
      return { title: 'Bulk Shopping', text: pickLine(g, ['You went in for milk and came out with 48 rolls of toilet paper, a kayak and a rotisserie chicken.', 'You ate lunch entirely from free samples. A personal best.', 'You bought a jar of mayonnaise the size of a toddler.']), log: `I went on a bulk shopping run at ${name}.` }
    }
    case 'jet': {
      addStat(g, 'happiness', r(5, 9))
      if (c.hidden.fame >= 20) addHidden(g, 'fame', 1)
      count(g, 'privateFlights')
      const trip = pickLine(g, JET_TRIPS)
      return { title: 'Wheels Up', text: `You flew private ${trip}. No lines, no shoes off, a warm cookie on takeoff.`, log: `I flew private ${trip}.` }
    }
    default:
      return null
  }
}

// --- Dating app premium: a premium match you can ask out.

/** The dating app's name with its paid tier ('Tinder Premium'). */
function premiumName(g: GameState): string {
  const plan = planById('dating')
  return `${plan ? planName(g, plan) : 'Dating app'} Premium`
}

const DATING = defineScript('member.dating', (g, choice, data) => {
  if (choice !== 'date') return
  const k = data as unknown as Candidate | undefined
  if (!k || typeof k.firstName !== 'string') return
  const p = currentPartner(g)
  if (p) {
    notice(g, premiumName(g), `You're already with ${p.firstName}.`, { emoji: '🔥' })
    return
  }
  const c = g.character
  const accept = clamp(0.5 + (c.stats.looks - k.looks) / 200 + (c.stats.happiness - 50) / 400, 0.15, 0.9)
  if (chance(g, accept)) {
    const partner = startDating(g, k, premiumName(g))
    addStat(g, 'happiness', randInt(g, 4, 8))
    notice(g, "It's a Date!", `${partner.firstName} said yes! Your first date went so well that you're officially seeing each other.`, { emoji: '💘', tone: 'good' })
  } else {
    addStat(g, 'happiness', -randInt(g, 1, 3))
    notice(g, 'Unmatched', pickSite(g, [`${k.firstName} unmatched you. Premium didn't cover that.`, `${k.firstName} replied "lol no" and blocked you.`, `${k.firstName} never replied. The read receipt haunts you.`], 0xac4c06c8), { emoji: '💔', tone: 'bad' })
  }
})

function datingMatch(g: GameState, tier: TierDef): void {
  const [lo, hi] = dateAgeRange(g.character.age)
  const k = makeCandidate(g, { minAge: lo, maxAge: hi, quality: tier.id === 'platinum' ? 'elite' : 'premium' })
  scriptChoice(
    g,
    DATING,
    premiumName(g),
    `Premium match: ${k.firstName} ${k.lastName}, ${k.age}\n${k.occupation} · Looks ${k.looks}% · Smarts ${k.smarts}%\nPersonality: ${k.traits.join(', ')}`,
    [
      { id: 'date', label: 'Ask them out', emoji: '💘' },
      { id: 'pass', label: 'Swipe left', emoji: '👈' },
    ],
    { emoji: '🔥', data: k as unknown as Json },
  )
}

function usesThisYear(g: GameState, a: Asset): number {
  return num(a.details.usesYear) === g.year ? num(a.details.uses) : 0
}

/** Why a membership can't be used right now, or null. */
export function useReasonFor(g: GameState, a: Asset): string | null {
  const b = blockReason(g)
  if (b) return b
  const plan = planById(str(a.details.planId))
  if (!plan) return 'This membership no longer exists.'
  const tier = tierOf(plan, str(a.details.tier))
  if (usesThisYear(g, a) >= tier.uses) return `You've used it ${tier.uses} times this year. Come back next year.`
  if (plan.id === 'gym' && g.character.stats.health < 10) return "You're too weak to work out."
  if (plan.id === 'dating') {
    const p = currentPartner(g)
    if (p) return `You're in a relationship with ${p.firstName}.`
  }
  if (plan.id === 'wine' && (!alcoholLegal(g) || g.character.age < drinkingAge(g))) return "You can't drink legally here."
  return null
}

export function useMembership(g: GameState, assetId: string): void {
  const a = findAsset(g, assetId)
  const plan = a ? planById(str(a.details.planId)) : undefined
  if (!a || !plan) return
  const reason = useReasonFor(g, a)
  if (reason) {
    notice(g, plan.useLabel, reason, { emoji: plan.emoji })
    return
  }
  const tier = tierOf(plan, str(a.details.tier))
  const before = usesThisYear(g, a)
  a.details.usesYear = g.year
  a.details.uses = before + 1
  a.details.unusedYears = 0
  if (plan.id === 'dating') {
    datingMatch(g, tier)
    return
  }
  const out = useOutcome(g, a, plan, tier, before)
  if (!out) return
  log(g, out.log, 'good')
  notice(g, out.title, out.text, { emoji: plan.useEmoji, tone: out.title === 'Ouch!' ? 'bad' : 'good' })
}

// ---------------------------------------------------------------------------
// Owned-membership screen

export function membershipAssetSubtitle(g: GameState, a: Asset): string {
  const plan = planById(str(a.details.planId))
  const tier = plan ? tierOf(plan, str(a.details.tier)) : null
  const bits = [tier?.label ?? 'Member', `${formatMoney(a.upkeep)}/yr`]
  if (plan && usesThisYear(g, a) === 0 && num(a.details.joinedYear, g.year) < g.year) bits.push('unused this year')
  return bits.join(' · ')
}

/** Owned-asset screen for a kind 'membership' asset (registered in menus.ts). */
export function membershipAssetView(g: GameState, a: Asset): MenuNode[] {
  const plan = planById(str(a.details.planId))
  if (!plan) return [{ type: 'info', id: `mem-gone-${a.id}`, text: 'This membership is no longer offered.' }]
  const tier = tierOf(plan, str(a.details.tier))
  const perks = Array.isArray(a.details.perks) ? a.details.perks.filter((x): x is string => typeof x === 'string') : tier.perks
  const used = usesThisYear(g, a)
  const rows: string[] = [
    `${plan.emoji} ${plan.blurb}`,
    `🎫 ${tier.label} · ${formatMoney(a.upkeep)} a year, renews automatically`,
    `✨ ${perks.join(' · ')}`,
    `📅 Member since age ${num(a.details.joinedAge, a.purchasedAge)}`,
    `📊 Used ${used} of ${tier.uses} times this year`,
  ]
  if (num(a.details.unusedYears) >= 1) rows.push(`😬 You didn't use it at all last year.`)
  const nodes: MenuNode[] = rows.map((text, i) => ({ type: 'info', id: `mem-${a.id}-${i}`, text }))
  nodes.push({ type: 'heading', id: `mem-act-${a.id}`, label: 'Actions' })
  nodes.push({
    type: 'action',
    id: `mem-use-${a.id}`,
    label: plan.useLabel,
    emoji: plan.useEmoji,
    subtitle: (gg) => {
      const cur = findAsset(gg, a.id)
      const left = cur ? Math.max(0, tier.uses - usesThisYear(gg, cur)) : 0
      return `${left} use${left === 1 ? '' : 's'} left this year`
    },
    disabledReason: (gg) => {
      const cur = findAsset(gg, a.id)
      return cur ? useReasonFor(gg, cur) : 'You are no longer a member.'
    },
    run: (gg) => useMembership(gg, a.id),
  })
  for (const t of plan.tiers) {
    if (t.id === tier.id) continue
    const fee = planFee(g, plan, t)
    const up = fee > a.upkeep
    nodes.push({
      type: 'action',
      id: `mem-tier-${a.id}-${t.id}`,
      label: `${up ? 'Upgrade' : 'Downgrade'} to ${t.label}`,
      emoji: up ? '⬆️' : '⬇️',
      subtitle: `${formatMoney(fee)}/yr · ${t.perks.slice(0, 2).join(', ')}`,
      disabledReason: blockReason,
      confirm: () => (up ? `Upgrade to ${t.label}? You pay the ${formatMoney(fee - a.upkeep)} difference now.` : `Downgrade to ${t.label}? No refund for this year.`),
      run: (gg) => {
        changeTier(gg, a.id, t.id)
      },
    })
  }
  nodes.push({
    type: 'action',
    id: `mem-cancel-${a.id}`,
    label: 'Cancel Membership',
    emoji: '✂️',
    subtitle: 'No refunds for the rest of this year',
    disabledReason: (gg) => (gg.character.alive ? null : "You're dead."),
    confirm: () => `Cancel your ${a.name} membership?`,
    run: (gg) => {
      cancelMembership(gg, a.id)
    },
  })
  return nodes
}

// ---------------------------------------------------------------------------
// The Memberships menu

function planMenu(plan: PlanDef): MenuGroup {
  return {
    type: 'menu',
    id: `plan-${plan.id}`,
    label: plan.id === 'spa' ? 'Spa Membership' : plan.fallback,
    emoji: plan.emoji,
    subtitle: (g) => {
      const owned = membershipFor(g, plan.id)
      const name = planName(g, plan)
      if (owned) return `${name} · Member (${tierOf(plan, str(owned.details.tier)).label})`
      const fees = plan.tiers.map((t) => planFee(g, plan, t))
      const init = initiationFee(g, plan)
      return `${name} · ${formatMoney(Math.min(...fees))}-${formatMoney(Math.max(...fees))}/yr${init ? ` + ${formatMoney(init)} to join` : ''}`
    },
    visible: (g) => planVisible(g, plan),
    disabledReason: (g) => (membershipFor(g, plan.id) ? blockReason(g) : joinReason(g, plan)),
    header: (g) => `${planName(g, plan)}: ${plan.blurb}. You have ${formatMoney(g.character.money)}.`,
    children: (g) => {
      const owned = membershipFor(g, plan.id)
      if (owned) return membershipAssetView(g, owned)
      const init = initiationFee(g, plan)
      const nodes: MenuNode[] = []
      if (init) nodes.push({ type: 'info', id: `plan-init-${plan.id}`, text: `One-time initiation fee: ${formatMoney(init)}. ${plan.vetted ? 'The membership committee reviews every application.' : ''}`.trim(), emoji: '📜' })
      for (const t of plan.tiers) {
        const fee = planFee(g, plan, t)
        nodes.push({
          type: 'action',
          id: `plan-join-${plan.id}-${t.id}`,
          label: `Join: ${t.label}`,
          emoji: plan.emoji,
          subtitle: `${formatMoney(fee)}/yr · ${t.perks.join(', ')}`,
          disabledReason: (gg) => joinReason(gg, plan),
          confirm: (gg) => `Join ${planName(gg, plan)} (${t.label}) for ${formatMoney(fee + init)}${init ? ' including the initiation fee' : ''}? It renews at ${formatMoney(fee)} a year.`,
          run: (gg) => {
            joinMembership(gg, plan.id, t.id)
          },
        })
      }
      return nodes
    },
  }
}

const SECTIONS: [string, string[]][] = [
  ['Fitness & Wellness', ['gym', 'spa', 'tennis']],
  ['Clubs', ['golf', 'country', 'yacht', 'private']],
  ['Subscriptions', ['streaming', 'music', 'games', 'mealkit', 'wine', 'warehouse', 'culture', 'dating']],
  ['Work & Travel', ['cowork', 'jet']],
]

export const membershipsMenu: MenuGroup = {
  type: 'menu',
  id: 'memberships',
  label: 'Memberships',
  emoji: '\u{1F4B3}',
  subtitle: 'Gyms, clubs and subscriptions',
  visible: (g) => g.character.age >= 10,
  disabledReason: (g) => blockReason(g),
  header: (g) => {
    const total = memberships(g).reduce((s, a) => s + a.upkeep, 0)
    const yours = total > 0 ? `Your memberships cost ${formatMoney(total)} a year.` : 'Fees renew automatically every year until you cancel.'
    return `${yours} You have ${formatMoney(g.character.money)}.`
  },
  children: (g): MenuNode[] => {
    const nodes: MenuNode[] = []
    for (const [title, ids] of SECTIONS) {
      const plans = ids.map((id) => planById(id)).filter((p): p is PlanDef => !!p && planVisible(g, p))
      if (plans.length === 0) continue
      nodes.push({ type: 'heading', id: `mem-sec-${title}`, label: title })
      nodes.push(...plans.map(planMenu))
    }
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Yearly hook

/** Cash left this year after taxes, rent, living costs, debt and other upkeep (rough). */
function projectedCash(g: GameState): number {
  const c = g.character
  let cash = c.money
  cash -= incomeTax(c.countryId, num(g.flags.taxableIncome))
  if (c.residence.status === 'renting' && !c.prison) cash -= Math.max(0, c.residence.rent ?? 0)
  cash -= livingCost(g)
  cash -= yearlyDebtPayments(g)
  cash -= g.assets.filter((a) => a.kind !== 'membership').reduce((s, a) => s + Math.max(0, a.upkeep), 0)
  return cash
}

const GUILT = [
  (n: string, fee: string) => `I paid ${fee} for ${n} and never used it once.`,
  (n: string, fee: string) => `My ${n} membership cost me ${fee} this year. I went zero times.`,
  (n: string, fee: string) => `I keep paying ${fee} a year for ${n}. I keep not going.`,
]

/** Yearly hook: renewals (fees are charged as asset upkeep by assets.ts), perks, lapses. */
export function yearlyMemberships(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const ms = memberships(g)
  if (ms.length === 0) return

  // Prison ends every membership (the gym in there is free anyway).
  if (inPrison(g)) {
    g.assets = g.assets.filter((a) => a.kind !== 'membership')
    log(g, 'My memberships were canceled while I was locked up.')
    notice(g, 'Memberships Canceled', `Your ${ms.length === 1 ? `${ms[0].name} membership was` : `${ms.length} memberships were`} canceled while you were behind bars. The prison gym is free, at least.`, { emoji: '✂️' })
    return
  }

  // Last year: perks for the regulars, guilt for the no-shows.
  for (const a of ms) {
    const plan = planById(str(a.details.planId))
    if (!plan) continue
    if (num(a.details.joinedYear, g.year) >= g.year) continue
    const used = num(a.details.usesYear) === g.year - 1 ? num(a.details.uses) : 0
    if (used === 0) {
      a.details.unusedYears = num(a.details.unusedYears) + 1
      if (a.upkeep >= 50 && plan.id !== 'warehouse') {
        log(g, pick(g, GUILT)(a.name, formatMoney(a.upkeep)), 'bad')
        if (plan.category === 'fitness' || plan.category === 'club') addStat(g, 'happiness', -1)
      }
    } else {
      a.details.unusedYears = 0
      if (plan.id === 'gym' && used >= 2) addStat(g, 'health', 1)
      if (plan.id === 'spa' && used >= 2) addStat(g, 'happiness', 1)
    }
    // The warehouse club pays for itself if you live on your own (and you do your shopping there).
    if (plan.id === 'warehouse') {
      const living = livingCost(g)
      if (living > 0) {
        const saved = Math.round(living * (str(a.details.tier) === 'executive' ? 0.05 : 0.035))
        if (saved > 0) {
          addMoney(g, saved, 'living')
          if (chance(g, 0.4)) log(g, `Buying in bulk at ${a.name} saved me about ${formatMoney(saved)} on groceries this year.`, 'good')
        }
      }
    }
    // Fees follow the local market if you moved.
    const fee = planFee(g, plan, tierOf(plan, str(a.details.tier)))
    if (Number.isFinite(fee) && fee > 0) a.upkeep = fee
  }

  // Renewals: keep what you can pay for, cheapest first; the rest lapse before the bill arrives.
  let budget = projectedCash(g)
  const lapsed: Asset[] = []
  for (const a of [...ms].sort((x, y) => x.upkeep - y.upkeep)) {
    if (budget >= a.upkeep) budget -= a.upkeep
    else lapsed.push(a)
  }
  if (lapsed.length) {
    const ids = new Set(lapsed.map((a) => a.id))
    g.assets = g.assets.filter((a) => !ids.has(a.id))
    const names = lapsed.map((a) => a.name)
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    for (const a of lapsed) log(g, `My ${a.name} membership lapsed because I couldn't pay.`, 'bad')
    addStat(g, 'happiness', -randInt(g, 1, 3))
    notice(g, 'Membership Lapsed', `${hasTech(g, 'creditCards') ? 'Your card was declined at renewal' : "Your renewal check bounced"}, so your ${list} ${lapsed.length === 1 ? 'membership has' : 'memberships have'} lapsed. You can rejoin when your finances recover.`, { emoji: '💳', tone: 'bad' })
  }
}
