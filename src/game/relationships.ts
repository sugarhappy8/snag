// Relationships: the yearly family life cycle (aging, NPC deaths, funerals, inheritance,
// births, new siblings, grandchildren, relationship decay, partner drama, family events)
// and every interaction on the Relationships screen.
import { arrestPlayer } from './crime'
import {
  addHidden,
  addMoney,
  attractedTo,
  addPersonStat,
  addRelationship,
  addStat,
  canAfford,
  clamp,
  count,
  currentPartner,
  endJob,
  formatMoney,
  fullName,
  getPerson,
  inPrison,
  log,
  notice,
  pronouns,
  remember,
  removePerson,
  scriptChoice,
  spend,
  useYearAction,
} from './core'
import {
  announcePregnancy,
  askBirthControl,
  askOut,
  asJson,
  breakUp,
  cancelEngagement,
  cap,
  conceive,
  conceptionBlocker,
  couplesCounseling,
  datingProblem,
  divorce,
  dNum,
  dStr,
  elope,
  fertilityFactor,
  hookUpWith,
  intimacyProblem,
  isRomantic,
  labelOf,
  makeLove,
  myRel,
  npcOccupationLabel,
  partnerProposes,
  petLifespan,
  planWedding,
  pNum,
  processPregnancies,
  proposalProblem,
  proposeTo,
  rec,
  renewVows,
  sanitizeName,
  startDating,
  touch,
  tryForBaby,
  weddingProblem,
  yourRel,
} from './love'
import { createPerson, notePerson, randomOccupation } from './people'
import { chance, pick, rand, randFloat, randInt, uid, weightedPick } from './rng'
import { defineScript } from './scripts'
import { getCountry, randomFirstName, randomLastName } from './world'
import { locale, localeOf } from './data/locales'
import type { GameState, Gender, MenuAction, MenuInfo, MenuInput, MenuNode, NoticeAi, Person, RelationKind } from './types'

// ---------------------------------------------------------------------------
// Relation categories

const PARENTS: RelationKind[] = ['parent', 'stepparent']
const SIBLINGS: RelationKind[] = ['sibling', 'halfSibling', 'stepsibling']
const KIDS: RelationKind[] = ['child', 'stepchild']
const FAMILY: RelationKind[] = [...PARENTS, ...SIBLINGS, 'grandparent', ...KIDS, 'grandchild', 'spouse']
/** Dead people of these kinds stay in the list (Deceased / late exes / late pets). */
const KEEP_WHEN_DEAD: RelationKind[] = [...FAMILY, 'ex', 'exSpouse', 'pet']

function isFamily(p: Person): boolean {
  return FAMILY.includes(p.relation)
}

/** Parents who split up: divorced here (data.divorced) or born into a divorced family (life.ts sets exSpouseId). */
function splitUp(p: Person): boolean {
  return p.data.divorced === true || typeof p.data.exSpouseId === 'string'
}

/** The living stepparent married to this parent, if any. */
function stepFor(g: GameState, parent: Person): Person | undefined {
  return g.people.find((x) => x.alive && x.relation === 'stepparent' && (x.data.viaParentId === parent.id || x.data.spouseId === parent.id))
}

/** Pets the player's parents own (born into the family or bought for a kid). */
function isFamilyPet(g: GameState, p: Person): boolean {
  if (p.relation !== 'pet') return false
  if (p.data.familyPet === true || typeof p.data.boughtByParent === 'string') return true
  return p.data.petSource === undefined && g.character.age > 0 && p.yearsKnown >= g.character.age
}

function has(p: Person, ...traits: string[]): boolean {
  return p.traits.some((t) => traits.includes(t))
}

function the(p: Person): string {
  return cap(yourRel(p))
}

function pr(p: Person) {
  return pronouns(p.gender)
}

function fill(text: string, p: Person): string {
  const x = pr(p)
  return text
    .replaceAll('{name}', p.firstName)
    .replaceAll('{He}', x.He)
    .replaceAll('{he}', x.he)
    .replaceAll('{him}', x.him)
    .replaceAll('{His}', x.His)
    .replaceAll('{his}', x.his)
}

/** How receptive someone is to you right now (0-1). */
function mood(p: Person): number {
  let m = 0.3 + p.relationship / 160
  if (has(p, 'kind', 'caring', 'optimistic', 'outgoing', 'funny')) m += 0.08
  if (has(p, 'grumpy', 'arrogant', 'hot-headed', 'jealous')) m -= 0.08
  if (p.relation === 'enemy') m -= 0.25
  return clamp(m, 0.05, 0.97)
}

function money(n: number): string {
  return formatMoney(n)
}

const TIRED_LINES = [
  "You've already done that with {name} enough this year. Give it a rest.",
  '{name} needs a break from you. Try again next year.',
  "Even {name} has limits. Try again next year.",
  "Let's not overdo it with {name}. Try again next year.",
]

/** True (and shows the "enough this year" notice) when a per-person limit is already used up. */
function atLimit(g: GameState, p: Person, key: string, max: number, title: string): boolean {
  if ((g.yearActions[`rel.${key}.${p.id}`] ?? 0) < max) return false
  notice(g, title, fill(pick(g, TIRED_LINES), p), { emoji: '\u{23F3}' })
  return true
}

/** Per-year, per-person limit with a classic "give it a rest" notice. */
function limit(g: GameState, p: Person, key: string, max: number, title: string): boolean {
  if (useYearAction(g, `rel.${key}.${p.id}`, max)) return true
  notice(g, title, fill(pick(g, TIRED_LINES), p), { emoji: '\u{23F3}' })
  return false
}

function aiFacts(g: GameState, p: Person, what: string, outcome: string): NoticeAi {
  const c = g.character
  const traits = p.traits.length ? `, personality: ${p.traits.join(' and ')}` : ''
  return {
    when: 'balanced',
    personId: p.id,
    facts: `${fullName(c)} (the player, age ${c.age}) ${what} with their ${labelOf(p)} ${fullName(p)} (age ${p.age}, ${p.occupation}${traits}, relationship ${p.relationship}%). Outcome: ${outcome}`,
  }
}

// ---------------------------------------------------------------------------
// Content lists (original jokes in the classic life-sim style)

const TOPICS_KID = [
  'why the sky is blue',
  'whether monsters live under the bed',
  'how scary the toilet is when it flushes',
  'whether Santa uses a GPS',
  'why vegetables exist',
  'what dogs dream about',
  'which dinosaur would make the best pet',
  'whether the tooth fairy is running a business',
  'their favorite cartoon',
  'what clouds taste like',
]
const TOPICS = [
  'whether a hot dog is a sandwich',
  'the best pizza toppings',
  'whether pineapple belongs on pizza',
  'who would win in a fight between a shark and a gorilla',
  'whether cats are better than dogs',
  'the meaning of life',
  "whose turn it is to do the dishes",
  'which season is the best',
  'the correct way to squeeze toothpaste',
  'whether aliens have already visited Earth',
  'what they would do with a million dollars',
  'whether cereal counts as soup',
  'how pigeons are probably government drones',
  'the best way to survive a zombie apocalypse',
  'who the greatest athlete of all time is',
  'their dream vacation',
  'how fast time flies',
  'the plot of a movie neither of them remembers',
  'the weather',
  'which superhero has the most useless power',
  'how many ducks it would take to defeat a horse',
  'whether a straw has one hole or two',
  'the price of eggs these days',
  'the best reality TV show of all time',
  'whether it is acceptable to recline your seat on a plane',
  'the worst haircut they ever had',
]
const TOPICS_SPICY = ['politics', 'religion', 'who should pay for dinner', 'how to raise kids', 'money', 'whose family is more annoying']
const TOPICS_ADULT = ['mortgage rates', 'retirement plans', 'their back pain', "the neighbors' new car", 'cryptocurrency', 'the latest office drama', 'their cholesterol', 'property taxes']

const OPENERS = ['had a conversation with', 'chatted with', 'had a heart-to-heart with', 'talked with', 'had a long talk with']

const ACT_TODDLER = [
  'built a pillow fort',
  'blew bubbles in the backyard',
  'played peekaboo',
  'finger painted',
  'fed ducks at the pond',
  'stacked blocks',
  'watched cartoons',
  'played in the sandbox',
]
const ACT_KID = [
  'flew a kite',
  'went to the zoo',
  'played catch',
  'built a sandcastle',
  'went to the arcade',
  'played board games',
  'caught butterflies',
  'went to the water park',
  'baked cookies',
  'had a water gun fight',
  'went to the carnival',
  'played video games',
  'had a snowball fight',
  'went to the aquarium',
  'jumped in a pile of leaves',
]
const ACT_TEEN = [
  'went bowling',
  'went to an escape room',
  'went hiking',
  'went axe throwing',
  'played laser tag',
  'went to the beach',
  'tried a goat yoga class',
  'went to a food festival',
  'went stargazing',
  'went to a baseball game',
  'played mini golf',
  'went thrift shopping',
  'did karaoke',
  'went kayaking',
  'visited an art museum',
  'went to a trampoline park',
  'went people watching at the mall',
  'took a cooking class',
  'rode bumper cars',
  'went to an amusement park',
  'went paintballing',
]
const ACT_ADULT = [
  'went to a wine tasting',
  'went to a comedy club',
  'went to a jazz bar',
  'went antiquing',
  'played golf',
  'went to a farmers market',
  'went to a concert',
  'went whale watching',
  'went to a cooking class',
  'went white water rafting',
]
const ACT_ELDER = [
  'played bingo at the community center',
  'fed pigeons at the park',
  'did a jigsaw puzzle',
  'watched old game shows',
  'went for a slow walk around the block',
  'looked through old photo albums',
]

const INVITES_KID: [string, string][] = [
  ['go to the zoo', 'went to the zoo'],
  ['fly a kite', 'flew a kite'],
  ['bake cookies', 'baked cookies'],
  ['go to the aquarium', 'went to the aquarium'],
  ['play board games', 'played board games'],
  ['go to the water park', 'went to the water park'],
  ['feed the ducks at the pond', 'fed the ducks at the pond'],
]
const INVITES_TEEN: [string, string][] = [
  ['go to a baseball game', 'went to a baseball game'],
  ['go hiking', 'went hiking'],
  ['go bowling', 'went bowling'],
  ['try a cooking class', 'took a cooking class'],
  ['go to the farmers market', 'went to the farmers market'],
  ['go see a movie', 'saw a movie'],
  ['go fishing', 'went fishing'],
  ['visit an art museum', 'visited an art museum'],
]

const SPEND_GOOD = ['{He} had a great time!', '{He} loved it!', 'You both had a blast.', '{He} said it was the best day {he} has had in months.', 'You two laughed the whole time.']
const SPEND_MEH = ['It was fine.', "{He} spent most of it on {his} phone.", 'It was a little awkward.', '{He} seemed distracted.', "{He} said it was \"okay\", which you're choosing to take as a compliment."]

const COMPLIMENTS = [
  'a total legend',
  'a smart cookie',
  "the bee's knees",
  'a diamond in the rough',
  'an absolute gem',
  'stunning',
  'hilarious',
  'a ray of sunshine',
  'the greatest of all time',
  'a walking encyclopedia',
  'effortlessly cool',
  'a natural leader',
  'kinder than a golden retriever',
  'funnier than any comedian',
  'wise beyond their years',
  'unbelievably stylish',
  'a genius',
  'a treasure',
  'world-class',
  'one of a kind',
  'the life of the party',
  'a smooth operator',
  'a certified snack',
  'top tier',
]

const INSULTS = [
  'a soggy waffle',
  'a human participation trophy',
  'a walking typo',
  'dumber than a bag of hammers',
  'a knock-off of a knock-off',
  'as useful as a screen door on a submarine',
  'a professional disappointment',
  'a sentient wet sock',
  'a lint licker',
  'a mouth-breather',
  'a nimrod',
  'a dingbat',
  'a birdbrain',
  'a weasel',
  'a goblin',
  'a dork',
  'a nincompoop',
  'a scallywag',
  'an airhead',
  'a pumpkinhead',
  'smellier than a gym sock',
  'a buffering video in human form',
  'a snollygoster',
  'a troglodyte',
]

const PRANKS = [
  'replaced the cream in {his} cookies with toothpaste',
  'put a rubber spider in {his} shoe',
  'toilet papered {his} house',
  'signed {him} up for a llama enthusiast magazine',
  'set seven alarms on {his} phone for 4 AM',
  'swapped {his} sugar with salt',
  'hid a whoopee cushion on {his} chair',
  'mailed {him} a glitter bomb',
  'replaced all of {his} family photos with pictures of yourself',
  'jumped out of a closet dressed as a clown',
  'wrapped {his} car in plastic wrap',
  'covered {his} desk in sticky notes',
  'put googly eyes on everything in {his} fridge',
  'posted {his} phone number online as a free puppy giveaway',
]

const RUMORS = [
  'is afraid of ducks',
  'still sleeps with a night-light',
  'once ate an entire stick of butter on a dare',
  'has a secret collection of porcelain dolls',
  'was raised by a family of raccoons',
  'cries at car commercials',
  'thinks the moon landing was filmed in a parking garage',
  'is secretly a foreign spy',
  'has never washed {his} bedsheets',
  'talks to {his} houseplants and they talk back',
  'got lost in a revolving door for an hour',
  'is related to a famous cartoon character',
]

const MOVIES = [
  'Fast & Furious 23: Parking Lot',
  'Toy Tale 7',
  'The Avocados: Endgame Again',
  'Sharkicane',
  'A Very Long Musical',
  'Haunted Spreadsheet',
  'The Notebook 2: The Laptop',
  'Kung Fu Hamster',
  'Space Lawyers',
  'Grandma Goes Rogue',
  'Explosion Man IV',
  'The Quiet Penguin',
]

const BANDS = ['The Velvet Tadpoles', 'Mumble Rap Grandpas', 'Neon Lobster', 'Taylor Quick', 'The Screaming Toasters', 'DJ Sandwich', 'Kanye East', 'The Polite Punks', 'Lil Spreadsheet', 'Coldbrew']

const CHANNELS = [
  'a guy who reviews gas station sushi',
  'a cat that plays the piano',
  'speedrunners breaking a game in 4 minutes',
  'oddly satisfying soap cutting',
  "someone playing a life simulator and ruining every life they touch",
  'a grandma who reacts to rap music',
  'a guy who builds swimming pools in the jungle',
  'prank compilations',
  'conspiracy theories about birds',
  'a guy who buys every item in a store',
]

const PARTIES_TEEN = ['a pizza party', 'a sleepover party', 'a pool party', 'a birthday bash', 'a costume party', 'a video game tournament party', 'a bonfire party']
const PARTIES_ADULT = ['a toga party', 'a tailgate party', 'a rooftop party', 'a masquerade ball', 'a karaoke party', 'a backyard barbecue', 'a murder mystery dinner party']

const DATE_VENUES_TEEN = ['shared a milkshake at the diner', 'went to the mall food court', 'went ice skating', 'watched the sunset from the park', 'went to a carnival and won a giant stuffed banana']
const DATE_VENUES_ADULT = [
  { text: 'went to a fancy Italian restaurant', cost: 180 },
  { text: 'had a candlelit picnic in the park', cost: 60 },
  { text: 'took a sunset dinner cruise', cost: 260 },
  { text: 'went to a cozy wine bar', cost: 90 },
  { text: 'took a pottery class together', cost: 120 },
  { text: 'went dancing downtown', cost: 80 },
  { text: 'had a five-course tasting menu', cost: 400 },
]

const VACATIONS = [
  { place: 'Paris', cost: 4500 },
  { place: 'Tokyo', cost: 6000 },
  { place: 'Cancún', cost: 2800 },
  { place: 'Rome', cost: 4200 },
  { place: 'Hawaii', cost: 5000 },
  { place: 'a ski lodge in the Alps', cost: 5500 },
  { place: 'a beach cabin', cost: 1500 },
  { place: 'a national park road trip', cost: 1200 },
  { place: 'Bali', cost: 4800 },
  { place: 'an all-inclusive cruise', cost: 3500 },
]

// ---------------------------------------------------------------------------
// Local flavor for time together: no snowball fights in the tropics, a cricket match in
// Mumbai instead of a baseball game, a café instead of a wine bar where most people don't drink.

/** Watching the big local sport: "a baseball game" in the US, "a football match" in Lagos. */
function localGame(g: GameState): string {
  if (g.character.countryId === 'us') return 'a baseball game'
  const sport = locale(g).sports.find((x) => !/running|athletics|track|swimming|skiing|surfing|cycling|sailing|biking/i.test(x)) ?? 'football'
  const word = /football|soccer|cricket|rugby|hockey|hurling|handball|polo|futsal|netball|kabaddi/i.test(sport) ? 'match' : /boxing|wrestling|sumo|muay|lucha|judo|taekwondo|silat/i.test(sport) ? 'bout' : 'game'
  return `a ${sport} ${word}`
}

function noDrinking(g: GameState): boolean {
  const r = getCountry(g.character.countryId).religions
  return r.filter((x) => x === 'Islam').length * 2 > r.length
}

/** A grown-up date spot or hangout, or a kid-safe one for teens. */
function localSpot(g: GameState, kind: 'dateSpots' | 'hangouts', teen: boolean): string {
  const all = locale(g)[kind]
  const ok = teen || noDrinking(g) ? all.filter((x) => !/\b(?:bars?|pubs?|club|wine|beer|izakaya|tavern|cantina|boteco|kneipe|kafana|brewery|cocktail|lounge|casino)\b/i.test(x)) : all
  return ok.length ? pick(g, ok) : 'the park'
}

function localize(g: GameState, line: string): string {
  if (g.character.countryId === 'us') return line
  return line
    .replace('went to a baseball game', `went to ${localGame(g)}`)
    .replace('go to a baseball game', `go to ${localGame(g)}`)
    .replace('went people watching at the mall', `went people watching at ${localSpot(g, 'hangouts', true)}`)
    .replace('shared a milkshake at the diner', `shared a snack at ${localSpot(g, 'dateSpots', true)}`)
    .replace('went to the mall food court', `went to ${localSpot(g, 'hangouts', true)}`)
}

function localActs(g: GameState, list: string[]): string[] {
  const loc = locale(g)
  return list.filter((a) => {
    if (/snowball|ice skating|sledding/.test(a)) return loc.snow
    if (/pile of leaves/.test(a)) return loc.climate !== 'tropical' && loc.climate !== 'arid'
    if (/wine|jazz bar|beer/.test(a)) return !noDrinking(g)
    return true
  })
}

/** "a Diwali party", "an Eid party", "a Carnival party" (no month-long fasts). */
function holidayParty(g: GameState): string {
  const list = locale(g).holidays.filter((h) => !/Ramadan|Lent|Advent|Holy Week|Week\b|Yom Kippur|Ashura/i.test(h))
  const h = (list.length ? pick(g, list) : 'New Year').replace(/^the /i, '')
  return `${/^[AEIOU]/i.test(h) ? 'an' : 'a'} ${h} party`
}

function localParties(g: GameState, adult: boolean): string[] {
  if (g.character.countryId === 'us') return adult ? PARTIES_ADULT : PARTIES_TEEN
  const swap: Record<string, string> = {
    'a tailgate party': holidayParty(g),
    'a toga party': 'a house party',
    'a backyard barbecue': 'a garden party',
    'a pool party': localeOf(g.character.countryId).climate === 'tropical' || localeOf(g.character.countryId).climate === 'mediterranean' ? 'a pool party' : 'a picnic in the park',
  }
  return (adult ? PARTIES_ADULT : PARTIES_TEEN).map((x) => swap[x] ?? x)
}

/** Getaways for two: the classics plus the domestic spots couples here actually go to. */
function localVacations(g: GameState): typeof VACATIONS {
  if (g.character.countryId === 'us') return VACATIONS
  const home = locale(g).getaways.filter((x) => x !== g.character.city).slice(0, 5).map((place) => ({ place, cost: 900 }))
  const abroad = VACATIONS.filter((v) => !/Hawaii/.test(v.place))
  return [...home, ...abroad]
}

const SQUABBLES = ['who gets the front seat', 'the TV remote', 'whose turn it is to feed the dog', 'who Mom loves more', 'the last slice of pizza', 'who broke the lamp', 'who used all the hot water']

const STORIES = ['The Very Hungry Platypus', 'Where the Mild Things Are', 'Goodnight Spoon', 'The Little Engine That Could Not Be Bothered', 'Green Eggs and Spam', 'The Cat in the Hoodie', 'Llama Llama Overdue Library Book']

// ---------------------------------------------------------------------------
// Gifts

interface Gift {
  name: string
  price: number
  appeal: number
  romantic?: boolean
  adult?: boolean
}

const KID_GIFTS: Gift[] = [
  { name: 'a hand-drawn card', price: 0, appeal: 75 },
  { name: 'a macaroni necklace', price: 0, appeal: 65 },
  { name: 'a pet rock', price: 0, appeal: 45 },
  { name: 'a friendship bracelet', price: 0, appeal: 70 },
  { name: 'a bouquet of dandelions', price: 0, appeal: 60 },
  { name: 'a lumpy clay bowl you made in art class', price: 0, appeal: 55 },
  { name: 'a coupon for one free hug', price: 0, appeal: 72 },
  { name: 'a drawing of them as a superhero', price: 0, appeal: 80 },
]
const CHEAP_GIFTS: Gift[] = [
  { name: 'a box of chocolates', price: 15, appeal: 70 },
  { name: 'a scented candle', price: 20, appeal: 55 },
  { name: 'a bouquet of tulips', price: 30, appeal: 65, romantic: true },
  { name: 'a single red rose', price: 5, appeal: 50, romantic: true },
  { name: 'a "World\'s Okayest" mug', price: 12, appeal: 45 },
  { name: 'a pair of fuzzy socks', price: 10, appeal: 55 },
  { name: 'a stress ball', price: 6, appeal: 35 },
  { name: 'a can opener', price: 8, appeal: 15 },
  { name: 'a yodeling pickle toy', price: 15, appeal: 40 },
  { name: 'a kitten calendar', price: 14, appeal: 45 },
  { name: 'a jar of mouthwash', price: 7, appeal: 5 },
  { name: 'a garden gnome', price: 35, appeal: 40 },
  { name: 'a fake desk cactus', price: 9, appeal: 20 },
  { name: 'a nose hair trimmer', price: 25, appeal: 15 },
  { name: 'a self-help book', price: 18, appeal: 30 },
]
const MID_GIFTS: Gift[] = [
  { name: 'a Bluetooth speaker', price: 80, appeal: 70 },
  { name: 'a fruit basket', price: 60, appeal: 60 },
  { name: 'a fluffy bathrobe', price: 70, appeal: 68 },
  { name: 'a bottle of fancy perfume', price: 120, appeal: 72, romantic: true },
  { name: 'a box of gourmet steaks', price: 150, appeal: 74 },
  { name: 'noise-cancelling headphones', price: 250, appeal: 82 },
  { name: 'a smart watch', price: 300, appeal: 80 },
  { name: 'a spa day voucher', price: 200, appeal: 85 },
  { name: 'a camera drone', price: 280, appeal: 70 },
  { name: 'a bottle of champagne', price: 90, appeal: 68, adult: true },
  { name: 'a bottle of aged whiskey', price: 110, appeal: 62, adult: true },
  { name: 'a framed family photo', price: 50, appeal: 72 },
  { name: 'a cooking class voucher', price: 120, appeal: 60 },
  { name: 'a video game console', price: 500, appeal: 85 },
]
const BIG_GIFTS: Gift[] = [
  { name: 'a laptop', price: 1200, appeal: 88 },
  { name: 'a designer handbag', price: 2000, appeal: 86 },
  { name: 'a high-end camera', price: 1800, appeal: 80 },
  { name: 'a weekend getaway', price: 1500, appeal: 90 },
  { name: 'diamond earrings', price: 3500, appeal: 90, romantic: true },
  { name: 'a gold watch', price: 5000, appeal: 88 },
  { name: 'an Italian leather sofa', price: 4000, appeal: 70 },
]
const LUXURY_GIFTS: Gift[] = [
  { name: 'a jet ski', price: 12000, appeal: 85 },
  { name: 'a luxury watch', price: 25000, appeal: 92 },
  { name: 'a vintage sports car', price: 90000, appeal: 96 },
]

function giftOptions(g: GameState, p: Person): Gift[] {
  const c = g.character
  // Booze gifts only for adults, and not as a default where most people don't drink.
  const hindu = (() => { const r = getCountry(c.countryId).religions; return r.filter((x) => x === 'Hinduism').length * 2 > r.length })()
  const ok = (x: Gift) => (!x.adult || (c.age >= 18 && p.age >= 21 && !noDrinking(g))) && !(hindu && /steak/.test(x.name))
  const take = (list: Gift[], n: number) => {
    const pool = list.filter(ok)
    const out: Gift[] = []
    while (out.length < n && pool.length) out.push(pool.splice(randInt(g, 0, pool.length - 1), 1)[0])
    return out
  }
  if (c.age < 13) return take(KID_GIFTS, 5)
  const opts = [...take(KID_GIFTS, c.age < 18 ? 1 : 0), ...take(CHEAP_GIFTS, 2), ...take(MID_GIFTS, 2), ...take(BIG_GIFTS, 1)]
  if (c.money >= 50_000) opts.push(...take(LUXURY_GIFTS, 1))
  else opts.push(...take(MID_GIFTS.filter((x) => !opts.includes(x)), 1))
  return opts
}

// ---------------------------------------------------------------------------
// Yearly: aging, deaths, births, life cycle, drift, drama, events, cleanup

export function yearlyRelationships(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  for (const p of g.people) {
    if (!p.alive) continue
    p.age += 1
    p.yearsKnown += 1
  }
  normalizePeople(g)
  npcDeaths(g)
  processPregnancies(g)
  familyLifeCycle(g)
  driftRelationships(g)
  partnerDrama(g)
  yearlyFamilyEvent(g)
  cleanupPeople(g)
}

/** Fill in bookkeeping for people other modules (or the AI) added without it. */
function normalizePeople(g: GameState): void {
  const c = g.character
  for (const p of g.people) {
    if (!p.alive) continue
    if (isRomantic(p) && typeof p.data.datingSince !== 'number') p.data.datingSince = Math.max(0, c.age - 1)
    if (p.relation === 'fiance' && typeof p.data.engagedAge !== 'number') p.data.engagedAge = Math.max(0, c.age - 1)
    if (p.relation === 'spouse' && typeof p.data.marriedAge !== 'number') p.data.marriedAge = Math.max(0, c.age - 1)
  }
}

interface DeathCause {
  cause: string
  text: string
  sudden: boolean
}

const OLD_AGE: DeathCause[] = [
  { cause: 'Old Age', text: 'died peacefully of old age', sudden: false },
  { cause: 'Old Age', text: 'passed away in {his} sleep from old age', sudden: false },
]
const DISEASES: (DeathCause & { minAge?: number; gender?: Gender })[] = [
  { cause: 'Heart Attack', text: 'died from a heart attack', sudden: false },
  { cause: 'Stroke', text: 'died from a stroke', sudden: false },
  { cause: 'Lung Cancer', text: 'died from lung cancer', sudden: false },
  { cause: 'Pancreatic Cancer', text: 'died from pancreatic cancer', sudden: false },
  { cause: 'Leukemia', text: 'died from leukemia', sudden: false },
  { cause: 'Pneumonia', text: 'died from pneumonia', sudden: false },
  { cause: 'Kidney Failure', text: 'died from kidney failure', sudden: false },
  { cause: 'Liver Failure', text: 'died from liver failure', sudden: false },
  { cause: "Alzheimer's Disease", text: "died from complications of Alzheimer's disease", sudden: false, minAge: 65 },
  { cause: 'Diabetes', text: 'died from complications of diabetes', sudden: false },
  { cause: 'The Flu', text: 'died from the flu', sudden: false },
  { cause: 'Colon Cancer', text: 'died from colon cancer', sudden: false },
  { cause: 'Heart Failure', text: 'died from heart failure', sudden: false, minAge: 50 },
  { cause: 'Malaria', text: 'died from malaria', sudden: false },
  { cause: 'Typhoid Fever', text: 'died from typhoid fever', sudden: false },
  { cause: 'Brain Tumor', text: 'died from a brain tumor', sudden: false },
  { cause: 'Breast Cancer', text: 'died from breast cancer', sudden: false, minAge: 35 },
  { cause: 'Prostate Cancer', text: 'died from prostate cancer', sudden: false, minAge: 55, gender: 'male' },
  { cause: 'Emphysema', text: 'died from emphysema', sudden: false, minAge: 55 },
]
const SUDDEN: DeathCause[] = [
  { cause: 'Car Accident', text: 'died in a car crash', sudden: true },
  { cause: 'Choking', text: 'choked on an olive', sudden: true },
  { cause: 'Lightning Strike', text: 'was struck by lightning on a golf course', sudden: true },
  { cause: 'Fall', text: 'fell off a ladder while cleaning the gutters', sudden: true },
  { cause: 'Bee Stings', text: 'had an allergic reaction after being attacked by a swarm of bees', sudden: true },
  { cause: 'Drowning', text: 'drowned in a rip current', sudden: true },
  { cause: 'Skydiving Accident', text: "died when {his} parachute didn't open", sudden: true },
  { cause: 'Crocodile Attack', text: 'was eaten by a crocodile on vacation', sudden: true },
  { cause: 'Food Poisoning', text: 'got food poisoning from gas station sushi', sudden: true },
  { cause: 'Bus Accident', text: 'was hit by a bus while jaywalking', sudden: true },
  { cause: 'Falling Icicle', text: 'was struck by a falling icicle', sudden: true },
  { cause: 'Stampede', text: 'was trampled by fans at a stadium', sudden: true },
  { cause: 'Electrocution', text: 'dropped a hair dryer into the bathtub', sudden: true },
  { cause: 'Hippo Attack', text: 'was charged by a hippo on safari', sudden: true },
  { cause: 'House Fire', text: 'died in a house fire', sudden: true },
  { cause: 'Spider Bite', text: 'was bitten by a venomous spider', sudden: true },
  { cause: 'Foul Ball', text: 'was hit in the head by a foul ball at a baseball game', sudden: true },
  { cause: 'Landslide', text: 'was buried in a landslide', sudden: true },
  { cause: 'Fall', text: 'fell into an abandoned well', sudden: true },
  { cause: 'Fireworks Accident', text: 'was killed in a fireworks mishap', sudden: true },
  { cause: 'Dog Attack', text: 'was mauled by a Doberman Pinscher', sudden: true },
  { cause: 'Tornado', text: 'was swept away by a tornado', sudden: true },
  { cause: 'Skiing Accident', text: 'hit a tree while skiing', sudden: true },
  { cause: 'Jellyfish Sting', text: 'was stung by a box jellyfish', sudden: true },
  { cause: 'Fall', text: 'fell down a flight of stairs', sudden: true },
  { cause: 'Bull Stampede', text: 'was trampled at the Running of the Bulls', sudden: true },
  { cause: 'Surgical Complications', text: 'died from complications after a minor surgery', sudden: true },
  { cause: 'Hoverboard Accident', text: 'was hit by a car while riding a hoverboard', sudden: true },
  { cause: 'Falling Tree', text: 'was crushed when a tree fell on the house', sudden: true },
  { cause: 'Carbon Monoxide Poisoning', text: 'left the car running in the garage', sudden: true },
  { cause: 'Bungee Jumping Accident', text: 'was killed when the bungee cord snapped', sudden: true },
  { cause: 'Earthquake', text: 'was killed in an earthquake', sudden: true },
  { cause: 'Snake Bite', text: 'was bitten by a venomous snake', sudden: true },
  { cause: 'Avalanche', text: 'was caught in an avalanche while snowboarding', sudden: true },
]

/** Freak accidents that fit where the family lives (no foul balls where nobody plays baseball). */
function suddenFits(g: GameState, d: DeathCause): boolean {
  const loc = localeOf(g.character.countryId)
  if (d.cause === 'Foul Ball') return loc.sports.some((x) => /baseball/i.test(x))
  if (d.cause === 'Falling Icicle' || d.cause === 'Avalanche' || d.cause === 'Skiing Accident') return loc.snow
  if (d.cause === 'Tornado') return ['us', 'ca', 'bd', 'ar'].includes(g.character.countryId)
  return true
}

function localSudden(g: GameState, d: DeathCause): DeathCause {
  if (g.character.countryId === 'us' || d.cause !== 'Food Poisoning') return d
  return { ...d, text: 'got food poisoning from some very questionable street-stall seafood' }
}

/** Annual chance an NPC dies, by age and health. */
export function npcMortality(age: number, health: number): number {
  let base: number
  if (age < 1) base = 0.002
  else if (age < 18) base = 0.0006
  else if (age < 40) base = 0.0012
  else if (age < 50) base = 0.0025
  else if (age < 60) base = 0.006
  else if (age < 65) base = 0.012
  else if (age < 70) base = 0.02
  else if (age < 75) base = 0.032
  else if (age < 80) base = 0.05
  else if (age < 85) base = 0.085
  else if (age < 90) base = 0.14
  else if (age < 95) base = 0.24
  else if (age < 100) base = 0.36
  else base = 0.55
  // Median NPC lifespan lands around 79 (p90 ~88), like the original's grandparents and parents.
  const mult = health < 20 ? 2.5 : health < 40 ? 1.5 : health > 80 ? 0.7 : 1
  return Math.min(0.95, base * mult)
}

function deathCause(g: GameState, p: Person): DeathCause {
  if (p.age >= 80 && chance(g, 0.5)) return pick(g, OLD_AGE)
  if (p.age >= 65 && chance(g, 0.2)) return pick(g, OLD_AGE)
  if (p.age < 40 ? chance(g, 0.7) : chance(g, 0.12)) return localSudden(g, pick(g, SUDDEN.filter((d) => suddenFits(g, d))))
  return pick(g, DISEASES.filter((d) => (!d.minAge || p.age >= d.minAge) && (!d.gender || d.gender === p.gender)))
}

const PET_DEATHS_OLD = [
  'They had a good life, but sadly passed away peacefully in the night.',
  'They lost their last fight, against old age.',
  'The years finally caught up with them.',
  'They took their last breath curled up in their favorite spot.',
]
const PET_DEATHS_SICK = ['They lost their battle with illness.', 'Their illness finally got the best of them.']

function npcDeaths(g: GameState): void {
  const c = g.character
  const deaths: { p: Person; cause: DeathCause }[] = []
  for (const p of g.people) {
    if (!p.alive) continue
    if (p.relation === 'pet') {
      petYear(g, p, deaths)
      continue
    }
    if (p.age >= 50) addPersonStat(p, 'health', -randInt(g, 0, p.age >= 75 ? 4 : 2))
    else addPersonStat(p, 'health', randInt(g, -2, 2))
    if (chance(g, npcMortality(p.age, p.stats.health))) deaths.push({ p, cause: deathCause(g, p) })
  }
  for (const d of deaths) handleDeath(g, d.p, d.cause)
  if (deaths.length && c.age < 18) checkGuardian(g)
}

function petYear(g: GameState, p: Person, deaths: { p: Person; cause: DeathCause }[]): void {
  const span = pNum(p, 'lifespan', 0) || randInt(g, ...petLifespan(p.species))
  p.data.lifespan = span
  if (p.age > span * 0.7) addPersonStat(p, 'health', -randInt(g, 3, 12))
  const sick = pStrData(p, 'sick')
  if (sick) addPersonStat(p, 'health', -randInt(g, 8, 18))
  else if (chance(g, 0.06)) {
    p.data.sick = pick(g, ['Heartworm', 'Kidney Disease', 'an Ear Infection', 'Fleas', 'Arthritis', 'Diabetes', 'a Tumor', ...(chance(g, 0.08) ? ['Rabies'] : [])])
    log(g, `${cap(myRel(p))} has been acting strange lately.`, 'event')
  }
  let odds = p.age >= span ? 0.5 : p.age >= span - 2 ? 0.15 : 0.01
  if (sick) odds += sick === 'Rabies' ? 0.6 : 0.1
  if (p.stats.health < 15) odds += 0.3
  if (chance(g, Math.min(0.95, odds))) {
    const old = p.age >= span - 2
    deaths.push({ p, cause: { cause: old ? 'Old Age' : sick ? sick.replace(/^an? /, '') : 'Natural Causes', text: old ? pick(g, PET_DEATHS_OLD) : sick ? pick(g, PET_DEATHS_SICK) : 'They died suddenly of natural causes.', sudden: false } })
  }
}

function pStrData(p: Person, key: string): string {
  const v = p.data[key]
  return typeof v === 'string' ? v : ''
}

/** Share of a dead relative's estate the player inherits. */
function inheritance(g: GameState, p: Person): number {
  if (p.money <= 0 || p.data.disowned === true) return 0
  const r = p.relationship
  let share = 0
  switch (p.relation) {
    case 'parent':
    case 'stepparent': {
      if (r < 20 && chance(g, 0.7)) return 0
      if (r < 40 && chance(g, 0.3)) return 0
      if (p.relation === 'stepparent' && chance(g, 0.5)) return 0
      const spouseAlive = !splitUp(p) && g.people.some((x) => x.alive && x.id !== p.id && x.relation === 'parent' && !splitUp(x))
      const sibs = g.people.filter((x) => x.alive && (x.relation === 'sibling' || x.relation === 'halfSibling')).length
      share = spouseAlive ? p.money * randFloat(g, 0.1, 0.3) : p.money / (sibs + 1)
      break
    }
    case 'spouse':
      share = r < 20 && chance(g, 0.6) ? 0 : p.money * randFloat(g, 0.7, 1)
      break
    case 'grandparent':
      share = chance(g, 0.35 + r / 400) ? p.money * randFloat(g, 0.05, 0.2) : 0
      break
    case 'child':
    case 'stepchild':
      share = p.age >= 18 && chance(g, 0.4) ? p.money * randFloat(g, 0.2, 0.5) : 0
      break
    case 'sibling':
    case 'halfSibling':
      share = chance(g, 0.15) ? p.money * randFloat(g, 0.1, 0.3) : 0
      break
    default:
      share = 0
  }
  share = Math.round(share)
  return share >= 100 ? share : 0
}

function deathSentence(p: Person, cause: DeathCause, who: string): string {
  if (p.relation === 'pet') return `${who}, ${p.firstName}, died at the age of ${p.age}.\n\n${cause.text}`
  const x = pr(p)
  if (cause.sudden) return `${who}, ${fullName(p)}, died at the age of ${p.age}. ${x.He} ${fill(cause.text, p)}.`
  return `${who}, ${fullName(p)}, ${fill(cause.text, p)} at the age of ${p.age}.`
}

function handleDeath(g: GameState, p: Person, cause: DeathCause): void {
  const c = g.character
  const fondness = p.relationship
  p.alive = false
  p.causeOfDeath = cause.cause
  p.data.diedAge = c.age
  p.data.diedYear = g.year
  p.livesWithPlayer = false
  delete p.pregnant
  delete p.data.babies
  const label = labelOf(p)

  if (p.relation === 'pet') {
    const familyPet = isFamilyPet(g, p) && c.age < 18
    count(g, 'petsDied')
    addStat(g, 'happiness', -randInt(g, 4, 10))
    log(g, `${familyPet ? 'Our family' : 'My'} ${label} ${p.firstName} died at age ${p.age}.`, 'bad')
    notice(g, 'Rest in Peace', deathSentence(p, cause, familyPet ? `The family ${label}` : `Your ${label}`), { emoji: '\u{1F43E}', tone: 'bad' })
    return
  }

  // Exes and estranged kids pass quietly (you find out in the list).
  if (p.relation === 'ex' || p.relation === 'exSpouse' || p.data.disowned === true) return

  const close = isFamily(p) || isRomantic(p) || p.relation === 'bestFriend' || p.relation === 'friend'
  if (!close) {
    if (['classmate', 'coworker', 'boss', 'teacher', 'lover', 'enemy', 'cellmate'].includes(p.relation)) {
      log(g, `My ${label} ${fullName(p)} died (${cause.cause.toLowerCase()}).`, 'bad')
    }
    return
  }

  const grief = Math.round(3 + fondness / 10 + (isRomantic(p) || KIDS.includes(p.relation) ? 10 : 0))
  addStat(g, 'happiness', -randInt(g, Math.max(1, grief - 3), grief + 3))
  remember(g, `My ${label} ${fullName(p)} died (${cause.cause.toLowerCase()}).`)

  // Estate
  let inherited = 0
  if (isFamily(p)) {
    inherited = inheritance(g, p)
    if (inherited > 0) {
      addMoney(g, inherited)
      count(g, 'inheritances')
      count(g, 'inheritedMoney', inherited)
    }
    if (p.relation === 'parent') {
      const other = g.people.find((x) => x.alive && x.relation === 'parent' && x.id !== p.id && !splitUp(x))
      if (other && !splitUp(p)) other.money += Math.max(0, p.money - inherited)
    }
    p.money = Math.max(0, p.money - inherited)
  }
  if (p.relation === 'partner' || p.relation === 'fiance') {
    p.data.lateLover = p.relation
    p.relation = 'ex'
  }
  if (p.relation === 'spouse') p.data.widowed = true

  let text = deathSentence(p, cause, `Your ${label}`)
  if (inherited > 0) text += `\n\nInheritance: ${money(inherited)}`
  log(g, `My ${label} ${p.firstName} died at age ${p.age} (${cause.cause.toLowerCase()}).${inherited > 0 ? ` I inherited ${money(inherited)}.` : ''}`, 'bad')

  // Funeral planning falls to you for spouses, children and your last parent.
  const lastParent = p.relation === 'parent' && !g.people.some((x) => x.alive && x.relation === 'parent')
  const planner = c.age >= 18 && !inPrison(g) && (p.relation === 'spouse' || KIDS.includes(p.relation) || lastParent)
  if (planner) {
    const costs = { burial: randInt(g, 70, 120) * 100, cremation: randInt(g, 20, 40) * 100, taxidermy: randInt(g, 30, 60) * 100 }
    const wish = chance(g, 0.4) ? weightedPick(g, RESTING_WISHES, (w) => w.weight).id : ''
    const wishText = RESTING_WISHES.find((w) => w.id === wish)?.text
    const opts = [
      ...(canAfford(g, costs.burial) ? [{ id: 'burial', label: `Traditional burial (${money(costs.burial)})`, emoji: '\u{26B0}\u{FE0F}' }] : []),
      ...(canAfford(g, costs.cremation) ? [{ id: 'cremation', label: `Cremation (${money(costs.cremation)})`, emoji: '\u{1F3FA}' }] : []),
      ...(canAfford(g, costs.taxidermy) ? [{ id: 'taxidermy', label: `Taxidermy (${money(costs.taxidermy)})`, emoji: '\u{1F98C}' }] : []),
      { id: 'science', label: 'Donate the body to science (free)', emoji: '\u{1F52C}' },
      { id: 'skip', label: 'Skip the funeral', emoji: '\u{1F6B6}' },
    ]
    const wishLine = wishText ? `\n\n${p.firstName} always said ${pr(p).he} wanted to be ${wishText}.` : ''
    scriptChoice(g, 'rel.funeral', 'Rest in Peace', `${text}${wishLine}\n\nHow would you like to lay ${pr(p).him} to rest?`, opts, {
      emoji: '\u{1FAA6}',
      data: asJson({ pid: p.id, ...costs, wish }),
      personId: p.id,
    })
    return
  }
  if (c.age >= 6 && !inPrison(g) && isFamily(p)) {
    count(g, 'funerals')
    log(g, `I attended ${myRel(p)}'s funeral.`)
  } else if (inPrison(g) && isFamily(p)) {
    log(g, `I couldn't attend ${myRel(p)}'s funeral because I was in prison.`, 'bad')
  }
  notice(g, 'Rest in Peace', text, { emoji: '\u{1FAA6}', tone: 'bad' })
}

const RESTING_WISHES: { id: string; text: string; weight: number }[] = [
  { id: 'burial', text: 'buried next to the family', weight: 5 },
  { id: 'cremation', text: 'cremated', weight: 4 },
  { id: 'science', text: 'donated to science', weight: 1 },
  { id: 'taxidermy', text: 'stuffed and displayed in the living room', weight: 0.3 },
]

/** Who leads the funeral: a priest, an imam, a monk, a rabbi, a pandit. */
function clergy(g: GameState, p: Person): string {
  const own = typeof p.data.religion === 'string' ? p.data.religion : null
  const r = getCountry(g.character.countryId).religions
  const counts: Record<string, number> = {}
  for (const x of r) counts[x] = (counts[x] ?? 0) + 1
  const faith = own ?? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'None'
  return faith === 'Islam' ? 'imam' : faith === 'Buddhism' ? 'monk' : faith === 'Judaism' ? 'rabbi' : faith === 'Hinduism' ? 'pandit' : faith === 'Christianity' ? 'priest' : 'officiant'
}

function localAshSpot(g: GameState, spot: string): string {
  if (g.character.countryId === 'us') return spot
  const feast = locale(g).holidays.find((h) => !/Ramadan|Lent|Advent|Holy Week|Week\b/i.test(h)) ?? 'New Year'
  return spot.replace('over Christmas dinner', `over ${feast.replace(/^the /, '')} dinner`).replace('the dollar store', 'the discount store')
}

const ASH_SPOTS = [
  'over a waterfall',
  'into the ocean at sunrise',
  'at their favorite fishing spot',
  'in a rose bed',
  'out of a hot air balloon over a farm',
  'at their favorite golf course',
  'across a national park',
  'over Christmas dinner (by accident)',
  'inside their favorite restaurant (the staff were not thrilled)',
  'at a busy intersection downtown',
  'at the dollar store they loved so much',
  'at a farmers\' market',
  'in a tide pool',
  'out of a helicopter',
  'along their favorite hiking trail',
  'at the local opera house',
  'at the zoo, near the penguins',
  'at a bus station (it was on the way)',
  'at city hall',
  'in a scattering garden',
]

/** Did the planner honor the deceased's wish? Returns a sentence to append (or ''). */
function honorWish(g: GameState, p: Person, choice: string, wish: string, family: Person[]): string {
  if (!wish || choice === 'skip') return ''
  if (choice === wish) {
    addHidden(g, 'karma', 3)
    for (const f of family) addRelationship(f, randInt(g, 2, 5))
    return ` It's exactly what ${p.firstName} wanted.`
  }
  for (const f of family) addRelationship(f, -randInt(g, 1, 4))
  return ` It's not what ${p.firstName} wanted, and a few relatives made sure you knew it.`
}

defineScript('rel.funeral', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p) return
  const family = g.people.filter((x) => x.alive && isFamily(x))
  const name = p.firstName
  const wish = dStr(data, 'wish')
  if (choice === 'burial' || choice === 'cremation' || choice === 'taxidermy') {
    const cost = dNum(data, choice)
    if (!spend(g, cost)) {
      count(g, 'funerals')
      log(g, `My family helped pay to cremate ${myRel(p)}.`)
      notice(g, 'Funeral', `You couldn't afford it, so ${name} was cremated with help from the rest of the family.`, { emoji: '\u{1F3FA}' })
      return
    }
    count(g, 'funerals')
    const wishNote = honorWish(g, p, choice, wish, family)
    if (choice === 'burial') {
      addHidden(g, 'karma', 2)
      for (const f of family) addRelationship(f, randInt(g, 1, 4))
      log(g, `I buried ${myRel(p)}.`)
      notice(g, 'Funeral', `You held a beautiful funeral and buried ${name} for ${money(cost)}. ${pick(g, ['Everyone shared their favorite stories.', 'Half the town showed up.', `Even the ${clergy(g, p)} cried.`, 'The eulogy got a standing ovation, which was confusing.'])}${wishNote}`, { emoji: '\u{26B0}\u{FE0F}' })
    } else if (choice === 'taxidermy') {
      if (wish !== 'taxidermy') {
        addHidden(g, 'karma', -2)
        for (const f of family) addRelationship(f, -randInt(g, 3, 8))
      }
      log(g, `I had ${myRel(p)} taxidermied.`)
      notice(g, 'Funeral', `You paid ${money(cost)} to have ${name} stuffed and mounted in the living room. ${pick(g, ['Visitors have stopped coming over.', 'The likeness is... unsettling.', `${pr(p).He} has never looked more relaxed.`, 'The dog barks at the corner of the room now.'])}${wishNote}`, { emoji: '\u{1F98C}' })
    } else {
      const spots = ASH_SPOTS.map((x) => localAshSpot(g, x))
      const picks: string[] = []
      while (picks.length < 2 && spots.length) picks.push(spots.splice(randInt(g, 0, spots.length - 1), 1)[0])
      scriptChoice(
        g,
        'rel.funeral.ashes',
        'Ashes',
        `You had ${name} cremated for ${money(cost)}.${wishNote}\n\nWhat would you like to do with the ashes?`,
        [
          { id: 'urn', label: 'Keep them in an urn', emoji: '\u{1F3FA}' },
          ...picks.map((spot, i) => ({ id: `spot${i}`, label: `Scatter them ${spot.replace(/ \(.*\)$/, '')}`, emoji: '\u{1F343}' })),
          { id: 'bury', label: 'Bury the urn at the cemetery', emoji: '\u{1FAA6}' },
          { id: 'trash', label: 'Throw them away', emoji: '\u{1F5D1}\u{FE0F}' },
        ],
        { emoji: '\u{1F3FA}', data: asJson({ pid: p.id, spots: picks }), personId: p.id },
      )
    }
  } else if (choice === 'science') {
    count(g, 'funerals')
    const wishNote = honorWish(g, p, choice, wish, family)
    log(g, `I donated ${myRel(p)}'s body to science.`)
    notice(g, 'Funeral', `You donated ${name}'s body to science. Somewhere, a medical student is very grateful.${wishNote}`, { emoji: '\u{1F52C}' })
  } else {
    addHidden(g, 'karma', -5)
    for (const f of family) addRelationship(f, -randInt(g, 4, 10))
    log(g, `I skipped ${myRel(p)}'s funeral.`, 'bad')
    notice(g, 'Funeral', `You skipped ${name}'s funeral. The rest of the family will be talking about this for years.`, { emoji: '\u{1F6B6}', tone: 'bad' })
  }
})

defineScript('rel.funeral.ashes', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p) return
  const name = p.firstName
  const spots = rec(data).spots
  const spotList = Array.isArray(spots) ? spots.filter((x): x is string => typeof x === 'string') : []
  if (choice === 'urn') {
    log(g, `I keep ${myRel(p)}'s ashes in an urn.`)
    notice(g, 'Ashes', `You put ${name}'s ashes in an urn on the mantel. ${pick(g, ['You say good morning to it every day.', 'Guests keep mistaking it for a cookie jar.', 'It is the nicest thing in the house.'])}`, { emoji: '\u{1F3FA}' })
  } else if (choice.startsWith('spot')) {
    const spot = spotList[Number(choice.slice(4))] ?? pick(g, ASH_SPOTS)
    addStat(g, 'happiness', randInt(g, 1, 3))
    log(g, `I scattered ${myRel(p)}'s ashes ${spot}.`)
    notice(g, 'Ashes', `You scattered ${name}'s ashes ${spot}. ${pick(g, ['It felt right.', 'A gust of wind blew some of them back at you.', 'You said a few words. Nobody else heard them, but that was the point.'])}`, { emoji: '\u{1F343}' })
  } else if (choice === 'bury') {
    log(g, `I buried ${myRel(p)}'s urn at the cemetery.`)
    notice(g, 'Ashes', `You buried ${name}'s urn in a quiet corner of the cemetery. Now you have somewhere to visit.`, { emoji: '\u{1FAA6}' })
  } else {
    addHidden(g, 'karma', -8)
    for (const f of g.people.filter((x) => x.alive && isFamily(x))) addRelationship(f, -randInt(g, 8, 15))
    log(g, `I threw ${myRel(p)}'s ashes in the trash.`, 'bad')
    notice(g, 'Ashes', `You threw ${name}'s ashes in the trash. The garbage truck came the next morning. The family will never forgive you.`, { emoji: '\u{1F5D1}\u{FE0F}', tone: 'bad' })
  }
})

/** A minor who lost their last parent is taken in by family (or foster care). */
function checkGuardian(g: GameState): void {
  const c = g.character
  if (c.age >= 18 || g.people.some((x) => x.alive && PARENTS.includes(x.relation))) return
  if (typeof g.flags.guardianId === 'string' && getPerson(g, g.flags.guardianId)?.alive) return
  const guardian =
    g.people.filter((x) => x.alive && x.relation === 'grandparent' && x.age < 85).sort((a, b) => b.relationship - a.relationship)[0] ??
    g.people.filter((x) => x.alive && SIBLINGS.includes(x.relation) && x.age >= 21).sort((a, b) => b.relationship - a.relationship)[0]
  if (guardian) {
    g.flags.guardianId = guardian.id
    guardian.livesWithPlayer = true
    addRelationship(guardian, 10)
    log(g, `${cap(myRel(guardian))} took me in.`)
    notice(g, 'New Home', `With no parents left, ${yourRel(guardian)} took you in. ${pick(g, ['The house smells like cookies and mothballs.', "You get your own room. It's tiny, but it's yours.", 'House rules are posted on the fridge. There are forty of them.'])}`, { emoji: '\u{1F3E0}' })
  } else {
    g.flags.fosterCare = true
    addStat(g, 'happiness', -10)
    log(g, 'I was placed in foster care.', 'bad')
    notice(g, 'Foster Care', 'With no family left to take you in, you were placed in foster care.', { emoji: '\u{1F3E0}', tone: 'bad' })
  }
}

// --- Life cycle ------------------------------------------------------------

function updateOccupation(g: GameState, p: Person): void {
  if (['classmate', 'teacher', 'coworker', 'boss', 'cellmate', 'pet'].includes(p.relation)) return
  if (p.age < 18) {
    p.occupation = npcOccupationLabel(p.age)
    return
  }
  const schoolish = /School Student|Student$|Baby|Toddler|Preschooler|^None$/.test(p.occupation)
  if (p.age === 18 || (schoolish && p.occupation !== 'University Student')) {
    p.occupation = chance(g, 0.55) ? 'University Student' : randomOccupation(g, Math.max(23, p.age))
    return
  }
  if (p.occupation === 'University Student' && (p.age >= 22 || chance(g, 0.1))) {
    p.occupation = randomOccupation(g, Math.max(23, p.age))
    if (p.occupation === 'University Student') p.occupation = 'Unemployed'
    return
  }
  if (p.occupation === 'Unemployed' && p.age < 65 && chance(g, 0.25)) p.occupation = randomOccupation(g, Math.max(23, p.age))
  if (p.occupation !== 'Retired' && p.age >= 65 && (p.age >= 70 || chance(g, 0.25))) p.occupation = 'Retired'
  // Earnings / spending
  if (p.occupation === 'Retired') p.money = Math.max(0, Math.round(p.money * 0.98))
  else if (p.occupation !== 'Unemployed' && p.occupation !== 'University Student') p.money += randInt(g, 500, 4000)
}

function familyLifeCycle(g: GameState): void {
  const c = g.character
  for (const p of [...g.people]) {
    if (!p.alive || p.relation === 'pet') continue
    updateOccupation(g, p)
    const kin = KIDS.includes(p.relation) || SIBLINGS.includes(p.relation)
    // Moving out
    if (kin && p.livesWithPlayer && p.age >= 18 && (p.age >= 22 || chance(g, 0.6))) {
      p.livesWithPlayer = false
      p.data.movedOut = true
      if (KIDS.includes(p.relation)) {
        log(g, `${cap(myRel(p))} moved out.`)
        addStat(g, 'happiness', randInt(g, -3, 2))
      }
    }
    // NPC marriages (kids, siblings, grandkids)
    if ((kin || p.relation === 'grandchild') && p.age >= 20 && p.age <= 55 && p.data.married !== true && chance(g, 0.06)) {
      const spouseGender: Gender = chance(g, 0.92) ? (p.gender === 'male' ? 'female' : 'male') : p.gender
      const spouseName = `${randomFirstName(g, c.countryId, spouseGender)} ${randomLastName(g, c.countryId)}`
      p.data.married = true
      p.data.spouseName = spouseName
      log(g, `${cap(myRel(p))} married ${spouseName}.`, 'event')
      notePerson(p, `Married ${spouseName} at age ${p.age}.`)
    }
    // NPC babies
    if (p.data.married === true && p.age <= 44 && pNum(p, 'kids') < 4 && chance(g, 0.08)) {
      p.data.kids = pNum(p, 'kids') + 1
      const gender: Gender = chance(g, 0.5) ? 'male' : 'female'
      const babyName = randomFirstName(g, c.countryId, gender)
      if (KIDS.includes(p.relation)) {
        const spouseLast = pStrData(p, 'spouseName').split(' ').slice(1).join(' ')
        const surname = p.gender === 'male' ? p.lastName : spouseLast || p.lastName
        const gk = createPerson(g, {
          relation: 'grandchild',
          age: 0,
          gender,
          firstName: babyName,
          lastName: surname,
          occupation: 'Baby',
          money: 0,
          relationship: randInt(g, 55, 85),
          data: { parentId: p.id, lastInteractionAge: c.age },
        })
        count(g, 'grandchildren')
        log(g, `${cap(myRel(p))} had a baby ${gender === 'male' ? 'boy' : 'girl'} named ${gk.firstName}.`, 'good')
        if (!g.flags.hadGrandchild) {
          g.flags.hadGrandchild = true
          addStat(g, 'happiness', randInt(g, 6, 12))
          remember(g, `Became a grandparent (${fullName(gk)}).`)
          notice(g, "You're a Grandparent!", `${the(p)} had a baby ${gender === 'male' ? 'boy' : 'girl'} named ${gk.firstName}! \u{1F476}`, { emoji: '\u{1F476}', tone: 'good' })
        }
      } else if (SIBLINGS.includes(p.relation)) {
        const auntie = c.gender === 'male' ? 'an uncle' : 'an aunt'
        log(g, `${cap(myRel(p))} had a baby ${gender === 'male' ? 'boy' : 'girl'} named ${babyName}. I'm ${auntie} to a new ${gender === 'male' ? 'nephew' : 'niece'}!`, 'good')
      }
    }
  }
  newSiblings(g)
  parentsSplit(g)
  parentRemarries(g)
}

function newSiblings(g: GameState): void {
  const c = g.character
  if (c.age >= 18) return
  const mother = g.people.find((p) => p.alive && p.relation === 'parent' && p.gender === 'female')
  if (!mother || mother.age > 42 || mother.age < 18) return
  const father = splitUp(mother) ? undefined : g.people.find((p) => p.alive && p.relation === 'parent' && p.gender === 'male' && !splitUp(p))
  const stepDad = stepFor(g, mother)
  const step = stepDad && stepDad.gender === 'male' ? stepDad : undefined
  if (!father && !step) return
  const sibs = g.people.filter((p) => p.alive && SIBLINGS.includes(p.relation)).length
  if (!chance(g, Math.max(0.01, 0.09 - sibs * 0.02))) return
  const gender: Gender = chance(g, 0.5) ? 'male' : 'female'
  const half = !father && !!step
  const used = new Set(g.people.map((p) => p.firstName))
  let name = randomFirstName(g, c.countryId, gender)
  for (let i = 0; i < 10 && (used.has(name) || name === c.firstName); i++) name = randomFirstName(g, c.countryId, gender)
  const baby = createPerson(g, {
    relation: half ? 'halfSibling' : 'sibling',
    age: 0,
    gender,
    firstName: name,
    lastName: half && step ? step.lastName : c.lastName,
    occupation: 'Baby',
    money: 0,
    relationship: randInt(g, 55, 85),
    livesWithPlayer: c.residence.status === 'parents',
    data: { lastInteractionAge: c.age, bornAge: c.age },
  })
  const word = gender === 'male' ? 'brother' : 'sister'
  log(g, `My mother gave birth to my baby ${half ? 'half-' : ''}${word}, ${baby.firstName}.`, 'good')
  addStat(g, 'happiness', randInt(g, 1, 5))
  notice(g, `Baby ${cap(word)}!`, `Your mother gave birth to a baby ${gender === 'male' ? 'boy' : 'girl'} named ${baby.firstName}. You're a big ${c.gender === 'male' ? 'brother' : 'sister'} now!`, { emoji: '\u{1F476}', tone: 'good' })
}

function parentsSplit(g: GameState): void {
  const c = g.character
  if (c.age >= 18) return
  const ps = g.people.filter((p) => p.alive && p.relation === 'parent' && !splitUp(p))
  if (ps.length !== 2 || !chance(g, 0.012)) return
  for (const p of ps) p.data.divorced = true
  ps[0].data.exSpouseId = ps[1].id
  ps[1].data.exSpouseId = ps[0].id
  delete ps[0].data.spouseId
  delete ps[1].data.spouseId
  g.flags.parentsStatus = 'divorced'
  const leaver = ps.find((p) => p.gender === 'male') ?? ps[1]
  leaver.livesWithPlayer = false
  addStat(g, 'happiness', -randInt(g, 8, 15))
  log(g, 'My parents got divorced.', 'bad')
  remember(g, 'Parents divorced.')
  notice(g, 'Divorce', `Your parents are getting a divorce. ${pick(g, ['They both say it has nothing to do with you.', 'You will have two birthday parties from now on, at least.', 'Your father moved into an apartment above a laundromat.'])}`, { emoji: '\u{1F494}', tone: 'bad' })
}

function parentRemarries(g: GameState): void {
  const c = g.character
  for (const parent of g.people.filter((p) => p.alive && p.relation === 'parent')) {
    if (parent.data.remarried === true || parent.age < 25 || parent.age > 65 || stepFor(g, parent)) continue
    const otherAlive = g.people.some((x) => x.alive && x.relation === 'parent' && x.id !== parent.id && !splitUp(x) && !splitUp(parent))
    if (otherAlive || !chance(g, 0.04)) continue
    parent.data.remarried = true
    const gender: Gender = chance(g, 0.9) ? (parent.gender === 'male' ? 'female' : 'male') : parent.gender
    const step = createPerson(g, {
      relation: 'stepparent',
      age: clamp(parent.age + randInt(g, -6, 6), 25, 90),
      gender,
      relationship: randInt(g, 30, 60),
      livesWithPlayer: parent.livesWithPlayer && c.age < 18,
      data: { viaParentId: parent.id, spouseId: parent.id },
    })
    parent.data.spouseId = step.id
    const stepWord = gender === 'male' ? 'stepfather' : 'stepmother'
    let text = `${the(parent)} got remarried to ${fullName(step)}. Meet your new ${stepWord}!`
    if (chance(g, 0.3)) {
      const n = randInt(g, 1, 2)
      const names: string[] = []
      for (let i = 0; i < n; i++) {
        const s = createPerson(g, {
          relation: 'stepsibling',
          age: clamp(c.age + randInt(g, -6, 6), 0, 60),
          lastName: step.lastName,
          relationship: randInt(g, 25, 60),
          livesWithPlayer: step.livesWithPlayer && chance(g, 0.5),
        })
        names.push(s.firstName)
      }
      text += `\n\n${pr(step).He} brought ${n === 1 ? 'a kid' : 'two kids'} along: ${names.join(' and ')}.`
    }
    log(g, `${cap(myRel(parent))} married ${fullName(step)}.`, 'event')
    notice(g, 'Wedding Bells', text, { emoji: '\u{1F492}' })
  }
}

// --- Drift -----------------------------------------------------------------

const DRIFT: Partial<Record<RelationKind, [number, number]>> = {
  parent: [1, 4],
  stepparent: [2, 5],
  grandparent: [1, 4],
  sibling: [2, 5],
  halfSibling: [2, 5],
  stepsibling: [2, 6],
  child: [1, 4],
  stepchild: [2, 5],
  grandchild: [1, 4],
  partner: [3, 7],
  fiance: [2, 6],
  spouse: [2, 6],
  friend: [3, 7],
  bestFriend: [2, 5],
  classmate: [2, 5],
  teacher: [1, 4],
  coworker: [2, 5],
  boss: [1, 4],
  ex: [2, 5],
  exSpouse: [2, 5],
  lover: [3, 7],
  cellmate: [2, 5],
  pet: [1, 4],
}

function driftRelationships(g: GameState): void {
  const c = g.character
  const prison = inPrison(g)
  for (const p of g.people) {
    if (!p.alive || p.data.disowned === true) continue
    if (p.relation === 'enemy') {
      addRelationship(p, randInt(g, 0, 3))
      continue
    }
    if (pNum(p, 'bornAge', -1) === c.age) continue
    const [lo, hi] = DRIFT[p.relation] ?? [2, 5]
    let d = randInt(g, lo, hi)
    let last = pNum(p, 'lastInteractionAge', -100)
    // A previous generation's interactions don't count for the heir.
    if (last > c.age) last = -100
    if (last >= c.age - 1) d *= 0.35
    else if (c.age - last > 3 && p.yearsKnown > 3) d *= 1.4
    if (p.livesWithPlayer) d *= 0.7
    if (c.age < 6 && (PARENTS.includes(p.relation) || p.relation === 'grandparent')) d *= 0.3
    if (prison && p.relation !== 'cellmate') d *= 1.5
    addRelationship(p, -Math.round(d))
  }
}

// --- Partner drama ---------------------------------------------------------

const CHEAT_WITH = ['a coworker', 'their personal trainer', 'your neighbor', 'their ex', 'a barista', 'someone from the gym', 'a dentist', 'their yoga instructor']

/** True (and stamped) when this person hasn't been in this kind of drama for `years` years. */
function dramaReady(g: GameState, p: Person, key: string, years: number): boolean {
  const raw = p.data[`drama.${key}`]
  const last = Array.isArray(raw) && raw[0] === g.generation && typeof raw[1] === 'number' ? raw[1] : null
  return last === null || last > g.character.age || g.character.age - last >= years
}

function stampDrama(g: GameState, p: Person, key: string): void {
  p.data[`drama.${key}`] = [g.generation, g.character.age]
}

function partnerDrama(g: GameState): void {
  const c = g.character
  const p = currentPartner(g)
  if (!p) return
  const r = p.relationship
  let leave = p.relation === 'spouse' ? (r < 15 ? 0.35 : r < 30 ? 0.12 : r < 45 ? 0.03 : 0.004) : r < 15 ? 0.5 : r < 30 ? 0.25 : r < 45 ? 0.08 : 0.02
  if (c.age < 18 && p.relation === 'partner') leave += 0.12
  if (inPrison(g)) leave += p.relation === 'spouse' ? 0.08 : 0.25
  if (chance(g, leave)) {
    if (p.relation === 'spouse') divorce(g, p, 'them')
    else breakUp(g, p, 'them', inPrison(g) ? "didn't want to wait for you to get out of prison" : undefined)
    return
  }
  if (c.age < 18 || p.age < 18) return
  const cheat = 0.012 + (r < 40 ? 0.05 : 0) + (has(p, 'flirty', 'manipulative', 'sneaky') ? 0.03 : 0) - (has(p, 'loyal', 'honest') ? 0.01 : 0)
  if (dramaReady(g, p, 'cheat', 6) && chance(g, cheat)) {
    stampDrama(g, p, 'cheat')
    const gender: Gender = chance(g, 0.85) ? (p.gender === 'male' ? 'female' : 'male') : p.gender
    const name = randomFirstName(g, c.countryId, gender)
    count(g, 'cheatedOn')
    scriptChoice(
      g,
      'rel.partner.cheated',
      'Cheater!',
      `You caught ${yourRel(p)} cheating on you with ${pick(g, CHEAT_WITH).replace('their', pr(p).his)} named ${name}!`,
      [
        { id: 'forgive', label: 'Forgive them', emoji: '\u{1F54A}\u{FE0F}' },
        { id: 'yell', label: 'Yell at them', emoji: '\u{1F620}' },
        { id: 'leave', label: p.relation === 'spouse' ? 'Divorce them' : 'Break up with them', emoji: '\u{1F494}' },
      ],
      { emoji: '\u{1F494}', data: asJson({ pid: p.id, name }), personId: p.id },
    )
    return
  }
  const years = c.age - pNum(p, 'datingSince', c.age)
  if (p.relation === 'partner' && years >= 2 && r >= 70 && c.age >= 18 && chance(g, 0.12)) {
    partnerProposes(g, p)
    return
  }
  if (p.relation === 'fiance' && c.age - pNum(p, 'engagedAge', c.age) >= 3 && dramaReady(g, p, 'pressure', 2) && chance(g, 0.35)) {
    stampDrama(g, p, 'pressure')
    scriptChoice(
      g,
      'rel.fiance.pressure',
      'Wedding Plans',
      `${p.firstName} is tired of waiting. "We've been engaged for ${c.age - pNum(p, 'engagedAge', c.age)} years. When are we getting married?"`,
      [
        { id: 'plan', label: 'Plan the wedding', emoji: '\u{1F492}' },
        { id: 'wait', label: 'Ask for more time', emoji: '\u{23F3}' },
        { id: 'cancel', label: 'Call off the engagement', emoji: '\u{1F494}' },
      ],
      { emoji: '\u{1F48D}', data: asJson({ pid: p.id }), personId: p.id },
    )
    return
  }
  if (p.relation === 'spouse' && c.money > 2000 && dramaReady(g, p, 'money', 6) && chance(g, 0.04)) {
    stampDrama(g, p, 'money')
    const amount = Math.round(Math.min(c.money * randFloat(g, 0.05, 0.15), 25_000))
    spend(g, amount)
    p.money += amount
    scriptChoice(
      g,
      'rel.spouse.money',
      'Missing Money',
      `${the(p)} took ${money(amount)} from your bank account without asking. ${pr(p).He} says it was for "${pick(g, ['a business opportunity', 'emergency shoes', 'a timeshare', 'crypto', 'a surprise (for themselves)'])}".`,
      [
        { id: 'ignore', label: 'Let it go', emoji: '\u{1F937}' },
        { id: 'demand', label: 'Demand it back', emoji: '\u{1F4B5}' },
        { id: 'argue', label: 'Argue with them', emoji: '\u{1F620}' },
        { id: 'divorce', label: 'Divorce them', emoji: '\u{1F4C4}' },
      ],
      { emoji: '\u{1F4B8}', data: asJson({ pid: p.id, amount }), personId: p.id },
    )
    return
  }
  // Surprise pregnancies for couples who live together.
  const justHadBaby = pNum(p, 'lastBirthAge', -1) === c.age || g.flags.lastBirthAge === c.age
  if ((p.relation === 'spouse' || p.livesWithPlayer) && !justHadBaby && !conceptionBlocker(g, p)) {
    const onBc = c.gender === 'female' ? g.flags.birthControl === true : p.data.birthControl === true
    const kids = g.people.filter((x) => x.alive && x.relation === 'child' && x.otherParentId === p.id).length
    if (!onBc && chance(g, 0.04 * fertilityFactor(g, p) * (kids >= 3 ? 0.4 : 1))) {
      conceive(g, p, 1, 'natural')
      announcePregnancy(g, p, 1)
    }
  }
}

defineScript('rel.partner.cheated', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive || !isRomantic(p)) return
  const name = dStr(data, 'name', 'someone')
  touch(g, p)
  notePerson(p, `Cheated on the player with ${name}.`)
  if (choice === 'forgive') {
    addHidden(g, 'karma', 3)
    addRelationship(p, randInt(g, 3, 8))
    addStat(g, 'happiness', -randInt(g, 3, 7))
    log(g, `I forgave ${fullName(p)} for cheating on me.`)
    notice(g, 'Forgiven', `You forgave ${p.firstName}. ${pr(p).He} swore it will never happen again. ${pick(g, ['You want to believe it.', "You've changed your phone password anyway.", 'Fool me once...'])}`, { emoji: '\u{1F54A}\u{FE0F}' })
  } else if (choice === 'yell') {
    addRelationship(p, -randInt(g, 10, 20))
    addStat(g, 'happiness', -randInt(g, 2, 5))
    log(g, `I yelled at ${fullName(p)} for cheating on me.`, 'bad')
    notice(g, 'Cheater!', `You screamed at ${p.firstName} until the neighbors called to check on you. ${pr(p).He} slept on the couch.`, { emoji: '\u{1F620}' })
  } else {
    breakUp(g, p, 'player')
  }
})

defineScript('rel.fiance.pressure', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive || p.relation !== 'fiance') return
  touch(g, p)
  if (choice === 'plan') planWedding(g, p)
  else if (choice === 'cancel') cancelEngagement(g, p, 'player')
  else {
    addRelationship(p, -randInt(g, 8, 15))
    if (g.character.age - pNum(p, 'engagedAge', g.character.age) >= 5 && chance(g, 0.4)) breakUp(g, p, 'them', 'got tired of waiting to get married')
    else notice(g, 'Wedding Plans', `${p.firstName} agreed to wait a little longer. ${pr(p).He} is not happy about it.`, { emoji: '\u{23F3}' })
  }
})

defineScript('rel.spouse.money', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive || p.relation !== 'spouse') return
  const amount = dNum(data, 'amount')
  touch(g, p)
  if (choice === 'ignore') {
    addRelationship(p, randInt(g, 1, 3))
    notice(g, 'Missing Money', `You let it go. ${money(amount)} is a small price for peace and quiet.`, { emoji: '\u{1F937}' })
  } else if (choice === 'demand') {
    if (chance(g, 0.55) && p.money >= amount) {
      p.money -= amount
      addMoney(g, amount)
      notice(g, 'Missing Money', `${p.firstName} grumbled but paid you back ${money(amount)}.`, { emoji: '\u{1F4B5}' })
    } else {
      addRelationship(p, -randInt(g, 4, 8))
      notice(g, 'Missing Money', `${p.firstName} says the money is "already spent". It is not coming back.`, { emoji: '\u{1F4B8}' })
    }
  } else if (choice === 'argue') {
    addRelationship(p, -randInt(g, 10, 15))
    addStat(g, 'happiness', -randInt(g, 2, 5))
    notice(g, 'Missing Money', `You and ${p.firstName} had a huge fight about money. Nobody won.`, { emoji: '\u{1F620}' })
  } else {
    divorce(g, p, 'player')
  }
})

// --- Family events ---------------------------------------------------------

const MISBEHAVIOR = [
  'stuck gum in your hair while you napped',
  'drew a mural on the living room wall in permanent marker',
  'flushed your car keys down the toilet',
  'started a food fight at dinner',
  'sprayed you with the garden hose',
  'tried to give the dog a haircut',
  'taught the neighbor\'s parrot a rude word',
  'hid all the TV remotes and refuses to say where',
  'bit a kid at daycare',
  'mailed your phone to an unknown address',
]
const SIBLING_ANNOYANCES = ['stole your favorite hoodie', 'read your diary out loud', 'broke your favorite toy', 'ate your leftovers', 'told on you for something you did not do', 'hogged the bathroom for an hour']
const PET_MESS = ['chewed up your favorite shoes', 'peed on the couch', 'knocked a vase off the shelf', 'ate an entire birthday cake', 'escaped into the neighbor\'s yard', 'dug up the garden', 'threw up in your bed']

/** Years before the same automatic family/friend popup can feature the same person again. */
const REL_EVENT_COOLDOWN = 5

function yearlyFamilyEvent(g: GameState): void {
  const c = g.character
  if (inPrison(g) || !chance(g, 0.4)) return
  const alive = g.people.filter((p) => p.alive)
  const events: { w: number; key: string; run: () => void }[] = []
  const kidsHome = alive.filter((p) => KIDS.includes(p.relation) && p.age >= 3 && p.age <= 12 && p.livesWithPlayer)
  if (c.age >= 18 && kidsHome.length) {
    const k = pick(g, kidsHome)
    events.push({ key: 'rel.child.misbehave:' + k.id,
      w: 3,
      run: () =>
        scriptChoice(g, 'rel.child.misbehave', 'Misbehaving', `${the(k)} ${pick(g, MISBEHAVIOR)}. What will you do?`, [
          { id: 'yell', label: 'Yell at them', emoji: '\u{1F620}' },
          { id: 'ground', label: 'Ground them', emoji: '\u{1F6AB}' },
          { id: 'talk', label: 'Have a talk', emoji: '\u{1F5E3}\u{FE0F}' },
          { id: 'ignore', label: 'Do nothing', emoji: '\u{1F937}' },
        ], { emoji: '\u{1F608}', data: asJson({ pid: k.id }), personId: k.id }),
    })
  }
  const sibs = alive.filter((p) => SIBLINGS.includes(p.relation) && p.age >= 4 && p.age < 18)
  if (c.age >= 5 && c.age < 18 && sibs.length) {
    const s = pick(g, sibs)
    const momOrDad = alive.some((p) => PARENTS.includes(p.relation))
    events.push({ key: 'rel.sibling.fight:' + s.id,
      w: 3,
      run: () =>
        scriptChoice(g, 'rel.sibling.fight', 'Sibling Rivalry', `${the(s)} ${pick(g, SIBLING_ANNOYANCES)}. What will you do?`, [
          ...(c.age >= 6 ? [{ id: 'rumble', label: 'Rumble', emoji: '\u{1F44A}' }] : []),
          { id: 'squabble', label: 'Squabble', emoji: '\u{1F5EF}\u{FE0F}' },
          ...(momOrDad ? [{ id: 'tell', label: 'Tell on them', emoji: '\u{1F5E3}\u{FE0F}' }] : []),
          { id: 'ignore', label: 'Let it go', emoji: '\u{1F54A}\u{FE0F}' },
        ], { emoji: '\u{1F620}', data: asJson({ pid: s.id }), personId: s.id }),
    })
  }
  const ps = alive.filter((p) => PARENTS.includes(p.relation))
  if (c.age >= 6 && c.age < 18 && ps.length) {
    const par = pick(g, ps)
    const inv0 = pick(g, c.age < 12 ? INVITES_KID : INVITES_TEEN)
    const inv: [string, string] = [localize(g, inv0[0]), localize(g, inv0[1])]
    events.push({ key: 'rel.parent.invite:' + par.id,
      w: 2,
      run: () =>
        scriptChoice(g, 'rel.parent.invite', 'Family Time', `${the(par)} wants to spend time with you. ${pr(par).He} suggested you ${inv[0]} together.`, [
          { id: 'yes', label: 'Sure!', emoji: '\u{1F44D}' },
          { id: 'no', label: 'No thanks', emoji: '\u{1F44E}' },
        ], { emoji: '\u{1F46A}', data: asJson({ pid: par.id, act: inv[1] }), personId: par.id }),
    })
  }
  const newAdults = alive.filter((p) => KIDS.includes(p.relation) && p.age === 18 && p.data.tuitionAsked !== true)
  if (newAdults.length && c.money > 20_000) {
    const k = newAdults[0]
    // Where university is free, the ask is rent and living costs instead of tuition.
    const free = getCountry(c.countryId).freeUniversity
    const tuition = (free ? randInt(g, 5, 15) : randInt(g, 30, 90)) * 1000
    events.push({ key: 'rel.child.tuition:' + k.id,
      w: 5,
      run: () => {
        k.data.tuitionAsked = true
        scriptChoice(g, 'rel.child.tuition', tuitionTitle(g), free ? `${the(k)} got into university. Tuition is free, but ${pr(k).he} asked if you will cover rent and living costs (${money(tuition)}).` : `${the(k)} got into university and asked if you will pay the tuition (${money(tuition)}).`, [
          { id: 'pay', label: `Pay ${money(tuition)}`, emoji: '\u{1F393}' },
          { id: 'refuse', label: 'Refuse', emoji: '\u{1F645}' },
        ], { emoji: '\u{1F393}', data: asJson({ pid: k.id, tuition }), personId: k.id })
      },
    })
  }
  const outKids = alive.filter((p) => KIDS.includes(p.relation) && p.age >= 14 && p.age <= 30 && p.data.cameOutChecked !== true)
  if (outKids.length && chance(g, 0.3)) {
    const k = pick(g, outKids)
    k.data.cameOutChecked = true
    if (chance(g, 0.12)) {
      const identity = chance(g, 0.6) ? 'gay' : 'bisexual'
      // Remembered so the child keeps this sexuality if you continue as them.
      k.data.sexuality = identity
      events.push({ key: 'rel.child.comingOut:' + k.id,
        w: 2,
        run: () =>
          scriptChoice(g, 'rel.child.comingOut', 'Coming Out', `${the(k)} sat you down and came out to you as ${identity}.`, [
            { id: 'support', label: 'Hug them and tell them you love them', emoji: '\u{1F917}' },
            { id: 'time', label: 'Say you need some time', emoji: '\u{1F914}' },
            { id: 'reject', label: 'React badly', emoji: '\u{1F620}' },
          ], { emoji: '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}', data: asJson({ pid: k.id }), personId: k.id }),
      })
    }
  }
  const friends = alive.filter((p) => p.relation === 'friend' && p.relationship >= 70)
  if (c.age >= 6 && friends.length) {
    const f = pick(g, friends)
    events.push({ key: 'rel.friend.bff:' + f.id,
      w: 2,
      run: () =>
        scriptChoice(g, 'rel.friend.bff', 'Best Friends?', `${the(f)} asked if you want to be best friends!`, [
          { id: 'yes', label: 'Yes!', emoji: '\u{1F91D}' },
          { id: 'no', label: 'No thanks', emoji: '\u{1F645}' },
        ], { emoji: '\u{1F46F}', data: asJson({ pid: f.id }), personId: f.id }),
    })
    events.push({ key: 'rel.friend.pranked:' + f.id,
      w: 1,
      run: () =>
        scriptChoice(g, 'rel.friend.pranked', 'Pranked!', `${the(f)} pranked you! ${pr(f).He} ${pick(g, PRANKS).replaceAll('{his}', 'your').replaceAll('{him}', 'you')}.`, [
          { id: 'laugh', label: 'Laugh it off', emoji: '\u{1F602}' },
          { id: 'insult', label: 'Insult them', emoji: '\u{1F595}' },
          ...(c.age >= 8 ? [{ id: 'assault', label: 'Assault them', emoji: '\u{1F44A}' }] : []),
        ], { emoji: '\u{1F921}', data: asJson({ pid: f.id }), personId: f.id }),
    })
  }
  const gps = alive.filter((p) => p.relation === 'grandparent' && p.relationship >= 55 && p.money > 200)
  if (c.age >= 5 && c.age <= 15 && gps.length) {
    const gp = pick(g, gps)
    events.push({ key: 'rel.grandparent:' + gp.id,
      w: 1,
      run: () => {
        const amt = randInt(g, 2, 10) * 10
        gp.money -= amt
        addMoney(g, amt)
        touch(g, gp)
        log(g, `${cap(myRel(gp))} slipped me ${money(amt)}.`, 'good')
        notice(g, 'Grandparent Bonus', `${the(gp)} slipped you ${money(amt)} and said "Don't tell your parents." \u{1F4B5}`, { emoji: '\u{1F475}', tone: 'good' })
      },
    })
  }
  const partner = currentPartner(g)
  if (partner && c.age >= 13 && c.age <= 21 && ps.length && c.residence.status === 'parents') {
    const par = pick(g, ps)
    events.push({ key: 'rel.parent.disapproves:' + par.id,
      w: 2,
      run: () =>
        scriptChoice(g, 'rel.parent.disapproves', 'Disapproval', `${the(par)} doesn't approve of ${yourRel(partner)}. "${pick(g, [`I don't trust ${pr(partner).him}.`, `${pr(partner).He} has shifty eyebrows.`, 'You can do better.', `What does ${pr(partner).he} even do all day?`])}"`, [
          { id: 'defend', label: `Defend ${partner.firstName}`, emoji: '\u{1F6E1}\u{FE0F}' },
          { id: 'agree', label: `Agree with ${par.gender === 'male' ? 'Dad' : 'Mom'}`, emoji: '\u{1F64B}' },
          { id: 'ignore', label: 'Ignore it', emoji: '\u{1F937}' },
        ], { emoji: '\u{1F928}', data: asJson({ pid: par.id, partnerId: partner.id }), personId: par.id }),
    })
  }
  const pets = alive.filter((p) => p.relation === 'pet' && p.livesWithPlayer)
  if (pets.length) {
    const pet = pick(g, pets)
    events.push({ key: 'rel.pet.misbehave:' + pet.id,
      w: 2,
      run: () =>
        scriptChoice(g, 'rel.pet.misbehave', 'Bad Pet!', `${the(pet)} ${pick(g, PET_MESS)}!`, [
          { id: 'yell', label: 'Yell at them', emoji: '\u{1F620}' },
          { id: 'train', label: 'Train them', emoji: '\u{1F393}' },
          { id: 'ignore', label: 'Ignore it', emoji: '\u{1F937}' },
          { id: 'reward', label: 'Reward them', emoji: '\u{1F356}' },
        ], { emoji: '\u{1F43E}', data: asJson({ pid: pet.id }), personId: pet.id }),
    })
    const runner = pets.filter((p) => p.species !== 'Fish')
    if (runner.length && chance(g, 0.12)) {
      const r = pick(g, runner)
      events.push({ key: 'rel.pet.escape:' + r.id,
        w: 1,
        run: () =>
          scriptChoice(g, 'rel.pet.escape', 'Missing Pet', `${the(r)} escaped from home!`, [
            { id: 'search', label: 'Look everywhere', emoji: '\u{1F50E}' },
            { id: 'wait', label: 'Wait for them to come back', emoji: '\u{23F3}' },
          ], { emoji: '\u{1F43E}', data: asJson({ pid: r.id }), personId: r.id }),
      })
    }
    const wild = pets.filter((p) => p.data.exotic === true && pNum(p, 'craziness') >= 60)
    if (wild.length && chance(g, 0.4)) {
      const w = pick(g, wild)
      events.push({ key: 'rel.exotic:' + w.id, w: 2, run: () => exoticAttack(g, w) })
    }
  }
  // The same kind of popup about the same person (sibling rivalry with Hendra...) can't come
  // back for a few years, and nobody stars in family popups two years running.
  const fresh = events.filter((e) => {
    const last = g.flags[`relEventAt.${e.key}`]
    const pid = e.key.split(':')[1]
    const lastPerson = g.flags[`relEventPerson.${pid}`]
    return !(typeof last === 'number' && c.age - last < REL_EVENT_COOLDOWN && last <= c.age) && !(typeof lastPerson === 'number' && c.age - lastPerson < 2 && lastPerson <= c.age)
  })
  if (!fresh.length) return
  const ev = weightedPick(g, fresh, (e) => e.w)
  g.flags[`relEventAt.${ev.key}`] = c.age
  g.flags[`relEventPerson.${ev.key.split(':')[1]}`] = c.age
  ev.run()
}

function exoticAttack(g: GameState, pet: Person): void {
  const victims = g.people.filter((p) => p.alive && p.relation === 'pet' && p.id !== pet.id && p.data.exotic !== true)
  if (victims.length && chance(g, 0.4)) {
    const v = pick(g, victims)
    v.alive = false
    v.livesWithPlayer = false
    v.causeOfDeath = `Killed by ${pet.firstName}`
    v.data.diedAge = g.character.age
    addStat(g, 'happiness', -randInt(g, 5, 10))
    log(g, `My ${labelOf(pet)} ${pet.firstName} killed my ${labelOf(v)} ${v.firstName}.`, 'bad')
    notice(g, 'Tragedy', `You came home to find ${yourRel(pet)} had eaten ${yourRel(v)}. Nobody is surprised except you.`, { emoji: '\u{1F480}', tone: 'bad' })
    return
  }
  const dmg = randInt(g, 12, 35)
  addStat(g, 'health', -dmg)
  addRelationship(pet, -randInt(g, 3, 8))
  log(g, `My ${labelOf(pet)} ${pet.firstName} attacked me.`, 'bad')
  const partner = currentPartner(g)
  let text = `${the(pet)} attacked you out of nowhere! You needed ${randInt(g, 8, 60)} stitches.`
  if (partner && chance(g, 0.5)) {
    addRelationship(partner, -randInt(g, 6, 12))
    text += ` ${partner.firstName} wants that animal gone.`
  }
  notice(g, 'Attacked!', text, { emoji: '\u{1F43E}', tone: 'bad' })
}

defineScript('rel.child.misbehave', (g, choice, data) => {
  const k = getPerson(g, dStr(data, 'pid'))
  if (!k || !k.alive) return
  touch(g, k)
  const behavior = pNum(k, 'behavior', 50)
  if (choice === 'yell') {
    addRelationship(k, -randInt(g, 5, 10))
    k.data.behavior = clamp(behavior + randInt(g, 0, 6))
    notice(g, 'Misbehaving', `You yelled at ${k.firstName}. ${pick(g, [`${pr(k).He} cried for an hour.`, `${pr(k).He} stomped off and slammed the door.`, `${pr(k).He} yelled back. Where did ${pr(k).he} learn that?`])}`, { emoji: '\u{1F620}' })
  } else if (choice === 'ground') {
    addRelationship(k, -randInt(g, 3, 6))
    k.data.behavior = clamp(behavior + randInt(g, 3, 8))
    notice(g, 'Misbehaving', `You grounded ${k.firstName} for two weeks. No screens, no dessert, no fun.`, { emoji: '\u{1F6AB}' })
  } else if (choice === 'talk') {
    if (chance(g, 0.6)) {
      addRelationship(k, randInt(g, 2, 6))
      k.data.behavior = clamp(behavior + randInt(g, 4, 10))
      notice(g, 'Misbehaving', `You had a calm talk with ${k.firstName}. ${pr(k).He} apologized and promised to never do it again.`, { emoji: '\u{1F5E3}\u{FE0F}', tone: 'good' })
    } else {
      notice(g, 'Misbehaving', `You tried to have a talk with ${k.firstName}, but ${pr(k).he} just stared at you and said "okay boomer".`, { emoji: '\u{1F5E3}\u{FE0F}' })
    }
  } else {
    addRelationship(k, 1)
    k.data.behavior = clamp(behavior - randInt(g, 3, 8))
    notice(g, 'Misbehaving', `You let it slide. ${k.firstName} will probably do it again. Bigger.`, { emoji: '\u{1F937}' })
  }
})

defineScript('rel.sibling.fight', (g, choice, data) => {
  const s = getPerson(g, dStr(data, 'pid'))
  if (!s || !s.alive) return
  if (choice === 'rumble') startAssault(g, s)
  else if (choice === 'squabble') doSquabble(g, s)
  else if (choice === 'tell') {
    const par = g.people.find((p) => p.alive && PARENTS.includes(p.relation))
    touch(g, s)
    addRelationship(s, -randInt(g, 5, 10))
    if (par) addRelationship(par, randInt(g, 0, 2))
    notice(g, 'Sibling Rivalry', `You told ${par ? yourRel(par) : 'on them'}. ${s.firstName} got in trouble and is now plotting revenge.`, { emoji: '\u{1F5E3}\u{FE0F}' })
  } else {
    addHidden(g, 'karma', 1)
    notice(g, 'Sibling Rivalry', `You let it go. You're the bigger person (today).`, { emoji: '\u{1F54A}\u{FE0F}' })
  }
})

defineScript('rel.parent.invite', (g, choice, data) => {
  const par = getPerson(g, dStr(data, 'pid'))
  if (!par || !par.alive) return
  touch(g, par)
  if (choice === 'yes') {
    const d = randInt(g, 5, 11)
    addRelationship(par, d)
    addStat(g, 'happiness', randInt(g, 3, 7))
    log(g, `I ${dStr(data, 'act', 'spent time')} with ${myRel(par)}.`, 'good')
    notice(g, 'Family Time', `You ${dStr(data, 'act', 'spent time')} with ${yourRel(par)}. ${fill(pick(g, SPEND_GOOD), par)}`, { emoji: '\u{1F46A}', tone: 'good' })
  } else {
    addRelationship(par, -randInt(g, 3, 6))
    notice(g, 'Family Time', `You told ${par.firstName} you were busy. ${pr(par).He} looked a little hurt.`, { emoji: '\u{1F614}' })
  }
})

function tuitionTitle(g: GameState): string {
  if (g.character.countryId === 'us') return 'College Tuition'
  return getCountry(g.character.countryId).freeUniversity ? 'University Costs' : 'University Fees'
}

defineScript('rel.child.tuition', (g, choice, data) => {
  const k = getPerson(g, dStr(data, 'pid'))
  if (!k || !k.alive) return
  const tuition = dNum(data, 'tuition')
  touch(g, k)
  if (choice === 'pay' && spend(g, tuition)) {
    k.occupation = 'University Student'
    k.data.collegePaid = true
    addRelationship(k, randInt(g, 15, 25))
    log(g, `I paid ${money(tuition)} for ${myRel(k)}'s ${g.character.countryId === 'us' ? 'college tuition' : 'university costs'}.`, 'good')
    notice(g, tuitionTitle(g), `You paid ${k.firstName}'s ${getCountry(g.character.countryId).freeUniversity ? 'living costs' : 'tuition'}. ${pr(k).He} promised to study hard (and to only party a medium amount).`, { emoji: '\u{1F393}', tone: 'good' })
    return
  }
  addRelationship(k, -randInt(g, 10, 20))
  const free = getCountry(g.character.countryId).freeUniversity
  log(g, `I refused to pay for ${myRel(k)}'s ${g.character.countryId === 'us' ? 'college' : 'university'}.`, 'bad')
  notice(g, tuitionTitle(g), choice === 'pay' ? (free ? `You couldn't afford it. ${k.firstName} will be working nights at a café.` : `You couldn't afford the tuition. ${k.firstName} will be taking out student loans.`) : free ? `You told ${k.firstName} to get a part-time job like everyone else.` : `You told ${k.firstName} to take out student loans like everyone else. ${pr(k).He} will remember this.`, { emoji: '\u{1F393}' })
})

defineScript('rel.child.comingOut', (g, choice, data) => {
  const k = getPerson(g, dStr(data, 'pid'))
  if (!k || !k.alive) return
  touch(g, k)
  if (choice === 'support') {
    addRelationship(k, randInt(g, 15, 25))
    addHidden(g, 'karma', 3)
    log(g, `${cap(myRel(k))} came out to me and I told ${pr(k).him} I love ${pr(k).him}.`, 'good')
    notice(g, 'Coming Out', `You hugged ${k.firstName} and told ${pr(k).him} you love ${pr(k).him} no matter what. ${pr(k).He} cried happy tears.`, { emoji: '\u{1F917}', tone: 'good' })
  } else if (choice === 'time') {
    addRelationship(k, -randInt(g, 3, 8))
    notice(g, 'Coming Out', `You told ${k.firstName} you need some time to process. ${pr(k).He} said ${pr(k).he} understands, but looked disappointed.`, { emoji: '\u{1F914}' })
  } else {
    addRelationship(k, -randInt(g, 30, 45))
    addHidden(g, 'karma', -10)
    log(g, `${cap(myRel(k))} came out to me and I reacted badly.`, 'bad')
    notice(g, 'Coming Out', `You reacted badly. ${k.firstName} left the house in tears. This will take a long time to repair.`, { emoji: '\u{1F494}', tone: 'bad' })
  }
})

defineScript('rel.friend.bff', (g, choice, data) => {
  const f = getPerson(g, dStr(data, 'pid'))
  if (!f || !f.alive || f.relation !== 'friend') return
  touch(g, f)
  if (choice === 'yes') makeBestFriend(g, f)
  else {
    addRelationship(f, -randInt(g, 4, 8))
    notice(g, 'Best Friends?', `You turned ${f.firstName} down. ${pr(f).He} said "Cool, cool, cool" and left very quickly.`, { emoji: '\u{1F645}' })
  }
})

defineScript('rel.friend.pranked', (g, choice, data) => {
  const f = getPerson(g, dStr(data, 'pid'))
  if (!f || !f.alive) return
  touch(g, f)
  if (choice === 'laugh') {
    addRelationship(f, randInt(g, 3, 7))
    addStat(g, 'happiness', randInt(g, 1, 4))
    notice(g, 'Pranked!', `You laughed it off. ${f.firstName} respects a good sport.`, { emoji: '\u{1F602}' })
  } else if (choice === 'insult') doInsult(g, f)
  else startAssault(g, f)
})

defineScript('rel.parent.disapproves', (g, choice, data) => {
  const par = getPerson(g, dStr(data, 'pid'))
  const partner = getPerson(g, dStr(data, 'partnerId'))
  if (!par || !par.alive) return
  touch(g, par)
  if (choice === 'defend') {
    addRelationship(par, -randInt(g, 4, 9))
    if (partner) addRelationship(partner, randInt(g, 3, 7))
    notice(g, 'Disapproval', `You stood up for ${partner?.firstName ?? 'your partner'}. ${par.firstName} rolled ${pr(par).his} eyes so hard you heard it.`, { emoji: '\u{1F6E1}\u{FE0F}' })
  } else if (choice === 'agree') {
    addRelationship(par, randInt(g, 3, 7))
    if (partner) addRelationship(partner, -randInt(g, 10, 18))
    notice(g, 'Disapproval', `You agreed with ${par.firstName}. Somehow ${partner?.firstName ?? 'your partner'} found out within the hour.`, { emoji: '\u{1F64B}' })
  } else {
    notice(g, 'Disapproval', 'You nodded, said "mm-hmm", and changed nothing.', { emoji: '\u{1F937}' })
  }
})

defineScript('rel.pet.misbehave', (g, choice, data) => {
  const pet = getPerson(g, dStr(data, 'pid'))
  if (!pet || !pet.alive) return
  touch(g, pet)
  const crazy = pNum(pet, 'craziness', 30)
  if (choice === 'yell') {
    addRelationship(pet, -randInt(g, 4, 8))
    if (crazy > 70 && chance(g, 0.35)) {
      addStat(g, 'health', -randInt(g, 3, 10))
      notice(g, 'Bad Pet!', `You yelled at ${pet.firstName}. ${pr(pet).He} attacked you!`, { emoji: '\u{1F43E}', tone: 'bad' })
    } else notice(g, 'Bad Pet!', `You yelled at ${pet.firstName}. ${pr(pet).He} looked at you with sad, sad eyes.`, { emoji: '\u{1F43E}' })
  } else if (choice === 'train') {
    pet.data.craziness = clamp(crazy - randInt(g, 3, 10))
    addRelationship(pet, randInt(g, 0, 3))
    notice(g, 'Bad Pet!', `You spent a week training ${pet.firstName}. ${chance(g, 0.6) ? 'It seems to be working!' : `${pr(pet).He} learned nothing, but enjoyed the treats.`}`, { emoji: '\u{1F393}' })
  } else if (choice === 'reward') {
    pet.data.craziness = clamp(crazy + randInt(g, 3, 8))
    addRelationship(pet, randInt(g, 3, 6))
    notice(g, 'Bad Pet!', `You gave ${pet.firstName} a treat. ${pr(pet).He} has learned that crime pays.`, { emoji: '\u{1F356}' })
  } else {
    notice(g, 'Bad Pet!', `You ignored it. ${pet.firstName} is already planning the next incident.`, { emoji: '\u{1F937}' })
  }
})

defineScript('rel.pet.escape', (g, choice, data) => {
  const pet = getPerson(g, dStr(data, 'pid'))
  if (!pet || !pet.alive) return
  const roll = rand(g)
  const found = choice === 'search' ? roll < 0.6 : roll < 0.25
  const dead = choice === 'search' && !found && roll < 0.75
  if (found) {
    addRelationship(pet, randInt(g, 3, 8))
    notice(g, 'Missing Pet', choice === 'search' ? `You found ${pet.firstName} ${pick(g, ['hiding under a neighbor\'s porch', 'at the park, eating a sandwich that was not theirs', 'two streets away, living their best life'])}!` : `A kind stranger brought ${pet.firstName} home!`, { emoji: '\u{1F43E}', tone: 'good' })
  } else if (dead) {
    pet.alive = false
    pet.livesWithPlayer = false
    pet.causeOfDeath = 'Escaped From Home'
    pet.data.diedAge = g.character.age
    addStat(g, 'happiness', -randInt(g, 5, 10))
    log(g, `My ${labelOf(pet)} ${pet.firstName} died after escaping from home.`, 'bad')
    notice(g, 'Missing Pet', `You found ${pet.firstName}, but it was too late. ${pr(pet).He} died after escaping from home.`, { emoji: '\u{1F622}', tone: 'bad' })
  } else {
    removePerson(g, pet.id)
    addStat(g, 'happiness', -randInt(g, 4, 9))
    log(g, `My ${labelOf(pet)} ${pet.firstName} ran away and never came back.`, 'bad')
    notice(g, 'Missing Pet', `${pet.firstName} was never seen again. You like to think ${pr(pet).he} found a nice farm.`, { emoji: '\u{1F622}', tone: 'bad' })
  }
})

// --- Cleanup ---------------------------------------------------------------

function cleanupPeople(g: GameState): void {
  g.people = g.people.filter((p) => p.alive || KEEP_WHEN_DEAD.includes(p.relation))
  const byDeath = (a: Person, b: Person) => pNum(b, 'diedAge') - pNum(a, 'diedAge')
  const deadExes = g.people.filter((p) => !p.alive && (p.relation === 'ex' || p.relation === 'exSpouse')).sort(byDeath)
  const deadPets = g.people.filter((p) => !p.alive && p.relation === 'pet').sort(byDeath)
  const drop = new Set<string>([...deadExes.slice(10), ...deadPets.slice(12)].map((p) => p.id))
  const liveExes = g.people.filter((p) => p.alive && p.relation === 'ex' && p.data.babyParent !== true)
  if (liveExes.length > 20) {
    const sorted = [...liveExes].sort((a, b) => (a.data.fling === true ? 0 : 1) - (b.data.fling === true ? 0 : 1) || a.relationship - b.relationship)
    for (const p of sorted.slice(0, liveExes.length - 20)) drop.add(p.id)
  }
  if (drop.size) g.people = g.people.filter((p) => !drop.has(p.id))
}

// ---------------------------------------------------------------------------
// Relationships screen

export function relationshipGroups(g: GameState): { title: string; people: Person[] }[] {
  const alive = g.people.filter((p) => p.alive)
  const of = (rels: RelationKind[]) => alive.filter((p) => rels.includes(p.relation))
  const byAgeDesc = (a: Person, b: Person) => b.age - a.age
  const rank = (rels: RelationKind[]) => (a: Person, b: Person) => rels.indexOf(a.relation) - rels.indexOf(b.relation)
  const partner = of(['spouse', 'fiance', 'partner'])
  const partnerTitle = partner.some((p) => p.relation === 'spouse') ? 'Spouse' : partner.some((p) => p.relation === 'fiance') ? 'Fiancé(e)' : 'Partner'
  const byDeath = (a: Person, b: Person) => pNum(b, 'diedAge') - pNum(a, 'diedAge')
  // Late spouses and partners are listed with the exes, like the original.
  const lateRomance: RelationKind[] = ['ex', 'exSpouse', 'spouse', 'partner', 'fiance', 'lover']
  const deadExes = g.people.filter((p) => !p.alive && lateRomance.includes(p.relation)).sort(byDeath)
  const deceased = g.people.filter((p) => !p.alive && p.relation !== 'pet' && !lateRomance.includes(p.relation)).sort(byDeath)
  const deadPets = g.people.filter((p) => !p.alive && p.relation === 'pet').sort(byDeath)
  const groups: { title: string; people: Person[] }[] = [
    { title: 'Parents', people: of(PARENTS).sort(rank(['parent', 'stepparent'])) },
    { title: 'Siblings', people: of(SIBLINGS).sort(byAgeDesc) },
    { title: partnerTitle, people: partner },
    { title: 'Children', people: of(KIDS).sort(byAgeDesc) },
    { title: 'Grandchildren', people: of(['grandchild']).sort(byAgeDesc) },
    { title: 'Grandparents', people: of(['grandparent']) },
    { title: 'Friends', people: of(['bestFriend', 'friend']).sort((a, b) => rank(['bestFriend', 'friend'])(a, b) || b.relationship - a.relationship) },
    { title: 'Pets', people: of(['pet']) },
    { title: 'Classmates', people: of(['classmate']) },
    { title: 'Teachers', people: of(['teacher']) },
    { title: 'Coworkers', people: of(['boss', 'coworker']).sort(rank(['boss', 'coworker'])) },
    { title: 'Exes', people: [...of(['exSpouse', 'ex']).sort((a, b) => b.relationship - a.relationship), ...deadExes] },
    { title: 'Lovers', people: of(['lover']) },
    { title: 'Cellmates', people: of(['cellmate']) },
    { title: 'Enemies', people: of(['enemy']) },
    { title: 'Late Relatives', people: deceased },
    { title: 'Late Pets', people: deadPets },
  ]
  return groups.filter((x) => x.people.length > 0)
}

// ---------------------------------------------------------------------------
// Person interactions

interface Def {
  id: string
  label: string
  emoji: string
  subtitle?: string | ((g: GameState, p: Person) => string)
  /** Minimum player age (hidden below it). */
  minAge?: number
  /** Minimum age of the other person (hidden below it). */
  targetMinAge?: number
  /** Allowed while the player is in prison (phone calls, break-ups...). */
  prisonOk?: boolean
  show?: (g: GameState, p: Person) => boolean
  check?: (g: GameState, p: Person) => string | null
  confirm?: (g: GameState, p: Person) => string | null
  input?: MenuInput
  run: (g: GameState, p: Person, input?: string) => void
}

function build(def: Def, pid: string): MenuAction {
  const subtitle = def.subtitle
  const confirm = def.confirm
  return {
    type: 'action',
    id: def.id,
    label: def.label,
    emoji: def.emoji,
    subtitle:
      subtitle === undefined
        ? undefined
        : (g) => {
            const p = getPerson(g, pid)
            if (!p) return ''
            return typeof subtitle === 'function' ? subtitle(g, p) : subtitle
          },
    visible: (g) => {
      const p = getPerson(g, pid)
      if (!p) return false
      if (def.minAge !== undefined && g.character.age < def.minAge) return false
      if (def.targetMinAge !== undefined && p.age < def.targetMinAge) return false
      if (inPrison(g) && !def.prisonOk && p.relation !== 'cellmate') return false
      return def.show ? def.show(g, p) : true
    },
    disabledReason: (g) => {
      const p = getPerson(g, pid)
      if (!p) return 'They are no longer in your life.'
      if (!g.character.alive) return 'You are dead.'
      if (inPrison(g) && !def.prisonOk && p.relation !== 'cellmate') return "You can't do that from prison."
      return def.check ? def.check(g, p) : null
    },
    confirm: confirm
      ? (g) => {
          const p = getPerson(g, pid)
          return p ? confirm(g, p) : null
        }
      : undefined,
    input: def.input,
    run: (g, input) => {
      const p = getPerson(g, pid)
      if (!p || !g.character.alive) return
      def.run(g, p, input)
    },
  }
}

// --- Interaction implementations -------------------------------------------

function activityFor(g: GameState, p: Person): string {
  const youngest = Math.min(g.character.age, p.age)
  if (youngest < 5) return pick(g, ACT_TODDLER)
  if (youngest < 13) return localize(g, pick(g, localActs(g, ACT_KID)))
  if (p.age >= 70 && chance(g, 0.5)) return pick(g, ACT_ELDER)
  if (youngest >= 21 && chance(g, 0.35)) return localize(g, pick(g, localActs(g, ACT_ADULT)))
  return localize(g, pick(g, localActs(g, ACT_TEEN)))
}

function spendTime(g: GameState, p: Person): void {
  if (!limit(g, p, 'spendTime', 3, 'Spend Time')) return
  touch(g, p)
  count(g, 'timeSpent')
  const x = pr(p)
  if (p.relationship < 25 && chance(g, 0.5)) {
    addRelationship(p, -randInt(g, 1, 3))
    notice(g, 'Spend Time', `${the(p)} didn't want to spend time with you. "${pick(g, ['I\'m busy.', 'Maybe some other time.', 'Hard pass.', 'I have to wash my hair. All year.'])}"`, {
      emoji: '\u{1F645}',
      ai: aiFacts(g, p, 'asked to spend time', `${p.firstName} refused because they don't like the player much right now. Relationship dropped slightly.`),
    })
    return
  }
  const act = activityFor(g, p)
  if (chance(g, mood(p) + 0.1)) {
    const d = randInt(g, 5, 12)
    const h = randInt(g, 3, 7)
    addRelationship(p, d)
    addStat(g, 'happiness', h)
    log(g, `I ${act} with ${myRel(p)}.`, 'good')
    notice(g, 'Spend Time', `You ${act} with ${yourRel(p)}. ${fill(pick(g, SPEND_GOOD), p)}`, {
      emoji: '\u{1F46B}',
      tone: 'good',
      ai: aiFacts(g, p, `${act} (spent time together)`, `they had a great time. Relationship +${d}, player happiness +${h}.`),
    })
  } else {
    const d = randInt(g, -2, 2)
    addRelationship(p, d)
    log(g, `I ${act} with ${myRel(p)}.`)
    notice(g, 'Spend Time', `You ${act} with ${yourRel(p)}. ${fill(pick(g, SPEND_MEH), p)}`, {
      emoji: '\u{1F46B}',
      ai: aiFacts(g, p, `${act} (spent time together)`, `it was underwhelming and a bit awkward; ${x.he} wasn't really into it. Relationship ${d >= 0 ? '+' : ''}${d}.`),
    })
  }
}

function pickTopic(g: GameState, p: Person): { topic: string; spicy: boolean } {
  const youngest = Math.min(g.character.age, p.age)
  if (youngest < 10 && chance(g, 0.6)) return { topic: pick(g, TOPICS_KID), spicy: false }
  if (youngest >= 16 && chance(g, 0.15)) return { topic: pick(g, TOPICS_SPICY), spicy: true }
  if (youngest >= 30 && chance(g, 0.25)) return { topic: pick(g, TOPICS_ADULT), spicy: false }
  return { topic: pick(g, TOPICS), spicy: false }
}

function conversation(g: GameState, p: Person): void {
  if (!limit(g, p, 'conversation', 3, 'Conversation')) return
  touch(g, p)
  count(g, 'conversations')
  const phone = inPrison(g) && p.relation !== 'cellmate'
  if (p.relationship < 20 && chance(g, 0.4)) {
    addRelationship(p, -randInt(g, 1, 4))
    notice(g, 'Conversation', `${the(p)} walked away while you were talking. Rude.`, {
      emoji: '\u{1F6B6}',
      ai: aiFacts(g, p, 'tried to start a conversation', `${p.firstName} walked away mid-sentence because the relationship is bad. Relationship dropped slightly.`),
    })
    return
  }
  const { topic, spicy } = pickTopic(g, p)
  let disagree = 0.15 + (spicy ? 0.25 : 0) + (p.relationship < 40 ? 0.15 : 0) + (has(p, 'hot-headed', 'arrogant', 'dramatic') ? 0.08 : 0)
  if (p.age < 3) disagree = 0
  const opener = phone ? 'had a phone call from prison with' : pick(g, OPENERS)
  if (chance(g, disagree)) {
    addRelationship(p, -randInt(g, 2, 5))
    const mom = g.people.find((x) => x.alive && x.relation === 'parent' && x.gender === 'female')
    const canComplain = SIBLINGS.includes(p.relation) && g.character.age < 18 && !!mom
    scriptChoice(
      g,
      'rel.convo.argue',
      'Disagreement',
      `You ${opener} ${yourRel(p)} about ${topic}, but it turned into a heated argument.`,
      [
        { id: 'apologize', label: 'Apologize', emoji: '\u{1F64F}' },
        { id: 'agree', label: 'Agree to disagree', emoji: '\u{1F91D}' },
        { id: 'insult', label: 'Insult them', emoji: '\u{1F595}' },
        ...(!phone && g.character.age >= 6 ? [{ id: 'assault', label: 'Assault them', emoji: '\u{1F44A}' }] : []),
        ...(canComplain ? [{ id: 'complain', label: 'Complain to Mom', emoji: '\u{1F469}' }] : []),
      ],
      { emoji: '\u{1F5EF}\u{FE0F}', data: asJson({ pid: p.id, topic }), personId: p.id },
    )
    return
  }
  const d = randInt(g, 3, 8)
  const h = randInt(g, 1, 4)
  addRelationship(p, d)
  addStat(g, 'happiness', h)
  log(g, `I talked with ${myRel(p)} about ${topic}.`)
  notice(g, 'Conversation', `You ${opener} ${yourRel(p)} about ${topic}. ${fill(pick(g, ['{He} enjoyed it.', 'It was a great chat.', '{He} had a lot to say about it.', 'You both learned something.', '{He} laughed the whole time.']), p)}`, {
    emoji: '\u{1F4AC}',
    ai: aiFacts(g, p, `had a conversation${phone ? ' (by phone from prison)' : ''} about ${topic}`, `it went well; they enjoyed it. Relationship +${d}, player happiness +${h}.`),
  })
}

defineScript('rel.convo.argue', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive) return
  if (choice === 'apologize') {
    if (chance(g, 0.7)) {
      addRelationship(p, randInt(g, 1, 4))
      notice(g, 'Disagreement', `You apologized. ${p.firstName} accepted your apology.`, { emoji: '\u{1F64F}' })
    } else {
      addRelationship(p, -1)
      notice(g, 'Disagreement', `You apologized. ${p.firstName} said "whatever" and left.`, { emoji: '\u{1F64F}' })
    }
  } else if (choice === 'agree') {
    addRelationship(p, -randInt(g, 0, 3))
    notice(g, 'Disagreement', 'You agreed to disagree. Nobody won. Nobody ever wins.', { emoji: '\u{1F91D}' })
  } else if (choice === 'insult') doInsult(g, p, true)
  else if (choice === 'assault') startAssault(g, p)
  else {
    const mom = g.people.find((x) => x.alive && x.relation === 'parent' && x.gender === 'female')
    addRelationship(p, -randInt(g, 5, 10))
    if (mom) addRelationship(mom, randInt(g, 0, 2))
    notice(g, 'Disagreement', `You complained to Mom. ${p.firstName} got a lecture and you got a smug feeling.`, { emoji: '\u{1F469}' })
  }
})

function compliment(g: GameState, p: Person): void {
  if (!limit(g, p, 'compliment', 2, 'Compliment')) return
  touch(g, p)
  count(g, 'compliments')
  const x = pr(p)
  const comp = pick(g, COMPLIMENTS)
  const said = `You told ${yourRel(p)} that ${x.he} is ${comp}.`
  if (p.relation === 'boss') {
    for (const cw of g.people.filter((q) => q.alive && q.relation === 'coworker' && q.contextId === p.contextId)) addRelationship(cw, -randInt(g, 1, 3))
  }
  if (chance(g, mood(p) + 0.1)) {
    let d = randInt(g, 3, 8)
    let text = `${said} ${fill(pick(g, ['{He} blushed.', '{He} thanked you.', '{He} smiled from ear to ear.', '{He} said "I know," but appreciated it.']), p)}`
    if (chance(g, 0.15)) {
      d += randInt(g, 3, 6)
      addStat(g, 'happiness', 8)
      text += `\n\nIt's mutual! ${p.firstName} told you that you are ${pick(g, COMPLIMENTS.filter((c2) => c2 !== comp))}.`
    }
    addRelationship(p, d)
    if (p.relation === 'boss') text += '\n\nYour coworkers noticed you sucking up.'
    notice(g, 'Compliment', text, { emoji: '\u{1F60A}', tone: 'good' })
  } else if (p.relation === 'teacher' && chance(g, 0.5)) {
    addRelationship(p, -randInt(g, 1, 3))
    notice(g, 'Compliment', `${said} ${x.He} said that's an inappropriate thing to say to a teacher.`, { emoji: '\u{1F928}' })
  } else if (p.relationship < 35 && chance(g, 0.5)) {
    addRelationship(p, -randInt(g, 3, 6))
    notice(g, 'Compliment', `${said} ${x.He} told you to get lost.`, { emoji: '\u{1F612}' })
  } else {
    addRelationship(p, -randInt(g, 1, 3))
    notice(g, 'Compliment', `${said} ${x.He} ignored you.`, { emoji: '\u{1F610}' })
  }
}

function showGifts(g: GameState, p: Person): void {
  if (atLimit(g, p, 'gift', 2, 'Gift')) return
  const gifts = giftOptions(g, p)
  scriptChoice(
    g,
    'rel.gift.pick',
    'Gift',
    `What would you like to give ${yourRel(p)}? You have ${money(g.character.money)}.`,
    [...gifts.map((x, i) => ({ id: String(i), label: `${cap(x.name.replace(/^an? /, ''))} (${x.price ? money(x.price) : 'free'})`, emoji: '\u{1F381}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{1F6B6}' }],
    { emoji: '\u{1F381}', data: asJson({ pid: p.id, gifts }), personId: p.id },
  )
}

defineScript('rel.gift.pick', (g, choice, data) => {
  if (choice === 'cancel') return
  const p = getPerson(g, dStr(data, 'pid'))
  const list = rec(data).gifts
  if (!p || !p.alive || !Array.isArray(list)) return
  const gift = list[Number(choice)] as unknown as Gift | undefined
  if (!gift || typeof gift.name !== 'string') return
  giveGift(g, p, gift)
})

function giveGift(g: GameState, p: Person, gift: Gift): void {
  if (!limit(g, p, 'gift', 2, 'Gift')) return
  if (!spend(g, gift.price)) {
    notice(g, 'Gift', `You can't afford ${gift.name} (${money(gift.price)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  count(g, 'gifts')
  const x = pr(p)
  if (p.relationship < 20 && chance(g, 0.4)) {
    addRelationship(p, -randInt(g, 1, 3))
    notice(g, 'Gift', `You tried to give ${yourRel(p)} ${gift.name}. ${x.He} refused to accept it.`, { emoji: '\u{1F645}' })
    return
  }
  const romanticRel = isRomantic(p) || p.relation === 'lover'
  let appreciation = gift.appeal + randInt(g, -25, 25) + (p.relationship - 50) / 4
  if (gift.romantic) appreciation += romanticRel ? 10 : -15
  if (p.age < 13 && gift.price >= 50) appreciation += 10
  if (gift.price === 0 && (PARENTS.includes(p.relation) || p.relation === 'grandparent')) appreciation += 15
  appreciation = Math.round(clamp(appreciation))
  let d: number
  let reaction: string
  if (appreciation >= 80) [d, reaction] = [randInt(g, 8, 14), pick(g, ['{He} loved it!', '{He} said it was the best gift ever!', '{He} hugged you and nearly cried.'])]
  else if (appreciation >= 60) [d, reaction] = [randInt(g, 4, 8), pick(g, ['{He} liked it.', '{He} seemed happy with it.'])]
  else if (appreciation >= 40) [d, reaction] = [randInt(g, 1, 3), pick(g, ['{He} said thanks.', '{He} said "Oh. Neat."'])]
  else if (appreciation >= 20) [d, reaction] = [-randInt(g, 2, 5), pick(g, ['{He} faked a smile.', '{He} will be regifting it.'])]
  else [d, reaction] = [-randInt(g, 6, 12), pick(g, ['{He} hated it.', '{He} asked if this was a joke.', '{He} was insulted.'])]
  addRelationship(p, d)
  log(g, `I gave ${myRel(p)} ${gift.name}.`)
  let text = `You gave ${yourRel(p)} ${gift.name}. ${fill(reaction, p)}\n\nAppreciation: ${appreciation}%`
  const partner = currentPartner(g)
  if ((p.relation === 'ex' || p.relation === 'exSpouse') && partner && chance(g, 0.3)) {
    addRelationship(partner, -randInt(g, 6, 12))
    text += `\n\n${partner.firstName} found out you're giving gifts to your ex and is not amused.`
  }
  notice(g, 'Gift', text, { emoji: '\u{1F381}', tone: d > 0 ? 'good' : 'bad' })
}

function doInsult(g: GameState, p: Person, fromArgument = false): void {
  if (!fromArgument && !limit(g, p, 'insult', 3, 'Insult')) return
  touch(g, p)
  count(g, 'insults')
  addHidden(g, 'karma', -1)
  const x = pr(p)
  const ins = pick(g, INSULTS)
  const said = `You called ${yourRel(p)} ${ins}.`
  const hot = has(p, 'hot-headed', 'dramatic', 'arrogant') ? 0.12 : 0
  const roll = rand(g)
  if (roll < 0.1) {
    addRelationship(p, -randInt(g, 1, 3))
    notice(g, 'Insult', `${said} ${x.He} laughed it off. "Is that the best you've got?"`, { emoji: '\u{1F602}' })
  } else if (roll < 0.5 - hot) {
    addRelationship(p, -randInt(g, 8, 15))
    notice(g, 'Insult', `${said} ${fill(pick(g, ['{He} burst into tears.', '{He} looked crushed.', '{He} went quiet and walked away.']), p)}`, { emoji: '\u{1F622}' })
  } else if (roll < 0.85 || p.age < 6 || p.relation === 'pet') {
    addRelationship(p, -randInt(g, 5, 10))
    addStat(g, 'happiness', -randInt(g, 1, 4))
    notice(g, 'Insult', `${said} ${x.He} called you ${pick(g, INSULTS.filter((i) => i !== ins))} right back.`, { emoji: '\u{1F620}' })
  } else {
    addRelationship(p, -randInt(g, 10, 15))
    addStat(g, 'health', -randInt(g, 2, 8))
    count(g, 'fights')
    notice(g, 'Insult', `${said} ${x.He} ${pick(g, ['slapped you across the face!', 'shoved you into a wall!', 'threw a drink in your face!', 'punched you in the arm. Hard.'])}`, { emoji: '\u{1F44B}', tone: 'bad' })
  }
}

function argue(g: GameState, p: Person): void {
  if (!limit(g, p, 'argue', 2, 'Argue')) return
  touch(g, p)
  count(g, 'arguments')
  const { topic } = pickTopic(g, p)
  const roll = rand(g)
  if (roll < 0.35) {
    addRelationship(p, -randInt(g, 6, 12))
    addStat(g, 'happiness', randInt(g, 1, 3))
    notice(g, 'Argue', `You argued with ${yourRel(p)} about ${topic}. You won! ${p.firstName} stormed off.`, { emoji: '\u{1F3C6}' })
  } else if (roll < 0.75) {
    addRelationship(p, -randInt(g, 5, 10))
    addStat(g, 'happiness', -randInt(g, 2, 5))
    notice(g, 'Argue', `You argued with ${yourRel(p)} about ${topic}. ${p.firstName} destroyed you with facts and logic.`, { emoji: '\u{1F620}' })
  } else {
    addRelationship(p, -randInt(g, 4, 8))
    notice(g, 'Argue', `You argued with ${yourRel(p)} about ${topic} for three hours. Nobody remembers how it started.`, { emoji: '\u{1F5EF}\u{FE0F}' })
  }
}

function prank(g: GameState, p: Person): void {
  if (!limit(g, p, 'prank', 2, 'Prank')) return
  touch(g, p)
  count(g, 'pranks')
  const x = pr(p)
  const what = `You ${fill(pick(g, PRANKS), p)}.`
  const likes = 0.3 + (has(p, 'funny', 'outgoing', 'rebellious') ? 0.2 : 0) + p.relationship / 400
  const retaliate = 0.12 + (has(p, 'hot-headed', 'grumpy') ? 0.15 : 0)
  const roll = rand(g)
  if (roll < likes) {
    addRelationship(p, randInt(g, 3, 8))
    addStat(g, 'happiness', randInt(g, 2, 5))
    notice(g, 'Prank', `${what} ${x.He} thought it was hilarious!`, { emoji: '\u{1F602}', tone: 'good' })
  } else if (roll < likes + retaliate && p.age >= 6) {
    addRelationship(p, -randInt(g, 8, 15))
    addStat(g, 'health', -randInt(g, 2, 8))
    count(g, 'fights')
    notice(g, 'Prank', `${what} ${x.He} did not think it was funny and ${pick(g, ['tackled you', 'chased you around the block', 'threw a shoe at your head'])}.`, { emoji: '\u{1F620}', tone: 'bad' })
  } else {
    addRelationship(p, -randInt(g, 3, 9))
    notice(g, 'Prank', `${what} ${x.He} was ${pick(g, ['annoyed', 'not amused', 'furious', 'deeply unimpressed'])}.`, { emoji: '\u{1F612}' })
  }
}

const ATTACKS: { id: string; label: string; emoji: string; verb: string; dmg: [number, number]; noPart?: boolean }[] = [
  { id: 'punch', label: 'Punch', emoji: '\u{1F44A}', verb: 'punched', dmg: [12, 25] },
  { id: 'kick', label: 'Kick', emoji: '\u{1F9B5}', verb: 'kicked', dmg: [12, 28] },
  { id: 'slap', label: 'Slap', emoji: '\u{1F44B}', verb: 'slapped', dmg: [5, 12] },
  { id: 'bite', label: 'Bite', emoji: '\u{1F9B7}', verb: 'bit', dmg: [8, 18] },
  { id: 'headbutt', label: 'Headbutt', emoji: '\u{1F915}', verb: 'headbutted', dmg: [15, 30] },
  { id: 'wedgie', label: 'Wedgie', emoji: '\u{1FA72}', verb: 'gave {him} a wedgie', dmg: [5, 15], noPart: true },
]
const BODY_PARTS = ['nose', 'chin', 'shin', 'stomach', 'arm', 'ear', 'forehead', 'kneecap', 'elbow', 'shoulder', 'cheek', 'back', 'eyebrow', 'jaw']
const WEAPONS = ['a frying pan', 'a rolling pin', 'a TV remote', 'a shoe', 'an umbrella', 'a lamp', 'a rubber chicken', 'a baguette']

function canBrawl(g: GameState, p: Person): string | null {
  const c = g.character
  if (p.age < 4) return `${p.firstName} is just a baby. No.`
  if (SIBLINGS.includes(p.relation) && c.age >= 18 !== p.age >= 18) return "You can't rumble with a sibling on the other side of 18. That's just assault."
  if (c.age >= 18 && p.age < 14) return "You can't attack a child."
  return null
}

function startAssault(g: GameState, p: Person): void {
  const problem = canBrawl(g, p)
  if (problem) {
    notice(g, 'Assault', problem, { emoji: '\u{1F6AB}' })
    return
  }
  if (atLimit(g, p, 'assault', 2, SIBLINGS.includes(p.relation) ? 'Rumble' : 'Assault')) return
  scriptChoice(
    g,
    'rel.assault.move',
    SIBLINGS.includes(p.relation) ? 'Rumble' : 'Assault',
    `How will you attack ${yourRel(p)}?`,
    [...ATTACKS.map((a) => ({ id: a.id, label: a.label, emoji: a.emoji })), { id: 'cancel', label: 'Walk away', emoji: '\u{1F54A}\u{FE0F}' }],
    { emoji: '\u{1F44A}', data: asJson({ pid: p.id }), personId: p.id },
  )
}

defineScript('rel.assault.move', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive || choice === 'cancel') return
  const first = ATTACKS.find((a) => a.id === choice) ?? ATTACKS[0]
  performAssault(g, p, first)
})

function attackLine(g: GameState, p: Person, a: (typeof ATTACKS)[number]): { line: string; dmg: number } {
  const dmg = randInt(g, a.dmg[0], a.dmg[1])
  if (a.noPart) return { line: fill(a.verb, p), dmg }
  return { line: `${a.verb} ${pr(p).his} ${pick(g, BODY_PARTS)}`, dmg }
}

function performAssault(g: GameState, p: Person, first: (typeof ATTACKS)[number]): void {
  const c = g.character
  useYearAction(g, `rel.assault.${p.id}`, 99)
  touch(g, p)
  count(g, 'fights')
  addHidden(g, 'karma', -randInt(g, 3, 6))
  const x = pr(p)
  const hits = [attackLine(g, p, first)]
  const extra = randInt(g, 0, 2)
  for (let i = 0; i < extra; i++) hits.push(attackLine(g, p, pick(g, ATTACKS)))
  const total = clamp(hits.reduce((s, h) => s + h.dmg, 0) * (c.hidden.athleticism >= 60 ? 1.2 : 1))
  addPersonStat(p, 'health', -Math.round(total / 3))
  addRelationship(p, -randInt(g, 25, 45))
  let text = `You ${hits[0].line}!`
  if (hits.length > 1) text += ` Then you ${hits.slice(1).map((h) => h.line).join(' and ')}!`
  text += `\n\nDamage: ${Math.round(total)}%`
  const fightBack = 0.3 + (has(p, 'hot-headed', 'sporty') ? 0.2 : 0) + (p.stats.health > 70 ? 0.1 : 0) - (p.age > 70 || p.age < 10 ? 0.25 : 0)
  if (chance(g, fightBack)) {
    const hurt = randInt(g, 5, 18)
    addStat(g, 'health', -hurt)
    text += `\n\n${x.He} fought back and hit you with ${pick(g, WEAPONS)}!`
  }
  if (p.relation === 'cellmate' && c.prison) {
    const won = total >= 30
    c.prison.respect = clamp(c.prison.respect + (won ? randInt(g, 4, 10) : -randInt(g, 3, 6)))
    text += won ? '\n\nThe other inmates saw the whole thing. Your respect went up.' : '\n\nThe other inmates laughed at your weak attempt.'
  }
  log(g, `I attacked ${myRel(p)}.`, 'bad')
  notice(g, SIBLINGS.includes(p.relation) ? 'Rumble' : 'Assault', text, { emoji: '\u{1F44A}', tone: 'bad' })

  // Consequences
  if ((p.relation === 'coworker' || p.relation === 'boss') && p.contextId) {
    const which = c.job?.company === p.contextId ? 'job' : c.partTimeJob?.company === p.contextId ? 'partTimeJob' : null
    if (which && chance(g, p.relation === 'boss' ? 0.6 : 0.35)) {
      const title = c[which]?.title ?? 'job'
      endJob(g, which, 'fired')
      count(g, 'fired')
      log(g, `I was fired for fighting at work.`, 'bad')
      notice(g, 'Fired!', `You were fired from your ${title} position for assaulting ${p.firstName}.`, { emoji: '\u{1F4E6}', tone: 'bad' })
    }
  }
  if (c.age >= 14 && p.relation !== 'cellmate') {
    const odds = PARENTS.includes(p.relation) || SIBLINGS.includes(p.relation) || KIDS.includes(p.relation) || p.relation === 'grandparent' ? 0.06 : p.relation === 'teacher' ? 0.3 : p.relation === 'boss' || p.relation === 'coworker' ? 0.15 : 0.1
    if (chance(g, odds)) {
      log(g, `${fullName(p)} called the police on me.`, 'bad')
      notice(g, 'Police', `${p.firstName} called the cops on you!`, { emoji: '\u{1F6A8}', tone: 'bad' })
      arrestPlayer(g, 'Assault', total >= 60 ? 2 : 1)
    }
  }
}

function hug(g: GameState, p: Person): void {
  if (!limit(g, p, 'hug', 3, 'Hug')) return
  touch(g, p)
  const x = pr(p)
  if (p.age >= 13 && p.age < 18 && chance(g, 0.35)) {
    notice(g, 'Hug', `You tried to hug ${p.firstName}. ${x.He} squirmed away. "Ew, not in public!"`, { emoji: '\u{1F62C}' })
    return
  }
  addRelationship(p, randInt(g, 2, 6))
  addStat(g, 'happiness', randInt(g, 1, 3))
  notice(g, 'Hug', `You hugged ${yourRel(p)}. ${fill(pick(g, ['{He} hugged you back!', '{He} gave the best bear hug.', '{He} said you give great hugs.', '{He} held on for a long time.']), p)}`, { emoji: '\u{1F917}', tone: 'good' })
}

function readStory(g: GameState, p: Person): void {
  if (!limit(g, p, 'story', 2, 'Read a Story')) return
  touch(g, p)
  addRelationship(p, randInt(g, 3, 8))
  addPersonStat(p, 'smarts', randInt(g, 1, 3))
  addStat(g, 'happiness', randInt(g, 1, 4))
  notice(g, 'Read a Story', `You read "${pick(g, STORIES)}" to ${p.firstName}. ${fill(pick(g, ['{He} fell asleep halfway through.', '{He} made you read it three more times.', '{He} asked a lot of questions about the plot holes.', '{He} did all the voices with you.']), p)}`, { emoji: '\u{1F4D6}', tone: 'good' })
}

function movie(g: GameState, p: Person): void {
  if (!limit(g, p, 'movie', 2, 'Movie Theater')) return
  const c = g.character
  const cost = c.age >= 18 ? randInt(g, 26, 45) : 0
  if (!spend(g, cost)) {
    notice(g, 'Movie Theater', `You can't afford two movie tickets (${money(cost)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  const film = pick(g, MOVIES)
  if (chance(g, mood(p) + 0.1)) {
    const d = randInt(g, 4, 10)
    addRelationship(p, d)
    addStat(g, 'happiness', randInt(g, 3, 6))
    log(g, `I watched ${film} with ${myRel(p)}.`, 'good')
    notice(g, 'Movie Theater', `You saw "${film}" with ${yourRel(p)}${cost ? ` (${money(cost)})` : ''}. ${fill(pick(g, ['You both loved it.', '{He} cried at the end. So did you.', 'You shared a bucket of popcorn the size of a trash can.']), p)}`, { emoji: '\u{1F3AC}', tone: 'good' })
  } else {
    addRelationship(p, randInt(g, -1, 2))
    notice(g, 'Movie Theater', `You saw "${film}" with ${yourRel(p)}${cost ? ` (${money(cost)})` : ''}. ${fill(pick(g, ['{He} fell asleep.', 'It was terrible. You both agreed on that, at least.', '{He} talked through the whole thing.']), p)}`, { emoji: '\u{1F3AC}' })
  }
}

function vacationWith(g: GameState, p: Person): void {
  if (atLimit(g, p, 'vacation', 1, 'Vacation')) return
  const opts = [...localVacations(g)]
  const picks: typeof VACATIONS = []
  while (picks.length < 3 && opts.length) picks.push(opts.splice(randInt(g, 0, opts.length - 1), 1)[0])
  scriptChoice(
    g,
    'rel.vacation.pick',
    'Vacation',
    `Where will you take ${yourRel(p)}? You have ${money(g.character.money)}.`,
    [...picks.map((v, i) => ({ id: String(i), label: `${cap(v.place)} (${money(v.cost)})`, emoji: '\u{2708}\u{FE0F}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{1F6B6}' }],
    { emoji: '\u{1F3D6}\u{FE0F}', data: asJson({ pid: p.id, picks }), personId: p.id },
  )
}

defineScript('rel.vacation.pick', (g, choice, data) => {
  if (choice === 'cancel') return
  const p = getPerson(g, dStr(data, 'pid'))
  const list = rec(data).picks
  if (!p || !p.alive || !Array.isArray(list)) return
  const v = rec(list[Number(choice)] ?? null)
  const place = typeof v.place === 'string' ? v.place : 'somewhere nice'
  const cost = typeof v.cost === 'number' ? v.cost : 2000
  if (!limit(g, p, 'vacation', 1, 'Vacation')) return
  if (!spend(g, cost)) {
    notice(g, 'Vacation', `You can't afford a trip to ${place} (${money(cost)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  count(g, 'vacations')
  const d = randInt(g, 10, 20)
  addRelationship(p, d)
  addStat(g, 'happiness', randInt(g, 8, 15))
  addStat(g, 'health', randInt(g, 1, 4))
  log(g, `I went on vacation to ${place} with ${myRel(p)}.`, 'good')
  notice(g, 'Vacation', `You took ${yourRel(p)} to ${place} for ${money(cost)}. ${pick(g, ['It was unforgettable.', 'The airline lost your luggage, but you had the time of your lives anyway.', 'You took 400 photos. 390 of them are blurry.', 'You both came back with matching sunburns.'])}`, { emoji: '\u{1F3D6}\u{FE0F}', tone: 'good' })
})

function askForMoney(g: GameState, p: Person): void {
  if (!limit(g, p, 'askMoney', 2, 'Ask for Money')) return
  const c = g.character
  touch(g, p)
  count(g, 'askedForMoney')
  const x = pr(p)
  const askedBefore = (g.yearActions[`rel.askMoney.${p.id}`] ?? 0) > 1
  let refuse = 0.25 + (p.relationship < 40 ? 0.3 : 0) + (has(p, 'stingy') ? 0.25 : 0) - (has(p, 'generous') ? 0.2 : 0) + (askedBefore ? 0.35 : 0) + (p.money < 100 ? 0.5 : 0)
  if (c.age >= 30 && PARENTS.includes(p.relation)) refuse += 0.15
  if (chance(g, clamp(refuse, 0.05, 0.95))) {
    count(g, 'moneyRefused')
    addRelationship(p, -randInt(g, 2, 5))
    notice(g, 'Ask for Money', `${the(p)} refused to give you money. "${pick(g, ["Money doesn't grow on trees!", 'Get a job.', 'What happened to the last money I gave you?', 'I am not an ATM.', 'Ask me again when pigs fly.'])}"`, { emoji: '\u{1F645}' })
    return
  }
  let amount: number
  if (c.age < 13) amount = randInt(g, 1, 20)
  else if (c.age < 18) amount = randInt(g, 10, 200)
  else amount = clamp(p.money * randFloat(g, 0.002, 0.03), 20, 50_000)
  amount = Math.min(Math.round(amount), Math.max(0, p.money))
  if (amount >= 100) amount = Math.round(amount / 10) * 10
  if (amount <= 0) {
    notice(g, 'Ask for Money', `${the(p)} turned ${x.his} pockets inside out. Lint. Just lint.`, { emoji: '\u{1F4B8}' })
    return
  }
  p.money -= amount
  addMoney(g, amount)
  log(g, `${cap(myRel(p))} gave me ${money(amount)}.`, 'good')
  notice(g, 'Ask for Money', `${the(p)} gave you ${money(amount)}. ${pick(g, ["Don't spend it all in one place.", 'Spend it wisely.', `${x.He} sighed heavily while handing it over.`, ''])}`.trim(), { emoji: '\u{1F4B5}', tone: 'good' })
}

function giveMoney(g: GameState, p: Person, input?: string): void {
  const amount = Math.floor(Number((input ?? '').replace(/[^0-9.]/g, '')))
  if (!Number.isFinite(amount) || amount <= 0) {
    notice(g, 'Give Money', 'Enter an amount greater than zero.', { emoji: '\u{1F4B5}' })
    return
  }
  if (!spend(g, amount)) {
    notice(g, 'Give Money', `You don't have ${money(amount)}.`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  count(g, 'gaveMoney')
  p.money += amount
  const d = Math.round(clamp(Math.log10(amount) * 4 - 4, 0, 25))
  addRelationship(p, d)
  log(g, `I gave ${myRel(p)} ${money(amount)}.`)
  const reaction = d >= 12 ? '{He} was speechless.' : d >= 6 ? '{He} was very grateful.' : d >= 2 ? '{He} said thanks.' : '{He} looked at it and said "...thanks?"'
  notice(g, 'Give Money', `You gave ${yourRel(p)} ${money(amount)}. ${fill(reaction, p)}`, { emoji: '\u{1F4B5}', tone: 'good' })
}

function askHomeworkHelp(g: GameState, p: Person): void {
  if (!limit(g, p, 'homework', 2, 'Homework Help')) return
  touch(g, p)
  if (chance(g, 0.3 + p.stats.smarts / 150)) {
    const s = randInt(g, 1, 3)
    addStat(g, 'smarts', s)
    addRelationship(p, randInt(g, 1, 4))
    notice(g, 'Homework Help', `${the(p)} helped you with your homework. ${pick(g, ['You finally understand fractions.', 'You learned something!', 'It only took four hours and two tantrums.'])}`, { emoji: '\u{1F4DA}', tone: 'good' })
  } else {
    notice(g, 'Homework Help', `${the(p)} tried to help with your homework, but had no idea what ${pr(p).he} was doing either.`, { emoji: '\u{1F937}' })
  }
}

function doSquabble(g: GameState, p: Person): void {
  touch(g, p)
  count(g, 'arguments')
  addRelationship(p, -randInt(g, 4, 10))
  const topic = pick(g, SQUABBLES)
  notice(g, 'Squabble', `You and ${p.firstName} squabbled over ${topic}. ${pick(g, ['Mom had to separate you.', 'You both got sent to your rooms.', 'You won. Barely.', `${p.firstName} won. You demand a rematch.`])}`, { emoji: '\u{1F5EF}\u{FE0F}' })
}

function befriend(g: GameState, p: Person): void {
  if (!limit(g, p, 'befriend', 1, 'Befriend')) return
  touch(g, p)
  const authority = p.relation === 'teacher' || p.relation === 'boss'
  let odds = authority ? 0.15 + p.relationship / 250 : 0.3 + p.relationship / 150
  if (has(p, 'outgoing', 'kind', 'funny')) odds += 0.12
  if (has(p, 'shy', 'serious', 'arrogant')) odds -= 0.1
  if (chance(g, clamp(odds, 0.05, 0.95))) {
    p.data.formerRelation = p.relation
    p.relation = 'friend'
    addRelationship(p, randInt(g, 5, 10))
    count(g, 'friendsMade')
    log(g, `I became friends with ${fullName(p)}.`, 'good')
    notePerson(p, `Became friends with the player at age ${g.character.age}.`)
    notice(g, 'Befriend', `${p.firstName} accepted your friendship! \u{1F91D}`, { emoji: '\u{1F91D}', tone: 'good' })
  } else {
    addRelationship(p, -randInt(g, 2, 6))
    const warn = p.relation === 'teacher' ? ' and warned you to keep things professional' : p.relation === 'boss' ? ' and said they prefer not to mix work and friendship' : ''
    notice(g, 'Befriend', `${p.firstName} rejected your friendship${warn}.`, { emoji: '\u{1F645}' })
  }
}

function makeBestFriend(g: GameState, p: Person): void {
  for (const old of g.people.filter((x) => x.alive && x.relation === 'bestFriend' && x.id !== p.id)) {
    old.relation = 'friend'
    addRelationship(old, -randInt(g, 5, 10))
  }
  p.relation = 'bestFriend'
  addRelationship(p, randInt(g, 5, 10))
  log(g, `${fullName(p)} became my best friend.`, 'good')
  notice(g, 'Best Friends', `You and ${p.firstName} are now best friends! \u{1F46F}`, { emoji: '\u{1F46F}', tone: 'good' })
}

function askBestFriend(g: GameState, p: Person): void {
  if (!limit(g, p, 'bff', 1, 'Best Friend')) return
  touch(g, p)
  if (chance(g, clamp((p.relationship - 30) / 70, 0.05, 0.95))) makeBestFriend(g, p)
  else {
    addRelationship(p, -randInt(g, 2, 5))
    notice(g, 'Best Friend', `${p.firstName} said ${pr(p).he} isn't ready for that kind of commitment.`, { emoji: '\u{1F645}' })
  }
}

function rumor(g: GameState, p: Person): void {
  if (!limit(g, p, 'rumor', 1, 'Rumor')) return
  touch(g, p)
  count(g, 'rumors')
  addHidden(g, 'karma', -3)
  const r = fill(pick(g, RUMORS), p)
  addRelationship(p, -randInt(g, 8, 15))
  let text = `You started a rumor that ${p.firstName} ${r}. It spread like wildfire.`
  if (chance(g, 0.35)) {
    addRelationship(p, -randInt(g, 8, 15))
    if (has(p, 'hot-headed') || chance(g, 0.3)) {
      addStat(g, 'health', -randInt(g, 3, 9))
      count(g, 'fights')
      text += `\n\n${p.firstName} found out it was you and ${pick(g, ['punched you in the face', 'tackled you in the hallway', 'threw your backpack in a dumpster'])}!`
    } else {
      text += `\n\n${p.firstName} found out it was you and started an even worse rumor about you.`
      addStat(g, 'happiness', -randInt(g, 3, 6))
    }
  }
  log(g, `I started a rumor about ${fullName(p)}.`, 'bad')
  notice(g, 'Rumor', text, { emoji: '\u{1F92B}' })
}

function party(g: GameState, p: Person): void {
  if (!limit(g, p, 'party', 2, 'Party')) return
  touch(g, p)
  const c = g.character
  if (p.relationship < 30 && chance(g, 0.5)) {
    addRelationship(p, -randInt(g, 1, 3))
    notice(g, 'Party', `${p.firstName} didn't want to party with you.`, { emoji: '\u{1F645}' })
    return
  }
  const where = pick(g, localParties(g, c.age >= 18 && p.age >= 18 && chance(g, 0.6)))
  addRelationship(p, randInt(g, 5, 10))
  addStat(g, 'happiness', randInt(g, 5, 10))
  count(g, 'parties')
  let text = `You went to ${where} with ${yourRel(p)}. ${pick(g, ['It was legendary.', 'You danced until your feet hurt.', 'You made three new friends and forgot all their names.', 'Someone fell into the pool. It was you.'])}`
  if (c.age < 18 && chance(g, 0.05)) {
    addStat(g, 'happiness', -4)
    text += '\n\nThe cops showed up and broke it up. Your parents got a call.'
  } else if (c.age >= 21 && chance(g, 0.06)) {
    addStat(g, 'health', -3)
    text += '\n\nYou woke up the next morning with a mysterious headache and a traffic cone.'
  }
  log(g, `I went to ${where} with ${myRel(p)}.`, 'good')
  notice(g, 'Party', text, { emoji: '\u{1F389}', tone: 'good' })
}

function concert(g: GameState, p: Person): void {
  if (!limit(g, p, 'concert', 1, 'Concert')) return
  const cost = randInt(g, 6, 20) * 10
  if (!spend(g, cost)) {
    notice(g, 'Concert', `You can't afford two concert tickets (${money(cost)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  const band = pick(g, BANDS)
  addRelationship(p, randInt(g, 5, 11))
  addStat(g, 'happiness', randInt(g, 5, 10))
  log(g, `I saw ${band} in concert with ${myRel(p)}.`, 'good')
  notice(g, 'Concert', `You saw ${band} live with ${yourRel(p)} (${money(cost)}). ${pick(g, ['You lost your voice from screaming.', 'The lead singer pointed at you. Probably.', 'You spent the whole show filming it on your phone.', 'It was the best night of the year.'])}`, { emoji: '\u{1F3B8}', tone: 'good' })
}

function watchVideos(g: GameState, p: Person): void {
  if (!limit(g, p, 'videos', 2, 'Watch Videos')) return
  touch(g, p)
  const ch = pick(g, CHANNELS)
  if (chance(g, mood(p) + 0.15)) {
    addRelationship(p, randInt(g, 3, 7))
    addStat(g, 'happiness', randInt(g, 2, 4))
    notice(g, 'Watch Videos', `You watched videos of ${ch} with ${yourRel(p)}. You both lost track of time.`, { emoji: '\u{1F4FA}', tone: 'good' })
  } else {
    addRelationship(p, -1)
    notice(g, 'Watch Videos', `You tried to show ${p.firstName} videos of ${ch}. ${pr(p).He} did not get it.`, { emoji: '\u{1F4FA}' })
  }
}

function dateNight(g: GameState, p: Person): void {
  if (!limit(g, p, 'date', 2, 'Date Night')) return
  const c = g.character
  let text: string
  let cost = 0
  if (c.age < 18) text = localize(g, pick(g, localActs(g, DATE_VENUES_TEEN)))
  else {
    const v = pick(g, DATE_VENUES_ADULT.filter((d) => !noDrinking(g) || !/wine/.test(d.text)))
    cost = v.cost
    text = v.text
  }
  if (!spend(g, cost)) {
    notice(g, 'Date Night', `You can't afford date night (${money(cost)}). Maybe a walk in the park instead?`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  if (chance(g, mood(p) + 0.15)) {
    const d = randInt(g, 6, 12)
    addRelationship(p, d)
    addStat(g, 'happiness', randInt(g, 4, 8))
    log(g, `${p.firstName} and I ${text}.`, 'good')
    notice(g, 'Date Night', `You and ${p.firstName} ${text}${cost ? ` (${money(cost)})` : ''}. ${fill(pick(g, ['It was magical.', '{He} held your hand the whole time.', 'You talked for hours.', '{He} said it was the best date ever.']), p)}`, { emoji: '\u{1F377}', tone: 'good' })
  } else {
    addRelationship(p, randInt(g, -3, 1))
    notice(g, 'Date Night', `You and ${p.firstName} ${text}${cost ? ` (${money(cost)})` : ''}. ${fill(pick(g, ['{He} was on {his} phone most of the night.', 'You ran out of things to say by the appetizers.', '{He} spent the whole time talking about {his} ex.']), p)}`, { emoji: '\u{1F377}' })
  }
}

const PICKUP_LINES = [
  "Are you a parking ticket? Because you've got FINE written all over you.",
  'Do you have a map? I keep getting lost in your eyes.',
  "Are you made of copper and tellurium? Because you're Cu-Te.",
  "Is your name Wi-Fi? Because I'm feeling a connection.",
  'Do you believe in love at first sight, or should I walk by again?',
  "If you were a vegetable, you'd be a cute-cumber.",
  "Are you a bank loan? Because you've got my interest.",
  "Are you a campfire? Because you're hot and I want s'more.",
  "Is it hot in here, or is it just you? (It's the broken AC. But also you.)",
  'Are you a magician? Because whenever I look at you, everyone else disappears.',
]

function flirt(g: GameState, p: Person): void {
  if (!limit(g, p, 'flirt', 2, 'Flirt')) return
  const c = g.character
  touch(g, p)
  count(g, 'flirts')
  const x = pr(p)
  const line = pick(g, PICKUP_LINES)
  if (isRomantic(p) || p.relation === 'lover') {
    if (chance(g, mood(p) + 0.15)) {
      const d = randInt(g, 3, 8)
      addRelationship(p, d)
      addStat(g, 'happiness', randInt(g, 1, 4))
      notice(g, 'Flirt', `You flirted with ${yourRel(p)}: "${line}"\n\n${fill(pick(g, ['{He} blushed and kissed you.', '{He} giggled like it was your first date.', '{He} flirted right back.', '{He} groaned at the line, but {he} was smiling.']), p)}`, { emoji: '\u{1F60F}', tone: 'good' })
    } else {
      addRelationship(p, randInt(g, -1, 1))
      notice(g, 'Flirt', `You flirted with ${yourRel(p)}: "${line}"\n\n${fill(pick(g, ['{He} rolled {his} eyes.', '{He} said "Not now, I\'m watching my show."', '{He} patted you on the head like a puppy.']), p)}`, { emoji: '\u{1F644}' })
    }
    return
  }
  let odds = 0.2 + p.relationship / 200 + (c.stats.looks - p.stats.looks) / 250
  if (has(p, 'flirty', 'romantic', 'outgoing')) odds += 0.12
  if (has(p, 'shy', 'serious')) odds -= 0.08
  if (p.data.married === true) odds -= 0.2
  const partner = currentPartner(g)
  if (chance(g, clamp(odds, 0.05, 0.9))) {
    addRelationship(p, randInt(g, 4, 9))
    addStat(g, 'happiness', randInt(g, 2, 5))
    let text = `You flirted with ${yourRel(p)}: "${line}"\n\n${fill(pick(g, ['{He} flirted back!', '{He} laughed and touched your arm.', '{He} said "Smooth." and meant it.', '{He} turned bright red.']), p)}`
    if (partner && chance(g, 0.15)) {
      addRelationship(partner, -randInt(g, 5, 12))
      text += `\n\n${partner.firstName} saw the whole thing and is not happy.`
    }
    notice(g, 'Flirt', text, { emoji: '\u{1F60F}', tone: 'good' })
    if (!partner && !datingProblem(g, p) && chance(g, 0.25)) {
      scriptChoice(g, 'rel.flirt.askedOut', 'Asked Out', `${p.firstName} asked you out on a date!`, [
        { id: 'yes', label: 'Say yes', emoji: '\u{1F496}' },
        { id: 'no', label: 'Turn them down', emoji: '\u{1F645}' },
      ], { emoji: '\u{1F498}', data: asJson({ pid: p.id }), personId: p.id })
    }
    return
  }
  addRelationship(p, -randInt(g, 3, 8))
  addStat(g, 'happiness', -randInt(g, 1, 3))
  let text = `You flirted with ${yourRel(p)}: "${line}"\n\n${fill(pick(g, ['{He} looked at you like you had two heads.', '{He} said "Please never say that to me again."', '{He} pretended not to hear you.', '{He} laughed. At you, not with you.']), p)}`
  const job = c.job?.company === p.contextId ? c.job : c.partTimeJob?.company === p.contextId ? c.partTimeJob : null
  if ((p.relation === 'coworker' || p.relation === 'boss') && job && chance(g, 0.2)) {
    job.performance = clamp(job.performance - randInt(g, 5, 12))
    text += `\n\n${x.He} reported you to HR. You had to sit through a two-hour seminar on workplace conduct.`
  }
  notice(g, 'Flirt', text, { emoji: '\u{1F62C}' })
}

defineScript('rel.flirt.askedOut', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive) return
  touch(g, p)
  if (choice === 'yes') {
    const problem = datingProblem(g, p)
    if (problem) {
      notice(g, 'Asked Out', problem, { emoji: '\u{1F6AB}' })
      return
    }
    startDating(g, p, `flirted (was ${labelOf(p)})`)
    addStat(g, 'happiness', randInt(g, 5, 10))
    notice(g, 'Asked Out', `You said yes! You and ${p.firstName} are dating now.`, { emoji: '\u{1F496}', tone: 'good' })
  } else {
    addRelationship(p, -randInt(g, 5, 12))
    notice(g, 'Asked Out', `You turned ${p.firstName} down. ${pr(p).He} said "${pick(g, ['Your loss.', 'Cool. Cool cool cool.', 'I was joking anyway.'])}"`, { emoji: '\u{1F645}' })
  }
})

function getBackTogether(g: GameState, p: Person): void {
  const problem = datingProblem(g, p)
  if (problem) {
    notice(g, 'Get Back Together', problem, { emoji: '\u{1F6AB}' })
    return
  }
  if (!limit(g, p, 'reunite', 1, 'Get Back Together')) return
  touch(g, p)
  let odds = p.relationship / 110 + (p.data.fling === true ? 0.1 : 0) - (p.relation === 'exSpouse' ? 0.1 : 0)
  if (p.data.married === true) odds -= 0.3
  if (chance(g, clamp(odds, 0.03, 0.9))) {
    const wasFling = p.data.fling === true
    delete p.data.fling
    startDating(g, p, wasFling ? 'a fling turned serious' : 'got back together')
    addStat(g, 'happiness', randInt(g, 5, 10))
    notice(g, 'Get Back Together', `${p.firstName} said yes! You two are dating${wasFling ? ' for real now' : ' again'}.`, { emoji: '\u{1F496}', tone: 'good' })
  } else {
    addRelationship(p, -randInt(g, 5, 10))
    addStat(g, 'happiness', -randInt(g, 3, 8))
    notice(g, 'Get Back Together', `${p.firstName} said there's a reason you two didn't work out.`, { emoji: '\u{1F494}', tone: 'bad' })
  }
}

function makePeace(g: GameState, p: Person): void {
  if (!limit(g, p, 'peace', 1, 'Make Peace')) return
  touch(g, p)
  if (chance(g, clamp(0.2 + p.relationship / 100 + (has(p, 'kind', 'caring', 'calm') ? 0.15 : 0), 0.05, 0.9))) {
    p.relation = 'friend'
    p.relationship = Math.max(p.relationship, randInt(g, 35, 50))
    addHidden(g, 'karma', 3)
    log(g, `I made peace with ${fullName(p)}.`, 'good')
    notice(g, 'Make Peace', `You offered ${p.firstName} an olive branch and ${pr(p).he} took it. You're friends now!`, { emoji: '\u{1F54A}\u{FE0F}', tone: 'good' })
  } else {
    addRelationship(p, -randInt(g, 1, 4))
    notice(g, 'Make Peace', `${p.firstName} told you to get lost.`, { emoji: '\u{1F595}' })
  }
}

function petPlay(g: GameState, p: Person): void {
  if (!limit(g, p, 'play', 3, 'Play')) return
  touch(g, p)
  const s = p.species ?? 'Pet'
  const acts: Record<string, string[]> = {
    Dog: ['played fetch with {name}', 'played tug-of-war with {name}', 'taught {name} a new trick'],
    Cat: ['dangled a feather toy for {name}', 'chased a laser pointer around with {name}', 'built a cardboard castle for {name}'],
    Fish: ['waved at {name} through the glass', 'rearranged the tiny castle in {name}\'s tank'],
    Snake: ['let {name} slither around your shoulders', 'watched a nature documentary with {name}'],
    Bird: ['taught {name} a new word', 'sang a duet with {name}'],
    Parrot: ['taught {name} a new word', 'sang a duet with {name}'],
    Horse: ['brushed {name}\'s mane', 'fed apples to {name}'],
    Hamster: ['set up an obstacle course for {name}', 'watched {name} run a wheel marathon'],
  }
  const act = fill(pick(g, acts[s] ?? ['played with {name}', 'cuddled with {name}']), p)
  addRelationship(p, randInt(g, 4, 10))
  addPersonStat(p, 'happiness', randInt(g, 3, 8))
  addStat(g, 'happiness', randInt(g, 2, 5))
  notice(g, 'Play', `You ${act}. ${pick(g, ['Best day ever (for both of you).', `${p.firstName} looked very pleased.`, 'Pure joy.'])}`, { emoji: '\u{1F43E}', tone: 'good' })
}

function petWalk(g: GameState, p: Person): void {
  if (!limit(g, p, 'walk', 3, 'Walk')) return
  touch(g, p)
  addRelationship(p, randInt(g, 3, 8))
  addPersonStat(p, 'health', randInt(g, 1, 3))
  addStat(g, 'health', randInt(g, 1, 2))
  addStat(g, 'happiness', randInt(g, 1, 3))
  notice(g, 'Walk', `You took ${p.firstName} for a walk. ${pick(g, [`${p.firstName} sniffed every single tree.`, `${p.firstName} barked at a leaf.`, 'You met three other dog owners and learned none of their names.', `${p.firstName} tried to eat something mysterious off the sidewalk.`])}`, { emoji: '\u{1F9AE}', tone: 'good' })
}

function petTreat(g: GameState, p: Person): void {
  if (!limit(g, p, 'treat', 3, 'Treat')) return
  touch(g, p)
  addRelationship(p, randInt(g, 3, 7))
  addPersonStat(p, 'happiness', randInt(g, 3, 6))
  notice(g, 'Treat', `You gave ${p.firstName} a treat. ${pick(g, ['It was gone in 0.3 seconds.', `${p.firstName} looked at you like you hung the moon.`, `${p.firstName} immediately asked for another one.`])}`, { emoji: '\u{1F9B4}', tone: 'good' })
}

function petBathe(g: GameState, p: Person): void {
  if (!limit(g, p, 'bathe', 2, 'Bathe')) return
  touch(g, p)
  const crazy = pNum(p, 'craziness', 30)
  if (chance(g, 0.55 + p.relationship / 400 - crazy / 300)) {
    addRelationship(p, randInt(g, 2, 5))
    addPersonStat(p, 'health', randInt(g, 1, 3))
    notice(g, 'Bathe', `You gave ${p.firstName} a bath. ${pr(p).He} looks (and smells) fantastic.`, { emoji: '\u{1F6C1}', tone: 'good' })
  } else if (crazy > 60 && chance(g, 0.5)) {
    addRelationship(p, -randInt(g, 4, 8))
    addStat(g, 'health', -randInt(g, 2, 6))
    notice(g, 'Bathe', `You tried to give ${p.firstName} a bath. ${pr(p).He} scratched and bit you, then escaped dripping wet across the house.`, { emoji: '\u{1F6C1}', tone: 'bad' })
  } else {
    addRelationship(p, -randInt(g, 2, 6))
    notice(g, 'Bathe', `You gave ${p.firstName} a bath. ${pr(p).He} hated every second of it.`, { emoji: '\u{1F6C1}' })
  }
}

function petRide(g: GameState, p: Person): void {
  if (!limit(g, p, 'ride', 2, 'Ride')) return
  touch(g, p)
  if (chance(g, 0.08 + pNum(p, 'craziness', 30) / 500)) {
    addStat(g, 'health', -randInt(g, 5, 15))
    notice(g, 'Ride', `${p.firstName} got spooked and threw you off! You landed in a very undignified position.`, { emoji: '\u{1F40E}', tone: 'bad' })
    return
  }
  addRelationship(p, randInt(g, 3, 8))
  addStat(g, 'happiness', randInt(g, 5, 10))
  addStat(g, 'health', randInt(g, 1, 3))
  notice(g, 'Ride', `You went for a ride on ${p.firstName} ${pick(g, ['through the countryside', 'along the river', 'through the forest', 'across an open field at sunset'])}.`, { emoji: '\u{1F40E}', tone: 'good' })
}

function petVet(g: GameState, p: Person): void {
  if (!limit(g, p, 'vet', 1, 'Veterinarian')) return
  const c = g.character
  const cost = c.age >= 18 ? randInt(g, 8, 40) * 10 : 0
  if (!spend(g, cost)) {
    notice(g, 'Veterinarian', `You can't afford the vet bill (${money(cost)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  const sick = pStrData(p, 'sick')
  const who = c.age < 12 ? 'Your parents took' : 'You took'
  if (!sick) {
    addPersonStat(p, 'health', randInt(g, 5, 15))
    notice(g, 'Veterinarian', `${who} ${p.firstName} to the vet${cost ? ` (${money(cost)})` : ''}. ${pr(p).He} got a clean bill of health!`, { emoji: '\u{1FA7A}', tone: 'good' })
    return
  }
  if (sick === 'Rabies') {
    scriptChoice(g, 'rel.pet.rabies', 'Veterinarian', `The vet says ${p.firstName} has rabies. There is no cure, and ${pr(p).he} is suffering. The vet recommends putting ${pr(p).him} down.`, [
      { id: 'euthanize', label: 'Put them down', emoji: '\u{1F622}' },
      { id: 'refuse', label: 'Refuse', emoji: '\u{1F645}' },
    ], { emoji: '\u{1FA7A}', data: asJson({ pid: p.id }), personId: p.id })
    return
  }
  if (chance(g, 0.75)) {
    delete p.data.sick
    addPersonStat(p, 'health', randInt(g, 10, 25))
    addRelationship(p, randInt(g, 2, 5))
    notice(g, 'Veterinarian', `${who} ${p.firstName} to the vet${cost ? ` (${money(cost)})` : ''}. The vet treated ${pr(p).him} for ${sick}. ${pr(p).He}'s feeling much better!`, { emoji: '\u{1FA7A}', tone: 'good' })
  } else {
    notice(g, 'Veterinarian', `${who} ${p.firstName} to the vet${cost ? ` (${money(cost)})` : ''}. The vet diagnosed ${sick}, but the treatment didn't work. Try again next year.`, { emoji: '\u{1FA7A}', tone: 'bad' })
  }
}

defineScript('rel.pet.rabies', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive) return
  if (choice === 'euthanize') {
    p.alive = false
    p.livesWithPlayer = false
    p.causeOfDeath = 'Euthanasia'
    p.data.diedAge = g.character.age
    addStat(g, 'happiness', -randInt(g, 5, 10))
    log(g, `I had my ${labelOf(p)} ${p.firstName} put down.`, 'bad')
    notice(g, 'Goodbye', `You held ${p.firstName} as the vet put ${pr(p).him} to sleep. ${pr(p).He} is no longer suffering.`, { emoji: '\u{1F622}', tone: 'bad' })
    return
  }
  if (chance(g, 0.35) && !g.character.conditions.some((x) => x.name === 'Rabies')) {
    g.character.conditions.push({ id: uid(g, 'c'), name: 'Rabies', kind: 'disease', severity: 45, yearsHad: 0, curable: true, diagnosed: true, age: g.character.age })
    count(g, 'diseases')
    notice(g, 'Rabies', `You took ${p.firstName} home anyway. ${pr(p).He} bit you. You now have rabies. Great decision.`, { emoji: '\u{1F9A0}', tone: 'bad' })
  } else {
    notice(g, 'Rabies', `You took ${p.firstName} home anyway. Keep your hands to yourself.`, { emoji: '\u{1F9A0}' })
  }
})

// --- Action table ----------------------------------------------------------

const D = {
  spendTime: (): Def => ({ id: 'spendTime', label: 'Spend Time', emoji: '\u{1F46B}', minAge: 2, run: spendTime }),
  conversation: (): Def => ({ id: 'conversation', label: 'Conversation', emoji: '\u{1F4AC}', minAge: 3, targetMinAge: 3, prisonOk: true, run: conversation }),
  compliment: (): Def => ({ id: 'compliment', label: 'Compliment', emoji: '\u{1F60A}', minAge: 4, targetMinAge: 3, prisonOk: true, run: compliment }),
  gift: (): Def => ({ id: 'gift', label: 'Gift', emoji: '\u{1F381}', minAge: 5, subtitle: 'Give them a present', run: showGifts }),
  insult: (): Def => ({ id: 'insult', label: 'Insult', emoji: '\u{1F595}', minAge: 5, targetMinAge: 4, run: (g, p) => doInsult(g, p) }),
  argue: (): Def => ({ id: 'argue', label: 'Argue', emoji: '\u{1F5EF}\u{FE0F}', minAge: 8, targetMinAge: 8, run: argue }),
  prank: (): Def => ({ id: 'prank', label: 'Prank', emoji: '\u{1F921}', minAge: 8, targetMinAge: 5, run: prank }),
  assault: (label = 'Assault'): Def => ({ id: 'assault', label, emoji: '\u{1F44A}', minAge: 6, targetMinAge: 4, check: canBrawl, run: startAssault }),
  hug: (): Def => ({ id: 'hug', label: 'Hug', emoji: '\u{1F917}', minAge: 2, run: hug }),
  movie: (): Def => ({ id: 'movie', label: 'Movie Theater', emoji: '\u{1F3AC}', minAge: 6, targetMinAge: 4, subtitle: (g) => (g.character.age >= 18 ? 'Catch a movie together (~$35)' : 'Catch a movie together'), run: movie }),
  vacation: (): Def => ({ id: 'vacation', label: 'Vacation', emoji: '\u{1F3D6}\u{FE0F}', minAge: 18, subtitle: 'Take them on a trip', run: vacationWith }),
  askMoney: (): Def => ({ id: 'askMoney', label: 'Ask for Money', emoji: '\u{1F4B0}', minAge: 5, prisonOk: true, run: askForMoney }),
  giveMoney: (): Def => ({
    id: 'giveMoney',
    label: 'Give Money',
    emoji: '\u{1F4B5}',
    minAge: 18,
    subtitle: (g) => `You have ${money(g.character.money)}`,
    check: (g) => (g.character.money <= 0 ? "You don't have any money to give." : null),
    input: { kind: 'number', label: 'How much?', min: 1, placeholder: '100' },
    run: giveMoney,
  }),
  homework: (): Def => ({
    id: 'homework',
    label: 'Homework Help',
    emoji: '\u{1F4DA}',
    minAge: 6,
    show: (g) => g.character.age < 18 && g.character.education.current !== null,
    run: askHomeworkHelp,
  }),
  story: (): Def => ({ id: 'story', label: 'Read a Story', emoji: '\u{1F4D6}', minAge: 10, show: (_g, p) => p.age >= 1 && p.age <= 9, run: readStory }),
  squabble: (): Def => ({ id: 'squabble', label: 'Squabble', emoji: '\u{1F5EF}\u{FE0F}', minAge: 4, targetMinAge: 3, run: (g, p) => (limit(g, p, 'squabble', 2, 'Squabble') ? doSquabble(g, p) : undefined) }),
  befriend: (): Def => ({ id: 'befriend', label: 'Befriend', emoji: '\u{1F91D}', minAge: 3, prisonOk: true, run: befriend }),
  bestFriend: (): Def => ({ id: 'bestFriend', label: 'Best Friend', emoji: '\u{1F46F}', minAge: 4, subtitle: 'Ask them to be your best friend', run: askBestFriend }),
  unfriend: (): Def => ({
    id: 'unfriend',
    label: 'Unfriend',
    emoji: '\u{1F44B}',
    prisonOk: true,
    confirm: (_g, p) => `Unfriend ${p.firstName}? They will be removed from your life.`,
    run: (g, p) => {
      removePerson(g, p.id)
      log(g, `I unfriended ${fullName(p)}.`)
      notice(g, 'Unfriend', `You unfriended ${p.firstName}. ${pick(g, ['Bold move.', 'They will be sharing passive-aggressive quotes online about this.', 'Out with the old.'])}`, { emoji: '\u{1F44B}' })
    },
  }),
  rumor: (): Def => ({ id: 'rumor', label: 'Start a Rumor', emoji: '\u{1F92B}', minAge: 12, targetMinAge: 10, run: rumor }),
  party: (): Def => ({ id: 'party', label: 'Party', emoji: '\u{1F389}', minAge: 13, targetMinAge: 13, run: party }),
  concert: (): Def => ({ id: 'concert', label: 'Concert', emoji: '\u{1F3B8}', minAge: 12, targetMinAge: 10, subtitle: 'Buy two tickets to a show', run: concert }),
  videos: (): Def => ({ id: 'videos', label: 'Watch Videos', emoji: '\u{1F4FA}', minAge: 8, targetMinAge: 6, run: watchVideos }),
  askOut: (): Def => ({
    id: 'askOut',
    label: 'Ask Out',
    emoji: '\u{1F498}',
    minAge: 13,
    targetMinAge: 13,
    show: (g, p) => g.character.age < 18 === p.age < 18 && attractedTo(g.character, p.gender),
    check: datingProblem,
    run: askOut,
  }),
  hookUp: (): Def => ({
    id: 'hookUp',
    label: 'Hook Up',
    emoji: '\u{1F48B}',
    minAge: 18,
    targetMinAge: 18,
    show: (g, p) => attractedTo(g.character, p.gender),
    check: (g, p) => intimacyProblem(g, p),
    confirm: (g) => {
      const partner = currentPartner(g)
      return partner ? `You're with ${partner.firstName}. This would be cheating. Continue?` : null
    },
    run: (g, p) => {
      if (!useYearAction(g, `rel.hookup.${p.id}`, 2)) {
        notice(g, 'Hook Up', fill('{name} needs a break. Try again next year.', p), { emoji: '\u{23F3}' })
        return
      }
      hookUpWith(g, p)
    },
  }),
  flirt: (): Def => ({
    id: 'flirt',
    label: 'Flirt',
    emoji: '\u{1F60F}',
    minAge: 13,
    targetMinAge: 13,
    show: (g, p) => isRomantic(p) || p.relation === 'lover' || (g.character.age < 18 === p.age < 18 && attractedTo(g.character, p.gender)),
    run: flirt,
  }),
  dateNight: (): Def => ({ id: 'dateNight', label: 'Date Night', emoji: '\u{1F377}', minAge: 13, subtitle: 'Go out on a date', run: dateNight }),
  makeLove: (): Def => ({
    id: 'makeLove',
    label: 'Make Love',
    emoji: '\u{1F495}',
    minAge: 18,
    targetMinAge: 18,
    check: intimacyProblem,
    run: (g, p) => (limit(g, p, 'makeLove', 3, 'Make Love') ? makeLove(g, p) : undefined),
  }),
  tryBaby: (): Def => ({
    id: 'tryBaby',
    label: 'Try for a Baby',
    emoji: '\u{1F37C}',
    minAge: 18,
    targetMinAge: 18,
    check: (g, p) => intimacyProblem(g, p) ?? conceptionBlocker(g, p),
    run: (g, p) => (limit(g, p, 'tryBaby', 2, 'Try for a Baby') ? tryForBaby(g, p) : undefined),
  }),
  birthControl: (): Def => ({
    id: 'birthControl',
    label: 'Birth Control',
    emoji: '\u{1F48A}',
    minAge: 18,
    show: (g, p) => g.character.gender === 'male' && p.gender === 'female',
    subtitle: (_g, p) => (p.data.birthControl === true ? `Ask ${p.firstName} to stop birth control` : `Ask ${p.firstName} to start birth control`),
    run: (g, p) => (limit(g, p, 'birthControl', 1, 'Birth Control') ? askBirthControl(g, p) : undefined),
  }),
  counseling: (): Def => ({ id: 'counseling', label: 'Couples Counseling', emoji: '\u{1F6CB}\u{FE0F}', minAge: 18, subtitle: 'Work on your relationship (~$400)', run: (g, p) => (limit(g, p, 'counseling', 1, 'Counseling') ? couplesCounseling(g, p) : undefined) }),
  propose: (): Def => ({
    id: 'propose',
    label: 'Propose',
    emoji: '\u{1F48D}',
    minAge: 16,
    show: (_g, p) => p.relation === 'partner',
    check: proposalProblem,
    run: (g, p) => (limit(g, p, 'propose', 1, 'Propose') ? proposeTo(g, p) : undefined),
  }),
  wedding: (): Def => ({ id: 'wedding', label: 'Plan the Wedding', emoji: '\u{1F492}', minAge: 16, show: (_g, p) => p.relation === 'fiance', check: weddingProblem, run: planWedding }),
  elope: (): Def => ({ id: 'elope', label: 'Elope', emoji: '\u{1F3C3}', minAge: 16, show: (_g, p) => p.relation === 'fiance', check: weddingProblem, run: (g, p) => (limit(g, p, 'elope', 1, 'Elope') ? elope(g, p) : undefined) }),
  cancelEngagement: (): Def => ({
    id: 'cancelEngagement',
    label: 'Cancel Engagement',
    emoji: '\u{1F48D}',
    prisonOk: true,
    show: (_g, p) => p.relation === 'fiance',
    confirm: (_g, p) => `Call off your engagement to ${p.firstName}?`,
    run: (g, p) => cancelEngagement(g, p, 'player'),
  }),
  renewVows: (): Def => ({ id: 'renewVows', label: 'Renew Vows', emoji: '\u{1F492}', show: (_g, p) => p.relation === 'spouse', run: (g, p) => (limit(g, p, 'vows', 1, 'Renew Vows') ? renewVows(g, p) : undefined) }),
  breakUp: (): Def => ({
    id: 'breakUp',
    label: 'Break Up',
    emoji: '\u{1F494}',
    prisonOk: true,
    show: (_g, p) => p.relation === 'partner' || p.relation === 'fiance',
    confirm: (_g, p) => `Are you sure you want to break up with ${p.firstName}?`,
    run: (g, p) => breakUp(g, p, 'player'),
  }),
  divorce: (): Def => ({
    id: 'divorce',
    label: 'Divorce',
    emoji: '\u{1F4C4}',
    prisonOk: true,
    show: (_g, p) => p.relation === 'spouse',
    subtitle: (_g, p) => (p.data.prenup === true ? 'You have a prenup' : 'No prenup: assets may be split'),
    confirm: (_g, p) => `Are you sure you want to divorce ${p.firstName}?`,
    run: (g, p) => divorce(g, p, 'player'),
  }),
  getBack: (): Def => ({ id: 'getBack', label: 'Get Back Together', emoji: '\u{1F496}', minAge: 13, check: datingProblem, subtitle: (_g, p) => (p.data.fling === true ? 'Start dating them for real' : 'Give it another shot'), run: getBackTogether }),
  deleteContact: (): Def => ({
    id: 'deleteContact',
    label: 'Delete Contact',
    emoji: '\u{1F5D1}\u{FE0F}',
    prisonOk: true,
    confirm: (_g, p) => `Delete ${p.firstName} from your contacts forever?`,
    run: (g, p) => {
      removePerson(g, p.id)
      notice(g, 'Delete Contact', `You deleted ${p.firstName}'s number. Growth.`, { emoji: '\u{1F5D1}\u{FE0F}' })
    },
  }),
  makePeace: (): Def => ({ id: 'makePeace', label: 'Make Peace', emoji: '\u{1F54A}\u{FE0F}', minAge: 4, run: makePeace }),
  endAffair: (): Def => ({
    id: 'endAffair',
    label: 'End the Affair',
    emoji: '\u{1F6AA}',
    prisonOk: true,
    confirm: (_g, p) => `End things with ${p.firstName}?`,
    run: (g, p) => {
      p.relation = 'ex'
      p.data.fling = true
      addRelationship(p, -randInt(g, 15, 25))
      log(g, `I ended my affair with ${fullName(p)}.`)
      notice(g, 'End the Affair', `You told ${p.firstName} it's over. ${pr(p).He} ${pick(g, ['threatened to tell everyone.', 'cried in the parking lot.', 'said "your loss."'])}`, { emoji: '\u{1F6AA}' })
    },
  }),
  leaveFor: (): Def => ({
    id: 'leaveFor',
    label: 'Make It Official',
    emoji: '\u{1F496}',
    minAge: 13,
    subtitle: (g, p) => {
      const partner = currentPartner(g)
      return partner ? `Leave ${partner.firstName} for ${p.firstName}` : `Start dating ${p.firstName} for real`
    },
    confirm: (g) => {
      const partner = currentPartner(g)
      return partner ? `This will end things with ${partner.firstName}. Continue?` : null
    },
    run: (g, p) => {
      const partner = currentPartner(g)
      if (partner && partner.id !== p.id) breakUp(g, partner, 'player')
      if (datingProblem(g, p)) return
      startDating(g, p, 'an affair turned official')
      notice(g, 'Official', `You and ${p.firstName} are officially a couple now. No more sneaking around.`, { emoji: '\u{1F496}', tone: 'good' })
    },
  }),
  disown: (): Def => ({
    id: 'disown',
    label: 'Disown',
    emoji: '\u{1F6AB}',
    minAge: 30,
    show: (_g, p) => p.age >= 18 && p.data.disowned !== true,
    confirm: (_g, p) => `Disown ${p.firstName}? This is hard to undo.`,
    run: (g, p) => {
      p.data.disowned = true
      p.data.disownedAge = g.character.age
      p.relationship = 0
      addHidden(g, 'karma', -8)
      addStat(g, 'happiness', -randInt(g, 3, 8))
      const other = getPerson(g, p.otherParentId)
      if (other && other.alive && isRomantic(other)) addRelationship(other, -randInt(g, 8, 15))
      log(g, `I disowned ${myRel(p)}.`, 'bad')
      notice(g, 'Disowned', `You disowned ${p.firstName}. The family group chat has gone silent.`, { emoji: '\u{1F6AB}', tone: 'bad' })
    },
  }),
  reconnect: (): Def => ({
    id: 'reconnect',
    label: 'Reconnect',
    emoji: '\u{1F91D}',
    run: (g, p) => {
      if (!limit(g, p, 'reconnect', 1, 'Reconnect')) return
      const years = g.character.age - pNum(p, 'disownedAge', g.character.age)
      if (chance(g, clamp(0.25 + years * 0.04, 0.1, 0.8))) {
        delete p.data.disowned
        p.relationship = randInt(g, 25, 40)
        touch(g, p)
        log(g, `I reconnected with ${myRel(p)}.`, 'good')
        notice(g, 'Reconnect', `${p.firstName} agreed to reconnect. It's a start.`, { emoji: '\u{1F91D}', tone: 'good' })
      } else {
        notice(g, 'Reconnect', `${p.firstName} isn't ready to talk to you yet.`, { emoji: '\u{1F645}' })
      }
    },
  }),
  // Pets
  play: (): Def => ({ id: 'play', label: 'Play', emoji: '\u{1F3BE}', minAge: 2, run: petPlay }),
  walk: (): Def => ({ id: 'walk', label: 'Walk', emoji: '\u{1F9AE}', minAge: 8, show: (_g, p) => ['Dog', 'Pig', 'Goat', 'Ferret', 'Wolf', 'Fox'].includes(p.species ?? ''), run: petWalk }),
  treat: (): Def => ({ id: 'treat', label: 'Treat', emoji: '\u{1F9B4}', minAge: 2, run: petTreat }),
  bathe: (): Def => ({ id: 'bathe', label: 'Bathe', emoji: '\u{1F6C1}', minAge: 6, show: (_g, p) => !['Fish', 'Snake', 'Lizard', 'Turtle', 'Bird', 'Parrot', 'Hamster'].includes(p.species ?? ''), run: petBathe }),
  ride: (): Def => ({ id: 'ride', label: 'Ride', emoji: '\u{1F40E}', minAge: 8, show: (_g, p) => p.species === 'Horse' && p.age >= 3, run: petRide }),
  vet: (): Def => ({ id: 'vet', label: 'Veterinarian', emoji: '\u{1FA7A}', minAge: 4, subtitle: (g, p) => (pStrData(p, 'sick') ? `${p.firstName} has been acting strange` : g.character.age >= 18 ? 'Checkup ($80-$400)' : 'Checkup'), run: petVet }),
  rename: (): Def => ({
    id: 'rename',
    label: 'Rename',
    emoji: '\u{270F}\u{FE0F}',
    minAge: 6,
    check: (g, p) => (g.character.age < 18 && isFamilyPet(g, p) ? 'Your parents named this pet. It stays.' : null),
    input: { kind: 'text', label: 'New name', placeholder: 'Sir Barksalot' },
    run: (g, p, input) => {
      const name = sanitizeName(input ?? '', p.firstName)
      if (name === p.firstName) return
      const old = p.firstName
      p.firstName = name
      notice(g, 'Rename', `${old} is now known as ${name}. ${pr(p).He} doesn't seem to care.`, { emoji: '\u{270F}\u{FE0F}' })
    },
  }),
  rehome: (): Def => ({
    id: 'rehome',
    label: 'Return to Shelter',
    emoji: '\u{1F3DA}\u{FE0F}',
    minAge: 6,
    check: (g, p) => (g.character.age < 18 && isFamilyPet(g, p) ? "It's the family pet. Your parents would never allow it." : null),
    confirm: (_g, p) => `Give ${p.firstName} up to a shelter? Shelters may refuse to give you another pet.`,
    run: (g, p) => {
      removePerson(g, p.id)
      g.flags.petBan = true
      addHidden(g, 'karma', -3)
      addStat(g, 'happiness', -randInt(g, 1, 4))
      log(g, `I gave up my ${labelOf(p)} ${p.firstName} to a shelter.`, 'bad')
      notice(g, 'Return to Shelter', `You dropped ${p.firstName} off at the shelter. ${pr(p).He} looked back at you through the glass door.`, { emoji: '\u{1F622}' })
    },
  }),
  release: (): Def => ({
    id: 'release',
    label: 'Release into the Wild',
    emoji: '\u{1F332}',
    minAge: 10,
    check: (g, p) => (g.character.age < 18 && isFamilyPet(g, p) ? "It's the family pet. Your parents would never allow it." : null),
    confirm: (_g, p) => `Release ${p.firstName} into the wild?`,
    run: (g, p) => {
      const exotic = p.data.exotic === true
      removePerson(g, p.id)
      addHidden(g, 'karma', exotic ? -6 : -3)
      log(g, `I released my ${labelOf(p)} ${p.firstName} into the wild.`, 'bad')
      notice(g, 'Released', exotic ? `You released ${p.firstName} into the wild. The local news is now reporting ${pick(g, ['a "large animal" in a shopping mall', 'a mysterious creature eating garden gnomes', 'panic at the dog park'])}.` : `You released ${p.firstName} into the wild. Good luck out there, buddy.`, { emoji: '\u{1F332}' })
    },
  }),
  // Deceased
  grave: (): Def => ({
    id: 'grave',
    label: 'Visit Grave',
    emoji: '\u{1FAA6}',
    minAge: 6,
    run: (g, p) => {
      if (!limit(g, p, 'grave', 1, 'Visit Grave')) return
      addStat(g, 'happiness', randInt(g, 1, 4))
      addHidden(g, 'karma', 1)
      log(g, `I visited ${myRel(p)}'s grave.`)
      notice(g, 'Visit Grave', `You visited ${p.firstName}'s grave ${pick(g, ['and left fresh flowers.', 'and told them about your year.', 'and sat quietly for a while.', 'and cleaned the leaves off the headstone.'])}`, { emoji: '\u{1FAA6}' })
    },
  }),
  reminisce: (): Def => ({
    id: 'reminisce',
    label: 'Reminisce',
    emoji: '\u{1F4F7}',
    minAge: 4,
    prisonOk: true,
    run: (g, p) => {
      if (!limit(g, p, 'reminisce', 1, 'Reminisce')) return
      const smile = chance(g, 0.6)
      addStat(g, 'happiness', smile ? randInt(g, 2, 5) : -randInt(g, 1, 3))
      notice(g, 'Reminisce', `You looked through old photos of ${p.firstName}. ${smile ? 'You smiled the whole time.' : 'You had a good cry.'}`, { emoji: '\u{1F4F7}' })
    },
  }),
}

function defsFor(g: GameState, p: Person): Def[] {
  if (!p.alive) return [D.grave(), D.reminisce()]
  if (p.relation === 'pet') return [D.play(), D.walk(), D.treat(), D.bathe(), D.ride(), D.vet(), D.rename(), D.rehome(), D.release()]
  if (p.data.disowned === true) return [D.reconnect(), D.gift()]
  const c = g.character
  switch (p.relation) {
    case 'parent':
    case 'stepparent':
      return [D.askMoney(), D.homework(), D.compliment(), D.conversation(), D.gift(), D.giveMoney(), D.hug(), D.movie(), D.prank(), D.spendTime(), D.vacation(), D.argue(), D.insult(), D.assault()]
    case 'grandparent':
      return [D.askMoney(), D.compliment(), D.conversation(), D.gift(), D.giveMoney(), D.hug(), D.movie(), D.prank(), D.spendTime(), D.vacation(), D.insult(), D.assault()]
    case 'sibling':
    case 'halfSibling':
    case 'stepsibling':
      return [D.compliment(), D.conversation(), D.gift(), D.giveMoney(), D.hug(), D.movie(), D.prank(), D.spendTime(), D.vacation(), D.squabble(), D.insult(), D.assault('Rumble')]
    case 'child':
    case 'stepchild':
      return [
        D.spendTime(),
        D.conversation(),
        D.compliment(),
        D.gift(),
        D.hug(),
        D.story(),
        ...(p.age >= 18 ? [D.askMoney()] : []),
        D.giveMoney(),
        D.movie(),
        D.vacation(),
        D.prank(),
        D.argue(),
        D.insult(),
        ...(p.age >= 18 ? [D.assault()] : []),
        D.disown(),
      ]
    case 'grandchild':
      return [D.spendTime(), D.conversation(), D.compliment(), D.gift(), D.giveMoney(), D.hug(), D.story(), D.movie(), D.insult()]
    case 'partner':
    case 'fiance':
    case 'spouse':
      return [
        D.spendTime(),
        D.dateNight(),
        D.conversation(),
        D.compliment(),
        D.flirt(),
        D.gift(),
        D.giveMoney(),
        D.makeLove(),
        D.tryBaby(),
        D.birthControl(),
        D.movie(),
        D.vacation(),
        D.counseling(),
        D.propose(),
        D.wedding(),
        D.elope(),
        D.cancelEngagement(),
        D.renewVows(),
        D.prank(),
        D.argue(),
        D.insult(),
        D.assault(),
        D.breakUp(),
        D.divorce(),
      ]
    case 'friend':
    case 'bestFriend':
      return [
        D.spendTime(),
        D.conversation(),
        D.compliment(),
        D.gift(),
        D.party(),
        D.concert(),
        D.videos(),
        D.prank(),
        D.rumor(),
        D.flirt(),
        D.askOut(),
        D.hookUp(),
        ...(p.relation === 'friend' ? [D.bestFriend()] : []),
        D.insult(),
        D.assault(),
        D.unfriend(),
      ]
    case 'classmate':
      return [D.befriend(), D.compliment(), D.conversation(), D.spendTime(), D.gift(), D.prank(), D.rumor(), D.flirt(), D.askOut(), D.insult(), D.assault()]
    case 'teacher':
      return [D.befriend(), D.compliment(), D.conversation(), D.gift(), D.prank(), D.insult(), D.assault()]
    case 'coworker':
      return [D.befriend(), D.compliment(), D.conversation(), D.spendTime(), D.gift(), D.prank(), D.flirt(), D.askOut(), D.insult(), D.assault()]
    case 'boss':
      return [{ ...D.compliment(), label: 'Suck Up', emoji: '\u{1F445}' }, D.conversation(), D.befriend(), D.gift(), D.prank(), D.askOut(), D.insult(), D.assault()]
    case 'ex':
    case 'exSpouse':
      return [D.conversation(), D.compliment(), D.gift(), D.getBack(), ...(p.data.fling === true && c.age >= 18 ? [D.hookUp()] : []), D.insult(), D.deleteContact()]
    case 'lover':
      return [D.spendTime(), D.conversation(), D.compliment(), D.flirt(), D.gift(), D.makeLove(), D.leaveFor(), D.endAffair()]
    case 'cellmate':
      return [D.befriend(), D.conversation(), D.compliment(), D.insult(), D.assault()]
    case 'enemy':
      return [D.makePeace(), D.conversation(), D.insult(), D.prank(), D.rumor(), D.assault()]
  }
}

function statusInfo(g: GameState, p: Person): MenuInfo | null {
  const c = g.character
  const id = 'status'
  if (!p.alive) {
    const diedAge = pNum(p, 'diedAge', -1)
    return { type: 'info', id, emoji: '\u{1FAA6}', text: `Died at age ${p.age}${p.causeOfDeath ? ` (${p.causeOfDeath})` : ''}${diedAge >= 0 ? `, when you were ${diedAge}` : ''}.` }
  }
  if (p.relation === 'pet') {
    const sick = pStrData(p, 'sick')
    return { type: 'info', id, emoji: '\u{1F43E}', text: `${p.breed ?? p.species ?? 'Pet'} · Age ${p.age} · Health ${p.stats.health}% · Craziness ${pNum(p, 'craziness', 30)}%${sick ? ' · Acting strange lately' : ''}` }
  }
  const parts: string[] = []
  if (p.pregnant) parts.push('\u{1F930} Expecting a baby next year')
  if (p.relation === 'spouse') parts.push(`Married ${c.age - pNum(p, 'marriedAge', c.age)} years${p.data.prenup === true ? ' · Prenup signed' : ''}`)
  if (p.relation === 'fiance') parts.push(`Engaged ${c.age - pNum(p, 'engagedAge', c.age)} years${typeof p.data.ring === 'string' ? ` · ${p.data.ring}` : ''}`)
  if (p.relation === 'partner') parts.push(`Dating ${c.age - pNum(p, 'datingSince', c.age)} years`)
  if (p.data.fling === true) parts.push('Former fling')
  if (p.data.babyParent === true) parts.push('Parent of your child')
  if (p.data.disowned === true) parts.push('Disowned')
  if (p.data.adopted === true) parts.push('Adopted')
  if (p.data.married === true && typeof p.data.spouseName === 'string' && !isRomantic(p)) parts.push(`Married to ${p.data.spouseName}`)
  // "Lives with you" is shown as a chip in the person sheet header, so it isn't repeated here.
  if (!parts.length) return null
  return { type: 'info', id, emoji: '\u{2139}\u{FE0F}', text: parts.join(' · ') }
}

/** The interaction list for one person on the Relationships screen. */
export function personActions(g: GameState, person: Person): MenuNode[] {
  const c = g.character
  const p = getPerson(g, person.id) ?? person
  if (!c.alive) return [{ type: 'info', id: 'dead', emoji: '\u{1FAA6}', text: 'You are dead. The living will have to carry on without you.' }]
  const nodes: MenuNode[] = []
  const info = statusInfo(g, p)
  if (info) nodes.push(info)
  if (c.age < 2) {
    nodes.push({ type: 'info', id: 'baby', emoji: '\u{1F476}', text: "You're a baby. Your interactions are limited to crying, drooling and staring." })
    return nodes
  }
  if (inPrison(g) && p.relation !== 'cellmate' && p.alive) {
    nodes.push({ type: 'info', id: 'prison', emoji: '\u{1F4DE}', text: "You're in prison. You can only talk on the phone." })
  }
  for (const def of defsFor(g, p)) nodes.push(build(def, p.id))
  return nodes
}
