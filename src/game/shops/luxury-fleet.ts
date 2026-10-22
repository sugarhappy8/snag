// Luxury Lifestyle › Luxury Boat Dealership and Luxury Aircraft Brokerage: custom megayachts
// (Asset kind 'boat') and custom jets (kind 'aircraft'), built to order with a choice of
// interior. They are much bigger than the Specialty Vehicles dealers in assets.ts, trade
// worldwide in US dollars and come with crews. The regular Assets-tab actions (take it out,
// maintenance, insurance, sell) keep working; this module adds cruises, flights, parties,
// charters, renaming and the yearly fleet events.
import { conditionLabel, nicePrice, seeded, yearKey } from '../assets'
import type { Reason } from '../kernel/reasons'
import { addHidden, addMoney, addStat, count, earnIncome, formatMoney, hasLicense, log, notice, remember, scriptChoice, scriptInput, shortMoney, spend, useYearAction } from '../core'
import { taxAdditionalIncome } from '../finance'
import { chance, pick, randInt } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import type { Asset, ChoiceOption, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { brandsFor } from '../data/brands'
import { getCountry } from '../world'
import { lineTitle } from './luxury-brands-catalog'
import { fleetModels } from './luxury-brands-craft'
import { familyAccessNode } from './luxury-family'
import { charterMenu, settleCharter } from './fleet-operations'
import {
  cantAfford,
  cleanName,
  field,
  isListingBought,
  luxuryAssets,
  luxuryBlock,
  luxuryReason,
  markListingBought,
  meetCeleb,
  num,
  obj,
  rollCeleb,
  str,
  toJson,
  luxuryKind,
} from './luxury-common'

// ---------------------------------------------------------------------------
// Catalog

interface YachtClass {
  id: string
  label: string
  len: [number, number]
  price: [number, number]
  blurb: string
  /** First and last year shipyards build this kind (steam yachts before the war, gigayachts lately). */
  from?: number
  until?: number
}

const YACHT_CLASSES: YachtClass[] = [
  { id: 'superyacht', label: 'Superyacht', len: [40, 55], price: [18_000_000, 42_000_000], blurb: 'Entry-level enormous.', from: 1975 },
  { id: 'explorer', label: 'Explorer Yacht', len: [50, 78], price: [38_000_000, 95_000_000], blurb: 'Ice-class hull, for billionaires who want to see a penguin.', from: 1995 },
  { id: 'sailing', label: 'Sailing Megayacht', len: [55, 90], price: [45_000_000, 150_000_000], blurb: 'Masts taller than most apartment buildings.', from: 1985 },
  { id: 'mega', label: 'Megayacht', len: [70, 110], price: [95_000_000, 320_000_000], blurb: 'Two pools, a cinema and a crew that never makes eye contact.', from: 1985 },
  { id: 'giga', label: 'Gigayacht', len: [110, 180], price: [300_000_000, 700_000_000], blurb: 'Technically a small country.', from: 2005 },
  // Earlier decades (appended so today's dealership is unchanged).
  { id: 'steam', label: 'Steam Yacht', len: [40, 90], price: [15_000_000, 80_000_000], blurb: 'Coal-fired, mahogany-paneled and staffed like a small hotel.', until: 1939 },
  { id: 'motor', label: 'Motor Yacht', len: [35, 65], price: [12_000_000, 45_000_000], blurb: 'Diesel engines, a teak deck and a cocktail hour that starts at noon.', from: 1925, until: 1984 },
  { id: 'schooner', label: 'Grand Schooner', len: [40, 60], price: [10_000_000, 35_000_000], blurb: 'Three masts, acres of canvas and a crew that sings while it works.', until: 1984 },
]

function yachtClassesNow(g: GameState): YachtClass[] {
  return YACHT_CLASSES.filter((c) => g.year >= (c.from ?? 0) && g.year <= (c.until ?? Infinity))
}

/** Real yacht builders that existed in `year` (the registry), sailing yards for sailing hulls. */
const SAILING_YARDS = ['royal-huisman', 'perini-navi', 'camper-nicholsons', 'herreshoff']

function shipyardsFor(g: GameState, classId: string): string[] {
  const all = brandsFor(g, 'yacht', { segment: 'yacht-builder' })
  const sailing = classId === 'sailing' || classId === 'schooner'
  const fit = all.filter((b) => (sailing ? SAILING_YARDS.includes(b.id) : !['royal-huisman', 'perini-navi'].includes(b.id)))
  return (fit.length ? fit : all).map((b) => b.name)
}

interface JetClass {
  id: string
  label: string
  price: [number, number]
  seats: [number, number]
  range: number
  /** Pilots and cabin crew per year (global market). */
  crew: number
  /** Fuel, landing and handling fees for one trip. */
  trip: number
  emoji: string
  blurb: string
  /** First and last year it's for sale (business jets from the 1960s, flying boats before). */
  from?: number
  until?: number
}

const JET_CLASSES: JetClass[] = [
  { id: 'light', label: 'Light Jet or Turboprop', price: [4_000_000, 15_000_000], seats: [4, 9], range: 1_500, crew: 250_000, trip: 8_000, emoji: '✈️', blurb: 'A small jet or turboprop you can fly yourself, with a copilot if you must.' },
  { id: 'midsize', label: 'Super-Midsize Jet', price: [18_000_000, 32_000_000], seats: [8, 10], range: 3_500, crew: 600_000, trip: 30_000, emoji: '✈️', blurb: 'Coast to coast without stopping for snacks.' },
  { id: 'amphib', label: 'Amphibious Seajet', price: [26_000_000, 45_000_000], seats: [6, 10], range: 2_400, crew: 550_000, trip: 35_000, emoji: '🛩️', blurb: 'Lands on runways, lagoons and the occasional swimming pool.' },
  { id: 'largeCabin', label: 'Large-Cabin Jet', price: [48_000_000, 72_000_000], seats: [12, 16], range: 6_500, crew: 900_000, trip: 60_000, emoji: '✈️', blurb: 'A living room that does Mach 0.9.' },
  { id: 'ultraLong', label: 'Ultra-Long-Range Jet', price: [72_000_000, 92_000_000], seats: [14, 19], range: 7_700, crew: 1_100_000, trip: 90_000, emoji: '✈️', blurb: 'Sydney to New York nonstop, with a nap in an actual bed.' },
  { id: 'supersonic', label: 'Supersonic Business Jet', price: [150_000_000, 220_000_000], seats: [8, 12], range: 4_250, crew: 1_500_000, trip: 180_000, emoji: '🚀', blurb: 'London to New York in three and a half hours. The boom is extra.', from: 2020 },
  { id: 'airliner', label: 'VIP Narrowbody Airliner', price: [100_000_000, 140_000_000], seats: [19, 50], range: 6_000, crew: 2_200_000, trip: 140_000, emoji: '✈️', blurb: 'An airliner with exactly one passenger who matters.' },
  { id: 'widebody', label: 'VIP Widebody Airliner', price: [250_000_000, 450_000_000], seats: [40, 90], range: 9_500, crew: 4_500_000, trip: 320_000, emoji: '✈️', blurb: 'Bedrooms, a dining room and a staircase. On a plane.' },
  // Earlier decades.
  { id: 'flyingBoat', label: 'Luxury Flying Boat', price: [6_000_000, 15_000_000], seats: [10, 24], range: 2_500, crew: 350_000, trip: 20_000, emoji: '🛩️', blurb: 'A hotel with wings that lands in harbors.' },
  { id: 'propliner', label: 'Executive Propliner', price: [8_000_000, 20_000_000], seats: [12, 30], range: 3_000, crew: 400_000, trip: 25_000, emoji: '🛩️', blurb: 'Four roaring propellers, a cocktail bar and a steward in white gloves.' },
  { id: 'tourer', label: 'Private Touring Biplane', price: [800_000, 2_500_000], seats: [2, 4], range: 500, crew: 120_000, trip: 4_000, emoji: '🛩️', blurb: 'Open cockpit, leather goggles and a scarf that will not stop flapping.' },
]

/** A class is for sale when a real airframe of that class is in production (the supersonic jet is still a plan). */
function jetClassesNow(g: GameState): JetClass[] {
  return JET_CLASSES.filter((c) => (c.id === 'supersonic' ? g.year >= (c.from ?? 0) : fleetModels(c.id, g.year).length > 0))
}

export interface Interior {
  id: string
  label: string
  emoji: string
  mult: number
  /** Change to the yearly upkeep rate. */
  upkeep?: number
  /** Only on hulls / cabins at least this big (meters for yachts, seats for jets). */
  minSize?: number
  note: string
  /** First year it can be fitted (no satellite Wi-Fi in 1970). */
  from?: number
}

export const YACHT_INTERIORS: Interior[] = [
  { id: 'classic', label: 'Classic teak & brass', emoji: '🪵', mult: 1, note: 'Timeless. Your grandfather would approve, if he could afford it.' },
  { id: 'minimal', label: 'Minimalist Scandinavian', emoji: '🤍', mult: 1.03, note: 'So minimalist there is nowhere to put a drink down.' },
  { id: 'nightclub', label: 'Floating nightclub', emoji: '🪩', mult: 1.07, note: 'A dance floor, a DJ booth and a bar that rises out of the deck.', from: 1975 },
  { id: 'helipad', label: 'Twin helipads & beach club', emoji: '🚁', mult: 1.06, minSize: 50, note: 'Fold-down beach club at the stern, helicopters on top.', from: 1965 },
  { id: 'eco', label: 'Hybrid-electric eco refit', emoji: '🌱', mult: 1.08, upkeep: -0.015, note: 'Silent electric cruising. Activists still yell, but more quietly.', from: 2008 },
  { id: 'sub', label: 'Submarine garage', emoji: '🐠', mult: 1.15, minSize: 60, note: 'A two-person submarine in the hull for looking at fish and shipwrecks.', from: 1990 },
  { id: 'gold', label: 'Gold-plated everything', emoji: '🪙', mult: 1.12, upkeep: 0.005, note: 'Gold taps, gold rails, a gold toilet. The crew wears sunglasses indoors.' },
]

export const JET_INTERIORS: Interior[] = [
  { id: 'boardroom', label: 'Flying boardroom', emoji: '💼', mult: 1, note: 'A conference table, satellite Wi-Fi and a whiteboard nobody uses.' },
  { id: 'suite', label: 'Master bedroom suite', emoji: '🛏️', mult: 1.04, note: 'A king bed at 45,000 feet. Seat belts are optional, sort of.' },
  { id: 'spa', label: 'Sky spa with rain shower', emoji: '🚿', mult: 1.05, note: 'A steam shower in the sky. The pilots asked you to keep it under ten minutes.' },
  { id: 'cinema', label: 'Cinema & cocktail lounge', emoji: '🍸', mult: 1.04, note: 'A 90-inch screen and a bartender who flies with you.', from: 2005 },
  { id: 'pets', label: 'Pet lounge', emoji: '🐕', mult: 1.02, note: 'Heated dog beds, a scratching tower and one fire hydrant.' },
  { id: 'gym', label: 'Onboard gym', emoji: '🏋️', mult: 1.03, minSize: 14, note: 'A rowing machine at cruising altitude. The flight attendants think you are showing off.' },
  { id: 'gold', label: 'Gold-plated everything', emoji: '🪙', mult: 1.1, note: 'Even the seat belts. Especially the seat belts.' },
]

const YACHT_NAMES = ['Liquid Asset', 'Pier Pressure', 'Seas the Day', 'Tax Write-Off', 'Reel Estate', 'Aquaholic', 'Knot Working', 'Mid-Life Cruisis', 'Unsinkable II', 'Dividend', 'Loan Shark', 'Second Wind', 'Ship Happens', 'Offshore Account', 'Sea-Suite', 'Overdraft', 'Golden Parachute', 'Wake Me Up', 'Margin Call', 'Buoyant Market']

export interface YachtListing {
  id: string
  classId: string
  label: string
  builder: string
  lengthM: number
  crew: number
  guests: number
  price: number
  upkeepRate: number
}

export interface JetListing {
  id: string
  classId: string
  label: string
  model: string
  seats: number
  range: number
  crewCost: number
  trip: number
  price: number
  upkeepRate: number
}

function yachtClass(id: string): YachtClass | undefined {
  return YACHT_CLASSES.find((c) => c.id === id)
}

function jetClass(id: string): JetClass | undefined {
  return JET_CLASSES.find((c) => c.id === id)
}

/** This year's megayacht builds on offer (seeded: stable all year, never touches g.rng). */
export function yachtListings(g: GameState): YachtListing[] {
  const r = seeded(yearKey(g, 'luxury:yachts'))
  const out: YachtListing[] = []
  const classes = yachtClassesNow(g)
  if (classes.length === 0) return out
  for (let i = 0; i < 5; i++) {
    const cls = i < classes.length ? classes[i] : r.pick(classes)
    const lengthM = r.int(cls.len[0], cls.len[1])
    const t = (lengthM - cls.len[0]) / Math.max(1, cls.len[1] - cls.len[0])
    const price = nicePrice((cls.price[0] + (cls.price[1] - cls.price[0]) * Math.pow(t, 1.2)) * r.float(0.92, 1.08))
    const l: YachtListing = {
      id: `${g.year}:yacht-${i}`,
      classId: cls.id,
      label: cls.label,
      builder: r.pick(shipyardsFor(g, cls.id)),
      lengthM,
      crew: Math.max(8, Math.round(lengthM * r.float(0.3, 0.45))),
      guests: Math.min(36, Math.max(10, Math.round(lengthM / 4))),
      price,
      upkeepRate: Math.round(r.float(0.09, 0.11) * 1000) / 1000,
    }
    if (!isListingBought(g, l.id)) out.push(l)
  }
  return out.sort((a, b) => a.price - b.price)
}

/** This year's custom jets on offer (seeded). */
export function jetListings(g: GameState): JetListing[] {
  const r = seeded(yearKey(g, 'luxury:jets'))
  const out: JetListing[] = []
  const order = jetClassesNow(g)
  for (let i = 0; i < 5 && order.length > 0; i++) {
    const cls = order.splice(r.int(0, order.length - 1), 1)[0]
    const real = r.pick(fleetModels(cls.id, g.year).length ? fleetModels(cls.id, g.year) : [null])
    const price = nicePrice(real ? real.usd * r.float(0.92, 1.08) : r.float(cls.price[0], cls.price[1]))
    const l: JetListing = {
      id: `${g.year}:jet-${i}`,
      classId: cls.id,
      label: cls.label,
      model: real ? lineTitle(real) : 'Supersonic Business Jet',
      seats: real?.seats ? Math.max(2, real.seats + r.int(-1, 1)) : r.int(cls.seats[0], cls.seats[1]),
      range: cls.range,
      crewCost: nicePrice(cls.crew * r.float(0.9, 1.1)),
      trip: cls.trip,
      price,
      upkeepRate: Math.round(r.float(0.05, 0.07) * 1000) / 1000,
    }
    if (!isListingBought(g, l.id)) out.push(l)
  }
  return out.sort((a, b) => a.price - b.price)
}

export function interiorsFor(kind: 'megayacht' | 'jet', size: number, year = Infinity): Interior[] {
  const fits = (kind === 'megayacht' ? YACHT_INTERIORS : JET_INTERIORS).filter((x) => !x.minSize || size >= x.minSize)
  const now = fits.filter((x) => year >= (x.from ?? 0))
  return now.length ? now : fits
}

function interiorById(kind: 'megayacht' | 'jet', id: string): Interior | undefined {
  return (kind === 'megayacht' ? YACHT_INTERIORS : JET_INTERIORS).find((x) => x.id === id)
}

export function buildPrice(base: number, interior: Interior): number {
  return nicePrice(base * interior.mult)
}

/** Pilots and cabin crew for a jet this year: a licensed owner still needs a copilot and cabin crew. */
export function jetCrewCost(g: GameState, a: Asset): number {
  const full = num(a.details.crewCost)
  return Math.round(hasLicense(g, 'pilot') ? full * 0.4 : full)
}

function refreshJetUpkeep(g: GameState, a: Asset): void {
  a.upkeep = Math.max(0, Math.round(num(a.details.baseUpkeep) + jetCrewCost(g, a)))
}

// ---------------------------------------------------------------------------
// Buying

function deliveryFame(g: GameState, price: number, interior: Interior): void {
  if (price >= 100_000_000) addHidden(g, 'fame', randInt(g, 1, 3))
  if (interior.id === 'gold') {
    addHidden(g, 'fame', 2)
    addHidden(g, 'karma', -1)
  }
  if (interior.id === 'eco') addHidden(g, 'karma', 2)
}

/** Commission a megayacht with the chosen interior. Cash only: shipyards don't do layaway. */
export function buyYacht(g: GameState, l: YachtListing, interiorId: string): Asset | null {
  const reason = luxuryReason(g)
  if (reason) {
    notice(g, 'Luxury Boat Dealership', reason, { emoji: '🛥️' })
    return null
  }
  if (isListingBought(g, l.id)) {
    notice(g, 'Sold!', 'An oligarch put down a deposit on that hull this morning. In cash. In a duffel bag.', { emoji: '🏷️' })
    return null
  }
  const interior = interiorsFor('megayacht', l.lengthM, g.year).find((x) => x.id === interiorId) ?? YACHT_INTERIORS[0]
  const price = buildPrice(l.price, interior)
  if (!spend(g, price, 'asset.buy')) {
    cantAfford(g, price, `a ${l.lengthM} m ${l.label.toLowerCase()}`)
    return null
  }
  const name = pick(g, YACHT_NAMES)
  const rate = Math.max(0.06, l.upkeepRate + (interior.upkeep ?? 0))
  const asset: Asset = {
    id: `a${(g.nextId += 1)}`,
    kind: 'boat',
    name: `${l.lengthM} m ${l.label}`,
    emoji: '🛥️',
    purchasePrice: price,
    value: nicePrice(price * 0.9),
    condition: 100,
    purchasedAge: g.character.age,
    upkeep: nicePrice(price * rate),
    details: {
      luxury: 'megayacht',
      yachtName: name,
      builder: l.builder,
      classId: l.classId,
      lengthM: l.lengthM,
      crew: l.crew,
      guests: l.guests,
      interior: interior.id,
      interiorLabel: interior.label,
      upkeepRate: rate,
      isNew: true,
      insured: false,
      license: null,
      chartered: false,
    },
  }
  g.assets.push(asset)
  markListingBought(g, l.id)
  count(g, 'purchases')
  count(g, 'yachtsBought')
  addStat(g, 'happiness', randInt(g, 8, 15))
  deliveryFame(g, price, interior)
  remember(g, `Commissioned the megayacht ${name}, a ${l.lengthM} m ${l.label.toLowerCase()} from ${l.builder}, for ${formatMoney(price)}.`)
  log(g, `I bought a ${l.lengthM}-meter ${l.label.toLowerCase()} for ${formatMoney(price)} and named it ${name}.`, 'good')
  notice(
    g,
    'Welcome Aboard!',
    `${l.builder} delivered your ${l.lengthM} m ${l.label.toLowerCase()}, ${name}, with a ${interior.label.toLowerCase()} interior. ${interior.note} A crew of ${l.crew} saluted you at the gangway. Running costs (crew, fuel, berths, paint) come to about ${formatMoney(asset.upkeep)} a year.`,
    { emoji: '🛥️', tone: 'good' },
  )
  return asset
}

function jetName(g: GameState): string {
  const last = g.character.lastName || 'Private'
  return pick(g, [`Air ${last} One`, `${last} Express`, `The Flying ${last}`, `${last} Force One`, `Spirit of ${last}`])
}

/** Commission a custom jet with the chosen interior (cash). */
export function buyJet(g: GameState, l: JetListing, interiorId: string): Asset | null {
  const reason = luxuryReason(g)
  if (reason) {
    notice(g, 'Luxury Aircraft Brokerage', reason, { emoji: '✈️' })
    return null
  }
  if (isListingBought(g, l.id)) {
    notice(g, 'Sold!', g.year >= 2008 ? 'A tech founder bought that airframe five minutes ago so he could tweet about it.' : 'An oil baron bought that airframe five minutes ago so he could tell his club about it.', { emoji: '🏷️' })
    return null
  }
  const cls = jetClass(l.classId)
  const interior = interiorsFor('jet', l.seats, g.year).find((x) => x.id === interiorId) ?? JET_INTERIORS[0]
  const price = buildPrice(l.price, interior)
  if (!spend(g, price, 'asset.buy')) {
    cantAfford(g, price, `the ${l.model}`)
    return null
  }
  const name = jetName(g)
  const asset: Asset = {
    id: `a${(g.nextId += 1)}`,
    kind: 'aircraft',
    name: l.model,
    emoji: cls?.emoji ?? '✈️',
    purchasePrice: price,
    value: nicePrice(price * 0.9),
    condition: 100,
    purchasedAge: g.character.age,
    upkeep: 0,
    details: {
      luxury: 'jet',
      jetName: name,
      jetClass: l.classId,
      classLabel: l.label,
      seats: l.seats,
      rangeNm: l.range,
      interior: interior.id,
      interiorLabel: interior.label,
      crewCost: l.crewCost,
      tripCost: l.trip,
      baseUpkeep: nicePrice(price * l.upkeepRate),
      isNew: true,
      insured: false,
      license: null,
      chartered: false,
    },
  }
  refreshJetUpkeep(g, asset)
  g.assets.push(asset)
  markListingBought(g, l.id)
  count(g, 'purchases')
  count(g, 'jetsBought')
  addStat(g, 'happiness', randInt(g, 8, 15))
  deliveryFame(g, price, interior)
  const pilot = hasLicense(g, 'pilot')
    ? "With your pilot's license you can take the left seat yourself; a copilot and cabin crew come with it."
    : `You don't have a pilot's license, so a full crew flies it for about ${formatMoney(jetCrewCost(g, asset))} a year.`
  // Flying boats and propliners are planes, not jets.
  const craft = ['midsize', 'largeCabin', 'ultraLong', 'airliner', 'widebody', 'supersonic'].includes(l.classId) ? 'jet' : l.classId === 'light' ? 'aircraft' : 'plane'
  remember(g, `Bought a custom ${l.model} ${craft} (${l.label.toLowerCase()}) called ${name} for ${formatMoney(price)}.`)
  log(g, `I bought a custom ${l.model} ${craft} for ${formatMoney(price)} and named it ${name}.`, 'good')
  // Before satellite internet, the flying boardroom had a radio telephone.
  const note = g.year < 2005 ? interior.note.replace('satellite Wi-Fi', 'a radio telephone') : interior.note
  notice(g, 'Wheels Up!', `Your ${l.model} rolled out of the hangar with ${name} painted on the tail and a ${interior.label.toLowerCase()} inside. ${note} ${pilot} All-in running costs: about ${formatMoney(asset.upkeep)} a year.`, { emoji: asset.emoji, tone: 'good' })
  return asset
}

const BUY_YACHT = defineScript('luxury.yacht.buy', (g, choice, data) => {
  const l = obj(field(data, 'listing')) as unknown as YachtListing | null
  if (!l || typeof l.id !== 'string' || choice === 'cancel') return
  buyYacht(g, l, choice)
})

const BUY_JET = defineScript('luxury.jet.buy', (g, choice, data) => {
  const l = obj(field(data, 'listing')) as unknown as JetListing | null
  if (!l || typeof l.id !== 'string' || choice === 'cancel') return
  buyJet(g, l, choice)
})

function interiorChoices(kind: 'megayacht' | 'jet', size: number, base: number, year: number): ChoiceOption[] {
  const opts: ChoiceOption[] = interiorsFor(kind, size, year).map((x) => ({ id: x.id, label: `${x.label} (${formatMoney(buildPrice(base, x))})`, emoji: x.emoji }))
  opts.push({ id: 'cancel', label: 'Keep browsing', emoji: '✖️' })
  return opts
}

function yachtListingAction(l: YachtListing): MenuAction {
  const cls = yachtClass(l.classId)
  return {
    type: 'action',
    id: `lux-yacht-${l.id}`,
    label: `${l.lengthM} m ${l.label}`,
    emoji: '🛥️',
    subtitle: `From ${shortMoney(l.price)} · ${l.builder} · crew of ${l.crew}`,
    disabledReason: luxuryReason,
    run: (g) => {
      const text = [
        `🛠️ Built to order by ${l.builder}. ${cls?.blurb ?? ''}`.trim(),
        `📏 ${l.lengthM} meters · ${l.guests} guests · crew of ${l.crew}`,
        `💰 Base price: ${formatMoney(l.price)}`,
        `🧾 Running costs: about ${Math.round(l.upkeepRate * 100)}% of the price a year (${formatMoney(nicePrice(l.price * l.upkeepRate))}): crew, fuel, berths, insurance-grade paranoia.`,
        `No boating license needed: your captain drives. Pick the interior:`,
      ].join('\n')
      scriptChoice(g, BUY_YACHT, `🛥️ ${l.lengthM} m ${l.label}`, text, interiorChoices('megayacht', l.lengthM, l.price, g.year), { emoji: '🛥️', data: { listing: toJson(l) } })
    },
  }
}

function jetListingAction(l: JetListing): MenuAction {
  const cls = jetClass(l.classId)
  return {
    type: 'action',
    id: `lux-jet-${l.id}`,
    label: l.model,
    emoji: cls?.emoji ?? '✈️',
    subtitle: `From ${shortMoney(l.price)} · ${l.label} · ${l.seats} seats`,
    disabledReason: luxuryReason,
    run: (g) => {
      const crew = hasLicense(g, 'pilot') ? Math.round(l.crewCost * 0.4) : l.crewCost
      const text = [
        `${cls?.emoji ?? '✈️'} ${l.label}. ${cls?.blurb ?? ''}`.trim(),
        `💺 ${l.seats} seats · range ${l.range.toLocaleString('en-US')} nautical miles`,
        `💰 Base price: ${formatMoney(l.price)}`,
        `🧾 Hangar, maintenance and insurance: about ${formatMoney(nicePrice(l.price * l.upkeepRate))} a year`,
        hasLicense(g, 'pilot') ? `👨‍✈️ You can fly it yourself; a copilot and cabin crew cost about ${formatMoney(crew)} a year.` : `👨‍✈️ No pilot's license: a full crew costs about ${formatMoney(crew)} a year.`,
        'Pick the interior:',
      ].join('\n')
      scriptChoice(g, BUY_JET, `${cls?.emoji ?? '✈️'} ${l.model}`, text, interiorChoices('jet', l.seats, l.price, g.year), { emoji: cls?.emoji ?? '✈️', data: { listing: toJson(l) } })
    },
  }
}

export const megayachtDealerMenu: MenuGroup = {
  type: 'menu',
  id: 'luxuryYachts',
  label: 'Luxury Boat Dealership',
  emoji: '🛥️',
  subtitle: (g) => (g.year >= 2005 ? 'Custom megayachts, 40 to 180 meters' : g.year >= 1975 ? 'Custom superyachts, 40 to 110 meters' : 'Custom yachts, built to order'),
  disabledReason: luxuryReason,
  header: (g) => `"If you have to ask about the fuel bill, this is the wrong dealership." Every hull is built to order with the interior of your choice and priced in US dollars worldwide. You have ${formatMoney(g.character.money)}.`,
  children: (g) => {
    const list = yachtListings(g)
    return list.length ? list.map(yachtListingAction) : [{ type: 'info', id: 'lux-yacht-none', text: 'Every build slot at the shipyards is taken this year. Check back next year.', emoji: '⚓' }]
  },
}

export const jetBrokerMenu: MenuGroup = {
  type: 'menu',
  id: 'luxuryJets',
  label: 'Luxury Aircraft Brokerage',
  emoji: '🛩️',
  subtitle: (g) => (g.year >= 1970 ? 'Custom jets and VIP airliners' : g.year >= 1960 ? 'Private planes and the first business jets' : g.year >= 1919 ? 'Private planes and flying boats' : 'Nothing that flies is for sale yet'),
  disabledReason: luxuryReason,
  header: (g) => `"We don't sell planes. We sell never waiting in line again." ${hasLicense(g, 'pilot') ? "You have a pilot's license, so you can fly yourself." : `Without a pilot's license, a crew comes with every ${g.year >= 1960 ? 'jet' : 'plane'}.`} You have ${formatMoney(g.character.money)}.`,
  children: (g) => {
    const list = jetListings(g)
    return list.length ? list.map(jetListingAction) : [{ type: 'info', id: 'lux-jet-none', text: 'The broker has nothing left to sell you this year.', emoji: '🛬' }]
  },
}

// ---------------------------------------------------------------------------
// Owned yachts and jets

function vesselName(a: Asset): string {
  return str(a.details.yachtName, str(a.details.jetName, a.name))
}

function live(g: GameState, a: Asset): Asset {
  return g.assets.find((x) => x.id === a.id) ?? a
}

function interiorOf(a: Asset): Interior | undefined {
  return interiorById(a.details.luxury === 'jet' ? 'jet' : 'megayacht', str(a.details.interior))
}

/** Earn money mid-year and pay the income tax on it right away. Returns the tax. */
function earnTaxedNow(g: GameState, amount: number, reason: Reason): number {
  earnIncome(g, amount, reason)
  return taxAdditionalIncome(g, amount)
}

const CRUISE_SEAS: Record<string, string[]> = {
  'North America': ['the Caribbean', 'the Bahamas', 'the Sea of Cortez', 'the Florida Keys'],
  'South America': ['the Caribbean', 'the coast of Brazil', 'the Galápagos'],
  Europe: ['the Greek islands', 'the French Riviera', 'the Amalfi Coast', 'the Croatian coast', 'the Norwegian fjords'],
  'Middle East': ['the Red Sea', 'the Turkish Riviera', 'the Arabian Gulf'],
  Africa: ['the Seychelles', 'Zanzibar', 'the Mozambique Channel'],
  Asia: ['the Maldives', 'the Andaman Sea', 'Komodo', 'Ha Long Bay'],
  Oceania: ['the Great Barrier Reef', 'Fiji', 'French Polynesia'],
}

function cruiseCost(a: Asset): number {
  const len = num(a.details.lengthM, 50)
  return nicePrice(Math.max(20_000, len * len * 25))
}

function cruiseAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-cruise-${a.id}`,
    label: 'Set Sail',
    emoji: '🌊',
    subtitle: (g) => `A two-week cruise · fuel and berths about ${formatMoney(cruiseCost(live(g, a)))}`,
    disabledReason: (g) => luxuryBlock(g) ?? (live(g, a).condition <= 0 ? 'It is in no condition to leave the harbor.' : null),
    run: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return
      if (!useYearAction(g, `luxury.cruise.${cur.id}`, 1)) {
        notice(g, 'Set Sail', 'Your captain says the crew needs a year to recover from the last cruise. One a year.', { emoji: '⚓' })
        return
      }
      const cost = cruiseCost(cur)
      if (!spend(g, cost, 'leisure')) {
        g.yearActions[`luxury.cruise.${cur.id}`] = 0
        cantAfford(g, cost, 'a cruise')
        return
      }
      const name = vesselName(cur)
      const explorer = str(cur.details.classId) === 'explorer'
      const seas = CRUISE_SEAS[getCountry(g.character.countryId).continent] ?? CRUISE_SEAS.Europe
      const sea = explorer && chance(g, 0.5) ? pick(g, ['Antarctica', 'Svalbard', 'Greenland']) : pick(g, seas)
      cur.condition = Math.max(0, cur.condition - randInt(g, 1, 3))
      const roll = randInt(g, 1, 100)
      if (roll <= 12) {
        addStat(g, 'happiness', -3)
        const bad = pick(g, [
          { text: `Your anchor dragged across a protected reef in ${sea}. The coast guard fined you and a marine biologist cried on camera.`, fine: true },
          { text: `Rough seas off ${sea}. Everyone on board was seasick for five days, including the captain. Especially the captain.`, fine: false },
          { text: `You tried to park ${name} yourself in a crowded harbor and scraped a royal family's yacht. Diplomatic incident pending.`, fine: true },
        ])
        if (bad.fine) {
          const fine = nicePrice(randInt(g, 50_000, 400_000))
          addMoney(g, -Math.min(fine, Math.max(0, g.character.money)), 'fine')
          addHidden(g, 'karma', -2)
          notice(g, 'Rough Cruise', `${bad.text} The bill: ${formatMoney(fine)}.`, { emoji: '🌊', tone: 'bad' })
        } else {
          notice(g, 'Rough Cruise', bad.text, { emoji: '🤢', tone: 'bad' })
        }
        log(g, `My cruise to ${sea} on ${name} went badly.`, 'bad')
        return
      }
      addStat(g, 'happiness', randInt(g, 6, 12))
      addStat(g, 'health', randInt(g, 1, 4))
      log(g, `I cruised ${sea} on my yacht, ${name}.`, 'good')
      const interior = str(cur.details.interior)
      if (interior === 'sub' && chance(g, 0.25)) {
        const found = nicePrice(randInt(g, 80_000, 900_000))
        addMoney(g, found, 'luck')
        count(g, 'treasureFound')
        notice(g, 'Sunken Treasure', `You took the submarine down in ${sea} and found a wreck with a chest of old coins wedged in the sand. A museum paid ${formatMoney(found)} for it, and named a display case after you.`, { emoji: '🐠', tone: 'good' })
        return
      }
      if (roll >= 82) {
        meetCeleb(g, rollCeleb(g, undefined, chance(g, 0.5)), `a cruise in ${sea}`, `${name} anchored next to another yacht in ${sea}, and its owner swam over for a drink.`)
        return
      }
      const lines = [
        `Two weeks in ${sea} on ${name}: dolphins at breakfast, sunsets at dinner and a chef who learned your coffee order by day two.`,
        `You cruised ${sea}. The crew set up the inflatable water slide off the top deck and you went down it 41 times.`,
        `You spent two weeks in ${sea} pretending to read a novel on the sun deck. You read four pages. Bliss.`,
      ]
      if (explorer && (sea === 'Antarctica' || sea === 'Svalbard' || sea === 'Greenland')) lines.push(`Your ice-class hull pushed through the floes of ${sea}. A penguin, or possibly a seal, judged you from an iceberg.`)
      notice(g, 'Bon Voyage', pick(g, lines), { emoji: '🛥️', tone: 'good' })
    },
  }
}

function yachtPartyCost(a: Asset): number {
  return nicePrice(60_000 + num(a.details.lengthM, 50) * 1_500)
}

function yachtPartyAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-yparty-${a.id}`,
    label: 'Throw a Yacht Party',
    emoji: '🍾',
    subtitle: (g) => `About ${formatMoney(yachtPartyCost(live(g, a)))} for champagne, DJs and fireworks`,
    disabledReason: (g) => luxuryBlock(g) ?? (live(g, a).condition <= 0 ? 'Nobody wants to party on a wreck.' : null),
    run: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return
      if (!useYearAction(g, `luxury.yachtParty.${cur.id}`, 1)) {
        notice(g, 'Yacht Party', 'The harbor master asked you very nicely to wait until next year.', { emoji: '⚓' })
        return
      }
      const cost = yachtPartyCost(cur)
      if (!spend(g, cost, 'leisure')) {
        g.yearActions[`luxury.yachtParty.${cur.id}`] = 0
        cantAfford(g, cost, 'a yacht party')
        return
      }
      const name = vesselName(cur)
      const club = str(cur.details.interior) === 'nightclub'
      const roll = randInt(g, 1, 100) + (club ? 10 : 0)
      if (roll <= 15) {
        addStat(g, 'happiness', -4)
        addHidden(g, 'notoriety', randInt(g, 1, 4))
        addHidden(g, 'fame', 1)
        cur.condition = Math.max(0, cur.condition - randInt(g, 2, 6))
        log(g, `My party on ${name} turned into a tabloid story.`, 'bad')
        notice(g, 'Party Foul', pickSite(g, [`A guest drove the tender into the dock at 3 AM and the coast guard ended the party. You were on the evening news in a captain's hat.`, `Someone set off a flare inside the main salon. The sprinklers ruined the carpet, the DJ and the ice sculpture of your face.`, `Your party on ${name} got so loud that a neighboring yacht filed a noise complaint with three different countries.`], 0xb03fa420), { emoji: '🚨', tone: 'bad' })
        return
      }
      addStat(g, 'happiness', randInt(g, 6, 12))
      addHidden(g, 'fame', randInt(g, 1, club ? 5 : 3))
      log(g, `I threw a huge party on my yacht, ${name}.`, 'good')
      const text = pickSite(g, [`The party on ${name} went until sunrise.${club ? ' The dance floor rose out of the deck right on cue.' : ''} Fireworks, a jazz band and one guest who swore he was a prince.`, `Every influencer in the marina tried to get on ${name}. Only the ones who brought gifts made it past your crew.`, `Champagne towers, a seafood buffet the size of a whale and a conga line that went around the helipad twice.`], 0x430b0ab8)
      if (roll >= 75) {
        meetCeleb(g, rollCeleb(g, undefined, chance(g, 0.5)), `a party on ${name}`, text)
        return
      }
      notice(g, 'Yacht Party', text, { emoji: '🍾', tone: 'good' })
    },
  }
}

const FLIGHT_SPOTS = [
  'Paris for Fashion Week',
  'Aspen for a ski weekend',
  'Monaco for the Grand Prix',
  'Tokyo for one specific sushi counter',
  'Dubai for lunch',
  'New York for a Broadway opening',
  'Cape Town for the wine country',
  'Bora Bora for no reason at all',
  'Milan to buy a single pair of shoes',
  'Reykjavík to see the northern lights',
]

function tripCost(a: Asset): number {
  return nicePrice(Math.max(15_000, num(a.details.tripCost, 40_000)))
}

function flightAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-fly-${a.id}`,
    label: 'Fly Somewhere Fabulous',
    emoji: '🌍',
    subtitle: (g) => `${hasLicense(g, 'pilot') ? 'You fly' : 'Your crew flies'} · fuel and fees about ${formatMoney(tripCost(live(g, a)))}`,
    disabledReason: (g) => luxuryBlock(g) ?? (live(g, a).condition <= 0 ? 'It is grounded until it gets serious maintenance.' : null),
    run: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return
      if (!useYearAction(g, `luxury.jetTrip.${cur.id}`, 2)) {
        notice(g, 'Grounded', 'Your crew hit their flight-hour limit for the year. Even the very rich have to obey aviation law.', { emoji: '🛬' })
        return
      }
      const cost = tripCost(cur)
      if (!spend(g, cost, 'leisure')) {
        g.yearActions[`luxury.jetTrip.${cur.id}`] = Math.max(0, (g.yearActions[`luxury.jetTrip.${cur.id}`] ?? 1) - 1)
        cantAfford(g, cost, 'the fuel')
        return
      }
      cur.condition = Math.max(0, cur.condition - randInt(g, 0, 2))
      const name = vesselName(cur)
      const island = luxuryAssets(g, 'island').find((x) => strFeatures(x).includes('airstrip') || str(cur.details.jetClass) === 'amphib')
      const toIsland = !!island && chance(g, 0.4)
      const islandName = island ? str(island.details.islandName, 'your island') : ''
      const spot = pickLine(g, FLIGHT_SPOTS)
      const where = toIsland ? `your island, ${islandName}` : spot
      const city = toIsland ? islandName : spot.split(' for ')[0].split(' to ')[0]
      const selfFly = hasLicense(g, 'pilot')
      const interior = str(cur.details.interior)
      addStat(g, 'happiness', randInt(g, 5, 10))
      if (interior === 'spa' || interior === 'gym' || interior === 'suite') addStat(g, 'health', randInt(g, 1, 3))
      log(g, toIsland ? `I flew my jet, ${name}, to my island, ${islandName}.` : `I flew my jet, ${name}, to ${spot}.`, 'good')
      const how = selfFly ? `You flew ${name} yourself, made your own announcements and gave yourself a round of applause on landing.` : `Your crew flew ${name} while you ${pickLine(g, ['napped in a real bed', 'ate caviar off a gold spoon', 'watched three movies', 'took a call you could have taken from home'])}.`
      if (interior === 'boardroom' && chance(g, 0.3)) {
        const deal = nicePrice(randInt(g, 50_000, 600_000))
        const tax = earnTaxedNow(g, deal, 'sales')
        notice(g, 'Deal at 40,000 Feet', `${how} On the way to ${where} you closed a consulting deal over the conference table: ${formatMoney(deal)}${tax > 0 ? ` (${formatMoney(tax)} went to taxes)` : ''}.`, { emoji: '💼', tone: 'good' })
        return
      }
      if (!toIsland && chance(g, 0.15)) {
        meetCeleb(g, rollCeleb(g, undefined, chance(g, 0.5)), `a private terminal in ${city}`, `${how} At the private terminal in ${city}, the jet parked next to yours belonged to someone very famous.`)
        return
      }
      notice(g, 'Wheels Up', `${how} You spent a few days in ${where}. Total time waiting in a security line: zero minutes.`, { emoji: cur.emoji, tone: 'good' })
    },
  }
}

function strFeatures(a: Asset): string[] {
  const v = a.details.features
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

const RENAME_VESSEL = defineScript('luxury.fleet.rename', (g, value, data) => {
  const id = field<string>(data, 'assetId')
  const a = id ? g.assets.find((x) => x.id === id) : undefined
  if (!a) return
  const key = a.details.luxury === 'jet' ? 'jetName' : 'yachtName'
  const old = vesselName(a)
  const name = cleanName(value, old)
  if (name === old) return
  a.details[key] = name
  log(g, `I renamed ${old} to ${name}.`)
  notice(g, 'Rechristened', a.details.luxury === 'jet' ? `The painters redid the tail overnight. ${old} is now ${name}.` : `You smashed a bottle of champagne on the bow. ${old} is now ${name}. Sailors say renaming a boat is bad luck. Sailors also don't own one this big.`, { emoji: a.emoji })
})

function renameAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-rename-${a.id}`,
    label: 'Rename It',
    emoji: '✏️',
    disabledReason: luxuryBlock,
    run: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return
      if (!useYearAction(g, `luxury.rename.${cur.id}`, 1)) {
        notice(g, 'Rename', 'The registry only accepts one new name a year.', { emoji: '📜' })
        return
      }
      scriptInput(g, { title: 'Rename', emoji: cur.emoji, text: `What should ${vesselName(cur)} be called from now on?`, input: 'text', placeholder: cur.details.luxury === 'jet' ? 'e.g. Air Me One' : 'e.g. Liquid Asset', defaultValue: vesselName(cur), scriptId: RENAME_VESSEL, data: { assetId: cur.id } })
    },
  }
}

function fleetInfo(g: GameState, a: Asset): MenuNode[] {
  const d = a.details
  const rows: string[] = []
  const interior = interiorOf(a)
  if (d.luxury === 'jet') {
    rows.push(`${a.emoji} ${vesselName(a)} · ${a.name} (${str(d.classLabel, 'Private jet')})`)
    rows.push(`💺 ${num(d.seats)} seats · range ${num(d.rangeNm).toLocaleString('en-US')} nautical miles`)
    rows.push(hasLicense(g, 'pilot') ? `👨‍✈️ You fly it yourself with a copilot (${formatMoney(jetCrewCost(g, a))}/year in crew)` : `👨‍✈️ Crew: ${formatMoney(jetCrewCost(g, a))}/year (a pilot's license would save most of that)`)
  } else {
    rows.push(`🛥️ ${vesselName(a)} · ${a.name} by ${str(d.builder, 'a famous shipyard')}`)
    rows.push(`📏 ${num(d.lengthM)} m · ${num(d.guests)} guests · crew of ${num(d.crew)}`)
  }
  if (interior) rows.push(`${interior.emoji} Interior: ${interior.label}`)
  rows.push(`💰 Value: ${formatMoney(a.value)} (paid ${formatMoney(a.purchasePrice)})`)
  rows.push(`🔧 Condition: ${a.condition}% (${conditionLabel(a.condition)}) · running costs ${formatMoney(a.upkeep)}/year`)
  if (d.chartered === true) rows.push('🧾 Listed for charter')
  return rows.map((text, i): MenuNode => ({ type: 'info', id: `lux-fleetinfo-${a.id}-${i}`, text }))
}

/** A yacht's or jet's screen inside Luxury Lifestyle › Your Estates & Fleet. */
export function fleetHoldingNode(a: Asset): MenuGroup {
  const jet = a.details.luxury === 'jet'
  return {
    type: 'menu',
    id: `lux-holding-${a.id}`,
    label: vesselName(a),
    emoji: a.emoji,
    subtitle: (g) => {
      const cur = live(g, a)
      return jet ? `${shortMoney(cur.value)} · ${cur.name}` : `${shortMoney(cur.value)} · ${num(cur.details.lengthM)} m ${str(yachtClass(str(cur.details.classId))?.label, 'yacht').toLowerCase()}`
    },
    header: () => 'Maintain, insure or sell it from the Assets tab.',
    children: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return [{ type: 'info', id: 'lux-fleet-gone', text: "You don't own this anymore." }]
      const actions: MenuNode[] = jet ? [flightAction(cur), charterMenu(cur), renameAction(cur)] : [cruiseAction(cur), yachtPartyAction(cur), charterMenu(cur), renameAction(cur)]
      const fam = familyAccessNode(g, cur)
      return [...fleetInfo(g, cur), { type: 'heading', id: `lux-fleetact-${cur.id}`, label: jet ? 'Flying' : 'On the Water' }, ...actions, ...(fam ? [fam] : [])]
    },
  }
}

// ---------------------------------------------------------------------------
// Yearly: crew costs, charter income and the odd fleet event

/** Keep jet crew costs in step with the pilot's license and pay out charter fees (taxed income). */
export function yearlyFleet(g: GameState): void {
  for (const a of g.assets.filter(a => a.kind === 'boat' || a.kind === 'aircraft')) {
    const kind = luxuryKind(a)
    if (kind === 'jet') refreshJetUpkeep(g, a)
    settleCharter(g, a)
  }
}

export interface FleetCandidate {
  weight: number
  fire: () => void
}

const CREW_DRAMA = defineScript('luxury.fleet.crew', (g, choice, data) => {
  const id = field<string>(data, 'assetId')
  const a = id ? g.assets.find((x) => x.id === id) : undefined
  const name = a ? vesselName(a) : 'your yacht'
  const bonus = Math.max(0, num(field<number>(data, 'bonus') ?? 0))
  if (choice === 'pay') {
    if (!spend(g, bonus, 'wage')) {
      cantAfford(g, bonus, 'the crew bonus')
      return
    }
    addHidden(g, 'karma', 2)
    log(g, `I paid my yacht crew a ${formatMoney(bonus)} bonus.`)
    notice(g, 'Happy Crew', `You paid the ${formatMoney(bonus)} bonus. The crew of ${name} cheered, and the chef started making your favorite breakfast without being asked.`, { emoji: '🧑‍✈️', tone: 'good' })
  } else if (choice === 'fire') {
    addHidden(g, 'karma', -3)
    if (a) a.condition = Math.max(0, a.condition - randInt(g, 3, 8))
    log(g, `I fired the captain of ${name}.`, 'bad')
    notice(g, 'Mutiny Averted', `You fired the captain. The new one is cheaper, younger and once parked ${name} on a sandbar "just to see what would happen."`, { emoji: '⚓', tone: 'bad' })
  } else {
    addStat(g, 'happiness', -3)
    if (chance(g, 0.5)) {
      addHidden(g, 'fame', 1)
      notice(g, 'Tell-All', `You ignored them. A deckhand posted a video tour of ${name} called "working for the cheapest billionaire alive." It went viral.`, { emoji: '📱', tone: 'bad' })
    } else {
      notice(g, 'Quiet Grumbling', `You ignored the complaints. The crew grumbled, then went back to polishing the railings. Very slowly.`, { emoji: '😒' })
    }
  }
})

const ACTIVISTS = defineScript('luxury.fleet.activists', (g, choice, data) => {
  const name = field<string>(data, 'name') ?? 'your jet'
  if (choice === 'offset') {
    const cost = nicePrice(Math.max(50_000, num(field<number>(data, 'cost') ?? 0)))
    if (!spend(g, cost, 'purchase')) {
      cantAfford(g, cost, 'the carbon offsets')
      return
    }
    addHidden(g, 'karma', 4)
    log(g, `I bought ${formatMoney(cost)} of carbon offsets for my jet.`, 'good')
    notice(g, 'Carbon Neutral(ish)', `You bought ${formatMoney(cost)} of carbon offsets and planted a forest somewhere you will never visit. The protesters left, mostly satisfied.`, { emoji: '🌳', tone: 'good' })
  } else if (choice === 'police') {
    addHidden(g, 'notoriety', 2)
    addHidden(g, 'fame', 1)
    notice(g, 'Unglued', `The police spent four hours unsticking the protesters from ${name}. The photo of you checking your watch next to them is now a meme.`, { emoji: '👮', tone: 'bad' })
  } else {
    addStat(g, 'happiness', 2)
    addHidden(g, 'fame', 2)
    notice(g, 'Unexpected Ally', `You brought the protesters coffee and listened. Somebody filmed it. Half the internet calls you a hypocrite and the other half wants you to run for office.`, { emoji: '☕', tone: 'good' })
  }
})

/** Roll this year's yacht/jet events as candidates for the yearly luxury popup. */
export function fleetEventCandidates(g: GameState): FleetCandidate[] {
  const out: FleetCandidate[] = []
  for (const a of luxuryAssets(g, 'megayacht')) {
    const name = vesselName(a)
    if (chance(g, 0.05)) {
      const bonus = nicePrice(num(a.details.crew, 10) * randInt(g, 4_000, 9_000))
      out.push({
        weight: 2,
        fire: () => {
          scriptChoice(g, CREW_DRAMA, 'Trouble Below Deck', `The crew of ${name} is threatening to quit over tips. The captain says ${formatMoney(bonus)} in bonuses would fix it.`, [
            { id: 'pay', label: `Pay the bonus (${formatMoney(bonus)})`, emoji: '💵' },
            { id: 'fire', label: 'Fire the captain', emoji: '🔥' },
            { id: 'ignore', label: 'Ignore them', emoji: '🙉' },
          ], { emoji: '🧑‍✈️', data: { assetId: a.id, bonus } })
        },
      })
    }
    if (chance(g, 0.03)) {
      out.push({
        weight: 1,
        fire: () => {
          if (a.details.insured === true) {
            notice(g, 'Fender Bender', `A rival billionaire's yacht backed into ${name} in the harbor. Your insurer handled it and the other owner sent you a magnum of champagne and a lawyer.`, { emoji: '🛥️' })
            return
          }
          const dmg = randInt(g, 8, 20)
          a.condition = Math.max(0, a.condition - dmg)
          a.value = Math.max(1_000, Math.round(a.value * (1 - dmg / 300)))
          addStat(g, 'happiness', -4)
          log(g, `Another yacht crashed into ${name} in the harbor.`, 'bad')
          notice(g, 'Harbor Collision', `A rival billionaire's yacht backed into ${name} in the harbor. With no insurance, the repairs are on you: condition down ${dmg}%. Get it serviced from the Assets tab.`, { emoji: '💥', tone: 'bad' })
        },
      })
    }
    if (a.details.chartered === true && chance(g, 0.05)) {
      out.push({
        weight: 2,
        fire: () => {
          const dmg = randInt(g, 6, 15)
          a.condition = Math.max(0, a.condition - dmg)
          addStat(g, 'happiness', -2)
          log(g, `Charter guests trashed my yacht, ${name}.`, 'bad')
          notice(g, 'Charter Guests From Hell', `A bachelor party chartered ${name} and returned it with a hot tub full of foam, a missing jet ski and a goat nobody can explain. Condition down ${dmg}%.`, { emoji: '🐐', tone: 'bad' })
        },
      })
    }
  }
  for (const a of luxuryAssets(g, 'jet')) {
    const name = vesselName(a)
    if (chance(g, 0.04)) {
      const cost = nicePrice(Math.max(50_000, num(a.details.tripCost, 40_000) * 6))
      out.push({
        weight: 2,
        fire: () => {
          scriptChoice(g, ACTIVISTS, 'Glued to the Runway', `Climate activists glued themselves to the wheels of ${name} and are livestreaming. They want you to "do something about it."`, [
            { id: 'offset', label: `Buy carbon offsets (${formatMoney(cost)})`, emoji: '🌳' },
            { id: 'police', label: 'Call the police', emoji: '👮' },
            { id: 'coffee', label: 'Bring them coffee', emoji: '☕' },
          ], { emoji: '✋', data: { name, cost } })
        },
      })
    }
    if (chance(g, 0.04)) {
      out.push({
        weight: 1,
        fire: () => {
          addHidden(g, 'fame', 2)
          addStat(g, 'happiness', -2)
          log(g, `A flight-tracking bot started posting every trip my jet makes.`)
          notice(g, 'Tracked', `A teenager built a bot that posts every flight ${name} takes. Your 11-minute hop to the next city got 2 million views and a lot of opinions.`, { emoji: '📡' })
        },
      })
    }
  }
  return out
}
