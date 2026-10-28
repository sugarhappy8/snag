// The auction rooms and the grand-trip desk: this year's sale at the real auction houses (lots of
// watches, jewelry, classic cars, wine and art, with the buyer's premium on top), and bookable
// experiences (a suite at a grand hotel, a first-class seat, a liner crossing or Concorde).
// Lots and bookings are seeded per life and year, so the catalogue is stable and no menu consumes
// g.rng. Only buying a lot or taking a trip rolls the dice.
import { globalGoodsMult, nicePrice, seeded, yearKey } from '../assets'
import { addStat, children, count, currentPartner, formatMoney, log, notice, remember, scriptChoice, setRelationship, shortMoney, spend, useYearAction } from '../core'
import { brandById, brandsFor, brandName } from '../data/brands'
import { addEntitlement, gratitude } from '../events/wealth-core'
import { PRESENT_YEAR } from '../history/timeline'
import { chance, randInt, uid } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import type { Asset, ChoiceOption, GameState, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { namePoolOf } from '../world'
import { ALL_LINES, alcoholBlock, eraMult, isAlcohol, lineOnSale, lineTitle, tierOpen, tierReason } from './luxury-brands-catalog'
import { buildAsset, buyBlock, buyQuip, showOffFame, addHeat, type Offer } from './luxury-brands-deal'
import { STAYS, VOYAGES, type Stay, type Voyage } from './luxury-brands-stays'
import { conditionFactor, fakeOdds, syncValue, usedMarket } from './luxury-brands-value'
import { tierOfUsd } from './luxury-brands-types'
import { cantAfford, field, luxuryBlock, meetCeleb, num, rollCeleb, str, taxLine } from './luxury-common'

// ---------------------------------------------------------------------------
// The sale

export interface Lot {
  id: string
  house: string
  kind: 'line' | 'art'
  title: string
  emoji: string
  /** Hammer plus the buyer's premium: what you pay. */
  price: number
  mkt0: number
  condition: number
  age: number
  fakeOdds: number
  lineId?: string
  art?: { artist: string; work: string; medium: string; fame: number }
}

/** The buyer's premium on top of the hammer price at the big houses. */
export const BUYERS_PREMIUM = 0.2

const WORKS = ['Blue Dog at Dusk', 'Composition No. 7', 'Sad Pear', 'The Tax Collector', 'Untitled (Again)', 'Morning Over the Parking Lot', 'Self-Portrait as a Croissant', 'Chaos in Teal', 'Woman With Umbrella', 'The Last Bus Home', 'Pigeon Royalty', 'Red Square on Beige', 'Harbor in Fog', 'Lemons and a Lie']
const MEDIA = ['Oil on canvas', 'Watercolor', 'Bronze sculpture', 'Charcoal sketch', 'Acrylic on canvas', 'Mixed media']

function houses(g: GameState): string[] {
  return brandsFor(g, 'auction').map((b) => b.id)
}

const LOT_CATS: string[] = ['watch', 'jewelry', 'handbag', 'car', 'moto', 'pen', 'fine', 'wine', 'spirit', 'sneakers']

/** The lots of this year's sale (stable all year): up to six pieces from the catalog and four works of art. */
export function auctionLots(g: GameState): Lot[] {
  const hs = houses(g)
  if (!hs.length) return []
  const r = seeded(yearKey(g, 'lux:auction'))
  const out: Lot[] = []
  const pool = ALL_LINES.filter((l) => LOT_CATS.includes(l.cat) && lineOnSale(g, l) && l.usd * eraMult(l, g.year) >= 2_500 && !(isAlcohol(l.cat) && alcoholBlock(g)))
  const taken = new Set<string>()
  for (let i = 0; i < 6 && pool.length > 0; i++) {
    const l = r.weighted(pool, (x) => (x.limited || x.collect !== undefined ? 3 : 1))
    if (taken.has(l.id)) continue
    taken.add(l.id)
    const maxAge = Math.max(1, g.year - l.from)
    const retired = l.until !== undefined && g.year > l.until
    const age = Math.min(maxAge, retired ? Math.max(1, g.year - (l.until ?? g.year)) + r.int(0, 2) : r.int(1, 8))
    const condition = r.int(65, 98)
    const mkt0 = usedMarket(l, g.year, age) * r.float(0.95, 1.1)
    const hammer = mkt0 * conditionFactor(condition) * r.float(0.95, 1.2)
    out.push({
      id: `${g.year}:lot-${i}`,
      house: r.pick(hs),
      kind: 'line',
      title: `${age >= 1 ? `${g.year - age} ` : ''}${lineTitle(l)}`,
      emoji: l.emoji,
      price: nicePrice(hammer * (1 + BUYERS_PREMIUM)),
      mkt0,
      condition,
      age,
      fakeOdds: fakeOdds(g, l.cls, 'auction'),
      lineId: l.id,
    })
  }
  const pools = namePoolOf(g.character.countryId)
  for (let i = 0; i < 4; i++) {
    const artist = `${r.pick(r.chance(0.5) ? pools.male : pools.female)} ${r.pick(pools.last)}`
    const fame = r.int(1, 100)
    const m = nicePrice((3_000 + 3_000_000 * Math.pow(r.next(), 4) * (fame / 100)) * globalGoodsMult(g))
    const hammer = m * r.float(0.95, 1.2)
    const work = r.pick(WORKS)
    out.push({
      id: `${g.year}:art-${i}`,
      house: r.pick(hs),
      kind: 'art',
      title: `"${work}" by ${artist}`,
      emoji: r.pick(['🖼️', '🎨', '🗿']),
      price: nicePrice(hammer * (1 + BUYERS_PREMIUM)),
      mkt0: m,
      condition: r.int(80, 100),
      age: 0,
      fakeOdds: fakeOdds(g, 'art', 'auction'),
      art: { artist, work, medium: r.pick(g.year >= 1955 ? MEDIA : MEDIA.filter((x) => x !== 'Acrylic on canvas')), fame },
    })
  }
  return out.filter((x) => !soldLots(g).includes(x.id))
}

function soldLots(g: GameState): string[] {
  const v = g.flags['lux.lots']
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.startsWith(`${g.year}:`)) : []
}

/** Why a lot can't be bought right now (null = fine). */
export function lotBlock(g: GameState, lot: Lot): string | null {
  const b = luxuryBlock(g)
  if (b) return b
  const t = tierOfUsd(lot.mkt0)
  const tr = tierReason(g, t)
  if (tr) return tr
  if (lot.kind === 'line') {
    const l = ALL_LINES.find((x) => x.id === lot.lineId)
    if (l) {
      const bb = buyBlock(g, l)
      if (bb) return bb
    }
  }
  return g.character.money < lot.price ? `You need ${formatMoney(lot.price - g.character.money)} more.` : null
}

export function buyLot(g: GameState, lot: Lot): Asset | null {
  const block = lotBlock(g, lot)
  if (block) {
    if (g.character.money < lot.price && !luxuryBlock(g)) cantAfford(g, lot.price, lot.title)
    else notice(g, 'Not Today', block, { emoji: '🔨' })
    return null
  }
  if (soldLots(g).includes(lot.id)) {
    notice(g, 'Sold', 'The hammer already fell on that lot.', { emoji: '🔨' })
    return null
  }
  if (!spend(g, lot.price, 'asset.buy')) {
    cantAfford(g, lot.price, lot.title)
    return null
  }
  const fake = lot.fakeOdds > 0 && chance(g, lot.fakeOdds)
  let asset: Asset
  if (lot.kind === 'line') {
    const l = ALL_LINES.find((x) => x.id === lot.lineId)
    if (!l) return null
    const offer: Offer = { channel: 'auction', id: lot.id, label: 'Auction lot', price: lot.price, trip: 0, mkt0: lot.mkt0, basis: lot.mkt0, used: true, age: lot.age, condition: lot.condition, fakeOdds: lot.fakeOdds, allocation: false, note: '' }
    asset = buildAsset(g, l, 0, offer, fake)
    asset.details.house = lot.house
  } else {
    const art = lot.art!
    asset = {
      id: uid(g, 'a'),
      kind: 'collectible',
      name: lot.title,
      emoji: lot.emoji,
      purchasePrice: lot.price,
      value: 1,
      condition: lot.condition,
      purchasedAge: g.character.age,
      upkeep: 0,
      details: {
        lux: 1,
        brand: lot.house,
        house: lot.house,
        cat: 'art',
        cls: 'art',
        category: 'art',
        artist: art.artist,
        title: art.work,
        medium: art.medium,
        artistFame: art.fame,
        variant: '',
        boughtYear: g.year,
        madeYear: g.year,
        used: 1,
        mkt: Math.round(lot.mkt0),
        basis: Math.round(lot.mkt0),
        auth: 'unknown',
        fo: lot.fakeOdds,
        lfake: fake,
        chan: 'auction',
        serviced: g.year,
        luxIns: false,
        insured: false,
        isNew: false,
      },
    }
    syncValue(asset)
  }
  g.assets.push(asset)
  g.flags['lux.lots'] = [...soldLots(g), lot.id]
  count(g, 'purchases')
  count(g, 'luxBrands')
  addStat(g, 'happiness', lot.price >= 100_000 ? randInt(g, 4, 9) : randInt(g, 2, 5))
  remember(g, `Won ${lot.title} at ${brandName(lot.house)} for ${formatMoney(lot.price)}.`)
  log(g, `I won ${lot.title} at ${brandName(lot.house)} for ${formatMoney(lot.price)}.`, 'good')
  notice(g, 'Sold to You!', `The hammer fell at ${brandName(lot.house)}. With the ${Math.round(BUYERS_PREMIUM * 100)}% buyer's premium, ${lot.title} cost you ${formatMoney(lot.price)}. ${buyQuip(g, lot.kind === 'art' ? 'art' : str(asset.details.cat))}`, { emoji: lot.emoji, tone: 'good' })
  return asset
}

function lotAction(lot: Lot): MenuAction {
  return {
    type: 'action',
    id: `lux-lot-${lot.id}`,
    label: lot.title,
    emoji: lot.emoji,
    subtitle: `${shortMoney(lot.price)} with premium · ${brandName(lot.house)}${lot.kind === 'line' ? ` · ${lot.condition}% condition` : ''}`,
    disabledReason: (g) => lotBlock(g, lot),
    confirm: () => `Bid ${formatMoney(lot.price)} (hammer price plus the ${Math.round(BUYERS_PREMIUM * 100)}% buyer's premium) for ${lot.title}?`,
    run: (g) => {
      buyLot(g, lot)
    },
  }
}

export const auctionRoomsMenu: MenuGroup = {
  type: 'menu',
  id: 'luxAuction',
  label: 'Auction Rooms',
  emoji: '🔨',
  subtitle: (g) => (houses(g).length ? `${auctionLots(g).length} lots this year` : 'No auction houses yet'),
  disabledReason: (g) => luxuryBlock(g) ?? (houses(g).length ? null : 'There are no auction houses of note in your time and place.'),
  header: (g) => {
    const hs = houses(g).map(brandName)
    return `This year's sales at ${hs.slice(0, 3).join(', ')}${hs.length > 3 ? ' and others' : ''}. Lots sell for the hammer price plus a ${Math.round(BUYERS_PREMIUM * 100)}% buyer's premium, so you will not buy cheap. To sell, consign from your Collection. ${taxLine(g)}`.trim()
  },
  children: (g) => {
    const lots = auctionLots(g)
    return lots.length ? lots.map(lotAction) : [{ type: 'info', id: 'lux-lots-none', text: 'Every lot has sold. The next sale is next year.', emoji: '🪧' }]
  },
}

// ---------------------------------------------------------------------------
// Trips

function eraGoods(year: number): number {
  const t = Math.max(0, Math.min(1, (year - 1925) / (PRESENT_YEAR - 1925)))
  return year > PRESENT_YEAR ? Math.min(1.5, 1 + 0.01 * (year - PRESENT_YEAR)) : 0.55 + 0.45 * t
}

export interface Party {
  id: 'solo' | 'partner' | 'family'
  label: string
  people: Person[]
}

/** Who can come along: your partner, and your children who are alive and not abroad. */
export function partiesFor(g: GameState): Party[] {
  const out: Party[] = [{ id: 'solo', label: 'Just me', people: [] }]
  const partner = currentPartner(g)
  if (partner && partner.alive && partner.age >= 16) out.push({ id: 'partner', label: 'Me and my partner', people: [partner] })
  const kids = children(g).filter((k) => k.age <= 30).slice(0, 4)
  const family = [...(partner && partner.alive ? [partner] : []), ...kids]
  if (family.length >= (partner ? 2 : 1) && (kids.length > 0 || partner)) {
    if (!(family.length === 1 && out.some((o) => o.id === 'partner'))) out.push({ id: 'family', label: 'The whole family', people: family })
  }
  return out
}

function partyMult(people: Person[]): number {
  return 1 + 0.8 * people.length
}

function tripKey(kind: string): string {
  return `lux.trip.${kind}`
}

export function stayCost(g: GameState, s: Stay, nights: number, people: Person[]): number {
  const room = s.nightly * eraGoods(g.year) * nights * partyMult(people)
  const fare = s.country !== g.character.countryId ? nicePrice(1_500 * eraGoods(g.year)) * (1 + people.length) : 0
  return nicePrice(room + fare)
}

export function voyageCost(g: GameState, v: Voyage, people: Person[]): number {
  return nicePrice(v.base * eraGoods(g.year) * partyMult(people))
}

function stayOpen(g: GameState, s: Stay): boolean {
  const b = brandById(s.brand)
  if (!b) return false
  return g.year >= s.from && (s.until === undefined || g.year <= s.until)
}

function voyageOpen(g: GameState, v: Voyage): boolean {
  return g.year >= v.from && (v.until === undefined || g.year <= v.until)
}

function companionJoy(g: GameState, people: Person[], cost: number): void {
  for (const p of people) {
    setRelationship(g, p, Math.min(100, p.relationship + gratitude(p, randInt(g, 5, 9))))
    if (p.age < 25 && (p.relation === 'child' || p.relation === 'stepchild')) addEntitlement(p, cost / people.length > 6_000 ? 2 : 1)
  }
}

function afterTrip(g: GameState, what: string, place: string, cost: number, people: Person[], kind: 'stay' | 'fly'): void {
  const joy = randInt(g, 6, 12)
  addStat(g, 'happiness', joy)
  addStat(g, 'health', kind === 'stay' ? randInt(g, 0, 2) : 0)
  companionJoy(g, people, cost)
  const fame = showOffFame(g)
  addHeat(g, cost >= 20_000 ? 0.02 : 0.01)
  count(g, kind === 'stay' ? 'luxStays' : 'luxFlights')
  const who = people.length ? ` with ${people.map((p) => p.firstName).join(', ')}` : ''
  remember(g, `${what} at ${place}${who}.`)
  log(g, `I ${kind === 'stay' ? 'stayed' : 'traveled'}: ${what}${who}.`, 'good')
  notice(g, kind === 'stay' ? 'A Stay to Remember' : 'Traveling in Style', `${what}${who}. It cost ${formatMoney(cost)}. ${pickLine(g, ['The staff knew your name by the second evening.', 'You ordered breakfast just to see the trolley arrive.', 'Someone asked if you were somebody. You said "a guest".', 'Even the soap had a story.'])}${fame ? ' A few people heard about it and are talking.' : ''}`, { emoji: kind === 'stay' ? '🏨' : '✈️', tone: 'good' })
  if (chance(g, 0.12)) {
    const spec = rollCeleb(g)
    meetCeleb(g, spec, place, `At ${place}, the lobby was busy with famous faces.`)
  }
}

const BOOK_TRIP = defineScript('luxury.trip.book', (g, choice, data) => {
  const kind = field<string>(data, 'kind')
  const id = field<string>(data, 'id')
  if (choice === 'cancel' || !kind || !id) return
  const b = luxuryBlock(g)
  if (b) return
  const party = partiesFor(g).find((p) => p.id === choice) ?? partiesFor(g)[0]
  if (kind === 'stay') {
    const s = STAYS.find((x) => x.id === id)
    const nights = Math.max(1, Math.min(14, Math.round(num(field<number>(data, 'nights'), 3))))
    if (!s || !stayOpen(g, s)) return
    const cost = stayCost(g, s, nights, party.people)
    if (!useYearAction(g, tripKey('stay'), 2)) {
      notice(g, 'Fully Rested', 'You have already had two grand stays this year. The concierge suggests your own bed.', { emoji: '🏨' })
      return
    }
    if (!spend(g, cost, 'leisure')) {
      cantAfford(g, cost, `${nights} nights at ${s.name}`)
      g.yearActions[tripKey('stay')] = Math.max(0, (g.yearActions[tripKey('stay')] ?? 1) - 1)
      return
    }
    afterTrip(g, `${nights} nights in a suite at ${s.name}, ${s.city}`, s.name, cost, party.people, 'stay')
    return
  }
  const v = VOYAGES.find((x) => x.id === id)
  if (!v || !voyageOpen(g, v)) return
  const cost = voyageCost(g, v, party.people)
  if (!useYearAction(g, tripKey('fly'), 2)) {
    notice(g, 'Frequent Flyer', 'Two grand journeys is plenty for a year. The luggage needs a rest too.', { emoji: '✈️' })
    return
  }
  if (!spend(g, cost, 'leisure')) {
    cantAfford(g, cost, v.label)
    g.yearActions[tripKey('fly')] = Math.max(0, (g.yearActions[tripKey('fly')] ?? 1) - 1)
    return
  }
  afterTrip(g, v.label, brandName(v.brand), cost, party.people, 'fly')
})

function askParty(g: GameState, kind: 'stay' | 'fly', id: string, title: string, costOf: (people: Person[]) => number, nights?: number): void {
  const parties = partiesFor(g)
  if (parties.length === 1) {
    // Nobody to bring: book it straight away.
    const choices: ChoiceOption[] = [{ id: 'solo', label: `Book it: ${formatMoney(costOf([]))}`, emoji: '✅' }, { id: 'cancel', label: 'Not now', emoji: '✖️' }]
    scriptChoice(g, BOOK_TRIP, title, 'One traveler, one very good seat.', choices, { emoji: kind === 'stay' ? '🏨' : '✈️', data: { kind, id, ...(nights ? { nights } : {}) } })
    return
  }
  const choices: ChoiceOption[] = parties.map((p) => ({ id: p.id, label: `${p.label}: ${formatMoney(costOf(p.people))}`, emoji: p.id === 'solo' ? '🧳' : p.id === 'partner' ? '💞' : '👨‍👩‍👧' }))
  choices.push({ id: 'cancel', label: 'Not now', emoji: '✖️' })
  scriptChoice(g, BOOK_TRIP, title, 'Who is coming? Travelers you bring along enjoy it, and the bill grows with them.', choices, { emoji: kind === 'stay' ? '🏨' : '✈️', data: { kind, id, ...(nights ? { nights } : {}) } })
}

function stayAction(s: Stay): MenuAction {
  return {
    type: 'action',
    id: `lux-stay-${s.id}`,
    label: s.name,
    emoji: s.style === 'resort' ? '🏖️' : '🏨',
    subtitle: (g) => `${s.city} · about ${shortMoney(stayCost(g, s, 1, []))} a night`,
    disabledReason: (g) => luxuryBlock(g) ?? tierReason(g, 'luxury'),
    input: {
      kind: 'slider',
      label: 'Nights',
      min: 1,
      max: 14,
      step: 1,
      unit: ' nights',
      defaultValue: () => '3',
      preview: (g, v) => `${Math.round(v)} night${Math.round(v) === 1 ? '' : 's'} for one: ${formatMoney(stayCost(g, s, Math.round(v), []))}`,
    },
    run: (g, input) => {
      const nights = Math.max(1, Math.min(14, Math.round(Number(input) || 3)))
      askParty(g, 'stay', s.id, `${s.name}: ${nights} nights`, (people) => stayCost(g, s, nights, people), nights)
    },
  }
}

function voyageAction(v: Voyage): MenuAction {
  return {
    type: 'action',
    id: `lux-voyage-${v.id}`,
    label: v.label,
    emoji: v.mode === 'sea' ? '🛳️' : v.mode === 'concorde' ? '🛫' : '✈️',
    subtitle: (g) => `about ${shortMoney(voyageCost(g, v, []))} each · ${v.blurb}`,
    disabledReason: (g) => luxuryBlock(g) ?? tierReason(g, 'luxury'),
    run: (g) => askParty(g, 'fly', v.id, v.label, (people) => voyageCost(g, v, people)),
  }
}

export const grandTripsMenu: MenuGroup = {
  type: 'menu',
  id: 'luxTrips',
  label: 'Grand Hotels & First Class',
  emoji: '🏨',
  subtitle: (g) => `${STAYS.filter((s) => stayOpen(g, s)).length} hotels · ${VOYAGES.filter((v) => voyageOpen(g, v)).length} journeys`,
  disabledReason: (g) => luxuryBlock(g) ?? tierReason(g, 'luxury'),
  header: (g) => `Suites at real grand hotels and first-class seats on real carriers, in the years they really operated. Prices are approximate. Two stays and two journeys a year. ${tierOpen(g, 'luxury') ? '' : 'Opens at the luxury tier.'}`.trim(),
  children: (g): MenuNode[] => [
    { type: 'heading', id: 'lux-h-stays', label: 'Grand Hotels & Resorts' },
    ...STAYS.filter((s) => stayOpen(g, s)).map(stayAction),
    { type: 'heading', id: 'lux-h-voyages', label: 'First Class & Grand Voyages' },
    ...VOYAGES.filter((v) => voyageOpen(g, v)).map(voyageAction),
  ],
}
