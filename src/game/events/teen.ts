// Teen events (roughly 12-20): parties, peer pressure, crushes, curfews, sneaking out,
// babysitting gigs, viral videos and driving lessons.
import { preferredGender } from '../core'
import { applyEffects } from '../effects'
import { chance, pick, randInt } from '../rng'
import {
  aParent,
  anyOf,
  canDrink,
  ch,
  conservativeSchooling,
  muslimMajority,
  country,
  defineEvents,
  dollars,
  friends,
  hasCar,
  livesWithParents,
  money,
  partner,
  say,
  strangerName,
} from './helpers'

const BANDS = ['The Velvet Raccoons', 'Glitter Apocalypse', 'DJ Toaster', 'Lil Spreadsheet', 'The Midnight Llamas', 'Neon Grandma', 'Sadboy Summer']

export const TEEN_EVENTS = defineEvents([
  {
    id: 'teen.houseParty',
    emoji: '🥳',
    title: 'Party Time',
    minAge: 14,
    maxAge: 19,
    cooldown: 3,
    // Not a default part of growing up where schooling is conservative (Saudi Arabia, Pakistan...).
    when: (g) => !conservativeSchooling(g),
    setup: (g) => {
      const f = anyOf(g, friends(g))
      const host = f?.firstName ?? strangerName(g).first
      return {
        text: `${f ? `Your friend ${host}` : `A kid named ${host}`} is throwing a huge party while their parents are out of town. There will definitely be alcohol. What will you do?`,
        choices: [ch('drink', "I'm in, pass me a drink"), ch('sober', 'Go, but stay sober'), ch('excuse', 'Make up an excuse'), ch('no', 'No thanks')],
        person: f,
        data: { host },
      }
    },
    resolve: {
      drink: (g, x) => {
        const legal = canDrink(g)
        const roll = randInt(g, 1, 100)
        if (roll <= 12 && !legal) {
          say(g, x, 'Party crashed', `The cops broke up ${x.s('host')}'s party. Your parents had to pick you up from the police station.`, 'I got caught drinking underage when the cops broke up a party.', { happiness: -12, rel: 2, rels: [{ p: aParent(g), d: -15 }] }, 'bad', '🚓')
        } else if (roll <= 30) {
          say(g, x, ['Never again', 'Hangover'], 'You drank way too much and threw up in a potted plant. You do not remember getting home.', `I drank too much at ${x.s('host')}'s party and threw up.`, { happiness: -4, health: -8, rel: 4 }, 'bad', '🤢')
        } else {
          say(g, x, ['Wild night', 'Life of the party'], `You had an amazing time at ${x.s('host')}'s party and danced on the kitchen counter.`, `I partied hard at ${x.s('host')}'s house.`, { happiness: 14, health: -3, rel: 8 }, 'good', '🎉')
        }
      },
      sober: (g, x) => say(g, x, ['Designated driver', 'Good times'], 'You went, stayed sober and had a blast watching everyone else make bad decisions.', `I went to ${x.s('host')}'s party and stayed sober.`, { happiness: 8, rel: 6 }, 'good'),
      excuse: (g, x) => say(g, x, 'Cover story', `You told ${x.s('host')} you had a family thing. You actually just wanted to sleep.`, `I made up an excuse to skip ${x.s('host')}'s party.`, { rel: -3 }),
      no: (g, x) => say(g, x, 'Homebody', 'You stayed home. Your feed was full of party photos all night.', `I turned down an invite to ${x.s('host')}'s party.`, { happiness: -2, rel: -4 }),
    },
  },
  {
    id: 'teen.peerPressure',
    emoji: '🌿',
    title: 'Peer Pressure',
    minAge: 14,
    maxAge: 22,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      const name = f?.firstName ?? strangerName(g).first
      return {
        text: `${f ? `Your friend ${name}` : `An older kid named ${name}`} is passing around a joint behind the school gym and offers it to you. What will you do?`,
        choices: [ch('yes', 'Try it'), ch('excuse', 'Make up an excuse'), ch('no', 'No way!')],
        person: f,
        data: { name },
      }
    },
    resolve: {
      yes: (g, x) => {
        const caught = chance(g, 0.1)
        if (caught) {
          say(g, x, 'Busted', 'A teacher caught you red-handed. Your parents were called and you got suspended.', 'I got caught smoking weed behind the school gym.', { happiness: -10, smarts: -4, count: 'drugs', grades: -8, rels: [{ p: aParent(g), d: -15 }] }, 'bad', '🚨')
        } else {
          const addicted = chance(g, 0.04)
          say(g, x, ['Giggles', 'Munchies'], `You took a puff, coughed for a full minute, then laughed at a squirrel for an hour.${addicted ? " You can't stop thinking about doing it again." : ''}`, `I smoked weed with ${x.s('name')}.`, { happiness: 6, smarts: -4, health: -2, rel: 6, count: 'drugs', condition: addicted ? { name: 'Marijuana Addiction', kind: 'addiction', severity: 15 } : undefined }, 'neutral', '🌿')
        }
      },
      excuse: (g, x) => {
        const plan = pick(g, ['go to my grandma\'s', 'walk my dog', 'study for a test', 'go to the dentist'])
        say(g, x, 'Smooth exit', `You told ${x.s('name')} you had to ${plan}. They shrugged.`, `I lied and told them I had to ${plan} instead.`, { rel: -2 })
      },
      no: (g, x) => say(g, x, ['Just say no', 'Strong will'], `You said no. ${x.s('name')} called you lame, but you feel great about it.`, 'I turned down weed when it was offered to me.', { health: 2, karma: 2, rel: -5 }, 'good'),
    },
  },
  {
    id: 'teen.crush',
    emoji: '💌',
    title: 'Secret Admirer',
    minAge: 13,
    maxAge: 19,
    when: (g) => !partner(g),
    setup: (g) => {
      const gender = preferredGender(g)
      const s = strangerName(g, gender)
      return {
        text: `A classmate named ${s.first} ${s.last} slipped a note into your locker. It says: "Do you like me? Check yes or no." What will you do?`,
        choices: [ch('yes', 'Check yes'), ch('no', 'Check no'), ch('show', 'Show the note to everyone')],
        data: { first: s.first, last: s.last, gender },
      }
    },
    resolve: {
      yes: (g, x) => {
        const official = g.character.age >= 14 && chance(g, 0.6)
        if (official) applyEffects(g, { newPerson: { relation: 'partner', firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', age: g.character.age + randInt(g, -1, 1) } })
        say(g, x, ['Butterflies', 'Young love'], official ? `You checked yes! You and ${x.s('first')} are officially dating.` : `You checked yes! You and ${x.s('first')} held hands at lunch and then never spoke again.`, `I checked "yes" on a note from ${x.s('first')} ${x.s('last')}.`, { happiness: 12, count: official ? 'partners' : [] }, 'good', '💕')
      },
      no: (g, x) => say(g, x, 'Let them down easy', `You checked no. ${x.s('first')} avoided eye contact for the rest of the year.`, `I turned down ${x.s('first')} ${x.s('last')}'s note.`, { karma: 1 }),
      show: (g, x) => say(g, x, ['Heartless', 'Cruel'], `You showed the note to everyone. ${x.s('first')} was mortified and transferred to another homeroom.`, `I humiliated ${x.s('first')} ${x.s('last')} by showing their love note to everyone.`, { karma: -10, happiness: 2 }, 'bad'),
    },
  },
  {
    id: 'teen.sneakOut',
    emoji: '🌙',
    title: 'Sneaking Out',
    minAge: 14,
    maxAge: 17,
    when: (g) => livesWithParents(g) && !!aParent(g),
    setup: (g) => {
      const band = pick(g, BANDS)
      return {
        text: `${band} is playing a secret late-night show across town, but your parents said absolutely not. What will you do?`,
        choices: [ch('window', 'Sneak out the window'), ch('ask', 'Ask again nicely'), ch('stay', 'Stay home')],
        person: aParent(g),
        data: { band },
      }
    },
    resolve: {
      window: (g, x) => {
        const caught = chance(g, 0.35)
        say(g, x, caught ? ['Busted', 'Grounded for life'] : ['Rock and roll', 'Best night ever'], caught ? `Your parent was waiting in your bedroom when you climbed back in at 3 AM. You're grounded until you're 30.` : `You climbed out the window and saw ${x.s('band')} live. Absolutely worth it.`, caught ? 'I snuck out to a concert and got caught.' : `I snuck out to see ${x.s('band')} play live.`, caught ? { happiness: -8, rel: -15 } : { happiness: 16 }, caught ? 'bad' : 'good', caught ? '🚨' : '🎸')
      },
      ask: (g, x) => {
        const ok = chance(g, (x.p?.relationship ?? 50) / 150)
        say(g, x, ok ? 'They caved' : 'Still no', ok ? `You asked so nicely that your parents caved, on the condition that they drive you. Embarrassing, but you got to see ${x.s('band')}!` : 'You asked again. The answer was still no. A firmer no.', ok ? `My parents let me go see ${x.s('band')} play.` : 'My parents said no to a late-night concert.', ok ? { happiness: 10, rel: 4 } : { happiness: -4 }, ok ? 'good' : 'neutral')
      },
      stay: (g, x) => say(g, x, 'Good kid', 'You stayed home and watched shaky concert videos online.', `I stayed home instead of sneaking out to see ${x.s('band')}.`, { rel: 4, happiness: -2 }),
    },
  },
  {
    id: 'teen.curfew',
    emoji: '⏰',
    title: 'Curfew',
    minAge: 13,
    maxAge: 17,
    when: (g) => livesWithParents(g) && !!aParent(g),
    setup: (g) => {
      const p = aParent(g)
      const time = pick(g, ['8 PM', '9 PM', '9:30 PM', '10 PM'])
      return {
        text: `Your ${p?.gender === 'male' ? 'father' : 'mother'} just announced a strict ${time} curfew. What will you do?`,
        choices: [ch('accept', 'Accept it'), ch('negotiate', 'Negotiate'), ch('argue', 'Argue'), ch('ignore', 'Ignore it')],
        person: p,
        data: { time },
      }
    },
    resolve: {
      accept: (g, x) => say(g, x, 'Rule follower', `You accepted the ${x.s('time')} curfew without complaint. Your parent is suspicious of how calm you are.`, `I accepted a ${x.s('time')} curfew.`, { rel: 6 }, 'good'),
      negotiate: (g, x) => {
        const ok = chance(g, 0.5 + g.character.stats.smarts / 400)
        say(g, x, ok ? 'Dealmaker' : 'Denied', ok ? 'You presented a well-reasoned argument and got an extra hour. Future lawyer.' : 'You negotiated hard. They said "my house, my rules."', ok ? 'I negotiated a later curfew.' : 'I tried to negotiate my curfew. It did not work.', ok ? { smarts: 4, rel: 2 } : { rel: -2 }, ok ? 'good' : 'neutral')
      },
      argue: (g, x) => say(g, x, 'Shouting match', 'You argued until both of you were red in the face. The curfew is now an hour earlier.', 'I argued with my parent about my curfew.', { rel: -10, happiness: -4 }, 'bad'),
      ignore: (g, x) => {
        const caught = chance(g, 0.6)
        say(g, x, caught ? 'Grounded' : 'Night owl', caught ? 'You strolled in two hours late. Your phone was confiscated for a month.' : 'You ignored the curfew and nobody noticed. Yet.', 'I ignored my curfew.', caught ? { rel: -12, happiness: -8 } : { happiness: 4, rel: -2 }, caught ? 'bad' : 'neutral')
      },
    },
  },
  {
    id: 'teen.babysit',
    emoji: '🍼',
    title: 'Babysitting',
    minAge: 12,
    maxAge: 18,
    setup: (g) => {
      const n = randInt(g, 1, 3)
      const pay = dollars(g, 30, 80)
      return {
        text: `Your neighbors need someone to babysit their ${n === 1 ? 'kid' : `${n} kids`} on Saturday night. They're offering ${money(pay)}. What will you do?`,
        choices: [ch('accept', 'Accept'), ch('more', 'Ask for more money'), ch('decline', 'Decline')],
        data: { pay, n },
      }
    },
    resolve: {
      accept: (g, x) => {
        const chaos = chance(g, 0.3)
        const pay = x.n('pay')
        say(g, x, chaos ? 'Survived' : 'Easy money', chaos ? `The kids flooded the bathroom and painted the dog, but you survived. You earned ${money(pay)}.` : `The kids went to bed on time and you ate their snacks. Easy ${money(pay)}.`, `I babysat for the neighbors and earned ${money(pay)}.`, { money: pay, happiness: chaos ? -2 : 4, karma: 2 }, 'good', '💵')
      },
      more: (g, x) => {
        const ok = chance(g, 0.45)
        const pay = Math.round(x.n('pay') * 1.5)
        if (ok) say(g, x, 'Negotiator', `They agreed to ${money(pay)}! Capitalism at its finest.`, `I negotiated ${money(pay)} for a babysitting job.`, { money: pay, smarts: 2 }, 'good', '💵')
        else say(g, x, 'Priced out', 'They said "never mind" and hired the kid down the street.', 'I lost a babysitting gig by asking for more money.', { happiness: -2 })
      },
      decline: (g) => say(g, null, 'Free Saturday', 'You declined. Your Saturday night remains child-free.', 'I turned down a babysitting job.', {}),
    },
  },
  {
    id: 'teen.viralVideo',
    emoji: '📱',
    title: 'Gone Viral',
    minAge: 13,
    maxAge: 30,
    setup: (g) => {
      const what = pick(g, ['tripping up the stairs at school', 'singing badly in the car', 'getting attacked by a goose', 'falling asleep in class and snoring', 'dancing alone in a parking lot', 'losing a fight with an automatic door'])
      return {
        text: `Someone posted a video of you ${what} and it has gone viral with millions of views. What will you do?`,
        choices: [ch('own', 'Own it and make more content'), ch('delete', 'Beg them to take it down'), ch('hide', 'Hide from the internet forever')],
        data: { what },
      }
    },
    resolve: {
      own: (g, x) => {
        const big = chance(g, 0.3)
        say(g, x, big ? 'Internet famous' : 'Fifteen minutes', big ? 'You leaned in and made a whole series. A brand sent you free sneakers!' : 'You made a follow-up video. It got 12 views. The moment has passed.', `A video of me ${x.s('what')} went viral and I leaned into it.`, big ? { happiness: 10, fame: 6 } : { happiness: 2, fame: 1 }, big ? 'good' : 'neutral', '🌟')
      },
      delete: (g, x) => say(g, x, 'Too late', 'They took it down, but it had already been reposted 40,000 times.', `A video of me ${x.s('what')} went viral. I asked for it to be taken down.`, { happiness: -6, fame: 1 }, 'bad'),
      hide: (g, x) => say(g, x, 'Off the grid', 'You deleted every app and stayed offline for a month. It was actually kind of peaceful.', `A video of me ${x.s('what')} went viral, so I went offline for a month.`, { happiness: -2, smarts: 2 }),
    },
  },
  {
    id: 'teen.fakeId',
    emoji: '🪪',
    title: 'Fake ID',
    minAge: 15,
    maxAge: 20,
    when: (g) => !canDrink(g) && !muslimMajority(g),
    setup: (g) => {
      const f = anyOf(g, friends(g))
      const price = dollars(g, 40, 120)
      return {
        text: `${f ? `Your friend ${f.firstName}` : 'A kid at school'} can get you a fake ID for ${money(price)}. ${g.character.countryId === 'us' ? 'It says your name is "McLovin."' : 'The photo looks nothing like you.'} What will you do?`,
        choices: [ch('buy', 'Buy it'), ch('no', 'Pass'), ch('report', 'Report them')],
        person: f,
        data: { price },
      }
    },
    resolve: {
      buy: (g, x) => {
        const price = x.n('price')
        if (g.character.money < price) {
          say(g, x, 'Insufficient funds', "You couldn't afford the fake ID. Probably for the best.", null, { happiness: -2 })
          return
        }
        const caught = chance(g, 0.15)
        if (caught) {
          say(g, x, 'Confiscated', 'The first bouncer you showed it to laughed, cut it in half, and called the police.', 'I got caught using a fake ID.', { money: -price, happiness: -8, count: 'crimes', arrest: { crime: 'Possession of a Fake ID', severity: 1 } }, 'bad', '🚓')
        } else {
          say(g, x, ['New identity', 'Totally legit'], 'You bought it. It somehow works at the corner store. Nowhere else.', 'I bought a fake ID.', { money: -price, happiness: 6, karma: -2, count: 'crimes' })
        }
      },
      no: (g) => say(g, null, 'Patience', "You passed. You'll be old enough soon enough.", 'I turned down a fake ID.', {}),
      report: (g, x) => say(g, x, 'Narc', 'You reported the fake ID operation. Several people are now very mad at you.', 'I reported someone selling fake IDs.', { karma: 3, rel: -25 }),
    },
  },
  {
    id: 'teen.graffiti',
    emoji: '🎨',
    title: 'Street Art',
    minAge: 13,
    maxAge: 22,
    setup: () => ({
      text: 'Your friends dare you to spray paint your name on the side of the town water tower. What will you do?',
      choices: [ch('spray', 'Do it'), ch('mural', 'Paint a legal mural instead'), ch('no', 'Refuse')],
    }),
    resolve: {
      spray: (g) => {
        const caught = chance(g, 0.2)
        if (caught && g.character.age >= 14) {
          say(g, null, 'Caught in the act', 'A patrol car rolled up while you were halfway through your last name.', 'I got caught spray painting the town water tower.', { count: 'crimes', karma: -4, arrest: { crime: 'Vandalism', severity: 1 } }, 'bad', '🚓')
        } else {
          say(g, null, ['Legendary', 'Tagged'], 'You climbed up and painted your name in giant letters. It will be visible for years.', 'I spray painted my name on the town water tower.', { happiness: 10, karma: -4, notoriety: 2, count: 'crimes' })
        }
      },
      mural: (g) => say(g, null, 'Artist', 'You got permission to paint a mural at the community center. People actually love it.', 'I painted a mural at the community center.', { happiness: 8, smarts: 4, karma: 4 }, 'good'),
      no: (g) => say(g, null, 'Chicken?', 'You refused. Your friends made chicken noises all the way home.', 'I refused a dare to vandalize the water tower.', { happiness: -2 }),
    },
  },
  {
    id: 'teen.groupChat',
    emoji: '💬',
    title: 'Screenshot',
    minAge: 13,
    maxAge: 25,
    when: (g) => friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      return {
        text: `Someone screenshotted a message where you trashed ${f.firstName}'s new haircut, and now ${f.firstName} has seen it. What will you do?`,
        choices: [ch('apologize', 'Apologize'), ch('deny', 'Say I was hacked'), ch('double', 'Double down')],
        person: f,
      }
    },
    resolve: {
      apologize: (g, x) => {
        const ok = chance(g, 0.65)
        say(g, x, ok ? 'Forgiven' : 'Still hurt', ok ? `${x.p?.firstName ?? 'Your friend'} accepted your apology. You promised to never talk behind their back again.` : `${x.p?.firstName ?? 'Your friend'} said "it's fine" in a way that means it is definitely not fine.`, 'I apologized to my friend after they saw me trash-talking them.', ok ? { rel: -4, karma: 2 } : { rel: -12 }, ok ? 'good' : 'bad')
      },
      deny: (g, x) => {
        const believed = chance(g, 0.25)
        say(g, x, believed ? 'Hacker defense' : 'Nobody believes you', believed ? 'Incredibly, they believed you were hacked.' : "You claimed you were hacked. Nobody bought it, and now you're a liar too.", 'I claimed I was hacked after a mean message leaked.', believed ? { karma: -3 } : { rel: -20, karma: -3 }, believed ? 'neutral' : 'bad')
      },
      double: (g, x) => say(g, x, ['Savage', 'Friendship over'], 'You said the haircut really is that bad. The friendship did not survive.', 'I doubled down on insulting my friend\'s haircut.', { rel: -35, count: 'insults' }, 'bad'),
    },
  },
  {
    id: 'teen.drivingLesson',
    emoji: '🚗',
    title: 'Driving Lesson',
    minAge: 14,
    maxAge: 18,
    once: true,
    when: (g) => !!aParent(g) && g.character.age >= country(g).drivingAge - 1 && !g.character.licenses.includes('driver'),
    setup: (g) => {
      const p = aParent(g)
      return {
        text: `Your ${p?.gender === 'male' ? 'father' : 'mother'} offers to give you a driving lesson in the family car. Where do you want to practice?`,
        choices: [ch('lot', 'An empty parking lot'), ch('highway', 'The highway'), ch('no', 'Maybe another time')],
        person: p,
      }
    },
    resolve: {
      lot: (g, x) => say(g, x, 'Learner', 'You practiced in an empty parking lot and only hit one shopping cart.', 'I practiced driving in a parking lot with my parent.', { smarts: 4, rel: 6 }, 'good'),
      highway: (g, x) => {
        const bad = chance(g, 0.4)
        say(g, x, bad ? 'White knuckles' : 'Natural', bad ? 'You merged onto the highway at 22 mph. Your parent aged ten years in ten minutes.' : 'You handled the highway like a pro. Your parent unclenched eventually.', 'I practiced driving on the highway with my parent.', bad ? { rel: -4, happiness: -2 } : { smarts: 4, rel: 6, happiness: 4 }, bad ? 'bad' : 'good')
      },
      no: (g, x) => say(g, x, 'Passenger', 'You said maybe another time. Public transit it is.', 'I turned down a driving lesson from my parent.', { rel: -2 }),
    },
  },
  {
    id: 'teen.parentSnoop',
    emoji: '🕵️',
    title: 'Privacy',
    minAge: 13,
    maxAge: 17,
    when: (g) => livesWithParents(g) && !!aParent(g),
    setup: (g) => ({
      text: 'You caught your parent going through your phone. What will you do?',
      choices: [ch('hand', 'Let them look'), ch('password', 'Change my password'), ch('argue', 'Argue about privacy'), ch('cry', 'Cry')],
      person: aParent(g),
    }),
    resolve: {
      hand: (g, x) => say(g, x, 'Nothing to hide', 'You let them scroll. They found nothing but memes and were a little embarrassed.', 'I let my parent look through my phone.', { rel: 6 }, 'good'),
      password: (g, x) => say(g, x, 'Locked out', 'You changed your password to 27 random characters. Cold war initiated.', 'I changed my phone password after my parent snooped.', { rel: -6, smarts: 2 }),
      argue: (g, x) => {
        const won = chance(g, 0.4)
        say(g, x, won ? 'Rights respected' : 'Lost the debate', won ? 'You made a passionate case for privacy. Your parent actually apologized.' : 'You argued about privacy. Your parent said "you can have privacy when you pay the phone bill."', 'I argued with my parent about privacy.', won ? { rel: 2, smarts: 2 } : { rel: -8 }, won ? 'good' : 'bad')
      },
      cry: (g, x) => say(g, x, 'Emotional', 'You burst into tears. Your parent felt so guilty they gave the phone back and took you for ice cream.', 'I cried when my parent went through my phone.', { happiness: -2, rel: 2 }),
    },
  },
  {
    id: 'teen.concert',
    emoji: '🎤',
    title: 'Concert',
    minAge: 13,
    maxAge: 50,
    when: (g) => friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      const band = pick(g, BANDS)
      return {
        text: `Your friend ${f.firstName} has two tickets to see ${band} and invites you to go. What will you do?`,
        choices: [ch('go', "Let's go!"), ch('no', "I don't feel like it")],
        person: f,
        data: { band },
      }
    },
    resolve: {
      go: (g, x) => {
        const bad = chance(g, 0.15)
        say(g, x, bad ? 'Mosh pit' : ['Unforgettable', 'Rock on'], bad ? `You went to see ${x.s('band')} with ${x.p?.firstName ?? 'your friend'} and got elbowed in the face in the mosh pit. Still worth it.` : `You and ${x.p?.firstName ?? 'your friend'} screamed every lyric at the ${x.s('band')} concert. Best night of the year.`, `I went to a ${x.s('band')} concert with my friend ${x.p?.firstName ?? ''}.`, bad ? { happiness: 6, health: -4, rel: 8 } : { happiness: 12, rel: 10 }, 'good', '🎸')
      },
      no: (g, x) => say(g, x, 'Rain check', `You passed. ${x.p?.firstName ?? 'Your friend'} took someone else and posted about it all night.`, `I turned down concert tickets from my friend ${x.p?.firstName ?? ''}.`, { rel: -6 }),
    },
  },
  {
    id: 'teen.wrongText',
    emoji: '📲',
    title: 'Wrong Chat',
    minAge: 13,
    maxAge: 30,
    setup: (g) => {
      const s = strangerName(g, preferredGender(g))
      return {
        text: `You meant to text your best friend "I think ${s.first} is SO cute," but you accidentally sent it to ${s.first}. Three dots are appearing... What will you do?`,
        choices: [ch('own', 'Own it'), ch('joke', 'Say it was a joke'), ch('throw', 'Throw my phone in a lake')],
        data: { first: s.first, last: s.last, gender: s.gender },
      }
    },
    resolve: {
      own: (g, x) => {
        const mutual = chance(g, 0.35) && !partner(g) && g.character.age >= 14
        if (mutual) applyEffects(g, { newPerson: { relation: 'partner', firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', age: g.character.age + randInt(g, -2, 2) } })
        say(g, x, mutual ? ['Smooth accident', 'It\'s mutual!'] : 'Left on read', mutual ? `${x.s('first')} replied: "I think you're cute too." You're officially dating!` : `${x.s('first')} replied "haha thanks" and nothing else. Ouch.`, mutual ? `I accidentally confessed my crush to ${x.s('first')}, and they liked me back!` : `I accidentally confessed my crush to ${x.s('first')}.`, mutual ? { happiness: 14, count: 'partners' } : { happiness: -8 }, mutual ? 'good' : 'bad')
      },
      joke: (g, x) => say(g, x, 'Damage control', `You said "lol that was a joke, wrong chat." ${x.s('first')} replied "oh." Forever ambiguous.`, `I pretended a text confessing my crush on ${x.s('first')} was a joke.`, { happiness: -4 }),
      throw: (g) => say(g, null, 'Dramatic exit', 'You threw your phone into the nearest body of water. Problem solved. New problem: no phone.', 'I threw my phone in a lake after sending a text to the wrong person.', { happiness: -6, money: -Math.min(Math.max(0, g.character.money), 200) }, 'bad', '🌊'),
    },
  },
  {
    id: 'teen.firstJobInterview',
    emoji: '🍔',
    title: 'Summer Plans',
    minAge: 14,
    maxAge: 17,
    when: (g) => g.character.partTimeJob === null && g.character.job === null,
    setup: () => ({
      text: 'Summer vacation is here. How will you spend it?',
      choices: [ch('camp', 'Be a camp counselor'), ch('chill', 'Sleep until noon every day'), ch('study', 'Take summer classes'), ch('volunteer', 'Volunteer at the animal shelter')],
    }),
    resolve: {
      camp: (g) => {
        const pay = dollars(g, 300, 900)
        say(g, null, 'Camp life', `You spent the summer leading campfire songs and earned ${money(pay)}. You are also covered in mosquito bites.`, `I worked as a summer camp counselor and earned ${money(pay)}.`, { money: pay, happiness: 8, health: 2 }, 'good', '🏕️')
      },
      chill: (g) => say(g, null, 'Peak laziness', 'You slept until noon every single day. Your circadian rhythm has left the building.', 'I spent the summer sleeping in.', { happiness: 8, health: -2 }),
      study: (g) => say(g, null, 'Overachiever', 'You took summer classes and got ahead. Your friends were at the beach.', 'I took summer classes.', { smarts: 8, happiness: -4, grades: 4, count: 'studied' }, 'good', '📚'),
      volunteer: (g) => say(g, null, 'Heart of gold', 'You spent the summer walking shelter dogs. Twelve of them found homes!', 'I volunteered at an animal shelter over the summer.', { karma: 10, happiness: 8 }, 'good', '🐶'),
    },
  },
  {
    id: 'teen.borrowCar',
    emoji: '🔑',
    title: 'Car Keys',
    minAge: 16,
    maxAge: 19,
    when: (g) => livesWithParents(g) && !!aParent(g) && g.character.licenses.includes('driver') && !hasCar(g),
    setup: (g) => ({
      text: "You want to borrow your parents' car to drive your friends to the beach. What will you do?",
      choices: [ch('ask', 'Ask politely'), ch('take', 'Take it without asking'), ch('bus', 'Take the bus')],
      person: aParent(g),
    }),
    resolve: {
      ask: (g, x) => {
        const ok = chance(g, (x.p?.relationship ?? 50) / 110)
        say(g, x, ok ? 'Road trip' : 'Denied', ok ? 'They tossed you the keys with 47 warnings. You had a blast at the beach.' : 'They said no, citing "the incident with the mailbox."', ok ? "I borrowed my parents' car and drove my friends to the beach." : "My parents wouldn't let me borrow the car.", ok ? { happiness: 10, rel: 2 } : { happiness: -4 }, ok ? 'good' : 'neutral')
      },
      take: (g, x) => {
        const caught = chance(g, 0.5)
        say(g, x, caught ? 'Grand theft parental' : 'Smooth', caught ? 'You returned the car with sand in every crevice. Your parents noticed immediately. Grounded.' : 'You took the car, had an amazing day and parked it back in the exact same spot.', "I took my parents' car without asking.", caught ? { happiness: -6, rel: -15 } : { happiness: 10, karma: -3 }, caught ? 'bad' : 'neutral')
      },
      bus: (g) => say(g, null, 'Public transit', 'You took the bus. It took three hours and smelled like soup.', 'I took the bus to the beach with my friends.', { happiness: 4 }),
    },
  },
])
