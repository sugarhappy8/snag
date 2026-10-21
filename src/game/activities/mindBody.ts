// Mind & Body: gym, walks, meditation, library, gardening, instruments, lessons, space camp.
// Books, diet, martial arts and the memory test live in their own files.
import { addHidden, addRelationship, addStat, count, log, relationLabel, remember, scriptChoice, useYearAction } from '../core'
import { createPerson, notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import type { GameState, HiddenKey, Json, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { killCharacter } from '../death'
import { ageCeiling, capAt, liftSkill } from '../mastery'
import { hasMainCharacter, hasTalent, talentMult } from '../talents'
import { bookMenu } from './books'
import { creativeMenu } from './creative'
import {
  addCondition,
  addictions,
  brokeNotice,
  companionCandidates,
  flagRecord,
  gate,
  localPrice,
  money,
  payFor,
  payingParents,
  recNumber,
  removeCondition,
  result,
  say,
  usesLeft,
} from './common'
import { dietMenu, syncDiet } from './diet'
import { maybeAskedOut, presentSos } from './encounters'
import { martialArtsMenu } from './martialArts'
import { memoryTestAction } from './memory'
import { eraPick, eraLines } from '../events/era'

const tooTiredLines = (activity: string) => [
  `You're too exhausted to ${activity} again this year.`,
  `Your body is begging you not to ${activity} again this year. Listen to it.`,
  `You've already done enough of that this year. Even your shadow is tired.`,
]

// ---------------------------------------------------------------------------
// Gym

interface Workout {
  id: string
  label: string
  emoji: string
  health: [number, number]
  looks: [number, number]
  happiness: [number, number]
  athleticism: [number, number]
  injury: number
  /** Past tense for the life log: "lifted weights". */
  past: string
  lines: string[]
  prison?: boolean
  /** Years the class was offered (spin classes are a nineties thing). */
  since?: number
  until?: number
  /** Countries where it was taught before `since` (yoga in India). */
  homeOf?: string[]
}

const WORKOUTS: Workout[] = [
  {
    id: 'weights',
    past: 'lifted weights',
    label: 'Lift Weights',
    emoji: '\u{1F3CB}\u{FE0F}',
    health: [1, 4],
    looks: [1, 4],
    happiness: [0, 3],
    athleticism: [1, 3],
    injury: 0.06,
    prison: true,
    lines: [
      'You pumped iron until your arms shook. You caught yourself flexing in the mirror twice.',
      'You hit a new personal record on the bench press. The guy next to you gave you a respectful nod.',
      'You did curls in the squat rack. Everyone judged you. Your biceps did not care.',
      'You lifted heavy things and put them back down. Repeatedly. You feel amazing.',
    ],
  },
  {
    id: 'cardio',
    past: 'ran on the treadmill',
    label: 'Run on the Treadmill',
    emoji: '\u{1F3C3}',
    health: [2, 5],
    looks: [0, 2],
    happiness: [0, 3],
    athleticism: [1, 2],
    injury: 0.03,
    prison: true,
    lines: [
      '@1995 You ran five miles on the treadmill while watching a cooking show. Ironic.',
      '@1975 You did intervals on the treadmill until you could taste your own heartbeat.',
      '@1990 You jogged for 45 minutes and only checked the calorie counter 300 times.',
      '@-1975 You ran laps around the track until you could taste your own heartbeat.',
      '@-1975 You jogged around the gymnasium for 45 minutes while an old man timed you with a stopwatch.',
    ],
  },
  {
    id: 'yoga',
    past: 'took a yoga class',
    label: 'Take a Yoga Class',
    emoji: '\u{1F9D8}',
    health: [1, 4],
    looks: [0, 2],
    happiness: [2, 5],
    athleticism: [0, 2],
    injury: 0.02,
    since: 1965,
    homeOf: ['in', 'np', 'lk'],
    lines: [
      'You held downward dog for an eternity. Your hamstrings will never forgive you.',
      'You nailed tree pose without wobbling. Mostly.',
      'The instructor told you to "breathe into your hips." You tried your best.',
    ],
  },
  {
    id: 'spin',
    past: 'took a spin class',
    label: 'Take a Spin Class',
    emoji: '\u{1F6B4}',
    health: [2, 5],
    looks: [1, 2],
    happiness: [1, 3],
    athleticism: [1, 2],
    injury: 0.03,
    since: 1993,
    lines: [
      'The spin instructor screamed motivational quotes at you for 45 minutes. It worked.',
      "You pedaled to nowhere at top speed and somehow it's the best you've felt all week.",
    ],
  },
  {
    id: 'swim',
    past: 'swam laps',
    label: 'Swim Laps',
    emoji: '\u{1F3CA}',
    health: [2, 5],
    looks: [1, 3],
    happiness: [1, 3],
    athleticism: [1, 3],
    injury: 0.02,
    lines: [
      'You swam 40 laps. A kid in the next lane swam 41 just to spite you.',
      'You glided through the water like a dolphin. A slightly out-of-shape dolphin.',
    ],
  },
  {
    id: 'bootcamp',
    past: 'did a boot camp class',
    label: 'Boot Camp Class',
    emoji: '\u{1F4AA}',
    health: [2, 6],
    looks: [2, 4],
    happiness: [-1, 3],
    athleticism: [2, 4],
    injury: 0.1,
    since: 1995,
    lines: [
      'The boot camp instructor made you do burpees until you saw your ancestors.',
      'You flipped a giant tire across the parking lot. You have no idea why, but you feel powerful.',
    ],
  },
  {
    id: 'calisthenics',
    past: 'did a calisthenics class',
    label: 'Calisthenics Class',
    emoji: '\u{1F938}',
    health: [2, 5],
    looks: [1, 3],
    happiness: [0, 3],
    athleticism: [1, 3],
    injury: 0.04,
    until: 1975,
    lines: [
      'You did jumping jacks in perfect unison with forty strangers in matching gym suits.',
      'The instructor barked "one, two, one, two!" through a megaphone for an hour. You touched your toes. Almost.',
      'You swung Indian clubs and tossed a medicine ball until your arms gave out.',
    ],
  },
]

/** Was this workout offered at gyms here this year? */
function workoutOffered(g: GameState, w: Workout): boolean {
  if (w.until !== undefined && g.year >= w.until) return false
  if (w.since === undefined || g.year >= w.since) return true
  return !!w.homeOf?.includes(g.character.countryId)
}

const GYM_MAX = 4
const GYM_INJURIES = ['Pulled Muscle', 'Sprained Ankle', 'Strained Back', 'Torn Rotator Cuff', 'Pulled Hamstring']
const GYM_INFECTIONS = ['Athlete’s Foot', 'Ringworm']

function gymVisit(g: GameState, w: Workout): void {
  const c = g.character
  if (c.stats.health < 10) {
    result(g, 'Too Weak', "You're too weak to work out. You couldn't even lift the water bottle.", '\u{1F915}', 'bad')
    return
  }
  const used = g.yearActions['act.gym'] ?? 0
  if (used >= GYM_MAX) {
    result(g, 'Exhausted', pick(g, tooTiredLines('hit the gym')), '\u{1F62B}')
    return
  }
  const cost = c.prison ? 0 : localPrice(g, 12)
  const paid = payFor(g, cost, true)
  if (!paid) {
    brokeNotice(g, cost, 'a day pass at the gym')
    return
  }
  useYearAction(g, 'act.gym', GYM_MAX)
  count(g, 'gym')
  syncDiet(g)
  // Diminishing returns: the first workout of the year counts most.
  const factor = [1, 0.8, 0.6, 0.4][used] ?? 0.4
  const scale = (range: [number, number]) => Math.round(randInt(g, range[0], range[1]) * factor)
  const elder = c.age >= 65 ? 0.6 : 1
  addStat(g, 'health', Math.round(scale(w.health) * elder))
  addStat(g, 'looks', scale(w.looks))
  addStat(g, 'happiness', scale(w.happiness))
  // Athletics talent: your body responds to training much faster.
  addHidden(g, 'athleticism', Math.round(randInt(g, w.athleticism[0], w.athleticism[1]) * talentMult(g, 'Athletics', 1.6)))

  if (chance(g, w.injury * (c.age >= 60 ? 1.8 : 1))) {
    const injury = pick(g, GYM_INJURIES)
    addCondition(g, injury, 'injury', randInt(g, 8, 18))
    addStat(g, 'health', -randInt(g, 3, 8))
    log(g, `I got a ${injury.toLowerCase()} at the gym.`, 'bad')
    result(g, 'Ouch!', `You were showing off and got a ${injury.toLowerCase()}. The gym's "no pain, no gain" poster mocked you on the way out.`, '\u{1FA79}', 'bad')
    return
  }
  if (!c.prison && chance(g, 0.03)) {
    const disease = pick(g, GYM_INFECTIONS)
    const { isNew } = addCondition(g, disease, 'disease', randInt(g, 3, 8), { curable: true, diagnosed: true })
    if (isNew) {
      log(g, `I caught ${disease.toLowerCase()} at the gym.`, 'bad')
      result(g, 'Gross', `You had a good workout, but the locker room gave you ${disease.toLowerCase()} as a souvenir.`, '\u{1F9A0}', 'bad')
      return
    }
  }
  log(g, c.prison ? `I ${w.past} in the prison yard.` : `I went to the gym and ${w.past}.`, 'good')
  const flavor = used >= 3 ? `${eraPick(g, w.lines)}\n\nYou've worked out a lot this year. The gains are slowing down.` : eraPick(g, w.lines)
  result(g, c.prison ? 'Prison Gym' : 'Gym', flavor, w.emoji, 'good')
  if (!c.prison) maybeAskedOut(g, 'gym', 0.05)
}

export const gymMenu: MenuGroup = {
  type: 'menu',
  id: 'mb.gym',
  label: 'Gym',
  emoji: '\u{1F3CB}\u{FE0F}',
  subtitle: (g) => (g.character.prison ? 'Work out in the yard (free)' : 'Work out'),
  disabledReason: (g) => gate(g, { minAge: 12, prison: true }),
  header: (g) =>
    g.character.prison
      ? `The prison gym is free. You can work out ${usesLeft(g, 'act.gym', GYM_MAX)} more times this year.`
      : `A day pass costs ${money(localPrice(g, 12))}. You can work out ${usesLeft(g, 'act.gym', GYM_MAX)} more times this year.`,
  children: (g): MenuNode[] =>
    WORKOUTS.filter((w) => (!g.character.prison || w.prison) && workoutOffered(g, w)).map(
      (w): MenuAction => ({
        type: 'action',
        id: `mb.gym.${w.id}`,
        label: g.character.prison && w.id === 'cardio' ? 'Run Laps in the Yard' : w.id === 'cardio' && g.year < 1975 ? 'Run Laps' : w.label,
        emoji: w.emoji,
        run: (draft) => gymVisit(draft, w),
      }),
    ),
}

// ---------------------------------------------------------------------------
// Walks

interface WalkType {
  id: string
  label: string
  emoji: string
  health: [number, number]
  happiness: [number, number]
  /** Heart-attack risk multiplier for older walkers. */
  strain: number
  minAge: number
  lines: string[]
}

const WALKS: WalkType[] = [
  {
    id: 'stroll',
    label: 'Take a Stroll',
    emoji: '\u{1F6B6}',
    health: [1, 2],
    happiness: [1, 4],
    strain: 0.3,
    minAge: 8,
    lines: [
      'You took a leisurely stroll around the neighborhood and waved at every dog you saw.',
      'You strolled through the park and stopped to smell some flowers. One of them was a weed.',
      'You went for a slow walk and actually noticed the clouds for once.',
    ],
  },
  {
    id: 'power',
    label: 'Go for a Power Walk',
    emoji: '\u{1F6B6}\u{200D}\u{2642}\u{FE0F}',
    health: [2, 4],
    happiness: [0, 3],
    strain: 1,
    minAge: 8,
    lines: [
      '@1970 You power walked so aggressively that a jogger moved out of your way.',
      '@-1970 You power walked so aggressively that a horse moved out of your way.',
      'You pumped your arms like a champion and power walked three miles.',
    ],
  },
  {
    id: 'speed',
    label: 'Go for a Speed Walk',
    emoji: '\u{1F4A8}',
    health: [2, 5],
    happiness: [0, 2],
    strain: 2.5,
    minAge: 12,
    lines: [
      'You speed walked with the hip-swinging intensity of an Olympian.',
      "You speed walked so fast it was basically running. Don't tell anyone.",
    ],
  },
  {
    id: 'hike',
    label: 'Go on a Hike',
    emoji: '\u{1F97E}',
    health: [3, 5],
    happiness: [2, 5],
    strain: 1.8,
    minAge: 12,
    lines: [
      '@2003 You hiked to the top of a ridge and took 47 photos of the same view.',
      '@-2003 You hiked to the top of a ridge and stared at the view until the sun went down.',
      'You hiked through the woods and only got slightly lost.',
      'You conquered a trail rated "strenuous." Your calves are filing for divorce.',
    ],
  },
]

const WALK_MAX = 4

const WALLET_SCRIPT = defineScript('act.walk.wallet', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const amount = typeof d.amount === 'number' ? d.amount : 50
  if (choice === 'keep') {
    g.character.money += amount
    addHidden(g, 'karma', -5)
    log(g, `I found a wallet with ${money(amount)} in it and kept the cash.`, 'neutral')
    result(g, 'Finders Keepers', `You pocketed the ${money(amount)} and tossed the wallet in a mailbox. Your conscience will get over it. Probably.`, '\u{1F4B5}')
  } else {
    addHidden(g, 'karma', 6)
    const reward = chance(g, 0.4) ? Math.round(amount * 0.2) + 10 : 0
    if (reward) g.character.money += reward
    log(g, 'I found a lost wallet and returned it to its owner.', 'good')
    result(g, 'Good Samaritan', reward ? `You returned the wallet. The grateful owner gave you a ${money(reward)} reward!` : 'You returned the wallet to its owner, who thanked you profusely. Good karma is its own reward.', '\u{1F607}', 'good')
  }
})

const STRAY_SCRIPT = defineScript('act.walk.stray', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const species = d.species === 'Cat' ? 'Cat' : 'Dog'
  if (choice === 'adopt') {
    const pet = createPerson(g, {
      relation: 'pet',
      age: randInt(g, 1, 6),
      species,
      breed: species === 'Dog' ? pick(g, ['Mutt', 'Terrier Mix', 'Lab Mix']) : pick(g, ['Tabby', 'Tuxedo', 'Calico']),
      relationship: 80,
      livesWithPlayer: true,
    })
    count(g, 'pets')
    log(g, `A stray ${species.toLowerCase()} followed me home, so I adopted it and named it ${pet.firstName}.`, 'good')
    result(g, 'New Pet', `You adopted the stray ${species.toLowerCase()} and named ${pet.gender === 'male' ? 'him' : 'her'} ${pet.firstName}. It's love at first sight.`, species === 'Dog' ? '\u{1F415}' : '\u{1F408}', 'good')
  } else {
    log(g, `A stray ${species.toLowerCase()} followed me on my walk.`, 'neutral')
    result(g, 'Goodbye', `You shooed the ${species.toLowerCase()} away. It looked back at you one last time. Ouch.`, '\u{1F43E}')
  }
})

function walkEvent(g: GameState, w: WalkType): boolean {
  const c = g.character
  // Heart attacks for older walkers going too fast.
  if (c.age >= 50) {
    const p = ((c.age - 50) / 30) * 0.012 * w.strain * (c.stats.health < 40 ? 2 : 1)
    if (chance(g, p)) {
      if (chance(g, 0.45) || c.stats.health < 15) {
        g.flags.walkHeartAttack = true
        result(g, 'Heart Attack', 'You were walking a little too fast for your heart, which decided it had had enough.', '\u{1F494}', 'bad')
        killCharacter(g, 'Heart Attack')
        return true
      }
      addStat(g, 'health', -randInt(g, 15, 25))
      addCondition(g, 'Heart Disease', 'disease', randInt(g, 25, 40), { curable: false, diagnosed: true })
      log(g, 'I had a heart attack while walking and was rushed to the hospital.', 'bad')
      result(g, 'Heart Attack', 'You clutched your chest mid-walk and collapsed. Paramedics got there in time, but your doctor wants a word.', '\u{1F691}', 'bad')
      return true
    }
  }
  if (c.prison) return false
  const roll = randInt(g, 1, 100)
  if (roll <= 2) {
    presentSos(g, w.id === 'hike' ? 'hike' : 'walk')
    return true
  }
  if (roll <= 7) {
    const amount = randInt(g, 20, 400)
    scriptChoice(g, WALLET_SCRIPT, 'Found a Wallet', `You found a wallet on the ground with ${money(amount)} inside and an ID card. What do you do?`, [
      { id: 'return', label: 'Return it to the owner', emoji: '\u{1F607}' },
      { id: 'keep', label: 'Keep the cash', emoji: '\u{1F4B5}' },
    ], { emoji: '\u{1F45B}', data: { amount } })
    return true
  }
  if (roll <= 11) {
    const species = chance(g, 0.6) ? 'Dog' : 'Cat'
    scriptChoice(g, STRAY_SCRIPT, 'A Stray!', `A scruffy stray ${species.toLowerCase()} started following you and won't stop staring at you with big sad eyes.`, [
      { id: 'adopt', label: 'Take it home', emoji: '\u{1F3E0}' },
      { id: 'leave', label: 'Shoo it away', emoji: '\u{1F44B}' },
    ], { emoji: species === 'Dog' ? '\u{1F415}' : '\u{1F408}', data: { species } })
    return true
  }
  if (roll <= 14) {
    const found = randInt(g, 1, 20)
    c.money += found
    log(g, `I found ${money(found)} on the sidewalk during my walk.`, 'good')
    result(g, 'Lucky Day', `You found ${money(found)} on the sidewalk! Today is your day.`, '\u{1F4B0}', 'good')
    return true
  }
  if (roll <= 17) {
    addStat(g, 'happiness', -randInt(g, 1, 3))
    log(g, 'I stepped in dog poop on my walk.', 'bad')
    result(g, 'Squish', 'You stepped in a fresh pile of dog poop. You spent the rest of the walk dragging your shoe on the grass.', '\u{1F4A9}', 'bad')
    return true
  }
  if (w.id === 'hike' && roll <= 21) {
    const rash = g.character.countryId === 'us' || g.character.countryId === 'ca' ? 'Poison Ivy Rash' : 'Nettle Rash'
    const injury = pick(g, ['Sprained Ankle', 'Twisted Knee', rash])
    addCondition(g, injury, injury === rash ? 'disease' : 'injury', randInt(g, 4, 12))
    addStat(g, 'health', -randInt(g, 2, 6))
    log(g, `I got a ${injury.toLowerCase()} on a hike.`, 'bad')
    result(g, 'Trail Trouble', `You were admiring the view and ended up with a ${injury.toLowerCase()}. Nature fights back.`, '\u{1FA79}', 'bad')
    return true
  }
  return false
}

function takeWalk(g: GameState, w: WalkType): void {
  if (!useYearAction(g, 'act.walk', WALK_MAX)) {
    result(g, 'Blisters', pick(g, ['Your feet are covered in blisters. You are done walking for this year.', ...tooTiredLines('go for a walk')]), '\u{1F9B6}')
    return
  }
  count(g, 'walks')
  syncDiet(g)
  addStat(g, 'health', randInt(g, w.health[0], w.health[1]))
  addStat(g, 'happiness', randInt(g, w.happiness[0], w.happiness[1]))
  addHidden(g, 'athleticism', randInt(g, 0, 1))
  const prison = !!g.character.prison
  const kind = w.id === 'hike' ? 'hike' : w.id === 'stroll' ? 'stroll' : `${w.id} walk`
  log(g, prison ? 'I walked laps around the prison yard.' : `I went for a ${kind}.`, 'good')
  if (walkEvent(g, w)) return
  result(g, prison ? 'Yard Time' : 'Walk', prison ? pickLine(g, ['You walked laps around the yard. A guard counted them with you, out loud, to annoy you.', 'You walked the yard and soaked up the only sunlight you get all day.']) : eraPick(g, w.lines), w.emoji, 'good')
}

function walkWith(g: GameState, p: Person): void {
  if (!useYearAction(g, 'act.walk', WALK_MAX)) {
    result(g, 'Blisters', pick(g, tooTiredLines('go for a walk')), '\u{1F9B6}')
    return
  }
  if (!useYearAction(g, `act.walk.with.${p.id}`, 1)) {
    g.yearActions['act.walk'] = Math.max(0, (g.yearActions['act.walk'] ?? 1) - 1)
    result(g, 'Not Again', `${p.firstName} already went on a walk with you this year and is "busy" now.`, '\u{1F645}')
    return
  }
  if (p.relationship < 15 && p.relation !== 'child') {
    g.yearActions['act.walk'] = Math.max(0, (g.yearActions['act.walk'] ?? 1) - 1)
    result(g, 'Declined', `${p.firstName} said ${p.gender === 'male' ? 'he' : 'she'} would rather walk barefoot on thumbtacks than go on a walk with you.`, '\u{1F645}', 'bad')
    return
  }
  count(g, 'walks')
  addStat(g, 'health', randInt(g, 1, 3))
  addStat(g, 'happiness', randInt(g, 2, 5))
  addRelationship(p, randInt(g, 5, 12))
  notePerson(p, 'Went on a walk together.')
  log(g, `I went for a walk with ${p.firstName}.`, 'good')
  result(g, 'Walk', say(g, [
    'You and {name} went for a long walk and talked about everything and nothing.',
    '{name} told you a secret on your walk together. You promised not to tell anyone. You might tell someone.',
    'You and {name} walked around the park. It was nice to just spend time together.',
  ], { name: p.firstName }), '\u{1F46B}', 'good')
}

export const walkMenu: MenuGroup = {
  type: 'menu',
  id: 'mb.walk',
  label: 'Walk',
  emoji: '\u{1F6B6}',
  subtitle: (g) => (g.character.prison ? 'Walk the prison yard' : 'Go for a walk'),
  disabledReason: (g) => gate(g, { minAge: 8, prison: true }),
  header: (g) => `You can go on ${usesLeft(g, 'act.walk', WALK_MAX)} more walks this year.`,
  children: (g): MenuNode[] => {
    const c = g.character
    if (c.prison) {
      return [{ type: 'action', id: 'mb.walk.yard', label: 'Walk the Yard', emoji: '\u{1F6B6}', run: (d) => takeWalk(d, WALKS[0]) }]
    }
    const nodes: MenuNode[] = WALKS.filter((w) => c.age >= w.minAge).map((w): MenuAction => ({
      type: 'action',
      id: `mb.walk.${w.id}`,
      label: w.label,
      emoji: w.emoji,
      run: (d) => takeWalk(d, w),
    }))
    const people = companionCandidates(g, { minAge: 3, max: 6 }).filter((p) => p.relation !== 'pet')
    if (people.length) {
      nodes.push({ type: 'heading', id: 'mb.walk.with', label: 'Walk with someone' })
      for (const p of people) {
        nodes.push({
          type: 'action',
          id: `mb.walk.p.${p.id}`,
          label: `${p.firstName} ${p.lastName}`.trim(),
          emoji: '\u{1F46B}',
          subtitle: relationLabel(p),
          run: (d) => {
            const person = d.people.find((x) => x.id === p.id)
            if (person && person.alive) walkWith(d, person)
          },
        })
      }
    }
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Meditate

const MEDITATE_MAX = 3
const AWARENESS: { key: HiddenKey; label: string }[] = [
  { key: 'athleticism', label: 'athleticism' },
  { key: 'willpower', label: 'willpower' },
  { key: 'discipline', label: 'discipline' },
  { key: 'fertility', label: 'fertility' },
  { key: 'craziness', label: 'craziness' },
  { key: 'karma', label: 'karma' },
  { key: 'religiousness', label: 'religiousness' },
]

function meditate(g: GameState): void {
  if (!useYearAction(g, 'act.meditate', MEDITATE_MAX)) {
    result(g, 'Restless', pickLine(g, [
      "You tried to meditate but your mind kept wandering to what you'll eat for dinner. You're all meditated out this year.",
      "You've reached peak inner peace for the year. Any more and you'll float away.",
    ]), '\u{1F9D8}')
    return
  }
  count(g, 'meditate')
  syncDiet(g)
  const c = g.character
  addStat(g, 'happiness', randInt(g, 1, 5))
  addStat(g, 'health', randInt(g, 1, 3))
  addHidden(g, 'karma', randInt(g, 1, 3))
  addHidden(g, 'willpower', randInt(g, 0, 2))
  // Rarely, meditation breaks an addiction.
  const addicted = addictions(g)
  if (addicted.length && chance(g, 0.03)) {
    const a = pick(g, addicted)
    removeCondition(g, a.id)
    log(g, `Meditation helped me overcome my ${a.name.toLowerCase()}.`, 'good')
    remember(g, `Overcame ${a.name.toLowerCase()} through meditation.`)
    result(g, 'Breakthrough', `In a moment of deep clarity, you realized you no longer need ${a.name.toLowerCase().replace(' addiction', '')}. Your ${a.name.toLowerCase()} is gone.`, '\u{2728}', 'good')
    return
  }
  log(g, c.prison ? 'I meditated in my cell.' : 'I meditated.', 'good')
  if (chance(g, 0.35)) {
    const a = pick(g, AWARENESS)
    const value = c.hidden[a.key]
    result(g, 'Deep Awareness', `You meditated and achieved a deep awareness of yourself. You realized your ${a.label} is at ${value}%.`, '\u{1F9D8}', 'good')
    return
  }
  result(g, 'Meditation', pick(g, [
    'You sat cross-legged for an hour and found a little more peace with the world.',
    'You meditated and felt your stress melt away like butter in a hot pan.',
    'You focused on your breathing. In. Out. In. Out. Then you remembered you left the stove on.',
    c.prison ? 'You meditated in your cell while your cellmate snored like a chainsaw. Inner peace is hard-won here.' : 'You meditated in the park until a pigeon landed on your head. Still counts.',
  ]), '\u{1F9D8}', 'good')
}

export const meditateAction: MenuAction = {
  type: 'action',
  id: 'mb.meditate',
  label: 'Meditate',
  emoji: '\u{1F9D8}',
  subtitle: 'Find inner peace',
  disabledReason: (g) => gate(g, { minAge: 12, prison: true }),
  run: meditate,
}

// ---------------------------------------------------------------------------
// Library

const LIBRARY_MAX = 3
const TOPICS = [
  'the history of cheese',
  '@1967 black holes',
  '@-1967 the planets and their moons',
  'ancient Rome',
  'how bridges stay up',
  'the stock market',
  'deep-sea creatures',
  '@1920 world war history',
  '@-1920 the Napoleonic wars',
  'the human brain',
  'medieval torture devices',
  '@1926 quantum physics (you understood maybe 4%)',
  'famous unsolved mysteries',
  '@1960 how to fold a fitted sheet',
  'volcanoes',
  'the migration patterns of geese',
  'the history of the toilet',
  'dinosaurs',
]

function library(g: GameState): void {
  const used = g.yearActions['act.library'] ?? 0
  if (!useYearAction(g, 'act.library', LIBRARY_MAX)) {
    result(g, 'Library', pickLine(g, [
      "The librarian is starting to recognize you. You've spent enough time here this year.",
      "You've already read everything interesting in the library this year.",
    ]), '\u{1F4DA}')
    return
  }
  count(g, 'library')
  syncDiet(g)
  const c = g.character
  const base: [number, number] = c.age < 18 ? [2, 6] : c.age < 60 ? [1, 4] : [1, 2]
  const factor = [1, 0.5, 0][used] ?? 0
  // Academics talent: you remember everything you read.
  const gain = Math.round(randInt(g, base[0], base[1]) * factor * talentMult(g, 'Academics', 1.6))
  addStat(g, 'smarts', gain)
  addStat(g, 'happiness', randInt(g, 0, 2))
  const topic = pick(g, eraLines(g, TOPICS))
  if (gain > 0) {
    log(g, `I went to the ${c.prison ? 'prison ' : ''}library and read about ${topic}.`, 'good')
    result(g, 'Library', pickSite(g, [
      `You spent the afternoon at the ${c.prison ? 'prison ' : ''}library reading about ${topic}.`,
      `You lost track of time reading about ${topic}. You feel smarter already.`,
      `You found a great book about ${topic} and read the whole thing in one sitting.`,
    ], 0x6404f91d), '\u{1F4DA}', 'good')
  } else {
    log(g, 'I went to the library, but I didn’t learn anything new.', 'neutral')
    result(g, 'Library', `You flipped through a book about ${topic}, but nothing stuck. You didn't learn anything new.`, '\u{1F4DA}')
  }
  if (!c.prison) maybeAskedOut(g, 'library', 0.04)
}

export const libraryAction: MenuAction = {
  type: 'action',
  id: 'mb.library',
  label: 'Library',
  emoji: '\u{1F3DB}\u{FE0F}',
  subtitle: (g) => (g.character.prison ? 'Visit the prison library' : 'Visit the library'),
  disabledReason: (g) => gate(g, { minAge: 12, prison: true }),
  run: library,
}

// ---------------------------------------------------------------------------
// Gardening

const GARDEN_TASKS = [
  'cut back the overgrown plants',
  'fertilized the shrubs',
  'filled the birdbaths and bird feeders',
  'planted some tulips',
  'planted some tomatoes',
  'planted some sunflowers',
  'pruned the trees',
  'pulled all of the weeds',
  'raked the leaves',
  'trimmed the hedges',
]

function canGarden(g: GameState): string | null {
  const r = g.character.residence.status
  if (r === 'owned' || r === 'parents' || r === 'partner') return null
  return "You need a garden to garden in. Buy a house first."
}

function garden(g: GameState): void {
  if (!useYearAction(g, 'act.garden', 3)) {
    result(g, 'Gardening', pickLine(g, [
      'Your plants need time to grow. Come back next year.',
      "There's nothing left to weed. You've gardened enough for one year.",
    ]), '\u{1F331}')
    return
  }
  count(g, 'gardening')
  const relax = randInt(g, 40, 100)
  addStat(g, 'happiness', relax >= 80 ? 8 : relax >= 60 ? 6 : 4)
  addStat(g, 'health', randInt(g, 0, 2))
  const task = pickLine(g, GARDEN_TASKS)
  log(g, `I ${task}.`, 'good')
  result(g, 'Gardening', `You ${task}. It was ${relax >= 80 ? 'incredibly relaxing' : relax >= 60 ? 'pretty relaxing' : 'mildly relaxing, apart from the bees'}.\n\nRelaxation: ${relax}%`, '\u{1F33B}', 'good')
}

export const gardeningAction: MenuAction = {
  type: 'action',
  id: 'mb.garden',
  label: 'Gardening',
  emoji: '\u{1F33B}',
  subtitle: 'Tend to your garden',
  visible: (g) => !g.character.prison,
  disabledReason: (g) => gate(g, { minAge: 12 }) ?? canGarden(g),
  run: garden,
}

// ---------------------------------------------------------------------------
// Instruments

/** Instruments that came later: the electric bass, the steel pan, the electronic keyboard. */
const INSTRUMENT_SINCE: Record<string, number> = { 'Bass Guitar': 1955, 'Steel Drum': 1950, Keyboard: 1975 }

export const INSTRUMENTS: { name: string; emoji: string }[] = [
  { name: 'Accordion', emoji: '\u{1FA97}' },
  { name: 'Banjo', emoji: '\u{1FA95}' },
  { name: 'Bass Guitar', emoji: '\u{1F3B8}' },
  { name: 'Cello', emoji: '\u{1F3BB}' },
  { name: 'Didgeridoo', emoji: '\u{1FAB5}' },
  { name: 'Drums', emoji: '\u{1F941}' },
  { name: 'Flute', emoji: '\u{1FA88}' },
  { name: 'Guitar', emoji: '\u{1F3B8}' },
  { name: 'Harmonica', emoji: '\u{1F3B5}' },
  { name: 'Harp', emoji: '\u{1F3BC}' },
  { name: 'Kazoo', emoji: '\u{1F3B6}' },
  { name: 'Keyboard', emoji: '\u{1F3B9}' },
  { name: 'Organ', emoji: '\u{1F3B9}' },
  { name: 'Pan Flute', emoji: '\u{1FA88}' },
  { name: 'Piano', emoji: '\u{1F3B9}' },
  { name: 'Recorder', emoji: '\u{1FA88}' },
  { name: 'Saxophone', emoji: '\u{1F3B7}' },
  { name: 'Steel Drum', emoji: '\u{1FA98}' },
  { name: 'Tambourine', emoji: '\u{1FA87}' },
  { name: 'Triangle', emoji: '\u{1F53A}' },
  { name: 'Trombone', emoji: '\u{1F3BA}' },
  { name: 'Trumpet', emoji: '\u{1F3BA}' },
  { name: 'Tuba', emoji: '\u{1F3BA}' },
  { name: 'Violin', emoji: '\u{1F3BB}' },
]

const INSTR_FLAG = 'instruments'

export function instrumentSkill(g: GameState, name: string): number {
  return recNumber(flagRecord(g, INSTR_FLAG), name)
}

function setInstrumentSkill(g: GameState, name: string, skill: number): void {
  const rec = { ...flagRecord(g, INSTR_FLAG) }
  rec[name] = Math.max(0, Math.min(100, Math.round(skill)))
  g.flags[INSTR_FLAG] = rec
}


function lessonCost(g: GameState): number {
  return localPrice(g, 60)
}

function instrumentLesson(g: GameState, name: string): void {
  const c = g.character
  const total = g.yearActions['act.instrument'] ?? 0
  if (total >= 8) {
    result(g, 'Burned Out', 'Your fingers are calloused and your ears are ringing. No more music lessons this year.', '\u{1F62B}')
    return
  }
  const cost = lessonCost(g)
  const played = Object.keys(flagRecord(g, INSTR_FLAG)).filter((k) => instrumentSkill(g, k) > 0).length
  if (c.age < 18) {
    const parents = payingParents(g)
    const parent = parents.filter((p) => p.money >= cost).sort((a, b) => b.relationship - a.relationship)[0]
    const already = instrumentSkill(g, name) > 0
    if (parent) {
      const decline = parent.relationship < 25 || (!already && played >= 3 && chance(g, 0.6)) || (parent.money < cost * 15 && chance(g, 0.5))
      if (decline) {
        const word = parent.gender === 'male' ? 'dad' : 'mom'
        log(g, `I asked my ${word} to pay for ${name.toLowerCase()} lessons, but ${parent.gender === 'male' ? 'he' : 'she'} said no.`, 'bad')
        result(g, 'Denied', say(g, [
          'Your {word} said no to {inst} lessons. "Do you know how much those cost?"',
          'Your {word} refused to pay for {inst} lessons. "You already play enough instruments."',
          'You asked your {word} for {inst} lessons. {He} laughed and walked away.',
        ], { word, inst: name.toLowerCase(), He: parent.gender === 'male' ? 'He' : 'She' }), '\u{1F645}', 'bad')
        return
      }
      parent.money = Math.max(0, parent.money - cost)
    } else if (!payFor(g, cost, false)) {
      brokeNotice(g, cost, `a ${name.toLowerCase()} lesson`)
      return
    }
  } else if (!payFor(g, cost, false)) {
    brokeNotice(g, cost, `a ${name.toLowerCase()} lesson`)
    return
  }
  useYearAction(g, 'act.instrument', 8)
  const perKey = `act.instrument.${name}`
  const lessonsThisYear = (g.yearActions[perKey] ?? 0) + 1
  g.yearActions[perKey] = lessonsThisYear
  count(g, 'musicLessons')
  // Main Character Syndrome: the first lesson on an instrument is already mastery (to the age ceiling).
  const top = ageCeiling(c.age, { from: 5, full: 15, floor: 35 })
  const prior = instrumentSkill(g, name)
  const before = liftSkill(g, `instrument.${name}`, 'instrument', name.toLowerCase(), prior, top)
  if (before !== prior) {
    setInstrumentSkill(g, name, before)
    if (before >= 100) {
      count(g, 'instrumentsMastered')
      addStat(g, 'happiness', randInt(g, 2, 5))
      remember(g, `Mastered the ${name.toLowerCase()}.`)
      return
    }
  }
  if (before >= 100) {
    addStat(g, 'happiness', randInt(g, 1, 4))
    log(g, `I played the ${name.toLowerCase()} just for fun.`, 'good')
    result(g, name, `You've already mastered the ${name.toLowerCase()}. Your teacher just sat back and enjoyed the concert.`, '\u{1F3B6}', 'good')
    return
  }
  // Too many lessons in one year and you start getting worse (burnout).
  if (lessonsThisYear > 3) {
    const loss = hasMainCharacter(g) ? 0 : randInt(g, 2, 6)
    if (loss > 0) setInstrumentSkill(g, name, before - loss)
    addStat(g, 'happiness', -randInt(g, 1, 3))
    log(g, `I practiced the ${name.toLowerCase()} too much and got worse.`, 'bad')
    result(g, 'Burnout', `You've taken too many ${name.toLowerCase()} lessons this year. You're burned out and actually got worse.`, '\u{1F635}', 'bad')
    return
  }
  let gain = randInt(g, 4, 12) * (0.6 + c.stats.smarts / 200) * talentMult(g, 'Music', 1.6) * (c.age < 18 ? 1.2 : 1)
  if (name === 'Kazoo' || name === 'Triangle' || name === 'Tambourine') gain *= 1.6
  const after = capAt(g, Math.min(100, Math.round(before + gain)), top, before)
  setInstrumentSkill(g, name, after)
  addStat(g, 'happiness', randInt(g, 1, 3))
  addStat(g, 'smarts', randInt(g, 0, 1))
  if (after >= 100) {
    count(g, 'instrumentsMastered')
    remember(g, `Mastered the ${name.toLowerCase()}.`)
    log(g, `I mastered the ${name.toLowerCase()}!`, 'good')
    result(g, 'Mastered!', `You've mastered the ${name.toLowerCase()}! Your teacher says there's nothing left to teach you.`, '\u{1F3C6}', 'good')
    return
  }
  log(g, `I took a ${name.toLowerCase()} lesson.`, 'good')
  result(g, `${name} Lesson`, `${pickSite(g, [
    `You practiced scales on the ${name.toLowerCase()} for an hour.`,
    `Your ${name.toLowerCase()} teacher said you're improving. Your neighbors disagree.`,
    `You learned a new song on the ${name.toLowerCase()}.`,
    `You played the ${name.toLowerCase()} until your teacher winced only occasionally.`,
  ], 0xa2c4326b)}\n\nSkill: ${after}%`, '\u{1F3B6}', 'good')
}

export const instrumentsMenu: MenuGroup = {
  type: 'menu',
  id: 'mb.instruments',
  label: 'Instruments',
  emoji: '\u{1F3B8}',
  subtitle: 'Learn to play an instrument',
  visible: (g) => !g.character.prison,
  disabledReason: (g) => gate(g, { minAge: 6 }),
  header: (g) =>
    g.character.age < 18
      ? `Lessons cost ${money(lessonCost(g))}. You'll have to ask your parents to pay. Taking more than 3 lessons on one instrument in a year will burn you out.`
      : `Lessons cost ${money(lessonCost(g))} each. Taking more than 3 lessons on one instrument in a year will burn you out.`,
  children: (g): MenuNode[] =>
    INSTRUMENTS.filter((inst) => g.year >= (INSTRUMENT_SINCE[inst.name] ?? 0) || instrumentSkill(g, inst.name) > 0).map((inst): MenuAction => {
      const skill = instrumentSkill(g, inst.name)
      return {
        type: 'action',
        id: `mb.instrument.${inst.name}`,
        label: inst.name,
        emoji: inst.emoji,
        subtitle: skill >= 100 ? 'Mastered' : skill > 0 ? `Skill: ${skill}%` : 'Take a lesson',
        run: (d) => instrumentLesson(d, inst.name),
      }
    }),
}

// ---------------------------------------------------------------------------
// Acting / voice / modeling lessons and space camp

interface LessonDef {
  id: 'acting' | 'voice' | 'modeling'
  label: string
  emoji: string
  minAge: number
  price: number
  lines: string[]
}

const LESSONS: LessonDef[] = [
  {
    id: 'acting',
    label: 'Acting Lessons',
    emoji: '\u{1F3AD}',
    minAge: 8,
    price: 100,
    lines: [
      'Your acting coach made you pretend to be a tree for an hour. You were a very convincing oak.',
      'You cried real tears during an improv scene. Your coach called you "a natural."',
      'You practiced a monologue from a famous play. You only forgot your lines twice.',
      '@1950 You did a cold read of a commercial script. You sold that cereal like your life depended on it.',
      '@-1950 You recited a speech from an old melodrama and fainted on cue. Twice.',
    ],
  },
  {
    id: 'voice',
    label: 'Voice Lessons',
    emoji: '\u{1F3A4}',
    minAge: 8,
    price: 90,
    lines: [
      'You hit a high note so pure that a dog howled along in harmony.',
      'Your vocal coach made you sing scales for an hour. Do-re-mi-fa-so-tired.',
      'You worked on your breath control and belted out a power ballad.',
      'Your voice cracked on the big note, but your coach said it was "character."',
    ],
  },
  {
    id: 'modeling',
    label: 'Modeling Lessons',
    emoji: '\u{1F483}',
    minAge: 13,
    price: 150,
    lines: [
      'You practiced your runway walk until you could do it in your sleep.',
      '@2009 Your coach taught you how to smize. You smized at everyone on the way home.',
      '@-2009 Your coach taught you to walk with a book balanced on your head. You went through three books.',
      'You learned 14 different poses. Your favorite is "confused about the menu."',
    ],
  },
]

export function skillLevel(g: GameState, id: string): number {
  return Math.max(0, Math.min(100, typeof g.flags[`skill.${id}`] === 'number' ? (g.flags[`skill.${id}`] as number) : 0))
}

function takeLesson(g: GameState, l: LessonDef): void {
  if ((g.yearActions[`act.lesson.${l.id}`] ?? 0) >= 3) {
    result(g, l.label, pickLine(g, [
      'Your coach says you need a break. Come back next year.',
      "You've taken enough lessons this year. Your coach is out of new exercises.",
    ]), l.emoji)
    return
  }
  const cost = localPrice(g, l.price)
  const paid = payFor(g, cost, true)
  if (!paid) {
    brokeNotice(g, cost, l.label.toLowerCase())
    return
  }
  useYearAction(g, `act.lesson.${l.id}`, 3)
  count(g, `${l.id}Lessons`)
  const talented = hasTalent(g, l.id === 'acting' ? 'Acting' : l.id === 'voice' ? 'Music' : 'Modeling')
  const lessonTop = l.id === 'modeling' ? ageCeiling(g.character.age, { from: 12, full: 18, floor: 45 }) : ageCeiling(g.character.age, { from: 6, full: 17, floor: 30 })
  const prior = skillLevel(g, l.id)
  // Main Character Syndrome: the first lesson is already mastery (to the age ceiling).
  const before = liftSkill(g, `lesson.${l.id}`, 'stage', l.label.replace(/ Lessons?$/, '').toLowerCase(), prior, lessonTop)
  const grown = Math.min(100, before + Math.round(randInt(g, 5, 13) * (talented ? 1.7 : 1)))
  const after = capAt(g, grown, lessonTop, before)
  g.flags[`skill.${l.id}`] = after
  addStat(g, 'happiness', randInt(g, 1, 4))
  if (l.id === 'modeling') addStat(g, 'looks', randInt(g, 0, 2))
  if (l.id === 'acting') addStat(g, 'smarts', randInt(g, 0, 1))
  log(g, `I took ${l.label.toLowerCase()}.`, 'good')
  const paidBy = paid.by === 'parent' && paid.parent ? `\n\nYour ${paid.parent.gender === 'male' ? 'dad' : 'mom'} paid for it.` : ''
  result(g, l.label, `${eraPick(g, l.lines)}\n\nSkill: ${after}%${paidBy}`, l.emoji, 'good')
}

function lessonAction(l: LessonDef): MenuAction {
  return {
    type: 'action',
    id: `mb.lesson.${l.id}`,
    label: l.label,
    emoji: l.emoji,
    subtitle: (g) => `${money(localPrice(g, l.price))} · Skill: ${skillLevel(g, l.id)}%`,
    visible: (g) => !g.character.prison,
    disabledReason: (g) => gate(g, { minAge: l.minAge }),
    run: (g) => takeLesson(g, l),
  }
}

function spaceCamp(g: GameState): void {
  if (!useYearAction(g, 'act.spaceCamp', 1)) {
    result(g, 'Space Camp', 'You already went to space camp this year. The astronaut ice cream budget is exhausted.', '\u{1F680}')
    return
  }
  const cost = localPrice(g, 1200)
  const parents = payingParents(g).filter((p) => p.money >= cost).sort((a, b) => b.relationship - a.relationship)
  const parent = parents[0]
  if (parent && (parent.relationship < 20 || (parent.money < cost * 10 && chance(g, 0.5)))) {
    g.yearActions['act.spaceCamp'] = 0
    const word = parent.gender === 'male' ? 'dad' : 'mom'
    log(g, `My ${word} wouldn't send me to space camp.`, 'bad')
    result(g, 'Grounded', `Your ${word} said space camp is too expensive. "The backyard has stars too."`, '\u{1F645}', 'bad')
    return
  }
  if (parent) parent.money = Math.max(0, parent.money - cost)
  else if (!payFor(g, cost, false)) {
    g.yearActions['act.spaceCamp'] = 0
    brokeNotice(g, cost, 'space camp')
    return
  }
  count(g, 'spaceCamp')
  addStat(g, 'smarts', randInt(g, 3, 8))
  addStat(g, 'happiness', randInt(g, 4, 9))
  addHidden(g, 'athleticism', randInt(g, 0, 2))
  if (chance(g, 0.12)) {
    log(g, 'I went to space camp and threw up in the centrifuge.', 'neutral')
    result(g, 'Space Camp', 'You learned a ton about rockets and orbits, then threw up in the centrifuge in front of everyone. Houston, we have a problem.', '\u{1F680}')
    return
  }
  log(g, 'I went to space camp!', 'good')
  result(g, 'Space Camp', pickLine(g, [
    'You spent a week at space camp, built a model rocket and floated in a zero-gravity simulator. Future astronaut!',
    'At space camp you learned how astronauts eat, sleep and go to the bathroom in space. Mostly the last one.',
    'You commanded a simulated shuttle mission and only crashed it once.',
  ]), '\u{1F680}', 'good')
}

export const spaceCampAction: MenuAction = {
  type: 'action',
  id: 'mb.spaceCamp',
  label: 'Space Camp',
  emoji: '\u{1F680}',
  subtitle: (g) => `${money(localPrice(g, 1200))} · For future astronauts`,
  // Space camps for kids opened in 1982.
  visible: (g) => !g.character.prison && g.character.age <= 17 && g.year >= 1982,
  disabledReason: (g) => gate(g, { minAge: 8 }),
  run: spaceCamp,
}

// ---------------------------------------------------------------------------
// The Mind & Body menu

export const mindBodyMenu: MenuGroup = {
  type: 'menu',
  id: 'mindBody',
  label: 'Mind & Body',
  emoji: '\u{1F9E0}',
  subtitle: 'Work on self-improvement',
  disabledReason: (g) => gate(g, { minAge: 6, prison: true }),
  children: (g): MenuNode[] => {
    const nodes: MenuNode[] = [
      lessonAction(LESSONS[0]),
      bookMenu,
      creativeMenu,
      dietMenu,
      gardeningAction,
      gymMenu,
      instrumentsMenu,
      libraryAction,
      martialArtsMenu,
      meditateAction,
      memoryTestAction,
      lessonAction(LESSONS[2]),
      spaceCampAction,
      lessonAction(LESSONS[1]),
      walkMenu,
    ]
    return nodes.filter((n) => !('visible' in n) || !n.visible || n.visible(g))
  },
}
