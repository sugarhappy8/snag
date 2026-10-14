// Local flavor for the business system: labor laws and unions per market, team-building
// outings, sponsorship sports, staff traits and buyer names. Everything derives from
// data/markets.ts and world.ts so all 102 countries get something sensible.
import { marketOf } from '../data/markets'
import { getCountry } from '../world'
import { clampN } from './util'

// ---------------------------------------------------------------------------
// Labor protection: severance, wrongful-dismissal suits and union power.

const STRONG_LABOR = new Set(['fr', 'de', 'it', 'es', 'pt', 'be', 'nl', 'at', 'se', 'no', 'dk', 'fi', 'gr', 'ar', 'br', 'mx', 'za', 'kr', 'jp'])
const WEAK_LABOR = new Set(['us', 'sg', 'hk', 'ae', 'qa', 'kw', 'sa', 'bs', 'aw', 'ws', 'pg'])

/** 0 (at-will employment) - 1 (iron-clad contracts and powerful unions). */
export function laborProtection(countryId: string): number {
  if (WEAK_LABOR.has(countryId)) return countryId === 'us' ? 0.15 : 0.2
  const base: Record<string, number> = { Europe: 0.65, 'South America': 0.55, 'North America': 0.45, Asia: 0.4, Oceania: 0.5, Africa: 0.4, 'Middle East': 0.35 }
  const continent = getCountry(countryId).continent
  let p = base[continent] ?? 0.45
  if (STRONG_LABOR.has(countryId)) p += 0.2
  return clampN(p, 0.1, 0.95)
}

/** How likely unhappy staff are to strike: strong unions and expensive labor make walkouts likelier. */
export function unionStrength(countryId: string): number {
  const m = marketOf(countryId)
  return clampN(laborProtection(countryId) * (0.55 + 0.45 * Math.min(1.5, m.laborCost) / 1.5), 0.05, 1)
}

/** Months of pay owed when you let a key employee go. */
export function severanceMonths(countryId: string): number {
  return Math.round(laborProtection(countryId) * 6)
}

// ---------------------------------------------------------------------------
// Team building

export interface Outing {
  name: string
  /** Second-person sentence describing how it went (good night). */
  good: string
  /** Second-person sentence for a night that went sideways. */
  bad: string
  /** Involves alcohol (skipped where it is banned). */
  drinks?: boolean
}

export const OUTINGS: Record<string, Outing> = {
  karaoke: { name: 'a karaoke night', good: 'The shy accountant sang two power ballads.', bad: 'You sang a boy-band hit off-key. The sales team still quotes it at meetings.', drinks: true },
  noraebang: { name: 'a noraebang night with soju and fried chicken', good: 'The team sang ballads and got through six buckets of fried chicken.', bad: 'The new hire fell asleep in the booth and the bill ran two hours over.', drinks: true },
  braai: { name: 'a braai', good: 'The team stayed by the fire until the last boerewors was gone.', bad: 'The power cut out at seven. Two managers argued about rugby in the dark.' },
  bbq: { name: 'a backyard barbecue', good: 'Burgers off the grill and horseshoes on the lawn.', bad: 'The grill caught fire. The CFO lost both eyebrows.' },
  barbie: { name: 'a barbie at the beach', good: 'Snags on the barbie, then a swim between the flags.', bad: 'A seagull took the sausages. Six staff called in sick with sunburn.' },
  longLunch: { name: 'a three-hour long lunch', good: 'Four courses and three bottles of wine.', bad: 'Lunch ran past five. The office stayed empty all afternoon.', drinks: true },
  tapas: { name: 'a long lunch of tapas', good: 'Twelve plates of tapas, then a long siesta.', bad: 'The bill came at 6 PM. Splitting it took another hour.' },
  biergarten: { name: 'an afternoon at a beer garden', good: 'Pretzels and liter mugs under the chestnut trees.', bad: 'The intern lost a liter-chugging contest and missed the next two days.', drinks: true },
  fondue: { name: 'a fondue night in the mountains', good: 'Cheese fondue with a view of the Alps. Two feuding managers made up.', bad: 'You lost your bread in the pot three times and paid for a round each time.' },
  pubQuiz: { name: 'a pub quiz night', good: 'Your team came second and won a voucher for chips.', bad: 'Your team came last after a fierce argument about the capital of Australia.', drinks: true },
  sauna: { name: 'a sauna evening at a lakeside cottage', good: 'Two rounds of sauna and a plunge in the lake.', bad: 'The sales director stayed in the sauna too long and spent the night in the hospital.' },
  fika: { name: 'a fika afternoon and a crayfish party', good: 'Cinnamon buns in the afternoon, then a crayfish party at night.', bad: 'The crayfish were overcooked. Half the team ate crispbread instead.' },
  churrasco: { name: 'a churrasco', good: 'Skewers of picanha and samba until late.', bad: 'The churrasqueiro quit mid-party. You grilled, and the picanha came out gray.' },
  asado: { name: 'an asado', good: 'The asado lasted seven hours, as tradition demands.', bad: 'You overcooked the meat. The team filled up on bread.' },
  tacos: { name: 'a taco party', good: 'Tacos al pastor and a mariachi band. The team asked for it every Friday.', bad: 'The salsa was hotter than advertised. Three people took the next day off.' },
  cricket: { name: 'a friendly cricket match and a feast', good: 'The interns beat management by four wickets, then the biryani came out.', bad: 'A disputed run-out ended with two departments not speaking.' },
  hotpot: { name: 'a hot pot banquet', good: 'A split pot of spicy and mild broth, and toasts all night.', bad: 'Your deputy ordered extra-spicy broth for the whole table. Two people needed milk.' },
  banya: { name: 'a trip to the banya', good: 'Birch-branch whippings in the steam room, then herbal tea.', bad: 'The steam got too hot and the finance director passed out on the bench.' },
  kahvalti: { name: 'a long Turkish breakfast by the water', good: 'Thirty small plates and a dozen glasses of çay.', bad: "Breakfast ran until four. The afternoon's work didn't get done." },
  desert: { name: 'a desert camping trip with Arabic coffee and dates', good: 'Dune bashing by day and stories by the fire at night.', bad: 'A 4x4 got stuck in a dune, and it took the whole night to dig it out.' },
  owambe: { name: 'an owambe party', good: 'The whole team came in matching aso-ebi and danced until dawn.', bad: 'The jollof rice ran out by 9 PM and the DJ played the same three songs.' },
  nyamaChoma: { name: 'a nyama choma afternoon', good: 'Roast goat and cold sodas, with music until late.', bad: 'The goat took four hours to roast. Six people left before it was ready.' },
  felucca: { name: 'a felucca cruise on the Nile', good: 'Koshary on deck as the sun set over the Nile.', bad: 'The wind died and the team spent three hours becalmed in the sun.' },
  islandTrip: { name: 'a weekend island trip', good: 'Beach volleyball in the afternoon and grilled seafood at night.', bad: 'The ferry was cancelled and you all spent the night in the terminal.' },
  boodleFight: { name: 'a boodle fight', good: 'Rice and adobo on banana leaves, eaten by hand.', bad: 'The lechon came two hours late, so the team ate plain rice while they waited.' },
  borrel: { name: 'a Friday borrel', good: 'Bitterballen and beer at the corner café after work.', bad: 'A designer bit into a bitterbal too soon and went home with a burned mouth.', drinks: true },
  taverna: { name: 'a taverna night with plate smashing', good: 'Souvlaki and ouzo. The team smashed forty plates, all paid for.', bad: 'The plate smashing got out of hand. The taverna charged for 200 plates.', drinks: true },
  escapeRoom: { name: 'an escape room', good: 'You escaped with two minutes to spare.', bad: 'Time ran out. A staff member opened the door and showed you the last clue.' },
  bowling: { name: 'a bowling night', good: 'Cheesy fries and a lot of gutter balls.', bad: 'Accounting accused marketing of cheating. The two teams eat lunch apart now.' },
  paintball: { name: 'a paintball day', good: 'The team took you out in the first round.', bad: 'A manager kept firing after the whistle. The receptionist filed a complaint.' },
  hike: { name: 'a hiking trip and campfire', good: 'Six hours on the trail and stories around the campfire.', bad: 'Your shortcut got the team lost. A ranger led them back at nightfall.' },
}

const OUTING_BY_COUNTRY: Record<string, string[]> = {
  jp: ['karaoke'], kr: ['noraebang'], za: ['braai'], zw: ['braai'], us: ['bbq', 'bowling'], au: ['barbie'], nz: ['barbie', 'hike'],
  fr: ['longLunch'], es: ['tapas'], pt: ['longLunch'], it: ['longLunch'], de: ['biergarten'], at: ['biergarten'], cz: ['biergarten'],
  ch: ['fondue'], gb: ['pubQuiz'], ie: ['pubQuiz'], fi: ['sauna'], se: ['fika'], ee: ['sauna'], no: ['hike'], dk: ['fika'],
  br: ['churrasco'], ar: ['asado'], uy: ['asado'], py: ['asado'], mx: ['tacos'], in: ['cricket'], pk: ['cricket'], bd: ['cricket'],
  cn: ['hotpot'], tw: ['hotpot'], hk: ['hotpot'], ru: ['banya'], kz: ['banya'], tr: ['kahvalti'], sa: ['desert'], ae: ['desert'],
  qa: ['desert'], kw: ['desert'], jo: ['desert'], ng: ['owambe'], ke: ['nyamaChoma'], ug: ['nyamaChoma'], eg: ['felucca'],
  th: ['islandTrip'], vn: ['hotpot'], id: ['islandTrip'], my: ['islandTrip'], ph: ['boodleFight'], nl: ['borrel'], be: ['borrel'],
  gr: ['taverna'], ca: ['bbq', 'hike'], cl: ['asado'], co: ['tacos'],
}

/** A local team-building outing (no booze where alcohol is banned). */
export function localOuting(countryId: string, roll: number): Outing {
  const dry = marketOf(countryId).banned.includes('bar')
  const ids = (OUTING_BY_COUNTRY[countryId] ?? []).filter((id) => !(dry && OUTINGS[id]?.drinks))
  const pool = ids.length ? ids : ['escapeRoom', 'bowling', 'paintball', 'hike']
  return OUTINGS[pool[Math.floor(clampN(roll, 0, 0.9999) * pool.length)]] ?? OUTINGS.bowling
}

// ---------------------------------------------------------------------------
// Sponsorship

const SPORT_BY_COUNTRY: Record<string, string> = {
  us: 'baseball team', ca: 'hockey team', jp: 'baseball team', kr: 'baseball team', tw: 'baseball team', cu: 'baseball team', do: 'baseball team',
  in: 'cricket team', pk: 'cricket team', bd: 'cricket team', au: 'footy team', nz: 'rugby team', za: 'rugby team', ws: 'rugby team',
  pg: 'rugby league team', ie: 'hurling team', fi: 'ice hockey team', se: 'ice hockey team', ph: 'basketball team', lt: 'basketball team',
}

export function localSport(countryId: string): string {
  return SPORT_BY_COUNTRY[countryId] ?? 'football club'
}

// ---------------------------------------------------------------------------
// Key staff traits

export interface StaffTrait {
  id: string
  label: string
  /** Multiplier on the staff member's contribution. */
  impact: number
  /** Salary ask multiplier. */
  ask: number
  /** Effect on team morale per year. */
  morale: number
  /** Embezzlement / scandal risk weight. */
  risk: number
}

export const STAFF_TRAITS: StaffTrait[] = [
  { id: 'workaholic', label: 'Workaholic', impact: 1.25, ask: 1.05, morale: -1, risk: 0.5 },
  { id: 'perfectionist', label: 'Perfectionist', impact: 1.2, ask: 1.1, morale: -1, risk: 0.5 },
  { id: 'charmer', label: 'Charmer', impact: 1.1, ask: 1.05, morale: 2, risk: 1 },
  { id: 'pennyPincher', label: 'Penny-pincher', impact: 1.1, ask: 0.95, morale: -1, risk: 0.3 },
  { id: 'visionary', label: 'Visionary', impact: 1.3, ask: 1.25, morale: 1, risk: 0.8 },
  { id: 'steady', label: 'Steady', impact: 1, ask: 1, morale: 0, risk: 0.5 },
  { id: 'prankster', label: 'Office prankster', impact: 0.9, ask: 0.95, morale: 3, risk: 0.7 },
  { id: 'gossip', label: 'Gossip', impact: 0.95, ask: 0.95, morale: -3, risk: 1 },
  { id: 'lazy', label: 'Coasts a lot', impact: 0.7, ask: 0.9, morale: 0, risk: 0.8 },
  { id: 'overqualified', label: 'Overqualified', impact: 1.15, ask: 1.35, morale: 0, risk: 0.5 },
  { id: 'nepo', label: 'Somebody’s nephew', impact: 0.8, ask: 1.1, morale: -2, risk: 1.2 },
  { id: 'shady', label: 'Shady résumé', impact: 1.05, ask: 0.8, morale: 0, risk: 3 },
  { id: 'mentor', label: 'Natural mentor', impact: 1.05, ask: 1.05, morale: 3, risk: 0.3 },
]

export function traitOf(id: string): StaffTrait {
  return STAFF_TRAITS.find((t) => t.id === id) ?? STAFF_TRAITS[5]
}

// ---------------------------------------------------------------------------
// Names

const INVESTOR_FIRMS = ['Capital', 'Partners', 'Ventures', 'Holdings', 'Equity', 'Group']

/** A local-sounding private equity / investor firm name. */
export function investorFirm(countryId: string, roll: number, roll2: number): string {
  const words = marketOf(countryId).nameWords
  const w = words.length ? words[Math.floor(clampN(roll, 0, 0.9999) * words.length)] : getCountry(countryId).demonym
  return `${w} ${INVESTOR_FIRMS[Math.floor(clampN(roll2, 0, 0.9999) * INVESTOR_FIRMS.length)]}`
}

const CONGLOMERATES = ['Global Holdings', 'International', 'Consolidated', 'Worldwide Group', 'United Industries']

/** A foreign conglomerate from a big market. */
export function conglomerate(roll: number, roll2: number): string {
  const homes = ['us', 'jp', 'de', 'cn', 'gb', 'fr', 'kr', 'ae', 'in', 'ch']
  const home = homes[Math.floor(clampN(roll, 0, 0.9999) * homes.length)]
  const words = marketOf(home).nameWords
  const w = words.length ? words[Math.floor(clampN(roll2, 0, 0.9999) * words.length)] : getCountry(home).demonym
  return `${w} ${CONGLOMERATES[Math.floor(clampN(roll2 * 7.3 % 1, 0, 0.9999) * CONGLOMERATES.length)]} (${getCountry(home).demonym})`
}
