// Random encounters shared by several activities: someone asks you out (gym, library,
// movies...) and life-or-death "SOS" situations (walks, hikes, the zoo).
import { arrestPlayer } from '../crime'
import { killCharacter } from '../death'
import { addHidden, addStat, count, currentPartner, log, notice, remember, scriptChoice } from '../core'
import { randomFirstName, randomLastName } from '../world'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Gender, Json } from '../types'
import { canRomance, meetPerson, result, say, strangerAge, strangerGender } from './common'

// ---------------------------------------------------------------------------
// Someone asks you out

const ASK_OUT_LINES = [
  '{name}, a {age}-year-old you keep running into at the {where}, walked up and asked you out on a date.',
  'While you were at the {where}, {name} ({age}) worked up the courage to ask for your number.',
  '{name}, {age}, has been sneaking glances at you all day at the {where}. Now {he} is asking you out.',
  'A {age}-year-old named {name} at the {where} said {he} likes your vibe and asked you to dinner.',
]

const DATE_SCRIPT = defineScript('act.encounter.date', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const where = typeof d.where === 'string' ? d.where : 'gym'
  const gender: Gender = d.gender === 'male' ? 'male' : 'female'
  const age = typeof d.age === 'number' ? d.age : strangerAge(g)
  const firstName = typeof d.firstName === 'string' ? d.firstName : undefined
  const lastName = typeof d.lastName === 'string' ? d.lastName : undefined
  if (choice === 'yes') {
    const p = meetPerson(g, 'partner', `the ${where}`, { gender, age, firstName, lastName, relationship: randInt(g, 60, 80) })
    if (p.relation === 'partner') {
      log(g, `I started dating ${p.firstName}, who I met at the ${where}.`, 'good')
      addStat(g, 'happiness', randInt(g, 4, 9))
      result(g, 'New Relationship', say(g, [
        'You and {name} hit it off immediately. You are officially dating!',
        'Dinner with {name} went great. Somewhere between the appetizer and dessert, you two became a couple.',
        '{name} laughed at all of your jokes. Even the bad ones. You are now dating!',
      ], { name: p.firstName }), '\u{1F498}', 'good')
    } else {
      log(g, `I met ${p.firstName} at the ${where}.`, 'neutral')
      result(g, 'New Friend', `You and ${p.firstName} hung out. It didn't feel romantic, but you made a new friend.`, '\u{1F91D}')
    }
  } else if (choice === 'friends') {
    const p = meetPerson(g, 'friend', `the ${where}`, { gender, age, firstName, lastName })
    log(g, `I became friends with ${p.firstName} from the ${where}.`, 'neutral')
    result(g, 'Just Friends', say(g, [
      "You told {name} you'd rather just be friends. {name} took it surprisingly well.",
      'You and {name} swapped numbers. Strictly platonic. Probably.',
    ], { name: p.firstName }), '\u{1F91D}')
  } else {
    log(g, `I turned down a date with ${firstName ?? 'someone'} at the ${where}.`, 'neutral')
    result(g, 'Rejected', say(g, [
      'You turned {name} down. {name} walked away doing that awkward half-wave.',
      'You let {name} down gently. The walk of shame back to the treadmill was all theirs.',
      "You said no thanks. {name} pretended to get a phone call.",
    ], { name: firstName ?? 'them' }), '\u{1F645}')
  }
})

/** Chance-based: someone asks the player out (adults only). Returns true if it happened. */
export function maybeAskedOut(g: GameState, where: string, p: number): boolean {
  if (!canRomance(g) || !chance(g, p)) return false
  const gender = strangerGender(g, true)
  const age = strangerAge(g, 6)
  const firstName = randomFirstName(g, g.character.countryId, gender)
  const lastName = randomLastName(g, g.character.countryId)
  const he = gender === 'male' ? 'he' : 'she'
  const partner = currentPartner(g)
  const text = say(g, ASK_OUT_LINES, { name: firstName, age, where, he })
  const choices = partner
    ? [
        { id: 'no', label: `I'm with ${partner.firstName}`, emoji: '\u{1F48D}' },
        { id: 'friends', label: 'Just be friends', emoji: '\u{1F91D}' },
      ]
    : [
        { id: 'yes', label: 'Go on a date', emoji: '\u{1F498}' },
        { id: 'friends', label: 'Just be friends', emoji: '\u{1F91D}' },
        { id: 'no', label: 'Turn them down', emoji: '\u{1F645}' },
      ]
  scriptChoice(g, DATE_SCRIPT, 'Asked Out', text, choices, {
    emoji: '\u{1F60D}',
    data: { where, gender, age, firstName, lastName },
  })
  return true
}

// ---------------------------------------------------------------------------
// SOS situations: a stranger's life is in danger

interface SosScenario {
  id: string
  /** Second-person description of what you see. */
  text: string
  /** What the log says when you look away: "I saw ___." */
  saw: string
  win: string
  fail: string
  /** Cause of death if a rescue attempt fails. */
  death: string
  /** False when a failed rescue isn't fatal to the player (only the stranger dies). */
  deadly: boolean
  contexts: SosContext[]
}

export type SosContext = 'walk' | 'hike' | 'zoo' | 'city' | 'beach'

const SOS: SosScenario[] = [
  {
    id: 'drowning',
    text: 'Someone is thrashing in the water and screaming for help. They are drowning!',
    saw: 'someone drowning',
    win: 'You dove in, hooked an arm around them and dragged them back to shore. The crowd erupted in applause.',
    fail: 'You dove in, but the current was far stronger than it looked.',
    death: 'Drowning',
    deadly: true,
    contexts: ['walk', 'beach', 'hike'],
  },
  {
    id: 'dog',
    text: 'A man is on the ground being mauled by a huge, snarling dog!',
    saw: 'a man being attacked by a dog',
    win: 'You grabbed a stick, yelled like a maniac and chased the dog off. The man is bruised but alive.',
    fail: 'You charged in to help, and the dog decided you looked tastier.',
    death: 'Dog Attack',
    deadly: true,
    contexts: ['walk', 'city'],
  },
  {
    id: 'tree',
    text: 'A little kid climbed way too high up a tree and is now dangling from a branch, crying!',
    saw: 'a kid stuck in a tree',
    win: 'You climbed up, talked the kid down branch by branch and got them safely to the ground.',
    fail: 'You climbed up after the kid, but the branch snapped under you.',
    death: 'Falling From a Tree',
    deadly: true,
    contexts: ['walk', 'hike'],
  },
  {
    id: 'car',
    text: 'A car just crashed into a pole. The driver is trapped inside and fuel is leaking everywhere!',
    saw: 'a driver trapped in a burning car',
    win: 'You yanked the door open and pulled the driver out seconds before the car burst into flames.',
    fail: 'You were halfway into the car when it burst into flames.',
    death: 'Car Explosion',
    deadly: true,
    contexts: ['walk', 'city'],
  },
  {
    id: 'mugging',
    text: 'A woman is being held at knifepoint by a mugger in an alley!',
    saw: 'a woman being mugged',
    win: 'You tackled the mugger from behind and pinned him until the police arrived. The woman hugged you and cried.',
    fail: 'You tried to tackle the mugger, but he turned the knife on you.',
    death: 'Stabbing',
    deadly: true,
    contexts: ['walk', 'city'],
  },
  {
    id: 'cpr',
    text: "A stranger just collapsed on the sidewalk in front of you. They aren't breathing!",
    saw: 'a stranger collapse on the sidewalk',
    win: 'You performed CPR until the paramedics arrived. They said you saved a life.',
    fail: "You did CPR for ten minutes, but it wasn't enough. They didn't make it.",
    death: 'Exhaustion',
    deadly: false,
    contexts: ['walk', 'city', 'zoo'],
  },
  {
    id: 'snake',
    text: 'A hiker on the trail was just bitten by a rattlesnake and is turning pale!',
    saw: 'a hiker bitten by a snake',
    win: 'You kept them calm, immobilized the limb and carried them to the trailhead. The doctors said you got them there just in time.',
    fail: 'You tried to suck the venom out like in the movies. Turns out the movies are wrong.',
    death: 'Snake Venom',
    deadly: true,
    contexts: ['hike'],
  },
  {
    id: 'gorilla',
    text: 'A gorilla just escaped its enclosure and is attacking a zookeeper!',
    saw: 'a gorilla attack a zookeeper',
    win: 'You threw your snacks to distract the gorilla while the zookeeper crawled to safety. Everybody filmed it.',
    fail: 'You ran at the gorilla waving your arms. The gorilla was not impressed.',
    death: 'Gorilla Attack',
    deadly: true,
    contexts: ['zoo'],
  },
  {
    id: 'lion',
    text: 'A toddler slipped through the railing and tumbled into the lion exhibit!',
    saw: 'a toddler fall into the lion exhibit',
    win: 'You climbed down, scooped up the toddler and scrambled back over the wall before the lions noticed. Legendary.',
    fail: 'You climbed down after the toddler. The lions noticed you first.',
    death: 'Lion Attack',
    deadly: true,
    contexts: ['zoo'],
  },
  {
    id: 'riptide',
    text: 'A swimmer got caught in a riptide and is being dragged out to sea!',
    saw: 'a swimmer caught in a riptide',
    win: 'You swam parallel to the shore like a pro, reached them and towed them in. The lifeguard offered you a job.',
    fail: 'You swam out to help, and the riptide took you both.',
    death: 'Drowning',
    deadly: true,
    contexts: ['beach'],
  },
]

const SOS_SCRIPT = defineScript('act.encounter.sos', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const sc = SOS.find((s) => s.id === d.id) ?? SOS[0]
  const c = g.character
  if (choice === 'rescue') {
    const p = 0.35 + c.hidden.athleticism / 500 + c.stats.health / 500
    if (chance(g, p)) {
      addHidden(g, 'karma', 25)
      addStat(g, 'happiness', randInt(g, 8, 15))
      count(g, 'livesSaved')
      g.flags.hero = true
      log(g, `I saw ${sc.saw}. I jumped in and saved their life!`, 'good')
      remember(g, `Heroically saved a stranger's life (${sc.saw}).`)
      result(g, 'Hero!', `${sc.win}\n\nYou saved a life today.`, '\u{1F9B8}', 'good')
      return
    }
    if (sc.deadly) {
      g.flags.heroicDeath = true
      log(g, `I saw ${sc.saw} and tried to help.`, 'bad')
      notice(g, 'Tragedy', `${sc.fail}\n\nYou died trying to save a stranger's life.`, { emoji: '\u{1F54A}\u{FE0F}', tone: 'bad' })
      killCharacter(g, sc.death)
      return
    }
    addStat(g, 'happiness', -randInt(g, 5, 10))
    log(g, `I tried to save a stranger, but they didn't make it.`, 'bad')
    result(g, 'Too Late', sc.fail, '\u{1F494}', 'bad')
    return
  }
  if (choice === 'call') {
    if (c.wantedLevel > 0 && chance(g, 0.5)) {
      log(g, `I called the police to report ${sc.saw}, and they recognized me.`, 'bad')
      notice(g, 'Busted', 'The officers who showed up recognized you from a wanted poster. Doing the right thing came at a price.', { emoji: '\u{1F6A8}', tone: 'bad' })
      const crime = [...c.criminalRecord].reverse().find((r) => !r.caught)?.crime ?? 'Outstanding Warrant'
      arrestPlayer(g, crime, Math.max(1, Math.min(5, c.wantedLevel)))
      return
    }
    if (chance(g, 0.55)) {
      addHidden(g, 'karma', 8)
      addStat(g, 'happiness', randInt(g, 3, 6))
      log(g, `I saw ${sc.saw} and called for help. They survived.`, 'good')
      result(g, 'Help Arrived', 'You called emergency services. They arrived just in time, and the stranger is going to make it.', '\u{1F691}', 'good')
    } else {
      addStat(g, 'happiness', -randInt(g, 3, 8))
      log(g, `I saw ${sc.saw} and called for help, but it came too late.`, 'bad')
      result(g, 'Too Late', 'You called emergency services, but by the time they arrived it was too late.', '\u{1F494}', 'bad')
    }
    return
  }
  addHidden(g, 'karma', -6)
  log(g, `I saw ${sc.saw}. I couldn't be bothered to do anything.`, 'bad')
  result(g, 'Looked Away', pick(g, [
    'You looked the other way and kept walking. Somebody else will deal with it. Probably.',
    'You pretended to be very interested in your phone until it was over.',
  ]), '\u{1F648}', 'bad')
})

/** Present a random SOS situation for this context. */
export function presentSos(g: GameState, context: SosContext): void {
  const options = SOS.filter((s) => s.contexts.includes(context))
  const sc = pick(g, options.length ? options : SOS)
  scriptChoice(g, SOS_SCRIPT, 'Emergency!', sc.text, [
    { id: 'rescue', label: 'Attempt a rescue', emoji: '\u{1F9B8}' },
    { id: 'call', label: 'Call emergency services', emoji: '\u{1F4DE}' },
    { id: 'ignore', label: 'Look the other way', emoji: '\u{1F648}' },
  ], { emoji: '\u{1F198}', data: { id: sc.id } })
}
