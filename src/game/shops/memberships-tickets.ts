// Event tickets: concerts (fictional artists, local genres), sports (the country's own sports and
// leagues, teams named after local cities), theater & opera, comedy, festivals (local traditions
// and invented music festivals) and theme parks. Each category has a seeded per-year line-up; a
// ticket is a one-off purchase (no asset): pick a seat tier, maybe bring someone, and see what
// happens. Per-year limits stop spam; kids go with a parent, who usually pays.
import { hasTech } from '../history/timeline'
import { addCondition, companionCandidates, payingParents } from '../activities/common'
import { globalGoodsMult, nicePrice, salesTaxNote, seeded, yearKey, type SRng } from '../assets'
import {
  addHidden,
  addRelationship,
  addStat,
  count,
  formatMoney,
  inPrison,
  log,
  notice,
  relationLabel,
  remember,
  scriptChoice,
  spend,
  useYearAction,
  yearActionsUsed,
} from '../core'
import { isIndustryLegal, localMarket } from '../data/markets'
import { createPerson, notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { getCountry } from '../world'

export type TicketKind = 'concert' | 'sports' | 'theater' | 'comedy' | 'festival' | 'themepark'

const KINDS: TicketKind[] = ['concert', 'sports', 'theater', 'comedy', 'festival', 'themepark']

/** Max tickets per year, overall and per category. */
export const TICKETS_PER_YEAR = 6
export const TICKETS_PER_KIND = 3

export interface TicketTier {
  label: string
  price: number
}

export interface TicketEvent {
  /** Unique this year: `${year}:${kind}:${n}`. */
  id: string
  kind: TicketKind
  title: string
  /** Venue / league line. */
  where: string
  emoji: string
  minAge: number
  tiers: TicketTier[]
  /** For outcomes. */
  sport?: SportId
  genre?: string
  artist?: string
  home?: string
  away?: string
  alcohol?: boolean
  moments: string[]
}

// ---------------------------------------------------------------------------
// Prices

function safe(n: number, fallback = 1): number {
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Local ticket prices follow wages; big global events (Grand Prix, top tennis) less so. */
function ticketMult(g: GameState, globalShare: number): number {
  const labor = safe(localMarket(g).laborCost)
  const local = Math.min(1.7, Math.max(0.22, 0.15 + 0.85 * labor))
  return safe((1 - globalShare) * local + globalShare * globalGoodsMult(g))
}

const TIER_MULT = [1, 2, 4, 10]

function tiers(g: GameState, r: SRng, base: number, labels: string[], globalShare = 0): TicketTier[] {
  const m = ticketMult(g, globalShare) * r.float(0.9, 1.15)
  return labels.map((label, i) => ({ label, price: Math.max(1, nicePrice(base * TIER_MULT[i] * m)) }))
}

// ---------------------------------------------------------------------------
// Sports

export type SportId =
  | 'soccer'
  | 'baseball'
  | 'cricket'
  | 'iceHockey'
  | 'rugby'
  | 'sumo'
  | 'basketball'
  | 'americanFootball'
  | 'aussieRules'
  | 'motorRacing'
  | 'tennis'
  | 'kabaddi'
  | 'hurling'
  | 'handball'
  | 'volleyball'
  | 'luchaLibre'
  | 'camelRacing'
  | 'muayThai'
  | 'boxing'
  | 'polo'

interface SportDef {
  name: string
  emoji: string
  base: number
  globalShare?: number
  tiers: string[]
  /** 'match' = two teams, 'event' = a named event (Grand Prix, a sumo tournament, fight night). */
  format: 'match' | 'event'
  mascots?: string[]
  eventName?: (g: GameState, city: string) => string
  venue: string
  draws?: number
  moments: string[]
}

const SPORTS: Record<SportId, SportDef> = {
  soccer: {
    name: 'Soccer',
    emoji: '⚽',
    base: 30,
    tiers: ['Behind the Goal', 'Sideline', 'Premium Seats', 'Executive Box'],
    format: 'match',
    venue: 'Stadium',
    draws: 0.25,
    moments: [
      'The away fans sang for 90 straight minutes. You learned three new songs, none of them printable.',
      'You started a wave that went around the stadium twice.',
      'A ball flew into the stands and you headed it back. The crowd roared. Your neck hurts.',
      'A last-minute penalty sent the whole stadium into chaos.',
    ],
  },
  baseball: {
    name: 'Baseball',
    emoji: '⚾',
    base: 25,
    tiers: ['Bleachers', 'Infield', 'Field Level', 'Behind Home Plate'],
    format: 'match',
    mascots: ['Herons', 'Comets', 'Fireflies', 'Lanterns', 'Owls', 'Thunderbolts', 'Sea Otters', 'Dragonflies'],
    venue: 'Ballpark',
    moments: ['FOUL_BALL', 'BIG_SCREEN', 'You sang during the seventh-inning stretch like nobody was listening. Everybody was.', 'You ate four hot dogs. The game went to extra innings. So did your stomach.'],
  },
  cricket: {
    name: 'Cricket',
    emoji: '🏏',
    base: 18,
    tiers: ['General Stand', 'Pavilion End', 'Premium Stand', "Members' Pavilion"],
    format: 'match',
    mascots: ['Monsoons', 'Cobras', 'Falcons', 'Peacocks', 'Mongooses', 'Strikers', 'Tuskers', 'Comets'],
    venue: 'Cricket Ground',
    moments: ['CATCH_SIX', 'Rain stopped play for three hours. You ate everything in your bag and some of your neighbor\'s.', 'You got sunburned on exactly one side of your face.', 'The crowd chanted every single ball. You lost your voice by the second innings.'],
  },
  iceHockey: {
    name: 'Ice Hockey',
    emoji: '🏒',
    base: 45,
    tiers: ['Upper Deck', 'Lower Bowl', 'Center Ice', 'On the Glass'],
    format: 'match',
    mascots: ['Moose', 'Blizzard', 'Lumberjacks', 'Polar Bears', 'Lynx', 'Huskies', 'Avalanche Owls', 'Ice Wolves'],
    venue: 'Arena',
    moments: ['A fight broke out on the ice. The referees let them finish.', 'A puck flew over the glass and landed in your nachos.', 'BIG_SCREEN', 'You banged on the glass every time a player slammed into it.'],
  },
  rugby: {
    name: 'Rugby',
    emoji: '🏉',
    base: 30,
    tiers: ['Terrace', 'Grandstand', 'Halfway Line', 'Hospitality Box'],
    format: 'match',
    mascots: ['Kingfishers', 'Rams', 'Boars', 'Thunder', 'Albatrosses', 'Stags', 'Breakers', 'Cyclones'],
    venue: 'Park',
    moments: ['HAKA', 'A scrum collapsed right in front of you. You heard things you\'ll never unhear.', 'A last-minute try won it. Strangers hugged you.', 'It rained sideways the whole game. Nobody left.'],
  },
  sumo: {
    name: 'Sumo',
    emoji: '🤼',
    base: 70,
    tiers: ['Upper Gallery', 'Arena Chair', 'Box Seat (Masu)', 'Ringside'],
    format: 'event',
    eventName: (_g, city) => `${city} Grand Sumo Tournament`,
    venue: 'Sumo Hall',
    moments: ['ZABUTON', 'The wrestlers threw handfuls of salt into the ring. You felt purified by proxy.', 'A bout lasted three seconds. The buildup lasted four minutes. Perfect.', 'A wrestler tumbled out of the ring and nearly landed in your lap.'],
  },
  basketball: {
    name: 'Basketball',
    emoji: '🏀',
    base: 40,
    tiers: ['Nosebleeds', 'Lower Level', 'Premium Seats', 'Courtside'],
    format: 'match',
    mascots: ['Cyclones', 'Hornets', 'Flamingos', 'Rockets', 'Panthers', 'Volts', 'Jaguars', 'Firebirds'],
    venue: 'Arena',
    moments: ['BIG_SCREEN', 'HALF_COURT', 'A buzzer-beater three won it. The roof nearly came off.', 'A player dove into the crowd for a loose ball and landed on your popcorn.'],
  },
  americanFootball: {
    name: 'Football',
    emoji: '🏈',
    base: 75,
    tiers: ['Upper Deck', 'End Zone', '50-Yard Line', 'Luxury Suite'],
    format: 'match',
    mascots: ['Stallions', 'Thunderbirds', 'Grizzlies', 'Pioneers', 'Barracudas', 'Bobcats', 'Admirals', 'Coyotes'],
    venue: 'Stadium',
    moments: ['You tailgated for four hours before the game and barely remember kickoff.', 'BIG_SCREEN', 'A touchdown in the final seconds. A stranger lifted you off the ground.', 'You painted your face in team colors. It did not come off for three days.'],
  },
  aussieRules: {
    name: 'Aussie Rules Football',
    emoji: '🏉',
    base: 28,
    tiers: ['General Admission', 'Reserved Seat', 'Wing Seat', 'Corporate Box'],
    format: 'match',
    mascots: ['Magpies', 'Seagulls', 'Kangaroos', 'Wombats', 'Kookaburras', 'Sharks', 'Possums', 'Dingoes'],
    venue: 'Oval',
    moments: ['A massive mark right in front of you. The crowd went off.', 'You yelled "BALL!" at every tackle like a true local.', 'BIG_SCREEN', 'You ate a meat pie so hot it rewrote your understanding of temperature.'],
  },
  motorRacing: {
    name: 'Motor Racing',
    emoji: '🏎️',
    base: 140,
    globalShare: 0.6,
    tiers: ['General Admission', 'Grandstand', 'Pit Lane Pass', 'Paddock Club'],
    format: 'event',
    eventName: (g) => `${getCountry(g.character.countryId).name} Grand Prix`,
    venue: 'Circuit',
    moments: ['The cars went past so fast and loud that your bones vibrated.', 'There was a crash on lap one. Everyone was fine. Your heart was not.', 'A driver threw his gloves into the crowd. They landed two rows behind you.', 'Your earplugs fell out on the first lap. You can still hear the engines.'],
  },
  tennis: {
    name: 'Tennis',
    emoji: '🎾',
    base: 55,
    globalShare: 0.4,
    tiers: ['Upper Tier', 'Lower Tier', 'Center Court', "Players' Box"],
    format: 'event',
    eventName: (_g, city) => `${city} Open`,
    venue: 'Tennis Center',
    moments: ['A five-set thriller. Your neck is stiff from all the left-right-left.', 'A ball kid made a diving save and got a standing ovation.', 'Someone\'s phone rang on match point. The umpire said "Thank you" with real menace.', 'BIG_SCREEN'],
  },
  kabaddi: {
    name: 'Kabaddi',
    emoji: '🤼',
    base: 8,
    tiers: ['General Stand', 'Upper Stand', 'Mat-Side', 'VIP Box'],
    format: 'match',
    mascots: ['Panthers', 'Titans', 'Warriors', 'Bulls', 'Steelers', 'Pirates'],
    venue: 'Indoor Stadium',
    moments: ['The raider got tackled by four defenders at once. The crowd lost its mind.', 'You chanted "kabaddi kabaddi" with ten thousand people. Goosebumps.', 'BIG_SCREEN'],
  },
  hurling: {
    name: 'Hurling',
    emoji: '🏑',
    base: 30,
    tiers: ['Hill Terrace', 'Stand', 'Premium Level', 'Corporate Box'],
    format: 'match',
    venue: 'Park',
    moments: ['The sliotar flew so fast you only saw it in the replay.', 'A county final atmosphere: you were hoarse by half time.', 'The players had sticks, no padding and no fear. You had a sandwich.'],
  },
  handball: {
    name: 'Handball',
    emoji: '🤾',
    base: 20,
    tiers: ['Upper Ring', 'Lower Ring', 'Courtside', 'VIP Lounge'],
    format: 'match',
    mascots: ['Vikings', 'Lions', 'Eagles', 'Wolves', 'Hammers', 'Storm'],
    venue: 'Hall',
    moments: ['Forty goals and nobody sat down once.', 'The goalkeeper saved a penalty with his face. The crowd gave him a standing ovation.', 'BIG_SCREEN'],
  },
  volleyball: {
    name: 'Volleyball',
    emoji: '🏐',
    base: 18,
    tiers: ['Upper Level', 'Lower Level', 'Courtside', 'VIP Box'],
    format: 'match',
    mascots: ['Sharks', 'Spikers', 'Condors', 'Tigers', 'Hurricanes', 'Falcons'],
    venue: 'Arena',
    moments: ['A spike hit the floor so hard you felt it in your seat.', 'A 40-shot rally ended in a dive that brought everyone to their feet.', 'BIG_SCREEN'],
  },
  luchaLibre: {
    name: 'Lucha Libre',
    emoji: '🤼',
    base: 18,
    tiers: ['Balcony', 'General', 'Ringside', 'VIP Ringside'],
    format: 'event',
    eventName: (_g, city) => `Lucha Libre Night in ${city}`,
    venue: 'Arena',
    moments: ['A masked luchador did a backflip off the top rope and landed in your row.', 'You bought a sparkly mask and wore it for the rest of the night.', 'The villain cheated, the crowd booed, and you have never been happier.'],
  },
  camelRacing: {
    name: 'Camel Racing',
    emoji: '🐪',
    base: 6,
    tiers: ['Public Stand', 'Grandstand', 'Majlis Tent', 'Royal Enclosure'],
    format: 'event',
    eventName: (_g, city) => `${city} Camel Racing Festival`,
    venue: 'Racetrack',
    moments: ['The camels were ridden by tiny robot jockeys with whips. The future is weird.', 'Owners chased the race in SUVs alongside the track, shouting into walkie-talkies.', 'A camel stopped mid-race to stare at the crowd. It finished last with dignity.'],
  },
  muayThai: {
    name: 'Muay Thai',
    emoji: '🥊',
    base: 30,
    tiers: ['Third Class', 'Second Class', 'Ringside', 'VIP Ringside'],
    format: 'event',
    eventName: (_g, city) => `Muay Thai Fight Night in ${city}`,
    venue: 'Boxing Stadium',
    moments: ['The fighters performed the ritual dance before the bout. The music got into your bones.', 'A flying knee ended it in the first round. You winced for both of them.', 'The gamblers in the stands were louder than the fight.'],
  },
  boxing: {
    name: 'Boxing',
    emoji: '🥊',
    base: 60,
    tiers: ['Upper Tier', 'Floor', 'Ringside', 'VIP Ringside'],
    format: 'event',
    eventName: (_g, city) => `Title Fight Night in ${city}`,
    venue: 'Arena',
    moments: ['A knockout in the fourth round. The arena exploded.', 'Twelve rounds and a split decision. Everyone around you disagreed with it.', 'BIG_SCREEN'],
  },
  polo: {
    name: 'Polo',
    emoji: '🐎',
    base: 25,
    tiers: ['General Lawn', 'Grandstand', 'Members\' Stand', 'VIP Marquee'],
    format: 'event',
    eventName: (_g, city) => `${city} Polo Open`,
    venue: 'Polo Grounds',
    moments: ['At half time you stomped the divots back into the field with everyone else. Very civilized.', 'A horse galloped so close that you got a face full of turf.', 'You drank something with a sprig of mint in it and said "jolly good" unironically.'],
  },
}

/** The sports people actually go to in each country, most popular first. */
const COUNTRY_SPORTS: Record<string, SportId[]> = {
  us: ['americanFootball', 'baseball', 'basketball', 'iceHockey', 'soccer', 'motorRacing', 'tennis', 'boxing'],
  ca: ['iceHockey', 'basketball', 'baseball', 'soccer', 'motorRacing'],
  mx: ['soccer', 'luchaLibre', 'baseball', 'boxing', 'motorRacing'],
  cu: ['baseball', 'boxing', 'volleyball', 'soccer'],
  do: ['baseball', 'basketball', 'boxing'],
  pr: ['baseball', 'basketball', 'boxing'],
  aw: ['baseball', 'soccer'],
  bs: ['basketball', 'soccer', 'cricket'],
  jm: ['cricket', 'soccer'],
  gy: ['cricket', 'soccer'],
  ni: ['baseball', 'soccer', 'boxing'],
  pa: ['baseball', 'soccer', 'boxing'],
  ve: ['baseball', 'soccer', 'basketball'],
  br: ['soccer', 'volleyball', 'motorRacing', 'basketball'],
  ar: ['soccer', 'rugby', 'polo', 'basketball', 'tennis'],
  uy: ['soccer', 'rugby', 'basketball'],
  gb: ['soccer', 'cricket', 'rugby', 'tennis', 'motorRacing'],
  ie: ['hurling', 'rugby', 'soccer'],
  fr: ['soccer', 'rugby', 'tennis', 'handball', 'basketball'],
  de: ['soccer', 'handball', 'iceHockey', 'basketball', 'motorRacing'],
  es: ['soccer', 'basketball', 'tennis', 'motorRacing'],
  it: ['soccer', 'motorRacing', 'volleyball', 'rugby', 'basketball'],
  fi: ['iceHockey', 'soccer'],
  se: ['iceHockey', 'soccer', 'handball'],
  no: ['soccer', 'handball'],
  dk: ['soccer', 'handball'],
  ru: ['iceHockey', 'soccer', 'basketball', 'boxing'],
  cz: ['iceHockey', 'soccer'],
  sk: ['iceHockey', 'soccer'],
  ch: ['iceHockey', 'soccer', 'tennis'],
  at: ['soccer', 'iceHockey', 'motorRacing'],
  mc: ['motorRacing', 'soccer', 'tennis'],
  gr: ['soccer', 'basketball'],
  rs: ['basketball', 'soccer'],
  hr: ['soccer', 'handball'],
  hu: ['soccer', 'handball', 'motorRacing'],
  pl: ['soccer', 'volleyball'],
  ro: ['soccer', 'handball', 'rugby'],
  pt: ['soccer', 'motorRacing'],
  nl: ['soccer', 'motorRacing'],
  be: ['soccer', 'motorRacing'],
  ua: ['soccer', 'boxing'],
  ee: ['basketball', 'soccer'],
  tr: ['soccer', 'basketball', 'volleyball'],
  ge: ['rugby', 'soccer'],
  il: ['soccer', 'basketball'],
  ae: ['soccer', 'camelRacing', 'motorRacing', 'tennis'],
  sa: ['soccer', 'camelRacing', 'motorRacing', 'boxing'],
  qa: ['soccer', 'camelRacing', 'motorRacing', 'tennis'],
  kw: ['soccer', 'camelRacing'],
  ir: ['soccer', 'volleyball'],
  lb: ['basketball', 'soccer'],
  jo: ['soccer', 'basketball'],
  za: ['soccer', 'rugby', 'cricket'],
  ke: ['soccer', 'rugby'],
  zw: ['soccer', 'cricket'],
  in: ['cricket', 'kabaddi', 'soccer'],
  pk: ['cricket', 'soccer'],
  bd: ['cricket', 'soccer', 'kabaddi'],
  np: ['cricket', 'soccer'],
  af: ['cricket', 'soccer'],
  jp: ['baseball', 'sumo', 'soccer', 'basketball', 'motorRacing'],
  kr: ['baseball', 'soccer', 'basketball'],
  tw: ['baseball', 'basketball'],
  cn: ['soccer', 'basketball', 'motorRacing'],
  ph: ['basketball', 'boxing'],
  th: ['muayThai', 'soccer'],
  my: ['soccer', 'motorRacing'],
  sg: ['soccer', 'motorRacing'],
  kz: ['iceHockey', 'soccer', 'boxing'],
  au: ['aussieRules', 'cricket', 'rugby', 'tennis', 'motorRacing', 'soccer'],
  nz: ['rugby', 'cricket'],
  pg: ['rugby', 'soccer'],
  ws: ['rugby'],
}

export function sportsFor(countryId: string): SportId[] {
  return COUNTRY_SPORTS[countryId] ?? ['soccer', 'basketball']
}

type SoccerStyle = 'hispanic' | 'lusophone' | 'italian' | 'german' | 'french' | 'british' | 'eastern' | 'turkish' | 'arabic' | 'african' | 'generic'

function soccerStyle(cid: string): SoccerStyle {
  if (['es', 'mx', 'ar', 'co', 'cl', 'pe', 've', 'ec', 'bo', 'py', 'uy', 'cr', 'gt', 'sv', 'ni', 'pa', 'do', 'cu', 'pr', 'bz'].includes(cid)) return 'hispanic'
  if (['br', 'pt', 'ao'].includes(cid)) return 'lusophone'
  if (['it'].includes(cid)) return 'italian'
  if (['de', 'at', 'ch'].includes(cid)) return 'german'
  if (['fr', 'be', 'mc', 'dj', 'cd'].includes(cid)) return 'french'
  if (['gb', 'ie', 'au', 'nz', 'us', 'ca', 'jm', 'bs', 'gy'].includes(cid)) return 'british'
  if (['ru', 'ua', 'rs', 'hr', 'cz', 'sk', 'pl', 'ro', 'hu', 'ee', 'ge', 'kz', 'mn'].includes(cid)) return 'eastern'
  if (cid === 'tr') return 'turkish'
  if (['eg', 'ma', 'dz', 'tn', 'sa', 'ae', 'qa', 'kw', 'jo', 'lb', 'sy', 'iq'].includes(cid)) return 'arabic'
  if (['ng', 'ke', 'ug', 'zw', 'za', 'et'].includes(cid)) return 'african'
  return 'generic'
}

const SOCCER_PATTERNS: Record<SoccerStyle, string[]> = {
  hispanic: ['Club Deportivo {c}', 'Atlético {c}', 'Real {c}', 'Deportivo {c}', '{c} FC'],
  lusophone: ['Esporte Clube {c}', 'Sport Club {c}', 'Atlético {c}', '{c} Futebol Clube'],
  italian: ['AC {c}', 'US {c}', '{c} Calcio', 'Sporting {c}'],
  german: ['FC {c}', 'SV {c}', 'Borussia {c}', 'Union {c}'],
  french: ['Olympique {c}', 'AS {c}', 'Stade {c}', 'FC {c}'],
  british: ['{c} United', '{c} City', '{c} Rovers', '{c} Athletic', '{c} Wanderers', '{c} Town'],
  eastern: ['Dynamo {c}', 'Lokomotiv {c}', 'FK {c}', 'Sparta {c}'],
  turkish: ['{c}spor', '{c} Gençlik', '{c} Belediyespor'],
  arabic: ['{c} SC', 'Ittihad {c}', 'Shabab {c}', 'Ahli {c}'],
  african: ['{c} United', '{c} Stars', '{c} Rangers', '{c} City', '{c} Warriors'],
  generic: ['{c} FC', '{c} United', 'Sporting {c}', '{c} City'],
}

function teamName(g: GameState, r: SRng, sport: SportId, city: string): string {
  if (sport === 'soccer') return r.pick(SOCCER_PATTERNS[soccerStyle(g.character.countryId)]).replace('{c}', city)
  if (sport === 'hurling') return city
  return `${city} ${r.pick(SPORTS[sport].mascots ?? ['Comets'])}`
}

// ---------------------------------------------------------------------------
// Concerts

interface GenreDef {
  label: string
  emoji: string
  artists: string[]
  venue: string
  base: number
  minAge?: number
  mosh?: boolean
}

const GENRES: Record<string, GenreDef> = {
  pop: { label: 'Pop', emoji: '🎤', artists: ['Lexi Starling', 'Nova Rae', 'Jaxon Bright', 'The Glitter Theory'], venue: 'Arena', base: 55 },
  rock: { label: 'Rock', emoji: '🎸', artists: ['The Rusty Hinges', 'Velvet Thunder', 'Parking Lot Prophets', 'Static Saints'], venue: 'Amphitheater', base: 45, mosh: true },
  hiphop: { label: 'Hip-Hop', emoji: '🎧', artists: ['Lil Overdraft', 'MC Mortgage', 'Big Tuition', 'Yung Deductible'], venue: 'Arena', base: 50, minAge: 13 },
  edm: { label: 'EDM', emoji: '🎛️', artists: ['DJ Kilowatt', 'Subwoofer Sally', 'Neon Ferret'], venue: 'Warehouse', base: 40, minAge: 16 },
  indie: { label: 'Indie', emoji: '🎸', artists: ['Cardigan Weather', 'The Polite Strangers', 'Lake Effect'], venue: 'Music Hall', base: 30 },
  metal: { label: 'Metal', emoji: '🤘', artists: ['Grave Mistake', 'Iron Lungfish', 'Doom Kittens'], venue: 'Club', base: 35, minAge: 13, mosh: true },
  jazz: { label: 'Jazz', emoji: '🎷', artists: ['The Blue Hour Quintet', 'Miles Apart Trio', 'Velma Brooks'], venue: 'Jazz Club', base: 35 },
  classical: { label: 'Classical', emoji: '🎻', artists: ['{city} Philharmonic', '{city} Symphony Orchestra', 'the Chamber Strings of {city}'], venue: 'Concert Hall', base: 35 },
  country: { label: 'Country', emoji: '🤠', artists: ['Dusty Wade', 'Tammy Lynn Holler', 'The Tumbleweed Brothers'], venue: 'Amphitheater', base: 45 },
  kpop: { label: 'K-Pop', emoji: '💜', artists: ['STARDUST7', 'LUMI:NA', 'NEON BLOSSOM'], venue: 'Stadium', base: 85 },
  trot: { label: 'Trot', emoji: '🎙️', artists: ['Kim Bong-sun', 'The Trot Aunties'], venue: 'Concert Hall', base: 50 },
  jpop: { label: 'J-Pop', emoji: '🌸', artists: ['Sakura Drop', 'Mirai Twinkle', 'Kenta Sorano'], venue: 'Dome', base: 70 },
  enka: { label: 'Enka', emoji: '🎙️', artists: ['Haruko Misaki', 'Tetsuo Kawabata'], venue: 'Concert Hall', base: 60 },
  cpop: { label: 'Mandopop', emoji: '🎤', artists: ['Wei Lan', 'Moonlight Avenue', 'Chen Xiaoyu'], venue: 'Arena', base: 55 },
  cantopop: { label: 'Cantopop', emoji: '🎤', artists: ['Candy Lok', 'The Harbour Lights'], venue: 'Coliseum', base: 60 },
  bollywood: { label: 'Bollywood', emoji: '🎬', artists: ['Priya Raghavan', 'Rohan Malhotra', 'The Filmi Orchestra'], venue: 'Stadium', base: 30 },
  bhangra: { label: 'Bhangra', emoji: '🥁', artists: ['Punjab Dhol Express', 'Jassi Sandhu'], venue: 'Grounds', base: 25 },
  qawwali: { label: 'Qawwali', emoji: '🎶', artists: ['Ustad Faiz Qadri & Party', 'The Sufi Brothers of Lahore'], venue: 'Shrine Courtyard', base: 15 },
  afrobeats: { label: 'Afrobeats', emoji: '🔥', artists: ['Kola Wave', 'Adaeze Gold', 'Ola Breeze'], venue: 'Arena', base: 40 },
  highlife: { label: 'Highlife', emoji: '🎺', artists: ['The Lagos Highlife Collective', 'Chief Emeka & His Dance Band'], venue: 'Club', base: 20 },
  amapiano: { label: 'Amapiano', emoji: '🎹', artists: ['Log Drum Kings', 'DJ Thabo Sunset'], venue: 'Dome', base: 30, minAge: 16 },
  reggaeton: { label: 'Reggaeton', emoji: '🔥', artists: ['El Profeta', 'La Nena Fuego', 'Yung Perreo'], venue: 'Arena', base: 50, minAge: 13 },
  salsa: { label: 'Salsa', emoji: '💃', artists: ['Orquesta La Candela', 'Ray Montero y Su Son'], venue: 'Ballroom', base: 30 },
  bachata: { label: 'Merengue & Bachata', emoji: '💃', artists: ['Los Hermanos Quisqueya', 'Julio Bachatero'], venue: 'Amphitheater', base: 30 },
  samba: { label: 'Samba & Sertanejo', emoji: '🥁', artists: ['Zé & Tião', 'Marina Batucada', 'Unidos do Sol'], venue: 'Arena', base: 35 },
  tango: { label: 'Tango', emoji: '🌹', artists: ['Orquesta Típica La Milonga', 'Lucía Varela'], venue: 'Teatro', base: 30 },
  cumbia: { label: 'Cumbia & Vallenato', emoji: '🪗', artists: ['Los Cumbiamberos del Sol', 'Los Acordeones de Oro'], venue: 'Coliseo', base: 25 },
  mariachi: { label: 'Mariachi & Banda', emoji: '🎺', artists: ['Mariachi Los Halcones', 'Banda La Tormenta'], venue: 'Plaza', base: 30 },
  andean: { label: 'Andean Folk', emoji: '🪈', artists: ['Inti Wayra', 'Los Vientos del Ande'], venue: 'Coliseo', base: 20 },
  reggae: { label: 'Reggae & Dancehall', emoji: '🇯🇲', artists: ['Irie Roots', 'Selecta Lightning', 'Blue Mountain Sound'], venue: 'Beach Stage', base: 35 },
  kompa: { label: 'Kompa', emoji: '🎸', artists: ['Konpa Kreyòl All-Stars'], venue: 'Club', base: 20 },
  soca: { label: 'Soca & Calypso', emoji: '🥁', artists: ['Mighty Sparkplug', 'Lady Bacchanal'], venue: 'Beach Stage', base: 30 },
  fado: { label: 'Fado', emoji: '🎸', artists: ['Inês Saudade', 'Rui Alfama'], venue: 'Fado House', base: 30 },
  flamenco: { label: 'Flamenco', emoji: '💃', artists: ['Compañía Duende', 'Paco del Sur'], venue: 'Tablao', base: 35 },
  chanson: { label: 'Chanson', emoji: '🎙️', artists: ['Margaux Lefèvre', 'Les Parapluies'], venue: 'Music Hall', base: 45 },
  schlager: { label: 'Schlager', emoji: '🎤', artists: ['Die Fröhlichen Flamingos', 'Helga & the Heartbeats'], venue: 'Halle', base: 45 },
  techno: { label: 'Techno', emoji: '🎛️', artists: ['Bunker Bass Collective', 'DJ Stahlwerk'], venue: 'Club', base: 25, minAge: 18 },
  europop: { label: 'Euro-Pop', emoji: '✨', artists: ['Midnight Sun Disco', 'The Glitterfjords'], venue: 'Arena', base: 50 },
  celtic: { label: 'Celtic Folk', emoji: '☘️', artists: ['The Foggy Dew Ramblers', 'Siobhán & the Shamrocks'], venue: 'Pub Stage', base: 25 },
  grime: { label: 'Grime & Brit-Pop', emoji: '🎤', artists: ['The Wet Pavements', 'Roadman Ronnie'], venue: 'Academy', base: 40, minAge: 13 },
  balkan: { label: 'Balkan Brass & Turbo-Folk', emoji: '🎺', artists: ['Zvezda Balkan', 'Orkestar Trubači'], venue: 'Arena', base: 25 },
  discopolo: { label: 'Disco Polo', emoji: '🪩', artists: ['Zespół Gwiazdka', 'Boys of the Vistula'], venue: 'Hall', base: 25 },
  russianpop: { label: 'Russian Pop', emoji: '🎤', artists: ['Masha Zvezda', 'Gruppa Avrora'], venue: 'Arena', base: 40 },
  arabicpop: { label: 'Arabic Pop', emoji: '🎶', artists: ['Yasmine Nour', 'Karim El Layali', 'Faisal Al-Bahr'], venue: 'Arena', base: 45 },
  rai: { label: 'Raï & Gnawa', emoji: '🪘', artists: ['Cheb Amine', 'Maâlem Youssef Gnawa'], venue: 'Festival Stage', base: 20 },
  turkishpop: { label: 'Turkish Pop', emoji: '🎤', artists: ['Deniz Yıldız', 'Kemal & the Bosphorus Band'], venue: 'Open-Air Theater', base: 35 },
  persianpop: { label: 'Persian Pop', emoji: '🎶', artists: ['Leila Setareh', 'Dariush Ahangar'], venue: 'Concert Hall', base: 25 },
  rumba: { label: 'Congolese Rumba', emoji: '🎸', artists: ['Papa Lokua & Orchestre Kinshasa', 'Les Étoiles du Fleuve'], venue: 'Stade', base: 15 },
  kizomba: { label: 'Kizomba & Kuduro', emoji: '💃', artists: ['Kizomba Kings of Luanda', 'DJ Semba'], venue: 'Arena', base: 25 },
  gengetone: { label: 'Gengetone & Benga', emoji: '🎧', artists: ['Nairobi Gengetone Crew', 'Benga Brothers'], venue: 'Grounds', base: 15, minAge: 13 },
  ethiojazz: { label: 'Ethio-Jazz', emoji: '🎷', artists: ['Addis Groove Ensemble', 'Tizita Five'], venue: 'Jazz Club', base: 20 },
  dangdut: { label: 'Dangdut', emoji: '🎤', artists: ['Ratu Dangdut Rina', 'Orkes Melayu Bintang'], venue: 'Field Stage', base: 15 },
  opm: { label: 'OPM', emoji: '🎸', artists: ['The Jeepney Kings', 'Mayumi Santos'], venue: 'Coliseum', base: 25 },
  thaipop: { label: 'Luk Thung & T-Pop', emoji: '🎤', artists: ['Dao Isan Band', 'Ploy & the Orchids'], venue: 'Arena', base: 25 },
  vpop: { label: 'V-Pop', emoji: '🎤', artists: ['Linh Lan', 'Saigon Neon'], venue: 'Stadium', base: 25 },
  qpop: { label: 'Q-Pop', emoji: '🎤', artists: ['Steppe Signal', 'Aru Nur'], venue: 'Arena', base: 30 },
  mongolrock: { label: 'Mongolian Folk Rock', emoji: '🐎', artists: ['Horsehead Fiddle Thunder', 'Throat Song Collective'], venue: 'Central Stadium', base: 20 },
  pacific: { label: 'Pacific Reggae', emoji: '🌺', artists: ['Pacific Roots Collective', 'Island Breeze Band'], venue: 'Beach Stage', base: 20 },
}

const GLOBAL_GENRES = ['pop', 'rock', 'hiphop', 'edm', 'indie', 'metal', 'jazz', 'classical']

const COUNTRY_GENRES: Record<string, string[]> = {
  us: ['country', 'hiphop'],
  ca: ['indie', 'country'],
  mx: ['mariachi', 'reggaeton', 'cumbia'],
  cu: ['salsa'],
  do: ['bachata', 'reggaeton'],
  pr: ['reggaeton', 'salsa'],
  jm: ['reggae'],
  ht: ['kompa'],
  bs: ['soca', 'reggae'],
  aw: ['soca'],
  gy: ['soca'],
  bz: ['reggae', 'cumbia'],
  cr: ['reggaeton', 'cumbia'],
  sv: ['cumbia', 'reggaeton'],
  gt: ['cumbia', 'reggaeton'],
  ni: ['cumbia', 'reggaeton'],
  pa: ['reggaeton', 'salsa'],
  br: ['samba'],
  ar: ['tango', 'cumbia', 'rock'],
  co: ['cumbia', 'reggaeton', 'salsa'],
  ve: ['salsa', 'reggaeton'],
  pe: ['andean', 'cumbia'],
  bo: ['andean'],
  ec: ['andean', 'reggaeton'],
  cl: ['andean', 'reggaeton'],
  py: ['cumbia'],
  uy: ['tango', 'cumbia'],
  gb: ['grime', 'indie'],
  ie: ['celtic'],
  fr: ['chanson', 'edm'],
  be: ['techno', 'chanson'],
  de: ['techno', 'schlager'],
  at: ['schlager', 'classical'],
  ch: ['schlager', 'classical'],
  nl: ['techno', 'edm'],
  se: ['europop'],
  no: ['europop', 'metal'],
  fi: ['metal', 'europop'],
  dk: ['europop'],
  ee: ['europop'],
  es: ['flamenco', 'reggaeton'],
  pt: ['fado'],
  it: ['classical', 'pop'],
  gr: ['balkan'],
  rs: ['balkan'],
  hr: ['balkan'],
  ro: ['balkan'],
  hu: ['balkan', 'classical'],
  pl: ['discopolo'],
  ru: ['russianpop'],
  ua: ['russianpop', 'rock'],
  kz: ['qpop'],
  mn: ['mongolrock'],
  tr: ['turkishpop'],
  ir: ['persianpop'],
  il: ['pop', 'rock'],
  eg: ['arabicpop'],
  lb: ['arabicpop'],
  jo: ['arabicpop'],
  sy: ['arabicpop'],
  iq: ['arabicpop'],
  sa: ['arabicpop'],
  ae: ['arabicpop', 'edm'],
  qa: ['arabicpop'],
  kw: ['arabicpop'],
  ma: ['rai'],
  dz: ['rai'],
  tn: ['rai', 'arabicpop'],
  ng: ['afrobeats', 'highlife'],
  za: ['amapiano'],
  ke: ['gengetone'],
  ug: ['afrobeats'],
  et: ['ethiojazz'],
  cd: ['rumba'],
  ao: ['kizomba'],
  zw: ['afrobeats'],
  dj: ['arabicpop'],
  in: ['bollywood', 'bhangra'],
  pk: ['qawwali', 'bollywood'],
  bd: ['bollywood'],
  np: ['bollywood'],
  af: ['qawwali'],
  jp: ['jpop', 'enka'],
  kr: ['kpop', 'trot'],
  cn: ['cpop'],
  tw: ['cpop'],
  hk: ['cantopop'],
  sg: ['cpop', 'kpop'],
  my: ['cpop', 'kpop'],
  ph: ['opm', 'kpop'],
  th: ['thaipop', 'kpop'],
  vn: ['vpop', 'kpop'],
  id: ['dangdut', 'kpop'],
  au: ['indie', 'rock'],
  nz: ['indie', 'pacific'],
  ws: ['pacific'],
  pg: ['pacific'],
}

// ---------------------------------------------------------------------------
// Theater, comedy, festivals, theme parks

interface ShowDef {
  title: string
  emoji: string
  base: number
  venue: string
  minAge?: number
}

const SHOWS: ShowDef[] = [
  { title: 'Hamlet', emoji: '💀', base: 40, venue: 'Playhouse' },
  { title: 'A Midsummer Night\'s Dream', emoji: '🧚', base: 35, venue: 'Open-Air Theater' },
  { title: 'Macbeth', emoji: '🗡️', base: 40, venue: 'Playhouse' },
  { title: 'The Barber of Seville (opera)', emoji: '🎭', base: 60, venue: 'Opera House' },
  { title: 'Carmen (opera)', emoji: '🌹', base: 65, venue: 'Opera House' },
  { title: 'La Traviata (opera)', emoji: '🎭', base: 65, venue: 'Opera House' },
  { title: 'Swan Lake (ballet)', emoji: '🩰', base: 55, venue: 'Ballet Theater' },
  { title: 'The Nutcracker (ballet)', emoji: '🩰', base: 50, venue: 'Ballet Theater' },
  { title: 'Tax Season: The Musical', emoji: '🎶', base: 70, venue: 'Grand Theater' },
  { title: 'Grandma Got a Motorcycle', emoji: '🏍️', base: 65, venue: 'Grand Theater' },
  { title: 'Neon Lagoon', emoji: '🌊', base: 75, venue: 'Grand Theater' },
  { title: 'The Lighthouse Keeper\'s Daughter', emoji: '🗼', base: 45, venue: 'Playhouse' },
  { title: 'Dancing on the Overpass', emoji: '💃', base: 70, venue: 'Grand Theater' },
  { title: 'Murder at the Bake Sale', emoji: '🧁', base: 40, venue: 'Playhouse' },
  { title: 'Cirque des Étoiles (acrobatics)', emoji: '🎪', base: 80, venue: 'Big Top' },
]

/** Traditional and local stage forms. */
const LOCAL_SHOWS: Record<string, ShowDef[]> = {
  jp: [
    { title: 'Kabuki: The Forty-Seven Ronin', emoji: '👺', base: 60, venue: 'Kabuki Theater' },
    { title: 'All-Female Musical Revue: Rose of the Seine', emoji: '🌹', base: 70, venue: 'Grand Theater' },
  ],
  cn: [{ title: 'Peking Opera: The Monkey King', emoji: '🐒', base: 30, venue: 'Opera House' }],
  tw: [{ title: 'Taiwanese Opera: The Butterfly Lovers', emoji: '🦋', base: 25, venue: 'Opera House' }],
  hk: [{ title: 'Cantonese Opera: The Purple Hairpin', emoji: '🎭', base: 40, venue: 'Opera Theater' }],
  in: [
    { title: 'Bollywood Stage Spectacular', emoji: '🎬', base: 25, venue: 'Auditorium' },
    { title: 'Kathakali Dance Drama', emoji: '🎭', base: 10, venue: 'Kalari Hall' },
  ],
  id: [{ title: 'Wayang Kulit Shadow Puppets', emoji: '🕯️', base: 8, venue: 'Pendopo' }],
  vn: [{ title: 'Water Puppet Theater', emoji: '🐉', base: 8, venue: 'Water Puppet Theater' }],
  kr: [{ title: 'Pansori Epic: The Song of Chunhyang', emoji: '🪭', base: 30, venue: 'National Theater' }],
  es: [{ title: 'Flamenco Night: Duende', emoji: '💃', base: 35, venue: 'Tablao' }],
  ar: [{ title: 'Tango Show: Noches de Buenos Aires', emoji: '🌹', base: 45, venue: 'Tango House' }],
  gb: [{ title: 'A West End Musical: The Chimney Sweep\'s Ball', emoji: '🎩', base: 75, venue: 'West End Theatre' }],
  us: [{ title: 'Broadway Revival: Moonshine & Mayhem', emoji: '🎩', base: 110, venue: 'Broadway Theater' }],
  ru: [{ title: 'The Firebird (ballet)', emoji: '🔥', base: 45, venue: 'Grand Ballet Theater' }],
  it: [{ title: 'Opera Under the Stars: Aida', emoji: '🏛️', base: 70, venue: 'Roman Arena' }],
  at: [{ title: 'The Magic Flute (opera)', emoji: '🪈', base: 70, venue: 'State Opera' }],
  gr: [{ title: 'Ancient Tragedy: Medea', emoji: '🏛️', base: 35, venue: 'Ancient Theater' }],
  tr: [{ title: 'Whirling Dervish Ceremony', emoji: '🌀', base: 25, venue: 'Cultural Center' }],
  eg: [{ title: 'Sound & Light Show at the Pyramids', emoji: '🔺', base: 25, venue: 'Giza Plateau' }],
  mx: [{ title: 'Ballet Folklórico', emoji: '💃', base: 30, venue: 'Palace of Fine Arts' }],
  nz: [{ title: 'Kapa Haka Performance', emoji: '🌿', base: 25, venue: 'Marae Stage' }],
  ie: [{ title: 'Irish Dance Spectacular: River of Feet', emoji: '☘️', base: 45, venue: 'Gaiety Theater' }],
  th: [{ title: 'Khon Masked Dance Drama', emoji: '👹', base: 25, venue: 'Royal Theater' }],
}

const COMEDIANS = ['Dave Pemberton', 'Tasha Okoro', 'The Unfunny Uncles', 'Rita Moreno-Vance', 'Big Lenny Fields', 'Priya "No Filter" Nair', 'Jens Kowalski', 'Marco Bellucci', 'Aiko Tanabe', 'Kwame Mensah']
const SET_NAMES = ['Live and Mildly Offended', 'My Therapist Says This Is Fine', 'Dad Jokes for Adults', 'The Midlife Crisis Tour', 'Please Clap', 'Tales From the Group Chat', 'I Have Notes']

interface FestivalDef {
  name: string
  emoji: string
  base: number
  minAge: number
  music?: boolean
  alcohol?: boolean
  moments: string[]
}

const MUSIC_FESTIVALS: FestivalDef[] = [
  { name: 'Dustbowl Music Festival', emoji: '🎪', base: 150, minAge: 16, music: true, moments: ['MUD', 'You saw your favorite band from so far away they were the size of ants. Perfect.', 'You found a new favorite band at a tiny stage at 2 a.m.'] },
  { name: 'Sunset Valley Fest', emoji: '🌅', base: 130, minAge: 16, music: true, moments: ['You danced through the sunset set with 30,000 strangers.', 'You lost your friends at noon and found them at midnight.', 'MUD'] },
  { name: '{city} Jazz & Blues Weekend', emoji: '🎷', base: 70, minAge: 8, music: true, moments: ['A saxophone solo made a grown man next to you cry.', 'You discovered you love jazz. You also discovered you can\'t snap on the off-beat.'] },
]

const LOCAL_FESTIVALS: Record<string, FestivalDef[]> = {
  br: [{ name: 'Carnival Parade (Sambadrome Seats)', emoji: '🎭', base: 40, minAge: 6, moments: ['A samba school with 3,000 dancers swept past in feathers and glitter. You danced until sunrise.', 'You joined a street bloco and paraded through the city with a million new best friends.'] }],
  de: [{ name: '{city} Beer Festival', emoji: '🍺', base: 25, minAge: 16, alcohol: true, moments: ['You stood on a bench and sang along to songs you didn\'t know with people you\'d never met.', 'A waitress carried twelve giant beer mugs at once. You applauded like it was the Olympics.'] }, { name: 'Christmas Market Night', emoji: '🎄', base: 10, minAge: 4, moments: ['You drank mulled wine, ate roasted almonds and felt like you were inside a snow globe.'] }],
  at: [{ name: 'Viennese Ball Season Gala', emoji: '💃', base: 120, minAge: 16, moments: ['You waltzed until 5 a.m. and only stepped on two feet. Both were yours.'] }],
  jp: [{ name: 'Summer Fireworks Festival', emoji: '🎆', base: 20, minAge: 4, moments: ['20,000 fireworks lit up the river. Everyone said "tamaya!" and so did you.', 'You ate takoyaki and shaved ice in a yukata while fireworks boomed overhead.'] }, { name: 'Snow Sculpture Festival', emoji: '⛄', base: 10, minAge: 4, moments: ['A snow castle the size of a house. You licked it. Don\'t tell anyone.'] }],
  cn: [{ name: 'Lantern Festival', emoji: '🏮', base: 10, minAge: 4, moments: ['Thousands of red lanterns glowed over the streets. You solved a lantern riddle and won a tiny prize.'] }, { name: 'Dragon Boat Races', emoji: '🐉', base: 15, minAge: 4, moments: ['The drummers pounded, the paddlers roared, and you ate three zongzi.'] }],
  tw: [{ name: 'Sky Lantern Festival', emoji: '🏮', base: 10, minAge: 4, moments: ['You wrote a wish on a paper lantern and watched it float into the night with thousands of others.'] }],
  hk: [{ name: 'Dragon Boat Races', emoji: '🐉', base: 10, minAge: 4, moments: ['The harbor filled with drums and dragon boats. You cheered for a random boat and it won.'] }],
  sg: [{ name: 'Lantern Festival by the Bay', emoji: '🏮', base: 10, minAge: 4, moments: ['You walked among giant glowing lanterns shaped like zodiac animals.'] }],
  my: [{ name: 'Lantern Festival', emoji: '🏮', base: 8, minAge: 4, moments: ['You carried a lantern through the streets and ate an alarming number of mooncakes.'] }],
  in: [{ name: 'Holi Color Festival', emoji: '🎨', base: 8, minAge: 6, moments: ['You were blasted with pink, green and yellow powder. You will be finding it in your ears for a week.'] }, { name: 'Diwali Fair', emoji: '🪔', base: 6, minAge: 4, moments: ['Lamps everywhere, sweets everywhere, fireworks everywhere. Pure joy.'] }],
  np: [{ name: 'Holi Color Festival', emoji: '🎨', base: 6, minAge: 6, moments: ['You got water-ballooned by kids and powdered by grandmothers. Everyone was laughing.'] }],
  th: [{ name: 'Songkran Water Festival', emoji: '💦', base: 8, minAge: 6, moments: ['A three-day citywide water fight. You were soaked within 40 seconds and stayed that way.'] }, { name: 'Floating Lantern Festival', emoji: '🏮', base: 12, minAge: 4, moments: ['You floated a little lotus boat on the river and made a wish.'] }],
  kr: [{ name: 'Mud Festival', emoji: '🟤', base: 15, minAge: 8, moments: ['You slid down a mud slide into a mud pool and then into another mud pool.'] }, { name: 'Lotus Lantern Festival', emoji: '🏮', base: 5, minAge: 4, moments: ['A parade of glowing dragon and lotus lanterns flowed past for an hour.'] }],
  mx: [{ name: 'Day of the Dead Parade', emoji: '💀', base: 10, minAge: 4, moments: ['You painted your face like a calavera and marched past marigold altars. Beautiful and a little spooky.'] }],
  es: [{ name: 'Tomato-Throwing Festival', emoji: '🍅', base: 15, minAge: 12, moments: ['You threw tomatoes at strangers for an hour. You will never look at gazpacho the same way.'] }],
  it: [{ name: 'Masked Carnival', emoji: '🎭', base: 30, minAge: 6, moments: ['You wore an elaborate mask and nobody knew who you were. You felt like a mysterious aristocrat.'] }],
  gb: [{ name: '{city} Street Carnival', emoji: '🎉', base: 5, minAge: 6, moments: ['Steel drums, jerk chicken and dancing in the street until dark.'] }],
  ie: [{ name: "St. Patrick's Day Parade", emoji: '☘️', base: 5, minAge: 4, moments: ['Everything was green, including the river. Someone handed you a hat shaped like a pint.'] }],
  us: [{ name: '{city} County Fair', emoji: '🎡', base: 15, minAge: 4, moments: ['You ate a deep-fried stick of butter and rode the Ferris wheel. In that order. Mistake.', 'A pig named Duchess won the blue ribbon. You were weirdly emotional.'] }],
  ca: [{ name: 'Winter Carnival', emoji: '❄️', base: 15, minAge: 4, moments: ['You watched an ice canoe race and ate maple taffy rolled in snow.'] }],
  se: [{ name: 'Midsummer Festival', emoji: '🌼', base: 10, minAge: 4, moments: ['You danced around a maypole doing the little frog dance. Yes, really.'] }],
  fi: [{ name: 'Midsummer Bonfire Festival', emoji: '🔥', base: 10, minAge: 4, moments: ['The sun never set, the bonfire never died, and neither did the party.'] }],
  no: [{ name: 'Midsummer Bonfire Festival', emoji: '🔥', base: 12, minAge: 4, moments: ['A huge bonfire on the fjord under a sun that refused to set.'] }],
  nl: [{ name: "King's Day Street Party", emoji: '👑', base: 5, minAge: 4, moments: ['The whole city wore orange, sold their junk on the sidewalk and partied on boats.'] }],
  cz: [{ name: '{city} Beer Festival', emoji: '🍺', base: 15, minAge: 18, alcohol: true, moments: ['You tasted 14 local beers and rated each one "excellent."'] }],
  be: [{ name: 'Belgian Beer Weekend', emoji: '🍺', base: 20, minAge: 16, alcohol: true, moments: ['You tried a beer brewed by monks. It was 11%. You had two. You hugged a monk.'] }],
  pt: [{ name: 'Sardine Festival', emoji: '🐟', base: 5, minAge: 4, moments: ['The streets smelled of grilled sardines and everyone was dancing under paper garlands.'] }],
  ru: [{ name: 'Pancake Week Festival', emoji: '🥞', base: 5, minAge: 4, moments: ['You ate blini until you couldn\'t move and watched them burn a giant straw effigy of winter.'] }],
  ua: [{ name: 'Midsummer Night Festival', emoji: '🌸', base: 5, minAge: 4, moments: ['You wore a flower crown and jumped over a bonfire for good luck.'] }],
  pl: [{ name: 'Pierogi Festival', emoji: '🥟', base: 5, minAge: 4, moments: ['You tried 11 kinds of pierogi. The sweet cheese one changed your life.'] }],
  ro: [{ name: 'Medieval Citadel Festival', emoji: '🏰', base: 10, minAge: 4, moments: ['Knights, jugglers and a man dressed as a certain count. You bought a wooden sword.'] }],
  rs: [{ name: 'Brass Band Festival', emoji: '🎺', base: 10, minAge: 8, moments: ['Trumpets blasted from every direction for three days. Your ears are ringing in a good way.'] }],
  ch: [{ name: 'Alpine Cattle Parade', emoji: '🐄', base: 5, minAge: 4, moments: ['Cows wearing flower crowns and giant bells paraded down from the mountains. Majestic.'] }],
  gr: [{ name: 'Wine Harvest Festival', emoji: '🍇', base: 10, minAge: 6, moments: ['You stomped grapes barefoot. Your feet will be purple until spring.'] }],
  ge: [{ name: 'Rtveli Wine Harvest', emoji: '🍇', base: 10, minAge: 6, moments: ['A toastmaster gave 23 toasts in a row. You agreed with every single one.'] }],
  tr: [{ name: 'Oil Wrestling Festival', emoji: '🤼', base: 10, minAge: 8, moments: ['Men covered in olive oil wrestled in a field for hours. You don\'t fully understand what you saw.'] }],
  mn: [{ name: 'Naadam Festival', emoji: '🏹', base: 15, minAge: 4, moments: ['Wrestling, archery and a horse race with child jockeys galloping 25 kilometers. Incredible.'] }],
  kz: [{ name: 'Nauryz Spring Festival', emoji: '🌷', base: 5, minAge: 4, moments: ['You ate nauryz kozhe soup and watched horseback games on the steppe.'] }],
  ph: [{ name: 'Street-Dance Fiesta', emoji: '🥁', base: 5, minAge: 4, moments: ['Drums, costumes and dancing in the streets for the Santo Niño. You were dancing too.'] }],
  id: [{ name: 'Bali Kite Festival', emoji: '🪁', base: 5, minAge: 4, moments: ['Giant kites the size of buses filled the sky. It took twenty people to launch each one.'] }],
  vn: [{ name: 'Full Moon Lantern Festival', emoji: '🏮', base: 5, minAge: 4, moments: ['The old town turned off its lights and glowed with lanterns. Magical.'] }],
  pk: [{ name: 'Spring Kite Festival', emoji: '🪁', base: 5, minAge: 6, moments: ['Thousands of kites battled over the rooftops. Yours lasted four minutes. Glorious minutes.'] }],
  af: [{ name: 'Kite-Flying Day', emoji: '🪁', base: 3, minAge: 6, moments: ['You flew a kite from a hilltop with half the city. Yours stayed up the longest.'] }],
  bd: [{ name: 'Bengali New Year Fair', emoji: '🌺', base: 3, minAge: 4, moments: ['You ate panta bhat and hilsa at dawn and joined the colorful procession.'] }],
  ng: [{ name: 'Masquerade & Durbar Festival', emoji: '🐎', base: 10, minAge: 4, moments: ['Horsemen in dazzling robes charged past in salute. The drums shook the ground.'] }, { name: '{city} Street Carnival', emoji: '🎉', base: 15, minAge: 6, moments: ['Costumed bands danced through the streets all day. You followed them for three miles.'] }],
  za: [{ name: 'Cape Jazz Festival', emoji: '🎷', base: 45, minAge: 8, music: true, moments: ['You danced to jazz under the stars with your whole row of strangers.'] }],
  ke: [{ name: 'Lamu Cultural Festival', emoji: '⛵', base: 10, minAge: 4, moments: ['Dhow races, donkey races and Swahili poetry. You bet on a donkey. It won.'] }],
  et: [{ name: 'Meskel Bonfire Celebration', emoji: '🔥', base: 3, minAge: 4, moments: ['A giant bonfire, thousands of candles and singing that went on all night.'] }],
  ma: [{ name: 'Gnawa Music Festival', emoji: '🪘', base: 20, minAge: 6, music: true, moments: ['Trance rhythms by the sea until 3 a.m. You went somewhere spiritual. Possibly just tired.'] }],
  tn: [{ name: 'Sahara Festival', emoji: '🐪', base: 10, minAge: 4, moments: ['Camel races, Bedouin poetry and a sunset over the dunes.'] }],
  eg: [{ name: 'Nile Night Festival', emoji: '⛵', base: 10, minAge: 4, moments: ['Music on felucca boats drifting down the Nile under the stars.'] }],
  sa: [{ name: 'Desert Winter Festival', emoji: '🐪', base: 25, minAge: 4, moments: ['There was a camel beauty pageant. The winner had magnificent lips. You were moved.'] }],
  ae: [{ name: 'Desert Music Festival', emoji: '🏜️', base: 90, minAge: 16, music: true, moments: ['A stage in the middle of the dunes, a sky full of stars and a bass drop you felt in your teeth.'] }],
  qa: [{ name: 'Desert Lights Festival', emoji: '✨', base: 20, minAge: 4, moments: ['Light installations glowed across the sand. You took 300 photos.'] }],
  jo: [{ name: 'Festival in the Ruins of Jerash', emoji: '🏛️', base: 20, minAge: 6, moments: ['Music and dance in a 2,000-year-old Roman theater. The acoustics were unreal.'] }],
  lb: [{ name: 'Summer Festival in the Temple Ruins', emoji: '🏛️', base: 45, minAge: 8, music: true, moments: ['A concert among ancient Roman columns. You got chills, and not from the wind.'] }],
  ir: [{ name: 'Nowruz Spring Fair', emoji: '🌷', base: 3, minAge: 4, moments: ['You jumped over little bonfires for good luck and ate your weight in sweets.'] }],
  il: [{ name: 'Festival of Light in the Old City', emoji: '✨', base: 5, minAge: 4, moments: ['Ancient walls lit up with light art. You walked for hours.'] }],
  co: [{ name: 'Carnival on the Coast', emoji: '🎭', base: 25, minAge: 6, moments: ['Four days of cumbia, costumes and flour fights. You came home white with flour.'] }, { name: 'Flower Festival Parade', emoji: '🌺', base: 5, minAge: 4, moments: ['Farmers paraded past carrying giant flower arrangements on their backs. Gorgeous.'] }],
  pe: [{ name: 'Inti Raymi Sun Festival', emoji: '☀️', base: 60, minAge: 6, moments: ['A dazzling Inca ceremony honoring the sun, high in the Andes. Unforgettable.'] }],
  bo: [{ name: 'Devil Dance Carnival', emoji: '👹', base: 25, minAge: 6, moments: ['Devil dancers in enormous masks danced for twenty hours straight. You lasted two.'] }],
  uy: [{ name: 'Candombe Carnival Parade', emoji: '🥁', base: 10, minAge: 4, moments: ['Hundreds of drummers marched past and the whole street vibrated.'] }],
  ar: [{ name: 'Tango Festival', emoji: '🌹', base: 15, minAge: 8, moments: ['You took a free tango lesson in the street and only kicked your partner once.'] }],
  cl: [{ name: 'Independence Fondas', emoji: '🇨🇱', base: 5, minAge: 4, moments: ['Empanadas, cueca dancing and a lot of national pride.'] }],
  pa: [{ name: 'Panama Carnival', emoji: '🎭', base: 10, minAge: 4, moments: ['Water trucks sprayed the crowds while bands played. You were soaked and delighted.'] }],
  gt: [{ name: 'Giant Kite Festival', emoji: '🪁', base: 3, minAge: 4, moments: ['Round kites twenty meters wide, painted like stained glass, rose over the cemetery. Breathtaking.'] }],
  bs: [{ name: 'Junkanoo Parade', emoji: '🥁', base: 10, minAge: 4, moments: ['Cowbells, goatskin drums and dazzling costumes at 2 a.m. on Boxing Day.'] }],
  jm: [{ name: 'Reggae Beach Weekend', emoji: '🎶', base: 70, minAge: 13, music: true, moments: ['Bass so deep the ocean rippled. You danced till dawn.'] }],
  cu: [{ name: 'Havana Jazz Festival', emoji: '🎷', base: 15, minAge: 8, music: true, moments: ['Cuban jazz in an old colonial plaza. You will never hear music the same way.'] }],
  do: [{ name: 'Merengue Festival', emoji: '💃', base: 10, minAge: 4, moments: ['You danced merengue on the Malecón with a grandmother who outlasted you.'] }],
  au: [{ name: 'Harbour Lights Festival', emoji: '✨', base: 5, minAge: 4, moments: ['The harbor glowed with light shows. You took one good photo out of 400.'] }],
  nz: [{ name: 'Matariki Festival', emoji: '✨', base: 5, minAge: 4, moments: ['You celebrated the Māori New Year with kai, music and a sky full of stars.'] }],
  ws: [{ name: 'Teuila Festival', emoji: '🌺', base: 5, minAge: 4, moments: ['Fire knife dancers, canoe races and a lot of very good food.'] }],
  pg: [{ name: 'Highlands Sing-Sing', emoji: '🪶', base: 20, minAge: 4, moments: ['Hundreds of groups in feathers and body paint sang and danced. Nothing has ever looked like this.'] }],
}

const THEME_PARKS = ['{w} Adventure Kingdom', 'Galaxy Coaster World', 'Splash Lagoon Water Park', 'Dino Valley Family Park', 'Thunder Mountain Fun Park']
const PARK_MOMENTS = ['The biggest coaster had a 90-meter drop. You screamed the whole way. Your on-ride photo is legendary.', 'You waited 90 minutes for a two-minute ride. You\'d do it again.', 'TOO_SHORT', 'You threw up on the spinning teacups. Classic.', 'A costumed mascot hugged you and you weren\'t ready for how much you needed it.', 'You won a giant stuffed banana at a carnival game. It\'s bigger than you.']

// ---------------------------------------------------------------------------
// Line-ups

function cityPool(g: GameState): string[] {
  const c = g.character
  const cities = getCountry(c.countryId).cities.filter((x) => typeof x === 'string' && x.trim() !== '')
  if (c.city && !cities.includes(c.city)) cities.unshift(c.city)
  return cities.length ? cities : ['the capital']
}

function nearbyCity(g: GameState, r: SRng): string {
  const cities = cityPool(g)
  // Most events are in your own city or the big city nearby.
  return r.chance(0.5) && g.character.city ? g.character.city : r.pick(cities)
}

function localWord(g: GameState, r: SRng): string {
  const words = localMarket(g).nameWords.filter((w) => typeof w === 'string' && w.trim() !== '')
  return words.length ? r.pick(words).trim() : 'Funland'
}

function alcoholOk(g: GameState): boolean {
  return isIndustryLegal(g.character.countryId, 'bar')
}

function concertLineup(g: GameState, r: SRng): TicketEvent[] {
  const local = (COUNTRY_GENRES[g.character.countryId] ?? []).filter((x) => GENRES[x])
  const out: TicketEvent[] = []
  const used = new Set<string>()
  const n = r.int(4, 6)
  for (let i = 0; out.length < n && i < 20; i++) {
    const genreId = local.length && r.chance(0.55) ? r.pick(local) : r.pick(GLOBAL_GENRES)
    const genre = GENRES[genreId]
    const city = nearbyCity(g, r)
    const artist = r.pick(genre.artists).replace('{city}', city)
    if (used.has(artist)) continue
    used.add(artist)
    const tour = r.pick(['World Tour', 'Farewell Tour (Again)', 'Greatest Hits Tour', 'Reunion Tour', 'Album Release Show', 'Live in Concert'])
    out.push({
      id: `${g.year}:concert:${out.length}`,
      kind: 'concert',
      title: genreId === 'classical' ? `${artist.charAt(0).toUpperCase()}${artist.slice(1)}: ${r.pick(['Beethoven\'s Fifth', 'An Evening of Mozart', 'The Four Seasons', 'Film Scores Under the Stars'])}` : `${artist}: ${tour}`,
      where: `${genre.label} · ${city} ${genre.venue}`,
      emoji: genre.emoji,
      minAge: genre.minAge ?? 8,
      tiers: tiers(g, r, genre.base, ['Nosebleed Seats', genre.mosh ? 'General Admission Pit' : 'Floor Standing', 'Premium Seats', 'VIP Meet & Greet']),
      genre: genreId,
      artist,
      moments: genre.mosh ? ['MOSH', 'STAGE', 'PICK', 'You screamed every lyric. Your voice has not returned.'] : ['STAGE', 'PICK', 'You screamed every lyric. Your voice has not returned.', 'The encore was your favorite song. You cried a little. Okay, a lot.'],
    })
  }
  return out
}

function sportsLineup(g: GameState, r: SRng): TicketEvent[] {
  const sports = sportsFor(g.character.countryId)
  const out: TicketEvent[] = []
  const n = Math.min(6, Math.max(3, sports.length + 1))
  const cities = cityPool(g)
  for (let i = 0; i < n; i++) {
    const sport = i < sports.length ? sports[i] : sports[0]
    const def = SPORTS[sport]
    const city = nearbyCity(g, r)
    const base = def.base * (sport === 'cricket' && r.chance(0.3) ? 2.5 : 1)
    if (def.format === 'event') {
      const name = def.eventName ? def.eventName(g, city) : `${def.name} in ${city}`
      if (out.some((e) => e.title === name)) continue
      out.push({ id: `${g.year}:sports:${out.length}`, kind: 'sports', title: name, where: `${def.name} · ${city} ${def.venue}`, emoji: def.emoji, minAge: sport === 'boxing' || sport === 'muayThai' ? 12 : 4, tiers: tiers(g, r, base, def.tiers, def.globalShare ?? 0), sport, moments: def.moments })
      continue
    }
    const homeCity = city
    let awayCity = r.pick(cities)
    for (let k = 0; k < 4 && awayCity === homeCity && cities.length > 1; k++) awayCity = r.pick(cities)
    const home = teamName(g, r, sport, homeCity)
    let away = teamName(g, r, sport, awayCity)
    for (let k = 0; k < 4 && away === home; k++) away = teamName(g, r, sport, awayCity)
    if (away === home) away = `${awayCity} ${sport === 'soccer' ? 'Athletic' : 'All-Stars'}`
    const derby = homeCity === awayCity
    out.push({
      id: `${g.year}:sports:${out.length}`,
      kind: 'sports',
      title: `${home} vs ${away}`,
      where: `${def.name}${derby ? ' · Local derby!' : ''} · ${homeCity} ${def.venue}`,
      emoji: def.emoji,
      minAge: 4,
      tiers: tiers(g, r, base, def.tiers, def.globalShare ?? 0),
      sport,
      home,
      away,
      moments: def.moments,
    })
  }
  return out
}

function theaterLineup(g: GameState, r: SRng): TicketEvent[] {
  const local = LOCAL_SHOWS[g.character.countryId] ?? []
  const pool = [...SHOWS]
  const picks: ShowDef[] = [...local]
  while (picks.length < 5 && pool.length) picks.push(pool.splice(r.int(0, pool.length - 1), 1)[0])
  return picks.map((s, i) => {
    const city = nearbyCity(g, r)
    return {
      id: `${g.year}:theater:${i}`,
      kind: 'theater' as const,
      title: s.title,
      where: `${city} ${s.venue}`,
      emoji: s.emoji,
      minAge: s.minAge ?? 8,
      tiers: tiers(g, r, s.base, ['Balcony', 'Stalls', 'Front Orchestra', 'Private Box']),
      moments: ['A standing ovation that went on so long the actors looked embarrassed.', 'Someone\'s phone rang during the big death scene. It was not yours. Probably.', 'You cried at the finale. You blamed allergies.', 'You dozed off in the second act and woke up for the bows. You clapped extra hard to compensate.'],
    }
  })
}

function comedyLineup(g: GameState, r: SRng): TicketEvent[] {
  const out: TicketEvent[] = []
  const pool = [...COMEDIANS]
  const n = r.int(3, 4)
  for (let i = 0; i < n && pool.length; i++) {
    const who = pool.splice(r.int(0, pool.length - 1), 1)[0]
    const city = nearbyCity(g, r)
    out.push({
      id: `${g.year}:comedy:${i}`,
      kind: 'comedy',
      title: `${who}: ${r.pick(SET_NAMES)}`,
      where: `Stand-up · ${city} Comedy Club`,
      emoji: '🎙️',
      minAge: 16,
      tiers: tiers(g, r, 25, ['Back Row', 'Standard', 'Front Row (Danger Zone)', 'VIP Table']),
      moments: ['ROAST', 'You laughed so hard you snorted. The comedian made you do it again.', 'One joke was about your exact job. You felt seen and attacked.', 'You laughed until you cried, then until you couldn\'t breathe.'],
    })
  }
  return out
}

function festivalLineup(g: GameState, r: SRng): TicketEvent[] {
  const local = LOCAL_FESTIVALS[g.character.countryId] ?? []
  const pool = [...local, ...MUSIC_FESTIVALS].filter((f) => !f.alcohol || alcoholOk(g))
  const picks = pool.slice(0, Math.min(4, pool.length))
  return picks.map((f, i) => {
    const city = nearbyCity(g, r)
    const music = f.music === true
    return {
      id: `${g.year}:festival:${i}`,
      kind: 'festival' as const,
      title: f.name.replace('{city}', city),
      where: music ? `Music festival · near ${city}` : `Festival · ${city}`,
      emoji: f.emoji,
      minAge: f.minAge,
      tiers: tiers(g, r, f.base, music ? ['Day Pass', 'Weekend Pass', 'Premium Pass', 'VIP Backstage'] : ['General Admission', 'Grandstand Seat', 'Premium Stand', 'VIP Pavilion']),
      alcohol: f.alcohol,
      moments: f.moments,
    }
  })
}

function themeParkLineup(g: GameState, r: SRng): TicketEvent[] {
  const pool = [...THEME_PARKS]
  const out: TicketEvent[] = []
  for (let i = 0; i < 3 && pool.length; i++) {
    const name = pool.splice(r.int(0, pool.length - 1), 1)[0].replace('{w}', localWord(g, r))
    const water = /Water/.test(name)
    out.push({
      id: `${g.year}:themepark:${i}`,
      kind: 'themepark',
      title: name,
      where: water ? 'Water park · slides, wave pool, lazy river' : 'Theme park · coasters, rides and churros',
      emoji: water ? '🌊' : '🎢',
      minAge: 4,
      tiers: tiers(g, r, water ? 45 : 70, ['Day Pass', 'Two-Day Pass', 'Fast-Track Pass', 'VIP Guided Tour']),
      moments: water ? ['The tallest water slide gave you a wedgie that will be studied by scientists.', 'You floated around the lazy river for three hours. Peak living.', 'TOO_SHORT', 'You lost your sunglasses in the wave pool. A lifeguard found them. Hero.'] : PARK_MOMENTS,
    })
  }
  return out
}

/** This year's events in a category (seeded: the same all year). */
export function ticketEvents(g: GameState, kind: TicketKind): TicketEvent[] {
  const r = seeded(yearKey(g, `tickets:${kind}`))
  switch (kind) {
    case 'concert':
      return concertLineup(g, r)
    case 'sports':
      return sportsLineup(g, r)
    case 'theater':
      return theaterLineup(g, r)
    case 'comedy':
      return comedyLineup(g, r)
    case 'festival':
      return festivalLineup(g, r)
    case 'themepark':
      return themeParkLineup(g, r)
  }
}

// ---------------------------------------------------------------------------
// Buying a ticket and going

function blockReason(g: GameState): string | null {
  if (!g.character.alive) return "You're dead. The only event you're attending is your own funeral."
  if (inPrison(g)) return "You can't buy tickets from prison. The only show in here is the yard fight."
  return null
}

/** Why the player can't go to this event at this tier, or null. */
export function ticketReason(g: GameState, ev: TicketEvent, tierIndex: number): string | null {
  const b = blockReason(g)
  if (b) return b
  const c = g.character
  if (c.age < ev.minAge) return `You must be at least ${ev.minAge} to go.`
  if (c.age < 13 && payingParents(g).length === 0) return "You're too young to go on your own."
  if (c.age < 13 && tierIndex >= 2) return 'Your parents said the expensive seats can wait until you have a job.'
  if (yearActionsUsed(g, `ticket:${ev.id}`) >= 1) return 'You already went to this one this year.'
  if (yearActionsUsed(g, 'tickets') >= TICKETS_PER_YEAR) return "You've been to enough events this year. Your wallet needs a nap."
  if (yearActionsUsed(g, `tickets.${ev.kind}`) >= TICKETS_PER_KIND) return `You've been to ${TICKETS_PER_KIND} ${KIND_LABEL[ev.kind].toLowerCase()} events this year. Save some fun for next year.`
  return null
}

const KIND_LABEL: Record<TicketKind, string> = {
  concert: 'Concert',
  sports: 'Sports',
  theater: 'Theater',
  comedy: 'Comedy',
  festival: 'Festival',
  themepark: 'Theme Park',
}

function companionsFor(g: GameState, ev: TicketEvent): Person[] {
  const minAge = Math.max(ev.minAge, 4)
  return companionCandidates(g, { minAge, max: 5 }).filter((p) => p.relation !== 'pet' && p.age >= minAge)
}

const WHO = defineScript('tickets.who', (g, choice, data) => {
  if (choice === 'cancel') return
  const rec = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const kind = typeof rec.kind === 'string' ? (rec.kind as TicketKind) : null
  const id = typeof rec.id === 'string' ? rec.id : ''
  const tier = typeof rec.tier === 'number' ? rec.tier : 0
  if (!kind || !KIND_LABEL[kind]) return
  const ev = ticketEvents(g, kind).find((e) => e.id === id)
  if (!ev) return
  goToEvent(g, ev, tier, choice === 'alone' ? null : choice)
})

/** Start buying: ask who comes along when there's anyone to bring, else go straight away. */
export function buyTicket(g: GameState, ev: TicketEvent, tierIndex: number): void {
  const reason = ticketReason(g, ev, tierIndex)
  if (reason) {
    notice(g, 'Tickets', reason, { emoji: '🎟️' })
    return
  }
  const tier = ev.tiers[tierIndex]
  if (!tier) return
  const c = g.character
  if (c.age < 13) {
    // Kids go with a parent, who pays for both tickets if they can.
    const parent = payingParents(g).sort((a, b) => b.relationship - a.relationship)[0]
    goToEvent(g, ev, tierIndex, parent ? parent.id : null)
    return
  }
  const people = companionsFor(g, ev)
  if (people.length === 0) {
    goToEvent(g, ev, tierIndex, null)
    return
  }
  const choices: ChoiceOption[] = [
    { id: 'alone', label: `Go alone (${formatMoney(tier.price)})`, emoji: '🙋' },
    ...people.map((p) => ({ id: p.id, label: `Bring ${p.firstName}, your ${relationLabel(p).toLowerCase()} (${formatMoney(tier.price * 2)})`, emoji: '👥' })),
    { id: 'cancel', label: 'Never mind', emoji: '✖️' },
  ]
  scriptChoice(g, WHO, ev.title, `${tier.label} tickets cost ${formatMoney(tier.price)} each. Who's coming with you?`, choices, { emoji: ev.emoji, data: { kind: ev.kind, id: ev.id, tier: tierIndex } as Json })
}

function fillMoment(g: GameState, ev: TicketEvent, m: string, companion: Person | null): string {
  const c = g.character
  switch (m) {
    case 'FOUL_BALL':
      count(g, 'foulBalls')
      return 'A foul ball came screaming toward your section and you caught it barehanded! The crowd went wild. Your hand is still throbbing.'
    case 'BIG_SCREEN':
      if (companion && (companion.relation === 'spouse' || companion.relation === 'partner' || companion.relation === 'fiance')) {
        addRelationship(companion, randInt(g, 2, 5))
        return `The kiss cam landed on you and ${companion.firstName}. You went for it. The stadium cheered.`
      }
      return pick(g, ['You ended up on the big screen mid-bite. You waved with a mouth full of nachos.', 'The camera found you dancing on the big screen. You did not stop. Legend.'])
    case 'CATCH_SIX':
      return 'A huge six sailed into your stand and you caught it one-handed. The crowd gave you a standing ovation and the TV replayed it three times.'
    case 'HAKA':
      return c.countryId === 'nz' ? 'The pre-match haka gave you goosebumps all the way down your spine.' : c.countryId === 'ws' ? 'The pre-match siva tau war dance gave you chills.' : 'The crowd sang the anthem so loud you felt it in your chest.'
    case 'ZABUTON':
      return 'The grand champion lost to a lowly-ranked wrestler and the whole arena threw their seat cushions into the ring. One hit you in the face. Tradition!'
    case 'HALF_COURT':
      if (chance(g, 0.15)) {
        return 'You were picked for the half-court shot contest... and you MADE IT! The arena exploded. You won a year of free pizza.'
      }
      return 'You were picked for the half-court shot contest. You airballed it by six feet. The crowd cheered anyway, out of pity.'
    case 'STAGE':
      count(g, 'pulledOnStage')
      return `${ev.artist ?? 'The performer'} pulled you up on stage to sing along! You forgot every word but danced with total commitment.`
    case 'PICK':
      return `You caught ${ev.genre === 'classical' ? 'a rose thrown from the stage' : 'a guitar pick tossed into the crowd'}. It is now your most prized possession.`
    case 'MOSH':
      if (chance(g, 0.35)) {
        addCondition(g, 'Black Eye', 'injury', randInt(g, 4, 8))
        addStat(g, 'health', -randInt(g, 1, 3))
        return 'You jumped into the mosh pit and got an elbow to the face. Black eye, zero regrets.'
      }
      return 'You crowd-surfed for the first time and were carried all the way to the stage.'
    case 'ROAST':
      return pick(g, ['You sat in the front row, so the comedian roasted your outfit for five full minutes. You laughed. Mostly.', 'The comedian asked what you do for a living. You told the truth. Big mistake.'])
    case 'MUD':
      return 'It rained all weekend and the field turned into a swamp. You lost a shoe. You found a different shoe. You wore it home.'
    case 'TOO_SHORT':
      return c.age < 10 ? "You were too short for the biggest ride. You stood on your tiptoes. The attendant was not fooled." : 'You rode the biggest ride three times in a row. Your inner ear has filed a complaint.'
    default:
      return m
  }
}

/** Buy the ticket(s) and go: returns false when nobody could pay. */
export function goToEvent(g: GameState, ev: TicketEvent, tierIndex: number, companionId: string | null): boolean {
  const reason = ticketReason(g, ev, tierIndex)
  if (reason) {
    notice(g, 'Tickets', reason, { emoji: '🎟️' })
    return false
  }
  const tier = ev.tiers[tierIndex]
  if (!tier) return false
  const c = g.character
  const companion = companionId ? g.people.find((p) => p.id === companionId && p.alive) ?? null : null
  const tickets = companion ? 2 : 1
  const cost = tier.price * tickets

  // Who pays? Minors' parents cover the cheaper seats (and their own ticket).
  let paidBy: Person | null = null
  if (c.age < 18 && tierIndex <= 1) {
    paidBy = payingParents(g).filter((p) => p.money >= cost * 2).sort((a, b) => b.relationship - a.relationship)[0] ?? null
  }
  if (paidBy) paidBy.money = Math.max(0, Math.round(paidBy.money - cost))
  else if (!spend(g, cost)) {
    notice(g, 'Insufficient Funds', `${tickets === 2 ? 'Two' : 'A'} ${tier.label.toLowerCase()} ticket${tickets === 2 ? 's' : ''} for ${ev.title} cost${tickets === 2 ? '' : 's'} ${formatMoney(cost)}. You have ${formatMoney(Math.max(0, c.money))}.`, { emoji: '💸', tone: 'bad' })
    return false
  }

  useYearAction(g, `ticket:${ev.id}`, 1)
  useYearAction(g, 'tickets', 99)
  useYearAction(g, `tickets.${ev.kind}`, 99)
  count(g, 'eventsAttended')
  count(g, ev.kind === 'concert' ? 'concerts' : ev.kind === 'sports' ? 'sportsGames' : `${ev.kind}Visits`)

  const joy = [randInt(g, 3, 5), randInt(g, 4, 7), randInt(g, 6, 9), randInt(g, 8, 12)][Math.min(3, tierIndex)]
  addStat(g, 'happiness', joy)
  const parts: string[] = []

  // The main event.
  if (ev.kind === 'sports' && ev.home && ev.away) {
    const roll = randInt(g, 0, 99)
    const draws = (ev.sport ? SPORTS[ev.sport].draws : 0) ?? 0
    if (roll < draws * 100) parts.push(`${ev.home} and ${ev.away} played to a ${pick(g, ['0-0', '1-1', '2-2'])} draw.`)
    else if (roll < 50 + draws * 50) {
      addStat(g, 'happiness', 2)
      parts.push(`${ev.home} won at home! ${pick(g, ['The stadium shook.', 'Strangers high-fived you all the way to the exit.', 'You celebrated like you had personally scored.'])}`)
    } else parts.push(`${ev.away} won. ${pick(g, ['The home crowd went silent.', 'You booed the referee with real passion.', 'The ride home was very quiet.'])}`)
  } else if (ev.kind === 'concert') {
    parts.push(pick(g, [`${ev.artist} put on an incredible show.`, `${ev.artist} played for two and a half hours.`, `${ev.artist} opened with your favorite song.`]))
  } else if (ev.kind === 'theater') {
    parts.push(pick(g, [`You saw ${ev.title}.`, `${ev.title} was spectacular.`, `The cast of ${ev.title} was outstanding.`]))
  } else if (ev.kind === 'comedy') {
    parts.push('The show was hilarious.')
  } else if (ev.kind === 'festival') {
    parts.push(pick(g, [`You spent the day at ${ev.title}.`, `${ev.title} was everything you hoped for.`]))
  } else {
    parts.push(`You spent the day at ${ev.title}.`)
  }

  // A moment to remember.
  if (ev.moments.length && chance(g, 0.6)) parts.push(fillMoment(g, ev, pick(g, ev.moments), companion))

  // VIP perks.
  if (tierIndex === 3) {
    if (ev.kind === 'concert' && ev.artist) {
      remember(g, `Met ${ev.artist} backstage.`)
      parts.push(hasTech(g, 'smartphone') ? `Backstage, you met ${ev.artist} and got a selfie. You will be posting it every year on this date.` : `Backstage, you met ${ev.artist} and got a signed photo. You will be showing it to everyone for years.`)
    } else if (ev.kind === 'sports') parts.push('The VIP package included a stadium tour and a buffet. You ate like it was your job.')
    else parts.push('The VIP treatment included free snacks, a lounge and a lanyard you will never throw away.')
  }

  // Booze at the beer festival (of age only).
  if (ev.alcohol && c.age >= Math.max(18, getCountry(c.countryId).drinkingAge ?? 18) && chance(g, 0.3)) {
    addStat(g, 'health', -1)
    parts.push('You woke up the next morning with a headache and a souvenir mug you don\'t remember buying.')
  }

  // Bringing someone.
  if (companion) {
    addRelationship(companion, randInt(g, 4, 10))
    companion.data.lastSeenAge = c.age
    if (c.age < 13 && paidBy && paidBy.id === companion.id) parts.push(`Your ${relationLabel(companion).toLowerCase()} ${companion.firstName} took you and paid for everything.`)
    else parts.push(`${companion.firstName} had a blast too.`)
  } else if (paidBy) {
    parts.push(`Your ${relationLabel(paidBy).toLowerCase()} ${paidBy.firstName} paid for the ticket.`)
  }

  // Someone new.
  if (c.age >= 13 && chance(g, companion ? 0.06 : 0.14)) {
    const age = Math.max(13, c.age + randInt(g, -5, 5))
    const p = createPerson(g, { relation: 'friend', age, relationship: randInt(g, 40, 65) })
    p.data.metAt = ev.title
    notePerson(p, `Met the player at ${ev.title} at age ${c.age}.`)
    parts.push(`You got talking to ${p.firstName} ${p.lastName} in the line for snacks and swapped numbers.`)
    log(g, `I met ${p.firstName} at ${ev.title}.`, 'good')
  }

  // Fame has its price.
  if (c.hidden.fame >= 60 && chance(g, 0.35)) {
    addHidden(g, 'fame', 1)
    parts.push(hasTech(g, 'smartphone') ? 'Fans recognized you and you spent half the event posing for selfies.' : 'Fans recognized you and you spent half the event signing autographs.')
  }

  log(g, `I went to ${ev.title}${companion ? ` with ${companion.firstName}` : ''}.`, 'good')
  const tax = paidBy ? '' : salesTaxNote(g, cost)
  notice(g, KIND_LABEL[ev.kind], `${parts.join(' ')}${tax ? ` ${tax}` : ''}`, { emoji: ev.emoji, tone: 'good' })
  return true
}

// ---------------------------------------------------------------------------
// Menus

function eventMenu(ev: TicketEvent): MenuGroup {
  return {
    type: 'menu',
    id: `ticket-${ev.id}`,
    label: ev.title,
    emoji: ev.emoji,
    subtitle: () => `${ev.where} · from ${formatMoney(ev.tiers[0]?.price ?? 0)}`,
    disabledReason: (g) => ticketReason(g, ev, 0),
    header: (g) => `${ev.title}. ${ev.where}. You have ${formatMoney(g.character.money)}.`,
    children: () =>
      ev.tiers.map(
        (t, i): MenuAction => ({
          type: 'action',
          id: `ticket-${ev.id}-${i}`,
          label: t.label,
          emoji: ['🪑', '🎫', '⭐', '👑'][i] ?? '🎫',
          subtitle: `${formatMoney(t.price)} per ticket`,
          disabledReason: (g) => ticketReason(g, ev, i),
          run: (g) => buyTicket(g, ev, i),
        }),
      ),
  }
}

const KIND_META: Record<TicketKind, { emoji: string; subtitle: string; minAge: number }> = {
  concert: { emoji: '🎤', subtitle: 'Live music, local stars and world tours', minAge: 8 },
  sports: { emoji: '🏟️', subtitle: 'Local teams, big matches, big events', minAge: 4 },
  theater: { emoji: '🎭', subtitle: 'Plays, musicals, opera and ballet', minAge: 8 },
  comedy: { emoji: '🎙️', subtitle: 'Stand-up comedy nights', minAge: 16 },
  festival: { emoji: '🎪', subtitle: 'Local festivals and music festivals', minAge: 4 },
  themepark: { emoji: '🎢', subtitle: 'Roller coasters and water slides', minAge: 4 },
}

function kindMenu(kind: TicketKind): MenuGroup {
  const meta = KIND_META[kind]
  return {
    type: 'menu',
    id: `tickets-${kind}`,
    label: kind === 'themepark' ? 'Theme Parks' : kind === 'sports' ? 'Sports' : kind === 'theater' ? 'Theater & Opera' : kind === 'concert' ? 'Concerts' : kind === 'comedy' ? 'Comedy' : 'Festivals',
    emoji: meta.emoji,
    subtitle: kind === 'sports' ? (g) => sportsFor(g.character.countryId).slice(0, 4).map((s) => SPORTS[s].name).join(', ') : meta.subtitle,
    visible: (g) => g.character.age >= meta.minAge,
    disabledReason: blockReason,
    header: (g) => {
      const used = yearActionsUsed(g, `tickets.${kind}`)
      return `This year's line-up in ${getCountry(g.character.countryId).name}. You've been to ${used} of ${TICKETS_PER_KIND} this year.`
    },
    children: (g): MenuNode[] => {
      const events = ticketEvents(g, kind).filter((e) => g.character.age >= e.minAge - 2)
      if (events.length === 0) return [{ type: 'info', id: `tickets-none-${kind}`, text: 'Nothing on this year. Check back next year.', emoji: '📅' }]
      return events.map(eventMenu)
    },
  }
}

export const ticketsMenu: MenuGroup = {
  type: 'menu',
  id: 'tickets',
  label: 'Tickets',
  emoji: '\u{1F39F}\u{FE0F}',
  subtitle: 'Concerts, games, shows and festivals',
  visible: (g) => g.character.age >= 4,
  disabledReason: blockReason,
  header: (g) => {
    const used = yearActionsUsed(g, 'tickets')
    const kid = g.character.age < 13 ? ' A parent has to take you.' : ''
    return `You've been to ${used} of ${TICKETS_PER_YEAR} events this year.${kid} You have ${formatMoney(g.character.money)}.`
  },
  children: (): MenuNode[] => KINDS.map(kindMenu),
}
