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

const OUTINGS: Record<string, Outing> = {
  karaoke: { name: 'a karaoke night', good: 'Even the shy accountant sang a power ballad. Twice.', bad: 'Your rendition of a 90s boy-band hit will be discussed at every future staff meeting.', drinks: true },
  noraebang: { name: 'a noraebang night with soju and fried chicken', good: 'The team bonded over off-key ballads and too much fried chicken.', bad: 'Someone fell asleep in the booth and the bill could fund a small startup.', drinks: true },
  braai: { name: 'a braai', good: 'The boerewors were perfect and the team stayed until the fire died.', bad: 'Load-shedding killed the lights and an argument about rugby nearly killed the vibe.' },
  bbq: { name: 'a backyard barbecue', good: 'Burgers, lawn games and nobody talked about work. Morale is up.', bad: 'The grill caught fire and so, briefly, did the CFO’s eyebrows.' },
  barbie: { name: 'a barbie at the beach', good: 'Snags on the barbie and a swim; the team came back sunburned and happy.', bad: 'A seagull stole the sausages and a sunburn epidemic followed.' },
  longLunch: { name: 'a three-hour long lunch', good: 'Four courses, a lot of wine and genuinely great conversation.', bad: 'Nobody made it back to work, including you.', drinks: true },
  tapas: { name: 'a long lunch of tapas', good: 'Plates kept coming and so did the laughs. The siesta afterwards was well earned.', bad: 'The bill arrived at 6 PM and so did a debate about whose turn it is to pay.' },
  biergarten: { name: 'an afternoon at a beer garden', good: 'Pretzels, liter mugs and toasts to the company. Prost!', bad: 'A team member challenged the intern to a liter-chugging contest. Nobody won.', drinks: true },
  fondue: { name: 'a fondue night in the mountains', good: 'Melted cheese and alpine views fixed every office feud.', bad: 'Someone lost their bread in the fondue and the penalty was a song. It was a long song.' },
  pubQuiz: { name: 'a pub quiz night', good: 'Your team came second and won a voucher for chips. Glorious.', bad: 'Your team came last after a fierce argument about the capital of Australia.', drinks: true },
  sauna: { name: 'a sauna evening at a lakeside cottage', good: 'Sauna, an icy lake plunge and sausages: the most Finnish team bonding possible.', bad: 'The boss stayed in the sauna too long trying to prove a point. Paramedics were polite about it.' },
  fika: { name: 'a fika afternoon and a crayfish party', good: 'Cinnamon buns, silly hats and drinking songs. Very hygge, very effective.', bad: 'The crayfish were overcooked and so was the debate about the coffee machine.' },
  churrasco: { name: 'a churrasco', good: 'Endless skewers of picanha and samba until late. Everyone loves you now.', bad: 'The churrasqueiro quit mid-party and you had to grill. Badly.' },
  asado: { name: 'an asado', good: 'The asado lasted seven hours, as tradition demands. The team is bonded for life.', bad: 'You overcooked the meat. In Argentina. People will remember.' },
  tacos: { name: 'a taco party', good: 'Al pastor, salsa verde and a mariachi playlist. The team asked for this every Friday.', bad: 'The salsa was hotter than advertised and productivity suffered for days.' },
  cricket: { name: 'a friendly cricket match and a feast', good: 'The interns beat management by four wickets and everyone celebrated with biryani.', bad: 'The match got so competitive that two departments stopped talking to each other.' },
  hotpot: { name: 'a hot pot banquet', good: 'Bubbling broth, endless toasts and genuine team spirit.', bad: 'Someone ordered the extra-spicy broth for everyone. There were tears.' },
  banya: { name: 'a trip to the banya', good: 'Birch-branch whippings and herbal tea: the team came back glowing.', bad: 'The steam was so intense the sales team signed a peace treaty just to get out.' },
  kahvalti: { name: 'a long Turkish breakfast by the water', good: 'Thirty little plates, endless çay and nobody wanted to leave.', bad: 'Breakfast lasted until dinner and the afternoon was a write-off.' },
  desert: { name: 'a desert camping trip with Arabic coffee and dates', good: 'Dune bashing by day, stories around the fire by night. Unforgettable.', bad: 'The 4x4 got stuck in a dune and the team spent the night pushing it.' },
  owambe: { name: 'an owambe party', good: 'Everyone showed up in matching aso-ebi and danced until dawn.', bad: 'The DJ played the same three songs and the jollof ran out by 9 PM. Scandal.' },
  nyamaChoma: { name: 'a nyama choma afternoon', good: 'Roast goat, cold sodas and great music. The team loved it.', bad: 'The goat took four hours to roast and everyone got hangry.' },
  felucca: { name: 'a felucca cruise on the Nile', good: 'Sunset on the Nile with koshary for everyone. Pure magic.', bad: 'The wind died and the team spent three hours becalmed in the sun.' },
  islandTrip: { name: 'a weekend island trip', good: 'Beach volleyball, seafood and team spirit through the roof.', bad: 'The ferry was cancelled and you all spent the night in the terminal.' },
  boodleFight: { name: 'a boodle fight', good: 'Rice, adobo and lechon laid out on banana leaves; everyone ate with their hands and laughed a lot.', bad: 'The lechon was late and the team rioted. Politely.' },
  borrel: { name: 'a Friday borrel', good: 'Bitterballen and borrel talk; the team left grinning.', bad: 'Someone burned their mouth on a bitterbal and sulked all night.', drinks: true },
  taverna: { name: 'a taverna night with plate smashing', good: 'Souvlaki, ouzo and a lot of broken plates (paid for). Opa!', bad: 'The plate-smashing got out of hand and so did the bill.', drinks: true },
  escapeRoom: { name: 'an escape room', good: 'You escaped with two minutes to spare. The team feels unstoppable.', bad: 'You never escaped. Staff had to come and open the door. Twice.' },
  bowling: { name: 'a bowling night', good: 'Gutter balls, cheesy fries and a lot of laughing.', bad: 'Accounting accused marketing of cheating and the rivalry is now permanent.' },
  paintball: { name: 'a paintball day', good: 'The team took out the boss in the first round. They loved it. Morale is way up.', bad: 'Someone took it way too seriously and now HR is involved.' },
  hike: { name: 'a hiking trip and campfire', good: 'Fresh air, sore legs and great stories around the fire.', bad: 'The team got lost and blamed the "shortcut" you insisted on.' },
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
