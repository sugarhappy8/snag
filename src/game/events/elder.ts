// Golden years: grandkids, scams that target seniors, health scares, falls, the car keys
// conversation, retirement homes, bingo, old flames and early-bird specials.
import { addRelationship, preferredGender } from '../core'
import { createPerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { pickLine } from '../text/pick'
import type { GameState, Person } from '../types'
import {
  anyOf,
  ch,
  defineEvents,
  dollars,
  friends,
  grandkids,
  hasCar,
  kids,
  money,
  ownsHome,
  partner,
  pr,
  relWord,
  say,
  strangerName,
  type Ctx,
  majorityFaith,
  v,
} from './helpers'
import { common, landline } from './era'
import { fillLocal, localTerm } from '../data/locales'
import { feastHoliday } from './adult'

function nm(x: Ctx, fallback = 'them'): string {
  return x.p?.firstName ?? fallback
}

/** Lose up to `amt` (never more than the cash on hand); returns what was actually lost. */
function loseUpTo(g: GameState, amt: number): number {
  return Math.max(0, Math.min(Math.max(0, g.character.money), amt))
}

const SCAM_PLACES = ['Cancún', 'a Las Vegas casino', 'a jail in Tijuana', 'a hostel in Prague', 'an airport in Lisbon']
/** Where a fake grandchild claims to be stuck, outside the US: local getaways and faraway airports. */
const LOCAL_SCAM_PLACES = ['a police station in {getaway}', 'a hospital in {getaway}', 'a hostel in Prague', 'an airport in Dubai', 'a jail across the border']

/** How the fake grandchild wants the money: gift cards in the English-speaking world, mobile money in East Africa, a bank transfer elsewhere. */
function scamWay(g: GameState): { pay: string; send: string; bought: string } {
  const id = g.character.countryId
  if (['us', 'ca', 'gb', 'ie', 'au', 'nz', 'pr'].includes(id) && g.year >= 2008) return { pay: 'in gift cards', send: 'Send the gift cards', bought: 'You bought {amt} in gift cards and read the numbers over the phone.' }
  if (['ke', 'ug', 'zw', 'cd', 'ng', 'et'].includes(id) && g.year >= 2010) return { pay: 'by mobile money', send: 'Send the money', bought: 'You sent {amt} by mobile money to a number you had never seen before.' }
  return { pay: 'by bank transfer', send: 'Send the money', bought: 'You wired {amt} to an account number the caller read out twice, very slowly.' }
}

/** What retirees play here: pickleball in the US, pétanque in France, gateball in Japan, lawn bowls in the Commonwealth. */
function elderSport(g: GameState): string {
  const id = g.character.countryId
  if (id === 'us' || id === 'ca' || id === 'vn') return g.year >= 2005 ? 'pickleball' : 'shuffleboard'
  if (['fr', 'be', 'mc', 'ma', 'tn', 'dz', 'ad'].includes(id)) return 'pétanque'
  if (['it', 'ar', 'uy'].includes(id)) return 'bocce'
  if (['jp', 'kr', 'tw'].includes(id)) return g.year >= 1950 ? 'gateball' : 'go'
  if (['gb', 'au', 'nz', 'za', 'ie', 'zw'].includes(id)) return 'lawn bowls'
  if (['cn', 'hk', 'sg', 'my'].includes(id)) return 'tai chi'
  if (['de', 'at', 'ch', 'nl', 'dk', 'se', 'no', 'fi'].includes(id)) return 'table tennis'
  return g.year >= 2012 ? 'walking football' : 'chess'
}

/** Where the player's community worships: church, the mosque, the temple... */
function worshipPlace(g: GameState): string {
  const faith = g.character.religion ?? majorityFaith(g)
  if (faith === 'Islam') return 'the mosque'
  if (faith === 'Judaism') return 'synagogue'
  if (faith === 'Hinduism' || faith === 'Buddhism' || faith === 'Shinto' || faith === 'Taoism' || faith === 'Jainism') return 'the temple'
  if (faith === 'Sikhism') return 'the gurdwara'
  if (faith === 'Christianity' || faith === 'Catholicism') return 'church'
  return 'the community center'
}

function uc(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export const ELDER_EVENTS = defineEvents([
  {
    id: 'elder.grandparentScam',
    emoji: '📞',
    title: 'Grandparent Scam',
    minAge: 60,
    maxAge: 110,
    cooldown: 12,
    // The "grandma, I'm in jail" phone con took off in the 2000s.
    when: (g) => g.year >= 2000 && landline(g),
    setup: (g) => {
      const gk = anyOf(g, grandkids(g, 14))
      const who = gk ? gk.firstName : 'your grandson'
      const amt = Math.round(dollars(g, 900, 4500) / 100) * 100
      const place = g.character.countryId === 'us' ? pickLine(g, SCAM_PLACES) : fillLocal(g, pick(g, LOCAL_SCAM_PLACES))
      const way = scamWay(g)
      return {
        text: `Your phone rings. A muffled voice says, "${gk ? `Hi, it's ${who}` : "Grandma? Grandpa? It's me"}! I'm stuck in ${place} and I need ${money(amt)} ${way.pay} for bail. Please don't tell Mom!" What will you do?`,
        choices: [ch('pay', way.send, '🎁'), ch('quiz', 'Ask a question only they would know', '🕵️'), ch('hang', 'Hang up', '📵'), ch('call', 'Call the family to check', '📲')],
        person: gk,
        data: { amt, place, who },
      }
    },
    resolve: {
      pay: (g, x) => {
        const lost = loseUpTo(g, x.n('amt'))
        if (lost === 0) return say(g, x, 'Saved by poverty', "You went to get the money but didn't have enough. The caller hung up in disgust. That should have been your first clue.", 'A scammer pretending to be my grandchild tried to get money from me.', { happiness: -2 })
        say(g, x, ['Scammed!', 'Gone'], `${scamWay(g).bought.replace('{amt}', money(lost))} ${x.p ? `${x.p.firstName} later called from home, completely confused.` : 'You do not have a grandson in trouble.'} You'd been scammed.`, `I lost ${money(lost)} to a phone scammer pretending to be my grandchild.`, { money: -lost, happiness: -12, memory: 'Fell for a grandparent phone scam.' }, 'bad', '💸')
      },
      quiz: (g, x) => say(g, x, 'Sharp as a tack', `You asked "What did I get you for your 7th birthday?" The caller stammered and hung up. Nice try, crook.`, 'I outsmarted a phone scammer pretending to be my grandchild.', { smarts: 3, happiness: 4 }, 'good', '🕵️'),
      hang: (g) => say(g, null, 'Click', "You hung up. If it was really them, they'll call back. (They didn't.)", 'I hung up on a suspicious phone call.', {}),
      call: (g, x) => {
        if (x.p) return say(g, x, 'Safe and sound', `You called ${x.p.firstName} directly. ${pr(x.p).He} was at home eating cereal and had never been to ${x.s('place')}. ${pr(x.p).He} was touched that you checked.`, `I caught a scammer pretending to be my grandchild, ${x.p.firstName}.`, { rel: 5, happiness: 3, smarts: 2 }, 'good', '👍')
        say(g, x, 'Scam foiled', "You called around the family. Nobody was in any jail anywhere. You reported the number to the police.", 'I reported a scammer who pretended to be my grandchild.', { karma: 3, smarts: 2 }, 'good', '👮')
      },
    },
  },
  {
    id: 'elder.techSupport',
    emoji: '💻',
    title: 'Tech Support',
    minAge: 58,
    maxAge: 110,
    cooldown: 12,
    // Fake virus popups need a home computer on the internet.
    when: (g) => g.year >= 2005 && common(g, 'homeComputer') && common(g, 'internet'),
    setup: (g) => {
      const fee = Math.round(dollars(g, 200, 1200) / 10) * 10
      return {
        text: `A flashing popup on your computer says "VIRUS DETECTED!!! CALL OFFICIAL COMPUTER SUPPORT NOW" and lists a phone number. The man on the line wants ${money(fee)} to fix it. What will you do?`,
        choices: [ch('pay', 'Pay him to fix it', '💳'), ch('restart', 'Turn it off and on again', '🔌'), ch('grandkid', 'Ask a young relative for help', '🧒'), ch('troll', 'Waste his time', '😈')],
        data: { fee },
      }
    },
    resolve: {
      pay: (g, x) => {
        const lost = loseUpTo(g, x.n('fee'))
        say(g, x, 'Tech scam', `You read your card number to "Kevin from Official Computer Support." Your computer still has the popup${lost ? `, and your account is ${money(lost)} lighter` : ', but luckily your card was declined'}.`, lost ? `I lost ${money(lost)} to a fake tech support scam.` : 'I almost fell for a fake tech support scam.', { money: -lost, happiness: -6 }, 'bad', '💸')
      },
      restart: (g) => say(g, null, 'IT professional', 'You turned the computer off and on again. The popup disappeared. You are basically a hacker now.', 'I fixed my own computer by restarting it.', { smarts: 2, happiness: 3 }, 'good', '🔌'),
      grandkid: (g) => {
        const young = anyOf(g, [...grandkids(g, 10), ...kids(g, 10)])
        if (!young) {
          const fee = Math.min(Math.max(0, g.character.money), 10)
          return say(g, null, 'Neighbor kid', `You paid the neighbor kid ${money(fee)} to close the popup. It took four seconds.`, 'I paid a neighbor kid to fix my computer.', { money: -fee, happiness: 2 })
        }
        addRelationship(young, 4)
        say(g, null, 'Family IT department', `You called ${young.firstName}, who sighed loudly and walked you through closing the popup. Three times.`, `My ${relWord(young)} ${young.firstName} helped me with a computer scam popup.`, { happiness: 2 }, 'good', '🧒')
      },
      troll: (g) => say(g, null, ['Scambaiter', 'Revenge'], 'You kept the scammer on the phone for two hours pretending you could not find the "any" key. He eventually hung up crying.', 'I wasted a scammer’s time for two hours.', { happiness: 8, karma: 2 }, 'good', '😈'),
    },
  },
  {
    id: 'elder.grandkidVisit',
    emoji: '🍪',
    title: 'Grandkids',
    minAge: 45,
    maxAge: 110,
    cooldown: 3,
    weight: (g) => (grandkids(g, 2, 16).length ? 14 : 0),
    setup: (g) => {
      const p = anyOf(g, grandkids(g, 2, 16))
      if (!p) return null
      return {
        text: `Your ${relWord(p)}, ${p.firstName}, is staying with you for the weekend. What will you do together?`,
        choices: [ch('bake', 'Bake cookies', '🍪'), ch('stories', 'Tell old stories', '📖'), ch('spoil', 'Spoil them rotten', '🎁'), common(g, 'tv') ? ch('tv', 'Watch TV and nap', '📺') : ch('tv', common(g, 'radio') ? 'Listen to the radio and nap' : 'Play cards and nap', '😴')],
        person: p,
      }
    },
    resolve: {
      bake: (g, x) => say(g, x, ['Grandma’s kitchen', 'Sweet memories'], `You and ${nm(x)} baked cookies and ate half the dough. ${nm(x)} says yours are better than the store's.`, `I baked cookies with my grandchild, ${nm(x)}.`, { rel: 8, happiness: 6 }, 'good', '🍪'),
      stories: (g, x) => {
        if (chance(g, 0.4)) return say(g, x, 'Snooze', `You told ${nm(x)} about the time you walked uphill both ways to school. ${nm(x)} fell asleep. Or pretended to.`, `I told my grandchild, ${nm(x)}, stories about the old days.`, { rel: 1 })
        say(g, x, 'Storyteller', `You told ${nm(x)} the wildest stories from your youth. ${nm(x)} hung on every word.`, `I told my grandchild, ${nm(x)}, stories about my youth.`, { rel: 7, happiness: 5 }, 'good', '📖')
      },
      spoil: (g, x) => {
        const cost = Math.min(Math.max(0, g.character.money), dollars(g, 40, 250))
        say(g, x, 'Spoiled', `You bought ${nm(x)} every toy ${x.p ? pr(x.p).he : 'they'} pointed at${cost ? ` and spent ${money(cost)}` : ''}. Their parents are going to be furious.`, `I spoiled my grandchild, ${nm(x)}, rotten.`, { rel: 10, happiness: 4, money: -cost }, 'good', '🎁')
      },
      tv: (g, x) =>
        common(g, 'tv')
          ? say(g, x, 'Quality time', `You and ${nm(x)} watched cartoons until you both fell asleep on the couch.`, `I napped in front of the TV with my grandchild, ${nm(x)}.`, { rel: 3, happiness: 3, health: 1 })
          : say(g, x, 'Quality time', `You and ${nm(x)} ${common(g, 'radio') ? 'listened to a radio play' : 'played cards'} until you both fell asleep on the couch.`, `I napped on the couch with my grandchild, ${nm(x)}.`, { rel: 3, happiness: 3, health: 1 }),
    },
  },
  {
    id: 'elder.grandkidMoney',
    emoji: '💵',
    title: 'Grandparent ATM',
    minAge: 55,
    maxAge: 110,
    cooldown: 6,
    when: (g) => grandkids(g, 16).length > 0 && g.character.money > 200,
    setup: (g) => {
      const p = anyOf(g, grandkids(g, 16))
      if (!p) return null
      const amt = Math.round(dollars(g, 200, 3000) / 50) * 50
      const why = v(g, ['college textbooks', '@cars a used car', 'a trip with friends', 'concert tickets', 'their first apartment', 'a "business opportunity"'])
      return {
        title: common(g, 'atm') ? 'Grandparent ATM' : 'Bank of Grandma',
        text: `Your ${relWord(p)}, ${p.firstName}, asks if you could spare ${money(amt)} for ${why}. What will you do?`,
        choices: [ch('give', 'Give it to them', '💝'), ch('half', 'Give half', '✂️'), ch('lecture', 'Lecture them about money', '☝️'), ch('no', 'Say no', '🙅')],
        person: p,
        data: { amt, why },
      }
    },
    resolve: {
      give: (g, x) => {
        const amt = x.n('amt')
        if (g.character.money < amt) return say(g, x, 'Fixed income', `You don't have ${money(amt)} to give. ${nm(x)} said not to worry about it.`, null, { rel: -1 })
        if (x.p) x.p.money += amt
        say(g, x, 'Generous', `You gave ${nm(x)} ${money(amt)} for ${x.s('why')}. ${x.p ? pr(x.p).He : 'They'} called you the best grandparent ever.`, `I gave my grandchild, ${nm(x)}, ${money(amt)}.`, { money: -amt, rel: 12, happiness: 3 }, 'good', '💝')
      },
      half: (g, x) => {
        const amt = Math.round(x.n('amt') / 2)
        if (g.character.money < amt) return say(g, x, 'Fixed income', `You couldn't even spare half. ${nm(x)} understood.`, null, {})
        if (x.p) x.p.money += amt
        say(g, x, 'Compromise', `You gave ${nm(x)} ${money(amt)} and told ${x.p ? pr(x.p).him : 'them'} to earn the rest.`, `I gave my grandchild, ${nm(x)}, ${money(amt)}.`, { money: -amt, rel: 5 }, 'good')
      },
      lecture: (g, x) => say(g, x, 'In my day...', `You gave ${nm(x)} a 40-minute lecture on how pocket change used to buy a whole meal. ${nm(x)} left with no money and a headache.`, `I lectured my grandchild, ${nm(x)}, about money.`, { rel: -5, happiness: 2 }),
      no: (g, x) => say(g, x, 'Bank closed', `You told ${nm(x)} no. ${x.p ? pr(x.p).He : 'They'} sulked through dinner.`, `I refused to give my grandchild, ${nm(x)}, money.`, { rel: -8 }),
    },
  },
  {
    id: 'elder.fall',
    emoji: '🦴',
    title: 'Slip and Fall',
    minAge: 70,
    maxAge: 120,
    cooldown: 8,
    setup: () => ({
      text: 'You slipped on the bathroom floor and went down hard. Your hip is screaming. What will you do?',
      choices: [ch('help', 'Call for help', '🆘'), ch('getup', 'Get up by myself', '💪'), ch('lie', 'Lie there and think about life', '🤔')],
    }),
    resolve: {
      help: (g) => {
        if (chance(g, 0.3)) return say(g, null, 'Broken hip', 'Paramedics took you to the hospital. Your hip was fractured, but surgery went well.', 'I broke my hip after slipping in the bathroom.', { health: -12, happiness: -6, condition: { name: 'Broken Hip', kind: 'injury', severity: 30 }, count: 'doctorVisits' }, 'bad', '🏥')
        say(g, null, 'Just bruised', 'Help arrived quickly. Nothing was broken, just your pride.', 'I slipped in the bathroom and bruised my hip.', { health: -3, happiness: -2 })
      },
      getup: (g) => {
        if (chance(g, 0.45)) return say(g, null, 'Bad idea', 'You tried to get up on your own and made it much worse. A neighbor found you hours later.', 'I tried to get up after a bad fall and broke my hip.', { health: -18, happiness: -8, condition: { name: 'Broken Hip', kind: 'injury', severity: 35 } }, 'bad', '🚑')
        say(g, null, 'Tough as nails', 'You hauled yourself up using the towel rack. You are not as fragile as everyone thinks.', 'I got myself up after a nasty fall.', { health: -4, happiness: 2, willpower: 3 })
      },
      lie: (g) => say(g, null, 'Philosopher', 'You lay on the cold tiles and pondered existence until your knees felt ready. It took 45 minutes.', 'I fell in the bathroom and lay there thinking about life.', { health: -5, smarts: 1 }),
    },
  },
  {
    id: 'elder.healthScare',
    emoji: '🩺',
    title: 'Health Scare',
    minAge: 50,
    maxAge: 120,
    cooldown: 8,
    setup: (g) => {
      const symptom = pickLine(g, ['a sharp pain in your chest', 'your left arm going numb', 'a crushing headache', 'blurry vision in one eye', 'shortness of breath climbing the stairs'])
      return {
        text: `You woke up with ${symptom}. What will you do?`,
        choices: [ch('er', 'Go to the emergency room', '🏥'), ch('wait', 'Wait and see', '⏳'), ch('google', common(g, 'internet') ? 'Look up my symptoms online' : 'Look it up in the medical encyclopedia', '🔍')],
        data: { symptom },
      }
    },
    resolve: {
      er: (g, x) => {
        const bill = Math.min(Math.max(0, g.character.money), dollars(g, 50, 900))
        if (chance(g, 0.7)) return say(g, x, ['False alarm', 'Phew'], `The doctors ran every test there is. It was just indigestion.${bill ? ` The bill was ${money(bill)}.` : ''}`, `I went to the ER for ${x.s('symptom')}. It was indigestion.`, { money: -bill, happiness: 2, count: 'doctorVisits' }, 'good', '😮‍💨')
        say(g, x, 'Caught it early', `Good thing you came in. The doctors caught a problem early and treated it right away.${bill ? ` The bill was ${money(bill)}.` : ''}`, `I went to the ER and the doctors caught a health problem early.`, { money: -bill, health: 4, count: 'doctorVisits' }, 'good', '🩺')
      },
      wait: (g, x) => {
        if (chance(g, 0.25)) return say(g, x, 'Should have gone', 'You waited it out. It got worse before it got better, and you ended up in the hospital anyway.', `I ignored ${x.s('symptom')} and ended up in the hospital.`, { health: -12, happiness: -5, condition: { name: 'Heart Disease', kind: 'disease', severity: 25 } }, 'bad', '🚑')
        say(g, x, 'Passed', 'You waited it out. Whatever it was went away on its own. Probably.', `I ignored ${x.s('symptom')} and it went away.`, { health: -2 })
      },
      google: (g, x) =>
        common(g, 'internet')
          ? say(g, x, 'Dr. Internet', 'According to the internet, you have either a pulled muscle or eleven incurable diseases. You spent the night panicking and it went away by morning.', `I looked up ${x.s('symptom')} online and scared myself half to death.`, { happiness: -6, craziness: 2 }, 'bad', '🔍')
          : say(g, x, 'Dr. Encyclopedia', 'According to the medical encyclopedia, you have either a pulled muscle or eleven incurable diseases. You spent the night panicking and it went away by morning.', `I looked up ${x.s('symptom')} in a medical encyclopedia and scared myself half to death.`, { happiness: -6, craziness: 2 }, 'bad', '🔍'),
    },
  },
  {
    id: 'elder.retirementHome',
    emoji: '🏡',
    title: 'Retirement Home',
    minAge: 72,
    maxAge: 120,
    cooldown: 10,
    when: (g) => kids(g, 30).length > 0 && g.character.residence.status !== 'prison',
    setup: (g) => {
      const p = anyOf(g, kids(g, 30))
      if (!p) return null
      const place = pickLine(g, ['Sunny Pines', 'Golden Meadows', 'Shady Acres', 'Willow Creek Senior Living', 'The Evergreen'])
      return {
        text: `Your ${relWord(p)}, ${p.firstName}, gently suggests it might be time to look at ${place}, a retirement community "with a lovely bingo hall." What will you do?`,
        choices: [ch('tour', 'Agree to a tour', '🚶'), ch('refuse', "I'm not going anywhere!", '😤'), ch('guilt', 'Guilt-trip them', '😢')],
        person: p,
        data: { place },
      }
    },
    resolve: {
      tour: (g, x) => say(g, x, 'Not so bad', `You toured ${x.s('place')}. The pudding was excellent and a resident challenged you to a dance-off. You told ${nm(x)} you'll think about it.`, `I toured ${x.s('place')} retirement community with my ${x.p ? relWord(x.p) : 'child'}.`, { rel: 6, happiness: 3 }),
      refuse: (g, x) => say(g, x, 'Independent', `You told ${nm(x)} you'll leave your home "feet first and not a moment sooner." ${nm(x)} dropped the subject.`, `I refused to move into a retirement home.`, { rel: -6, happiness: 2, willpower: 2 }),
      guilt: (g, x) => say(g, x, 'Guilt trip', `You reminded ${nm(x)} of ${g.character.gender === 'female' ? 'the 22 hours of labor you went through' : 'the thousands of diapers you changed'} for them. They apologized and brought you soup.`, `I guilt-tripped my ${x.p ? relWord(x.p) : 'child'} out of moving me to a retirement home.`, { rel: -3, happiness: 4 }),
    },
  },
  {
    id: 'elder.carKeys',
    emoji: '🚗',
    title: 'Keys, Please',
    minAge: 76,
    maxAge: 120,
    cooldown: 15,
    when: (g) => hasCar(g) && kids(g, 25).length > 0,
    setup: (g) => {
      const p = anyOf(g, kids(g, 25))
      if (!p) return null
      return {
        text: `Your ${relWord(p)}, ${p.firstName}, sits you down and asks you to hand over your car keys after you "gently tapped" a mailbox. Or three. What will you do?`,
        choices: [ch('hand', 'Hand them over', '🔑'), ch('refuse', 'Absolutely not', '🙅'), ch('test', 'Offer to take a driving test', '📝')],
        person: p,
      }
    },
    resolve: {
      hand: (g, x) => say(g, x, 'End of an era', `You handed ${nm(x)} the keys. You'll miss the open road, but the mailboxes of the neighborhood are relieved.`, 'I gave up driving and handed over my car keys.', { rel: 8, happiness: -6, karma: 3 }),
      refuse: (g, x) => {
        if (chance(g, 0.3)) return say(g, x, 'Fender bender', `You kept the keys. The next week you backed into a fire hydrant. ${nm(x)} didn't say "I told you so," but ${x.p ? pr(x.p).he : 'they'} thought it very loudly.`, 'I crashed into a fire hydrant after refusing to give up driving.', { rel: -5, health: -4, happiness: -4 }, 'bad', '🚒')
        say(g, x, 'Still got it', `You kept the keys and drove ${nm(x)} home to prove a point. It was mostly a good drive.`, 'I refused to give up my car keys.', { rel: -4, happiness: 3 })
      },
      test: (g, x) => {
        const pass = chance(g, 0.3 + g.character.stats.smarts / 300)
        say(g, x, pass ? 'Passed!' : 'Failed', pass ? `You retook the driving test and passed with flying colors. ${nm(x)} apologized.` : `You failed the driving test after mistaking the brake for the gas. You handed over the keys.`, pass ? 'I retook my driving test in old age and passed.' : 'I failed a driving test and gave up my car keys.', pass ? { rel: 4, happiness: 6 } : { rel: 4, happiness: -6 }, pass ? 'good' : 'bad', pass ? '🏁' : '🚧')
      },
    },
  },
  {
    id: 'elder.bingo',
    emoji: '🎱',
    title: 'Bingo Night',
    minAge: 60,
    maxAge: 120,
    when: (g) => g.year >= 1935,
    setup: (g) => {
      const pot = Math.round(dollars(g, 25, 400) / 5) * 5
      return {
        text: `It's bingo night at the community center and the pot is ${money(pot)}. You need one more number. What will you do?`,
        choices: [ch('play', 'Play it straight', '🎱'), ch('cheat', 'Mark an extra number', '🖊️'), ch('heckle', 'Heckle the caller', '📢')],
        data: { pot },
      }
    },
    resolve: {
      play: (g, x) => {
        if (chance(g, 0.3)) return say(g, x, 'BINGO!', `You shouted BINGO so loud someone dropped their dentures. You won ${money(x.n('pot'))}!`, `I won ${money(x.n('pot'))} at bingo night.`, { money: x.n('pot'), happiness: 8 }, 'good', '🎉')
        say(g, x, 'So close', 'Someone across the room yelled BINGO one number before you. You glared at them for the rest of the night.', 'I almost won at bingo night.', { happiness: 2 })
      },
      cheat: (g, x) => {
        if (chance(g, 0.5)) return say(g, x, 'Banned', 'You were caught marking an unnumbered square. The bingo hall has banned you for life. Word travels fast at the senior center.', 'I got banned from bingo night for cheating.', { karma: -8, happiness: -5 }, 'bad', '🚫')
        say(g, x, 'BINGO?', `You "won" ${money(x.n('pot'))}. Nobody checked your card. You feel a little bad. A little.`, `I cheated my way to ${money(x.n('pot'))} at bingo night.`, { money: x.n('pot'), karma: -8, happiness: 4 }, 'neutral', '😏')
      },
      heckle: (g) => say(g, null, 'Rowdy', 'You yelled "SPEAK UP!" after every number. The crowd loved it. The caller did not.', 'I heckled the caller at bingo night.', { happiness: 5, karma: -1 }),
    },
  },
  {
    id: 'elder.oldFlame',
    emoji: '💌',
    title: 'Old Flame',
    minAge: 55,
    maxAge: 100,
    cooldown: 20,
    setup: (g) => {
      const s = strangerName(g, preferredGender(g))
      // Found online in the social media age; a letter tracked down through old friends before.
      const online = common(g, 'socialMedia')
      return {
        text: online
          ? `${s.first} ${s.last}, someone you had a crush on in ${localTerm(g, 'high')}, found you online and sent you a message: "Do you remember me?" What will you do?`
          : `${s.first} ${s.last}, someone you had a crush on in ${localTerm(g, 'high')}, tracked down your address and sent you a letter: "Do you remember me?" What will you do?`,
        choices: [ch('meet', 'Meet up for coffee', '☕'), ch('reply', online ? 'Reply politely' : 'Write back politely', '💬'), ch('ignore', online && common(g, 'smartphone') ? 'Leave them on read' : 'Never write back', '👻')],
        data: { first: s.first, last: s.last, gender: s.gender, online: online ? 1 : 0 },
      }
    },
    resolve: {
      meet: (g, x) => {
        const sp = partner(g)
        if (sp) return say(g, x, 'Just coffee', `You met ${x.s('first')} for coffee and laughed about the old days. You told ${sp.firstName} all about it.`, `I had coffee with ${x.s('first')}, an old ${localTerm(g, 'high')} crush.`, { happiness: 5, rels: [{ p: sp, d: -2 }] })
        say(g, x, ['Rekindled', 'Second chances'], `You met ${x.s('first')} for coffee. It turned into dinner, then a long walk. You've become close friends again.`, `I reconnected with ${x.s('first')}, my ${localTerm(g, 'high')} crush.`, { happiness: 8 }, 'good', '💞')
        addOldFriend(g, x)
      },
      reply: (g, x) => {
        const online = x.data.online === undefined || x.n('online') === 1
        say(g, x, 'Nostalgia', `You exchanged a few ${online ? 'messages' : 'letters'} with ${x.s('first')} about old teachers who are definitely dead now.`, online ? `I reconnected online with ${x.s('first')} from ${localTerm(g, 'high')}.` : `I reconnected by letter with ${x.s('first')} from ${localTerm(g, 'high')}.`, { happiness: 3 })
      },
      ignore: (g, x) => {
        const read = (x.data.online === undefined || x.n('online') === 1) && common(g, 'smartphone')
        say(g, x, read ? 'Left on read' : 'Unanswered', read ? `You left ${x.s('first')} on read. Some doors are better left closed.` : `You never wrote back to ${x.s('first')}. Some doors are better left closed.`, null, {})
      },
    },
  },
  {
    id: 'elder.earlyBird',
    emoji: '🍽️',
    title: 'Early Bird Special',
    minAge: 62,
    maxAge: 120,
    setup: () => ({
      text: "You're at the diner for the 4:00 PM early bird special. Your soup is lukewarm. What will you do?",
      choices: [ch('complain', 'Speak to the manager', '😤'), ch('tip', 'Leave a big tip anyway', '💵'), ch('rolls', 'Stuff the dinner rolls in my bag', '🥖')],
    }),
    resolve: {
      complain: (g) => {
        if (chance(g, 0.5)) return say(g, null, 'Free pie', 'The manager apologized and comped you a slice of pie. Victory.', 'I complained about my soup and got free pie.', { happiness: 5, karma: -1 }, 'good', '🥧')
        say(g, null, 'Kicked out', 'You complained so loudly that the manager asked you to leave. You took the crackers with you.', 'I got kicked out of a diner for complaining about the soup.', { happiness: -3, karma: -2 })
      },
      tip: (g) => {
        const tip = Math.min(Math.max(0, g.character.money), 20)
        say(g, null, 'Big tipper', 'You left a generous tip. The waitress said you made her whole week.', 'I left a generous tip at the diner.', { money: -tip, karma: 4, happiness: 3 }, 'good')
      },
      rolls: (g) => say(g, null, 'Snack stash', 'You smuggled out eleven dinner rolls and a fistful of butter packets. Breakfast is sorted.', 'I stuffed dinner rolls into my bag at the diner.', { happiness: 4, karma: -1 }),
    },
  },
  {
    id: 'elder.smartphone',
    emoji: '📱',
    title: 'New Phone',
    minAge: 65,
    maxAge: 120,
    cooldown: 25,
    // A smartphone in the smartphone age, a chunky mobile phone in the nineties and 2000s.
    when: (g) => common(g, 'mobilePhone'),
    setup: (g) => {
      const giver = anyOf(g, [...kids(g, 18), ...grandkids(g, 12)])
      const smart = common(g, 'smartphone')
      return {
        text: `${giver ? `Your ${relWord(giver)}, ${giver.firstName},` : 'Your family'} gave you a shiny new ${smart ? 'smartphone' : 'mobile phone'}. What will you do with it?`,
        choices: [ch('learn', 'Learn how to use it', '🤓'), ch('paperweight', 'Use it as a paperweight', '📎'), smart ? ch('selfie', 'Take a hundred selfies', '🤳') : ch('selfie', 'Call everyone I know', '📞')],
        person: giver,
        data: { smart: smart ? 1 : 0 },
      }
    },
    resolve: {
      learn: (g, x) =>
        x.data.smart === undefined || x.n('smart') === 1
          ? say(g, x, 'Tech savvy', 'You mastered the phone in a week. You now send everyone good-morning messages with sparkly flowers.', 'I learned how to use a smartphone.', { smarts: 4, happiness: 4, rel: 4 }, 'good', '🤓')
          : say(g, x, 'Tech savvy', 'You mastered the phone in a week, including how to type a text one letter at a time. It takes you nine minutes to write "OK".', 'I learned how to use a mobile phone.', { smarts: 4, happiness: 4, rel: 4 }, 'good', '🤓'),
      paperweight: (g, x) => say(g, x, 'Old school', 'You put the phone on a stack of bills and went back to your landline.', x.data.smart === undefined || x.n('smart') === 1 ? 'I used my new smartphone as a paperweight.' : 'I used my new mobile phone as a paperweight.', { rel: -3 }),
      selfie: (g, x) =>
        x.data.smart === undefined || x.n('smart') === 1
          ? say(g, x, 'Influencer', 'You took a hundred selfies, all of them from below your chin with your thumb over the lens. You posted every one.', 'I took a hundred blurry selfies with my new phone.', { happiness: 6, rel: 2 }, 'good', '🤳')
          : say(g, x, 'Chatterbox', 'You called everyone in your address book, shouting "CAN YOU HEAR ME? I\'M ON THE MOBILE!" Your phone bill was enormous.', 'I called everyone I know on my new mobile phone.', { happiness: 6, rel: 2 }, 'good', '📞'),
    },
  },
  {
    id: 'elder.salesman',
    emoji: '🧾',
    title: 'Smooth Talker',
    minAge: 62,
    maxAge: 110,
    cooldown: 15,
    setup: (g) => {
      const pitch = ownsHome(g) && g.year >= 1985
        ? { what: 'a "reverse mortgage" that will "unlock the value of your home"', id: 'mortgage' }
        : { what: 'a pre-paid funeral package with a "very comfortable" coffin', id: 'funeral' }
      const cost = Math.round(dollars(g, 800, 4000) / 100) * 100
      return {
        text: `A slick salesman shows up at your door pitching ${pitch.what}. The sign-up fee is only ${money(cost)}. What will you do?`,
        choices: [ch('sign', 'Sign on the dotted line', '✍️'), ch('read', 'Read the fine print', '🔎'), ch('slam', 'Slam the door', '🚪')],
        data: { cost, pitch: pitch.id },
      }
    },
    resolve: {
      sign: (g, x) => {
        const lost = loseUpTo(g, x.n('cost'))
        if (lost === 0) return say(g, x, 'Rejected', g.year >= 1975 ? 'The salesman ran a credit check, saw your bank balance, and left in a hurry.' : 'The salesman asked to see your bank book, saw the balance, and left in a hurry.', null, {})
        say(g, x, 'Fleeced', `You signed. The ${money(lost)} fee vanished, and so did the salesman. ${landline(g) ? 'His phone number is now disconnected.' : 'His office address turned out to be a vacant lot.'}`, `I lost ${money(lost)} to a door-to-door scam.`, { money: -lost, happiness: -8 }, 'bad', '💸')
      },
      read: (g) => say(g, null, 'Eagle eye', 'You read the fine print with your magnifying glass and found three lies and a typo. The salesman left defeated.', 'I saw through a salesman’s scam by reading the fine print.', { smarts: 3, happiness: 3 }, 'good', '🔎'),
      slam: (g) => say(g, null, 'Not today', 'You slammed the door so hard a picture fell off the wall.', 'I slammed the door on a pushy salesman.', { happiness: 2 }),
    },
  },
  {
    id: 'elder.memoir',
    emoji: '✍️',
    title: 'Memoir',
    minAge: 60,
    maxAge: 110,
    once: true,
    setup: () => ({
      text: "Your family keeps saying you've lived an interesting life. Do you want to write your memoir?",
      choices: [ch('write', 'Write it all down', '✍️'), ch('juicy', 'Spill all the family secrets', '🫢'), ch('no', 'Some things are better left unsaid', '🤐')],
    }),
    resolve: {
      write: (g) => {
        if (chance(g, 0.15)) {
          const adv = Math.round(dollars(g, 2000, 25000) / 100) * 100
          return say(g, null, 'Published!', `You wrote your memoir, and a small publisher picked it up! You received a ${money(adv)} advance.`, `My memoir was published.`, { money: adv, happiness: 12, fame: 3, memory: 'Published a memoir.' }, 'good', '📚')
        }
        say(g, null, 'Legacy', 'You wrote your memoir and printed copies for the family. Your grandkids will appreciate it someday.', 'I wrote my memoir for my family.', { happiness: 8, smarts: 3 }, 'good', '📖')
      },
      juicy: (g) => {
        const fam = [...kids(g), ...grandkids(g)].filter((p) => p.age >= 12)
        for (const p of fam) addRelationship(p, -randInt(g, 3, 8))
        say(g, null, 'Tell-all', `You wrote a tell-all memoir. ${fam.length ? 'Several relatives are no longer speaking to you, but it was a page-turner.' : 'It was a page-turner.'}`, 'I wrote a tell-all memoir about my family.', { happiness: 6, fame: 2, karma: -3 }, 'neutral', '🫢')
      },
      no: (g) => say(g, null, 'Mystery', 'You decided your secrets are going to the grave with you.', null, {}),
    },
  },
  {
    id: 'elder.hearing',
    emoji: '🦻',
    title: 'What?',
    minAge: 66,
    maxAge: 120,
    cooldown: 20,
    setup: (g) => {
      const misheard = pick(g, [
        ['"Do you want some tea?"', '"You want to see my knee?"'],
        ['"The kids are coming over."', '"The squids are coming over."'],
        ['"Happy birthday!"', '"Happy dirt day!"'],
        ['"Please pass the salt."', '"Please pass the salt" (you heard it fine, you just ignored it)'],
      ])
      return {
        text: `Someone asked you ${misheard[0]} and you heard ${misheard[1]} You might be losing your hearing. What will you do?`,
        choices: [ch('aid', 'Get a hearing aid', '🦻'), ch('pretend', 'Smile and nod forever', '🙂'), ch('louder', 'Tell everyone to speak up', '📢')],
      }
    },
    resolve: {
      aid: (g) => {
        const cost = Math.min(Math.max(0, g.character.money), dollars(g, 300, 2500))
        say(g, null, 'Crystal clear', `You got a hearing aid${cost ? ` for ${money(cost)}` : ''}. You can hear birds again. Also your neighbors arguing. Mostly that.`, 'I got a hearing aid.', { money: -cost, happiness: 5, count: 'doctorVisits' }, 'good', '🦻')
      },
      pretend: (g) => say(g, null, 'Smile and nod', `You decided to smile and nod at everything. You accidentally agreed to host ${feastHoliday(g)}.`, 'I pretended to hear everything people said to me.', { happiness: -2 }),
      louder: (g) => say(g, null, 'SPEAK UP', 'You told everyone to speak up. Now every family dinner sounds like a rock concert.', 'I made everyone talk louder around me.', { happiness: 2 }),
    },
  },
  {
    id: 'elder.pickleball',
    emoji: '🏓',
    title: 'Pickleball',
    minAge: 55,
    maxAge: 90,
    cooldown: 12,
    setup: (g) => ({
      title: uc(elderSport(g)),
      text: `The local ${elderSport(g)} ${elderSport(g) === 'tai chi' ? 'group' : elderSport(g) === 'chess' || elderSport(g) === 'go' ? 'club' : 'league'} is recruiting, and the competition is reportedly vicious. Will you join?`,
      choices: [ch('join', 'Join the league', '🏓'), ch('trash', 'Join and talk trash', '😤'), ch('no', 'Pass', '🙅')],
    }),
    resolve: {
      join: (g) => {
        if (chance(g, 0.2)) return say(g, null, 'Pulled hamstring', 'You lunged for a tricky shot and something in your leg went "ping." You are now on the injured reserve.', `I pulled a hamstring playing ${elderSport(g)}.`, { health: -6, happiness: -3, condition: { name: 'Pulled Hamstring', kind: 'injury', severity: 10 } }, 'bad', '🤕')
        say(g, null, ['Dink master', 'New hobby'], 'You joined the league and turned out to be pretty good. You made a few friends and enemies.', `I joined a ${elderSport(g)} league.`, { health: 5, happiness: 6, athleticism: 2 }, 'good', '🏓')
      },
      trash: (g) => say(g, null, 'Villain arc', 'You joined the league and trash-talked everyone. You are now the most hated player in the retirement community, and you love it.', `I became the villain of my local ${elderSport(g)} league.`, { health: 4, happiness: 7, karma: -3 }),
      no: (g) => say(g, null, 'Spectator', 'You passed. You still go to watch the drama, though.', null, {}),
    },
  },
  {
    id: 'elder.freeTime',
    emoji: '🧓',
    title: 'Too Much Free Time',
    minAge: 50,
    maxAge: 110,
    cooldown: 8,
    when: (g) => g.character.retired,
    setup: () => ({
      text: "Retirement is great, but you've reorganized the garage four times this month. What will you do with all this free time?",
      choices: [ch('volunteer', 'Volunteer', '🤝'), ch('class', 'Take a class', '🎨'), ch('garden', 'Start a garden', '🌱'), ch('nap', 'Perfect the art of napping', '😴')],
    }),
    resolve: {
      volunteer: (g) => say(g, null, 'Giving back', 'You started volunteering at the animal shelter. The dogs think you are the best person alive.', 'I started volunteering in retirement.', { happiness: 6, karma: 8 }, 'good', '🤝'),
      class: (g) => {
        const topic = v(g, ['watercolor painting', 'Italian', 'pottery', '@1975 salsa dancing', '@homeComputer computer basics', 'astronomy'])
        say(g, null, 'Lifelong learner', `You signed up for a ${topic} class at ${g.character.countryId === 'us' ? 'the community college' : 'the community center'}. You're the teacher's favorite.`, `I took a ${topic} class in retirement.`, { smarts: 4, happiness: 5 }, 'good', '🎨')
      },
      garden: (g) => say(g, null, 'Green thumb', 'You planted a vegetable garden. You grew 40 zucchinis and gave them to neighbors who did not want them.', 'I started a vegetable garden.', { health: 3, happiness: 5 }, 'good', '🌱'),
      nap: (g) => say(g, null, 'Professional napper', 'You perfected the art of the 2 PM nap. You have never felt more rested.', 'I took a lot of naps in retirement.', { happiness: 4, health: 2 }),
    },
  },
  {
    id: 'elder.friendFuneral',
    emoji: '⚱️',
    title: 'Another Funeral',
    minAge: 68,
    maxAge: 120,
    cooldown: 10,
    setup: (g) => {
      const s = strangerName(g)
      const from = pick(g, ['your old job', 'the neighborhood', worshipPlace(g), g.character.countryId === 'us' ? 'the bowling league' : 'the market', 'your book club'])
      return {
        text: `Your old friend ${s.first} ${s.last} from ${from} passed away. Their family asked if you'd say a few words at the funeral. What will you do?`,
        choices: [ch('eulogy', 'Give a heartfelt eulogy', '🎙️'), ch('funny', 'Tell funny stories', '😂'), ch('attend', 'Just attend quietly', '🕯️'), ch('skip', "Skip it", '🚪')],
        data: { first: s.first, from },
      }
    },
    resolve: {
      eulogy: (g, x) => say(g, x, 'Beautiful words', `You gave a eulogy for ${x.s('first')} that left the whole room in tears.`, `I gave a eulogy at my old friend ${x.s('first')}'s funeral.`, { happiness: -3, karma: 5 }, 'neutral', '🎙️'),
      funny: (g, x) => say(g, x, 'Celebration of life', `You told the story about ${x.s('first')} and the stolen goat. The room laughed through the tears. ${x.s('first')} would have loved it.`, `I made everyone laugh at my old friend ${x.s('first')}'s funeral.`, { happiness: 2, karma: 4 }, 'good', '😂'),
      attend: (g, x) => say(g, x, 'Paying respects', `You sat in the back and said goodbye to ${x.s('first')} in your own way.`, `I attended my old friend ${x.s('first')}'s funeral.`, { happiness: -4 }),
      skip: (g, x) => say(g, x, 'Too many funerals', `You couldn't face another funeral. You lit a candle for ${x.s('first')} at home instead.`, `I skipped my old friend ${x.s('first')}'s funeral.`, { happiness: -5, karma: -2 }),
    },
  },
])

/** The old flame becomes a friend in your contacts. */
function addOldFriend(g: GameState, x: Ctx): void {
  if (friends(g).some((p) => p.firstName === x.s('first') && p.lastName === x.s('last'))) return
  const gender = x.s('gender') === 'female' ? 'female' : 'male'
  const age = Math.max(18, g.character.age + randInt(g, -2, 2))
  const p: Person = createFriend(g, x.s('first'), x.s('last'), gender, age)
  p.notes.push(`My ${localTerm(g, 'high')} crush; we reconnected late in life.`)
}

function createFriend(g: GameState, first: string, last: string, gender: 'male' | 'female', age: number): Person {
  return createPerson(g, { relation: 'friend', age, firstName: first, lastName: last, gender, relationship: 70, traits: ['nostalgic'] })
}
