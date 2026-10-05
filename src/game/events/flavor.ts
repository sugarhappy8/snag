// Offline flavor lines for the life log: the little first-person one-liners that make a
// year feel lived in ("I said my first word: 'potato'."), chosen to fit the character's
// age and situation, with real family names filled in and no repeats for a long while.
import { children as childrenOf, currentPartner, inPrison, log, peopleBy } from '../core'
import { chance, pick, randInt, shuffle } from '../rng'
import { locale, localPick, localSoftDrink } from '../data/locales'
import type { GameState, Json, Person, Tone } from '../types'
import { country, friends, grandkids, inUniversity, mother, father, pets, playSport, siblings } from './helpers'

type Pool = { key: string; lines: readonly string[]; weight: number; tone?: Tone }

const FIRST_WORDS = ['potato', 'no', 'cookie', 'dada', 'mama', 'uh-oh', 'doggy', 'ball', 'nope', 'banana', 'taxes', 'meow', 'more', 'why', 'pizza', 'bye-bye']
const FOODS = ['chicken nuggets', 'pizza', 'pancakes', 'spaghetti', 'dumplings', 'noodles', 'fried rice', 'soup']
const SHOWS = ['a cooking competition show', 'a true-crime documentary', 'a reality dating show', 'a cartoon about talking vegetables', 'a nature documentary about otters', 'a soap opera', 'a show about people buying houses', 'an anime about volleyball']
const HOBBIES = ['knitting', 'birdwatching', 'chess', 'baking sourdough', 'woodworking', 'gardening', 'crossword puzzles', 'jigsaw puzzles', 'photography', 'model trains', 'pottery', 'astronomy']

const BABY = [
  'I spent the year chewing on everything I could reach.',
  'I learned that my feet belong to me.',
  'I threw up on a stranger at the grocery store.',
  'I screamed through an entire airplane flight.',
  'I discovered I could make my parents jump by dropping my spoon.',
  'I pulled the cat’s tail. The cat has not forgiven me.',
  'I figured out how to clap.',
  'I sneezed in the middle of eating mashed peas.',
  'I spent a lot of time staring at the ceiling fan.',
  'I grabbed a fistful of my own hair and screamed about it.',
  'I fell asleep in my high chair with my face in my food.',
  'I learned to blow raspberries.',
  'I cried every time the vacuum turned on.',
  'I ate a crayon. It was blue.',
  'I giggled every time someone said "boop."',
  'I tried my first lemon. I did not care for it.',
  'My mother, {mom}, sang me to sleep every night.',
  'My father, {dad}, made airplane noises to get me to eat.',
  'I spit up on my father, {dad}, right before his big meeting.',
  'I grabbed my mother {mom}’s glasses and threw them on the floor.',
  'I learned to wave bye-bye.',
  'I unrolled an entire roll of toilet paper.',
]

const TODDLER = [
  'I learned how to count to ten. Mostly.',
  'I threw a tantrum in the cereal aisle.',
  'I refused to wear pants for a whole week.',
  'I drew on the living room wall with a marker.',
  'I asked "why?" about four thousand times.',
  'I hid my vegetables under my plate.',
  'I learned all the words to a song about a baby shark.',
  'I fell down the stairs, but I was okay.',
  'I insisted on wearing my rain boots every single day.',
  'I named a rock "Steve" and carried it everywhere.',
  'I tried to flush my father {dad}’s keys down the toilet.',
  'I got my head stuck between the bars of a railing.',
  'I learned to ride a tricycle.',
  'I ate sand at the playground.',
  'I cut my own hair with safety scissors.',
  'I told my mother, {mom}, that I was going to marry her when I grew up.',
  'I cried because my sandwich was cut into squares instead of triangles.',
  'I learned my colors. Purple is my favorite.',
  'I made a fort out of couch cushions.',
  'I refused to eat anything that wasn’t {food}.',
  'I followed my {sibRel}, {sib}, around all year.',
  'I chased pigeons at the park.',
  'I started preschool and cried on the first day.',
  'I licked a frozen pole. It was a mistake.',
  'I made my {petSpecies}, {pet}, wear a hat.',
]

const CHILD = [
  'I learned how to ride a bike without training wheels.',
  'I collected rocks all summer.',
  'I built a sandcastle at the beach.',
  'I was obsessed with dinosaurs this year.',
  'I learned how to whistle.',
  'I read my first chapter book.',
  'I got a bad sunburn at summer camp.',
  'I learned how to swim.',
  'I lost a tooth eating an apple.',
  'I broke my arm falling off the monkey bars.',
  'I traded my lunch for a classmate’s cookies.',
  'I tried to dig a hole to the other side of the world.',
  'I spent the summer catching fireflies.',
  'I got grounded for jumping on the bed.',
  'I asked for a pony for my birthday. I did not get a pony.',
  'I stayed up past my bedtime reading with a flashlight.',
  'I learned to tie my shoes.',
  'I built a treehouse with my father, {dad}.',
  'I baked cookies with my mother, {mom}.',
  'I got into a pillow fight with my {sibRel}, {sib}.',
  'I fought with my {sibRel}, {sib}, over the TV remote.',
  'My best friend {friend} and I built a secret clubhouse.',
  'I played video games with {friend} all weekend.',
  'I started a rock collection.',
  'I got a gold star for my spelling test.',
  'I made a volcano out of baking soda and vinegar.',
  'I learned all the countries in Europe.',
  'I tried to teach my {petSpecies}, {pet}, to fetch.',
  'I went on a family road trip and asked "are we there yet?" every five minutes.',
  'I watched {show} way too much.',
  'I tried {food} for the first time and loved it.',
  'I {ballWin} at a neighborhood {ballgame} game.',
  'I set up a {stand} and made {standMoney}.',
]

const TEEN = [
  'I grew three inches this year.',
  'I spent hours scrolling on my phone every night.',
  'I got braces.',
  'I had a huge pimple on picture day.',
  'I dyed my hair a color I regret.',
  'I started keeping a journal.',
  'I stayed up all night playing video games.',
  'I learned to play three chords on the guitar.',
  'I got really into a band nobody has heard of.',
  'I spent the summer working on my tan.',
  'I argued with my mother, {mom}, about my curfew.',
  'I slammed my bedroom door at least once a week.',
  'I told my father, {dad}, that he just doesn’t understand me.',
  'I borrowed my {sibRel} {sib}’s clothes without asking.',
  'I went to {shopping} with {friend} and bought nothing.',
  'I stayed up all night texting {friend}.',
  'I binge-watched {show}.',
  'I tried to grow a mustache. It was a disappointing mustache.',
  'I learned to cook {food}.',
  'I got lost in a rabbit hole of conspiracy videos.',
  'I went through an emo phase.',
  'I spent my birthday money on sneakers.',
  'I got my first pair of designer sunglasses.',
  'I went to my first concert.',
  'I memorized every line of my favorite movie.',
  'I took a selfie every single day this year.',
  'I spent the summer at the public pool.',
]

const GRADE_SCHOOL = [
  'I forgot my homework at home three times this year.',
  'I got a perfect score on a math quiz.',
  'I fell asleep in class.',
  'I got detention for talking in class.',
  'I sat at the back of the bus all year.',
  'I got picked last in gym class.',
  'I won a class spelling bee.',
  'I made the honor roll at {school}.',
  'I passed notes in class all year.',
  'I got caught chewing gum in class.',
  'I joined a club at {school}.',
  'I ate lunch alone in the library a few times.',
  'I had a substitute teacher who cried.',
  'I studied for a test for once.',
  'I forgot my locker combination for an entire week.',
  'I got food poisoning from the {school} cafeteria.',
]

const UNIVERSITY = [
  'I pulled an all-nighter before finals.',
  'I lived on instant noodles for a whole semester.',
  'I changed my mind about my major at least twice.',
  'I fell asleep in the library.',
  'I went to a campus party and left early.',
  'I skipped my 8 AM lecture way too many times.',
  'I bought a textbook for $300 and never opened it.',
  'I joined an intramural dodgeball team.',
  'I spent spring break sleeping.',
  'I got lost on campus during my first week.',
  'I accidentally shrank all my laundry.',
  'I wrote a ten-page paper the night before it was due.',
  'I visited my professor’s office hours. It actually helped.',
]

const ADULT = [
  'I started a new workout routine and quit after two weeks.',
  'I paid my bills on time all year.',
  'I spent a weekend reorganizing my closet.',
  'I bought a houseplant. It died.',
  'I tried to learn a new language on my phone.',
  'I binge-watched {show}.',
  'I took up {hobby}.',
  'I went on a long hike.',
  'I learned to make {food} from scratch.',
  'I got a parking ticket.',
  'I spent way too much money on takeout.',
  'I went to a friend’s wedding and cried during the speeches.',
  'I tried a new hairstyle.',
  'I did my taxes three hours before the deadline.',
  'I got food poisoning from a sketchy food truck.',
  'I adopted a sourdough starter.',
  'I ran a 5K and walked most of it.',
  'I spent a weekend at the beach.',
  'I got lost driving around {city}.',
  'I got really into true-crime podcasts.',
  'I went to a music festival.',
  'I threw a dinner party that went surprisingly well.',
  'I got stuck in an elevator for an hour.',
  'I called my mother, {mom}, every Sunday.',
  'My father, {dad}, taught me how to change a tire.',
  'I went to brunch with {friend}.',
  'I helped {friend} move apartments.',
  'I had a long phone call with my {sibRel}, {sib}.',
  'I visited a museum in {city}.',
  'I spent a weekend doing absolutely nothing.',
]

const WORKER = [
  'I worked late more nights than I’d like to admit.',
  'I fixed the office printer and became a legend at {company}.',
  'I sat through a meeting that could have been an email.',
  'I microwaved fish in the break room at {company}. People were upset.',
  'I had a work nightmare about being late to a meeting.',
  'I got a "Best Attitude" certificate at {company}.',
  'I accidentally replied-all to a company-wide email.',
  'I spent my lunch breaks reading in my car.',
  'I went to the {company} holiday party.',
  'My boss at {company} called me by the wrong name for a month.',
  'I took a week of vacation and checked my email every day.',
  'I trained a new hire at {company}.',
  'I complained about my commute to anyone who would listen.',
  'I organized the office birthday cards at {company}.',
]

const UNEMPLOYED = [
  'I sent out dozens of job applications.',
  'I spent too much time watching daytime TV.',
  'I slept in until noon most days.',
  'I tried to start a podcast. Nobody listened.',
  'I perfected my résumé for the hundredth time.',
  'I spent a lot of time thinking about what I want to do with my life.',
  'I reorganized my sock drawer by color.',
]

const PARTNERED = [
  '{partner} and I had a lovely date night.',
  '{partner} and I argued about whose turn it was to do the dishes.',
  '{partner} and I binge-watched {show} together.',
  '{partner} and I went on a weekend getaway.',
  '{partner} and I cooked {food} together.',
  '{partner} surprised me with breakfast in bed.',
  '{partner} and I adopted a houseplant together and named it Gerald.',
  '{partner} and I took a dance class together.',
  '{partner} snored all year. I barely slept.',
]

const PARENT = [
  'My {kidRel}, {kid}, drew a picture of me. It was mostly legs.',
  'I took my {kidRel}, {kid}, to the zoo.',
  'I went to my {kidRel} {kid}’s school play.',
  'My {kidRel}, {kid}, asked me where babies come from. I panicked.',
  'I helped my {kidRel}, {kid}, with homework I didn’t understand.',
  'My {kidRel}, {kid}, and I built a blanket fort.',
  'I stepped on one of my {kidRel} {kid}’s toys in the dark.',
  'I taught my {kidRel}, {kid}, how to ride a bike.',
  'I watched my {kidRel} {kid}’s soccer game and yelled too much.',
]

const ADULT_KIDS = [
  'My {kidRel}, {kid}, called me for advice.',
  'My {kidRel}, {kid}, came home for the holidays.',
  'I sent my {kidRel}, {kid}, a care package.',
  'My {kidRel}, {kid}, forgot my birthday. I didn’t forget.',
]

const PET_OWNER = [
  'My {petSpecies}, {pet}, and I went on a lot of walks.',
  'My {petSpecies}, {pet}, destroyed a couch cushion.',
  'I took my {petSpecies}, {pet}, to the vet for a checkup.',
  'My {petSpecies}, {pet}, slept on my feet every night.',
  'I bought my {petSpecies}, {pet}, a tiny sweater.',
  'My {petSpecies}, {pet}, learned a new trick.',
]

const ELDER = [
  'I complained about the weather a lot this year.',
  'I took up {hobby}.',
  'I yelled at kids to get off my lawn.',
  'I watched the birds from my porch every morning.',
  'I took a lot of naps.',
  'I told the same story at three family dinners in a row.',
  'I went for a walk around the block every morning.',
  'I wrote letters to old friends.',
  'I did a crossword puzzle every day.',
  'I mixed up my grandkids’ names more than once.',
  'I got my flu shot early.',
  'I organized my old photo albums.',
  'I couldn’t find my glasses. They were on my head.',
  'I joined a {walkGroup}.',
  'I watched the evening news every night and disagreed with it.',
  'My grandchild, {grandkid}, taught me how to use emojis.',
  'I baked cookies with my grandchild, {grandkid}.',
  'I went to the doctor for my annual checkup.',
  'I started going to bed at 8 PM.',
]

const RETIREE = [
  'I enjoyed another year of retirement.',
  'I didn’t set an alarm all year.',
  'I spent the year traveling with my pension money.',
  'I spent a lot of time in my garden.',
  'I went fishing every week.',
  'I volunteered at the local library.',
]

const PRISONER = [
  'I did push-ups in my cell every morning.',
  'I read every book on the prison library cart.',
  'I counted the days until my release.',
  'I traded ramen for stamps in the yard.',
  'I wrote letters to people on the outside.',
  'I played cards with my cellmate, {cellmate}, every night.',
  'My cellmate, {cellmate}, snored all year.',
  'I learned to make a cake out of commissary snacks.',
  'I kept my head down and stayed out of trouble.',
  'I spent a lot of time staring at the ceiling.',
  'I watched the same movie in the rec room eleven times.',
  'I lost a game of chess to a guard.',
  'I got really good at handball in the yard.',
  'I complained about the prison food every single day.',
  'I got a letter from my mother, {mom}.',
]

const JUVIE = [
  'I counted ceiling tiles in my room at juvie.',
  'I took classes in juvenile detention.',
  'I missed my family a lot this year.',
  'I played basketball in the juvie gym every afternoon.',
  'I got a visit from my mother, {mom}.',
]

const RICH = [
  'I bought a ridiculously expensive bottle of wine and couldn’t taste the difference.',
  'I flew first class and got a warm towel.',
  'I hired someone to organize my closets.',
  'I got invited to a fancy charity gala.',
  'I tipped a valet $100 just to see his face.',
]

const BROKE = [
  'I ate instant noodles for most of the year.',
  'I checked my bank balance with one eye closed.',
  'I cut coupons every Sunday.',
  'I sold some old stuff online to make rent.',
  'I walked everywhere to save on gas.',
]

const HOMELESS = [
  'I slept in a different place almost every night.',
  'I found a dry spot under a bridge during a storm.',
  'A kind stranger bought me a sandwich.',
  'I spent cold nights at a shelter.',
]

/** One-time childhood milestones, logged at the right age. */
const MILESTONES: { id: string; minAge: number; maxAge: number; chance: number; line: (g: GameState) => string }[] = [
  { id: 'firstWord', minAge: 1, maxAge: 2, chance: 0.8, line: (g) => `I said my first word: '${pick(g, FIRST_WORDS)}'.` },
  { id: 'firstSteps', minAge: 1, maxAge: 2, chance: 0.75, line: () => 'I took my first steps.' },
  { id: 'pottyTrained', minAge: 2, maxAge: 4, chance: 0.5, line: () => 'I was potty trained.' },
  { id: 'firstTooth', minAge: 6, maxAge: 7, chance: 0.6, line: () => 'I lost my first baby tooth.' },
  { id: 'bike', minAge: 5, maxAge: 8, chance: 0.35, line: () => 'I learned to ride a bike.' },
]

// ---------------------------------------------------------------------------

function personOrNull(p: Person | undefined): Person | null {
  return p && p.alive ? p : null
}

/** Token values for this year (one random person per kind). */
function tokens(g: GameState): Record<string, string | undefined> {
  const t: Record<string, string | undefined> = {}
  const mom = personOrNull(mother(g))
  const dad = personOrNull(father(g))
  if (mom) t.mom = mom.firstName
  if (dad) t.dad = dad.firstName
  const sibs = siblings(g)
  if (sibs.length) {
    const s = pick(g, sibs)
    t.sib = s.firstName
    t.sibRel = s.gender === 'male' ? 'brother' : 'sister'
  }
  const fr = friends(g)
  if (fr.length) t.friend = pick(g, fr).firstName
  const partner = currentPartner(g)
  if (partner) t.partner = partner.firstName
  const allPets = pets(g)
  if (allPets.length) {
    const p = pick(g, allPets)
    t.pet = p.firstName
    t.petSpecies = (p.species ?? 'pet').toLowerCase()
  }
  const youngKids = childrenOf(g).filter((k) => k.age >= 3 && k.age <= 14)
  const grownKids = childrenOf(g).filter((k) => k.age >= 18)
  if (youngKids.length) {
    const k = pick(g, youngKids)
    t.kid = k.firstName
    t.kidRel = k.gender === 'male' ? 'son' : 'daughter'
  }
  if (grownKids.length) {
    const k = pick(g, grownKids)
    t.adultKid = k.firstName
    t.adultKidRel = k.gender === 'male' ? 'son' : 'daughter'
  }
  const gks = grandkids(g, 4)
  if (gks.length) t.grandkid = pick(g, gks).firstName
  const mates = peopleBy(g, ['cellmate'])
  if (mates.length) t.cellmate = pick(g, mates).firstName
  const c = g.character
  const cur = c.education.current
  if (cur) t.school = cur.school
  const job = c.job ?? c.partTimeJob
  if (job) t.company = job.company
  t.city = c.city
  t.country = country(g).name
  // Half the time something universal, half the time a local dish ('nasi goreng', 'injera', 'mac and cheese' in the US).
  t.food = chance(g, 0.5) ? pick(g, FOODS) : localPick(g, 'food') || pick(g, FOODS)
  t.show = pick(g, SHOWS)
  // Kid stuff that changes by country: the neighborhood ball game and the summer drink stand.
  const ball = c.countryId === 'us' ? 'baseball' : playSport(g)
  t.ballgame = ball
  t.ballWin = /baseball|softball/.test(ball) ? 'hit a home run' : /cricket/.test(ball) ? 'hit a six' : /basketball/.test(ball) ? 'scored the winning basket' : /volleyball|takraw/.test(ball) ? 'served the winning point' : 'scored the winning goal'
  const usStand = c.countryId === 'us' || c.countryId === 'ca'
  t.stand = usStand ? 'lemonade stand' : `${localSoftDrink(g)} stand`
  t.standMoney = usStand ? 'three dollars' : 'a little pocket money'
  const shops = locale(g).hangouts.filter((h) => /mall|market|bazaar|souk|shopping|plaza|arcade/i.test(h))
  t.shopping = c.countryId === 'us' ? 'the mall' : shops.length ? pick(g, shops) : 'the market'
  t.walkGroup = c.countryId === 'us' ? 'mall-walking group' : 'morning walking group'
  t.hobby = pick(g, HOBBIES)
  return t
}

/** Fill {tokens}; null if any token is missing. */
function fill(line: string, t: Record<string, string | undefined>): string | null {
  let ok = true
  const out = line.replace(/\{(\w+)\}/g, (_, k: string) => {
    const val = t[k]
    if (val === undefined) ok = false
    return val ?? ''
  })
  return ok ? out : null
}

/** Pools that fit the character right now, weighted. */
function poolsFor(g: GameState): Pool[] {
  const c = g.character
  const age = c.age
  const pools: Pool[] = []
  if (inPrison(g)) {
    const juvie = age < 18
    pools.push(juvie ? { key: 'juvie', lines: JUVIE, weight: 10 } : { key: 'prison', lines: PRISONER, weight: 10 })
    if (juvie) pools.push({ key: 'prison', lines: PRISONER.slice(0, 9), weight: 4 })
    return pools
  }
  if (age < 2) pools.push({ key: 'baby', lines: BABY, weight: 10 })
  else if (age < 5) pools.push({ key: 'toddler', lines: TODDLER, weight: 10 })
  else if (age < 13) pools.push({ key: 'child', lines: CHILD, weight: 10 })
  else if (age < 18) pools.push({ key: 'teen', lines: TEEN, weight: 10 })
  else if (age < 65) pools.push({ key: 'adult', lines: ADULT, weight: 8 })
  else pools.push({ key: 'elder', lines: ELDER, weight: 10 })

  const cur = c.education.current
  if (cur && (cur.level === 'elementary' || cur.level === 'middle' || cur.level === 'high')) pools.push({ key: 'school', lines: GRADE_SCHOOL, weight: 5 })
  if (inUniversity(g)) pools.push({ key: 'uni', lines: UNIVERSITY, weight: 7 })
  if (age >= 14 && (c.job || c.partTimeJob)) pools.push({ key: 'work', lines: WORKER, weight: 6 })
  if (age >= 18 && age < 65 && !c.job && !c.partTimeJob && !cur && !c.retired) pools.push({ key: 'unemployed', lines: UNEMPLOYED, weight: 4 })
  if (age >= 16 && currentPartner(g)) pools.push({ key: 'partner', lines: PARTNERED, weight: 4 })
  if (childrenOf(g).some((k) => k.age >= 3 && k.age <= 14)) pools.push({ key: 'parent', lines: PARENT, weight: 5 })
  if (childrenOf(g).some((k) => k.age >= 18)) pools.push({ key: 'adultKids', lines: ADULT_KIDS.map((l) => l.replace(/\{kid\}/g, '{adultKid}').replace(/\{kidRel\}/g, '{adultKidRel}')), weight: 3 })
  if (age >= 4 && pets(g).length) pools.push({ key: 'pet', lines: PET_OWNER, weight: 3 })
  if (c.retired) pools.push({ key: 'retiree', lines: RETIREE, weight: 4 })
  if (age >= 18) {
    if (c.residence.status === 'homeless') pools.push({ key: 'homeless', lines: HOMELESS, weight: 6 })
    else if (c.money < 500) pools.push({ key: 'broke', lines: BROKE, weight: 3 })
    else if (c.money >= 1_000_000) pools.push({ key: 'rich', lines: RICH, weight: 3 })
  }
  return pools
}

function recentKeys(g: GameState): string[] {
  const raw = g.flags.flavorRecent
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
}

function milestonesDone(g: GameState): Record<string, Json> {
  const raw = g.flags.milestonesLogged
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  const fresh: Record<string, Json> = {}
  g.flags.milestonesLogged = fresh
  return fresh
}

/** Log one-time toddler milestones (first word, first steps...). Returns how many were logged. */
function logMilestones(g: GameState): number {
  const age = g.character.age
  if (age > 8 || inPrison(g)) return 0
  const done = milestonesDone(g)
  let n = 0
  for (const m of MILESTONES) {
    if (done[m.id] || age < m.minAge || age > m.maxAge) continue
    // Guaranteed on the last eligible year so every life gets them.
    if (age < m.maxAge && !chance(g, m.chance)) continue
    done[m.id] = age
    log(g, m.line(g), 'good')
    n++
  }
  return n
}

/** Add 1-2 flavor lines for this year to the life log. */
export function addFlavorLines(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const milestoneLines = logMilestones(g)
  const want = Math.max(0, (chance(g, 0.4) ? 2 : 1) - milestoneLines)
  if (want === 0) return
  const pools = poolsFor(g)
  if (pools.length === 0) return
  const t = tokens(g)
  const recent = recentKeys(g)
  const used = new Set<string>()
  let added = 0
  for (let attempt = 0; attempt < 12 && added < want; attempt++) {
    const pool = weightedPool(g, pools.filter((p) => !used.has(p.key) || pools.length === 1))
    if (!pool) break
    const options = shuffle(
      g,
      pool.lines.map((line, i) => ({ line, key: `${pool.key}:${i}` })),
    ).filter((o) => !recent.includes(o.key))
    let chosen: { text: string; key: string } | null = null
    for (const o of options) {
      const text = fill(o.line, t)
      if (text) {
        chosen = { text, key: o.key }
        break
      }
    }
    used.add(pool.key)
    if (!chosen) continue
    log(g, chosen.text, pool.tone ?? 'neutral')
    recent.push(chosen.key)
    added++
  }
  g.flags.flavorRecent = recent.slice(-60)
}

function weightedPool(g: GameState, pools: Pool[]): Pool | null {
  const total = pools.reduce((s, p) => s + p.weight, 0)
  if (total <= 0) return null
  let r = randInt(g, 1, total)
  for (const p of pools) {
    r -= p.weight
    if (r <= 0) return p
  }
  return pools[pools.length - 1]
}

/** Exposed for tests: every line in every pool. */
export const FLAVOR_POOLS: Record<string, readonly string[]> = {
  baby: BABY,
  toddler: TODDLER,
  child: CHILD,
  teen: TEEN,
  school: GRADE_SCHOOL,
  uni: UNIVERSITY,
  adult: ADULT,
  work: WORKER,
  unemployed: UNEMPLOYED,
  partner: PARTNERED,
  parent: PARENT,
  adultKids: ADULT_KIDS,
  pet: PET_OWNER,
  elder: ELDER,
  retiree: RETIREE,
  prison: PRISONER,
  juvie: JUVIE,
  rich: RICH,
  broke: BROKE,
  homeless: HOMELESS,
}
