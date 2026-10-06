// Scripted business events: a few per company per decade, never every year. Each one is a
// choice with real consequences, flavored by the market the company operates in (inspectors who
// expect envelopes, unions that strike, currencies that melt, hurricanes and earthquakes).
import { addHidden, addStat, count, formatMoney, log, notice, scriptChoice } from '../core'
import { arrestPlayer } from '../crime'
import { marketOf } from '../data/markets'
import { chance, pick, rand, randInt, weightedPick } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, ChoiceOption, GameState, Json } from '../types'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { ceoSkill, equipmentValue, localEcon, redTape, staffPower } from './economy'
import { sellBusiness } from './exit'
import { conglomerate, investorFirm, laborProtection, traitOf, unionStrength } from './flavor'
import { industryDef } from './industries'
import { bizOf, findBusiness, totalOutlets, type BizState, type KeyStaff } from './state'
import { clampN, money, num, rec, str } from './util'

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

/** Pay from company cash (it may go negative; the year-end review deals with that). */
function pay(b: BizState, amount: number): number {
  const n = Math.max(0, Math.round(amount))
  b.cash -= n
  b.yearCosts += n
  return n
}

function tell(g: GameState, title: string, text: string, emoji: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
  notice(g, title, text, { emoji, tone, ai: { when: 'full', facts: text } })
}

/** A cost that scales with the size of the company and the local price level. */
function scaled(b: BizState, usBase: number): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  const size = Math.sqrt(Math.max(1, totalOutlets(b)))
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return Math.round(Math.max(usBase * e.level * size, revenue * (usBase / 400_000)))
}

function country(b: BizState): string {
  return getCountry(b.countryId).name
}

function corrupt(b: BizState): number {
  return marketOf(b.countryId).corruption
}

function bribeCaught(g: GameState, b: BizState, crime: string): boolean {
  const p = 0.04 + (100 - corrupt(b)) / 500
  if (!chance(g, p)) return false
  arrestPlayer(g, crime, 2, { evidence: 0.6, context: 'An anti-corruption sting caught you handing an official an envelope of cash.' })
  return true
}

// ---------------------------------------------------------------------------
// Health inspection (food businesses)

const INSPECTION = defineScript('business.ev.inspection', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const passP = clampN(0.3 + b.quality / 130 + 0.08 * staffPower(b, 'quality') - (choice === 'stall' ? 0.1 : 0), 0.05, 0.95)
  if (choice === 'bribe') {
    const cost = pay(b, num(x.d.bribe))
    addHidden(g, 'karma', -6)
    if (bribeCaught(g, b, 'Bribery')) return
    log(g, `I bribed a health inspector to look the other way at ${a.name}.`, 'neutral')
    tell(g, 'Inspection "Passed"', `The inspector pocketed the ${formatMoney(cost)} envelope, signed the form without looking up and complimented your "very clean" kitchen. Your conscience is slightly less clean.`, '\u{2709}\u{FE0F}')
    return
  }
  if (chance(g, passP)) {
    b.brand = clampN(b.brand + 3, 0, 100)
    log(g, `${a.name} passed a health inspection with flying colors.`, 'good')
    tell(g, 'Inspection Passed', `The inspector ran a finger along every shelf, sniffed the fridge and gave ${a.name} top marks. You framed the certificate.`, '\u{2705}', 'good')
    return
  }
  const fine = pay(b, scaled(b, 2_500) * (choice === 'stall' ? 1.6 : 1))
  b.brand = clampN(b.brand - 7, 0, 100)
  b.demandShock = Math.min(b.demandShock, 0.93)
  if (choice === 'stall') b.capacityLoss = Math.max(b.capacityLoss, 0.08)
  log(g, `${a.name} failed a health inspection.`, 'bad')
  tell(
    g,
    'Inspection Failed',
    `The inspector found ${pick(g, ['a mouse living a full and happy life behind the fridge', 'chicken stored above the salad', 'a "best before" date from two presidents ago', 'a cockroach that appeared to be on the payroll'])}. ${a.name} was fined ${formatMoney(fine)} and the bad grade is posted on the door for everyone to see.${choice === 'stall' ? ' Stalling made them angry, so you were shut for a week too.' : ''}`,
    '\u{1F6A8}',
    'bad',
  )
})

function presentInspection(g: GameState, a: Asset, b: BizState): void {
  const c = corrupt(b)
  const bribe = Math.round(scaled(b, 600))
  const choices: ChoiceOption[] = [
    { id: 'cooperate', label: 'Let them inspect', emoji: '\u{1F50D}' },
    { id: 'stall', label: 'Stall while the staff scrub everything', emoji: '\u{1F9FD}' },
  ]
  if (c >= 45) choices.push({ id: 'bribe', label: `Slip them an envelope (${money(bribe)})`, emoji: '\u{2709}\u{FE0F}' })
  scriptChoice(
    g,
    INSPECTION,
    'Health Inspection',
    `A health inspector walked into ${a.name} in ${b.city} unannounced, clipboard in hand.${c >= 55 ? ' Between questions they mention that inspections "can take a very long time" unless someone shows appreciation.' : ''}`,
    choices,
    { emoji: '\u{1F9D1}\u{200D}\u{2695}\u{FE0F}', data: { assetId: a.id, bribe } },
  )
}

// ---------------------------------------------------------------------------
// Tax audit

const AUDIT = defineScript('business.ev.audit', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const m = marketOf(b.countryId)
  const lastTax = Math.max(0, b.last?.corpTax ?? 0)
  if (choice === 'gift') {
    const cost = pay(b, num(x.d.gift))
    addHidden(g, 'karma', -6)
    if (bribeCaught(g, b, 'Bribery Of A Tax Official')) return
    if (b.cooked > 0) b.cooked = 0
    tell(g, 'Audit Closed', `The auditor accepted your "gift" (${formatMoney(cost)}), found the books "in remarkable order" and left early for the weekend.`, '\u{1F381}')
    return
  }
  let lawyer = 0
  if (choice === 'lawyer') lawyer = pay(b, scaled(b, 4_000))
  if (b.cooked > 0) {
    const found = chance(g, choice === 'lawyer' ? 0.7 : 0.9)
    if (found) {
      const fine = pay(b, Math.max(scaled(b, 20_000), b.valuation * 0.12))
      b.cooked = 0
      b.brand = clampN(b.brand - 20, 0, 100)
      addHidden(g, 'karma', -5)
      log(g, `Auditors found cooked books at ${a.name}.`, 'bad')
      tell(g, 'Cooked Books Discovered', `The ${m.salesTaxName === 'Sales tax' ? 'IRS' : 'tax authority'} auditors found the creative accounting. ${a.name} was fined ${formatMoney(fine)}, the story hit the news and prosecutors want a word with you.`, '\u{1F4D2}', 'bad')
      if (chance(g, 0.55)) arrestPlayer(g, 'Accounting Fraud', 3, { evidence: 0.7, noResist: true, context: `Prosecutors charged you over ${a.name}'s cooked books.` })
      return
    }
    b.cooked = 0
  }
  const issueP = clampN(0.3 + redTape(b.countryId) * 0.35 - 0.1 * staffPower(b, 'finance'), 0.08, 0.85) * (choice === 'lawyer' ? 0.5 : 1)
  if (!chance(g, issueP)) {
    tell(g, 'Clean Audit', `After three weeks of questions about receipts, the auditors found nothing wrong with ${a.name}'s books.${lawyer ? ` Your tax lawyer billed ${formatMoney(lawyer)} for sitting next to you looking serious.` : ''}`, '\u{2705}', 'good')
    return
  }
  const penalty = pay(b, Math.max(scaled(b, 3_000), lastTax * (0.15 + rand(g) * 0.35)) * (choice === 'lawyer' ? 0.5 : 1))
  log(g, `A tax audit cost ${a.name} ${money(penalty)} in back taxes and penalties.`, 'bad')
  tell(g, 'Audit Penalty', `The auditors decided ${a.name} misread a rule about ${pick(g, ['deductible lunches', 'depreciation schedules', `${m.salesTaxName} on delivery fees`, 'staff benefits', 'a form nobody has ever heard of'])}. Back taxes and penalties: ${formatMoney(penalty)}.${lawyer ? ` Your lawyer (${formatMoney(lawyer)}) got it cut in half.` : ''}`, '\u{1F9FE}', 'bad')
})

function presentAudit(g: GameState, a: Asset, b: BizState): void {
  const gift = scaled(b, 2_000)
  const choices: ChoiceOption[] = [
    { id: 'cooperate', label: 'Hand over the books', emoji: '\u{1F4DA}' },
    { id: 'lawyer', label: `Hire a tax lawyer (~${money(scaled(b, 4_000))})`, emoji: '\u{1F468}\u{200D}\u{2696}\u{FE0F}' },
  ]
  if (corrupt(b) >= 50) choices.push({ id: 'gift', label: `Offer the auditor a "gift" (${money(gift)})`, emoji: '\u{1F381}' })
  const m = marketOf(b.countryId)
  scriptChoice(
    g,
    AUDIT,
    'Tax Audit',
    `${country(b)}'s tax authority picked ${a.name} for an audit of its corporate tax (${Math.round(m.corporateTax * 100)}%) and ${m.salesTaxName} filings.${b.cooked > 0 ? ' Your creative accounting suddenly feels less creative.' : ''}`,
    choices,
    { emoji: '\u{1F9EE}', data: { assetId: a.id, gift } },
  )
}

// ---------------------------------------------------------------------------
// Strike

const STRIKE = defineScript('business.ev.strike', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  if (choice === 'meet') {
    b.wageLevel = clampN(Math.round((b.wageLevel + 0.08) * 100) / 100, 0.7, 1.5)
    b.raiseYear = g.year
    b.morale = clampN(b.morale + 22, 0, 100)
    log(g, `I gave in to the strikers at ${a.name}.`, 'neutral')
    tell(g, 'Strike Over', `You agreed to an 8% raise. The picket line packed up its banners and morale jumped to ${b.morale}%.`, '\u{1F91D}', 'good')
    return
  }
  if (choice === 'negotiate') {
    if (chance(g, clampN(0.3 + ceoSkill(g, b) / 160, 0.1, 0.85))) {
      b.wageLevel = clampN(Math.round((b.wageLevel + 0.04) * 100) / 100, 0.7, 1.5)
      b.raiseYear = g.year
      b.morale = clampN(b.morale + 14, 0, 100)
      tell(g, 'Deal Reached', `After an all-nighter with the union reps you settled on a 4% raise and better shifts. Everyone is back at work.`, '\u{1F91D}', 'good')
    } else {
      b.capacityLoss = Math.max(b.capacityLoss, 0.25)
      b.morale = clampN(b.morale - 5, 0, 100)
      tell(g, 'Talks Collapsed', `Negotiations broke down when you called their demands "adorable". The strike drags on and will cost a quarter of next year's output.`, '\u{1F4A2}', 'bad')
    }
    return
  }
  if (choice === 'replace') {
    b.morale = clampN(b.morale - 15, 0, 100)
    b.quality = clampN(b.quality - 8, 0, 100)
    b.brand = clampN(b.brand - 6, 0, 100)
    b.capacityLoss = Math.max(b.capacityLoss, 0.1)
    addHidden(g, 'karma', -6)
    log(g, `I replaced the strikers at ${a.name}.`, 'bad')
    tell(g, 'Strikebreakers', `You hired replacement workers. The doors stayed open, but the new crew doesn't know where anything is, and the old crew is telling the whole town what you did.`, '\u{1F6A7}', 'bad')
    return
  }
  b.capacityLoss = Math.max(b.capacityLoss, 0.35)
  b.brand = clampN(b.brand - 4, 0, 100)
  tell(g, 'Waiting It Out', `You refused to budge. The strike will eat into a third of next year's output, and customers are crossing a picket line to get to you, or not.`, '\u{23F3}', 'bad')
})

function presentStrike(g: GameState, a: Asset, b: BizState): void {
  const choices: ChoiceOption[] = [
    { id: 'meet', label: 'Meet their demands (8% raise)', emoji: '\u{1F91D}' },
    { id: 'negotiate', label: 'Negotiate', emoji: '\u{1F5E3}\u{FE0F}' },
    { id: 'wait', label: 'Wait them out', emoji: '\u{23F3}' },
  ]
  if (laborProtection(b.countryId) < 0.4) choices.push({ id: 'replace', label: 'Hire replacement workers', emoji: '\u{1F6A7}' })
  const protect = laborProtection(b.countryId) >= 0.4 ? ` Labor law in ${country(b)} makes replacing strikers illegal.` : ''
  scriptChoice(g, STRIKE, 'Strike!', `Morale at ${a.name} hit rock bottom (${b.morale}%). The staff walked out and set up a picket line in front of your ${industryDef(b.industry).site} in ${b.city}.${protect}`, choices, {
    emoji: '\u{1FAA7}',
    data: { assetId: a.id },
  })
}

// ---------------------------------------------------------------------------
// Viral review

const VIRAL = defineScript('business.ev.viral', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const good = x.d.good === true
  if (good) {
    if (choice === 'ride') {
      const cost = pay(b, scaled(b, 5_000))
      b.brand = clampN(b.brand + 9, 0, 100)
      b.demandShock = Math.max(b.demandShock, 1.16)
      tell(g, 'Riding the Wave', `You spent ${formatMoney(cost)} on ads around the viral video. Lines out the door, and the brand is hot.`, '\u{1F525}', 'good')
    } else {
      b.brand = clampN(b.brand + 5, 0, 100)
      b.demandShock = Math.max(b.demandShock, 1.08)
      tell(g, 'Staying Humble', `You thanked the reviewer and kept doing what you do. Customers love it.`, '\u{1F64F}', 'good')
    }
    return
  }
  if (choice === 'apologize') {
    b.brand = clampN(b.brand - 2, 0, 100)
    b.demandShock = Math.min(b.demandShock, 0.97)
    tell(g, 'Public Apology', `Your heartfelt apology got almost as many views as the complaint. Most people moved on.`, '\u{1F64F}')
  } else if (choice === 'fight') {
    if (chance(g, 0.4)) {
      b.brand = clampN(b.brand + 6, 0, 100)
      tell(g, 'Clapback Won', `Your savage reply went even more viral than the original review. The internet is on your side. For now.`, '\u{1F525}', 'good')
    } else {
      b.brand = clampN(b.brand - 14, 0, 100)
      b.demandShock = Math.min(b.demandShock, 0.88)
      tell(g, 'Clapback Backfired', `You argued with a customer online. You lost. ${a.name} is now a meme, and not the good kind.`, '\u{1F4A9}', 'bad')
    }
  } else {
    b.brand = clampN(b.brand - 6, 0, 100)
    b.demandShock = Math.min(b.demandShock, 0.94)
    tell(g, 'Ignored It', `You ignored the review. The comment section did not ignore it.`, '\u{1F648}', 'bad')
  }
})

function presentViral(g: GameState, a: Asset, b: BizState): void {
  const good = chance(g, clampN(b.quality / 100, 0.15, 0.85))
  const def = industryDef(b.industry)
  const text = good
    ? `A food-and-lifestyle creator with millions of followers posted a glowing review of ${a.name}. "${pick(g, ['Best', 'Most underrated', 'Most life-changing'])} ${def.unitOne} in ${b.city}," apparently.`
    : `Someone posted a furious review of ${a.name} that went viral: "${pick(g, ['Worst experience of my life', 'Rude staff and a smell I cannot describe', 'I want my money AND my time back', 'Zero stars if I could'])}."`
  const choices: ChoiceOption[] = good
    ? [
        { id: 'ride', label: 'Pour money into ads while it’s hot', emoji: '\u{1F4E3}' },
        { id: 'humble', label: 'Say thanks and stay humble', emoji: '\u{1F64F}' },
      ]
    : [
        { id: 'apologize', label: 'Apologize publicly', emoji: '\u{1F64F}' },
        { id: 'fight', label: 'Fire back online', emoji: '\u{1F525}' },
        { id: 'ignore', label: 'Ignore it', emoji: '\u{1F648}' },
      ]
  scriptChoice(g, VIRAL, good ? 'Gone Viral!' : 'Viral Review', text, choices, { emoji: '\u{1F4F1}', data: { assetId: a.id, good } })
}

// ---------------------------------------------------------------------------
// Competitor opens next door

const COMPETITOR = defineScript('business.ev.competitor', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { b } = x
  if (choice === 'priceWar') {
    b.price = Math.max(0.01, Math.round(b.price * 0.88 * 100) / 100)
    b.pressure = Math.max(b.pressure, 0.1)
    tell(g, 'Price War', `You cut prices 12% to keep your regulars. Margins hurt, but so do theirs.`, '\u{2694}\u{FE0F}')
  } else if (choice === 'quality') {
    const cost = pay(b, scaled(b, 8_000))
    b.quality = clampN(b.quality + 8, 0, 100)
    b.pressure = Math.max(b.pressure, 0.14)
    tell(g, 'Better, Not Cheaper', `You spent ${formatMoney(cost)} upgrading everything customers can see and taste. Quality is up to ${b.quality}%.`, '\u{2728}', 'good')
  } else {
    b.pressure = Math.max(b.pressure, 0.24)
    tell(g, 'Business as Usual', `You ignored the new place. Some of your customers did not.`, '\u{1F937}')
  }
})

function presentCompetitor(g: GameState, a: Asset, b: BizState): void {
  const def = industryDef(b.industry)
  const words = marketOf(b.countryId).nameWords
  const rival = `${words.length ? pick(g, words) : randomLastName(g, b.countryId)} ${pick(g, def.suffixes)}`
  scriptChoice(
    g,
    COMPETITOR,
    'New Competition',
    `${rival} just opened a shiny new ${def.site} right across the street from ${a.name} in ${b.city}, with an opening-week discount and a guy in a mascot suit.`,
    [
      { id: 'priceWar', label: 'Start a price war', emoji: '\u{2694}\u{FE0F}' },
      { id: 'quality', label: `Out-class them (~${money(scaled(b, 8_000))})`, emoji: '\u{2728}' },
      { id: 'ignore', label: 'Ignore them', emoji: '\u{1F937}' },
    ],
    { emoji: '\u{1F3EA}', data: { assetId: a.id } },
  )
}

// ---------------------------------------------------------------------------
// Supplier price spike

const SUPPLIER = defineScript('business.ev.supplier', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { b } = x
  const spike = num(x.d.spike, 1.15)
  if (choice === 'switch') {
    b.supplier = 'budget'
    b.quality = clampN(b.quality - 6, 0, 100)
    tell(g, 'Cheaper Supplier', `You switched to a budget supplier. Costs are down; so is quality (${b.quality}%). Customers may notice.`, '\u{1F4E6}')
  } else if (choice === 'contract') {
    if (chance(g, clampN(0.25 + ceoSkill(g, b) / 150 + 0.1 * staffPower(b, 'finance'), 0.1, 0.9))) {
      b.costShock = 0.97
      tell(g, 'Locked In', `You negotiated a three-year fixed-price contract before the increase kicked in. Your competitors are paying full price.`, '\u{1F4DD}', 'good')
    } else {
      b.costShock = Math.max(b.costShock, spike - 0.04)
      tell(g, 'No Deal', `The supplier laughed politely and raised your prices anyway.`, '\u{1F4DD}', 'bad')
    }
  } else {
    b.costShock = Math.max(b.costShock, spike)
    tell(g, 'Eating the Cost', `You'll absorb the higher input costs next year (+${Math.round((spike - 1) * 100)}%).`, '\u{1F4B8}', 'bad')
  }
})

function presentSupplier(g: GameState, a: Asset, b: BizState): void {
  const def = industryDef(b.industry)
  const spike = Math.round((1.08 + rand(g) * 0.17 + Math.min(0.15, marketOf(b.countryId).inflation * 0.2)) * 100) / 100
  const why = def.costCat === 'fuel' ? 'fuel prices spiked' : def.costCat === 'food' ? 'a bad harvest sent ingredient prices soaring' : def.costCat === 'alcohol' ? 'a new excise duty landed on everything you pour' : 'a global shortage hit your parts and materials'
  const choices: ChoiceOption[] = [
    { id: 'absorb', label: `Absorb the cost (+${Math.round((spike - 1) * 100)}%)`, emoji: '\u{1F4B8}' },
    { id: 'contract', label: 'Negotiate a long-term contract', emoji: '\u{1F4DD}' },
  ]
  if (b.supplier !== 'budget') choices.push({ id: 'switch', label: 'Switch to a cheaper supplier', emoji: '\u{1F4E6}' })
  scriptChoice(g, SUPPLIER, 'Supplier Price Hike', `Your main supplier says ${why}: prices go up ${Math.round((spike - 1) * 100)}% next year.`, choices, { emoji: '\u{1F69A}', data: { assetId: a.id, spike } })
}

// ---------------------------------------------------------------------------
// Currency / inflation shock (volatile markets)

const CURRENCY = defineScript('business.ev.currency', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { b } = x
  const m = marketOf(b.countryId)
  b.costShock = Math.max(b.costShock, 1.1)
  if (choice === 'raise') {
    b.brand = clampN(b.brand - 3, 0, 100)
    tell(g, 'Prices Up', `You repriced everything overnight. Customers grumbled, but they grumble at everyone.`, '\u{1F3F7}\u{FE0F}')
  } else if (choice === 'hold') {
    b.price = Math.max(0.01, Math.round(b.price * 0.85 * 100) / 100)
    b.brand = clampN(b.brand + 6, 0, 100)
    tell(g, 'Holding the Line', `You kept prices steady while everyone else hiked. Customers love you; your margins less so.`, '\u{1F6E1}\u{FE0F}', 'good')
  } else {
    const fee = pay(b, Math.max(0, b.cash) * 0.03)
    b.cash = Math.max(b.cash, 0)
    b.costShock = Math.max(1, b.costShock - 0.05)
    tell(g, 'Into Hard Currency', `You moved the company's ${m.currencyName} cash into dollars (${formatMoney(fee)} in fees and "fees"). Your cash should hold its value better.`, '\u{1F4B5}', 'good')
  }
})

function presentCurrency(g: GameState, a: Asset, b: BizState): void {
  const m = marketOf(b.countryId)
  scriptChoice(
    g,
    CURRENCY,
    'Currency Crash',
    `The ${m.currencyName} lost ${randInt(g, 15, 40)}% of its value in a week. Imported inputs cost more, shoppers are panic-buying and ${a.name}'s price tags are already out of date.`,
    [
      { id: 'raise', label: 'Raise prices immediately', emoji: '\u{1F3F7}\u{FE0F}' },
      { id: 'hold', label: 'Hold prices to win loyalty', emoji: '\u{1F6E1}\u{FE0F}' },
      { id: 'dollarize', label: 'Move company cash into dollars', emoji: '\u{1F4B5}' },
    ],
    { emoji: '\u{1F4C9}', data: { assetId: a.id } },
  )
}

// ---------------------------------------------------------------------------
// Celebrity endorsement

const CELEB = defineScript('business.ev.celebrity', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  if (choice !== 'sign') {
    tell(g, 'Passed', `You passed on ${str(x.d.celeb)}. ${pick(g, ['Probably for the best.', 'Their agent called you "small-time". You will live.'])}`, '\u{1F645}')
    return
  }
  const cost = pay(b, num(x.d.fee))
  if (chance(g, 0.15)) {
    b.brand = clampN(b.brand - 12, 0, 100)
    b.demandShock = Math.min(b.demandShock, 0.92)
    log(g, `Our celebrity spokesperson got ${a.name} dragged into a scandal.`, 'bad')
    tell(g, 'Scandal!', `Two weeks after the ${formatMoney(cost)} campaign launched, ${str(x.d.celeb)} was caught in a scandal. Your logo is in every photo.`, '\u{1F4F8}', 'bad')
    return
  }
  b.brand = clampN(b.brand + 11, 0, 100)
  b.demandShock = Math.max(b.demandShock, 1.12)
  log(g, `${str(x.d.celeb)} became the face of ${a.name}.`, 'good')
  tell(g, 'Star Power', `${str(x.d.celeb)} is now the face of ${a.name} (${formatMoney(cost)}). Sales are already up.`, '\u{1F31F}', 'good')
})

function presentCelebrity(g: GameState, a: Asset, b: BizState): void {
  const gender = chance(g, 0.5) ? 'male' : 'female'
  const celeb = `${randomFirstName(g, b.countryId, gender)} ${randomLastName(g, b.countryId)}`
  const what = pick(g, ['the pop star', 'the reality-TV star', 'the soap actor', `the national ${pick(g, ['football', 'tennis', 'boxing', 'chess'])} champion`, 'the cooking-show host'])
  const fee = scaled(b, 25_000)
  scriptChoice(
    g,
    CELEB,
    'Celebrity Endorsement',
    `${celeb}, ${what}, wants to be the face of ${a.name} for ${formatMoney(fee)}.`,
    [
      { id: 'sign', label: `Sign the deal (${money(fee)})`, emoji: '\u{270D}\u{FE0F}' },
      { id: 'pass', label: 'Pass', emoji: '\u{1F645}' },
    ],
    { emoji: '\u{1F31F}', data: { assetId: a.id, celeb, fee } },
  )
}

// ---------------------------------------------------------------------------
// Lawsuit

const CLAIMS: Record<string, string[]> = {
  food: ['says they found a tooth in their sandwich (not theirs)', 'slipped on a freshly mopped floor and is "never walking the same again"', 'claims your hot sauce was "unreasonably hot"'],
  gym: ['dropped a dumbbell on their own foot and blames the lighting', 'says the treadmill "launched" them'],
  software: ['says a bug deleted their entire business', 'claims your app leaked their data'],
  default: ['says your product ruined their wedding', 'claims your sign fell on their car', 'slipped on the entrance mat and lawyered up'],
}

const LAWSUIT = defineScript('business.ev.lawsuit', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const claim = num(x.d.claim)
  if (choice === 'settle') {
    const cost = pay(b, claim * 0.5)
    tell(g, 'Settled', `${a.name} settled out of court for ${formatMoney(cost)}, without admitting anything, obviously.`, '\u{1F4DD}')
    return
  }
  const fees = pay(b, claim * 0.15)
  if (chance(g, clampN(0.35 + ceoSkill(g, b) / 250 + b.quality / 400, 0.15, 0.85))) {
    count(g, 'lawsuitsWon')
    tell(g, 'Case Dismissed', `The judge threw the case out. ${a.name} only lost ${formatMoney(fees)} in legal fees and a little faith in humanity.`, '\u{2696}\u{FE0F}', 'good')
  } else {
    const damages = pay(b, claim * 1.4)
    b.brand = clampN(b.brand - 4, 0, 100)
    log(g, `${a.name} lost a lawsuit.`, 'bad')
    tell(g, 'Lost in Court', `The jury sided with the plaintiff. Damages: ${formatMoney(damages)}, plus ${formatMoney(fees)} in legal fees.`, '\u{2696}\u{FE0F}', 'bad')
  }
})

function presentLawsuit(g: GameState, a: Asset, b: BizState): void {
  const def = industryDef(b.industry)
  const pool = def.food ? CLAIMS.food : b.industry === 'gym' ? CLAIMS.gym : b.industry === 'software' || b.industry === 'gameStudio' ? CLAIMS.software : CLAIMS.default
  const claim = scaled(b, 30_000)
  scriptChoice(
    g,
    LAWSUIT,
    'You’re Being Sued',
    `A customer ${pick(g, pool)} and is suing ${a.name} for ${formatMoney(claim)}.`,
    [
      { id: 'settle', label: `Settle (~${money(claim * 0.5)})`, emoji: '\u{1F4DD}' },
      { id: 'fight', label: 'Fight it in court', emoji: '\u{2696}\u{FE0F}' },
    ],
    { emoji: '\u{2696}\u{FE0F}', data: { assetId: a.id, claim } },
  )
}

// ---------------------------------------------------------------------------
// Embezzlement

const EMBEZZLE = defineScript('business.ev.embezzle', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  log(g, `I caught an embezzler at ${a.name}.`, 'bad')
  const amount = num(x.d.amount)
  const id = str(x.d.staffId)
  const who = str(x.d.who, 'your bookkeeper')
  if (choice === 'second') {
    addHidden(g, 'karma', 3)
    const s = b.staff.find((y) => y.id === id)
    if (s) s.trait = 'shady'
    tell(g, 'Second Chance', `You gave ${who} a second chance and a very stern look. Fingers crossed.`, '\u{1F91E}')
    return
  }
  b.staff = b.staff.filter((y) => y.id !== id)
  if (choice === 'press') {
    const back = Math.round(amount * (0.3 + rand(g) * 0.4))
    b.cash += back
    b.yearIncome += back
    tell(g, 'Charges Pressed', `${who} was fired and charged. The court ordered ${formatMoney(back)} paid back; the rest is "gone".`, '\u{1F46E}', 'good')
  } else {
    tell(g, 'Quietly Fired', `You fired ${who} quietly to avoid a scandal. The ${formatMoney(amount)} is gone for good.`, '\u{1F92B}')
  }
})

function presentEmbezzle(g: GameState, a: Asset, b: BizState): void {
  const suspects = b.staff.filter((s) => s.focus === 'finance' || traitOf(s.trait).risk >= 1)
  const s: KeyStaff | undefined = suspects.length ? pick(g, suspects) : undefined
  const who = s ? `${s.firstName} ${s.lastName}, your ${s.role}` : `${randomFirstName(g, b.countryId, chance(g, 0.5) ? 'male' : 'female')}, a shift supervisor`
  const amount = Math.round(Math.min(Math.max(1_000, (b.last?.revenue ?? 0) * (0.01 + rand(g) * 0.04)), Math.max(1_000, Math.abs(b.cash) * 0.5 + 1_000)))
  b.cash -= amount
  scriptChoice(
    g,
    EMBEZZLE,
    'Embezzler!',
    `An audit of the accounts revealed that ${who} has been quietly skimming money: ${formatMoney(amount)} so far, mostly spent on ${pick(g, ['a jet ski', 'crypto that went to zero', 'designer sneakers', 'a racehorse named after themselves'])}.`,
    [
      { id: 'press', label: 'Fire them and press charges', emoji: '\u{1F46E}' },
      { id: 'quiet', label: 'Fire them quietly', emoji: '\u{1F92B}' },
      { id: 'second', label: 'Give them a second chance', emoji: '\u{1F91E}' },
    ],
    { emoji: '\u{1F4B0}', data: { assetId: a.id, amount, staffId: s?.id ?? '', who: s ? `${s.firstName} ${s.lastName}` : 'the supervisor' } },
  )
}

// ---------------------------------------------------------------------------
// Buyout offer

const BUYOUT = defineScript('business.ev.buyout', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const offer = num(x.d.offer)
  const buyer = str(x.d.buyer, 'an investor')
  if (choice === 'accept') {
    sellBusiness(g, a, b, offer, buyer)
    return
  }
  if (choice === 'counter') {
    if (chance(g, 0.5)) {
      sellBusiness(g, a, b, Math.round(offer * 1.15), buyer)
    } else {
      tell(g, 'They Walked', `${buyer} said your counteroffer was "ambitious" and walked away.`, '\u{1F6B6}')
    }
    return
  }
  tell(g, 'Not for Sale', `You told ${buyer} that ${a.name} is not for sale. They said to call if you change your mind.`, '\u{1F645}')
})

function presentBuyout(g: GameState, a: Asset, b: BizState): void {
  const buyer = chance(g, 0.5) ? investorFirm(b.countryId, rand(g), rand(g)) : conglomerate(rand(g), rand(g))
  const offer = Math.round(Math.max(b.valuation, 10_000) * (1.1 + rand(g) * 0.4))
  const stake = b.share < 1 ? ` (your ${Math.round(b.share * 100)}% would be ${money(offer * b.share)})` : ''
  scriptChoice(
    g,
    BUYOUT,
    'Buyout Offer',
    `${buyer} wants to buy ${a.name} outright for ${formatMoney(offer)}${stake}. Your accountant estimates it is worth about ${money(b.valuation)}.`,
    [
      { id: 'accept', label: 'Accept', emoji: '\u{1F91D}' },
      { id: 'counter', label: 'Counter 15% higher', emoji: '\u{1F4C8}' },
      { id: 'decline', label: 'Decline', emoji: '\u{1F645}' },
    ],
    { emoji: '\u{1F4BC}', data: { assetId: a.id, offer, buyer } },
  )
}

// ---------------------------------------------------------------------------
// Disaster

const QUAKE = new Set(['jp', 'cl', 'tr', 'ir', 'nz', 'mx', 'id', 'ph', 'pe', 'ec', 'gr', 'it', 'tw', 'np', 'af', 'pk', 'gt', 'sv', 'ht', 'cn'])
const STORM = new Set(['bs', 'cu', 'do', 'jm', 'ht', 'pr', 'aw', 'bz', 'ph', 'bd', 'tw', 'hk', 'vn', 'us', 'mx', 'ws', 'pg', 'ni', 'gt'])

const DISASTER = defineScript('business.ev.disaster', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const damage = num(x.d.damage)
  const loss = num(x.d.loss, 0.3)
  const covered = b.insured ? Math.round(damage * 0.85) : 0
  if (covered) {
    b.cash += covered
    b.yearIncome += covered
  }
  if (choice === 'fast') {
    pay(b, damage * 1.2)
    b.capacityLoss = Math.max(b.capacityLoss, loss / 2)
  } else {
    pay(b, damage)
    b.capacityLoss = Math.max(b.capacityLoss, loss)
  }
  log(g, `${a.name} was hit by a disaster and had to close for repairs.`, 'bad')
  tell(
    g,
    'Rebuilding',
    `${choice === 'fast' ? `Rush crews are working around the clock (${formatMoney(damage * 1.2)}).` : `Repairs will cost ${formatMoney(damage)} and take a while.`} ${covered ? `Insurance paid out ${formatMoney(covered)}.` : 'You had no business insurance, so it all comes out of company cash.'}`,
    '\u{1F3D7}\u{FE0F}',
    covered ? 'neutral' : 'bad',
  )
})

function presentDisaster(g: GameState, a: Asset, b: BizState): void {
  const site = `your ${industryDef(b.industry).site} in ${b.city}`
  const what =
    QUAKE.has(b.countryId) && chance(g, 0.5)
      ? `An earthquake cracked the walls of ${site}.`
      : STORM.has(b.countryId) && chance(g, 0.5)
        ? `A hurricane tore the roof off ${site}.`
        : pick(g, [`A kitchen fire gutted the back of ${site}.`, `A burst water main flooded ${site}.`, `Lightning fried the electrics at ${site}.`, `A runaway delivery truck crashed into ${site}.`])
  const damage = Math.round(equipmentValue(b) * (0.12 + rand(g) * 0.25) / Math.max(1, Math.sqrt(totalOutlets(b))))
  const loss = Math.round((0.25 + rand(g) * 0.3) / Math.max(1, Math.sqrt(totalOutlets(b))) * 100) / 100
  scriptChoice(
    g,
    DISASTER,
    'Disaster!',
    `${what} Nobody was hurt, but it's closed until it is repaired (damage: ${formatMoney(damage)}).${b.insured ? ' Thank goodness for the insurance.' : ''}`,
    [
      { id: 'fast', label: 'Pay extra to rebuild fast', emoji: '\u{1F3CE}\u{FE0F}' },
      { id: 'normal', label: 'Rebuild at normal speed', emoji: '\u{1F6A7}' },
    ],
    { emoji: '\u{1F525}', data: { assetId: a.id, damage, loss } },
  )
}

// ---------------------------------------------------------------------------
// Little ones: taco Tuesday, a poached star

const TACOS = defineScript('business.ev.tacos', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { b } = x
  if (choice === 'yes') {
    const cost = pay(b, num(x.d.cost))
    b.morale = clampN(b.morale + 8, 0, 100)
    addStat(g, 'happiness', 2)
    tell(g, num(x.d.kind) === 0 ? 'Taco Tuesday!' : 'Pizza Friday!', `You treated everyone (${formatMoney(cost)}). Morale is up to ${b.morale}%, and somebody wrote you a thank-you song.`, '\u{1F32E}', 'good')
  } else {
    b.morale = clampN(b.morale - 4, 0, 100)
    tell(g, 'Request Denied', `You said no. A passive-aggressive note about "company culture" appeared on the fridge.`, '\u{1F4DD}')
  }
})

function presentTacos(g: GameState, a: Asset, b: BizState): void {
  const kind = chance(g, 0.5) ? 0 : 1
  const cost = Math.round(Math.max(1, b.employees + b.staff.length) * 15 * localEcon(b.industry, b.countryId, b.city).level)
  scriptChoice(g, TACOS, 'A Humble Request', `The staff at ${a.name} have started a petition asking for ${kind === 0 ? 'Taco Tuesday' : 'Pizza Friday'}. It has more signatures than there are employees.`, [
    { id: 'yes', label: `Make it happen (${money(cost)})`, emoji: kind === 0 ? '\u{1F32E}' : '\u{1F355}' },
    { id: 'no', label: 'Say no', emoji: '\u{1F645}' },
  ], { emoji: '\u{1F4CB}', data: { assetId: a.id, cost, kind } })
}

const POACHED = defineScript('business.ev.poached', (g, choice, data) => {
  const x = ctx(g, data)
  if (!x) return
  const { a, b } = x
  const s = b.staff.find((y) => y.id === str(x.d.staffId))
  if (!s) return
  if (choice === 'counter') {
    s.salary = Math.round(s.salary * 1.25)
    s.morale = clampN(s.morale + 12, 0, 100)
    tell(g, 'Counteroffer', `${s.firstName} stays, now at ${formatMoney(s.salary)} a year. Loyalty has a price, and that's it.`, '\u{1F4B5}', 'good')
  } else {
    b.staff = b.staff.filter((y) => y.id !== s.id)
    log(g, `${s.firstName} ${s.lastName} left ${a.name} for a competitor.`, 'neutral')
    tell(g, 'Gone', `${s.firstName} ${s.lastName} left for the competition. You wished them well through gritted teeth.`, '\u{1F44B}')
  }
})

function presentPoached(g: GameState, a: Asset, b: BizState): void {
  const s = pick(g, b.staff)
  scriptChoice(g, POACHED, 'Poaching Attempt', `A competitor offered ${s.firstName} ${s.lastName}, your ${s.role}, 25% more money to jump ship.`, [
    { id: 'counter', label: `Match it (+${money(s.salary * 0.25)}/yr)`, emoji: '\u{1F4B5}' },
    { id: 'letGo', label: 'Let them go', emoji: '\u{1F44B}' },
  ], { emoji: '\u{1F3A3}', data: { assetId: a.id, staffId: s.id } })
}

// ---------------------------------------------------------------------------
// Picking an event

interface BizEvent {
  id: string
  weight: (g: GameState, b: BizState) => number
  present: (g: GameState, a: Asset, b: BizState) => void
}

const EVENTS: BizEvent[] = [
  { id: 'inspection', weight: (_g, b) => (industryDef(b.industry).food ? 1.2 : 0), present: presentInspection },
  { id: 'audit', weight: (_g, b) => 0.4 + redTape(b.countryId) * 0.8 + b.cooked * 1.5, present: presentAudit },
  { id: 'strike', weight: (_g, b) => (b.morale < 40 ? ((40 - b.morale) / 15) * (0.4 + unionStrength(b.countryId)) : 0), present: presentStrike },
  // Game studios get their own versions of these (business/gamestudio.ts: streamers, review bombs, publisher bids).
  { id: 'viral', weight: (_g, b) => (b.industry === 'gameStudio' ? 0 : 0.6), present: presentViral },
  { id: 'competitor', weight: (_g, b) => (b.industry === 'gameStudio' ? 0 : 0.7), present: presentCompetitor },
  { id: 'supplier', weight: (_g, b) => (b.industry === 'gameStudio' ? 0 : 0.5 + (industryDef(b.industry).costCat ? 0.3 : 0)), present: presentSupplier },
  { id: 'currency', weight: (_g, b) => (marketOf(b.countryId).inflation >= 0.15 ? 0.9 : 0), present: presentCurrency },
  { id: 'celebrity', weight: (_g, b) => 0.2 + b.brand / 250, present: presentCelebrity },
  { id: 'lawsuit', weight: () => 0.4, present: presentLawsuit },
  { id: 'embezzle', weight: (_g, b) => 0.2 + b.staff.reduce((s, x) => s + (traitOf(x.trait).risk >= 1 ? 0.3 : 0), 0), present: presentEmbezzle },
  { id: 'buyout', weight: (_g, b) => (b.valuation > 0 && !b.public && b.industry !== 'gameStudio' ? 0.35 : 0), present: presentBuyout },
  { id: 'disaster', weight: (_g, b) => (QUAKE.has(b.countryId) || STORM.has(b.countryId) ? 0.3 : 0.2), present: presentDisaster },
  { id: 'tacos', weight: (_g, b) => (b.employees + b.staff.length >= 4 ? 0.3 : 0), present: presentTacos },
  { id: 'poached', weight: (_g, b) => (b.staff.length > 0 ? 0.35 : 0), present: presentPoached },
]

/** Maybe queue one event for this business (returns true when one was queued). */
export function maybeBusinessEvent(g: GameState, a: Asset, b: BizState, year: number, managed: boolean): boolean {
  if (g.character.prison || !g.character.alive) return false
  if (b.founded >= year) return false
  if (b.lastEvent >= year - 1 && !chance(g, 0.3)) return false
  if (!chance(g, managed ? 0.18 : 0.3)) return false
  const options = EVENTS.filter((e) => e.weight(g, b) > 0)
  if (options.length === 0) return false
  const ev = weightedPick(g, options, (e) => e.weight(g, b))
  b.lastEvent = year
  ev.present(g, a, b)
  return true
}
