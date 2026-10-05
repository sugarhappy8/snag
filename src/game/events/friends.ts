// Friend events: new friends, advice, best-friend requests, rumors, unfriending,
// insurance fraud schemes, alibis, moving day, late-night flat tires and interventions.
import { removePerson } from '../core'
import { createPerson } from '../people'
import { chance, pick, randInt } from '../rng'
import type { GameState, Person } from '../types'
import { anyOf, canDrink, ch, defineEvents, dollars, friends, money, muslimMajority, say, strangerName, type Ctx } from './helpers'

function nm(x: Ctx): string {
  return x.p?.firstName ?? 'your friend'
}

function plainFriends(g: GameState): Person[] {
  return g.people.filter((p) => p.alive && p.relation === 'friend')
}

const ADVICE = [
  'is thinking about quitting their job to become a professional yodeler',
  'wants to know whether they should get back together with their ex',
  'is wondering if they should move across the country for a crush',
  'wants to know if they should tell their roommate they hate their cooking',
  'is thinking about getting a face tattoo',
  'is considering investing their life savings in a meme coin',
]

const RUMORS = ['still wets the bed', 'is secretly a furry', 'cheated on a spelling test', 'sleeps with a night light', 'has a crush on a teacher', 'eats cereal with orange juice']

export const FRIEND_EVENTS = defineEvents([
  {
    id: 'friend.newFriend',
    emoji: '🤗',
    title: 'New Friend',
    minAge: 6,
    maxAge: 95,
    cooldown: 3,
    setup: (g) => {
      const s = strangerName(g)
      const where = g.character.age < 18 ? pick(g, ['at school', 'at the park', 'at summer camp', 'at the library']) : pick(g, ['at the gym', 'at a coffee shop', 'at the dog park', 'in your building', 'at a concert'])
      return {
        text: `A person named ${s.first} ${s.last} you met ${where} wants to become your friend. What will you do?`,
        choices: [ch('yes', 'Become friends with them'), ch('no', 'Reject them')],
        data: { first: s.first, last: s.last, gender: s.gender },
      }
    },
    resolve: {
      yes: (g, x) => {
        const age = Math.max(4, g.character.age + randInt(g, g.character.age < 18 ? -1 : -8, g.character.age < 18 ? 1 : 8))
        createPerson(g, { relation: 'friend', age, firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', relationship: 65 })
        say(g, x, ['New friend!', 'Friendship unlocked'], `You and ${x.s('first')} are now friends!`, `I became friends with ${x.s('first')} ${x.s('last')}.`, { happiness: 6 }, 'good', '🤝')
      },
      no: (g, x) => say(g, x, 'Rejected', `You turned down ${x.s('first')}'s friendship. They looked heartbroken.`, `I rejected ${x.s('first')}'s offer of friendship.`, { happiness: -8, karma: -2 }),
    },
  },
  {
    id: 'friend.advice',
    emoji: '👂',
    title: 'Advice',
    minAge: 10,
    maxAge: 95,
    when: (g) => friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      return {
        text: `Your friend ${f.firstName} ${pick(g, ADVICE)}. What will you do?`,
        choices: [ch('good', 'Give them good advice'), ch('bad', 'Give them bad advice'), ch('cant', "Tell them I can't help"), ch('ignore', 'Ignore them')],
        person: f,
      }
    },
    resolve: {
      good: (g, x) => say(g, x, 'Wise friend', `You gave ${nm(x)} the best advice you could. They really appreciated it.`, 'I gave my friend the best advice I could.', { rel: 10, karma: 3 }, 'good'),
      bad: (g, x) => say(g, x, 'Chaos agent', `You intentionally gave ${nm(x)} terrible advice. They took it. Things are going... poorly for them.`, 'I intentionally misled my friend with bad advice.', { rel: -6, karma: -8, happiness: 2 }),
      cant: (g, x) => say(g, x, 'Out of my depth', `You told ${nm(x)} you couldn't help with that. They understood.`, "I told my friend that I couldn't help with that.", { rel: -2 }),
      ignore: (g, x) => say(g, x, 'Ghosted', `You left ${nm(x)} on read. They noticed.`, 'I ignored my friend when they asked for advice.', { rel: -10 }, 'bad'),
    },
  },
  {
    id: 'friend.bestFriend',
    emoji: '💛',
    title: 'Best Friends',
    minAge: 6,
    maxAge: 95,
    cooldown: 6,
    when: (g) => plainFriends(g).some((p) => p.relationship >= 55),
    setup: (g) => {
      const f = anyOf(g, plainFriends(g).filter((p) => p.relationship >= 55))
      if (!f) return null
      const current = g.people.find((p) => p.alive && p.relation === 'bestFriend')
      return {
        text: `Your friend ${f.firstName} wants to become best friends with you.${current ? ` (You are already best friends with ${current.firstName}.)` : ''} What will you do?`,
        choices: [ch('yes', 'Agree to become best friends'), ch('no', 'Stay as friends only')],
        person: f,
        other: current,
      }
    },
    resolve: {
      yes: (g, x) => {
        if (x.q) {
          x.q.relation = 'friend'
          x.q.relationship = Math.max(0, x.q.relationship - 20)
        }
        if (x.p) x.p.relation = 'bestFriend'
        say(g, x, ['BFFs', 'Besties'], `You and ${nm(x)} are now best friends!${x.q ? ` ${x.q.firstName} is not thrilled about being demoted.` : ''}`, `My friend ${nm(x)} and I became best friends.`, { rel: 15, happiness: 8 }, 'good', '💛')
      },
      no: (g, x) => say(g, x, 'Just friends', `You told ${nm(x)} you'd rather stay just friends. Awkward.`, `I turned down being best friends with ${nm(x)}.`, { rel: -12 }),
    },
  },
  {
    id: 'friend.rumor',
    emoji: '😈',
    title: 'Rumor',
    minAge: 8,
    maxAge: 70,
    when: (g) => friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      const rumor = pick(g, RUMORS)
      return {
        text: `Your friend ${f.firstName} started a rumor that you ${rumor}. What will you do?`,
        choices: [ch('counter', 'Start a rumor about them'), ch('confront', 'Confront them'), ch('deny', 'Deny it'), ch('ignore', "It doesn't bother me")],
        person: f,
        data: { rumor },
      }
    },
    resolve: {
      counter: (g, x) => {
        const r = pick(g, RUMORS)
        say(g, x, 'Rumor war', `You started a rumor that ${nm(x)} ${r}. Mutually assured destruction.`, `I started a rumor that ${nm(x)} ${r}.`, { rel: -15, karma: -5 })
      },
      confront: (g, x) => {
        const fight = chance(g, 0.3)
        say(g, x, fight ? 'Scuffle' : 'Apology', fight ? `You confronted ${nm(x)} and it turned into a shoving match.` : `You confronted ${nm(x)}, who apologized and admitted they were jealous.`, `I confronted my friend ${nm(x)} about a rumor.`, fight ? { rel: -20, health: -4, count: 'fights' } : { rel: 4 }, fight ? 'bad' : 'neutral')
      },
      deny: (g, x) => {
        const r = randInt(g, 1, 3)
        say(g, x, 'Denied', r === 1 ? 'You denied it to everyone you know. Most people believed you.' : r === 2 ? `You denied it. ${nm(x)} argued with you in front of everyone.` : `You denied it. ${nm(x)} called you a liar.`, 'I denied a rumor to everyone I know.', r === 1 ? { happiness: 2 } : { rel: -8, happiness: -4 })
      },
      ignore: (g, x) => say(g, x, 'Unbothered', 'You ignored it. The rumor died a natural death.', 'I ignored a rumor my friend started about me.', { rel: -4 }),
    },
  },
  {
    id: 'friend.unfriended',
    emoji: '😧',
    title: 'Unfriended',
    minAge: 10,
    maxAge: 95,
    weight: 5,
    when: (g) => plainFriends(g).some((p) => p.relationship < 40),
    setup: (g) => {
      const f = anyOf(g, plainFriends(g).filter((p) => p.relationship < 40))
      if (!f) return null
      return {
        text: `Your friend ${f.firstName} has unfriended you. What will you do?`,
        choices: [ch('salvage', 'Try to salvage our friendship'), ch('let', 'Let them go'), ch('insult', 'Insult them one last time')],
        person: f,
      }
    },
    resolve: {
      salvage: (g, x) => {
        const ok = chance(g, 0.45)
        if (ok) say(g, x, 'Friendship saved', `You reached out and talked things through with ${nm(x)}. You're friends again!`, `I salvaged my friendship with ${nm(x)}.`, { rel: 25, happiness: 6 }, 'good')
        else {
          if (x.p) removePerson(g, x.p.id)
          say(g, x, 'Done for good', `${nm(x)} wasn't interested. The friendship is over.`, `My friend ${nm(x)} unfriended me.`, { happiness: -8 }, 'bad')
        }
      },
      let: (g, x) => {
        if (x.p) removePerson(g, x.p.id)
        say(g, x, 'Moving on', `You let ${nm(x)} go. People drift apart.`, `My friend ${nm(x)} unfriended me and I let them go.`, { happiness: -4 })
      },
      insult: (g, x) => {
        const n = nm(x)
        if (x.p) removePerson(g, x.p.id)
        say(g, x, 'Done for good', `You sent ${n} a scathing parting message. It felt good for about four minutes.`, `I insulted ${n} after they unfriended me.`, { happiness: 2, karma: -4, count: 'insults' })
      },
    },
  },
  {
    id: 'friend.drugs',
    emoji: '💊',
    title: 'Invitation',
    minAge: 16,
    maxAge: 60,
    when: (g) => friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      const drug = pick(g, ['weed', 'mushrooms', 'ecstasy', 'some pills they found'])
      return {
        text: `Your friend ${f.firstName} invited you over to take ${drug} with them. What will you do?`,
        choices: [ch('do', 'Do it'), ch('excuse', 'Make up an excuse'), ch('no', 'No way!')],
        person: f,
        data: { drug },
      }
    },
    resolve: {
      do: (g, x) => {
        const r = randInt(g, 1, 100)
        if (r <= 8) say(g, x, 'Bad trip', `The ${x.s('drug')} hit you hard. You spent the night convinced the couch was judging you, then ended up in the ER.`, `I had a bad reaction after taking ${x.s('drug')} with my friend ${nm(x)}.`, { health: -15, happiness: -10, count: 'drugs', rel: 4 }, 'bad', '🚑')
        else {
          const hooked = chance(g, 0.05)
          say(g, x, ['Trippy', 'Wild night'], `You took ${x.s('drug')} with ${nm(x)} and had a wild night of philosophical conversations about cereal.${hooked ? ' You keep thinking about doing it again.' : ''}`, `I took ${x.s('drug')} with my friend ${nm(x)}.`, { happiness: 8, health: -4, rel: 8, count: 'drugs', condition: hooked ? { name: 'Drug Addiction', kind: 'addiction', severity: 20 } : undefined })
        }
      },
      excuse: (g, x) => {
        const plan = pick(g, ['go bowling', 'visit my grandmother', 'walk my neighbor\'s dog', 'reorganize my sock drawer'])
        say(g, x, 'Prior engagement', `You told ${nm(x)} you already had plans to ${plan}. They bought it.`, `I lied and told my friend I already had plans to ${plan}.`, { rel: -2 })
      },
      no: (g, x) => say(g, x, 'Just say no', `You told ${nm(x)} no way. They shrugged and said "more for me."`, 'I turned down drugs from a friend.', { health: 2, rel: -4 }, 'good'),
    },
  },
  {
    id: 'friend.insuranceFraud',
    emoji: '🔥',
    title: 'Up in Flames',
    minAge: 18,
    maxAge: 70,
    when: (g) => friends(g).some((f) => f.age >= 18),
    setup: (g) => {
      const f = anyOf(g, friends(g).filter((p) => p.age >= 18))
      if (!f) return null
      return {
        text: `Your friend ${f.firstName} wants some easy insurance money and asks you to help "double set" their car. When you ask what that means, they say: "Set it in a field, then set it on fire." What will you do?`,
        choices: [ch('do', 'Double set it'), ch('no', 'No way'), ch('insult', 'Insult them')],
        person: f,
      }
    },
    resolve: {
      do: (g, x) => {
        const caught = chance(g, 0.25)
        if (caught) say(g, x, 'Arson investigators', 'The insurance company sent investigators. Your phone was pinging from the field at 2 AM.', `I got caught helping my friend ${nm(x)} torch their car for insurance money.`, { smarts: -8, karma: -10, count: 'crimes', arrest: { crime: 'Insurance Fraud', severity: 2 } }, 'bad', '🚓')
        else {
          const cut = dollars(g, 500, 2000)
          say(g, x, 'Burn baby burn', `You torched the car in a field. ${nm(x)} got the insurance payout and gave you ${money(cut)} for your trouble.`, `I helped my friend ${nm(x)} torch their car for a bogus insurance claim.`, { smarts: -8, karma: -10, money: cut, rel: 12, count: 'crimes' }, 'neutral', '🔥')
        }
      },
      no: (g, x) => say(g, x, 'Smart move', `You refused. ${nm(x)} did it anyway and is now being investigated.`, "I refused to torch my friend's car for a bogus insurance claim.", { smarts: 4, rel: -6 }, 'good'),
      insult: (g, x) => say(g, x, 'Moron', `You called ${nm(x)} an absolute moron. They didn't disagree, but they were offended.`, `I insulted my friend ${nm(x)} for their insurance scheme.`, { rel: -12, count: 'insults' }),
    },
  },
  {
    id: 'friend.alibi',
    emoji: '🔍',
    title: 'Cover Me',
    minAge: 16,
    maxAge: 70,
    when: (g) => friends(g).some((f) => f.age >= 16),
    setup: (g) => {
      const f = anyOf(g, friends(g).filter((p) => p.age >= 16))
      if (!f) return null
      const crime = pick(g, ['a burglary', 'a string of car break-ins', 'stealing a statue from the town square', 'a jewelry store heist'])
      return {
        text: `Your friend ${f.firstName} is being investigated for ${crime} and wants you to tell the police they were with you that night, even though they weren't. What will you do?`,
        choices: [ch('cover', 'Cover for my friend'), ch('no', "Sorry, I won't do that"), ch('insult', 'Insult them')],
        person: f,
        data: { crime },
      }
    },
    resolve: {
      cover: (g, x) => {
        const caught = chance(g, 0.2)
        if (caught) say(g, x, 'Perjury', 'Security footage proved your story was a lie. Now you are in trouble too.', `I lied to the police to cover for my friend ${nm(x)} and got caught.`, { smarts: -4, karma: -8, count: 'crimes', arrest: { crime: 'Obstruction of Justice', severity: 2 } }, 'bad', '🚓')
        else say(g, x, 'Ride or die', `You told the police ${nm(x)} was with you all night. They walked free. You're bonded for life now.`, `I lied to the authorities about my friend ${nm(x)}'s whereabouts during ${x.s('crime')}.`, { smarts: -4, karma: -8, rel: 20 })
      },
      no: (g, x) => say(g, x, 'Integrity', `You refused to lie for ${nm(x)}. They were hurt, but you sleep fine.`, `I refused to give my friend ${nm(x)} a fake alibi.`, { rel: -12, karma: 4 }),
      insult: (g, x) => say(g, x, 'Harsh truth', `You told ${nm(x)} they're a criminal and an idiot. The friendship is on thin ice.`, `I insulted my friend ${nm(x)} for asking me to lie to the police.`, { rel: -20, count: 'insults' }),
    },
  },
  {
    id: 'friend.moving',
    emoji: '💪',
    title: 'Moving Muscle',
    minAge: 16,
    maxAge: 75,
    when: (g) => friends(g).some((f) => f.age >= 18),
    setup: (g) => {
      const f = anyOf(g, friends(g).filter((p) => p.age >= 18))
      if (!f) return null
      return {
        text: `Your friend ${f.firstName} just bought a new condo and is asking if you'll help them move in. They have a piano. On the fourth floor. No elevator. What will you do?`,
        choices: [ch('help', 'Lend a hand'), ch('excuse', 'Make an excuse'), ch('no', 'Just say no')],
        person: f,
      }
    },
    resolve: {
      help: (g, x) => {
        const hurt = chance(g, 0.15)
        say(g, x, hurt ? 'Pulled a muscle' : 'Good friend', hurt ? `You helped ${nm(x)} move and threw out your back on the piano. They bought you pizza and a heating pad.` : `You helped ${nm(x)} move in. They paid you in pizza and eternal gratitude.`, `I helped my friend ${nm(x)} move into their new condo.`, hurt ? { rel: 15, health: -8 } : { rel: 15, health: 2 }, 'good', '📦')
      },
      excuse: (g, x) => say(g, x, 'White lie', `You told ${nm(x)} you had a dentist appointment. They know you don't go to the dentist.`, 'I told a white lie to avoid helping my friend move.', { rel: -6 }),
      no: (g, x) => say(g, x, 'Honest', `You just said no. ${nm(x)} appreciated the honesty less than you'd hoped.`, 'I said no when my friend asked for help moving.', { rel: -10 }),
    },
  },
  {
    id: 'friend.flatTire',
    emoji: '🚗',
    title: 'Deflated',
    minAge: 17,
    maxAge: 75,
    when: (g) => friends(g).some((f) => f.age >= 16),
    setup: (g) => {
      const f = anyOf(g, friends(g).filter((p) => p.age >= 16))
      if (!f) return null
      return {
        text: `Your friend ${f.firstName} calls you at 2 AM. They're on the side of the road with a flat tire and need help. What will you do?`,
        choices: [ch('help', 'Help them change the tire'), ch('ride', 'Arrange a ride for them'), ch('sleep', "I can't be bothered")],
        person: f,
      }
    },
    resolve: {
      help: (g, x) => say(g, x, 'Night rider', `You got out of bed and helped ${nm(x)} change the tire in the rain. They owe you forever.`, 'I helped my friend change a flat tire in the middle of the night.', { rel: 18, health: -2, karma: 4 }, 'good'),
      ride: (g, x) => say(g, x, 'Logistics', `You booked ${nm(x)} a ride home and went back to sleep. Efficient.`, 'I arranged a ride for my friend stuck with a flat tire.', { rel: 6, money: -Math.min(Math.max(0, g.character.money), 35) }),
      sleep: (g, x) => say(g, x, 'Hung up', `You told ${nm(x)} to call someone else and went back to sleep.`, "I ignored my friend's late-night call for help.", { rel: -18 }, 'bad'),
    },
  },
  {
    id: 'friend.late',
    emoji: '🕒',
    title: 'A Waiting Game',
    minAge: 14,
    maxAge: 90,
    when: (g) => friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      return {
        text: `You've been waiting at a restaurant for your friend ${f.firstName} for 40 minutes. This always happens. What will you do?`,
        choices: [ch('eat', 'Start eating'), ch('wait', 'Wait patiently'), ch('leave', 'Leave'), ch('prank', 'Order them something disgusting')],
        person: f,
      }
    },
    resolve: {
      eat: (g, x) => say(g, x, 'Hungry', `You started eating. ${nm(x)} arrived just as you finished dessert.`, 'I started eating without my friend when they were late again.', { happiness: 2, rel: -2 }),
      wait: (g, x) => say(g, x, 'Saint', `You waited an hour. ${nm(x)} walked in and said "sorry, traffic." There is no traffic in this town.`, 'I waited patiently for my late friend.', { rel: 4, happiness: -4 }),
      leave: (g, x) => say(g, x, 'Boundaries', `You left. ${nm(x)} texted "where r u" twenty minutes later.`, 'I left when my friend was late again.', { rel: -8, happiness: 2 }),
      prank: (g, x) => say(g, x, 'Payback', `You ordered ${nm(x)} the anchovy and liver special. They ate it out of guilt.`, 'I ordered my late friend something disgusting.', { happiness: 6, rel: -2, count: 'pranks' }),
    },
  },
  {
    id: 'friend.hideout',
    emoji: '🚨',
    title: 'Hide Out',
    minAge: 18,
    maxAge: 70,
    weight: 4,
    when: (g) => friends(g).some((f) => f.age >= 18) && g.character.residence.status !== 'parents',
    setup: (g) => {
      const f = anyOf(g, friends(g).filter((p) => p.age >= 18))
      if (!f) return null
      return {
        text: `You hear frantic banging on your front door. It's your friend ${f.firstName}, sweating and holding a large duffel bag. Sirens are blaring in the distance. They ask if they can hang out at your place "for a little while." What will you do?`,
        choices: [ch('police', 'Call the police'), ch('let', 'Let them in'), ch('slam', 'Slam the door')],
        person: f,
      }
    },
    resolve: {
      police: (g, x) => say(g, x, 'Law-abiding', `You called the police. ${nm(x)} was arrested on your lawn. The duffel bag was full of stolen watches.`, `I called the police on my friend ${nm(x)}.`, { rel: -50, karma: 6 }, 'neutral', '🚓'),
      let: (g, x) => {
        const caught = chance(g, 0.3)
        if (caught) say(g, x, 'Harboring a fugitive', `The police tracked ${nm(x)} to your house. You were arrested along with them.`, `I was arrested for hiding my friend ${nm(x)} from the police.`, { rel: 15, count: 'crimes', arrest: { crime: 'Harboring a Fugitive', severity: 2 } }, 'bad', '🚓')
        else {
          const cut = dollars(g, 200, 1500)
          say(g, x, 'Safe house', `You let ${nm(x)} hide out until the sirens faded. They left you ${money(cut)} "for your trouble" and didn't explain.`, `I let my friend ${nm(x)} hide out at my place from the police.`, { rel: 20, money: cut, karma: -8 })
        }
      },
      slam: (g, x) => say(g, x, 'Not my problem', `You slammed the door. ${nm(x)} ran off into the night.`, `I slammed the door on my friend ${nm(x)} when they were running from the police.`, { rel: -25 }),
    },
  },
  {
    id: 'friend.intervention',
    emoji: '✋',
    title: 'Substance Abuser',
    minAge: 16,
    maxAge: 80,
    weight: 4,
    when: (g) => friends(g).some((f) => f.age >= 16),
    setup: (g) => {
      const f = anyOf(g, friends(g).filter((p) => p.age >= 16))
      if (!f) return null
      const thing = canDrink(g) ? pick(g, ['alcohol', 'painkillers', 'gambling', 'energy drinks']) : pick(g, ['energy drinks', 'video games', 'vaping'])
      return {
        text: `You're concerned because your friend ${f.firstName}'s ${thing} habit is spiraling out of control. What will you do?`,
        choices: [ch('intervene', 'Stage an intervention'), ch('let', 'Let them continue'), ch('unfriend', 'Unfriend them')],
        person: f,
        data: { thing },
      }
    },
    resolve: {
      intervene: (g, x) => {
        const ok = chance(g, 0.55)
        say(g, x, ok ? "It's all in your head" : 'Denial', ok ? `Your intervention was successful! ${nm(x)} is getting help for their ${x.s('thing')} problem.` : `${nm(x)} stormed out of the intervention. Maybe they'll come around.`, ok ? `I staged a successful intervention for my friend ${nm(x)}.` : `I staged an intervention for my friend ${nm(x)}. It didn't go well.`, ok ? { rel: 20, karma: 10, happiness: 6 } : { rel: -8, karma: 6 }, ok ? 'good' : 'bad', '🫂')
      },
      let: (g, x) => say(g, x, 'Enabler', `You let ${nm(x)} continue. It's their life, you figured.`, `My friend ${nm(x)} began abusing ${x.s('thing')}. It didn't bother me.`, { karma: -4 }),
      unfriend: (g, x) => {
        const n = nm(x)
        if (x.p) removePerson(g, x.p.id)
        say(g, x, 'Cut off', `You cut ${n} out of your life.`, `I unfriended ${n} over their ${x.s('thing')} habit.`, { karma: -4, happiness: -4 })
      },
    },
  },
  {
    id: 'friend.distillery',
    emoji: '🥃',
    title: 'Free Booze',
    minAge: 18,
    maxAge: 90,
    when: (g) => canDrink(g) && !muslimMajority(g) && friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      return {
        text: `On a whiskey distillery tour, there's a table of free samples with a sign that says "ONE PER PERSON." Your friend ${f.firstName} is doing shots. What will you do?`,
        choices: [ch('stop', 'Stop that!'), ch('cheer', 'Shot! Shot! Shot!'), ch('join', "Let's go shot for shot!")],
        person: f,
      }
    },
    resolve: {
      stop: (g, x) => say(g, x, "Don't you dare!", `You told ${nm(x)} to stop. They gave you a look and took one more.`, `I told my friend ${nm(x)} to stop taking free shots at a distillery.`, { rel: -4, smarts: 2 }),
      cheer: (g, x) => say(g, x, 'Hype squad', `You cheered ${nm(x)} on until security escorted you both out.`, 'I encouraged my friend to keep doing free shots at a distillery tour.', { smarts: -4, rel: 6, happiness: 4 }),
      join: (g, x) => say(g, x, 'Distillery legends', `You and ${nm(x)} went shot for shot. You don't remember the rest of the tour. You're banned for life.`, `I did free shots with my friend ${nm(x)} on a distillery tour.`, { rel: 10, happiness: 8, health: -4, count: 'nightlife' }),
    },
  },
  {
    id: 'friend.roadTrip',
    emoji: '🛣️',
    title: 'Road Trip',
    minAge: 17,
    maxAge: 60,
    when: (g) => friends(g).some((f) => f.age >= 17) && g.character.residence.status !== 'parents',
    setup: (g) => {
      const f = anyOf(g, friends(g).filter((p) => p.age >= 17))
      if (!f) return null
      const cost = dollars(g, 150, 600)
      return {
        text: `Your friend ${f.firstName} wants to go on a spontaneous road trip this weekend. Your share of gas and motels would be about ${money(cost)}. What will you do?`,
        choices: [ch('go', "Let's go!"), ch('no', "Can't, I'm busy")],
        person: f,
        data: { cost },
      }
    },
    resolve: {
      go: (g, x) => {
        const cost = x.n('cost')
        if (g.character.money < cost) return say(g, x, 'Broke', `You couldn't afford the road trip. ${nm(x)} said they'd send pictures.`, null, { rel: -2 })
        const r = randInt(g, 1, 10)
        say(g, x, r <= 7 ? ['Open road', 'Unforgettable'] : 'Stranded', r <= 7 ? `You and ${nm(x)} sang every song on the radio and ate at every diner. A weekend for the ages.` : 'The car broke down in the middle of nowhere. You spent the night in a cornfield telling ghost stories. Honestly? Still fun.', `I went on a road trip with my friend ${nm(x)}.`, { money: -cost, happiness: r <= 7 ? 12 : 6, rel: 12 }, 'good', '🚙')
      },
      no: (g, x) => say(g, x, 'Responsible', `You stayed home. ${nm(x)} posted 300 photos of the trip.`, null, { rel: -4 }),
    },
  },
  {
    id: 'friend.haircut',
    emoji: '💇',
    title: 'Honest Opinion',
    minAge: 10,
    maxAge: 90,
    when: (g) => friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      const look = pick(g, ['a bowl cut', 'neon green hair', 'a mullet', 'a shaved head with a lightning bolt', 'frosted tips'])
      return {
        text: `Your friend ${f.firstName} just got ${look} and asks what you honestly think. It's... a lot. What will you say?`,
        choices: [ch('honest', 'Tell the truth'), ch('lie', 'Say it looks amazing'), ch('laugh', 'Burst out laughing')],
        person: f,
        data: { look },
      }
    },
    resolve: {
      honest: (g, x) => {
        const ok = chance(g, 0.5)
        say(g, x, ok ? 'Real friend' : 'Hurt feelings', ok ? `You gently told ${nm(x)} it's not their best look. They laughed and agreed.` : `You told ${nm(x)} the truth. They wore a hat for a month and barely spoke to you.`, `I told my friend ${nm(x)} the truth about their new hair.`, ok ? { rel: 6, karma: 2 } : { rel: -8 })
      },
      lie: (g, x) => say(g, x, 'Supportive', `You said it looked amazing. ${nm(x)} beamed. Strangers did not.`, `I told my friend ${nm(x)} their new hair looked amazing.`, { rel: 6 }),
      laugh: (g, x) => say(g, x, 'Oops', `You laughed so hard you snorted. ${nm(x)} did not find it funny.`, `I laughed at my friend ${nm(x)}'s new hair.`, { rel: -12, happiness: 4 }),
    },
  },
  {
    id: 'friend.sneakIn',
    emoji: '🤔',
    title: 'Personal Property?',
    minAge: 9,
    maxAge: 17,
    when: (g) => friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      return {
        text: `Your friend ${f.firstName} says they left their game console inside the neighbor's house and wants you to sneak in while the neighbors aren't home to get it back. What will you do?`,
        choices: [ch('sus', 'That sounds suspicious'), ch('help', 'Help a friend in need'), ch('insult', 'Insult them')],
        person: f,
      }
    },
    resolve: {
      sus: (g, x) => say(g, x, 'Street smart', `You told ${nm(x)} that sounded way too suspicious. Smart.`, `I told my friend ${nm(x)} that sneaking into a neighbor's house sounded too suspicious.`, { smarts: 4, rel: -4 }, 'good'),
      help: (g, x) => {
        const caught = chance(g, 0.3)
        if (caught && g.character.age >= 14) say(g, x, 'Breaking and entering', 'The neighbors came home early and found you in their living room. They called the police.', "I got caught sneaking into a neighbor's house.", { karma: -8, count: 'crimes', arrest: { crime: 'Trespassing', severity: 1 } }, 'bad', '🚓')
        else if (caught) say(g, x, 'Caught', 'The neighbors came home early and marched you straight to your parents. Grounded for a month.', "I got caught sneaking into a neighbor's house and was grounded.", { karma: -8, happiness: -8 }, 'bad')
        else say(g, x, 'In and out', `You snuck in and grabbed the console. It turns out it was never ${nm(x)}'s. Oops.`, `I snuck into a neighbor's house for my friend ${nm(x)}.`, { karma: -8, rel: 8, count: 'crimes' })
      },
      insult: (g, x) => say(g, x, 'Rude', `You called ${nm(x)} a con artist. They stomped off.`, `I insulted my friend ${nm(x)}.`, { rel: -10, count: 'insults' }),
    },
  },
])
