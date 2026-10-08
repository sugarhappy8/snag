// Buying, checking, servicing, insuring and selling brand pieces: the deal logic behind the
// boutique, pre-owned dealer, gray-market and auction channels. Offers are seeded per life, year
// and line (stable all year, never touching g.rng); only the moment of purchase or sale rolls
// the dice (a counterfeit, an allocation, a hammer price).
import { nicePrice, seeded, yearKey } from '../assets'
import { addHidden, addMoney, addStat, count, formatMoney, hasLicense, log, notice, remember, spend } from '../core'
import { brandName } from '../data/brands'
import { hasTech } from '../history/timeline'
import { chance, pick, randInt, uid } from '../rng'
import type { Asset, GameState, Json } from '../types'
import { getCountry } from '../world'
import { alcoholBlock, inProduction, isAlcohol, lineOnSale, lineTitle, localMult, quoteNew, tierReason } from './luxury-brands-catalog'
import type { LuxLine } from './luxury-brands-types'
import {
  authCost,
  authOf,
  type Channel,
  conditionFactor,
  def,
  fakeOdds,
  FAKE_VALUE,
  insurePremium,
  isFake,
  marketValue,
  mktOf,
  runAuction,
  scarcePremium,
  serviceCost,
  syncValue,
  usedMarket,
} from './luxury-brands-value'
import { cantAfford, capitalize, luxuryBlock, num, obj, serviceMult, str, strList } from './luxury-common'

// ---------------------------------------------------------------------------
// The book: what the houses know about you (plain JSON in g.flags)

const BOOK = 'lux.b'

interface Book {
  /** Lifetime spend at each brand's own boutiques (builds allocation odds). */
  hist: Record<string, number>
  /** Last year you asked for an allocation of a line. */
  alloc: Record<string, number>
  /** Listing ids sold this year (`<year>:...`). */
  sold: string[]
}

export function readBook(g: GameState): Book {
  const o = obj(g.flags[BOOK])
  const hist: Record<string, number> = {}
  const alloc: Record<string, number> = {}
  const h = obj(o?.hist)
  if (h) for (const [k, v] of Object.entries(h)) if (typeof v === 'number' && Number.isFinite(v)) hist[k] = v
  const al = obj(o?.alloc)
  if (al) for (const [k, v] of Object.entries(al)) if (typeof v === 'number' && Number.isFinite(v)) alloc[k] = v
  return { hist, alloc, sold: strList(o?.sold as Json | undefined).filter((x) => x.startsWith(`${g.year}:`)) }
}

function writeBook(g: GameState, b: Book): void {
  g.flags[BOOK] = { hist: b.hist, alloc: b.alloc, sold: b.sold }
}

// ---------------------------------------------------------------------------
// Why you can't

export function licenseNeeded(l: LuxLine): 'boating' | 'pilot' | null {
  if (l.cat === 'boat') return l.usd < 1_500_000 ? 'boating' : null
  if (l.cat === 'air') return 'pilot'
  return null
}

function licenseName(lic: string): string {
  return lic === 'pilot' ? "a pilot's license" : "a boating license"
}

/** Why the player can't buy this line at all right now (null = fine). */
export function buyBlock(g: GameState, l: LuxLine): string | null {
  const b = luxuryBlock(g)
  if (b) return b
  const t = tierReason(g, l.tier)
  if (t) return t
  if (isAlcohol(l.cat)) {
    const a = alcoholBlock(g)
    if (a) return a
  }
  const lic = licenseNeeded(l)
  if (lic && !hasLicense(g, lic)) return `You need ${licenseName(lic)} to own one. Get it from Activities, Licenses.`
  return null
}

// ---------------------------------------------------------------------------
// Offers

export interface Offer {
  channel: Channel
  /** Unique within the year: the listing that disappears when bought. */
  id: string
  label: string
  /** The price at the till (consumption and luxury tax included). */
  price: number
  /** Travel to the nearest boutique, where there is no online shop and no flagship in the city. */
  trip: number
  /** Market value (mint condition) of the piece if it is genuine. */
  mkt0: number
  /** The pre-tax price the value is anchored to. */
  basis: number
  used: boolean
  age: number
  condition: number
  fakeOdds: number
  /** True for allocation-only pieces: the price is the retail one, the odds are the problem. */
  allocation: boolean
  note: string
}

/** The boutique reach: a flagship in a big city, the web shop, or a trip. */
export function reachTrip(g: GameState, l: LuxLine, price: number): number {
  if (l.cat === 'car' || l.cat === 'moto' || l.cat === 'boat' || l.cat === 'air' || l.cat === 'wine' || l.cat === 'spirit') return 0
  if (hasTech(g, 'onlineShopping')) return 0
  const country = getCountry(g.character.countryId)
  if (country.cities.slice(0, 4).includes(g.character.city)) return 0
  return nicePrice(Math.max(150, price * 0.008) * serviceMult(g))
}

export function allocationOdds(g: GameState, l: LuxLine, price: number): number {
  const spent = readBook(g).hist[l.brand] ?? 0
  const share = Math.min(1, spent / Math.max(1, price * 3))
  return Math.round((0.12 + 0.55 * share) * 100) / 100
}

export function isScarceNow(l: LuxLine, year: number): boolean {
  return l.scarce !== undefined && year >= l.scarce && inProduction(l, year)
}

function gone(g: GameState, id: string): boolean {
  return readBook(g).sold.includes(id)
}

/** Every way to buy this line (and configuration) this year. Stable within a year. */
export function offersFor(g: GameState, l: LuxLine, variantIdx = 0): Offer[] {
  const out: Offer[] = []
  if (!lineOnSale(g, l)) return out
  const vm = l.variants?.[variantIdx]?.[1] ?? 1
  const year = g.year
  const cd = def(l.cls)
  const scarce = isScarceNow(l, year)

  if (inProduction(l, year)) {
    const q = quoteNew(g, l, variantIdx)
    const mkt0 = q.basis * cd.instant * (scarce ? 1 + scarcePremium(l.cls) : 1)
    const id = `${year}:${l.id}:${variantIdx}:boutique`
    if (!gone(g, id)) {
      out.push({
        channel: 'boutique',
        id,
        label: l.cat === 'car' || l.cat === 'moto' ? 'Buy new from the dealer' : 'Buy new at the boutique',
        price: q.price,
        trip: reachTrip(g, l, q.price),
        mkt0,
        basis: q.basis,
        used: false,
        age: 0,
        condition: 100,
        fakeOdds: 0,
        allocation: scarce,
        note: q.luxuryTax > 0 ? `Includes ${formatMoney(q.luxuryTax)} of luxury tax.` : '',
      })
    }
  }

  const r = seeded(yearKey(g, `lux:used:${l.id}:${variantIdx}`))
  const maxAge = Math.max(0, year - l.from)
  const retired = l.until !== undefined && year > l.until
  let age = retired ? Math.max(1, year - (l.until ?? year)) + r.int(0, 2) : r.int(2, 7)
  age = Math.min(age, Math.max(1, maxAge))
  if (retired || maxAge >= 2) {
    // A certified dealer sells pieces he has checked over (no scruffy bargains to service and flip).
    const condition = r.int(70, 96)
    const variance = r.float(0.93, 1.08)
    // Where luxury is cheaper than the world price, a used piece is worth that local price too (never
    // a cheap buy that resells at the world price); where it is dearer, the premium is just paid.
    const lf = 0.5 + 0.5 * localMult(g, l)
    let mkt0 = usedMarket(l, year, age, vm) * variance * Math.min(1, lf)
    if (scarce && l.collect === undefined) mkt0 *= 1 + scarcePremium(l.cls)
    const ask = mkt0 * conditionFactor(condition)
    const id = `${year}:${l.id}:${variantIdx}:preowned`
    if (!gone(g, id)) {
      out.push({
        channel: 'preowned',
        id,
        label: l.cat === 'car' || l.cat === 'moto' ? 'Buy a used one from a specialist' : 'Buy pre-owned from a certified dealer',
        price: nicePrice(ask * 1.1 * Math.max(1, lf)),
        trip: 0,
        mkt0,
        basis: mkt0,
        used: true,
        age,
        condition,
        fakeOdds: fakeOdds(g, l.cls, 'preowned'),
        allocation: false,
        note: scarce ? 'Allocation-only pieces cost more here, but no waiting list.' : `About ${age} years old, ${condition}% condition. The dealer's margin is built in.`,
      })
    }
    if (cd.gray > 0 && l.collect === undefined && !isAlcohol(l.cat)) {
      const rg = seeded(yearKey(g, `lux:gray:${l.id}:${variantIdx}`))
      const gcond = rg.int(60, 95)
      const gvar = rg.float(0.93, 1.06)
      const gmkt = usedMarket(l, year, Math.max(1, age), vm) * gvar * (scarce ? 1 + scarcePremium(l.cls) : 1)
      const discount = rg.float(0.88, 0.97)
      const gid = `${year}:${l.id}:${variantIdx}:gray`
      if (!gone(g, gid)) {
        out.push({
          channel: 'gray',
          id: gid,
          label: hasTech(g, 'onlineShopping') ? 'Buy from an online marketplace seller' : year >= 1950 ? 'Buy from a back-room dealer' : 'Buy from a market stall',
          price: nicePrice(gmkt * conditionFactor(gcond) * discount),
          trip: 0,
          mkt0: gmkt,
          basis: gmkt,
          used: true,
          age: Math.max(1, age),
          condition: gcond,
          fakeOdds: fakeOdds(g, l.cls, 'gray'),
          allocation: false,
          note: 'Cheaper, with no papers worth the name. Nobody guarantees it is real.',
        })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Creating the asset

function vintageOf(offer: Offer, year: number): number {
  return offer.used ? year - offer.age : year - 1
}

const COLORS = ['Black', 'White', 'Silver', 'Red', 'Blue', 'Gray', 'Green', 'British Racing Green', 'Yellow', 'Midnight Blue', 'Champagne', 'Burgundy']

export function buildAsset(g: GameState, l: LuxLine, variantIdx: number, offer: Offer, fake: boolean): Asset {
  const variant = l.variants?.[variantIdx]?.[0] ?? ''
  const year = g.year
  const title = lineTitle(l)
  let name = variant && variantIdx > 0 ? `${title} (${variant})` : title
  const vintage = isAlcohol(l.cat) ? vintageOf(offer, year) : 0
  if (vintage) name = `${vintage} ${name}`
  const qty = l.variants?.[variantIdx]?.[0].toLowerCase().includes('case') ? 6 : 1
  const madeYear = offer.used ? year - offer.age : year
  const cd = def(l.cls)
  const details: Record<string, Json> = {
    lux: 1,
    line: l.id,
    brand: l.brand,
    cat: l.cat,
    cls: l.cls,
    variant,
    boughtYear: year,
    madeYear,
    used: offer.used ? 1 : 0,
    mkt: Math.round(offer.mkt0),
    basis: Math.round(offer.basis),
    auth: 'unknown',
    fo: offer.fakeOdds,
    lfake: fake,
    chan: offer.channel,
    serviced: year,
    luxIns: false,
    insured: false,
    isNew: !offer.used,
    category: l.cat === 'art' ? 'art' : 'luxbrand',
  }
  if (vintage) {
    details.vintage = vintage
    details.qty = qty
    details.qty0 = qty
  }
  if (l.cat === 'car') {
    details.make = brandName(l.brand)
    details.model = l.name
    details.modelYear = madeYear
    details.carType = l.carType ?? 'luxury'
    details.color = pick(g, COLORS)
    details.mileage = offer.used ? Math.round(offer.age * randInt(g, 3_000, 9_000)) : 12
  }
  if (l.cat === 'moto') {
    details.make = brandName(l.brand)
    details.model = l.name
    details.modelYear = madeYear
    details.color = pick(g, COLORS)
    details.mileage = offer.used ? Math.round(offer.age * randInt(g, 1_500, 5_000)) : 5
  }
  const lic = licenseNeeded(l)
  if (l.cat === 'boat' || l.cat === 'air') details.license = lic
  if (l.cat === 'jewelry') {
    details.quality = 100
    details.gem = null
    details.carats = 0
  }
  const asset: Asset = {
    id: uid(g, 'a'),
    kind: l.kind,
    name,
    emoji: l.emoji,
    purchasePrice: offer.price + offer.trip,
    value: 1,
    condition: offer.condition,
    purchasedAge: g.character.age,
    upkeep: 0,
    details,
  }
  syncValue(asset)
  if (cd.upkeep > 0) asset.upkeep = nicePrice(Math.max(100, marketValue(asset) * cd.upkeep))
  return asset
}

const QUIPS: Record<string, string[]> = {
  watch: ['It ticks with a confidence you have never had.', 'You checked the time eleven times on the way home.', 'The strap is stiff. So are you, from the excitement.'],
  handbag: ['The tissue paper alone feels like a gift.', 'You carried it like it contained a newborn.', 'You will not be putting it on the floor of any restaurant.'],
  fashion: ['The tailor made one tiny chalk mark and the whole thing fit.', 'You look like someone who has a lawyer on retainer.', 'It came in a box with its own box.'],
  eyewear: ['The world looks 40% cooler through them.', 'You wore them indoors, at night, on purpose.'],
  luggage: ['It rolls like a dream. Your holidays will have to match.', 'The first scratch will be the saddest and the best.'],
  jewelry: ['It sparkled all the way home.', 'The salesperson wore white gloves just to hand it to you.', 'You made the little box click open three times in the car.'],
  pen: ['You signed your name just to see it flow.', 'Your signature has never looked so important.'],
  fine: ['It is fragile and priceless-ish. You tiptoed past it for a week.', 'It looks great on the shelf and terrifying on a table.'],
  sneakers: ['You walked around the block just to be seen in them.', 'They are for the shelf. They are also for the street. You are torn.'],
  tech: ['It is beautiful and works exactly as expected, which feels unfair.', 'The unboxing was a ceremony.'],
  car: ['It started with a sound you could feel in your teeth.', 'The valet will remember you forever.', 'You drove the long way home. Twice.'],
  moto: ['The exhaust note scared a pigeon off a wire.', 'You wore the leathers to the garage. In the garage.'],
  boat: ['It looked like an advertisement for the lifestyle you now have.', 'The dock neighbors were suddenly very friendly.'],
  air: ['The hangar crew saluted. You returned it badly.', 'The logbook is empty and so, soon, will be your account.'],
  wine: ['You stored it lying down in the dark, like a sleeping prince.', 'It is not for drinking yet. It is for knowing you own it.'],
  spirit: ['The label alone cost more than your first car stereo.', 'You poured nothing. You just held the bottle.'],
  art: ['You hung it slightly crooked. It works.', 'The auctioneer called it a bold acquisition.'],
}

export function buyQuip(g: GameState, cat: string): string {
  return pick(g, QUIPS[cat] ?? QUIPS.watch)
}

/** Complete a purchase on a channel. Returns the asset or null (with a notice explaining why). */
export function buyOffer(g: GameState, l: LuxLine, variantIdx: number, channel: Channel): Asset | null {
  const block = buyBlock(g, l)
  if (block) {
    notice(g, 'Not Today', block, { emoji: l.emoji })
    return null
  }
  const offer = offersFor(g, l, variantIdx).find((o) => o.channel === channel)
  if (!offer) {
    notice(g, 'Sold', 'Someone with a faster assistant took that one this morning.', { emoji: '🏷️' })
    return null
  }
  const total = offer.price + offer.trip
  if (g.character.money < total) {
    cantAfford(g, total, lineTitle(l))
    return null
  }
  const book = readBook(g)
  if (offer.allocation) {
    if (book.alloc[l.id] === g.year) {
      notice(g, 'Waitlist', `You already asked about the ${lineTitle(l)} this year. The associate smiled and said "next year".`, { emoji: '🕰️' })
      return null
    }
    book.alloc[l.id] = g.year
    const odds = allocationOdds(g, l, offer.price)
    if (!chance(g, odds)) {
      writeBook(g, book)
      notice(g, 'Not This Year', `The associate was lovely and sorry. There is no ${lineTitle(l)} for you this year. A good history with ${brandName(l.brand)} and a bit of patience help: you are on the list. A pre-owned one is available at a premium.`, { emoji: '🕰️', tone: 'bad' })
      return null
    }
  }
  const fake = offer.fakeOdds > 0 && chance(g, offer.fakeOdds)
  if (!spend(g, total)) {
    cantAfford(g, total, lineTitle(l))
    return null
  }
  const asset = buildAsset(g, l, variantIdx, offer, fake)
  g.assets.push(asset)
  book.sold = [...book.sold, offer.id]
  if (channel === 'boutique') book.hist[l.brand] = Math.round((book.hist[l.brand] ?? 0) + offer.price)
  writeBook(g, book)
  count(g, 'purchases')
  count(g, 'luxBrands')
  addStat(g, 'happiness', offer.price >= 100_000 ? randInt(g, 5, 10) : offer.price >= 5_000 ? randInt(g, 3, 6) : randInt(g, 1, 3))
  remember(g, `Bought ${asset.name} for ${formatMoney(total)}.`)
  log(g, `I bought ${asset.name} for ${formatMoney(total)}.`, 'good')
  const where = channel === 'boutique' ? (offer.allocation ? 'The boutique called: your allocation came through.' : '') : channel === 'preowned' ? 'The dealer included a certificate of provenance.' : 'No certificate. The seller shrugged.'
  const trip = offer.trip > 0 ? ` The trip to the nearest boutique cost ${formatMoney(offer.trip)}.` : ''
  notice(g, 'Purchased!', `You bought ${asset.name} for ${formatMoney(total)}. ${where} ${buyQuip(g, l.cat)}${trip}${offer.note && channel === 'boutique' ? ` ${offer.note}` : ''}`.replace(/\s+/g, ' ').trim(), { emoji: l.emoji, tone: 'good' })
  return asset
}

// ---------------------------------------------------------------------------
// Authentication

function setFakeValues(a: Asset): void {
  a.details.auth = 'fake'
  a.details.cls = 'fake'
  a.details.mkt = Math.max(1, Math.round(num(a.details.basis, a.purchasePrice) * FAKE_VALUE))
  if (a.kind === 'jewelry') a.details.fake = true
  a.condition = Math.min(a.condition, 60)
  syncValue(a)
}

/** Reveal the truth about a piece (shared by the appraiser, a dealer's loupe and an embarrassing party). */
export function revealAuth(g: GameState, a: Asset): boolean {
  if (authOf(a) !== 'unknown') return authOf(a) === 'verified'
  if (isFake(a)) {
    setFakeValues(a)
    log(g, `My ${a.name} turned out to be a fake.`, 'bad')
    return false
  }
  a.details.auth = 'verified'
  syncValue(a)
  return true
}

export function authenticate(g: GameState, a: Asset): void {
  if (authOf(a) !== 'unknown') {
    notice(g, 'Already Checked', authOf(a) === 'verified' ? 'It already has its certificate.' : 'You already know it is a copy.', { emoji: '🔍' })
    return
  }
  const cost = authCost(a, serviceMult(g))
  if (!spend(g, cost)) {
    cantAfford(g, cost, 'an authentication')
    return
  }
  const real = revealAuth(g, a)
  if (real) {
    addStat(g, 'happiness', 2)
    notice(g, 'Certified Genuine', `The expert looked at ${a.name} through a loupe for ten minutes, nodded and signed the certificate (${formatMoney(cost)}). It is the real thing.`, { emoji: '✅', tone: 'good' })
  } else {
    addStat(g, 'happiness', -6)
    notice(g, 'It Is a Fake', `The expert was kind about it. ${a.name} is a counterfeit (${formatMoney(cost)} to find out). It is worth about ${formatMoney(a.value)} as a conversation piece. Next time, buy from an authorized seller, or pay for the check before you pay for the item.`, { emoji: '🕵️', tone: 'bad' })
  }
}

// ---------------------------------------------------------------------------
// Service, insurance

export function serviceAsset(g: GameState, a: Asset): void {
  const cost = serviceCost(a, serviceMult(g))
  if (!spend(g, cost)) {
    cantAfford(g, cost, 'the service')
    return
  }
  a.condition = Math.min(100, a.condition + 45)
  a.details.serviced = g.year
  syncValue(a)
  log(g, `I had my ${a.name} serviced.`)
  notice(g, 'Serviced', `${a.name} went to the specialists and came back running like new (${formatMoney(cost)}). Condition is now ${a.condition}%.`, { emoji: '🔧', tone: 'good' })
}

export function toggleInsurance(g: GameState, a: Asset): void {
  const on = a.details.luxIns === true
  a.details.luxIns = !on
  if (!on) notice(g, 'Insured', `${a.name} is insured for its market value. The premium is about ${formatMoney(insurePremium(a))} a year, and claims have a deductible of 5% of the value.`, { emoji: '🛡️', tone: 'good' })
  else notice(g, 'Policy Cancelled', `You cancelled the policy on ${a.name}. You are on your own now.`, { emoji: '🛡️' })
}

export function insuredNow(a: Asset): boolean {
  return a.details.luxIns === true || a.details.insured === true
}

// ---------------------------------------------------------------------------
// Selling

function removeAsset(g: GameState, a: Asset): void {
  g.assets = g.assets.filter((x) => x.id !== a.id)
}

/** The sale needs a certificate: a copy is spotted on the spot and nothing is sold. */
function gateAuth(g: GameState, a: Asset, who: string): boolean {
  if (authOf(a) === 'fake') {
    notice(g, 'Not Accepted', `${who} won't take a counterfeit. You could donate it or throw it away.`, { emoji: '🚫' })
    return false
  }
  if (authOf(a) === 'unknown' && isFake(a)) {
    revealAuth(g, a)
    addStat(g, 'happiness', -6)
    notice(g, 'It Is a Fake', `${who} took one look and slid ${a.name} back across the counter. It is a counterfeit. The appraisal was free, which is the only good news. It is worth about ${formatMoney(a.value)} now.`, { emoji: '🕵️', tone: 'bad' })
    return false
  }
  if (authOf(a) === 'unknown') a.details.auth = 'verified'
  return true
}

export function sellToDealer(g: GameState, a: Asset): void {
  if (!gateAuth(g, a, 'The dealer')) return
  syncValue(a)
  const price = a.value
  removeAsset(g, a)
  addMoney(g, price)
  count(g, 'assetsSold')
  log(g, `I sold my ${a.name} to a dealer for ${formatMoney(price)}.`)
  notice(g, 'Sold!', `The dealer paid ${formatMoney(price)} for ${a.name}, about ${Math.round((price / Math.max(1, marketValue(a))) * 100)}% of its market value. Dealers have to make a living too.`, { emoji: '🤝', tone: 'good' })
}

export function consignToAuction(g: GameState, a: Asset, house: string): void {
  if (!gateAuth(g, a, house)) return
  const res = runAuction(g, a)
  if (!res.sold) {
    addMoney(g, res.net)
    notice(g, 'Bought In', `${a.name} failed to reach its reserve at ${house} and was bought in. The catalogue and handling still cost ${formatMoney(res.fees)}. It is still yours.`, { emoji: '🔨', tone: 'bad' })
    return
  }
  removeAsset(g, a)
  addMoney(g, res.net)
  count(g, 'assetsSold')
  const mv = marketValue(a)
  const verdict = res.hammer > mv * 1.1 ? 'Two bidders fell in love with it.' : res.hammer < mv * 0.9 ? 'The room was quiet.' : 'It went roughly where it should.'
  log(g, `I sold my ${a.name} at ${house} for ${formatMoney(res.net)} after fees.`, res.net >= a.purchasePrice ? 'good' : 'neutral')
  notice(g, 'Sold at Auction', `The hammer fell at ${formatMoney(res.hammer)} at ${house}. ${verdict} After the seller's commission and costs (${formatMoney(res.fees)}), you received ${formatMoney(res.net)}.`, { emoji: '🔨', tone: 'good' })
}

export function discardAsset(g: GameState, a: Asset, donate: boolean): void {
  removeAsset(g, a)
  if (donate) {
    addHidden(g, 'karma', 2)
    count(g, 'donated')
    log(g, `I donated my ${a.name}.`, 'good')
    notice(g, 'Donated', `You donated ${a.name}. A thrift store volunteer was thrilled and a little suspicious.`, { emoji: '🤲', tone: 'good' })
  } else {
    log(g, `I threw out my ${a.name}.`)
    notice(g, 'Gone', `You got rid of ${a.name}.`, { emoji: '🗑️' })
  }
}

/** Open a bottle: wine and spirits are for drinking, and the cellar shrinks. */
export function openBottle(g: GameState, a: Asset): void {
  const cat = str(a.details.cat)
  const block = alcoholBlock(g)
  if (block) {
    notice(g, 'Not Now', block, { emoji: '🍷' })
    return
  }
  const qty = Math.max(1, num(a.details.qty, 1))
  const share = Math.round(mktOf(a) / qty)
  if (qty > 1) {
    a.details.qty = qty - 1
    a.details.mkt = Math.max(1, mktOf(a) - share)
    syncValue(a)
  } else removeAsset(g, a)
  addStat(g, 'happiness', randInt(g, 3, 8))
  addStat(g, 'health', cat === 'spirit' ? -1 : 0)
  const peak = (cat === 'wine' || cat === 'spirit') && num(a.details.vintage) > 0 ? g.year - num(a.details.vintage) : 0
  log(g, `I opened ${a.name}.`, 'good')
  notice(g, 'A Special Occasion', pick(g, [`You opened ${a.name} with friends. Someone said "hints of cedar". Someone else said "it's wine".`, `You poured ${a.name} for a quiet evening. Every sip was ${formatMoney(Math.round(share / 6))} of regret and joy.`, `${capitalize(a.name)} was ${peak > 20 ? 'older than your career' : 'worth the wait'}.`]), { emoji: '🍷', tone: 'good' })
}

// ---------------------------------------------------------------------------
// Wearing it (the player's own show-off, diminishing)

/** A little fame for a flashy outing: the first couple a year count, then it is old news. Never money. */
export function showOffFame(g: GameState): number {
  const c = g.character
  const used = num(g.flags['lux.showN'] && obj(g.flags['lux.showN'])?.y === g.year ? obj(g.flags['lux.showN'])?.n : 0)
  g.flags['lux.showN'] = { y: g.year, n: used + 1 }
  if (used >= 2) return 0
  if (c.hidden.fame >= 60) return 0
  if (!chance(g, 0.55 / (1 + used))) return 0
  addHidden(g, 'fame', 1)
  return 1
}

/** Perceived-wealth heat: showing off makes people think you are richer, and ask for more. */
export function addHeat(g: GameState, by: number): void {
  const cur = num(g.flags['lux.heat'])
  g.flags['lux.heat'] = Math.min(0.35, Math.max(0, Math.round((cur + by) * 1000) / 1000))
}

export function heat(g: GameState): number {
  return Math.min(0.35, Math.max(0, num(g.flags['lux.heat'])))
}

/** Show-offs fade: the town forgets what it saw last year (run once a year). */
export function decayHeat(g: GameState): void {
  const h = num(g.flags['lux.heat'])
  if (h <= 0) return
  const next = Math.round(h * 0.5 * 1000) / 1000
  g.flags['lux.heat'] = next < 0.004 ? 0 : next
}
