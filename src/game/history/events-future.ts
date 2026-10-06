// Headlines after PRESENT_YEAR: the procedural future. A few events are on the calendar already
// (eclipses, Olympics, World Cups, a famous asteroid and comet); every other year gets one item
// from a pool of plausible-to-silly futures, each used once before the pool repeats. Pure and
// deterministic per year: the same future for every life, no RNG.
import type { HeadlineRow, WorldEventKind } from './events-types'
import { PRESENT_YEAR } from './timeline'

/** Known or scheduled events (as of PRESENT_YEAR). */
const SCHEDULED: readonly HeadlineRow[] = [
  [2027, 'space', 2, 'es,ma,dz,tn,eg,sa', 'A total solar eclipse turns day into night across Spain and North Africa'],
  [2027, 'sport', 1, 'au', 'Australia hosts the Rugby World Cup'],
  [2027, 'sport', 1, 'br', "Brazil hosts the Women's World Cup"],
  [2028, 'sport', 1, 'world,-us', 'Los Angeles hosts the Summer Olympics'],
  [2028, 'sport', 3, 'us', 'Los Angeles hosts the Summer Olympics for the third time'],
  [2029, 'space', 1, 'world', 'The asteroid Apophis passes closer to Earth than many satellites, harmlessly'],
  [2030, 'sport', 2, 'world,-es,-pt,-ma,-uy,-ar,-py', 'The World Cup turns 100 with games on three continents'],
  [2030, 'sport', 3, 'es,pt,ma,uy,ar,py', 'The centenary World Cup kicks off on home soil'],
  [2030, 'sport', 1, 'fr', 'The French Alps host the Winter Olympics'],
  [2031, 'space', 2, 'world', 'Astronauts walk on the Moon again, the first since 1972'],
  [2032, 'sport', 1, 'world,-au', 'Brisbane hosts the Summer Olympics'],
  [2032, 'sport', 3, 'au', 'Brisbane hosts the Summer Olympics'],
  [2034, 'sport', 1, 'world,-sa', 'Saudi Arabia hosts the World Cup'],
  [2034, 'sport', 3, 'sa', 'Saudi Arabia hosts the World Cup'],
  [2034, 'sport', 1, 'us', 'Salt Lake City hosts the Winter Olympics'],
  [2041, 'space', 3, 'world', 'The first humans land on Mars'],
  [2045, 'tech', 3, 'world', 'Fusion power reaches the electric grid for the first time'],
  [2050, 'politics', 1, 'world', "The world reaches the 2050 climate deadline; most countries say they're 'nearly there'"],
  [2061, 'space', 1, 'world', "Halley's Comet returns, 75 years after its last visit"],
  [2076, 'politics', 2, 'us', 'The United States celebrates its 300th birthday'],
  [2100, 'culture', 2, 'world', 'A new century begins'],
]

type FutureItem = readonly [kind: WorldEventKind, headline: string]

/** One of these a year, in a fixed shuffled order. */
const POOL: readonly FutureItem[] = [
  ['tech', 'A fusion reactor breaks its own record for sustained power'],
  ['economy', 'Lab-grown meat outsells beef in several countries'],
  ['space', 'A crewed mission swings around Mars and heads home'],
  ['space', 'The first hotel opens in low Earth orbit'],
  ['health', 'A drug that slows aging passes its first big trial'],
  ['tech', 'Self-driving trucks take over the night shift on major highways'],
  ['tech', 'Robot butlers are recalled after folding cats with the laundry'],
  ['disaster', 'A record heat wave scorches three continents at once'],
  ['disaster', "Sea walls rise around the world's biggest coastal cities"],
  ['politics', 'A global treaty bans single-use plastic'],
  ['tech', 'Scientists revive a woolly mammoth calf, sort of'],
  ['tech', 'Quantum computers crack an old encryption standard and banks quietly panic'],
  ['health', 'Brain implants let paralyzed patients type with their thoughts'],
  ['tech', "AI now writes most of the world's software; programmers insist they're supervising"],
  ['health', 'A vaccine for the common cold finally arrives'],
  ['culture', 'Hologram concerts outsell live tours'],
  ['space', 'A Moon base welcomes its first long-term crew'],
  ['culture', 'The world population peaks and begins to shrink'],
  ['economy', 'Vertical farms feed whole cities'],
  ['tech', 'Desalination plants turn stretches of desert green'],
  ['disaster', 'A solar storm knocks out satellites for a week'],
  ['tech', 'Flying taxis start regular service in a dozen cities'],
  ['economy', 'Humanoid robots join a factory union, legally confusing everyone'],
  ['economy', 'The four-day work week becomes the norm in many countries'],
  ['health', 'A cure for a major cancer is approved'],
  ['disaster', 'Glaciers retreat to record lows'],
  ['space', 'An asteroid-mining probe returns with a hold full of platinum'],
  ['culture', 'A floating neighborhood opens off the coast of a crowded city'],
  ['health', 'Gene therapy wipes out a hereditary disease for good'],
  ['tech', 'Electric planes start short-hop passenger routes'],
  ['space', 'A space telescope spots water vapor on a distant Earth-sized planet'],
  ['tech', 'Smart glasses replace phones for millions of people'],
  ['tech', 'A universal translator earpiece makes language classes optional'],
  ['tech', 'Vacuum-tube trains hit 1,000 km/h in testing'],
  ['politics', 'Deepfake laws tighten after an election scandal'],
  ['health', 'Robot surgeons now perform more routine operations than humans'],
  ['culture', 'Insect-protein snacks become a lunchbox staple'],
  ['politics', 'Climate migration reshapes where people live'],
  ['tech', 'Carbon-capture plants start pulling CO2 out of the sky at scale'],
  ['politics', 'Nations sign a global pandemic treaty'],
  ['tech', 'An AI is credited as co-author of a major scientific discovery'],
  ['culture', 'Underwater research stations welcome their first tourists'],
  ['disaster', 'The Arctic has its first ice-free summer'],
  ['economy', 'Delivery robots outnumber delivery drivers in big cities'],
  ['sport', 'Esports join the Olympic program'],
  ['economy', 'A glut of lab-grown diamonds collapses the diamond market'],
  ['tech', 'Personal AI tutors lift exam scores worldwide'],
  ['economy', 'Retirement ages rise as people live longer'],
  ['culture', 'Clothes that change color on command become the hottest fashion'],
  ['tech', 'An earthquake early-warning network saves thousands of lives'],
  ['tech', 'Self-healing concrete starts repairing its own cracks'],
  ['culture', 'Scientists regrow a coral reef from scratch'],
  ['sport', 'Major sports leagues let robot referees make the calls'],
  ['culture', 'A seed vault is opened to restore a lost crop'],
  ['politics', 'A court orders the world’s biggest AI company split in two'],
  ['space', 'Space junk forces the first orbital traffic laws'],
  ['sport', 'Wild weather forces the first fully climate-controlled stadiums'],
  ['economy', 'Electric cars outsell gas cars worldwide'],
  ['health', 'An AI passes every medical licensing exam on the first try'],
  ['health', 'Scientists grow a working human kidney in the lab'],
  ['economy', 'A heat-proof wheat saves the harvest in a drought year'],
  ['politics', 'Big cities ban private cars from their centers'],
  ['culture', 'Virtual reality schools open their doors'],
  ['sport', 'A robot wins a marathon and demands a medal'],
  ['health', 'Mosquito-borne diseases spread north as winters warm'],
  ['culture', 'Bees make a comeback after pesticide bans'],
  ['tech', 'Batteries that charge in a minute hit the shelves'],
  ['culture', 'The first pet translator collar is a hit; dogs mostly say "food"'],
]

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Steps through POOL in a scrambled order that visits every item once per cycle. */
const STRIDE = (() => {
  let s = 41
  while (gcd(s, POOL.length) !== 1) s++
  return s
})()

function poolIndex(year: number): number {
  const k = year - PRESENT_YEAR - 1
  const n = POOL.length
  return (((k * STRIDE) % n) + n) % n
}

/** The headlines for a future year (empty for history). */
export function futureHeadlines(year: number): HeadlineRow[] {
  if (year <= PRESENT_YEAR) return []
  const out: HeadlineRow[] = SCHEDULED.filter((r) => r[0] === year)
  const [kind, headline] = POOL[poolIndex(year)]
  out.push([year, kind, 1, 'world', headline])
  // The Games and the World Cup keep their rhythm after the known hosts run out.
  if (year > 2034) {
    if (year % 4 === 0) out.push([year, 'sport', 1, 'world', 'The Summer Olympics open'])
    if (year % 4 === 2) {
      out.push([year, 'sport', 1, 'world', 'The World Cup kicks off'])
      out.push([year, 'sport', 0, 'world', 'The Winter Olympics open'])
    }
  }
  return out
}

/** For tests: how many different pool headlines there are. */
export const FUTURE_POOL_SIZE = POOL.length
