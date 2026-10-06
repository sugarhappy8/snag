// Vacation: fly somewhere (Budget/Economy/Business/First) or take a cruise (Interior to Suite),
// alone, with your partner or with the whole family. Trips raise happiness and come with
// random events: lost luggage, food poisoning, meeting a local, the rare disaster.
//
// Travel follows the calendar: before airlines (1925) trips abroad go by ocean liner and trips
// at home by train; flying stays a luxury (pricey, first or tourist class only) until jets and
// package holidays made it ordinary in the seventies (later in poorer countries, events/era.ts
// flights). Business class arrives in 1978 and budget airlines in the nineties. Destinations
// that didn't exist yet (Dubai's skyline, Florida's theme parks, Chernobyl tours) stay hidden.
import { killCharacter } from '../death'
import { addHidden, addMoney, addRelationship, addStat, count, currentPartner, log, notice, remember, scriptChoice, useYearAction } from '../core'
import { notePerson } from '../people'
import { chance, pick, randInt, weightedPick } from '../rng'
import { defineScript } from '../scripts'
import { COUNTRIES, countryLabel, getCountry } from '../world'
import { localeOf } from '../data/locales'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { common, eraPick, flights } from '../events/era'
import {
  addCondition,
  brokeNotice,
  canRomance,
  gate,
  isAbroad,
  localPrice,
  meetPerson,
  money,
  pushFlagString,
  result,
  stablePick,
  usesLeft,
} from './common'

type DestType = 'city' | 'beach' | 'nature' | 'festival' | 'landmark' | 'snow'

interface Destination {
  id: string
  name: string
  country: string
  emoji: string
  type: DestType
  tier: 1 | 2 | 3
  cruise?: boolean
  /** A trip inside the player's own country (from the local getaways and landmarks). */
  domestic?: boolean
}

const D = (name: string, country: string, emoji: string, type: DestType, tier: 1 | 2 | 3): Destination => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  country,
  emoji,
  type,
  tier,
})

export const DESTINATIONS: Destination[] = [
  D('Paris, France', 'France', '\u{1F5FC}', 'city', 2),
  D('London, England', 'United Kingdom', '\u{1F482}', 'city', 2),
  D('Rome, Italy', 'Italy', '\u{1F3DB}\u{FE0F}', 'city', 2),
  D('Venice, Italy', 'Italy', '\u{1F6F6}', 'city', 2),
  D('Florence, Italy', 'Italy', '\u{1F3A8}', 'city', 2),
  D('Barcelona, Spain', 'Spain', '⛪', 'city', 2),
  D('Ibiza, Spain', 'Spain', '\u{1F3D6}\u{FE0F}', 'beach', 2),
  D('Amsterdam, Netherlands', 'Netherlands', '\u{1F6B2}', 'city', 2),
  D('Prague, Czech Republic', 'Czech Republic', '\u{1F3F0}', 'city', 2),
  D('Vienna, Austria', 'Austria', '\u{1F3BB}', 'city', 2),
  D('Berlin, Germany', 'Germany', '\u{1F43B}', 'city', 2),
  D('Reykjavík, Iceland', 'Iceland', '\u{1F30B}', 'nature', 3),
  D('Santorini, Greece', 'Greece', '\u{1F3DD}\u{FE0F}', 'beach', 3),
  D('Athens, Greece', 'Greece', '\u{1F3DB}\u{FE0F}', 'city', 2),
  D('Istanbul, Turkey', 'Turkey', '\u{1F54C}', 'city', 2),
  D('Dubai, United Arab Emirates', 'United Arab Emirates', '\u{1F3D9}\u{FE0F}', 'city', 3),
  D('Marrakesh, Morocco', 'Morocco', '\u{1F42A}', 'city', 2),
  D('Tokyo, Japan', 'Japan', '\u{1F5FE}', 'city', 3),
  D('Kyoto, Japan', 'Japan', '⛩\u{FE0F}', 'city', 3),
  D('Seoul, South Korea', 'South Korea', '\u{1F3EF}', 'city', 3),
  D('Bangkok, Thailand', 'Thailand', '\u{1F6D5}', 'city', 2),
  D('Phuket, Thailand', 'Thailand', '\u{1F3D6}\u{FE0F}', 'beach', 2),
  D('Bali, Indonesia', 'Indonesia', '\u{1F33A}', 'beach', 3),
  D('Sydney, Australia', 'Australia', '\u{1F998}', 'city', 3),
  D('Auckland, New Zealand', 'New Zealand', '\u{1F95D}', 'nature', 3),
  D('Rio de Janeiro, Brazil', 'Brazil', '\u{1F3D6}\u{FE0F}', 'beach', 2),
  D('Buenos Aires, Argentina', 'Argentina', '\u{1F483}', 'city', 2),
  D('Cusco, Peru', 'Peru', '\u{1F999}', 'nature', 2),
  D('Havana, Cuba', 'Cuba', '\u{1F699}', 'city', 2),
  D('Cancún, Mexico', 'Mexico', '\u{1F334}', 'beach', 1),
  D('Cabo San Lucas, Mexico', 'Mexico', '\u{1F30A}', 'beach', 1),
  D('New York City', 'United States', '\u{1F5FD}', 'city', 1),
  D('Las Vegas, Nevada', 'United States', '\u{1F3B0}', 'city', 1),
  D('Honolulu, Hawaii', 'United States', '\u{1F33A}', 'beach', 2),
  D('Miami, Florida', 'United States', '\u{1F334}', 'beach', 1),
  D('New Orleans, Louisiana', 'United States', '\u{1F3B7}', 'city', 1),
  D('Toronto, Ontario', 'Canada', '\u{1F341}', 'city', 1),
  D('Vancouver, British Columbia', 'Canada', '\u{1F3D4}\u{FE0F}', 'city', 1),
  D('Winnipeg, Canada', 'Canada', '\u{1F9AC}', 'city', 1),
  D('Hell, Michigan', 'United States', '\u{1F525}', 'city', 1),
  D('Truth or Consequences, New Mexico', 'United States', '\u{1F335}', 'city', 1),
  D('Toad Suck, Arkansas', 'United States', '\u{1F438}', 'nature', 1),
  D('Boring, Oregon', 'United States', '\u{1F610}', 'city', 1),
  D('Accident, Maryland', 'United States', '\u{1F6A7}', 'city', 1),
  D('Ding Dong, Texas', 'United States', '\u{1F514}', 'city', 1),
  D("Monkey's Eyebrow, Kentucky", 'United States', '\u{1F412}', 'nature', 1),
  D('Cape Town, South Africa', 'South Africa', '\u{1F427}', 'city', 3),
  D('Kathmandu, Nepal', 'Nepal', '\u{1F3D4}\u{FE0F}', 'city', 2),
  D('Jerusalem, Israel', 'Israel', '\u{1F54D}', 'city', 2),
  D('Oktoberfest, Munich', 'Germany', '\u{1F37A}', 'festival', 2),
  D('Carnival, Rio de Janeiro', 'Brazil', '\u{1F3AD}', 'festival', 2),
  D('Mardi Gras, New Orleans', 'United States', '\u{1F3AD}', 'festival', 1),
  D('Running of the Bulls, Spain', 'Spain', '\u{1F402}', 'festival', 2),
  D('La Tomatina, Spain', 'Spain', '\u{1F345}', 'festival', 2),
  D('Festival of Colors, India', 'India', '\u{1F308}', 'festival', 2),
  D('Sapporo Snow Festival, Japan', 'Japan', '☃\u{FE0F}', 'festival', 3),
  D('Electronic Music Festival, Belgium', 'Belgium', '\u{1F3A7}', 'festival', 2),
  D('Desert Art Festival, Nevada', 'United States', '\u{1F525}', 'festival', 1),
  D('Comic Convention, San Diego', 'United States', '\u{1F9B8}', 'festival', 1),
  D('Cannes Film Festival', 'France', '\u{1F3AC}', 'festival', 3),
  D('Monaco Grand Prix', 'Monaco', '\u{1F3CE}\u{FE0F}', 'festival', 3),
  D('Grand Canyon, Arizona', 'United States', '\u{1F3DC}\u{FE0F}', 'nature', 1),
  D('Yellowstone National Park', 'United States', '\u{1F9AC}', 'nature', 1),
  D('Niagara Falls', 'Canada', '\u{1F4A6}', 'nature', 1),
  D('Great Barrier Reef, Australia', 'Australia', '\u{1F420}', 'beach', 3),
  D('Great Wall of China', 'China', '\u{1F9F1}', 'landmark', 2),
  D('Machu Picchu, Peru', 'Peru', '⛰\u{FE0F}', 'landmark', 2),
  D('Pyramids of Egypt', 'Egypt', '\u{1F53A}', 'landmark', 2),
  D('Taj Mahal, India', 'India', '\u{1F54C}', 'landmark', 2),
  D('Swiss Alps', 'Switzerland', '\u{1F3D4}\u{FE0F}', 'snow', 3),
  D('Maldives', 'Maldives', '\u{1F3DD}\u{FE0F}', 'beach', 3),
  D('Bora Bora', 'French Polynesia', '\u{1F3DD}\u{FE0F}', 'beach', 3),
  D('Galápagos Islands', 'Ecuador', '\u{1F422}', 'nature', 3),
  D('Serengeti National Park, Tanzania', 'Tanzania', '\u{1F981}', 'nature', 3),
  D('Mount Kilimanjaro, Tanzania', 'Tanzania', '\u{1F3D4}\u{FE0F}', 'nature', 3),
  D('Amazon Rainforest, Brazil', 'Brazil', '\u{1F99C}', 'nature', 2),
  D('Loch Ness, Scotland', 'United Kingdom', '\u{1F995}', 'nature', 2),
  D('Stonehenge, England', 'United Kingdom', '\u{1FAA8}', 'landmark', 2),
  D('Area 51, Nevada', 'United States', '\u{1F47D}', 'landmark', 1),
  D('Chernobyl, Ukraine', 'Ukraine', '☢\u{FE0F}', 'landmark', 2),
  D('Antarctica', 'Antarctica', '\u{1F427}', 'snow', 3),
  D('Theme Park, Florida', 'United States', '\u{1F3A2}', 'landmark', 1),
  D('Dead Sea, Israel', 'Israel', '\u{1F9C2}', 'beach', 2),
  D('Blue Lagoon, Iceland', 'Iceland', '♨\u{FE0F}', 'nature', 3),
  D('Northern Lights, Norway', 'Norway', '\u{1F30C}', 'snow', 3),
]

const C = (name: string, emoji: string): Destination => ({ ...D(name, 'International Waters', emoji, 'beach', 2), cruise: true })

export const CRUISES: Destination[] = [
  C('Alaska Cruise', '\u{1F40B}'),
  C('Bahamas Cruise', '\u{1F3DD}\u{FE0F}'),
  C('Bermuda Cruise', '\u{1F3D6}\u{FE0F}'),
  C('Caribbean Cruise', '\u{1F3F4}\u{200D}☠\u{FE0F}'),
  C('Hawaii Cruise', '\u{1F33A}'),
  C('Mediterranean Cruise', '\u{1F3DB}\u{FE0F}'),
  C('Mexican Riviera Cruise', '\u{1F32E}'),
  C('Nile River Cruise', '\u{1F42B}'),
  C('Northern Europe Cruise', '\u{1F3F0}'),
  C('Panama Canal Cruise', '\u{1F6A2}'),
  C('Southeast Asia Cruise', '\u{1F6D5}'),
  C('Transatlantic Cruise', '\u{1F30A}'),
]

/** First year each destination made sense as a holiday (by id); missing means always. */
const SINCE: Record<string, number> = {
  'dubai-united-arab-emirates': 1995,
  'electronic-music-festival-belgium': 2005,
  'desert-art-festival-nevada': 1991,
  'comic-convention-san-diego': 1970,
  'cannes-film-festival': 1946,
  'monaco-grand-prix': 1929,
  'chernobyl-ukraine': 2011,
  'area-51-nevada': 1990,
  'theme-park-florida': 1971,
  'canc-n-mexico': 1975,
  'cabo-san-lucas-mexico': 1975,
  'las-vegas-nevada': 1946,
  'ibiza-spain': 1960,
  'phuket-thailand': 1975,
  maldives: 1972,
  'bora-bora': 1960,
  antarctica: 1970,
  'gal-pagos-islands': 1969,
  'serengeti-national-park-tanzania': 1951,
  'blue-lagoon-iceland': 1987,
  'machu-picchu-peru': 1948,
  'sapporo-snow-festival-japan': 1950,
  'la-tomatina-spain': 1945,
  'seoul-south-korea': 1960,
  'jerusalem-israel': 1949,
  'kathmandu-nepal': 1951,
  'truth-or-consequences-new-mexico': 1950,
  'alaska-cruise': 1950,
  'bahamas-cruise': 1950,
  'caribbean-cruise': 1966,
  'mexican-riviera-cruise': 1968,
  'panama-canal-cruise': 1915,
  'southeast-asia-cruise': 1980,
  'hawaii-cruise': 1928,
}

/** Older names for places whose country changed: [until year, name]. */
const OLD_NAMES: Record<string, [number, string][]> = {
  'istanbul-turkey': [[1923, 'Constantinople, Ottoman Empire'], [1930, 'Constantinople, Turkey']],
  'prague-czech-republic': [[1918, 'Prague, Austria-Hungary'], [1993, 'Prague, Czechoslovakia']],
  'mount-kilimanjaro-tanzania': [[1919, 'Mount Kilimanjaro, German East Africa'], [1964, 'Mount Kilimanjaro, Tanganyika']],
  'serengeti-national-park-tanzania': [[1964, 'Serengeti National Park, Tanganyika']],
  'reykjav-k-iceland': [[1918, 'Reykjavík, Danish Iceland']],
}

/** Is this destination a holiday spot yet? */
function destOpen(g: GameState, d: Destination): boolean {
  return g.year >= (SINCE[d.id] ?? 0)
}

/** The destination as people called it this year. */
function eraDest(g: GameState, d: Destination): Destination {
  for (const [until, name] of OLD_NAMES[d.id] ?? []) if (g.year < until) return { ...d, name }
  return d
}

/** A trip inside the player's own country (local getaways, or US destinations for Americans). */
function atHome(g: GameState, dest: Destination): boolean {
  return !!dest.domestic || dest.country === getCountry(g.character.countryId).name
}

/** How you get abroad: by plane, or by ocean liner before the airlines (1925). */
function byShip(g: GameState, dest: Destination): boolean {
  return !dest.cruise && !atHome(g, dest) && g.year < 1925
}

/** Trips at home go by train until flying is ordinary here. */
function byTrain(g: GameState, dest: Destination): boolean {
  return !dest.cruise && atHome(g, dest) && !flights(g)
}

/** Airfares before the jet age and package holidays cost several times today's. */
function fareMultiplier(g: GameState, dest: Destination): number {
  if (dest.cruise || byTrain(g, dest)) return 1
  if (byShip(g, dest)) return 1.6
  const y = g.year
  const era = y < 1958 ? 4.5 : y < 1970 ? 2.5 : y < 1980 ? 1.6 : y < 1995 ? 1.25 : 1
  return flights(g) ? era : Math.max(2, era)
}

interface TravelClass {
  id: string
  label: string
  emoji: string
  mult: number
  happiness: number
}

const FLIGHT_CLASSES: TravelClass[] = [
  { id: 'budget', label: 'Budget', emoji: '\u{1FA91}', mult: 0.6, happiness: -2 },
  { id: 'economy', label: 'Economy', emoji: '✈\u{FE0F}', mult: 1, happiness: 0 },
  { id: 'business', label: 'Business', emoji: '\u{1F4BC}', mult: 2.4, happiness: 3 },
  { id: 'first', label: 'First Class', emoji: '\u{1F942}', mult: 4.5, happiness: 5 },
]

/** Steamship berths for trips abroad before the airlines. */
const SHIP_CLASSES: TravelClass[] = [
  { id: 'third', label: 'Third Class', emoji: '\u{1F6A2}', mult: 0.6, happiness: -2 },
  { id: 'second', label: 'Second Class', emoji: '\u{1F6F3}\u{FE0F}', mult: 1.2, happiness: 1 },
  { id: 'first', label: 'First Class', emoji: '\u{1F942}', mult: 4, happiness: 5 },
]

/** Train tickets for trips at home before flying was ordinary. */
const TRAIN_CLASSES: TravelClass[] = [
  { id: 'coach', label: 'Coach Seat', emoji: '\u{1F682}', mult: 0.6, happiness: -1 },
  { id: 'sleeper', label: 'Sleeper Car', emoji: '\u{1F6CF}\u{FE0F}', mult: 1, happiness: 2 },
  { id: 'first', label: 'First-Class Compartment', emoji: '\u{1F942}', mult: 2.2, happiness: 4 },
]

/** Fare classes the airlines sold this year: first class only at first, tourist class from 1952,
 * economy from 1958, business from 1978, budget airlines from the mid-nineties. */
function airClasses(g: GameState): TravelClass[] {
  const y = g.year
  return FLIGHT_CLASSES.filter((c) => (c.id === 'budget' ? y >= 1995 && flights(g) : c.id === 'business' ? y >= 1978 : c.id === 'economy' ? y >= 1952 : true)).map((c) =>
    c.id === 'economy' && y < 1958 ? { ...c, label: 'Tourist Class' } : c,
  )
}

const CABINS: TravelClass[] = [
  { id: 'interior', label: 'Interior Cabin', emoji: '\u{1F6CF}\u{FE0F}', mult: 1, happiness: 0 },
  { id: 'oceanview', label: 'Ocean View Cabin', emoji: '\u{1FA9F}', mult: 1.4, happiness: 2 },
  { id: 'balcony', label: 'Balcony Cabin', emoji: '\u{1F305}', mult: 1.9, happiness: 3 },
  { id: 'suite', label: 'Suite', emoji: '\u{1F451}', mult: 3.5, happiness: 6 },
]

const TRIPS_PER_YEAR = 3

function basePrice(g: GameState, dest: Destination): number {
  const usd = dest.cruise ? 1800 : dest.domestic ? 350 : dest.tier === 1 ? 600 : dest.tier === 2 ? 1500 : 3200
  return localPrice(g, usd * fareMultiplier(g, dest))
}

function perPerson(g: GameState, dest: Destination, cls: TravelClass): number {
  return Math.round(basePrice(g, dest) * cls.mult)
}

function classesFor(g: GameState, dest: Destination): TravelClass[] {
  if (dest.cruise) return CABINS
  if (byShip(g, dest)) return SHIP_CLASSES
  if (byTrain(g, dest)) return TRAIN_CLASSES
  return airClasses(g)
}

/** 'flight', 'voyage' or 'train' for this trip. */
function legWord(g: GameState, dest: Destination): string {
  return byShip(g, dest) ? 'voyage' : byTrain(g, dest) ? 'train' : 'flight'
}

/** Who loses your bags: the airline, the steamship line, the railway or the cruise line. */
function carrier(g: GameState, dest: Destination): string {
  if (dest.cruise) return 'cruise line'
  return byShip(g, dest) ? 'steamship line' : byTrain(g, dest) ? 'railway' : 'airline'
}

// Trips at home: the getaways and landmarks people in the player's country actually go to
// (Bali and Lake Toba from Jakarta, the Black Forest from Berlin, Ooty and Goa from Mumbai).

const BEACHY = /beach|island|isla|ilha|coast|bay|lagoon|riviera|shore|playa|praia|bali|lombok|gili|boracay|phuket|zanzibar|cove|keys|sea\b/i
const SNOWY = /\bski|snow|glacier/i
const WILD = /lake|mountain|mount|national park|valley|forest|falls|canyon|desert|safari|hills?\b|volcano|gorge|reserve|jungle|river|fjord|highlands|plateau/i

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function domesticDestinations(g: GameState): Destination[] {
  const c = g.character
  if (c.countryId === 'us') return []
  const country = getCountry(c.countryId)
  const loc = localeOf(c.countryId)
  const names = [...new Set([...loc.getaways, ...loc.landmarks.slice(0, 4)])].filter((n) => n !== c.city && !n.includes('{'))
  return names.map((name) => {
    const type: DestType = BEACHY.test(name) ? 'beach' : SNOWY.test(name) ? 'snow' : WILD.test(name) ? 'nature' : 'city'
    const emoji = type === 'beach' ? '\u{1F3D6}\u{FE0F}' : type === 'snow' ? '\u{1F3BF}' : type === 'nature' ? '\u{1F3DE}\u{FE0F}' : '\u{1F3D9}\u{FE0F}'
    return { id: `home-${c.countryId}-${slug(name)}`, name, country: country.name, emoji, type, tier: 1, domestic: true }
  })
}

function findDest(id: unknown, g?: GameState): Destination | undefined {
  return [...DESTINATIONS, ...CRUISES, ...(g ? domesticDestinations(g) : [])].find((d) => d.id === id)
}

/** Minor children who live with the player (they come on family trips). */
function kidsAtHome(g: GameState): Person[] {
  return g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild') && p.age < 18 && p.livesWithPlayer && !isAbroad(g, p))
}

function travelPartner(g: GameState): Person | undefined {
  const p = currentPartner(g)
  return p && !isAbroad(g, p) ? p : undefined
}

// ---------------------------------------------------------------------------
// Booking

function noTripsLeft(g: GameState): boolean {
  if ((g.yearActions['act.vacation'] ?? 0) < TRIPS_PER_YEAR) return false
  result(g, 'No Vacation Days', pick(g, [
    "You've used up all your vacation days this year.",
    "You've traveled enough this year. Your suitcase has filed for divorce.",
  ]), '\u{1F9F3}')
  return true
}

function chooseClass(g: GameState, place: Destination, cls: TravelClass): void {
  const dest = eraDest(g, place)
  if (noTripsLeft(g)) return
  const each = perPerson(g, dest, cls)
  if (g.character.money < each) {
    brokeNotice(g, each, `a ${cls.label.toLowerCase()} trip to ${dest.name}`)
    return
  }
  const partner = travelPartner(g)
  const kids = kidsAtHome(g)
  const choices = [{ id: 'alone', label: `Go alone (${money(each)})`, emoji: '\u{1F9CD}' }]
  if (partner) choices.push({ id: 'partner', label: `With ${partner.firstName} (${money(each * 2)})`, emoji: '\u{1F491}' })
  if (kids.length) {
    const n = 1 + (partner ? 1 : 0) + kids.length
    choices.push({ id: 'family', label: `The whole family, ${n} people (${money(each * n)})`, emoji: '\u{1F46A}' })
  }
  choices.push({ id: 'cancel', label: 'Never mind', emoji: '❌' })
  scriptChoice(g, WHO, dest.name, `${dest.cruise ? `A ${cls.label.toLowerCase()} on the ${dest.name}` : `${cls.label} to ${dest.name}`} costs ${money(each)} per person. Who's coming along?`, choices, {
    emoji: dest.emoji,
    data: { dest: dest.id, cls: cls.id },
  })
}

const WHO = defineScript('act.vacation.who', (g, choice, data) => {
  if (choice === 'cancel') return
  const d = (data ?? {}) as Record<string, Json>
  const found = findDest(d.dest, g)
  if (!found) return
  const dest = eraDest(g, found)
  const cls = classesFor(g, dest).find((c) => c.id === d.cls) ?? classesFor(g, dest)[0]
  if (noTripsLeft(g)) return
  const partner = travelPartner(g)
  const companions: Person[] = []
  if (choice === 'partner' && partner) companions.push(partner)
  if (choice === 'family') {
    if (partner) companions.push(partner)
    companions.push(...kidsAtHome(g))
  }
  const cost = perPerson(g, dest, cls) * (1 + companions.length)
  if (g.character.money < cost) {
    brokeNotice(g, cost, 'this trip')
    return
  }
  addMoney(g, -cost)
  useYearAction(g, 'act.vacation', TRIPS_PER_YEAR)
  takeTrip(g, dest, cls, companions)
})

// ---------------------------------------------------------------------------
// The trip

// Era tags (see events/era.ts): no step counters or phone photos of every meal in 1955.
const FLAVOR: Record<DestType, string[]> = {
  city: [
    '@2012 You toured museums, ate at a dozen restaurants and walked 30,000 steps a day.',
    '@-2012 You toured museums, ate at a dozen restaurants and walked until your feet gave out.',
    'You got lost in the winding streets of {name} and loved every minute of it.',
    '@smartphone You ate your weight in local food and took a picture of every meal.',
    '@!smartphone You ate your weight in local food and mailed a postcard about every meal.',
  ],
  beach: [
    'You spent your days on the beach with a good book and your nights watching sunsets.',
    '@1950 You snorkeled with tropical fish and finally got a tan.',
    'You did absolutely nothing for a week, and it was glorious.',
  ],
  nature: [
    '@2003 You hiked, explored and took 900 photos of the scenery.',
    '@-2003 You hiked, explored and used up every roll of film you brought.',
    '@smartphone The views at {name} were so beautiful you forgot to check your phone for three days.',
    'You breathed real fresh air for the first time in years.',
  ],
  festival: [
    'You partied with thousands of strangers and lost your voice.',
    'You danced, ate street food and made a dozen best friends you will never see again.',
    "It was loud, crowded and completely unforgettable.",
  ],
  landmark: [
    'You stood in awe in front of {name}. It was even more impressive in person.',
    'You took the classic tourist photo at {name}. You look ridiculous in it. You love it.',
    'You learned more history in a week than you did in all of high school.',
  ],
  snow: [
    'You skied, built snowmen and drank hot chocolate by the fire.',
    'You saw a sky full of stars over endless snow. It was breathtaking.',
    'You fell down roughly 40 times trying to ski. You had a blast anyway.',
  ],
}

const CRUISE_FLAVOR = [
  'You ate at the midnight buffet every single night. No regrets.',
  'You lounged by the pool deck, explored every port and won a towel-folding contest.',
  'You watched dolphins race alongside the ship at sunrise.',
  '@1985 You sang karaoke in the ship lounge and became a minor celebrity on deck 7.',
  '@-1985 You danced to the ship\'s orchestra every night and became a minor celebrity on deck 7.',
]

type TripEvent =
  | 'great'
  | 'luggage'
  | 'local'
  | 'foodPoisoning'
  | 'robbed'
  | 'injury'
  | 'delay'
  | 'upgrade'
  | 'accident'
  | 'sunburn'
  | 'seasick'
  | 'norovirus'
  | 'captain'
  | 'shipwreck'
  | 'radiation'

function rollEvent(g: GameState, dest: Destination, cls: TravelClass, alone: boolean): TripEvent {
  const events: TripEvent[] = ['great', 'luggage', 'local', 'foodPoisoning', 'robbed', 'injury', 'delay', 'upgrade', 'accident', 'sunburn', 'seasick', 'norovirus', 'captain', 'shipwreck', 'radiation']
  return weightedPick(g, events, (e) => {
    if (dest.cruise) {
      switch (e) {
        case 'great':
          return 52
        case 'luggage':
          return 4
        case 'local':
          return alone ? 9 : 4
        case 'foodPoisoning':
          return 5
        case 'seasick':
          return 8
        case 'norovirus':
          return 8
        case 'captain':
          return 6
        case 'shipwreck':
          return 0.6
        default:
          return 0
      }
    }
    switch (e) {
      case 'great':
        return 52
      case 'luggage':
        return cls.id === 'first' ? 3 : 8
      case 'local':
        return alone ? 11 : 5
      case 'foodPoisoning':
        return 7
      case 'robbed':
        return dest.type === 'city' || dest.type === 'festival' ? 6 : 2
      case 'injury':
        return dest.type === 'nature' || dest.type === 'snow' || dest.type === 'festival' ? 6 : 2
      case 'delay':
        return cls.id === 'budget' ? 8 : 4
      case 'upgrade':
        return cls.id === 'first' ? 0 : 3
      case 'accident':
        return 1
      case 'sunburn':
        return dest.type === 'beach' ? 6 : 0
      case 'radiation':
        return dest.id.startsWith('chernobyl') ? 25 : 0
      default:
        return 0
    }
  })
}

const ACCIDENTS: Record<DestType, { text: string; cause: string; injury: string; since?: number; until?: number }[]> = {
  beach: [
    { text: 'You were swimming far from shore when something brushed your leg. It was a shark.', cause: 'Shark Attack', injury: 'Shark Bite' },
    { text: 'You went parasailing and the rope snapped.', cause: 'Parasailing Accident', injury: 'Broken Leg', since: 1975 },
    { text: 'You rowed a little boat out past the waves and it capsized.', cause: 'Boating Accident', injury: 'Broken Leg', until: 1975 },
  ],
  nature: [
    { text: 'You wandered off the trail for a better photo and the ground gave way beneath you.', cause: 'Hiking Accident', injury: 'Broken Leg' },
    { text: 'A bear wandered into your campsite while you slept.', cause: 'Bear Attack', injury: 'Bear Mauling' },
  ],
  snow: [
    { text: 'You heard a deep rumble up the mountain. Then the avalanche hit.', cause: 'Avalanche', injury: 'Broken Ribs' },
    { text: 'You took the black diamond run on your first day and wrapped yourself around a tree.', cause: 'Skiing Accident', injury: 'Broken Leg' },
  ],
  city: [
    { text: 'You rented a scooter, forgot which side of the road they drive on, and met a bus.', cause: 'Scooter Accident', injury: 'Broken Arm' },
    { text: 'The helicopter tour you booked had engine trouble over the city.', cause: 'Helicopter Crash', injury: 'Broken Ribs', since: 1965 },
    { text: 'The horse pulling your sightseeing carriage bolted down a hill.', cause: 'Carriage Accident', injury: 'Broken Ribs', until: 1965 },
  ],
  festival: [
    { text: 'You got caught in a stampeding crowd near the main stage.', cause: 'Crowd Crush', injury: 'Broken Ribs' },
    { text: 'You ran with the bulls. One of the bulls ran into you.', cause: 'Gored by a Bull', injury: 'Goring Wound' },
  ],
  landmark: [
    { text: 'You climbed somewhere you really should not have climbed for a selfie, and slipped.', cause: 'Selfie Accident', injury: 'Broken Arm', since: 2013 },
    { text: 'You climbed somewhere you really should not have climbed for a better view, and slipped.', cause: 'Climbing Accident', injury: 'Broken Arm', until: 2013 },
    { text: 'The tour bus you were on swerved off the road.', cause: 'Bus Crash', injury: 'Concussion' },
  ],
}

function takeTrip(g: GameState, dest: Destination, cls: TravelClass, companions: Person[]): void {
  const c = g.character
  count(g, 'vacations')
  pushFlagString(g, 'placesVisited', dest.name)
  if (!dest.cruise && !dest.domestic) pushFlagString(g, 'countriesVisited', dest.country)
  if (dest.id === 'winnipeg-canada') g.flags.visitedWinnipeg = true

  const who = companions.length === 0 ? '' : companions.length === 1 ? ` with ${companions[0].firstName}` : ' with my family'
  const tripLine = dest.cruise ? `I went on the ${dest.name}${who}.` : `I went on vacation to ${dest.name}${who}.`
  log(g, tripLine, 'good')
  if (counterValue(g, 'vacations') === 1) remember(g, `First vacation: ${dest.name}.`)

  const joy = randInt(g, 6, 12) + cls.happiness + (dest.cruise ? 3 : 0)
  addStat(g, 'happiness', joy)
  addStat(g, 'health', randInt(g, 0, 2))
  for (const p of companions) {
    addRelationship(p, randInt(g, 6, 14))
    notePerson(p, `Went on ${dest.cruise ? 'the ' + dest.name : 'vacation to ' + dest.name} with the player.`)
  }
  const companionLine = companions.length === 0
    ? ''
    : companions.length === 1
      ? `\n\nYou and ${companions[0].firstName} grew a lot closer on this trip.`
      : '\n\nThe whole family had a wonderful time together.'

  const event = rollEvent(g, dest, cls, companions.length === 0)
  const title = dest.name
  switch (event) {
    case 'luggage': {
      addStat(g, 'happiness', -randInt(g, 3, 6))
      log(g, `The ${carrier(g, dest)} lost my luggage.`, 'bad')
      result(g, title, `The ${carrier(g, dest)} lost your luggage, so you spent the first three days in the same outfit. Once you bought new clothes, the trip turned out great.${companionLine}`, '\u{1F9F3}')
      return
    }
    case 'local': {
      if (companions.length === 0 && canRomance(g) && !currentPartner(g) && chance(g, 0.55)) {
        const p = meetPerson(g, 'lover', dest.name, { relationship: randInt(g, 60, 80) })
        markLocal(p, dest)
        if (p.relation === 'lover') {
          count(g, 'hookups')
          log(g, `I had a vacation romance with ${p.firstName} in ${dest.name}.`, 'good')
          result(g, title, `You met ${p.firstName}, a charming local, on your first night. What followed was a whirlwind vacation romance you'll never forget.`, '\u{1F498}', 'good')
          return
        }
        log(g, `I made a new friend, ${p.firstName}, in ${dest.name}.`, 'good')
        result(g, title, `You met ${p.firstName}, a local who showed you all the hidden spots tourists never find. You're friends for life now.`, '\u{1F91D}', 'good')
        return
      }
      const p = meetPerson(g, 'friend', dest.cruise ? `the ${dest.name}` : dest.name)
      markLocal(p, dest)
      log(g, `I made a new friend, ${p.firstName}, ${dest.cruise ? 'on my cruise' : `in ${dest.name}`}.`, 'good')
      result(g, title, `${dest.cruise ? `You met ${p.firstName} at the ship's bar and spent the rest of the cruise together.` : `You met ${p.firstName}, a local who showed you the best food in town.`}${companionLine}`, '\u{1F91D}', 'good')
      return
    }
    case 'foodPoisoning': {
      addStat(g, 'health', -randInt(g, 4, 9))
      addStat(g, 'happiness', -randInt(g, 3, 6))
      log(g, `I got food poisoning ${dest.cruise ? 'on my cruise' : `in ${dest.name}`}.`, 'bad')
      result(g, title, `${dest.cruise ? 'The seafood buffet' : 'Some street food that looked absolutely fine'} gave you food poisoning. You spent two days getting very well acquainted with the bathroom.${companionLine}`, '\u{1F922}', 'bad')
      return
    }
    case 'robbed': {
      const lost = Math.min(Math.max(0, c.money), randInt(g, 100, 800))
      addMoney(g, -lost)
      addStat(g, 'happiness', -randInt(g, 2, 5))
      log(g, `I got pickpocketed in ${dest.name}.`, 'bad')
      result(g, title, `A pickpocket in ${dest.name} relieved you of ${lost > 0 ? money(lost) : 'your sunglasses'}. You still had a nice time, mostly.${companionLine}`, '\u{1F45B}', 'bad')
      return
    }
    case 'injury': {
      const injury = pick(g, ['Sprained Ankle', 'Twisted Knee', 'Bruised Tailbone'])
      addCondition(g, injury, 'injury', randInt(g, 5, 12))
      addStat(g, 'health', -randInt(g, 3, 7))
      log(g, `I got a ${injury.toLowerCase()} in ${dest.name}.`, 'bad')
      result(g, title, `You got a ${injury.toLowerCase()} ${dest.type === 'snow' ? 'on the slopes' : dest.type === 'festival' ? 'in the crowd' : 'on a hike'}, but you limped through the rest of the trip like a champ.${companionLine}`, '\u{1FA79}', 'bad')
      return
    }
    case 'delay': {
      addStat(g, 'happiness', -randInt(g, 2, 4))
      const leg = legWord(g, dest)
      log(g, `My ${leg} to ${dest.name} was delayed by a day.`, 'neutral')
      const waited = leg === 'flight' ? 'You slept on the airport floor next to a crying baby.' : leg === 'train' ? 'You slept on a station bench next to a crying baby.' : 'You slept on your trunk at the docks next to a crying baby.'
      result(g, title, `Your ${cls.label.toLowerCase()} ${leg} was delayed 19 hours. ${waited} ${dest.name} was worth it, though.${companionLine}`, '\u{23F3}')
      return
    }
    case 'upgrade': {
      addStat(g, 'happiness', randInt(g, 3, 6))
      const leg = legWord(g, dest)
      log(g, `I got a free upgrade on my ${leg} to ${dest.name}.`, 'good')
      result(g, title, `The ${carrier(g, dest)} upgraded you to first class for free! ${leg === 'flight' ? 'Warm nuts, real silverware, the works.' : 'Crisp linen, real silverware, the works.'} And ${dest.name} was amazing.${companionLine}`, '\u{1F942}', 'good')
      return
    }
    case 'sunburn': {
      addStat(g, 'looks', -randInt(g, 1, 2))
      addStat(g, 'health', -randInt(g, 1, 3))
      log(g, `I got a terrible sunburn in ${dest.name}.`, 'bad')
      result(g, title, `You fell asleep on the beach without sunscreen and woke up looking like a boiled lobster. The rest of the trip was lovely, from the shade.${companionLine}`, '\u{1F99E}', 'bad')
      return
    }
    case 'radiation': {
      addStat(g, 'health', -randInt(g, 1, 3))
      addHidden(g, 'craziness', randInt(g, 1, 3))
      log(g, 'I toured the Chernobyl exclusion zone.', 'neutral')
      result(g, title, 'You toured the abandoned city and the guide waved a Geiger counter around a lot. It clicked more than you would have liked.', '☢\u{FE0F}')
      if (common(g, 'smartphone')) log(g, 'My phone photos from Chernobyl came out strangely grainy.', 'neutral')
      return
    }
    case 'seasick': {
      addStat(g, 'happiness', -randInt(g, 2, 5))
      log(g, 'I was seasick for most of my cruise.', 'bad')
      result(g, title, `You spent the first half of the cruise hugging the railing and feeding the fish. The second half was great.${companionLine}`, '\u{1F922}', 'bad')
      return
    }
    case 'norovirus': {
      addStat(g, 'health', -randInt(g, 4, 10))
      addStat(g, 'happiness', -randInt(g, 3, 7))
      log(g, 'A stomach virus broke out on my cruise ship.', 'bad')
      result(g, title, `A stomach virus tore through the ship and you were patient zero's cabin neighbor. You spent most of the cruise quarantined.${companionLine}`, '\u{1F9A0}', 'bad')
      return
    }
    case 'captain': {
      addStat(g, 'happiness', randInt(g, 3, 6))
      log(g, `I was invited to dine at the captain's table on the ${dest.name}.`, 'good')
      result(g, title, `You were invited to dine at the captain's table! The captain told sea stories all night and you got to wear the hat.${companionLine}`, '\u{1F468}\u{200D}✈\u{FE0F}', 'good')
      return
    }
    case 'shipwreck': {
      const survive = 0.4 + c.hidden.athleticism / 200 + c.stats.health / 300
      if (!chance(g, survive)) {
        notice(g, 'Shipwreck', `The ${dest.name} struck something in the night and began to sink. There weren't enough lifeboats.`, { emoji: '\u{1F6A2}', tone: 'bad' })
        killCharacter(g, 'Shipwreck')
        return
      }
      addStat(g, 'health', -randInt(g, 10, 20))
      addStat(g, 'happiness', -randInt(g, 5, 10))
      remember(g, `Survived the sinking of a cruise ship (${dest.name}).`)
      log(g, `I survived a shipwreck on the ${dest.name}!`, 'bad')
      result(g, 'Shipwreck', `The ship struck a reef and sank in the middle of the night. You swam for hours before a rescue boat pulled you out of the water. You survived!`, '\u{1F6DF}', 'bad')
      return
    }
    case 'accident': {
      const options = ACCIDENTS[dest.type].filter((a) => g.year >= (a.since ?? 0) && g.year < (a.until ?? 99999))
      const acc = pick(g, options.length ? options : ACCIDENTS[dest.type])
      const fatal = chance(g, 0.25)
      if (fatal) {
        notice(g, 'Tragedy Abroad', `${acc.text} You didn't survive.`, { emoji: '\u{1F54A}\u{FE0F}', tone: 'bad' })
        killCharacter(g, acc.cause)
        return
      }
      addStat(g, 'health', -randInt(g, 20, 35))
      addCondition(g, acc.injury, 'injury', randInt(g, 20, 35))
      remember(g, `Survived a ${acc.cause.toLowerCase()} in ${dest.name}.`)
      log(g, `I survived a ${acc.cause.toLowerCase()} in ${dest.name}.`, 'bad')
      if (c.stats.health <= 0) {
        killCharacter(g, acc.cause)
        return
      }
      result(g, 'Disaster', `${acc.text} You were rushed to a local hospital and somehow survived, but you'll be feeling it for a while.`, '\u{1F691}', 'bad')
      return
    }
    default: {
      const lines = dest.cruise ? CRUISE_FLAVOR : FLAVOR[dest.type]
      const text = eraPick(g, lines).replace('{name}', dest.name)
      result(g, title, `${text}${companionLine}`, dest.emoji, 'good')
    }
  }
}

function counterValue(g: GameState, key: string): number {
  return g.counters[key] ?? 0
}

function markLocal(p: Person, dest: Destination): void {
  const known = COUNTRIES.find((c) => c.name === dest.country)
  if (known) p.data.countryId = known.id
  else p.data.livesIn = dest.country
  p.data.metOnVacation = dest.name
}

// ---------------------------------------------------------------------------
// Menu

function destinationMenu(g: GameState, place: Destination): MenuGroup {
  const dest = eraDest(g, place)
  return {
    type: 'menu',
    id: `vacation.${dest.id}`,
    label: dest.name[0].toUpperCase() + dest.name.slice(1),
    emoji: dest.emoji,
    subtitle: (g) => `From ${money(perPerson(g, dest, classesFor(g, dest)[0]))} per person`,
    header: (g) => (dest.cruise ? 'Pick a cabin.' : byShip(g, dest) ? 'Pick a berth on the steamship.' : byTrain(g, dest) ? 'Pick your train ticket.' : dest.domestic ? 'How do you want to get there?' : 'How do you want to fly?'),
    children: (g): MenuNode[] =>
      classesFor(g, dest).map(
        (cls): MenuAction => ({
          type: 'action',
          id: `vacation.${dest.id}.${cls.id}`,
          label: cls.label,
          emoji: cls.emoji,
          subtitle: `${money(perPerson(g, dest, cls))} per person`,
          run: (d) => chooseClass(d, dest, cls),
        }),
      ),
  }
}

export const vacationMenu: MenuGroup = {
  type: 'menu',
  id: 'vacation',
  label: 'Vacation',
  emoji: '✈\u{FE0F}',
  subtitle: 'Go on a vacation',
  disabledReason: (g) => gate(g, { minAge: 18 }),
  header: (g) => `You have ${usesLeft(g, 'act.vacation', TRIPS_PER_YEAR)} trips left this year. Destinations change every year.`,
  children: (g): MenuNode[] => {
    const home = domesticDestinations(g)
    const country = getCountry(g.character.countryId)
    const abroad = DESTINATIONS.filter((d) => (!home.length || d.country !== country.name) && destOpen(g, d))
    const cruises = CRUISES.filter((d) => destOpen(g, d))
    const toMenu = (d: Destination) => destinationMenu(g, d)
    return [
    ...(home.length ? [{ type: 'heading' as const, id: 'vacation.home', label: `Around ${countryLabel(country)}` }, ...stablePick(g, 'vacations.home', home, 4).map(toMenu)] : []),
    { type: 'heading', id: 'vacation.trips', label: home.length ? 'Abroad' : 'Vacations' },
    ...stablePick(g, 'vacations', abroad, 8).map(toMenu),
    { type: 'heading', id: 'vacation.cruises', label: g.year < 1960 ? 'Ocean Liners' : 'Cruises' },
    ...stablePick(g, 'cruises', cruises, 4).map(toMenu),
    ]
  },
}
