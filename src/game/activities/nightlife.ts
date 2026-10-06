// Nightlife: nightclubs (with bouncers), bars and house parties. A night out can bring
// drinks, drugs (with real consequences), fights and romance.
//
// The night out follows the decade: jazz-age dance halls, speakeasies during US Prohibition
// (1920-1933), big-band supper clubs, sixties discotheques, seventies discos, then today's
// nightclubs with DJs. Cocktails, drugs, karaoke and pub trivia only appear once they existed.
import { arrestPlayer } from '../crime'
import { killCharacter } from '../death'
import {
  addHidden,
  addMoney,
  addRelationship,
  addStat,
  attractedTo,
  count,
  currentPartner,
  log,
  notice,
  remember,
  scriptChoice,
  useYearAction,
} from '../core'
import { notePerson } from '../people'
import { chance, pick, randInt, weightedPick } from '../rng'
import { defineScript } from '../scripts'
import { isAlcoholic, locale } from '../data/locales'
import { randomFirstName, randomLastName } from '../world'
import type { GameState, Gender, Json, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { common, declined, eraLines, eraPick, landline, prohibition } from '../events/era'
import {
  addCondition,
  addGrievance,
  brokeNotice,
  canRomance,
  countryOf,
  gate,
  isAbroad,
  localPrice,
  meetPerson,
  money,
  result,
  rollAddiction,
  say,
  stablePick,
  strangerAge,
  strangerGender,
} from './common'

const NIGHT_MAX = 4

/** Where alcohol is banned or off-limits to most people: nights out happen in cafés and shisha lounges. */
const DRY = new Set(['sa', 'kw', 'ir', 'af', 'pk', 'bd'])

export function dryCountry(g: GameState): boolean {
  return DRY.has(g.character.countryId)
}

export function nightlifeAge(g: GameState): number {
  if (dryCountry(g)) return 18
  return Math.max(18, countryOf(g).drinkingAge ?? 18)
}

function nightGate(g: GameState): string | null {
  const age = nightlifeAge(g)
  return gate(g, { minAge: age, minAgeText: dryCountry(g) ? `You must be at least ${age} to go out at night in ${countryOf(g).name}.` : `You must be at least ${age} to go out drinking in ${countryOf(g).name}.` })
}

function tooHungover(g: GameState): boolean {
  if (useYearAction(g, 'act.nightlife', NIGHT_MAX)) return false
  result(g, 'Hungover', pick(g, [
    "You're too hungover to go out again this year.",
    'Your liver has requested a restraining order. No more nights out this year.',
    "You've partied enough for one year. Your bed misses you.",
  ]), '\u{1F974}')
  return true
}

// ---------------------------------------------------------------------------
// Venues

const CLUB_NAMES = [
  'Club Neon',
  'The Velvet Room',
  'Pulse',
  'Electric Avenue',
  'Club Paradox',
  'The Basement',
  'Midnight Garden',
  'Club Vortex',
  'Prism',
  'The Warehouse',
  'Afterglow',
  'Club Euphoria',
  'Static',
  'The Glass House',
  'Moonshine',
  'Club Mirage',
  'Bassline',
  'Night Owl',
  'The Loft',
  'Club Hypnotic',
  'The Velvet Cellar',
  'The Gilded Cage',
  'Strobe',
  'Club Nova',
]

interface Club {
  name: string
  tier: 1 | 2 | 3
}

/** What a night on the town was called this year, and what made the noise. */
function scene(g: GameState): { heading: string; kind: string; music: string } {
  const y = g.year
  if (prohibition(g)) return { heading: 'Speakeasies', kind: 'speakeasy', music: 'the jazz band' }
  if (y < 1930) return { heading: 'Dance Halls', kind: 'dance hall', music: 'the jazz band' }
  if (y < 1960) return { heading: 'Nightclubs', kind: 'supper club', music: 'the big band' }
  if (y < 1975) return { heading: 'Discotheques', kind: 'discotheque', music: 'the band' }
  if (y < 1986) return { heading: 'Discos', kind: 'disco', music: 'the DJ' }
  return { heading: 'Nightclubs', kind: 'club', music: 'the DJ' }
}

function clubsThisYear(g: GameState): Club[] {
  const names = stablePick(g, 'clubs', CLUB_NAMES, 3)
  const tiers: (1 | 2 | 3)[] = stablePick(g, 'clubTiers', [1, 2, 3] as (1 | 2 | 3)[], 3)
  return names.map((name, i) => ({ name, tier: tiers[i] }))
}

function coverCharge(g: GameState, tier: 1 | 2 | 3): number {
  return localPrice(g, tier === 1 ? 10 : tier === 2 ? 25 : 60)
}

function bouncerSaysNo(g: GameState, club: Club): string | null {
  const c = g.character
  if (c.hidden.fame >= 50) return null
  if (club.tier === 3 && (c.stats.looks < 60 || c.age > 40)) {
    return c.age > 40
      ? `The bouncer took one look at you and asked if you were lost. "This is a ${scene(g).kind}, not a bingo hall." Ouch.`
      : 'The bouncer looked you up and down and said "Not tonight." You heard someone in line snicker.'
  }
  if (club.tier === 2 && (c.stats.looks < 35 || c.age > 55)) {
    return c.age > 55 ? 'The bouncer said the club has a strict "no grandparents" policy.' : 'The bouncer said your outfit "violates the dress code." It was a nice outfit.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Drinks

// Era tags (see events/era.ts): the Cosmopolitan is an eighties drink, bathtub gin a twenties one.
const DRINKS = ['Beer', 'Wine', '@1950 Vodka Soda', '@1938 Margarita', 'Mojito', 'Tequila Shot', 'Gin & Tonic', 'Whiskey Sour', '@1988 Cosmopolitan', '@1972 Long Island Iced Tea', '@1954 Piña Colada', '@1941 Moscow Mule', 'Champagne', 'Rum & Coke', '@-1934 Bathtub Gin', '@-1960 Sidecar']

const BLACKOUT_PLACES = ['in a bathtub', 'on a stranger’s couch', '@1950 at a 24-hour diner holding a waffle', '@1915 in the back of a taxi', 'in your neighbor’s yard', 'wearing someone else’s jacket']

/** Drink alcohol: fun now, consequences later (may kill a very unhealthy drinker). */
function drinkAlcohol(g: GameState, drink: string, venue: string): void {
  const c = g.character
  count(g, 'drinks')
  addStat(g, 'happiness', randInt(g, 2, 6))
  addStat(g, 'health', -randInt(g, 0, 3))
  const alcoholic = !!c.conditions.find((x) => x.name === 'Alcoholism')
  if (chance(g, alcoholic ? 0.02 : 0.005) || (c.stats.health < 10 && chance(g, 0.1))) {
    addStat(g, 'health', -randInt(g, 12, 20))
    if (c.stats.health <= 5) {
      log(g, `I drank way too much at ${venue}.`, 'bad')
      notice(g, 'Alcohol Poisoning', `You kept ordering ${drink.toLowerCase()}s long after you should have stopped. Your body couldn't take it.`, { emoji: '\u{1F480}', tone: 'bad' })
      killCharacter(g, 'Alcohol Poisoning')
      return
    }
    log(g, `I got alcohol poisoning at ${venue} and had my stomach pumped.`, 'bad')
    result(g, 'Alcohol Poisoning', `You drank so much that your friends called an ambulance. You spent the night having your stomach pumped. Not your finest hour.`, '\u{1F691}', 'bad')
    return
  }
  const addicted = rollAddiction(g, 'Alcoholism', 0.06)
  if (chance(g, 0.07)) {
    const places = eraLines(g, BLACKOUT_PLACES)
    const place = pick(g, g.character.countryId === 'us' ? places : places.map((p) => (p.includes('diner') ? 'at a 24-hour food stall holding a skewer' : p)))
    addStat(g, 'health', -2)
    log(g, `I blacked out at ${venue} and woke up ${place}.`, 'bad')
    result(g, 'Blackout', `You had one ${drink.toLowerCase()} too many and blacked out. You woke up ${place} with no memory of how you got there.${addicted ? '\n\nYou realize you may be drinking a little too often.' : ''}`, '\u{1F635}\u{200D}\u{1F4AB}', 'bad')
    return
  }
  log(g, `I had a few ${drink.toLowerCase()}s at ${venue}.`, 'neutral')
  result(g, drink, `${pick(g, [
    `You sipped your ${drink.toLowerCase()} and felt the stress of the week melt away.`,
    `The ${drink.toLowerCase()} was strong. You suddenly believed you could sing.`,
    `You had a couple of ${drink.toLowerCase()}s and danced like nobody was watching. Everybody was watching.`,
  ])}${addicted ? "\n\nLately you've been craving a drink more than you'd like to admit." : ''}`, '\u{1F378}')
}

const DRINK_OFFER = defineScript('act.night.drinkOffer', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const venue = typeof d.venue === 'string' ? d.venue : 'the club'
  const drink = typeof d.drink === 'string' ? d.drink : 'Beer'
  if (choice === 'accept') {
    drinkAlcohol(g, drink, venue)
    return
  }
  addHidden(g, 'willpower', 1)
  log(g, `I turned down a free drink at ${venue}.`, 'neutral')
  result(g, 'No Thanks', pick(g, [
    'You politely declined and ordered a water. Your future self says thank you.',
    'You said no thanks. The stranger shrugged and drank it themselves.',
  ]), '\u{1F6B0}')
})

// ---------------------------------------------------------------------------
// Drugs (consequences, not glamour)

interface DrugDef {
  name: string
  /** Years it was around on the party scene. */
  since?: number
  until?: number
  addiction: number
  overdose: number
  enlighten: number
  health: [number, number]
  happiness: [number, number]
}

const DRUGS: DrugDef[] = [
  { name: 'Marijuana', addiction: 0.05, overdose: 0, enlighten: 0.3, health: [-3, 0], happiness: [1, 5] },
  { name: 'Magic Mushrooms', addiction: 0.02, overdose: 0.002, enlighten: 0.35, health: [-4, -1], happiness: [-6, 6], since: 1960 },
  { name: 'Ecstasy', addiction: 0.12, overdose: 0.008, enlighten: 0, health: [-7, -2], happiness: [-2, 6], since: 1985 },
  { name: 'Cocaine', addiction: 0.2, overdose: 0.012, enlighten: 0, health: [-9, -3], happiness: [-2, 5] },
  { name: 'Acid', addiction: 0.03, overdose: 0.004, enlighten: 0.25, health: [-5, -1], happiness: [-8, 6], since: 1962 },
  { name: 'Opium', addiction: 0.18, overdose: 0.01, enlighten: 0.1, health: [-8, -2], happiness: [-3, 6], until: 1950 },
  { name: 'Pep Pills', addiction: 0.1, overdose: 0.004, enlighten: 0, health: [-5, -1], happiness: [0, 5], since: 1945, until: 1975 },
]

function drugsNow(g: GameState): DrugDef[] {
  return DRUGS.filter((d) => g.year >= (d.since ?? 0) && g.year < (d.until ?? 99999))
}

function useDrug(g: GameState, drug: DrugDef, venue: string): void {
  const c = g.character
  count(g, 'drugs')
  const prior = g.counters.drugs ?? 1
  let od = drug.overdose * (c.stats.health < 30 ? 3 : 1) * (1 + prior / 10)
  if (findAddiction(g, drug.name)) od *= 2
  if (od > 0 && chance(g, od)) {
    g.flags.overdosed = true
    log(g, `I tried ${drug.name.toLowerCase()} at ${venue}.`, 'bad')
    notice(g, 'Overdose', `You took the ${drug.name.toLowerCase()}. Within minutes your heart was racing out of control. By the time the ambulance arrived, it was too late.`, { emoji: '\u{1F480}', tone: 'bad' })
    killCharacter(g, 'Drug Overdose')
    return
  }
  addStat(g, 'health', randInt(g, drug.health[0], drug.health[1]))
  const mood = randInt(g, drug.happiness[0], drug.happiness[1])
  addStat(g, 'happiness', mood)
  addHidden(g, 'karma', -1)
  const addicted = rollAddiction(g, `${drug.name} Addiction`, drug.addiction)
  const tail = addicted ? `\n\nA few days later you caught yourself thinking about ${drug.name.toLowerCase()} again. That can't be good.` : ''
  if (drug.enlighten && chance(g, drug.enlighten)) {
    addStat(g, 'smarts', randInt(g, 2, 5))
    log(g, `I tried ${drug.name.toLowerCase()} at ${venue} and had a strange revelation.`, 'neutral')
    result(g, 'Enlightened?', `You tried ${drug.name.toLowerCase()} and spent three hours explaining the meaning of the universe to a houseplant. Some of it actually made sense.${tail}`, '\u{1F300}')
    return
  }
  if (mood < 0) {
    log(g, `I had a terrible time on ${drug.name.toLowerCase()} at ${venue}.`, 'bad')
    result(g, 'Bad Trip', `${pick(g, [
      `The ${drug.name.toLowerCase()} hit you all wrong. You spent the night convinced the walls were judging you.`,
      `You tried ${drug.name.toLowerCase()} and felt awful. Paranoid, nauseous and miserable. Never again. Probably.`,
    ])}${tail}`, '\u{1F635}', 'bad')
    return
  }
  log(g, `I tried ${drug.name.toLowerCase()} at ${venue}.`, 'bad')
  result(g, drug.name, `${pick(g, [
    `You tried ${drug.name.toLowerCase()}. The night was a blur, and the next morning felt like a truck had parked on your head.`,
    `You took the ${drug.name.toLowerCase()}. Your heart pounded for hours and you couldn't sleep until sunrise.`,
    `You tried ${drug.name.toLowerCase()}. For a few hours everything felt amazing. The comedown did not.`,
  ])}${tail}`, '\u{1F48A}', 'bad')
}

function findAddiction(g: GameState, drug: string) {
  return g.character.conditions.find((x) => x.kind === 'addiction' && x.name.toLowerCase().startsWith(drug.toLowerCase()))
}

const DRUG_OFFER = defineScript('act.night.drugOffer', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const venue = typeof d.venue === 'string' ? d.venue : 'the club'
  const drug = DRUGS.find((x) => x.name === d.drug) ?? DRUGS[0]
  if (choice === 'try') {
    useDrug(g, drug, venue)
    return
  }
  if (choice === 'report') {
    if (chance(g, 0.75)) {
      addHidden(g, 'karma', 4)
      log(g, `I reported a drug dealer at ${venue}.`, 'good')
      result(g, 'Snitch', `You told security. They dragged the dealer out by the collar. ${g.year >= 1975 ? 'The DJ' : 'The bandleader'} gave you a shout-out.`, '\u{1F46E}', 'good')
    } else {
      addStat(g, 'health', -randInt(g, 4, 10))
      addGrievance(g, { kind: 'assailant', name: `A drug dealer at ${venue}`, strength: 55, detail: 'beat you up for reporting them' })
      log(g, `A drug dealer beat me up at ${venue} for reporting him.`, 'bad')
      result(g, 'Snitches Get...', 'Security ignored you, and the dealer saw you pointing. He caught you outside and punched you in the face.', '\u{1F915}', 'bad')
    }
    return
  }
  addHidden(g, 'willpower', 2)
  addHidden(g, 'karma', 1)
  log(g, `I turned down ${drug.name.toLowerCase()} at ${venue}.`, 'good')
  result(g, 'Just Say No', pick(g, [
    `You said no to the ${drug.name.toLowerCase()}. Good call. Your organs send their thanks.`,
    `You passed on the ${drug.name.toLowerCase()} and went back to dancing. You'll remember this night, at least.`,
  ]), '\u{1F645}', 'good')
})

// ---------------------------------------------------------------------------
// Confrontations

const CONFRONT_REASONS = [
  'You accidentally bumped into {name} and spilled {his} drink all over {his} shoes.',
  '{name} is convinced you were staring at {his} date.',
  '{name} says you cut in line for the bathroom.',
  '{name} did not appreciate your dance moves and is making that very clear.',
  '{name} says you stole {his} spot at the bar.',
  '{name} thinks you look like the person who keyed {his} car.',
]

const CONFRONT = defineScript('act.night.confront', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const venue = typeof d.venue === 'string' ? d.venue : 'the club'
  const name = typeof d.name === 'string' ? d.name : 'A stranger'
  const he = d.gender === 'female' ? 'she' : 'he'
  const him = d.gender === 'female' ? 'her' : 'him'
  if (choice === 'walk') {
    addHidden(g, 'karma', 2)
    log(g, `I walked away from a fight with ${name} at ${venue}.`, 'neutral')
    result(g, 'Walked Away', `You put your hands up and walked away. ${name} yelled something about your mother, but you kept your cool.`, '\u{1F6B6}')
    return
  }
  if (choice === 'argue') {
    count(g, 'nightlifeArguments')
    if (chance(g, 0.5)) {
      addStat(g, 'happiness', randInt(g, 1, 3))
      log(g, `I argued with ${name} at ${venue} until ${he} backed off.`, 'neutral')
      result(g, 'Argument', `You stood your ground and told ${name} off. ${capitalizeWord(he)} muttered something and stomped away.`, '\u{1F5E3}\u{FE0F}')
      return
    }
    hurtPlayer(g, venue, name, him, true)
    return
  }
  // Assault them.
  count(g, 'fights')
  addHidden(g, 'karma', -5)
  const roll = randInt(g, 1, 100)
  if (roll <= 40) {
    addStat(g, 'happiness', randInt(g, 1, 4))
    log(g, `I punched ${name} at ${venue}.`, 'bad')
    result(g, 'Knockout', `You threw one punch and ${name} hit the floor. ${capitalizeWord(he)} didn't get back up until you'd left.`, '\u{1F44A}')
    return
  }
  if (roll <= 78) {
    log(g, `I got into a fistfight with ${name} at ${venue}.`, 'bad')
    hurtPlayer(g, venue, name, him, false)
    return
  }
  log(g, `I assaulted ${name} at ${venue}, and the police were called.`, 'bad')
  notice(g, 'Police!', `You swung at ${name}, but security tackled you and the police were already outside.`, { emoji: '\u{1F6A8}', tone: 'bad' })
  arrestPlayer(g, 'Assault', 1)
})

function capitalizeWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function hurtPlayer(g: GameState, venue: string, name: string, him: string, provokedByThem: boolean): void {
  const dmg = randInt(g, 5, 15)
  addStat(g, 'health', -dmg)
  addStat(g, 'happiness', -randInt(g, 2, 6))
  if (dmg >= 10) addCondition(g, pick(g, ['Black Eye', 'Broken Nose', 'Bruised Ribs']), 'injury', randInt(g, 5, 12))
  if (provokedByThem) {
    addGrievance(g, { kind: 'assailant', name, strength: 70, detail: `assaulted you at ${venue}` })
    log(g, `${name} assaulted me at ${venue}.`, 'bad')
  }
  if (g.character.stats.health <= 0) {
    notice(g, 'Fatal Fight', `${name} hit you harder than anyone ever has. You never got up.`, { emoji: '\u{1F480}', tone: 'bad' })
    killCharacter(g, 'Bar Fight')
    return
  }
  result(g, 'Beat Up', provokedByThem
    ? `You argued back, and ${name} punched you in the face. You could sue ${him} for that.`
    : `${name} fought back hard. You both got bloodied before security pulled you apart.`, '\u{1F915}', 'bad')
}

// ---------------------------------------------------------------------------
// Romance

const FLIRT = defineScript('act.night.flirt', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const venue = typeof d.venue === 'string' ? d.venue : 'the club'
  const name = typeof d.name === 'string' ? d.name : 'Someone'
  if (choice === 'ignore') {
    log(g, `I ignored ${name}, who was flirting with me at ${venue}.`, 'neutral')
    result(g, 'Not Interested', `You turned away from ${name}. ${pick(g, ['They found someone else to stare at within minutes.', 'They looked crushed. Then they ordered a shot.'])}`, '\u{1F645}')
    return
  }
  if (choice === 'drink') {
    const cost = localPrice(g, 15)
    if (g.character.money < cost) {
      log(g, `I tried to buy ${name} a drink but couldn't afford it.`, 'bad')
      result(g, 'Embarrassing', `${declined(g)} You couldn't buy ${name} a drink. ${name} paid for their own and walked away.`, '\u{1F4B3}', 'bad')
      return
    }
    addMoney(g, -cost)
  }
  const c = g.character
  const p = 0.4 + (c.stats.looks - 50) / 120 + (choice === 'drink' ? 0.1 : 0)
  if (!chance(g, p)) {
    addStat(g, 'happiness', -randInt(g, 1, 3))
    log(g, `${name} lost interest in me at ${venue}.`, 'neutral')
    result(g, 'Fizzled', choice === 'drink' ? `${name} took the drink, said "thanks!" and went right back to their friends.` : `You danced with ${name} for exactly one song before they vanished into the crowd.`, '\u{1F937}')
    return
  }
  const partner = currentPartner(g)
  const him = d.gender === 'male' ? 'him' : 'her'
  const choices = partner
    ? [
        { id: 'home', label: `Go home with ${him} (cheat on ${partner.firstName})`, emoji: '\u{1F525}' },
        { id: 'number', label: `Get ${d.gender === 'male' ? 'his' : 'her'} ${landline(g) ? 'number' : 'address'} as a friend`, emoji: '\u{1F4F1}' },
        { id: 'bye', label: 'Say goodnight', emoji: '\u{1F44B}' },
      ]
    : [
        { id: 'home', label: `Go home with ${him}`, emoji: '\u{1F525}' },
        { id: 'date', label: `Ask ${him} out`, emoji: '\u{1F498}' },
        { id: 'bye', label: 'Say goodnight', emoji: '\u{1F44B}' },
      ]
  scriptChoice(g, FLIRT2, 'Chemistry', `${say(g, [
    'You and {name} danced until the lights came on. {He} leans in and asks what you want to do next.',
    "{name} can't stop laughing at your jokes. {He} asks if you want to get out of here.",
    'The chemistry between you and {name} is undeniable. The night is young.',
  ], { name, He: d.gender === 'male' ? 'He' : 'She' })}`, choices, { emoji: '\u{1F60D}', data: d })
})

const FLIRT2 = defineScript('act.night.flirt2', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const venue = typeof d.venue === 'string' ? d.venue : 'the club'
  const gender: Gender = d.gender === 'male' ? 'male' : 'female'
  const age = typeof d.age === 'number' ? d.age : strangerAge(g)
  const firstName = typeof d.name === 'string' ? d.name : undefined
  const lastName = typeof d.lastName === 'string' ? d.lastName : undefined
  if (choice === 'bye') {
    log(g, `I said goodnight to ${firstName ?? 'my new crush'} at ${venue}.`, 'neutral')
    result(g, 'Goodnight', `You said goodnight to ${firstName}. A little mystery never hurt anyone.`, '\u{1F44B}')
    return
  }
  if (choice === 'number') {
    const p = meetPerson(g, 'friend', venue, { gender, age, firstName, lastName })
    const swap = landline(g) ? 'numbers' : 'addresses'
    log(g, `I swapped ${swap} with ${p.firstName} at ${venue}.`, 'neutral')
    result(g, 'New Friend', `You swapped ${swap} with ${p.firstName}. Strictly as friends. You're spoken for, after all.`, '\u{1F4F1}')
    return
  }
  if (choice === 'date') {
    const p = meetPerson(g, 'partner', venue, { gender, age, firstName, lastName, relationship: randInt(g, 55, 75) })
    if (p.relation === 'partner') {
      log(g, `I started dating ${p.firstName}, who I met at ${venue}.`, 'good')
      addStat(g, 'happiness', randInt(g, 4, 8))
      result(g, 'New Relationship', `${p.firstName} said yes! You two are officially dating.`, '\u{1F498}', 'good')
    } else {
      log(g, `I made a new friend, ${p.firstName}, at ${venue}.`, 'neutral')
      result(g, 'Friend Zone', `${p.firstName} likes you, just not like that. You're friends now.`, '\u{1F91D}')
    }
    return
  }
  // Go home together.
  const partner = currentPartner(g)
  const p = meetPerson(g, 'lover', venue, { gender, age, firstName, lastName, relationship: randInt(g, 50, 70) })
  count(g, 'hookups')
  notePerson(p, 'Hooked up with the player after a night out.')
  addStat(g, 'happiness', randInt(g, 4, 9))
  if (partner) {
    count(g, 'cheated')
    p.data.affairWith = partner.id
    log(g, `I cheated on ${partner.firstName} with ${p.firstName}, who I met at ${venue}.`, 'bad')
    if (chance(g, 0.25)) {
      addRelationship(partner, -randInt(g, 25, 40))
      notePerson(partner, `Caught the player cheating with ${p.firstName}.`)
      remember(g, `${partner.firstName} caught me cheating with ${p.firstName}.`)
      notice(g, 'Busted!', `${partner.firstName} found out you went home with ${p.firstName}. ${partner.firstName} is absolutely furious.`, { emoji: '\u{1F494}', tone: 'bad' })
    }
  } else {
    log(g, `I went home with ${p.firstName}, who I met at ${venue}.`, 'neutral')
  }
  scriptChoice(g, PROTECTION, 'Be Safe?', `You and ${p.firstName} went back to ${pick(g, ['your place', `${p.firstName}'s place`])}. Before things go any further...`, [
    { id: 'safe', label: 'Use protection', emoji: '\u{1F6E1}\u{FE0F}' },
    { id: 'risk', label: 'Risk it', emoji: '\u{1F3B2}' },
  ], { emoji: '\u{1F319}', data: { personId: p.id } })
})

const STDS = ['Chlamydia', 'Gonorrhea', 'Herpes', 'Syphilis']

const PROTECTION = defineScript('act.night.protection', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const p = g.people.find((x) => x.id === d.personId)
  const name = p?.firstName ?? 'your date'
  if (choice === 'safe') {
    result(g, 'Safety First', `You played it safe with ${name}. What happens next is between the two of you.`, '\u{1F319}')
    return
  }
  if (chance(g, 0.15)) {
    const std = pick(g, STDS)
    addCondition(g, std, 'std', randInt(g, 10, 25), { curable: std !== 'Herpes', diagnosed: false })
  }
  addHidden(g, 'karma', -1)
  result(g, 'Living Dangerously', `You threw caution to the wind with ${name}. Let's hope that doesn't come back to haunt you.`, '\u{1F319}')
})

// ---------------------------------------------------------------------------
// The night out

type Venue = 'club' | 'bar' | 'party'

function stranger(g: GameState): { name: string; lastName: string; gender: Gender; age: number } {
  const gender = strangerGender(g, false)
  return {
    name: randomFirstName(g, g.character.countryId, gender),
    lastName: randomLastName(g, g.character.countryId),
    gender,
    age: strangerAge(g, 8),
  }
}

function nightEvent(g: GameState, kind: Venue, venue: string, intro: string): void {
  const c = g.character
  const romance = canRomance(g)
  const event = weightedPick(
    g,
    ['drink', 'drugs', 'confront', 'romance', 'dance', 'quiet', 'pickpocket', 'celebrity', 'karaoke', 'trivia', 'raid'] as const,
    (e) => {
      switch (e) {
        case 'drink':
          return kind === 'bar' || dryCountry(g) ? 0 : 22
        case 'drugs':
          return kind === 'bar' ? 5 : kind === 'party' ? 16 : 14
        case 'confront':
          return kind === 'bar' ? 18 : 13
        case 'romance':
          return romance ? 20 : 0
        case 'dance':
          return kind === 'bar' ? 0 : 14
        case 'quiet':
          return 14
        case 'pickpocket':
          return kind === 'party' ? 0 : 5
        case 'celebrity':
          return kind === 'club' ? 5 : 0
        case 'karaoke':
          return kind === 'bar' && g.year >= 1985 ? 14 : 0
        case 'trivia':
          return kind === 'bar' && g.year >= 1975 ? 10 : 0
        case 'raid':
          return kind === 'party' ? 10 : prohibition(g) ? 8 : 0
      }
    },
  )
  const s = stranger(g)
  const his = s.gender === 'male' ? 'his' : 'her'
  switch (event) {
    case 'drink': {
      const local = locale(g).drinks.filter(isAlcoholic)
      const drink = local.length && chance(g, 0.5) && !prohibition(g) ? pick(g, local) : eraPick(g, DRINKS)
      scriptChoice(g, DRINK_OFFER, 'Free Drink', `${intro}\n\n${s.name}, a friendly stranger, offered to buy you a ${drink.toLowerCase()}.`, [
        { id: 'accept', label: 'Accept the drink', emoji: '\u{1F378}' },
        { id: 'decline', label: 'Decline', emoji: '\u{1F645}' },
      ], { emoji: '\u{1F378}', data: { venue, drink } })
      return
    }
    case 'drugs': {
      const drug = pick(g, drugsNow(g))
      const choices = [
        { id: 'try', label: `Try the ${drug.name.toLowerCase()}`, emoji: '\u{1F48A}' },
        { id: 'decline', label: 'Decline', emoji: '\u{1F645}' },
      ]
      if (kind === 'club') choices.push({ id: 'report', label: 'Report them to security', emoji: '\u{1F46E}' })
      scriptChoice(g, DRUG_OFFER, 'Shady Offer', `${intro}\n\nSomeone in ${g.year >= 1975 ? 'a hoodie' : 'a dark overcoat'} pulled you aside and offered you some ${drug.name.toLowerCase()}.`, choices, {
        emoji: '\u{1F48A}',
        data: { venue, drug: drug.name },
      })
      return
    }
    case 'confront': {
      const reason = say(g, CONFRONT_REASONS, { name: s.name, his })
      scriptChoice(g, CONFRONT, 'Confrontation', `${intro}\n\n${reason}`, [
        { id: 'argue', label: 'Argue back', emoji: '\u{1F5E3}\u{FE0F}' },
        { id: 'assault', label: `Assault ${s.gender === 'male' ? 'him' : 'her'}`, emoji: '\u{1F44A}' },
        { id: 'walk', label: 'Walk away', emoji: '\u{1F6B6}' },
      ], { emoji: '\u{1F620}', data: { venue, name: s.name, gender: s.gender } })
      return
    }
    case 'romance': {
      const gender = strangerGender(g, true)
      if (!attractedTo(c, gender)) break
      const age = strangerAge(g, 6)
      const name = randomFirstName(g, c.countryId, gender)
      const lastName = randomLastName(g, c.countryId)
      const him = gender === 'male' ? 'him' : 'her'
      scriptChoice(g, FLIRT, 'Eyes Across the Room', `${intro}\n\n${name}, ${age}, keeps smiling at you from across the room.`, [
        { id: 'dance', label: `Dance with ${him}`, emoji: '\u{1F483}' },
        { id: 'drink', label: `Buy ${him} a drink (${money(localPrice(g, 15))})`, emoji: '\u{1F378}' },
        { id: 'ignore', label: 'Ignore', emoji: '\u{1F645}' },
      ], { emoji: '\u{1F60F}', data: { venue, name, lastName, gender, age } })
      return
    }
    case 'pickpocket': {
      const lost = Math.min(Math.max(0, c.money), randInt(g, 20, 200))
      if (lost > 0) {
        addMoney(g, -lost)
        log(g, `Someone stole ${money(lost)} from me at ${venue}.`, 'bad')
        result(g, 'Pickpocketed', `${intro}\n\nOn your way home you realized someone had lifted ${money(lost)} from your pocket.`, '\u{1F45B}', 'bad')
        return
      }
      break
    }
    case 'celebrity': {
      addStat(g, 'happiness', randInt(g, 3, 6))
      const who = eraPick(g, ['@1985 a famous rapper', '@2002 a reality TV star', '@1950 a pro basketball player', '@1960 a pop star', 'a movie star', '@-1965 a famous bandleader', '@-1940 a vaudeville comedian'])
      const vip = g.year >= 1985 ? 'the VIP section' : 'the best table in the house'
      const keepsake = common(g, 'smartphone') ? 'You got a selfie!' : 'You got an autograph on a cocktail napkin!'
      log(g, `I partied at ${vip} with ${who} at ${venue}.`, 'good')
      result(g, 'Celebrity Sighting', `${intro}\n\nYou spotted ${who} at ${vip} and somehow talked your way in. ${keepsake}`, '\u{1F31F}', 'good')
      return
    }
    case 'karaoke': {
      const voice = typeof g.flags['skill.voice'] === 'number' ? (g.flags['skill.voice'] as number) : 0
      if (voice >= 50 || chance(g, 0.35)) {
        addStat(g, 'happiness', randInt(g, 4, 8))
        log(g, `I crushed karaoke night at ${venue}.`, 'good')
        result(g, 'Karaoke Star', `${intro}\n\nYou grabbed the mic for karaoke night and brought the house down. Strangers bought you drinks.`, '\u{1F3A4}', 'good')
      } else {
        addStat(g, 'happiness', -randInt(g, 1, 4))
        log(g, `I bombed at karaoke at ${venue}.`, 'bad')
        result(g, 'Karaoke Disaster', `${intro}\n\nYou sang a power ballad at karaoke night. The bartender turned the music up to drown you out.`, '\u{1F3A4}', 'bad')
      }
      return
    }
    case 'trivia': {
      if (chance(g, c.stats.smarts / 130)) {
        const prize = localPrice(g, 100)
        addMoney(g, prize)
        addStat(g, 'happiness', randInt(g, 3, 6))
        log(g, `My team won trivia night at ${venue}.`, 'good')
        result(g, 'Trivia Champs', `${intro}\n\nYour team won trivia night and a ${money(prize)} bar tab. Turns out knowing the capital of Mongolia pays.`, '\u{1F3C6}', 'good')
      } else {
        log(g, `My team lost trivia night at ${venue}.`, 'neutral')
        result(g, 'Trivia Night', `${intro}\n\nYour trivia team came in last. You still don't know what a "fortnight" is.`, '\u{2753}')
      }
      return
    }
    case 'raid': {
      if (prohibition(g) && kind !== 'party') {
        if (chance(g, 0.25)) {
          log(g, `Prohibition agents raided ${venue} and arrested me.`, 'bad')
          notice(g, 'Raid!', `${intro}\n\nWhistles blew and Prohibition agents stormed in, smashing barrels. You didn't make it out the back door.`, { emoji: '\u{1F6A8}', tone: 'bad' })
          arrestPlayer(g, 'Violating Prohibition', 1)
          return
        }
        log(g, `I escaped a Prohibition raid at ${venue}.`, 'neutral')
        result(g, 'Raid!', `${intro}\n\nWhistles blew and Prohibition agents stormed in. You slipped out through the coal chute with your drink still in your hand.`, '\u{1F6A8}')
        return
      }
      if (chance(g, 0.15)) {
        const fine = Math.min(Math.max(0, c.money), localPrice(g, 200))
        addMoney(g, -fine)
        log(g, 'The police broke up the party and I got a ticket.', 'bad')
        result(g, 'Busted Party', `${intro}\n\nThe cops showed up over a noise complaint and you got a ${money(fine)} ticket for being drunk and loud.`, '\u{1F6A8}', 'bad')
      } else {
        log(g, 'The police broke up the party I was at.', 'neutral')
        result(g, 'Party Over', `${intro}\n\nThe cops showed up over a noise complaint. You escaped through the backyard and over a fence like an action hero.`, '\u{1F6A8}')
      }
      return
    }
    case 'dance': {
      if (chance(g, 0.15)) {
        addStat(g, 'happiness', -2)
        addStat(g, 'looks', -1)
        log(g, `I slipped and fell on the dance floor at ${venue}.`, 'bad')
        result(g, 'Wipeout', `${intro}\n\nYou attempted a spin move, slipped in a puddle of something and ate the floor. ${common(g, 'smartphone') ? 'Several people filmed it.' : 'Several people will never let you forget it.'}`, '\u{1F92D}', 'bad')
        return
      }
      addStat(g, 'happiness', randInt(g, 3, 7))
      log(g, `I owned the dance floor at ${venue}.`, 'good')
      result(g, 'Dance Floor', `${intro}\n\n${pick(g, ['You owned the dance floor. A circle formed around you.', 'You danced until your feet hurt and your shirt was soaked.', `${uc(scene(g).music)} played your favorite song and you lost your mind.`])}`, '\u{1F57A}', 'good')
      return
    }
    case 'quiet':
      break
  }
  log(g, `I went out to ${venue}.`, 'good')
  result(g, 'Night Out', `${intro}\n\n${pick(g, [
    'You had a great time and got home at 3 a.m. with ringing ears.',
    "Nothing wild happened, but you laughed so hard your stomach hurt. A solid night.",
    'You danced, sang along badly and ate street food on the way home. Perfect.',
  ])}`, '\u{1F389}', 'good')
}

function goClubbing(g: GameState, club: Club): void {
  const cover = coverCharge(g, club.tier)
  if (g.character.money < cover) {
    brokeNotice(g, cover, `the cover charge at ${club.name}`)
    return
  }
  if (tooHungover(g)) return
  const refusal = bouncerSaysNo(g, club)
  if (refusal) {
    log(g, `I got turned away at the door of ${club.name}.`, 'bad')
    addStat(g, 'happiness', -randInt(g, 2, 5))
    result(g, 'Denied Entry', refusal, '\u{1F6AB}', 'bad')
    return
  }
  addMoney(g, -cover)
  count(g, 'nightlife')
  addStat(g, 'happiness', randInt(g, 2, 5))
  const intro = say(g, [
    'You paid the {cover} cover and headed into {club}.',
    prohibition(g) ? 'You whispered the password through the slot in the door at {club}. The jazz was so loud you could feel it in your teeth.' : g.year >= 1975 ? 'You made it past the bouncer at {club}. The bass was so loud you could feel it in your teeth.' : 'You made it past the doorman at {club}. {music} was so loud you could feel it in your teeth.',
    'You hit {club} with your best outfit on.',
  ], { cover: money(cover), club: club.name, music: uc(scene(g).music) })
  nightEvent(g, 'club', club.name, intro)
}

const BAR_NAMES = ['The Rusty Anchor', "O'Malley's", 'The Tipsy Goat', 'The Drunken Duck', 'Last Call', 'The Local', 'Happy Hour Haus', 'The Dive', 'Hops & Barley', 'The Crooked Spoon']

const BAR_ORDER = defineScript('act.night.barOrder', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const venue = typeof d.venue === 'string' ? d.venue : 'the bar'
  const price = localPrice(g, choice === 'shots' ? 20 : choice === 'cocktail' ? 14 : 8)
  if (choice !== 'soda' && g.character.money < price) {
    log(g, `I couldn't afford a drink at ${venue}.`, 'bad')
    result(g, 'Tab Declined', common(g, 'creditCards', 0.3) ? 'The bartender ran your card. Declined. You nursed a glass of tap water for the rest of the night.' : 'You came up short at the bar. You nursed a glass of tap water for the rest of the night.', '\u{1F4B3}', 'bad')
    return
  }
  const intro = choice === 'soda' ? 'You ordered a soda and people-watched.' : `You ordered ${choice === 'shots' ? 'a round of shots' : choice === 'cocktail' ? 'a fancy cocktail' : choice === 'wine' ? 'a glass of wine' : 'a cold beer'}.`
  if (choice !== 'soda') {
    addMoney(g, -price)
    const drink = choice === 'shots' ? 'Tequila Shot' : choice === 'cocktail' ? eraPick(g, ['@1938 Margarita', 'Mojito', '@1988 Cosmopolitan', 'Whiskey Sour', '@-1934 Bathtub Gin']) : choice === 'wine' ? 'Wine' : 'Beer'
    count(g, 'drinks')
    addStat(g, 'happiness', randInt(g, 1, 4))
    addStat(g, 'health', -randInt(g, 0, choice === 'shots' ? 3 : 1))
    rollAddiction(g, 'Alcoholism', choice === 'shots' ? 0.08 : 0.05)
    if (choice === 'shots' && chance(g, 0.12)) {
      drinkAlcohol(g, drink, venue)
      return
    }
  }
  nightEvent(g, 'bar', venue, intro)
})

/** A local grown-up venue (an izakaya, a boteco, a kafana) or a classic bar name. */
function barName(g: GameState): string {
  if (prohibition(g)) return `the speakeasy behind ${pick(g, ['the barbershop', 'the laundromat', 'a funeral parlor', 'the soda fountain'])}`
  if (g.character.countryId === 'us') return pick(g, BAR_NAMES)
  const local = locale(g).hangouts.filter((h) => /\b(?:bars?|pubs?|cantina|boteco|kneipe|kafana|izakaya|tavern|beer garden|heuriger|brewery|shebeen|rumshop|bodega|taberna|wine)\b/i.test(h))
  return local.length && chance(g, 0.6) ? pick(g, local) : pick(g, BAR_NAMES)
}

const CAFE_ORDER = defineScript('act.night.cafeOrder', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const venue = typeof d.venue === 'string' ? d.venue : 'the café'
  const what = choice === 'shisha' ? 'a shisha pipe' : typeof d[choice] === 'string' ? String(d[choice]) : 'a cup of tea'
  const price = localPrice(g, choice === 'shisha' ? 12 : 4)
  if (g.character.money < price) {
    result(g, 'Short on Cash', "You checked your wallet and ordered a glass of water instead. The waiter was very understanding.", '\u{1F4B3}', 'bad')
    return
  }
  addMoney(g, -price)
  addStat(g, 'happiness', randInt(g, 1, 4))
  if (choice === 'shisha') addStat(g, 'health', -1)
  nightEvent(g, 'bar', venue, `You ordered ${what} and settled in to people-watch.`)
})

function goToCafe(g: GameState): void {
  if (tooHungover(g)) return
  count(g, 'nightlife')
  const venue = pick(g, ['a late-night café', 'a shisha lounge', 'a rooftop café', 'a dessert café'])
  const soft = [...new Set(locale(g).drinks.filter((x) => !isAlcoholic(x)))].slice(0, 2)
  const drinks = soft.length ? soft : ['tea', 'coffee']
  scriptChoice(g, CAFE_ORDER, uc(venue.replace(/^a /, '')), `You found a table at ${venue}. The waiter asks what you're having.`, [
    ...drinks.map((dr, i) => ({ id: `d${i}`, label: `${uc(dr)} (${money(localPrice(g, 4))})`, emoji: '\u{2615}' })),
    { id: 'juice', label: `Fresh juice (${money(localPrice(g, 4))})`, emoji: '\u{1F379}' },
    { id: 'shisha', label: `Shisha (${money(localPrice(g, 12))})`, emoji: '\u{1F4A8}' },
  ], { emoji: '\u{2615}', data: { venue, d0: drinks[0] ?? 'tea', d1: drinks[1] ?? 'coffee', juice: 'a fresh juice' } })
}

function uc(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function goToBar(g: GameState): void {
  if (dryCountry(g)) return goToCafe(g)
  if (tooHungover(g)) return
  count(g, 'nightlife')
  const venue = barName(g)
  scriptChoice(g, BAR_ORDER, uc(venue.replace(/^the /, '')), `You grabbed a stool at ${venue}. The bartender asks what you're having.`, [
    { id: 'beer', label: `Beer (${money(localPrice(g, 8))})`, emoji: '\u{1F37A}' },
    { id: 'wine', label: `Wine (${money(localPrice(g, 8))})`, emoji: '\u{1F377}' },
    { id: 'cocktail', label: `Cocktail (${money(localPrice(g, 14))})`, emoji: '\u{1F379}' },
    { id: 'shots', label: `Round of shots (${money(localPrice(g, 20))})`, emoji: '\u{1F943}' },
    { id: 'soda', label: 'Just a soda', emoji: '\u{1F964}' },
  ], { emoji: '\u{1F37B}', data: { venue } })
}

function partyHost(g: GameState): Person | undefined {
  const friends = g.people.filter((p) => p.alive && (p.relation === 'friend' || p.relation === 'bestFriend') && p.age >= 18 && !isAbroad(g, p))
  return friends.length ? pick(g, friends) : undefined
}

function goToParty(g: GameState): void {
  if (tooHungover(g)) return
  count(g, 'nightlife')
  addStat(g, 'happiness', randInt(g, 2, 5))
  const host = partyHost(g)
  if (host) {
    addRelationship(host, randInt(g, 3, 8))
    notePerson(host, 'Invited the player to a house party.')
  }
  const intro = host
    ? say(g, ['Your friend {name} threw a house party and the whole neighborhood showed up.', '{name} invited you to a party. The house was packed wall to wall.'], { name: host.firstName })
    : pick(g, ["You crashed a house party at a friend of a friend's place.", 'You followed the music to a house party down the street and walked right in.'])
  nightEvent(g, 'party', host ? `${host.firstName}'s party` : 'a house party', intro)
}

// ---------------------------------------------------------------------------
// Menu

export const nightlifeMenu: MenuGroup = {
  type: 'menu',
  id: 'nightlife',
  label: 'Nightlife',
  emoji: '\u{1FAA9}',
  subtitle: 'Go out on the town',
  disabledReason: nightGate,
  header: (g) => `You can go out ${Math.max(0, NIGHT_MAX - (g.yearActions['act.nightlife'] ?? 0))} more times this year.`,
  children: (g): MenuNode[] => {
    const clubs = clubsThisYear(g)
    const nodes: MenuNode[] = [{ type: 'heading', id: 'night.clubs', label: scene(g).heading }]
    for (const club of clubs) {
      const action: MenuAction = {
        type: 'action',
        id: `night.club.${club.name}`,
        label: club.name,
        emoji: club.tier === 3 ? '\u{1F378}' : club.tier === 2 ? '\u{1FAA9}' : '\u{1F37A}',
        subtitle: (s) => `${'★'.repeat(club.tier)}${'☆'.repeat(3 - club.tier)} · Cover: ${money(coverCharge(s, club.tier))}`,
        run: (d) => goClubbing(d, club),
      }
      nodes.push(action)
    }
    nodes.push({ type: 'heading', id: 'night.other', label: 'Other' })
    nodes.push({
      type: 'action',
      id: 'night.bar',
      label: dryCountry(g) ? 'Go to a Café' : prohibition(g) ? 'Find a Speakeasy' : 'Go to a Bar',
      emoji: dryCountry(g) ? '\u{2615}' : '\u{1F37B}',
      subtitle: dryCountry(g) ? 'Tea, juice and shisha until late' : prohibition(g) ? 'Liquor is illegal. Bring the password.' : 'Grab a drink at a local bar',
      run: goToBar,
    })
    nodes.push({
      type: 'action',
      id: 'night.party',
      label: 'Go to a House Party',
      emoji: '\u{1F389}',
      subtitle: 'Free, loud and unpredictable',
      run: goToParty,
    })
    return nodes
  },
}

