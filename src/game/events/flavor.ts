// Offline flavor lines for the life log: the little first-person one-liners that make a
// year feel lived in ("I said my first word: 'potato'."), chosen to fit the character's
// age and situation, with real family names filled in and no repeats for a long while.
//
// Flavor is fully text-side (R2-B2, D5): every draw here comes from the text stream (text/draw.ts), never from g.rng, so how many
// lines a year prints, or which, can move nothing but text. Three details keep it that way. The toddler milestone roll decides which
// age goes into flags.milestonesLogged (state, not text), so it reads a keyed stream, not the text cursor. A flavor line takes its
// log id from the text stream (textLineId), because log() would otherwise spend a uid per line and the count would move g.nextId.
// And the helpers that draw (showName, radioShow, localPick, localSoftDrink) are handed the text draw as their `draw` argument.
import { children as childrenOf, currentPartner, formatMoney, inPrison, log, peopleBy } from '../core'
import { outcomeStream } from '../kernel/streams'
import type { Picker } from '../rng'
import { locale, localPick, localSoftDrink } from '../data/locales'
import type { GameState, Json, Person, Tone } from '../types'
import { country, friends, grandkids, inUniversity, mother, father, pets, playSport, siblings } from './helpers'
import { anachronistic, eraOk, eraStrip, kidPrize, movieKind, radioShow, showName, venueExists } from './era'
import { eraFlavorPools } from './era-life'
import { textLineId, textRng, type TextRng } from '../text/draw'
import { fnv1a, mix32 } from '../text/hash'
import { ringRead, ringWrite } from '../text/memory'

type Pool = { key: string; lines: readonly string[]; weight: number; tone?: Tone }

const FIRST_WORDS = ['potato', 'no', 'cookie', 'dada', 'mama', 'uh-oh', 'doggy', 'ball', 'nope', 'banana', 'taxes', 'meow', 'more', 'why', 'pizza', 'bye-bye']
const FOODS = ['chicken nuggets', 'pizza', 'pancakes', 'spaghetti', 'dumplings', 'noodles', 'fried rice', 'soup']
/** Foods that didn't exist (or weren't kid staples) yet: chicken nuggets are an eighties invention. */
const FOOD_SINCE: Record<string, number> = { 'chicken nuggets': 1983, pizza: 1950 }
const HOBBIES = ['knitting', 'birdwatching', 'chess', 'baking sourdough', 'woodworking', 'gardening', 'crossword puzzles', 'jigsaw puzzles', 'photography', 'model trains', 'pottery', 'astronomy']

// Lines may carry era tags ("@tv ...", "@-1960 ...", see events/era.ts): a line only shows up in
// the years (and countries) where it makes sense, so a 1930s childhood gets the radio and the
// picture house and a 2020s one gets the phone. Every pool keeps untagged lines for any year.

const BABY = [
  'I spent the year chewing on everything I could reach.',
  'I learned that my feet belong to me.',
  'I threw up on a stranger at the grocery store.',
  '@flights I screamed through an entire airplane flight.',
  'I discovered I could make my parents jump by dropping my spoon.',
  'I pulled the cat’s tail. The cat has not forgiven me.',
  'I figured out how to clap.',
  'I sneezed in the middle of eating mashed peas.',
  '@1925 I spent a lot of time staring at the ceiling fan.',
  'I grabbed a fistful of my own hair and screamed about it.',
  'I fell asleep in my high chair with my face in my food.',
  'I learned to blow raspberries.',
  '@1930 I cried every time the vacuum turned on.',
  'I ate a crayon. It was blue.',
  'I giggled every time someone said "boop."',
  'I tried my first lemon. I did not care for it.',
  'My mother, {mom}, sang me to sleep every night.',
  'My father, {dad}, made airplane noises to get me to eat.',
  'I spit up on my father, {dad}, right before his big meeting.',
  'I grabbed my mother {mom}’s glasses and threw them on the floor.',
  'I learned to wave bye-bye.',
  'I unrolled an entire roll of toilet paper.',
  '@-1950 I slept in a dresser drawer lined with a blanket. It was very cozy.',
  '@radio,!tv I fell asleep every evening to the hum of the family radio.',
  '@-1960 I was wheeled around the neighborhood in an enormous pram.',
]

const TODDLER = [
  'I learned how to count to ten. Mostly.',
  'I threw a tantrum in the cereal aisle.',
  'I refused to wear pants for a whole week.',
  'I drew on the living room wall with a marker.',
  'I asked "why?" about four thousand times.',
  'I hid my vegetables under my plate.',
  '@2016 I learned all the words to a song about a baby shark.',
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
  '@1950 I started preschool and cried on the first day.',
  'I licked a frozen pole. It was a mistake.',
  'I made my {petSpecies}, {pet}, wear a hat.',
  'I learned all the words to a nursery rhyme and sang it at every meal.',
  '@-1955 I played with a wooden horse my grandfather carved for me.',
  '@tv I tried to climb inside the TV to meet the puppets.',
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
  'I fought with my {sibRel}, {sib}, over {kidPrize}.',
  'My best friend {friend} and I built a secret clubhouse.',
  '@videoGameConsole I played video games with {friend} all weekend.',
  'I started a rock collection.',
  'I got a gold star for my spelling test.',
  '@1950 I made a volcano out of baking soda and vinegar.',
  'I learned all the countries in Europe.',
  'I tried to teach my {petSpecies}, {pet}, to fetch.',
  '@cars I went on a family road trip and asked "are we there yet?" every five minutes.',
  '@tv I watched {show} way too much.',
  'I tried {food} for the first time and loved it.',
  'I hit a home run at a neighborhood baseball game.',
  'I set up a lemonade stand and made three dollars.',
  'I played marbles with the kids on my street until it got dark.',
  '@-1940 I raced a wooden hoop down the street with a stick.',
  '@-1950 I traded picture cards from cigarette packs with my friends.',
  '@radio,!tv I never missed {radioShow} on the family radio.',
  '@tv,!colorTv I watched cartoons on the family’s black-and-white TV every Saturday morning.',
  '@1978,-1998 I spent every coin I could find at the arcade.',
  '@1910 I saw my first {movieKind} at the cinema and talked about it for a week.',
  '@-1965 I read comic books under the covers until my eyes hurt.',
  '@homeComputer,!smartphone I played computer games on the family computer until I was kicked off.',
  '@smartphone I begged for screen time every single day.',
]

const TEEN = [
  'I grew three inches this year.',
  '@smartphone I spent hours scrolling on my phone every night.',
  '@1950 I got braces.',
  'I had a huge pimple on picture day.',
  '@1955 I dyed my hair a color I regret.',
  'I started keeping a journal.',
  '@videoGameConsole I stayed up all night playing video games.',
  'I learned to play three chords on the guitar.',
  'I got really into a band nobody has heard of.',
  'I spent the summer working on my tan.',
  'I argued with my mother, {mom}, about my curfew.',
  'I slammed my bedroom door at least once a week.',
  'I told my father, {dad}, that he just doesn’t understand me.',
  'I borrowed my {sibRel} {sib}’s clothes without asking.',
  '@1962 I went to the mall with {friend} and bought nothing.',
  '@texting I stayed up all night texting {friend}.',
  '@streaming I binge-watched {show}.',
  'I tried to grow a mustache. It was a disappointing mustache.',
  'I learned to cook {food}.',
  '@videoSharing I got lost in a rabbit hole of conspiracy videos.',
  '@2002,-2012 I went through an emo phase.',
  '@1925 I spent my birthday money on sneakers.',
  '@1950 I got my first pair of designer sunglasses.',
  'I went to my first concert.',
  '@1930 I memorized every line of my favorite movie.',
  '@smartphone I took a selfie every single day this year.',
  'I spent the summer at the public pool.',
  '@landline,!texting I tied up the family telephone for hours talking to {friend}.',
  '@-1965 I wrote long letters to a pen pal overseas.',
  '@1955,-1975 I danced to rock and roll records until my parents banged on the wall.',
  '@1930,-1960 I saved up my pocket money for the Saturday picture show.',
  '@1975,-2004 I made {friend} a mixtape and agonized over the song order.',
  '@1988,-2003 I got a pager and felt incredibly important.',
  '@internet,!smartphone I spent hours in internet chat rooms pretending to be older.',
  '@internet,!smartphone,1997 I spent whole evenings on instant messenger and agonized over my away message.',
  '@internet,-2007 I got kicked off the dial-up every time somebody needed the phone.',
  '@tv,!streaming I stayed up late watching {show} with the volume way down.',
  '@-1950 I left school to help support the family and felt very grown up about it.',
  '@1955,-1985 I spent the summer cruising around town with {friend}.',
]

const GRADE_SCHOOL = [
  'I forgot my homework at home three times this year.',
  'I got a perfect score on a math quiz.',
  'I fell asleep in class.',
  'I got detention for talking in class.',
  '@1930 I sat at the back of the bus all year.',
  'I got picked last in gym class.',
  'I won a class spelling bee.',
  'I made the honor roll at {school}.',
  'I passed notes in class all year.',
  '@1910 I got caught chewing gum in class.',
  'I joined a club at {school}.',
  'I ate lunch alone in the library a few times.',
  'I had a substitute teacher who cried.',
  'I studied for a test for once.',
  '@1940 I forgot my locker combination for an entire week.',
  'I got food poisoning from the {school} cafeteria.',
  '@-1960 I got ink all over my sleeves from my fountain pen.',
  '@-1950 I got my knuckles rapped with a ruler for talking in class.',
  '@-1930 I practiced my letters on a slate until my arm hurt.',
  '@homeComputer I got to use the computer lab once a week and felt like a genius.',
]

const UNIVERSITY = [
  'I pulled an all-nighter before finals.',
  '@1972 I lived on instant noodles for a whole semester.',
  '@-1972 I lived on bread and cheap soup for a whole semester.',
  'I changed my mind about my major at least twice.',
  'I fell asleep in the library.',
  'I went to a campus party and left early.',
  'I skipped my 8 AM lecture way too many times.',
  'I bought a textbook for {textbookPrice} and never opened it.',
  'I joined an intramural dodgeball team.',
  '@1960 I spent spring break sleeping.',
  'I got lost on campus during my first week.',
  'I accidentally shrank all my laundry.',
  'I wrote a ten-page paper the night before it was due.',
  'I visited my professor’s office hours. It actually helped.',
  '@-1985 I typed my thesis on a typewriter and ran out of correction fluid.',
]

const ADULT = [
  'I started a new workout routine and quit after two weeks.',
  'I paid my bills on time all year.',
  'I spent a weekend reorganizing my closet.',
  'I bought a houseplant. It died.',
  '@smartphone I tried to learn a new language on my phone.',
  '@1965,!smartphone I tried to learn a new language from a set of tapes.',
  '@streaming I binge-watched {show}.',
  'I took up {hobby}.',
  'I went on a long hike.',
  'I learned to make {food} from scratch.',
  '@1935 I got a parking ticket.',
  'I spent way too much money on takeout.',
  'I went to a friend’s wedding and cried during the speeches.',
  'I tried a new hairstyle.',
  '@1920 I did my taxes three hours before the deadline.',
  '@2008 I got food poisoning from a sketchy food truck.',
  'I adopted a sourdough starter.',
  '@1975 I ran a 5K and walked most of it.',
  'I spent a weekend at the beach.',
  '@cars I got lost driving around {city}.',
  '@2006 I got really into true-crime podcasts.',
  '@1967 I went to a music festival.',
  'I threw a dinner party that went surprisingly well.',
  'I got stuck in an elevator for an hour.',
  '@landline I called my mother, {mom}, every Sunday.',
  '@!landline I wrote to my mother, {mom}, every week.',
  'My father, {dad}, taught me how to change a tire.',
  'I went to brunch with {friend}.',
  'I helped {friend} move apartments.',
  '@landline I had a long phone call with my {sibRel}, {sib}.',
  'I visited a museum in {city}.',
  'I spent a weekend doing absolutely nothing.',
  '@radio,!tv I listened to the radio every evening after supper.',
  '@1930,-1965 I went to the pictures every Saturday night.',
  '@tv,!streaming I watched {show} every week without fail.',
  '@-1960 I wore a hat every time I left the house, like a respectable person.',
  '@1950,-1975 I threw a fondue party and burned the bread.',
  '@1980,-1995 I bought a pair of shoulder pads I had no business wearing.',
  '@1988,-2002 My pager went off in the middle of a movie and the whole row turned around.',
  '@cars,landline,-2005 My car broke down and I fed my last coins into a payphone to call for help.',
  '@cars,1934,-1985 I went to the drive-in and spent the whole movie fighting with the window speaker.',
  '@1915,-1965 I caught the newsreel before the picture and finally learned what was going on in the world.',
]

const WORKER = [
  'I worked late more nights than I’d like to admit.',
  '@1985 I fixed the office printer and became a legend at {company}.',
  '@-1985 I fixed the office typewriter and became a legend at {company}.',
  '@internet I sat through a meeting that could have been an email.',
  '@!internet I sat through a meeting that could have been a memo.',
  '@1980 I microwaved fish in the break room at {company}. People were upset.',
  'I had a work nightmare about being late to a meeting.',
  'I got a "Best Attitude" certificate at {company}.',
  '@internet I accidentally replied-all to a company-wide email.',
  '@!internet I sent a memo to the whole office with the boss’s name misspelled.',
  '@cars I spent my lunch breaks reading in my car.',
  '@!cars I spent my lunch breaks reading on a park bench.',
  'I went to the {company} holiday party.',
  'My boss at {company} called me by the wrong name for a month.',
  '@internet I took a week of vacation and checked my email every day.',
  '@landline,!internet I took a week of vacation and called the office every day.',
  'I trained a new hire at {company}.',
  'I complained about my commute to anyone who would listen.',
  'I organized the office birthday cards at {company}.',
]

const UNEMPLOYED = [
  'I sent out dozens of job applications.',
  '@tv I spent too much time watching daytime TV.',
  '@radio,!tv I spent too much time listening to the radio.',
  '@2006 I tried to start a podcast. Nobody listened.',
  'I perfected my résumé for the hundredth time.',
  'I spent a lot of time thinking about what I want to do with my life.',
  'I reorganized my sock drawer by color.',
  '@-1990 I circled job ads in the newspaper every morning.',
]

const PARTNERED = [
  '{partner} and I had a lovely date night.',
  '{partner} and I argued about whose turn it was to do the dishes.',
  '@streaming {partner} and I binge-watched {show} together.',
  '@tv,!streaming {partner} and I watched {show} together every week.',
  '{partner} and I went on a weekend getaway.',
  '{partner} and I cooked {food} together.',
  '{partner} surprised me with breakfast in bed.',
  '{partner} and I adopted a houseplant together and named it Gerald.',
  '{partner} and I took a dance class together.',
  '{partner} snored all year. I barely slept.',
  '@radio,!tv {partner} and I danced in the kitchen to the radio.',
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
  '@smartphone I argued with my {kidRel}, {kid}, about screen time.',
]

const ADULT_KIDS = [
  '@landline My {kidRel}, {kid}, called me for advice.',
  '@!landline My {kidRel}, {kid}, wrote to me for advice.',
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
  '@1960 I got my flu shot early.',
  'I organized my old photo albums.',
  'I couldn’t find my glasses. They were on my head.',
  '@1975 I joined a mall-walking group.',
  '@tv I watched the evening news every night and disagreed with it.',
  '@radio,!tv I listened to the news on the radio every night and disagreed with it.',
  '@smartphone My grandchild, {grandkid}, taught me how to use emojis.',
  '@internet,!smartphone My grandchild, {grandkid}, taught me how to send an email.',
  '@!internet My grandchild, {grandkid}, taught me a dance I absolutely could not do.',
  'I baked cookies with my grandchild, {grandkid}.',
  'I went to the doctor for my annual checkup.',
  'I started going to bed at 8 PM.',
  '@internet I explained to anyone who would listen that we used to manage just fine without the internet.',
  '@tv I told my grandkids we didn’t even have TV when I was little. They didn’t believe me.',
]

const RETIREE = [
  'I enjoyed another year of retirement.',
  'I didn’t set an alarm all year.',
  '@flights I spent the year traveling with my pension money.',
  '@!flights I spent the year taking trains to visit old friends.',
  'I spent a lot of time in my garden.',
  'I went fishing every week.',
  'I volunteered at the local library.',
]

const PRISONER = [
  'I did push-ups in my cell every morning.',
  'I read every book on the prison library cart.',
  'I counted the days until my release.',
  '@1975 I traded ramen for stamps in the yard.',
  '@-1975 I traded cigarettes for stamps in the yard.',
  'I wrote letters to people on the outside.',
  'I played cards with my cellmate, {cellmate}, every night.',
  'My cellmate, {cellmate}, snored all year.',
  'I learned to make a cake out of commissary snacks.',
  'I kept my head down and stayed out of trouble.',
  'I spent a lot of time staring at the ceiling.',
  '@1980 I watched the same movie in the rec room eleven times.',
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
  '@1958 I flew first class and got a warm towel.',
  '@-1958 I sailed first class on an ocean liner and dressed for dinner every night.',
  'I hired someone to organize my closets.',
  'I got invited to a fancy charity gala.',
  '@cars I tipped a valet {valetTip} just to see his face.',
]

const BROKE = [
  '@1972 I ate instant noodles for most of the year.',
  '@-1972 I ate beans and bread for most of the year.',
  'I checked my bank balance with one eye closed.',
  'I cut coupons every Sunday.',
  '@internet I sold some old stuff online to make rent.',
  '@!internet I sold some old stuff at a flea market to make rent.',
  '@cars I walked everywhere to save on gas.',
  '@!cars I walked everywhere to save on bus fare.',
]

const HOMELESS = [
  'I slept in a different place almost every night.',
  'I found a dry spot under a bridge during a storm.',
  'A kind stranger bought me a sandwich.',
  'I spent cold nights at a shelter.',
]

/** One-time childhood milestones, logged at the right age. */
const MILESTONES: { id: string; minAge: number; maxAge: number; chance: number; line: (g: GameState, t: TextRng) => string }[] = [
  { id: 'firstWord', minAge: 1, maxAge: 2, chance: 0.8, line: (_g, t) => `I said my first word: '${t.pick(FIRST_WORDS)}'.` },
  { id: 'firstSteps', minAge: 1, maxAge: 2, chance: 0.75, line: () => 'I took my first steps.' },
  { id: 'pottyTrained', minAge: 2, maxAge: 4, chance: 0.5, line: () => 'I was potty trained.' },
  { id: 'firstTooth', minAge: 6, maxAge: 7, chance: 0.6, line: () => 'I lost my first baby tooth.' },
  { id: 'bike', minAge: 5, maxAge: 8, chance: 0.35, line: () => 'I learned to ride a bike.' },
]

// ---------------------------------------------------------------------------

function personOrNull(p: Person | undefined): Person | null {
  return p && p.alive ? p : null
}

/** Token values for this year (one random person per kind), drawn from the text stream `t`. */
function tokens(g: GameState, t: TextRng): Record<string, string | undefined> {
  const tok: Record<string, string | undefined> = {}
  const draw: Picker = (_g, items) => t.pick(items)
  const mom = personOrNull(mother(g))
  const dad = personOrNull(father(g))
  if (mom) tok.mom = mom.firstName
  if (dad) tok.dad = dad.firstName
  const sibs = siblings(g)
  if (sibs.length) {
    const s = t.pick(sibs)
    tok.sib = s.firstName
    tok.sibRel = s.gender === 'male' ? 'brother' : 'sister'
  }
  const fr = friends(g)
  if (fr.length) tok.friend = t.pick(fr).firstName
  const partner = currentPartner(g)
  if (partner) tok.partner = partner.firstName
  const allPets = pets(g)
  if (allPets.length) {
    const p = t.pick(allPets)
    tok.pet = p.firstName
    tok.petSpecies = (p.species ?? 'pet').toLowerCase()
  }
  const youngKids = childrenOf(g).filter((k) => k.age >= 3 && k.age <= 14)
  const grownKids = childrenOf(g).filter((k) => k.age >= 18)
  if (youngKids.length) {
    const k = t.pick(youngKids)
    tok.kid = k.firstName
    tok.kidRel = k.gender === 'male' ? 'son' : 'daughter'
  }
  if (grownKids.length) {
    const k = t.pick(grownKids)
    tok.adultKid = k.firstName
    tok.adultKidRel = k.gender === 'male' ? 'son' : 'daughter'
  }
  const gks = grandkids(g, 4)
  if (gks.length) tok.grandkid = t.pick(gks).firstName
  const mates = peopleBy(g, ['cellmate'])
  if (mates.length) tok.cellmate = t.pick(mates).firstName
  const c = g.character
  const cur = c.education.current
  if (cur) tok.school = cur.school
  const job = c.job ?? c.partTimeJob
  if (job) tok.company = job.company
  tok.city = c.city
  tok.country = country(g).name
  // Half the time something universal, half the time a local dish ('nasi goreng', 'injera', 'mac and cheese' in the US).
  const foods = FOODS.filter((f) => g.year >= (FOOD_SINCE[f] ?? 0))
  tok.food = t.chance(0.5) ? t.pick(foods) : localPick(g, 'food', c.countryId, draw) || t.pick(foods)
  tok.show = showName(g, draw)
  tok.radioShow = radioShow(g, draw)
  tok.kidPrize = kidPrize(g)
  tok.movieKind = movieKind(g)
  tok.hobby = t.pick(HOBBIES)
  // The local soft drink is drawn here, once, for the lemonade line of localizeLine: drawing it inside the attempt loop would
  // spend a different number of draws depending on which lines the loop tried.
  tok.softDrink = localSoftDrink(g, c.countryId, draw)
  // Amounts in the player's money and year (Settings › Money).
  tok.textbookPrice = formatMoney(300)
  tok.valetTip = formatMoney(100)
  return tok
}

/**
 * The pools were written with an American childhood in mind; a few lines get the player's own
 * country instead: the neighborhood ball game, the summer drink stand, the shopping trip.
 * `tok` holds the year's tokens (the soft drink was drawn there), `t` is the text stream for the shop.
 */
function localizeLine(g: GameState, line: string, t: TextRng, tok: Record<string, string | undefined>): string {
  const c = g.character
  if (c.countryId === 'us') return line
  if (line.includes('neighborhood baseball game')) {
    const ball = playSport(g)
    const win = /baseball|softball/.test(ball) ? 'hit a home run' : /cricket/.test(ball) ? 'hit a six' : /basketball/.test(ball) ? 'scored the winning basket' : /volleyball|takraw/.test(ball) ? 'served the winning point' : 'scored the winning goal'
    return `I ${win} at a neighborhood ${ball} game.`
  }
  if (line.includes('lemonade stand') && c.countryId !== 'ca') return `I set up a stand selling iced ${(tok.softDrink ?? 'tea').replace(/^iced /i, '')} and made a little pocket money.`
  if (line.includes('the mall with')) {
    const shops = locale(g).hangouts.filter((h) => /mall|market|bazaar|souk|shopping|plaza|arcade/i.test(h) && venueExists(g, h))
    return line.replace('the mall', shops.length ? t.pick(shops) : 'the market')
  }
  if (line.includes('mall-walking group')) return line.replace('mall-walking group', 'morning walking group')
  return line
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
  // The year's own flavor: what an ordinary year felt like in this decade (events/era-life.ts).
  pools.push(...eraFlavorPools(g))
  return pools
}

/** The recent-lines window lives in the shared text memory (text/memory.ts): one ring of the last 60 'pool:index' keys across all pools. */
const FLAVOR_RING = 'flavor'
const FLAVOR_RING_CAP = 60
/**
 * A second ring of the same size remembers the words of the lines, not their pool and index (R3-Q13): the 2000s packs began as copies of
 * the 1980s ones, so one sentence sits in two pools under two keys, and a life that crosses the year of the change would hear it twice.
 * A key is 't' and 8 hex digits of the sentence as it reads without its era gate.
 */
const FLAVOR_TEXT_RING = 'flavorText'

function textKey(line: string): string {
  return 't' + mix32(fnv1a(eraStrip(line))).toString(16).padStart(8, '0')
}

function recentKeys(g: GameState): string[] {
  const ring = ringRead(g, FLAVOR_RING)
  if (ring) return ring
  // A save from v4.0.2 kept the same window in flags.flavorRecent. It is read once here and dropped when the year's lines are written.
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

/** Log one-time toddler milestones (first word, first steps...). Returns how many were logged. `t` is the text stream, for the words. */
function logMilestones(g: GameState, t: TextRng): number {
  const age = g.character.age
  if (age > 8 || inPrison(g)) return 0
  const done = milestonesDone(g)
  let n = 0
  for (const m of MILESTONES) {
    if (done[m.id] || age < m.minAge || age > m.maxAge) continue
    // Guaranteed on the last eligible year so every life gets them. Whether it happens this year is state (the age lands in
    // flags.milestonesLogged), so the roll reads a stream keyed by year and milestone, never the text cursor (D5a).
    if (age < m.maxAge && !(outcomeStream(g, 'flavor.milestone', g.year, m.id)() < m.chance)) continue
    done[m.id] = age
    log(g, m.line(g, t), 'good')
    n++
  }
  return n
}

/** Add 1-2 flavor lines for this year to the life log. */
export function addFlavorLines(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const t = textRng(g)
  const milestoneLines = logMilestones(g, t)
  const want = Math.max(0, (t.chance(0.4) ? 2 : 1) - milestoneLines)
  if (want === 0) return
  const pools = poolsFor(g)
  if (pools.length === 0) return
  const tok = tokens(g, t)
  const recent = recentKeys(g)
  const recentText = ringRead(g, FLAVOR_TEXT_RING) ?? []
  const used = new Set<string>()
  let added = 0
  for (let attempt = 0; attempt < 12 && added < want; attempt++) {
    const pool = weightedPool(t, pools.filter((p) => !used.has(p.key) || pools.length === 1))
    if (!pool) break
    const options = t
      .shuffle(pool.lines.map((line, i) => ({ line, key: `${pool.key}:${i}` })))
      .filter((o) => !recent.includes(o.key) && !recentText.includes(textKey(o.line)))
    let chosen: { text: string; key: string; said: string } | null = null
    for (const o of options) {
      if (!eraOk(g, o.line)) continue
      const filled = fill(eraStrip(o.line), tok)
      const text = filled ? localizeLine(g, filled, t, tok) : null
      if (text && anachronistic(g, text)) continue
      if (text) {
        chosen = { text, key: o.key, said: textKey(o.line) }
        break
      }
    }
    used.add(pool.key)
    if (!chosen) continue
    log(g, chosen.text, pool.tone ?? 'neutral', textLineId(g))
    recent.push(chosen.key)
    recentText.push(chosen.said)
    added++
  }
  ringWrite(g, FLAVOR_RING, recent, FLAVOR_RING_CAP)
  ringWrite(g, FLAVOR_TEXT_RING, recentText, FLAVOR_RING_CAP)
  delete g.flags.flavorRecent
}

function weightedPool(t: TextRng, pools: Pool[]): Pool | null {
  const total = pools.reduce((s, p) => s + p.weight, 0)
  if (total <= 0) return null
  let r = t.int(1, total)
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
