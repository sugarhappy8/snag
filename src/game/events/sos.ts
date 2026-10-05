// Life-or-death situations: SOS rescues of strangers (you may die trying), choking
// relatives, natural disasters and pet kidnappings.
import { addHidden, count, peopleBy, remember } from '../core'
import { notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import type { GameState, Person } from '../types'
import { anyOf, ch, defineEvents, dollars, money, ownsHome, pets, relWord, say, type Ctx } from './helpers'

interface Sos {
  id: string
  emoji: string
  minAge: number
  /** Second-person situation. */
  text: string
  /** First-person journal fragment: "I saw <seen>". */
  seen: string
  rescue: string
  /** How you die if the rescue goes wrong (cause of death + popup text). */
  cause: string
  death: string
  /** Popup text when you save them yourself. */
  saved: string
  /** Emergency service to call. */
  service: string
}

const SOS: Sos[] = [
  {
    id: 'sos.drowning',
    emoji: '🌊',
    minAge: 12,
    text: 'While walking along the river, you see someone struggling to stay afloat. They are drowning!',
    seen: 'someone drowning in the river',
    rescue: 'Dive in after them',
    cause: 'Drowning',
    death: 'You dove in, but the current was too strong. You both went under.',
    saved: 'You dove into the freezing water and dragged them to shore. They coughed up half the river and thanked you through tears.',
    service: 'Call for help',
  },
  {
    id: 'sos.fire',
    emoji: '🔥',
    minAge: 14,
    text: "Your neighbor's house is on fire and you can hear someone screaming inside!",
    seen: "my neighbor's house on fire with someone trapped inside",
    rescue: 'Run inside',
    cause: 'Smoke Inhalation',
    death: 'You ran into the burning house, but the roof collapsed behind you.',
    saved: 'You kicked down the door, crawled through the smoke and carried your neighbor out just before the roof collapsed!',
    service: 'Call the fire department',
  },
  {
    id: 'sos.snake',
    emoji: '🐍',
    minAge: 12,
    text: 'While hiking, a man in front of you gets bitten by a venomous snake and collapses!',
    seen: 'a man get bitten by a venomous snake',
    rescue: 'Suck out the venom',
    cause: 'Snake Venom',
    death: 'You tried to suck out the venom, but swallowed some. That is not how this works.',
    saved: 'You tied a tourniquet and got him to the trailhead in record time. The doctors said you saved his life.',
    service: 'Call an ambulance',
  },
  {
    id: 'sos.cpr',
    emoji: '🫀',
    minAge: 14,
    text: 'An elderly woman collapses in the grocery store and is not breathing!',
    seen: 'a woman collapse in the grocery store',
    rescue: 'Perform CPR',
    cause: 'Freak Accident',
    death: 'Mid-CPR, a towering display of canned beans collapsed on top of you.',
    saved: 'You performed CPR until she gasped back to life. The whole store applauded.',
    service: 'Call an ambulance',
  },
  {
    id: 'sos.dog',
    emoji: '🐕',
    minAge: 14,
    text: 'A man is being viciously attacked by a huge dog in the park!',
    seen: 'a man being attacked by a dog',
    rescue: 'Fight off the dog',
    cause: 'Dog Mauling',
    death: 'You threw yourself at the dog. The dog was not impressed, and neither were its three friends.',
    saved: 'You grabbed a stick and drove the dog away. The man is badly hurt, but alive thanks to you.',
    service: 'Call animal control',
  },
  {
    id: 'sos.tree',
    emoji: '🌳',
    minAge: 12,
    text: "A small child is stuck high up in a tree and the branch they're holding is cracking!",
    seen: 'a child stuck in a tree',
    rescue: 'Climb up after them',
    cause: 'Falling',
    death: 'You climbed up and handed the child down safely... then the branch snapped under you.',
    saved: 'You climbed up and brought the child down just as the branch gave way. Their parents wept with gratitude.',
    service: 'Call the fire department',
  },
  {
    id: 'sos.mugging',
    emoji: '🔫',
    minAge: 16,
    text: 'A woman is being held at gunpoint by a mugger in an alley!',
    seen: 'a woman being mugged at gunpoint',
    rescue: 'Tackle the mugger',
    cause: 'Gunshot Wound',
    death: 'You tackled the mugger, but the gun went off.',
    saved: 'You tackled the mugger and pinned him until the police arrived. The woman got her purse back and you got a medal from the mayor.',
    service: 'Call the police',
  },
  {
    id: 'sos.car',
    emoji: '🚗',
    minAge: 16,
    text: 'A man is trapped inside a crashed car that is leaking fuel!',
    seen: 'a man trapped in a crashed car leaking fuel',
    rescue: 'Pull him out',
    cause: 'Explosion',
    death: 'You almost had him out when the car exploded.',
    saved: 'You smashed the window and pulled him out seconds before the car burst into flames!',
    service: 'Call an ambulance',
  },
  {
    id: 'sos.tracks',
    emoji: '🚂',
    minAge: 14,
    text: "A woman's foot is stuck in the railroad tracks and a train is coming!",
    seen: 'a woman stuck on the railroad tracks',
    rescue: 'Run onto the tracks',
    cause: 'Train Accident',
    death: 'You freed her foot and pushed her clear... but you did not clear the tracks yourself.',
    saved: 'You yanked her foot free and dove off the tracks with her as the train roared past. Hero!',
    service: 'Call the railroad emergency line',
  },
]

function sosEvent(s: Sos) {
  return {
    id: s.id,
    emoji: s.emoji,
    title: 'SOS',
    minAge: s.minAge,
    maxAge: 85,
    weight: 2,
    cooldown: 12,
    setup: () => ({
      text: `${s.text} What will you do?`,
      choices: [ch('rescue', s.rescue), ch('call', s.service), ch('ignore', 'Look the other way')],
    }),
    resolve: {
      rescue: (g: GameState, x: Ctx) => {
        const c = g.character
        count(g, 'rescueAttempts')
        addHidden(g, 'karma', 25)
        const success = chance(g, 0.62 + c.hidden.athleticism / 400 + c.stats.health / 800)
        if (success) {
          count(g, 'livesSaved')
          g.flags.hero = true
          remember(g, `Saved a stranger's life (${s.seen}).`)
          say(g, x, ['You saved their life!', 'Hero'], s.saved, `I saved the life of a stranger after I saw ${s.seen}.`, { happiness: 16, fame: 2 }, 'good', '🦸')
        } else if (chance(g, 0.5)) {
          say(g, x, 'A hero\'s end', s.death, `I died trying to save a stranger after I saw ${s.seen}.`, { death: s.cause }, 'bad', '🪦')
        } else {
          say(g, x, 'Too late', `You tried your hardest, but you couldn't save them. You were badly hurt in the attempt.`, `I tried to save a stranger after I saw ${s.seen}, but couldn't.`, { health: -20, happiness: -16, condition: { name: 'Severe Bruising', kind: 'injury', severity: 18 } }, 'bad', '🚑')
        }
      },
      call: (g: GameState, x: Ctx) => {
        const c = g.character
        if (c.wantedLevel > 0 && chance(g, 0.5)) {
          say(g, x, 'Recognized', 'The first responders saved the victim... and the police officer who showed up recognized you from a wanted poster.', `I called for help after I saw ${s.seen}, and the police recognized me.`, { karma: 8, arrest: { crime: 'Outstanding Warrant', severity: 2 } }, 'bad', '🚓')
          return
        }
        const ok = chance(g, 0.55)
        say(g, x, ok ? ['Close one', 'Saved'] : 'Too late', ok ? 'Help arrived just in time and the victim survived. Your quick call made the difference.' : 'Help arrived too late. The victim did not survive.', ok ? `I called for help after I saw ${s.seen}. They survived.` : `I called for help after I saw ${s.seen}, but help came too late.`, ok ? { karma: 10, happiness: 6 } : { karma: 4, happiness: -10 }, ok ? 'good' : 'bad', ok ? '🚑' : '🕯️')
      },
      ignore: (g: GameState, x: Ctx) => say(g, x, 'Looked away', 'You looked the other way and kept walking. You will think about this for a long time.', `I saw ${s.seen}. I couldn't be bothered to do anything.`, { karma: -15, happiness: -6 }, 'bad'),
    },
  }
}

const DISASTERS = [
  { kind: 'earthquake', emoji: '🌋', text: 'A magnitude {n} earthquake is shaking your city! Buildings are swaying.' },
  { kind: 'flood', emoji: '🌊', text: 'Torrential rain has flooded your neighborhood and the water is rising fast!' },
  { kind: 'tornado', emoji: '🌪️', text: 'Tornado sirens are blaring and a massive funnel cloud is heading straight for your town!' },
  { kind: 'hurricane', emoji: '🌀', text: 'A Category {n} hurricane is making landfall near your city!' },
  { kind: 'wildfire', emoji: '🔥', text: 'A wildfire is raging out of control in the hills near your home!' },
]

function damageHome(g: GameState): string {
  if (!ownsHome(g)) return ''
  const house = g.assets.find((a) => a.kind === 'house' && a.id === g.character.residence.assetId) ?? g.assets.find((a) => a.kind === 'house')
  if (!house || !chance(g, 0.5)) return ''
  const pct = randInt(g, 5, 20)
  house.value = Math.round(house.value * (1 - pct / 100))
  house.condition = Math.max(0, house.condition - pct * 2)
  return ` Your home at ${house.name} was damaged and lost about ${pct}% of its value.`
}

export const SOS_EVENTS = defineEvents([
  ...SOS.map(sosEvent),
  {
    id: 'sos.disaster',
    emoji: '⛈️',
    title: 'Natural Disaster',
    minAge: 6,
    maxAge: 99,
    weight: 2,
    cooldown: 12,
    setup: (g) => {
      const d = pick(g, DISASTERS)
      const mag = d.kind === 'earthquake' ? `${randInt(g, 6, 8)}.${randInt(g, 0, 9)}` : String(randInt(g, 3, 5))
      return {
        text: `${d.text.replace('{n}', mag)} What will you do?`,
        choices: [ch('shelter', 'Take shelter'), ch('evacuate', 'Evacuate'), ch('help', 'Help my neighbors'), ch('film', 'Film it for social media')],
        emoji: d.emoji,
        data: { kind: d.kind },
      }
    },
    resolve: {
      shelter: (g, x) => {
        const hurt = chance(g, 0.12)
        const dmg = damageHome(g)
        say(g, x, hurt ? 'Shaken up' : 'Survived', `${hurt ? `You took shelter, but debris struck you during the ${x.s('kind')}.` : `You took shelter and rode out the ${x.s('kind')} safely.`}${dmg}`, `I survived a ${x.s('kind')} by taking shelter.`, hurt ? { health: -12, happiness: -8, condition: { name: 'Concussion', kind: 'injury', severity: 15 } } : { happiness: -4 }, hurt ? 'bad' : 'neutral')
      },
      evacuate: (g, x) => {
        const cost = g.character.age >= 18 ? Math.min(Math.max(0, g.character.money), dollars(g, 100, 600)) : 0
        const dmg = damageHome(g)
        say(g, x, 'Evacuated', `You evacuated in time and stayed somewhere safe until the ${x.s('kind')} passed.${cost ? ` It cost you ${money(cost)}.` : ''}${dmg}`, `I evacuated during a ${x.s('kind')}.`, { money: -cost, happiness: -4 })
      },
      help: (g, x) => {
        const hurt = chance(g, 0.3)
        say(g, x, hurt ? 'Wounded hero' : ['Community hero', 'Neighborly'], hurt ? `You helped pull neighbors to safety during the ${x.s('kind')}, but were injured in the process.` : `You helped evacuate the elderly couple next door and a family of five during the ${x.s('kind')}. The local news called you a hero.`, `I helped my neighbors during a ${x.s('kind')}.`, hurt ? { karma: 15, health: -15, condition: { name: 'Broken Wrist', kind: 'injury', severity: 15 } } : { karma: 15, happiness: 10, fame: 2 }, hurt ? 'bad' : 'good', '🦸')
      },
      film: (g, x) => {
        const r = randInt(g, 1, 100)
        if (r <= 3) return say(g, x, 'Final upload', `You got the shot of a lifetime. It was also your last.`, `I died filming a ${x.s('kind')}.`, { death: `${uc(x.s('kind'))}` }, 'bad', '🪦')
        if (r <= 25) return say(g, x, 'Bad idea', `You got too close filming the ${x.s('kind')} and were hit by flying debris.`, `I got hurt filming a ${x.s('kind')}.`, { health: -15, condition: { name: 'Concussion', kind: 'injury', severity: 15 } }, 'bad')
        say(g, x, ['Gone viral', 'Storm chaser'], `Your footage of the ${x.s('kind')} went viral and was picked up by the national news!`, `My footage of a ${x.s('kind')} went viral.`, { fame: 4, happiness: 8, karma: -2 }, 'good', '📹')
      },
    },
  },
  {
    id: 'sos.choking',
    emoji: '😵',
    title: 'Choking',
    minAge: 10,
    maxAge: 95,
    weight: 2,
    cooldown: 15,
    when: (g) => family(g).length > 0,
    setup: (g) => {
      const p = anyOf(g, family(g))
      if (!p) return null
      const food = pick(g, ['a chunk of steak', 'a grape', 'a piece of hard candy', 'a hot dog', 'a meatball', 'a pretzel'])
      return {
        text: `Your ${relWord(p)}, ${p.firstName}, is choking on ${food} and turning blue! What will you do?`,
        choices: [ch('heimlich', 'Perform the Heimlich maneuver'), ch('ambulance', 'Call an ambulance'), ch('nothing', 'Do nothing')],
        person: p,
        data: { food },
      }
    },
    resolve: {
      heimlich: (g, x) => {
        const ok = chance(g, 0.75)
        if (ok) {
          count(g, 'livesSaved')
          if (x.p) notePerson(x.p, 'The player saved their life with the Heimlich maneuver.')
          say(g, x, ['Lifesaver', 'Hero'], `You performed the Heimlich maneuver and ${x.s('food')} shot across the room. ${x.p?.firstName ?? 'They'} hugged you and wouldn't let go.`, `I saved ${relName(x.p)} from choking with the Heimlich maneuver.`, { rel: 25, karma: 10, happiness: 10 }, 'good', '🦸')
        } else {
          say(g, x, 'Close call', `Your Heimlich didn't work, but the paramedics arrived just in time. ${x.p?.firstName ?? 'They'} spent the night in the hospital and will be okay.`, `${uc(relName(x.p))} nearly choked to death. The paramedics saved them.`, { rel: 5, happiness: -8 }, 'bad', '🚑')
          if (x.p) x.p.stats.health = Math.max(5, x.p.stats.health - 20)
        }
      },
      ambulance: (g, x) => {
        const ok = chance(g, 0.6)
        say(g, x, ok ? 'Just in time' : 'Hospitalized', ok ? `The paramedics arrived and dislodged ${x.s('food')} in seconds. ${x.p?.firstName ?? 'They'} will be fine.` : `By the time the ambulance arrived, ${x.p?.firstName ?? 'they'} had passed out. They pulled through after a week in the hospital.`, `I called an ambulance when ${relName(x.p)} was choking.`, ok ? { rel: 10, karma: 4 } : { rel: -5, happiness: -8 }, ok ? 'good' : 'bad', '🚑')
        if (!ok && x.p) x.p.stats.health = Math.max(5, x.p.stats.health - 25)
      },
      nothing: (g, x) => say(g, x, 'Negligence', `You stood there and watched. ${x.p?.firstName ?? 'They'} eventually coughed it up on their own and will never forget that you did nothing.`, `I did nothing while ${relName(x.p)} was choking.`, { rel: -40, karma: -15 }, 'bad'),
    },
  },
  {
    id: 'sos.petRansom',
    emoji: '💰',
    title: 'Ransom',
    minAge: 21,
    maxAge: 99,
    weight: 3,
    once: true,
    when: (g) => pets(g).length > 0 && g.character.money >= 25000,
    setup: (g) => {
      const pet = anyOf(g, pets(g))
      if (!pet) return null
      const ransom = Math.max(5000, Math.round(Math.min(g.character.money * 0.15, 250000) / 1000) * 1000)
      return {
        text: `Kidnappers have taken your ${(pet.species ?? 'pet').toLowerCase()}, ${pet.firstName}, and are holding it for ransom! They are demanding ${money(ransom)} in cash for its safe return and warned you not to involve the police. What will you do?`,
        choices: [ch('pay', `Pay the ${money(ransom)} ransom`), ch('police', 'Involve the police'), ch('nothing', 'Do nothing')],
        person: pet,
        data: { ransom },
      }
    },
    resolve: {
      pay: (g, x) => {
        const ransom = x.n('ransom')
        if (g.character.money < ransom) return lostPet(g, x, "You couldn't come up with the cash in time.")
        if (chance(g, 0.7)) say(g, x, 'Reunited', `You exchanged a briefcase containing ${money(ransom)} for ${x.p?.firstName ?? 'your pet'}'s safe return.`, `I paid a ${money(ransom)} ransom to get my pet, ${x.p?.firstName ?? ''}, back.`, { money: -ransom, happiness: 8, rel: 10 }, 'good', '🥹')
        else lostPet(g, x, `You paid ${money(ransom)}, but the kidnappers never returned ${x.p?.firstName ?? 'your pet'}.`, ransom)
      },
      police: (g, x) => {
        if (chance(g, 0.55)) say(g, x, ['Arrest them, officers!', 'Law enforcement FTW'], `The cops managed to rescue ${x.p?.firstName ?? 'your pet'} and arrest its kidnappers.`, `The police rescued my pet, ${x.p?.firstName ?? ''}, from kidnappers.`, { happiness: 10, rel: 10 }, 'good', '🚓')
        else lostPet(g, x, 'The kidnappers spotted the police and vanished.')
      },
      nothing: (g, x) => lostPet(g, x, 'You did nothing and never heard from the kidnappers again.'),
    },
  },
])

function lostPet(g: GameState, x: Ctx, why: string, paid = 0): void {
  const pet = x.p
  if (pet) {
    pet.alive = false
    pet.livesWithPlayer = false
    pet.causeOfDeath = 'Kidnapped'
  }
  say(g, x, ['A tragedy', 'Gone'], `${why} ${pet?.firstName ?? 'Your pet'} is presumed dead.`, `My pet, ${pet?.firstName ?? ''}, was kidnapped and never returned.`, { happiness: -20, money: -paid }, 'bad', '🕯️')
}

function family(g: GameState): Person[] {
  return peopleBy(g, ['parent', 'sibling', 'spouse', 'partner', 'fiance', 'child', 'grandchild', 'grandparent']).filter((p) => p.age >= 1)
}

function relName(p: Person | undefined): string {
  return p ? `my ${relWord(p)}, ${p.firstName}` : 'a family member'
}

function uc(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

