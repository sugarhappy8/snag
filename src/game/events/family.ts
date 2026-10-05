// Family events: relatives asking for money, parents' health scares, sibling weddings,
// kids misbehaving, report cards, partners who snore, in-laws and pet antics.
import { peopleBy, spouse } from '../core'
import { createPerson } from '../people'
import { chance, pick, randInt } from '../rng'
import type { GameState, Person } from '../types'
import {
  country,
  anyOf,
  ch,
  defineEvents,
  dollars,
  kids,
  livesWithParents,
  money,
  partner,
  pets,
  pr,
  relWord,
  say,
  siblings,
  yourRel,
  type Ctx,
} from './helpers'
import { hasSnow, locale } from '../data/locales'
import { feastHoliday } from './adult'

const PET_ACTS = [
  { act: 'chewed up your favorite shoes', species: ['Dog'] },
  { act: 'peed on the living room rug', species: ['Dog', 'Cat', 'Rabbit'] },
  { act: 'knocked a glass of water off the table while maintaining eye contact', species: ['Cat'] },
  { act: 'has been yowling at 4 AM every night', species: ['Cat'] },
  { act: 'dug up the entire backyard', species: ['Dog'] },
  { act: 'escaped its cage and hid in the couch for two days', species: ['Hamster', 'Rabbit', 'Snake', 'Lizard'] },
  { act: 'ate an entire birthday cake off the counter', species: ['Dog', 'Pig', 'Goat'] },
  { act: 'learned to say a word you really wish it hadn\'t', species: ['Parrot'] },
]

function nm(x: Ctx): string {
  return x.p?.firstName ?? 'them'
}

export const FAMILY_EVENTS = defineEvents([
  {
    id: 'family.borrowMoney',
    emoji: '💸',
    title: 'Family Loan',
    minAge: 20,
    maxAge: 99,
    cooldown: 6,
    when: (g: GameState) => askers(g).length > 0 && g.character.money > 300,
    setup: (g: GameState) => {
      const p = anyOf(g, askers(g))
      if (!p) return null
      const amt = Math.max(100, Math.round(dollars(g, 200, 3000) / 50) * 50)
      const why = pick(g, ['pay their rent', 'fix their car', 'pay off a gambling debt', 'start a food truck', 'cover a medical bill', 'buy a "sure thing" stock', 'pay for a vacation they already booked'])
      return {
        text: `${uc(yourRel(p))}, is asking to borrow ${money(amt)} to ${why}. What will you do?`,
        choices: [ch('give', 'Give it to them'), ch('lend', 'Lend it, but expect it back'), ch('less', 'Offer half'), ch('refuse', 'Refuse')],
        person: p,
        data: { amt, why },
      }
    },
    resolve: {
      give: (g: GameState, x: Ctx) => {
        const amt = x.n('amt')
        if (g.character.money < amt) return say(g, x, "Can't afford it", `You don't have ${money(amt)} to give. ${nm(x)} understood, mostly.`, null, { rel: -2 })
        if (x.p) x.p.money += amt
        say(g, x, ['Generous', 'Family first'], `You gave ${nm(x)} ${money(amt)} to ${x.s('why')}. They were overwhelmed with gratitude.`, `I gave ${money(amt)} to ${myRelOf(x.p)} to ${x.s('why')}.`, { money: -amt, rel: 18, karma: 6 }, 'good', '💝')
      },
      lend: (g: GameState, x: Ctx) => {
        const amt = x.n('amt')
        if (g.character.money < amt) return say(g, x, "Can't afford it", `You don't have ${money(amt)} to lend.`, null, { rel: -2 })
        const back = chance(g, 0.45)
        if (back) {
          say(g, x, 'Paid in full', `You lent ${nm(x)} ${money(amt)}, and incredibly, they paid you back with a thank-you card.`, `I lent ${money(amt)} to ${myRelOf(x.p)} and got it back.`, { rel: 10 }, 'good')
        } else {
          say(g, x, 'Never seeing that again', `You lent ${nm(x)} ${money(amt)}. Every time you bring it up, they suddenly have to go.`, `I lent ${money(amt)} to ${myRelOf(x.p)} and never got it back.`, { money: -amt, rel: 4, happiness: -4 })
          if (x.p) x.p.money += amt
        }
      },
      less: (g: GameState, x: Ctx) => {
        const amt = Math.round(x.n('amt') / 2)
        if (g.character.money < amt) return say(g, x, "Can't afford it", "Even half is more than you've got right now.", null, {})
        if (x.p) x.p.money += amt
        say(g, x, 'Compromise', `You offered ${money(amt)}. ${nm(x)} took it, a little disappointed.`, `I gave ${money(amt)} to ${myRelOf(x.p)}.`, { money: -amt, rel: 6 })
      },
      refuse: (g: GameState, x: Ctx) => say(g, x, 'Tough love', `You told ${nm(x)} no. Family dinners will be awkward for a while.`, `I refused to lend money to ${myRelOf(x.p)}.`, { rel: -12 }, 'bad'),
    },
  },
  {
    id: 'family.parentHealth',
    emoji: '🏥',
    title: 'Health Scare',
    minAge: 20,
    maxAge: 80,
    cooldown: 8,
    when: (g: GameState) => peopleBy(g, ['parent']).some((p) => p.age >= 55),
    setup: (g: GameState) => {
      const p = anyOf(g, peopleBy(g, ['parent']).filter((q) => q.age >= 55))
      if (!p) return null
      const what = pick(g, ['a minor heart attack', 'a bad fall', 'pneumonia', 'a kidney stone the size of a marble', 'a scary dizzy spell'])
      return {
        text: `${uc(yourRel(p))}, was rushed to the hospital after ${what}. ${pr(p).He} is stable for now. What will you do?`,
        choices: [ch('visit', 'Rush to the hospital'), ch('flowers', 'Send flowers'), ch('call', 'Give them a call'), ch('nothing', 'Do nothing')],
        person: p,
        data: { what },
      }
    },
    resolve: {
      visit: (g: GameState, x: Ctx) => {
        if (x.p) x.p.stats.health = Math.min(100, x.p.stats.health + 5)
        say(g, x, 'By their side', `You rushed to the hospital and stayed by ${nm(x)}'s side. ${x.p ? pr(x.p).He : 'They'} squeezed your hand and cried.`, `I visited ${myRelOf(x.p)} in the hospital after ${x.s('what')}.`, { rel: 20, karma: 4, happiness: -2 }, 'good', '❤️')
      },
      flowers: (g: GameState, x: Ctx) => say(g, x, 'Thoughtful', `You sent a big bouquet. ${nm(x)} said the nurses were very impressed.`, `I sent flowers to ${myRelOf(x.p)} in the hospital.`, { rel: 8, money: -Math.min(Math.max(0, g.character.money), 60) }),
      call: (g: GameState, x: Ctx) => say(g, x, 'Checked in', `You called ${nm(x)}, who insisted they were "totally fine" while monitors beeped in the background.`, `I called ${myRelOf(x.p)} in the hospital.`, { rel: 4 }),
      nothing: (g: GameState, x: Ctx) => say(g, x, 'Absent', `You didn't reach out. ${nm(x)} noticed.`, `I didn't reach out when ${myRelOf(x.p)} was in the hospital.`, { rel: -20, karma: -6 }, 'bad'),
    },
  },
  {
    id: 'family.siblingWedding',
    emoji: '💒',
    title: 'Sibling Wedding',
    minAge: 16,
    maxAge: 80,
    cooldown: 8,
    when: (g: GameState) => siblings(g).some((s) => s.age >= 21),
    setup: (g: GameState) => {
      const s = anyOf(g, siblings(g).filter((q) => q.age >= 21))
      if (!s) return null
      return {
        text: `${uc(yourRel(s))}, is getting married and asked you to give a toast at the reception. What will you do?`,
        choices: [ch('heartfelt', 'Give a heartfelt toast'), ch('roast', 'Roast them'), ch('stories', 'Tell embarrassing childhood stories'), ch('decline', 'Decline to speak')],
        person: s,
      }
    },
    resolve: {
      heartfelt: (g: GameState, x: Ctx) => say(g, x, 'Not a dry eye', `Your toast had the whole room in tears. ${nm(x)} hugged you for a full minute.`, `I gave a heartfelt toast at ${myRelOf(x.p)}'s wedding.`, { rel: 18, happiness: 8 }, 'good', '🥂'),
      roast: (g: GameState, x: Ctx) => {
        const hit = chance(g, 0.5)
        say(g, x, hit ? 'Comedy gold' : 'Bombed', hit ? 'Your roast killed. Even the grandparents were wheezing.' : 'Your roast bombed. A cousin booed. The DJ started playing music to drown you out.', `I roasted ${myRelOf(x.p)} at their wedding.`, hit ? { rel: 10, happiness: 8 } : { rel: -12, happiness: -8 }, hit ? 'good' : 'bad', '🎤')
      },
      stories: (g: GameState, x: Ctx) => say(g, x, 'Mortifying', `You told the story about ${nm(x)} getting stuck in a doggy door. The new in-laws will never look at them the same.`, `I told embarrassing stories at ${myRelOf(x.p)}'s wedding.`, { rel: -8, happiness: 6 }),
      decline: (g: GameState, x: Ctx) => say(g, x, 'Stage fright', `You declined to speak. ${nm(x)} said it was fine. It was not fine.`, `I declined to give a toast at ${myRelOf(x.p)}'s wedding.`, { rel: -10 }),
    },
  },
  {
    id: 'family.childBehavior',
    emoji: '😧',
    title: 'Behavior',
    minAge: 20,
    maxAge: 80,
    cooldown: 4,
    when: (g: GameState) => kids(g, 4, 16).length > 0,
    setup: (g: GameState) => {
      const k = anyOf(g, kids(g, 4, 16))
      if (!k) return null
      const act = k.age < 10 ? pick(g, ['drew on the walls with permanent marker', 'bit a kid at school', 'flushed your car keys down the toilet', 'told the neighbor they smell like feet', 'cut the cat\'s whiskers']) : pick(g, ['got caught cheating on a test', 'was suspended for fighting', 'snuck out at 2 AM', 'dyed the dog blue', 'racked up $400 in mobile game purchases on your card'])
      return {
        text: `Your ${relWord(k)}, ${k.firstName}, ${act}. What will you do?`,
        choices: [ch('nothing', 'Do nothing'), ch('ground', 'Ground them'), ch('talk', 'Have a talk with them'), ch('yell', 'Yell at them')],
        person: k,
        data: { act },
      }
    },
    resolve: {
      nothing: (g: GameState, x: Ctx) => say(g, x, 'Hands off', `You let it slide. ${nm(x)} learned that there are no consequences in this house.`, `My child, ${nm(x)}, ${x.s('act')}. I did nothing.`, { rel: 2 }),
      ground: (g: GameState, x: Ctx) => {
        const days = pick(g, [3, 7, 14, 30])
        say(g, x, "You're grounded", `You grounded ${nm(x)} for ${days} days! They slammed their door so hard a picture fell off the wall.`, `I grounded my child, ${nm(x)}, for ${days} days.`, { rel: -8 })
      },
      talk: (g: GameState, x: Ctx) => {
        const r = randInt(g, 1, 3)
        const reply = r === 1 ? 'They apologized for their actions.' : r === 2 ? 'They told you that they love you.' : 'They rolled their eyes but seemed to get the message.'
        say(g, x, ["Let's talk", 'My dear child'], `You had a calm talk with ${nm(x)} about their behavior. ${reply}`, `I had a talk with my child, ${nm(x)}, about their behavior.`, { rel: 6, karma: 2 }, 'good')
      },
      yell: (g: GameState, x: Ctx) => {
        const hate = chance(g, 0.4)
        say(g, x, ['Losing my cool', 'This ends now'], hate ? `You yelled at ${nm(x)}. They screamed "I hate you!" and ran to their room.` : `You yelled at ${nm(x)}. They muttered something under their breath.`, `I yelled at my child, ${nm(x)}.`, { rel: hate ? -15 : -10 }, 'bad')
      },
    },
  },
  {
    id: 'family.childWantsPet',
    emoji: '🐶',
    title: 'Can We Keep It?',
    minAge: 22,
    maxAge: 75,
    cooldown: 8,
    when: (g: GameState) => kids(g, 5, 14).length > 0,
    setup: (g: GameState) => {
      const k = anyOf(g, kids(g, 5, 14))
      if (!k) return null
      const species = pick(g, ['Dog', 'Cat', 'Hamster', 'Rabbit'])
      return {
        text: `Your ${relWord(k)}, ${k.firstName}, is begging for a ${species.toLowerCase()}. They promise to walk it, feed it and love it forever. What will you do?`,
        choices: [ch('yes', 'Say yes'), ch('fish', 'Offer a goldfish instead'), ch('no', 'Say no')],
        person: k,
        data: { species },
      }
    },
    resolve: {
      yes: (g: GameState, x: Ctx) => {
        const name = pick(g, ['Sprinkles', 'Tank', 'Noodle', 'Pepper', 'Ziggy', 'Mochi', 'Bean'])
        createPerson(g, { relation: 'pet', age: randInt(g, 0, 2), firstName: name, species: x.s('species'), relationship: 70, livesWithPlayer: true })
        say(g, x, 'New family member', `You said yes! ${nm(x)} named the ${x.s('species').toLowerCase()} ${name}. You will be the one feeding it.`, `We got a ${x.s('species').toLowerCase()} named ${name} for my child, ${nm(x)}.`, { rel: 20, happiness: 8, count: 'pets' }, 'good', '🐾')
      },
      fish: (g: GameState, x: Ctx) => say(g, x, 'Compromise', `${nm(x)} accepted a goldfish named "Not A Dog." The resentment is palpable.`, 'I got my child a goldfish instead of the pet they wanted.', { rel: 2 }),
      no: (g: GameState, x: Ctx) => say(g, x, 'Heartbreaker', `You said no. ${nm(x)} cried and drew a picture of the pet they'll never have. It's on the fridge now, haunting you.`, `I told my child, ${nm(x)}, they couldn't have a pet.`, { rel: -10 }, 'bad'),
    },
  },
  {
    id: 'family.reportCard',
    emoji: '📝',
    title: 'Report Card',
    minAge: 22,
    maxAge: 80,
    cooldown: 3,
    when: (g: GameState) => kids(g, 6, 17).length > 0,
    setup: (g: GameState) => {
      const k = anyOf(g, kids(g, 6, 17))
      if (!k) return null
      const good = k.stats.smarts > 55 ? chance(g, 0.75) : chance(g, 0.3)
      const subject = pick(g, ['math', 'science', 'history', 'English', 'art'])
      return {
        text: good ? `Your ${relWord(k)}, ${k.firstName}, brought home a report card with straight A's, including a perfect score in ${subject}! What will you do?` : `Your ${relWord(k)}, ${k.firstName}, brought home a report card with a big fat F in ${subject}. What will you do?`,
        choices: good ? [ch('reward', 'Reward them with $20'), ch('praise', 'Praise them'), ch('expect', 'Say "I expect nothing less"')] : [ch('tutor', 'Hire a tutor'), ch('help', 'Help them study'), ch('punish', 'Take away their phone'), ch('shrug', 'Shrug it off')],
        person: k,
        data: { subject },
      }
    },
    resolve: {
      reward: (g: GameState, x: Ctx) => say(g, x, 'Proud parent', `You gave ${nm(x)} $20. They are already asking about next semester's rates.`, `I rewarded my child, ${nm(x)}, for a great report card.`, { money: -Math.min(Math.max(0, g.character.money), 20), rel: 12, happiness: 6 }, 'good'),
      praise: (g: GameState, x: Ctx) => say(g, x, 'Gold star', `You told ${nm(x)} how proud you are. They beamed for the rest of the week.`, `I praised my child, ${nm(x)}, for a great report card.`, { rel: 10, happiness: 6 }, 'good'),
      expect: (g: GameState, x: Ctx) => say(g, x, 'Tough crowd', `${nm(x)} looked crushed. Straight A's and not even a smile.`, `I told my child, ${nm(x)}, that I expect nothing less than straight A's.`, { rel: -8 }),
      tutor: (g: GameState, x: Ctx) => {
        const cost = dollars(g, 200, 800)
        if (g.character.money < cost) return say(g, x, "Can't afford it", `Tutors cost ${money(cost)}. You can't swing it, so you watched some videos together instead.`, null, { rel: 4 })
        if (x.p) x.p.stats.smarts = Math.min(100, x.p.stats.smarts + 8)
        say(g, x, 'Investment', `You hired a tutor for ${money(cost)}. ${nm(x)}'s ${x.s('subject')} grade jumped to a B!`, `I hired a tutor for my child, ${nm(x)}.`, { money: -cost, rel: 4 }, 'good')
      },
      help: (g: GameState, x: Ctx) => {
        if (x.p) x.p.stats.smarts = Math.min(100, x.p.stats.smarts + 5)
        say(g, x, 'Homework helper', `You sat with ${nm(x)} every night. You both relearned ${x.s('subject')} and their grade improved.`, `I helped my child, ${nm(x)}, study ${x.s('subject')}.`, { rel: 12, smarts: 2 }, 'good')
      },
      punish: (g: GameState, x: Ctx) => say(g, x, 'Phone jail', `You confiscated ${nm(x)}'s phone until the grade improves. They acted like you took a kidney.`, `I took my child's phone away over a bad grade.`, { rel: -10 }),
      shrug: (g: GameState, x: Ctx) => say(g, x, 'Chill parent', `You told ${nm(x)} that ${x.s('subject')} is overrated anyway. They agreed enthusiastically.`, "I shrugged off my child's bad grade.", { rel: 6 }),
    },
  },
  {
    id: 'family.teenSneaking',
    emoji: '🌙',
    title: 'Caught Sneaking Out',
    minAge: 28,
    maxAge: 80,
    cooldown: 6,
    when: (g: GameState) => kids(g, 13, 17).length > 0,
    setup: (g: GameState) => {
      const k = anyOf(g, kids(g, 13, 17))
      if (!k) return null
      return {
        text: `You caught your ${relWord(k)}, ${k.firstName}, climbing back in through the window at 3 AM. What will you do?`,
        choices: [ch('ground', 'Ground them for a month'), ch('talk', 'Ask where they were'), ch('pretend', 'Pretend I didn\'t see'), ch('lock', 'Nail the window shut')],
        person: k,
      }
    },
    resolve: {
      ground: (g: GameState, x: Ctx) => say(g, x, 'Lockdown', `${nm(x)} is grounded for a month. The silent treatment has begun.`, `I grounded my child, ${nm(x)}, for sneaking out.`, { rel: -10 }),
      talk: (g: GameState, x: Ctx) => {
        const where = pick(g, ['a party', 'a concert', "their friend's house playing video games", 'a 24-hour diner', 'a stargazing spot with friends'])
        say(g, x, 'Honest answer', `${nm(x)} admitted they were at ${where}. You had a long, surprisingly good talk.`, `I talked with my child, ${nm(x)}, after they snuck out.`, { rel: 8 }, 'good')
      },
      pretend: (g: GameState, x: Ctx) => say(g, x, 'Plausible deniability', 'You quietly went back to bed. Some battles aren\'t worth fighting at 3 AM.', 'I pretended not to see my child sneaking back in.', { rel: 2 }),
      lock: (g: GameState, x: Ctx) => say(g, x, 'Fortress', `You nailed ${nm(x)}'s window shut. They now use the front door, at 3 AM, very loudly.`, `I nailed my child's window shut after they snuck out.`, { rel: -12, craziness: 2 }),
    },
  },
  {
    id: 'family.adultChildMoney',
    emoji: '🏦',
    title: 'Bank of Mom and Dad',
    minAge: 38,
    maxAge: 99,
    cooldown: 6,
    when: (g: GameState) => kids(g, 18, 70).length > 0 && g.character.money > 500,
    setup: (g: GameState) => {
      const k = anyOf(g, kids(g, 18, 70))
      if (!k) return null
      const amt = Math.round(dollars(g, 500, 8000) / 100) * 100
      const why = pick(g, ['a down payment on a house', country(g).freeUniversity ? 'their university books' : 'their student loans', 'a new car', 'their wedding', 'a business idea involving artisanal ice', 'rent this month'])
      return {
        text: `Your ${relWord(k)}, ${k.firstName}, is asking for ${money(amt)} to help with ${why}. What will you do?`,
        choices: [ch('give', 'Give it to them'), ch('loan', 'Make it a loan'), ch('no', 'Tell them to figure it out')],
        person: k,
        data: { amt, why },
      }
    },
    resolve: {
      give: (g: GameState, x: Ctx) => {
        const amt = x.n('amt')
        if (g.character.money < amt) return say(g, x, "Can't swing it", `You don't have ${money(amt)} to spare. ${nm(x)} said they understand.`, null, { rel: -2 })
        if (x.p) x.p.money += amt
        say(g, x, 'Generous parent', `You gave ${nm(x)} ${money(amt)} for ${x.s('why')}. They hugged you like they were five again.`, `I gave my child, ${nm(x)}, ${money(amt)} for ${x.s('why')}.`, { money: -amt, rel: 15, happiness: 4 }, 'good', '💝')
      },
      loan: (g: GameState, x: Ctx) => {
        const amt = x.n('amt')
        if (g.character.money < amt) return say(g, x, "Can't swing it", `You don't have ${money(amt)} to lend.`, null, {})
        const back = chance(g, 0.5)
        if (x.p && !back) x.p.money += amt
        say(g, x, back ? 'Paid back' : 'Family discount', back ? `${nm(x)} paid back every cent, with interest! You raised them right.` : `${nm(x)} "forgot" about the loan. You'll bring it up at ${feastHoliday(g)}.`, `I lent my child, ${nm(x)}, ${money(amt)}.`, back ? { rel: 10 } : { money: -amt, rel: 4 }, back ? 'good' : 'neutral')
      },
      no: (g: GameState, x: Ctx) => say(g, x, 'Tough love', `You told ${nm(x)} to figure it out. They said "fine" in a tone that was not fine.`, `I refused to give my child, ${nm(x)}, money.`, { rel: -10 }),
    },
  },
  {
    id: 'family.partnerPet',
    emoji: '🐱',
    title: 'Pet Talk',
    minAge: 20,
    maxAge: 80,
    cooldown: 8,
    when: (g: GameState) => !!partner(g) && pets(g).length === 0,
    setup: (g: GameState) => {
      const p = partner(g)
      if (!p) return null
      const species = pick(g, ['Dog', 'Cat', 'Parrot', 'Rabbit'])
      return {
        text: `${uc(yourRel(p))}, wants to adopt a ${species.toLowerCase()} from the shelter. What will you do?`,
        choices: [ch('yes', "Let's do it!"), ch('no', "I'm not ready")],
        person: p,
        data: { species },
      }
    },
    resolve: {
      yes: (g: GameState, x: Ctx) => {
        const name = pick(g, ['Mango', 'Ollie', 'Chewie', 'Lola', 'Waffles', 'Kiwi'])
        createPerson(g, { relation: 'pet', age: randInt(g, 0, 6), firstName: name, species: x.s('species'), relationship: 70, livesWithPlayer: true })
        say(g, x, 'Fur baby', `You adopted a ${x.s('species').toLowerCase()} named ${name}! ${nm(x)} cried happy tears.`, `${uc(myRelOf(x.p))} and I adopted a ${x.s('species').toLowerCase()} named ${name}.`, { rel: 12, happiness: 10, count: ['pets', 'adoptions'] }, 'good', '🐾')
      },
      no: (g: GameState, x: Ctx) => say(g, x, 'Not yet', `You said you weren't ready. ${nm(x)} sent you shelter photos every day for a month.`, `I told ${myRelOf(x.p)} I wasn't ready for a pet.`, { rel: -6 }),
    },
  },
  {
    id: 'family.snoring',
    emoji: '😴',
    title: 'Snoring',
    minAge: 20,
    maxAge: 99,
    cooldown: 10,
    when: (g: GameState) => !!partner(g),
    setup: (g: GameState) => {
      const p = partner(g)
      if (!p) return null
      return {
        text: `${uc(yourRel(p))}, has started snoring like a chainsaw. You haven't slept properly in weeks. What will you do?`,
        choices: [ch('earplugs', 'Buy earplugs'), ch('nudge', 'Nudge them all night'), ch('couch', 'Sleep on the couch'), ch('record', 'Record it as evidence')],
        person: p,
      }
    },
    resolve: {
      earplugs: (g: GameState, x: Ctx) => say(g, x, 'Silence', 'You bought earplugs and slept like a baby. A deaf baby.', 'I bought earplugs because of my partner\'s snoring.', { health: 4, happiness: 2 }, 'good'),
      nudge: (g: GameState, x: Ctx) => say(g, x, 'Elbow warfare', `You nudged ${nm(x)} 47 times. Neither of you slept.`, "I kept nudging my partner to stop snoring.", { rel: -4, health: -2 }),
      couch: (g: GameState, x: Ctx) => say(g, x, 'Couch life', `You moved to the couch. ${nm(x)} was hurt you left.`, 'I started sleeping on the couch because of the snoring.', { rel: -6, health: 2 }),
      record: (g: GameState, x: Ctx) => {
        const funny = chance(g, 0.6)
        say(g, x, funny ? 'Exhibit A' : 'Offended', funny ? `You played the recording. ${nm(x)} laughed until they cried and booked a doctor's appointment.` : `You played the recording. ${nm(x)} insisted it was "doctored" and didn't speak to you for a day.`, "I recorded my partner's snoring as evidence.", funny ? { rel: 4, happiness: 4 } : { rel: -8 })
      },
    },
  },
  {
    id: 'family.inLaws',
    emoji: '🧳',
    title: 'In-Laws',
    minAge: 20,
    maxAge: 90,
    cooldown: 6,
    when: (g: GameState) => !!spouseOf(g),
    setup: (g: GameState) => {
      const s = spouseOf(g)
      if (!s) return null
      return {
        text: `Your ${relWord(s)}'s parents are coming to stay with you for two whole weeks. What will you do?`,
        choices: [ch('gracious', 'Be the perfect host'), ch('work', 'Suddenly have lots of work'), ch('complain', 'Complain the whole time')],
        person: s,
      }
    },
    resolve: {
      gracious: (g: GameState, x: Ctx) => say(g, x, 'Favorite in-law', `You cooked, cleaned and laughed at your father-in-law's jokes. ${nm(x)} has never loved you more.`, 'I hosted my in-laws for two weeks.', { rel: 15, happiness: -4 }, 'good'),
      work: (g: GameState, x: Ctx) => say(g, x, 'Workaholic', `You "worked late" every night for two weeks. ${nm(x)} saw right through it.`, 'I avoided my in-laws by working late.', { rel: -8 }),
      complain: (g: GameState, x: Ctx) => say(g, x, 'Tension', `You complained nonstop. Your mother-in-law overheard. ${nm(x)} is furious.`, 'I complained about my in-laws during their visit.', { rel: -15, happiness: 2 }, 'bad'),
    },
  },
  {
    id: 'family.anniversary',
    emoji: '💐',
    title: 'Anniversary',
    minAge: 20,
    maxAge: 99,
    cooldown: 4,
    when: (g: GameState) => !!spouseOf(g),
    setup: (g: GameState) => {
      const s = spouseOf(g)
      if (!s) return null
      return {
        text: `You just realized your wedding anniversary with ${s.firstName} is tomorrow and you haven't planned anything. What will you do?`,
        choices: [ch('dinner', 'Book a fancy dinner'), ch('card', 'Make a handmade card'), ch('weekend', 'Plan a surprise weekend getaway'), ch('forget', 'Hope they forgot too')],
        person: s,
      }
    },
    resolve: {
      dinner: (g: GameState, x: Ctx) => {
        const cost = dollars(g, 100, 300)
        if (g.character.money < cost) return say(g, x, 'Romance on a budget', `Every fancy place was out of your budget, so you cooked dinner by candlelight. ${nm(x)} loved it.`, `I cooked a candlelit anniversary dinner for ${nm(x)}.`, { rel: 12, happiness: 6 }, 'good')
        say(g, x, 'Romantic', `You took ${nm(x)} to a fancy restaurant for ${money(cost)}. They had no idea you almost forgot.`, `I took ${nm(x)} out for our anniversary.`, { money: -cost, rel: 12, happiness: 6 }, 'good', '🍷')
      },
      card: (g: GameState, x: Ctx) => say(g, x, 'Sweet', `You made a card with glitter and a terrible drawing of the two of you. ${nm(x)} put it on the fridge.`, `I made ${nm(x)} a handmade anniversary card.`, { rel: 8 }, 'good'),
      weekend: (g: GameState, x: Ctx) => {
        const cost = dollars(g, 400, 1500)
        if (g.character.money < cost) return say(g, x, 'Staycation', `You couldn't afford a getaway, so you built a blanket fort and ordered takeout. ${nm(x)} said it was perfect.`, 'I celebrated my anniversary with a blanket fort.', { rel: 10, happiness: 6 }, 'good')
        say(g, x, ['Swept off their feet', 'Romance level: expert'], `You whisked ${nm(x)} away for a surprise weekend getaway. They're still talking about it.`, `I surprised ${nm(x)} with an anniversary getaway.`, { money: -cost, rel: 20, happiness: 10 }, 'good', '🏖️')
      },
      forget: (g: GameState, x: Ctx) => {
        const forgot = chance(g, 0.2)
        say(g, x, forgot ? 'Phew' : 'Doghouse', forgot ? `${nm(x)} forgot too! You both laughed about it a week later.` : `${nm(x)} had not forgotten. They had planned a whole evening. You are in the doghouse.`, forgot ? 'My spouse and I both forgot our anniversary.' : 'I forgot my wedding anniversary.', forgot ? { happiness: 2 } : { rel: -20, happiness: -6 }, forgot ? 'neutral' : 'bad')
      },
    },
  },
  {
    id: 'family.parentsVisit',
    emoji: '🚪',
    title: 'Surprise Visit',
    minAge: 20,
    maxAge: 70,
    cooldown: 5,
    when: (g: GameState) => !livesWithParents(g) && peopleBy(g, ['parent']).length > 0 && g.character.residence.status !== 'homeless',
    setup: (g: GameState) => {
      const p = anyOf(g, peopleBy(g, ['parent']))
      if (!p) return null
      return {
        text: `${uc(yourRel(p))}, just showed up unannounced at your door "to see how you're living." Your place is a disaster. What will you do?`,
        choices: [ch('welcome', 'Welcome them in'), ch('hide', 'Pretend I\'m not home'), ch('cafe', 'Take them out for coffee instead')],
        person: p,
      }
    },
    resolve: {
      welcome: (g: GameState, x: Ctx) => say(g, x, 'Judged', `You let ${nm(x)} in. They silently started doing your dishes. It was both kind and devastating.`, `My ${x.p ? relWord(x.p) : 'parent'} made a surprise visit.`, { rel: 8, happiness: -2 }),
      hide: (g: GameState, x: Ctx) => {
        const caught = chance(g, 0.4)
        say(g, x, caught ? 'Busted' : 'Stealth mode', caught ? `${nm(x)} saw you through the window. They waved slowly. You will never live this down.` : `You hid behind the couch until ${nm(x)} left. Mission accomplished.`, `I pretended not to be home when my ${x.p ? relWord(x.p) : 'parent'} visited.`, caught ? { rel: -15 } : { rel: -3 }, caught ? 'bad' : 'neutral')
      },
      cafe: (g: GameState, x: Ctx) => say(g, x, 'Smooth', `You whisked ${nm(x)} away to a cafe before they could see inside. A lovely afternoon!`, `I took my ${x.p ? relWord(x.p) : 'parent'} out for coffee.`, { rel: 10, happiness: 4, money: -Math.min(Math.max(0, g.character.money), 15) }, 'good'),
    },
  },
  {
    id: 'family.grandparentStory',
    emoji: '👴',
    title: 'Back in My Day',
    minAge: 5,
    maxAge: 35,
    cooldown: 6,
    when: (g: GameState) => peopleBy(g, ['grandparent']).length > 0,
    setup: (g: GameState) => {
      const p = anyOf(g, peopleBy(g, ['grandparent']))
      if (!p) return null
      return {
        text: `${uc(yourRel(p))}, is telling you the story about walking uphill both ways to school ${hasSnow(g) ? 'in the snow' : locale(g).climate === 'tropical' ? 'in the monsoon rain' : 'in the blazing sun'}. For the ninth time. What will you do?`,
        choices: [ch('listen', 'Listen like it\'s the first time'), ch('sleep', 'Fall asleep'), ch('money', 'Ask for money'), ch('correct', 'Point out the plot holes')],
        person: p,
      }
    },
    resolve: {
      listen: (g: GameState, x: Ctx) => say(g, x, 'Grandkid of the year', `You listened intently. ${nm(x)} added a new detail about a wolf this time.`, `I listened to my ${x.p ? relWord(x.p) : 'grandparent'}'s stories.`, { rel: 12, smarts: 2 }, 'good'),
      sleep: (g: GameState, x: Ctx) => say(g, x, 'Zzz', `You fell asleep. ${nm(x)} kept talking for twenty more minutes before noticing.`, `I fell asleep while my ${x.p ? relWord(x.p) : 'grandparent'} told a story.`, { rel: -4, health: 2 }),
      money: (g: GameState, x: Ctx) => {
        const amt = chance(g, 0.6) ? randInt(g, 5, 50) : 0
        say(g, x, amt ? 'Cha-ching' : 'Nope', amt ? `${nm(x)} chuckled and slipped you $${amt}. "Don't tell your parents."` : `${nm(x)} said "money doesn't grow on trees" and started a new story about trees.`, amt ? `My ${x.p ? relWord(x.p) : 'grandparent'} gave me $${amt}.` : null, amt ? { money: amt, rel: -2, happiness: 4 } : { rel: -4 })
      },
      correct: (g: GameState, x: Ctx) => say(g, x, 'Fact checker', `You pointed out that you can't walk uphill both ways. ${nm(x)} said "you weren't there."`, `I pointed out the plot holes in my ${x.p ? relWord(x.p) : 'grandparent'}'s story.`, { rel: -6, smarts: 2 }),
    },
  },
  {
    id: 'family.petBehavior',
    emoji: '🐾',
    title: 'Bad Pet',
    minAge: 6,
    maxAge: 99,
    cooldown: 5,
    when: (g: GameState) => pets(g).length > 0,
    setup: (g: GameState) => {
      const pet = anyOf(g, pets(g))
      if (!pet) return null
      const options = PET_ACTS.filter((a) => a.species.includes(pet.species ?? ''))
      const act = options.length ? pick(g, options).act : 'knocked over a lamp and broke it'
      return {
        text: `Your ${(pet.species ?? 'pet').toLowerCase()}, ${pet.firstName}, ${act}. What will you do?`,
        choices: [ch('train', 'Train it not to do that'), ch('yell', 'Yell at it'), ch('reward', 'Reward it'), ch('nothing', 'Do nothing')],
        person: pet,
        data: { act },
      }
    },
    resolve: {
      train: (g: GameState, x: Ctx) => {
        const ok = chance(g, 0.6)
        say(g, x, ok ? ["Let's not do that", 'Good training'] : 'Stubborn', ok ? `You worked with ${nm(x)} on its behavior. It seems to be learning!` : `You tried to train ${nm(x)}. It stared at you and did it again.`, `I worked with my pet, ${nm(x)}, on its behavior.`, ok ? { rel: 6, happiness: 2 } : { happiness: -2 }, ok ? 'good' : 'neutral')
      },
      yell: (g: GameState, x: Ctx) => say(g, x, ['Take that', 'Bad pet!'], `You yelled at ${nm(x)}. It hid under the bed for the rest of the day.`, `I yelled at my pet, ${nm(x)}.`, { rel: -10 }),
      reward: (g: GameState, x: Ctx) => say(g, x, ["That's my pet", "Isn't it cute?"], `You gave ${nm(x)} a treat. You may be part of the problem.`, `I rewarded my pet, ${nm(x)}, for misbehaving.`, { rel: 8, happiness: 2 }),
      nothing: (g: GameState, x: Ctx) => say(g, x, 'Whatever', `You let it go. ${nm(x)} has learned there are no rules.`, `My pet, ${nm(x)}, ${x.s('act')}. I decided not to address its behavior.`, {}),
    },
  },
  {
    id: 'family.petEscape',
    emoji: '💨',
    title: 'Escape',
    minAge: 6,
    maxAge: 99,
    cooldown: 8,
    weight: 4,
    when: (g: GameState) => pets(g).length > 0,
    setup: (g: GameState) => {
      const pet = anyOf(g, pets(g))
      if (!pet) return null
      return {
        text: `You came home to discover that your ${(pet.species ?? 'pet').toLowerCase()}, ${pet.firstName}, escaped! What will you do?`,
        choices: [ch('look', 'Look for it everywhere'), ch('posters', 'Put up posters'), ch('wait', 'Wait for it to come back')],
        person: pet,
      }
    },
    resolve: {
      look: (g: GameState, x: Ctx) => {
        const r = randInt(g, 1, 10)
        if (r <= 7) {
          const where = pick(g, ['hiding in a bush', "napping on a neighbor's porch", 'begging for food at a pizza place', 'sitting in a stranger\'s car', 'chasing squirrels in the park'])
          say(g, x, ['Phew', 'Thank goodness'], `You found ${nm(x)} ${where}!`, `My pet, ${nm(x)}, escaped. I found it ${where}.`, { rel: 6, happiness: 6 }, 'good')
        } else if (r <= 9) {
          say(g, x, ['No luck', 'Looked everywhere'], `You weren't able to find ${nm(x)} anywhere. Maybe it will turn up.`, `My pet, ${nm(x)}, escaped and I couldn't find it.`, { happiness: -10 }, 'bad')
          if (x.p) x.p.relationship = Math.max(0, x.p.relationship - 10)
        } else {
          if (x.p) {
            x.p.alive = false
            x.p.livesWithPlayer = false
            x.p.causeOfDeath = 'Hit by a Car'
          }
          say(g, x, ['A tragedy', 'Not my pet!'], `You found ${nm(x)} on the side of the road. It had been hit by a car.`, `My pet, ${nm(x)}, escaped and was hit by a car.`, { happiness: -20 }, 'bad', '🕯️')
        }
      },
      posters: (g: GameState, x: Ctx) => {
        const ok = chance(g, 0.75)
        say(g, x, ok ? 'Found!' : 'Still missing', ok ? `A stranger called after seeing your poster. ${nm(x)} is home safe!` : `You put up 200 posters. Nobody has called yet.`, ok ? `A stranger returned my pet, ${nm(x)}, after seeing my posters.` : `I put up posters for my missing pet, ${nm(x)}.`, ok ? { happiness: 8, karma: 2 } : { happiness: -10 }, ok ? 'good' : 'bad')
      },
      wait: (g: GameState, x: Ctx) => {
        const ok = chance(g, 0.6)
        say(g, x, ok ? 'Welcome Home' : 'Gone', ok ? `${nm(x)} wandered back home two days later like nothing happened.` : `${nm(x)} never came back. You leave the porch light on, just in case.`, ok ? `My pet, ${nm(x)}, came home on its own.` : `My pet, ${nm(x)}, ran away and never came back.`, ok ? { happiness: 4 } : { happiness: -12 }, ok ? 'good' : 'bad')
        if (!ok && x.p) g.people = g.people.filter((p) => p.id !== x.p?.id)
      },
    },
  },
  {
    id: 'family.siblingJealous',
    emoji: '😒',
    title: 'Sibling Rivalry',
    minAge: 18,
    maxAge: 80,
    cooldown: 10,
    when: (g: GameState) => siblings(g).some((s) => s.age >= 16) && (g.character.money > 50000 || g.character.job !== null),
    setup: (g: GameState) => {
      const s = anyOf(g, siblings(g).filter((q) => q.age >= 16))
      if (!s) return null
      return {
        text: `${uc(yourRel(s))}, has been making snide comments about your success at every family gathering. What will you do?`,
        choices: [ch('talk', 'Talk it out'), ch('help', 'Offer to help them out'), ch('flaunt', 'Flaunt it even more'), ch('ignore', 'Ignore it')],
        person: s,
      }
    },
    resolve: {
      talk: (g: GameState, x: Ctx) => {
        const ok = chance(g, 0.6)
        say(g, x, ok ? 'Breakthrough' : 'Old wounds', ok ? `You and ${nm(x)} talked for hours. It turns out they just missed you.` : `The talk turned into a fight about who Mom loved more in 1998.`, `I talked with ${myRelOf(x.p)} about their jealousy.`, ok ? { rel: 15 } : { rel: -8 }, ok ? 'good' : 'bad')
      },
      help: (g: GameState, x: Ctx) => {
        const amt = Math.min(Math.max(0, g.character.money), dollars(g, 500, 3000))
        if (x.p) x.p.money += amt
        say(g, x, 'Big heart', amt > 0 ? `You offered ${nm(x)} ${money(amt)} and some career advice. They were stunned, then grateful.` : `You offered ${nm(x)} some career advice. They were grateful.`, `I helped out ${myRelOf(x.p)}.`, { money: -amt, rel: 12, karma: 5 }, 'good')
      },
      flaunt: (g: GameState, x: Ctx) => say(g, x, 'Petty', `You showed up to the next family dinner in a rented limo. ${nm(x)} left early.`, `I flaunted my success in front of ${myRelOf(x.p)}.`, { rel: -15, happiness: 4 }),
      ignore: (g: GameState, x: Ctx) => say(g, x, 'Above it', 'You ignored the comments. They lost their sting eventually.', `I ignored ${myRelOf(x.p)}'s snide comments.`, { rel: -2 }),
    },
  },
])

function spouseOf(g: GameState): Person | undefined {
  return spouse(g)
}

function askers(g: GameState): Person[] {
  return peopleBy(g, ['sibling', 'halfSibling', 'stepsibling', 'parent', 'stepparent', 'grandchild']).filter((p) => p.age >= 18)
}

function myRelOf(p: Person | undefined): string {
  return p ? `my ${relWord(p)} ${p.firstName}` : 'a relative'
}

function uc(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

