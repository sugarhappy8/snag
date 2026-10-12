// Patents and the six launch routes. Quotes (routeQuotes, licenseQuote, odds) are pure and use
// the same formulas the resolvers roll against, so talent hints never lie and never promise.
import { addHidden, addStat, count, earnIncome, formatMoney, fullName, log, notice, remember as rememberLife, scriptChoice, spend, useYearAction, yearActionsUsed } from '../core'
import { brandById, brandExists } from '../data/brands'
import { economicRoll } from '../economy'
import { hasTech } from '../history/timeline'
import { rand, uid } from '../rng'
import { defineScript } from '../scripts'
import { addFame } from '../special/common'
import { talentHint } from '../talents'
import type { Asset, ChoiceOption, GameState, Json } from '../types'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { businessAssets } from '../business/state'
import { CATEGORIES, stars, type Category, type IdeaDef } from './catalog'
import {
  COMPANY_MARGIN, CROWD_GOAL, CROWD_MARGIN, PITCH_BOOST, crowdFans, crowdGoal, crowdOdds, curveSpec, deliveryFailOdds, expectedPeak, firstYearRevenue,
  licenseRate, licenseValue, patentFee, patentLaw, pitchOdds, priceOf, revenueValue, streamValue, trueAppeal, type Subject,
} from './market'
import { addRep, companyBlock, dropIdea, findIdea, findInvention, fittingCompanies, isGenius, mutWorkshop, readWorkshop, remember, storeInv, workshopBlock } from './notebook'
import { blankInv, noteDef, rec, text, type Inv, type NoteIdea, type Patent, type PatentScope, type Route, type Workshop } from './state'
import type { Target } from './build'

export const PATENT_MIN = 40
export const LAUNCH_MIN = 30

export interface Bench {
  target: Target
  def: IdeaDef
  q: number
  builds: number
  patent: Patent | null
  country: string
  shopped: number
  pitched: number
  crowd: number
  idea?: NoteIdea
  a?: Asset
  inv?: Inv
}

/** A notebook idea, or a patented invention not launched yet. Pure. */
export function benchFor(g: GameState, ws: Workshop, t: Target): Bench | null {
  if (t.kind === 'idea') {
    const idea = findIdea(ws, t.id)
    if (!idea) return null
    return { target: t, def: noteDef(idea), q: idea.q, builds: idea.builds, patent: null, country: g.character.countryId, shopped: idea.shopped ?? -1, pitched: idea.pitched ?? -1, crowd: idea.crowd ?? -1, idea }
  }
  const o = findInvention(g, t.id)
  if (!o || o.inv.stage !== 'patented') return null
  return { target: t, def: o.def, q: o.inv.q, builds: o.inv.builds, patent: o.inv.patent, country: o.inv.country, shopped: o.inv.shopped, pitched: o.inv.pitched, crowd: o.inv.crowd, a: o.a, inv: o.inv }
}

/** Still a history first if it reaches the market this year. */
export function isFirst(def: IdeaDef, year: number): boolean {
  return typeof def.real === 'number' && year <= def.real
}

export function subjectOf(g: GameState, b: Bench): Subject {
  return { def: b.def, q: b.q, patent: b.patent, country: b.country, history: isFirst(b.def, g.year) }
}

// ---------------------------------------------------------------------------
// Patents

export function patentCost(g: GameState, b: Bench, scope: PatentScope): number {
  if (b.patent) return b.patent.scope === 'home' && scope === 'world' ? patentFee(b.patent.country, g.year, 'world') - patentFee(b.patent.country, g.year, 'home') : 0
  return patentFee(b.country, g.year, scope)
}

export function patentBlock(g: GameState, t: Target, scope: PatentScope): string | null {
  const reason = workshopBlock(g)
  if (reason) return reason
  const b = benchFor(g, readWorkshop(g), t)
  if (!b) return 'That idea is no longer on your bench.'
  if (b.patent && (b.patent.scope === 'world' || scope === 'home')) return b.patent.scope === 'world' ? 'Already patented worldwide.' : 'Already patented at home.'
  if (b.q < PATENT_MIN) return `The patent office wants a working prototype (quality ${PATENT_MIN}+).`
  const cost = patentCost(g, b, scope)
  if (g.character.money < cost) return `Filing costs ${formatMoney(cost)}.`
  return null
}

/** File a patent: a notebook idea becomes an invention asset. Returns the asset. */
export function filePatent(g: GameState, t: Target, scope: PatentScope): Asset | null {
  if (patentBlock(g, t, scope)) return null
  const ws = mutWorkshop(g)
  const b = benchFor(g, ws, t)
  if (!b) return null
  const cost = patentCost(g, b, scope)
  if (!spend(g, cost)) return null
  const law = patentLaw(b.country, g.year)
  let a: Asset
  if (b.a && b.inv && b.patent) {
    b.inv.patent = { ...b.patent, scope: 'world' }
    a = b.a
    storeInv(g, a, b.inv, ws.rep)
  } else {
    const idea = b.idea!
    const patent: Patent = { scope, country: b.country, filed: g.year, expires: g.year + law.term }
    const inv = blankInv(b.def, { custom: idea.custom, q: idea.q, builds: idea.builds, patent, country: b.country, price: priceOf(b.def), inventor: fullName(g.character), history: isFirst(b.def, g.year) })
    inv.shopped = idea.shopped ?? -1
    inv.pitched = idea.pitched ?? -1
    inv.crowd = idea.crowd ?? -1
    a = { id: uid(g, 'inv'), kind: 'invention', name: b.def.name, emoji: b.def.emoji, purchasePrice: cost, value: 0, condition: 100, purchasedAge: g.character.age, upkeep: 0, details: {} }
    storeInv(g, a, inv, ws.rep)
    g.assets.push(a)
    dropIdea(ws, idea.id)
    count(g, 'patents')
    addRep(ws, ws.made.length || g.assets.some((x) => x.kind === 'invention' && x.id !== a.id) ? 3 : 5)
  }
  const where = scope === 'world' ? 'worldwide' : `in ${getCountry(b.country).name}`
  notice(g, '\u{1F4DC} Patent Granted', `${b.def.emoji} The ${b.def.name} is yours alone ${where} until ${b.inv?.patent?.expires ?? g.year + law.term}. Find it in Assets.`, { emoji: '\u{1F4DC}', tone: 'good' })
  log(g, `I patented the ${b.def.name} ${where}.`, 'good')
  return a
}

// ---------------------------------------------------------------------------
// Launching

/** One big deal (launch or sale) a year: the notebook fills faster than the market can take. */
export function launchLimit(_g: GameState): number {
  return 1
}
export function dealsLeft(g: GameState): number {
  return Math.max(0, launchLimit(g) - yearActionsUsed(g, 'workshop.launch'))
}

export function launchBlock(g: GameState, t: Target): string | null {
  const reason = workshopBlock(g)
  if (reason) return reason
  const b = benchFor(g, readWorkshop(g), t)
  if (!b) return 'That idea is no longer on your bench.'
  if (b.q < LAUNCH_MIN) return `Build a prototype that works first (quality ${LAUNCH_MIN}+).`
  if (dealsLeft(g) <= 0) return 'One big deal a year. Inventing is a marathon.'
  return null
}

const FIRST = ['Gizmo', 'Wobble', 'Tinker', 'Brass', 'Puddle', 'Fizz', 'Crank', 'Zephyr', 'Pocket', 'Lumen', 'Velvet', 'Oddment', 'Quirk', 'Bumble', 'Sprocket', 'Doodle', 'Clockwork', 'Higgle']
const SECOND = ['worth', 'field', 'ton', 'bolt', 'wick', 'shaw', 'more', 'ley', 'brook', 'stone']
function fictional(r1: number, r2: number, cat: Category): string {
  return `${FIRST[Math.floor(r1 * FIRST.length)]}${SECOND[Math.floor(r2 * SECOND.length)]} ${CATEGORIES[cat].suffix}`
}
function realBuyers(g: GameState, cat: Category): string[] {
  return CATEGORIES[cat].buyers.map((id) => brandById(id)).filter((b) => !!b && brandExists(b, g.year)).map((b) => b!.name)
}

/** The manufacturer that would license it this year (stable, pure). */
export function licenseQuote(g: GameState, ws: Workshop, b: Bench): { maker: string; rate: number } {
  const real = realBuyers(g, b.def.cat)
  const r = economicRoll(`${g.lifeId}|ws-maker|${b.def.id}|${g.year}`)
  const maker = real.length && r < 0.5 ? real[Math.floor((r / 0.5) * real.length)] : fictional(r, economicRoll(`${g.lifeId}|ws-maker2|${b.def.id}`), b.def.cat)
  return { maker, rate: licenseRate(b.q, ws.rep, isFirst(b.def, g.year)) }
}

function launchedInv(g: GameState, ws: Workshop, b: Bench): { a: Asset; inv: Inv } {
  if (b.a && b.inv) return { a: b.a, inv: b.inv }
  const idea = b.idea!
  const inv = blankInv(b.def, { custom: idea.custom, q: idea.q, builds: idea.builds, patent: null, country: b.country, price: priceOf(b.def), inventor: fullName(g.character), history: isFirst(b.def, g.year) })
  const a: Asset = { id: uid(g, 'inv'), kind: 'invention', name: b.def.name, emoji: b.def.emoji, purchasePrice: 0, value: 0, condition: 100, purchasedAge: g.character.age, upkeep: 0, details: {} }
  g.assets.push(a)
  dropIdea(ws, idea.id)
  return { a, inv }
}

interface LaunchOpts { route: Route; rate?: number; margin?: number; company?: string; maker: string; boost?: number }

/** Put an invention on sale (route chosen by the caller, who already used the year's deal). */
function commitLaunch(g: GameState, ws: Workshop, b: Bench, o: LaunchOpts): Asset {
  const { a, inv } = launchedInv(g, ws, b)
  const first = isFirst(b.def, g.year)
  // Hidden luck (0.65-1.35, mean 1): the hints show expected sales, never the dice.
  const luck = 0.65 + 0.7 * rand(g)
  const peak = expectedPeak(b.def, b.q, trueAppeal(g, b.def), b.patent?.scope ?? null, b.country, g.year, first) * luck * (o.boost ?? 1)
  Object.assign(inv, {
    stage: 'launched', route: o.route, rate: o.rate ?? 0, margin: o.margin ?? 0, company: o.company ?? '', maker: o.maker,
    launched: g.year, peak: Math.round(peak), price: priceOf(b.def), history: first, last: g.year - 1, inventor: inv.inventor || fullName(g.character),
  })
  storeInv(g, a, inv, ws.rep)
  ws.launches += 1
  count(g, 'inventions')
  addRep(ws, 3 + (b.q >= 80 ? 2 : 0))
  remember(ws, { id: b.def.id, name: b.def.name, emoji: b.def.emoji, route: o.route, year: g.year, ...(first ? { first: true } : {}) })
  return a
}

/** After the route's own popup: the history moment, if this launch beat history. */
function afterLaunch(g: GameState, ws: Workshop, b: Bench, launchedYear: number): void {
  if (isFirst(b.def, launchedYear)) beatHistory(g, ws, b.def)
}

/** "You beat history": the moment the history race pays off. */
export function beatHistory(g: GameState, ws: Workshop, def: IdeaDef): void {
  const early = Math.max(0, (def.real ?? g.year) - g.year)
  addFame(g, 20)
  addRep(ws, 15)
  addStat(g, 'happiness', 10)
  count(g, 'historyFirsts')
  rememberLife(g, `Beat history with the ${def.name}.`)
  notice(g, '\u{1F3C6} You Beat History!', `${def.emoji} The ${def.name} reached the world ${early ? `${early} year${early === 1 ? '' : 's'} before anyone else thought of it` : 'just before anyone else could'}. In this timeline, it's yours. History books, update your files.`, { emoji: '\u{1F3C6}', tone: 'good' })
  log(g, `I beat history: the ${def.name} is mine.`, 'good')
}

function gone(g: GameState, ws: Workshop, b: Bench): void {
  if (b.a) g.assets = g.assets.filter((x) => x.id !== b.a!.id)
  if (b.idea) dropIdea(ws, b.idea.id)
}

// --- License ---------------------------------------------------------------

export function license(g: GameState, t: Target): Asset | null {
  if (launchBlock(g, t)) return null
  const ws = mutWorkshop(g)
  const b = benchFor(g, ws, t)!
  const q = licenseQuote(g, ws, b)
  useYearAction(g, 'workshop.launch', launchLimit(g))
  const a = commitLaunch(g, ws, b, { route: 'license', rate: q.rate, maker: q.maker })
  notice(g, '\u{1F91D} Licensed!', `${b.def.emoji} ${q.maker} will make the ${b.def.name} and pay you ${(q.rate * 100).toFixed(1)}% of every sale. Royalties arrive each year.`, { emoji: '\u{1F91D}', tone: 'good' })
  log(g, `I licensed the ${b.def.name} to ${q.maker}.`, 'good')
  afterLaunch(g, ws, b, g.year)
  return a
}

// --- Sell the rights -------------------------------------------------------

export function sellBlock(g: GameState, t: Target): string | null {
  const reason = launchBlock(g, t)
  if (reason) return reason
  const b = benchFor(g, readWorkshop(g), t)!
  return b.shopped === g.year ? 'Buyers already looked at it this year.' : null
}

/** Expected value of the rights to a buyer (they judge by the appeal people expect). Pure. */
export function rightsBasis(g: GameState, ws: Workshop, b: Bench): number {
  return licenseValue(g, subjectOf(g, b), b.def.a, ws.rep)
}
export function offerCount(ws: Workshop, b: Bench, year: number): number {
  return 1 + (b.q >= 60 ? 1 : 0) + (ws.rep >= 40 || isFirst(b.def, year) ? 1 : 0)
}

/** Shop the rights around: 1-3 offers in a popup (one try a year per idea). */
export function shopRights(g: GameState, t: Target): boolean {
  if (sellBlock(g, t)) return false
  const ws = mutWorkshop(g)
  const b = benchFor(g, ws, t)!
  if (b.idea) b.idea.shopped = g.year
  else if (b.inv && b.a) {
    b.inv.shopped = g.year
    storeInv(g, b.a, b.inv, ws.rep)
  }
  const basis = rightsBasis(g, ws, b)
  const real = realBuyers(g, b.def.cat)
  const offers: { buyer: string; amount: number }[] = []
  for (let i = 0; i < offerCount(ws, b, g.year); i++) {
    const amount = Math.max(50, Math.round((basis * (0.5 + 0.55 * rand(g))) / 10) * 10)
    const pickReal = real.length > 0 && rand(g) < 0.5
    const r1 = rand(g)
    let buyer = pickReal ? real[Math.floor(r1 * real.length)] : fictional(r1, rand(g), b.def.cat)
    // Every offer counts (the hint's expected best offer assumes all of them); names stay distinct.
    for (let k = 0; k < 6 && offers.some((o) => o.buyer === buyer); k++) buyer = fictional(rand(g), rand(g), b.def.cat)
    if (offers.some((o) => o.buyer === buyer)) buyer = `${buyer} ${['Ltd.', 'Inc.', '& Sons'][i % 3]}`
    offers.push({ buyer, amount })
  }
  offers.sort((x, y) => y.amount - x.amount)
  const worth = licenseValue(g, subjectOf(g, b), trueAppeal(g, b.def), ws.rep)
  const choices: ChoiceOption[] = offers.map((o, i) => {
    const hint = talentHint(g, 'Inventor', o.amount >= worth * 0.75 ? `A great price: licensing it yourself is worth ~${formatMoney(worth)}.` : `Below its real worth (licensing: ~${formatMoney(worth)}).`)
    return { id: `o${i}`, label: `${o.buyer}: ${formatMoney(o.amount)}`, emoji: '\u{1F4B0}', ...(hint ? { hint } : {}) }
  })
  choices.push({ id: 'keep', label: 'Keep it', emoji: '\u{1F645}' })
  scriptChoice(g, SELL_SCRIPT, 'Offers for the Rights', `${b.def.emoji} ${offers.length === 1 ? 'One company wants' : `${offers.length} companies want`} the ${b.def.name}. Sell, and it's theirs forever.`, choices, { emoji: '\u{1F4B0}', data: { kind: t.kind, id: t.id, year: g.year, offers } as unknown as Json })
  return true
}

export function acceptOffer(g: GameState, t: Target, buyer: string, amount: number): boolean {
  if (launchBlock(g, t) || !(amount > 0)) return false
  const ws = mutWorkshop(g)
  const b = benchFor(g, ws, t)!
  useYearAction(g, 'workshop.launch', launchLimit(g))
  earnIncome(g, amount)
  ws.earned += amount
  ws.launches += 1
  gone(g, ws, b)
  count(g, 'inventions')
  count(g, 'rightsSold')
  addRep(ws, 2)
  const first = isFirst(b.def, g.year)
  remember(ws, { id: b.def.id, name: b.def.name, emoji: b.def.emoji, route: 'sold', year: g.year, ...(first ? { first: true } : {}) })
  notice(g, '\u{1F91D} Sold!', `${buyer} bought the ${b.def.name} for ${formatMoney(amount)}. Cha-ching. (Taxed as income.)`, { emoji: '\u{1F4B0}', tone: 'good' })
  log(g, `I sold the rights to the ${b.def.name} to ${buyer} for ${formatMoney(amount)}.`, 'good')
  if (first) beatHistory(g, ws, b.def)
  return true
}

const SELL_SCRIPT = defineScript('workshop.sell', (g, choice, data) => {
  const d = rec(data)
  const t: Target = { kind: d.kind === 'asset' ? 'asset' : 'idea', id: text(d.id) }
  const offers = Array.isArray(d.offers) ? d.offers.map(rec) : []
  const i = /^o(\d)$/.exec(choice)
  if (!i || d.year !== g.year) return
  const o = offers[Number(i[1])]
  if (!o) return
  if (!acceptOffer(g, t, text(o.buyer), typeof o.amount === 'number' && Number.isFinite(o.amount) ? Math.max(0, Math.min(1e12, o.amount)) : 0)) {
    notice(g, 'Deal Fell Through', 'The buyer got cold feet. Maybe next year.', { emoji: '\u{1F937}' })
  }
})

// --- Pitch to investors ------------------------------------------------------

export function pitchVenue(g: GameState): { show: boolean; name: string; emoji: string } {
  return g.year >= 2001 && hasTech(g, 'tv') ? { show: true, name: 'The Pitch Pit', emoji: '\u{1F3A4}' } : { show: false, name: 'the Grand Invention Fair', emoji: '\u{1F3AA}' }
}

export function pitchBlock(g: GameState, t: Target): string | null {
  const reason = launchBlock(g, t)
  if (reason) return reason
  const b = benchFor(g, readWorkshop(g), t)!
  return b.pitched >= 0 ? 'You already pitched this one. Investors have long memories.' : null
}

/** The royalty a pitch deal pays before the investor's cut, and the boosted expected stream. Pure. */
export function pitchStream(g: GameState, ws: Workshop, b: Bench): { rate: number; value: number } {
  const rate = licenseRate(b.q, ws.rep, isFirst(b.def, g.year)) + 0.01
  const peak = expectedPeak(b.def, b.q, trueAppeal(g, b.def), b.patent?.scope ?? null, b.country, g.year, isFirst(b.def, g.year)) * PITCH_BOOST
  return { rate, value: streamValue(curveSpec(b.def, g.year, b.patent), 0, priceOf(b.def) * rate, peak) }
}

const NO_DEAL = [
  'One investor laughed so hard they had to leave. The others just said "I\'m out."',
  'They asked what it does. You explained for ten minutes. They asked again.',
  'Your prototype chose that exact moment to fall apart.',
  '"Love the energy, hate the idea." Ouch.',
]

export function pitch(g: GameState, t: Target): boolean {
  if (pitchBlock(g, t)) return false
  const ws = mutWorkshop(g)
  const b = benchFor(g, ws, t)!
  if (b.idea) b.idea.pitched = g.year
  else if (b.inv && b.a) {
    b.inv.pitched = g.year
    storeInv(g, b.a, b.inv, ws.rep)
  }
  const venue = pitchVenue(g)
  addFame(g, venue.show ? 2 : 1)
  const odds = pitchOdds(g, subjectOf(g, b), trueAppeal(g, b.def), ws.rep)
  if (rand(g) >= odds) {
    addStat(g, 'happiness', -3)
    addRep(ws, -2)
    notice(g, `${venue.emoji} No Deal`, `You pitched the ${b.def.name} at ${venue.name}. ${NO_DEAL[Math.floor(rand(g) * NO_DEAL.length)]}`, { emoji: venue.emoji, tone: 'bad' })
    log(g, `I pitched the ${b.def.name} at ${venue.name}. Nobody bit.`, 'bad')
    return false
  }
  const cut = Math.round((0.2 + 0.3 * rand(g)) * 100) / 100
  const s = pitchStream(g, ws, b)
  const cash = Math.max(500, Math.round((cut * s.value * (0.55 + 0.35 * rand(g))) / 100) * 100)
  const investor = `${randomFirstName(g, g.character.countryId, rand(g) < 0.5 ? 'female' : 'male')} ${randomLastName(g, g.character.countryId)}`
  const keep = s.value * (1 - cut)
  const hint = talentHint(g, 'Inventor', `Expected: ${formatMoney(cash)} now + ~${formatMoney(keep)} in royalties. Licensing alone: ~${formatMoney(licenseValue(g, subjectOf(g, b), trueAppeal(g, b.def), ws.rep))}.`)
  scriptChoice(g, PITCH_SCRIPT, `${venue.emoji} An Offer!`, `At ${venue.name}, investor ${investor} offers ${formatMoney(cash)} for ${Math.round(cut * 100)}% of your royalties on the ${b.def.name}. Their factories and shops come with the deal.`, [
    { id: 'deal', label: `Deal! (${formatMoney(cash)})`, emoji: '\u{1F91D}', ...(hint ? { hint } : {}) },
    { id: 'walk', label: 'Walk away', emoji: '\u{1F6B6}' },
  ], { emoji: venue.emoji, data: { kind: t.kind, id: t.id, year: g.year, cut, cash, investor } as unknown as Json })
  return true
}

export function acceptPitch(g: GameState, t: Target, cut: number, cash: number, investor: string): boolean {
  if (launchBlock(g, t)) return false
  const ws = mutWorkshop(g)
  const b = benchFor(g, ws, t)!
  useYearAction(g, 'workshop.launch', launchLimit(g))
  earnIncome(g, cash)
  ws.earned += cash
  const s = pitchStream(g, ws, b)
  const a = commitLaunch(g, ws, b, { route: 'pitch', rate: Math.round(s.rate * (1 - cut) * 10_000) / 10_000, maker: `${investor}'s partners`, boost: PITCH_BOOST })
  notice(g, '\u{1F91D} Deal!', `${investor} wrote you a check for ${formatMoney(cash)}. You keep ${Math.round((1 - cut) * 100)}% of the ${b.def.name}'s royalties.`, { emoji: '\u{1F91D}', tone: 'good' })
  log(g, `I made a deal with investor ${investor} for the ${b.def.name}.`, 'good')
  afterLaunch(g, ws, b, g.year)
  return !!a
}

const PITCH_SCRIPT = defineScript('workshop.pitch', (g, choice, data) => {
  const d = rec(data)
  if (choice !== 'deal' || d.year !== g.year) {
    if (choice === 'walk') log(g, 'I walked away from an investor deal. Bold.')
    return
  }
  const cut = typeof d.cut === 'number' && Number.isFinite(d.cut) ? Math.max(0.05, Math.min(0.9, d.cut)) : 0.5
  const cash = typeof d.cash === 'number' && Number.isFinite(d.cash) ? Math.max(0, Math.min(1e12, d.cash)) : 0
  if (!acceptPitch(g, { kind: d.kind === 'asset' ? 'asset' : 'idea', id: text(d.id) }, cut, cash, text(d.investor) || 'The investor')) {
    notice(g, 'Deal Off', 'By the time the paperwork arrived, the deal was off.', { emoji: '\u{1F937}' })
  }
})

// --- Crowdfunding ------------------------------------------------------------

export function crowdBlock(g: GameState, t: Target): string | null {
  if (g.year < 2009 || !hasTech(g, 'internet')) return "Crowdfunding isn't a thing yet."
  if (g.character.age < 18) return 'You must be 18 to run a campaign.'
  const reason = launchBlock(g, t)
  if (reason) return reason
  const b = benchFor(g, readWorkshop(g), t)!
  return b.crowd === g.year ? 'One campaign a year per idea.' : null
}

/** Open the goal popup. */
export function startCrowd(g: GameState, t: Target): void {
  if (crowdBlock(g, t)) return
  const ws = readWorkshop(g)
  const b = benchFor(g, ws, t)!
  const s = subjectOf(g, b)
  const appeal = trueAppeal(g, b.def)
  const fail = deliveryFailOdds(s)
  const names = ['Modest goal', 'Ambitious goal', 'Moonshot goal']
  const choices: ChoiceOption[] = CROWD_GOAL.map((_, tier) => {
    const hint = talentHint(g, 'Inventor', `${Math.round(crowdOdds(g, tier) * 100)}% to fund · ${Math.round(fail * 100)}% delivery trouble · ${Math.round(CROWD_MARGIN[tier] * 100)}% margin`)
    return { id: `t${tier}`, label: `${names[tier]}: ${formatMoney(crowdGoal(g, s, appeal, tier))}`, emoji: '\u{1F3AF}', ...(hint ? { hint } : {}) }
  })
  choices.push({ id: 'cancel', label: 'Not yet', emoji: '\u{1F6AA}' })
  scriptChoice(g, CROWD_SCRIPT, 'Crowdfund It', `${b.def.emoji} Set a goal for the ${b.def.name}. Miss it and you get nothing. Bigger goals build a bigger factory: a better margin on every sale.`, choices, { emoji: '\u{1F3AF}', data: { kind: t.kind, id: t.id, year: g.year } as unknown as Json })
}

export function runCrowd(g: GameState, t: Target, tier: number): 'flop' | 'delivered' | 'botched' | null {
  if (crowdBlock(g, t) || !(tier >= 0 && tier <= 2)) return null
  const ws = mutWorkshop(g)
  const b = benchFor(g, ws, t)!
  if (b.idea) b.idea.crowd = g.year
  else if (b.inv && b.a) {
    b.inv.crowd = g.year
    storeInv(g, b.a, b.inv, ws.rep)
  }
  useYearAction(g, 'workshop.launch', launchLimit(g))
  const s = subjectOf(g, b)
  const fans = crowdFans(g)
  const u = 0.2 + 1.6 * rand(g)
  if (u * fans < CROWD_GOAL[tier]) {
    addRep(ws, -3)
    addStat(g, 'happiness', -4)
    notice(g, '\u{1F3AF} Campaign Flopped', `The ${b.def.name} raised a fraction of its goal. Your mom backed it twice. Nobody gets charged; you keep the idea.`, { emoji: '\u{1F4C9}', tone: 'bad' })
    log(g, `My crowdfunding campaign for the ${b.def.name} missed its goal.`, 'bad')
    return 'flop'
  }
  const pledges = Math.round(firstYearRevenue(g, s, trueAppeal(g, b.def)) * u * fans)
  const margin = CROWD_MARGIN[tier]
  if (rand(g) < deliveryFailOdds(s)) {
    addRep(ws, -12)
    addHidden(g, 'karma', -3)
    addStat(g, 'happiness', -6)
    commitLaunch(g, ws, b, { route: 'crowd', rate: Math.max(0.05, margin - 0.08), maker: 'your own small factory', boost: 0.6 })
    notice(g, '\u{1F4E6} Delivery Disaster', `Backers pledged ${formatMoney(pledges)}, but the ${b.def.name} shipped late and wobbly. Every cent went into fixing it. The reviews are... spicy.`, { emoji: '\u{1F4E6}', tone: 'bad' })
    log(g, `My crowdfunded ${b.def.name} shipped late and broken.`, 'bad')
    afterLaunch(g, ws, b, g.year)
    return 'botched'
  }
  const profit = Math.round(pledges * margin)
  earnIncome(g, profit)
  ws.earned += profit
  commitLaunch(g, ws, b, { route: 'crowd', rate: margin, maker: 'your own small factory' })
  notice(g, '\u{1F389} Funded!', `Backers pledged ${formatMoney(pledges)} for the ${b.def.name}! You shipped on time and kept ${formatMoney(profit)}. Now you make every one yourself.`, { emoji: '\u{1F389}', tone: 'good' })
  log(g, `My crowdfunding campaign for the ${b.def.name} raised ${formatMoney(pledges)}.`, 'good')
  afterLaunch(g, ws, b, g.year)
  return 'delivered'
}

const CROWD_SCRIPT = defineScript('workshop.crowd', (g, choice, data) => {
  const d = rec(data)
  const m = /^t([0-2])$/.exec(choice)
  if (!m || d.year !== g.year) return
  runCrowd(g, { kind: d.kind === 'asset' ? 'asset' : 'idea', id: text(d.id) }, Number(m[1]))
})

// --- Make it in my company -----------------------------------------------------

export function companyLaunchBlock(g: GameState, t: Target, companyId: string): string | null {
  const reason = launchBlock(g, t)
  if (reason) return reason
  const b = benchFor(g, readWorkshop(g), t)!
  const company = businessAssets(g).find((x) => x.id === companyId)
  return company ? companyBlock(g, company, b.def.cat) : 'You no longer own this company.'
}

export function makeInCompany(g: GameState, t: Target, companyId: string): Asset | null {
  if (companyLaunchBlock(g, t, companyId)) return null
  const ws = mutWorkshop(g)
  const b = benchFor(g, ws, t)!
  const company = businessAssets(g).find((x) => x.id === companyId)!
  useYearAction(g, 'workshop.launch', launchLimit(g))
  const a = commitLaunch(g, ws, b, { route: 'company', margin: COMPANY_MARGIN, company: company.id, maker: company.name })
  notice(g, '\u{1F3ED} In Production!', `${company.name} will make the ${b.def.name}. Its profit lands in the company's books every year.`, { emoji: '\u{1F3ED}', tone: 'good' })
  log(g, `${company.name} started making my ${b.def.name}.`, 'good')
  afterLaunch(g, ws, b, g.year)
  return a
}

// --- Give it to the world -------------------------------------------------------

export function giveAway(g: GameState, t: Target): boolean {
  if (launchBlock(g, t)) return false
  const ws = mutWorkshop(g)
  const b = benchFor(g, ws, t)!
  useYearAction(g, 'workshop.launch', launchLimit(g))
  gone(g, ws, b)
  ws.launches += 1
  count(g, 'inventions')
  count(g, 'openInventions')
  addHidden(g, 'karma', 12)
  addFame(g, 4)
  addRep(ws, 8)
  addStat(g, 'happiness', 6)
  const first = isFirst(b.def, g.year)
  remember(ws, { id: b.def.id, name: b.def.name, emoji: b.def.emoji, route: 'open', year: g.year, ...(first ? { first: true } : {}) })
  notice(g, '\u{1F30D} A Gift to the World', `You published the ${b.def.name} for anyone to make, free. Not a cent for you, but people everywhere are grateful.`, { emoji: '\u{1F30D}', tone: 'good' })
  log(g, `I gave the ${b.def.name} to the world for free.`, 'good')
  if (first) beatHistory(g, ws, b.def)
  return true
}

// --- After launch: selling a royalty stream, scrapping ideas ----------------------

export function streamSaleBlock(g: GameState, id: string): string | null {
  const reason = workshopBlock(g)
  if (reason) return reason
  const o = findInvention(g, id)
  if (!o || o.inv.stage !== 'launched') return 'Nothing to sell.'
  if (o.inv.route === 'company') return 'Your company makes this one; sell the company instead.'
  if (!(o.a.value > 0)) return 'Nobody will pay for what is left of it.'
  return null
}

/** Sell the remaining royalties (or own-production business) for its current value. */
export function sellStream(g: GameState, id: string): number {
  if (streamSaleBlock(g, id)) return 0
  const ws = mutWorkshop(g)
  const o = findInvention(g, id)!
  const amount = Math.round(o.a.value)
  earnIncome(g, amount)
  ws.earned += amount
  g.assets = g.assets.filter((x) => x.id !== id)
  notice(g, '\u{1F4B5} Sold', `You sold your share of the ${o.def.name} for ${formatMoney(amount)}. (Taxed as income.)`, { emoji: '\u{1F4B5}', tone: 'good' })
  log(g, `I sold my royalties on the ${o.def.name} for ${formatMoney(amount)}.`, 'good')
  return amount
}

export function scrapIdea(g: GameState, id: string): boolean {
  if (workshopBlock(g)) return false
  const ws = mutWorkshop(g)
  const idea = findIdea(ws, id)
  if (!idea) return false
  dropIdea(ws, id)
  log(g, `I crumpled up my notes for the ${noteDef(idea).name}.`)
  return true
}

// ---------------------------------------------------------------------------
// Route quotes for hints (pure, expected values from the resolvers' own formulas)

export interface RouteQuote { route: 'sell' | Route; label: string; value: number; company: boolean }

export function routeQuotes(g: GameState, ws: Workshop, b: Bench): RouteQuote[] {
  const s = subjectOf(g, b)
  const appeal = trueAppeal(g, b.def)
  const out: RouteQuote[] = []
  const n = offerCount(ws, b, g.year)
  // Routes already tried this year (or ever, for the pitch) are not recommended.
  if (b.shopped !== g.year) out.push({ route: 'sell', label: 'Sell the rights', value: rightsBasis(g, ws, b) * (0.5 + (0.55 * n) / (n + 1)), company: false })
  const lic = licenseValue(g, s, appeal, ws.rep)
  out.push({ route: 'license', label: 'License', value: lic, company: false })
  if (b.pitched < 0) {
    const p = pitchStream(g, ws, b)
    const odds = pitchOdds(g, s, appeal, ws.rep)
    // A deal pays ~0.35 × 0.725 of the stream up front and leaves 65% of it; no deal leaves you free to license later.
    out.push({ route: 'pitch', label: 'Pitch to investors', value: odds * p.value * (0.35 * 0.725 + 0.65) + (1 - odds) * lic * 0.9, company: false })
  }
  if (g.year >= 2009 && hasTech(g, 'internet') && g.character.age >= 18 && b.crowd !== g.year) {
    const fans = crowdFans(g)
    const e1 = firstYearRevenue(g, s, appeal)
    const fail = deliveryFailOdds(s)
    const peak = expectedPeak(b.def, b.q, appeal, b.patent?.scope ?? null, b.country, g.year, s.history)
    let best = 0
    for (let tier = 0; tier < 3; tier++) {
      const odds = crowdOdds(g, tier)
      const kk = Math.max(0.2, CROWD_GOAL[tier] / fans)
      const pledged = e1 * ((kk + 1.8) / 2) * fans
      const m = CROWD_MARGIN[tier]
      const ok = pledged * m + streamValue(curveSpec(b.def, g.year, b.patent), 0, priceOf(b.def) * m, peak)
      const bad = streamValue(curveSpec(b.def, g.year, b.patent), 0, priceOf(b.def) * Math.max(0.05, m - 0.08), peak * 0.6)
      best = Math.max(best, odds * ((1 - fail) * ok + fail * bad))
    }
    out.push({ route: 'crowd', label: 'Crowdfund', value: best, company: false })
  }
  if (fittingCompanies(g, b.def.cat).length) out.push({ route: 'company', label: 'Make it in my company', value: revenueValue(g, s, appeal) * COMPANY_MARGIN, company: true })
  return out
}

/** The talent's purple hint for an idea or invention on the bench. Pure ('' without the talent). */
export function benchHint(g: GameState, ws: Workshop, b: Bench): string {
  if (!isGenius(g)) return ''
  const quotes = routeQuotes(g, ws, b)
  const best = quotes.reduce((x, y) => (y.value > x.value ? y : x))
  return talentHint(g, 'Inventor', `Real appeal ${stars(trueAppeal(g, b.def))} · best: ${best.label} (~${formatMoney(best.value)}${best.company ? ' to the company' : ''})`)
}
