// What the wider world asks someone with money for: friends' loans, dinners and startup pitches,
// the friend who only calls when they need cash, scammers and gold diggers (very rich only),
// charities and fans (rich and famous). Donations earn karma and a little fame with diminishing
// returns (wealth-core donationKarma / donationFame).
import { addHidden, addStat, attractedTo, count, currentPartner, log, notice, preferredGender, remember, removePerson, spend, useYearAction } from '../core'
import { pick, randInt } from '../rng'
import { randomFirstName } from '../world'
import { eraPick, eraPickPlain, landline } from './era'
import { channel, folks, mayAsk, scaled, type Ask, type AskDef } from './wealth-ask'
import { addVenture, ventureOdds, VENTURE_PARTIAL } from './wealth-kids'
import { boundary, markMarried, spouseFor } from './wealth-family'
import {
  cap,
  donationFame,
  donationKarma,
  goodsScale,
  isFriend,
  money,
  noteDonation,
  perceivedWealth,
  readTies,
  round,
  traitIn,
  typicalIncome,
  yourOf,
} from './wealth-core'
import type { GameState, Person } from '../types'

function he(p: Person): string {
  return p.gender === 'male' ? 'he' : 'she'
}

function friendsAged(g: GameState, lo: number, hi = 200): Person[] {
  return folks(g, isFriend, lo, hi).filter((p) => mayAsk(g, p) && p.relationship >= 20)
}

/** A friend who keeps coming back for money (asked twice in six years, or the type). */
export function isMoocher(g: GameState, p: Person): boolean {
  const t = readTies(g, p)
  const recent = t.history.filter((h) => h.y >= g.year - 6).length
  return recent >= 2 || (traitIn(p, 'manipulative', 'sneaky') && t.yes >= 1)
}

/**
 * Give to a cause: karma, happiness and (for public figures) a little fame, all with diminishing
 * returns over a lifetime of giving. Returns false when you can't afford it.
 */
export function donate(g: GameState, amount: number, cause: string): boolean {
  const amt = Math.max(0, Math.round(amount))
  if (amt <= 0 || !spend(g, amt)) return false
  const karma = donationKarma(g, amt)
  const fame = useYearAction(g, 'wealth.fame', 1) ? donationFame(g, amt) : 0
  noteDonation(g, amt)
  count(g, 'donated')
  addHidden(g, 'karma', karma)
  if (fame > 0) addHidden(g, 'fame', fame)
  addStat(g, 'happiness', randInt(g, 2, 4))
  log(g, `I donated ${money(amt)} to ${cause}.`, 'good')
  return true
}

function charityName(g: GameState): string {
  return pick(g, [`the ${g.character.city} Children's Hospital`, 'the Clean Rivers Fund', 'the Whisker Haven Animal Rescue', 'the Book Nook Literacy Project', `the ${g.character.city} Food Bank`, 'the Second Chances Foundation', 'the Guide Paws Trust'])
}

/** Three honest donation sizes for a pitch: a token, a solid gift and a headline gift. */
function donationTiers(g: GameState, big = false): number[] {
  const w = perceivedWealth(g)
  const floor = typicalIncome(g) * 0.05
  const shares = big ? [0.002, 0.01, 0.03] : [0.0005, 0.002, 0.01]
  return shares.map((s) => round(Math.max(floor, w * s)))
}

const SCAMS = [
  '@+internet,1996 an email from a "prince" who needs your help moving a fortune out of his country',
  '@-1996 a letter from a "foreign prince" who needs your help moving a fortune out of his country',
  'a smooth-talking man selling shares in a gold mine that is definitely real',
  '@landline a polite caller "from your bank" who needs to verify your account number',
  '@crypto a "financial advisor" with a coin that can only go up',
  'a "lottery" you never entered, which you won, pending a small processing fee',
]

export const WORLD_ASKS: AskDef[] = [
  // ----- Friends ----------------------------------------------------------------
  {
    id: 'friend.loan',
    cash: true,
    minTier: 1,
    cooldown: 3,
    prison: true,
    people: (g) => friendsAged(g, 20).filter((p) => !isMoocher(g, p)),
    weight: () => 2,
    build: (g, tier, p) => {
      if (!p) return null
      const why = eraPickPlain(g, ['a divorce lawyer', 'back rent', '@cars a car repair that turned into a new engine', 'a move across the country for a new job', '@creditCards a credit card bill that got out of hand', '@-1960 the grocer, the tailor and the bookie'])
      const amt = scaled(g, 6_000, tier, p, 0.02)
      return { k: 'friend.loan', pid: p.id, title: 'A Favor', emoji: '\u{1F91D}', text: `${channel(g, p)}${cap(yourOf(p))} asked to borrow ${money(amt)} for ${why}. ${cap(he(p))} swears it's the first and last time, and to be fair, it is the first time.`, amt, what: why, less: true, lend: true }
    },
    thanks: 9,
    hurt: 8,
  },
  {
    id: 'friend.dinner',
    minTier: 1,
    cooldown: 1,
    people: (g) => friendsAged(g, 18),
    when: (g) => !g.character.prison,
    weight: () => 2,
    build: (g, _tier, p) => {
      if (!p) return null
      const amt = round(randInt(g, 120, 450) * goodsScale(g))
      return { k: 'friend.dinner', pid: p.id, title: 'The Check', emoji: '\u{1F37D}\u{FE0F}', text: `${cap(yourOf(p))} "forgot ${p.gender === 'male' ? 'his' : 'her'} wallet" at a dinner ${he(p)} picked, at the most expensive place in town (${money(amt)}). Again.`, amt, what: 'dinner', small: true }
    },
    thanks: 3,
    hurt: 3,
  },
  {
    id: 'friend.wedding',
    minTier: 1,
    cooldown: 6,
    people: (g) => friendsAged(g, 22, 55).filter((p) => p.data.married !== true),
    when: (g) => !g.character.prison,
    weight: () => 0.8,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = scaled(g, 1_500, tier, p, 0.002)
      const spouse = spouseFor(g, p)
      return { k: 'friend.wedding', pid: p.id, title: 'Wedding Gift', emoji: '\u{1F381}', text: `${cap(yourOf(p))} is marrying ${spouse}. The gift registry has one item left, and it's the expensive one (${money(amt)}). Everybody knows you'll get it. ${cap(he(p))} knows you'll get it.`, amt, what: 'a wedding gift', buy: true, small: amt <= perceivedWealth(g) * 0.002, x: { spouse } }
    },
    // The wedding happens with or without the gift.
    onGive: (_g, a, p) => {
      if (p) markMarried(p, a.x?.spouse, 'you got the big gift off the registry')
      return ''
    },
    onNo: (_g, a, p) => {
      if (p) markMarried(p, a.x?.spouse, 'you skipped the registry')
      return ''
    },
    thanks: 7,
    hurt: 5,
  },
  {
    id: 'friend.startup',
    minTier: 2,
    cooldown: 5,
    people: (g) => friendsAged(g, 22, 65),
    weight: () => 1.1,
    build: (g, tier, p) => {
      if (!p) return null
      const idea = eraPickPlain(g, ['@1935 a chain of laundromats with a bar inside', '@smartphone an app that tells you which app to use', '@+internet,1997 a website for selling used furniture', '@1990 a luxury dog bakery', '@2005 a board game cafe', '@1985 a gourmet popcorn franchise', 'a traveling circus (modern, ethical, mostly jugglers)', 'a hat shop for very large hats'])
      const amt = scaled(g, 60_000, tier, p, 0.04)
      return { k: 'friend.startup', pid: p.id, title: 'The Pitch', emoji: '\u{1F4C8}', text: `${channel(g, p)}${cap(yourOf(p))} pitched you ${idea} for ${money(amt)}. The slides had sound effects. ${cap(he(p))} used the word "disrupt" eleven times.`, amt, what: idea, less: true, odds: ventureOdds(p), partial: VENTURE_PARTIAL }
    },
    onGive: (g, a, p, amount) => {
      if (!p) return ''
      addVenture(g, a, yourOf(p), amount, 'venture', p)
      return ''
    },
    thanks: 10,
    hurt: 6,
  },
  {
    id: 'friend.moocher',
    cash: true,
    minTier: 1,
    cooldown: 2,
    prison: true,
    people: (g) => folks(g, isFriend, 18).filter((p) => mayAsk(g, p, 1) && isMoocher(g, p)),
    weight: () => 2.5,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = scaled(g, 3_000, tier, p, 0.005)
      return { k: 'friend.moocher', pid: p.id, title: 'Long Time No See', emoji: '\u{1F4DE}', text: `${channel(g, p)}${cap(yourOf(p))} got in touch for the first time since the last time ${he(p)} needed money. This time it's ${money(amt)}, for "an opportunity." You've noticed a pattern. ${cap(he(p))} is hoping you haven't.`, amt, what: 'an "opportunity"', less: true, lend: true }
    },
    extras: [
      {
        id: 'unfriend',
        label: (_g, _a, p) => `Stop being ${p ? p.firstName + "'s" : 'their'} bank (end the friendship)`,
        emoji: '\u{1F44B}',
        run: (g, _a, p) => {
          if (!p) return
          removePerson(g, p.id)
          log(g, `I ended my friendship with ${p.firstName} ${p.lastName}, who only ever called when ${he(p)} needed money.`)
          notice(g, 'Long Time No See', `You told ${p.firstName} you're a friend, not a bank, and that you're done being either. ${cap(he(p))} called you "changed." You are: you're richer now.`, { emoji: '\u{1F44B}' })
        },
      },
    ],
    thanks: 5,
    hurt: 4,
  },
  {
    id: 'friend.medical',
    minTier: 1,
    cooldown: 5,
    prison: true,
    people: (g) => friendsAged(g, 25).filter((p) => p.relationship >= 50),
    weight: () => 0.8,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = scaled(g, 15_000, Math.min(tier, 2), p, 0.02)
      return { k: 'friend.medical', pid: p.id, title: 'A Friend in Need', emoji: '\u{1FA7A}', text: `${channel(g, p)}${cap(yourOf(p))} is facing a big medical bill (${money(amt)}) and quietly asked if you could help. ${cap(he(p))} has never asked you for anything before.`, amt, what: 'a medical bill', less: true, lend: true }
    },
    onGive: (g, _a, p) => {
      if (p) p.stats.health = Math.min(100, p.stats.health + randInt(g, 5, 12))
      return ''
    },
    need: true,
    thanks: 14,
    hurt: 10,
  },
  // ----- Strangers --------------------------------------------------------------
  {
    id: 'stranger.scam',
    noNo: true,
    minTier: 2,
    cooldown: 3,
    when: (g, tier) => !boundary(g, 'strangers') && (tier >= 3 || g.character.age >= 65),
    weight: (g) => (g.character.age >= 65 ? 2 : 1.2),
    build: (g, tier) => {
      const pitch = eraPick(g, SCAMS)
      const amt = scaled(g, 15_000, tier, undefined, 0.01)
      return { k: 'stranger.scam', name: 'a stranger', title: 'Opportunity Knocks', emoji: '\u{1F3A3}', text: `You got ${pitch}. All it takes is ${money(amt)} up front. It feels urgent. It feels secret. It feels, frankly, like a lot of exclamation points.`, amt, what: 'a stranger\'s "opportunity"' }
    },
    custom: true,
    extras: [
      {
        id: 'send',
        label: (_g, a) => `Send the ${money(a.amt)}`,
        emoji: '\u{1F4B8}',
        run: (g, a) => {
          if (!spend(g, a.amt)) {
            notice(g, 'Opportunity Knocks', "You went to send the money and didn't have it. Possibly the luckiest broke moment of your life.", { emoji: '\u{1F4B8}' })
            return
          }
          count(g, 'scammed')
          addStat(g, 'happiness', -randInt(g, 4, 8))
          log(g, `I lost ${money(a.amt)} to a scam.`, 'bad')
          notice(g, 'Scammed', `You sent ${money(a.amt)}. The "opportunity" stopped answering the next morning. The money is gone, and so is a little of your faith in people.`, { emoji: '\u{1F3A3}', tone: 'bad' })
        },
      },
      {
        id: 'report',
        label: () => 'Report it to the police',
        emoji: '\u{1F46E}',
        run: (g) => {
          addHidden(g, 'karma', 2)
          notice(g, 'Opportunity Knocks', pick(g, ['You reported it. The officer sighed: you are the ninth this week. They took a statement anyway.', `You reported it, and the police traced it to a man in a rented office with ${landline(g) ? 'forty phones' : 'a printing press and a stack of fake share certificates'}. You saved some people a lot of money.`]), { emoji: '\u{1F46E}', tone: 'good' })
        },
      },
      {
        id: 'block',
        label: () => 'Ignore it (and tighten up who can reach you)',
        emoji: '\u{1F6E1}\u{FE0F}',
        run: (g) => {
          g.flags['wealth.bound.strangers'] = g.year + 5
          notice(g, 'Opportunity Knocks', 'You ignored it and had your assistant screen everything from now on. The "princes" will have to find someone else.', { emoji: '\u{1F6E1}\u{FE0F}' })
        },
      },
    ],
  },
  {
    id: 'stranger.golddigger',
    noLabel: 'Politely decline',
    minTier: 3,
    cooldown: 4,
    when: (g) => !g.character.prison && !currentPartner(g) && g.character.age >= 25 && !boundary(g, 'strangers'),
    weight: () => 1,
    build: (g, tier) => {
      const gender = preferredGender(g)
      if (!attractedTo(g.character, gender)) return null
      const first = randomFirstName(g, g.character.countryId, gender)
      const age = Math.max(21, Math.min(g.character.age - 5, randInt(g, 22, 35)))
      const amt = scaled(g, 8_000, tier, undefined, 0.005)
      const pro = gender === 'male' ? 'He' : 'She'
      return { k: 'stranger.golddigger', name: first, title: 'Admirer', emoji: '\u{1F48B}', text: `${first} (${age}) has suddenly taken a deep interest in you, your hobbies and your net worth, mostly the net worth. ${pro} laughs at all your jokes, including the ones that weren't jokes. ${pro} has already mentioned a bracelet.`, amt, what: 'an admirer' }
    },
    custom: true,
    extras: [
      {
        id: 'enjoy',
        label: (_g, a) => `Enjoy the attention (about ${money(a.amt)} in dinners and gifts)`,
        emoji: '\u{1F942}',
        run: (g, a) => {
          if (!spend(g, a.amt)) {
            notice(g, 'Admirer', `Your card was declined at the first dinner. ${a.name ?? 'Your admirer'} excused themselves to the bathroom and never came back.`, { emoji: '\u{1F48B}' })
            return
          }
          addStat(g, 'happiness', randInt(g, 4, 8))
          log(g, `I spent ${money(a.amt)} on an admirer who left when the gifts stopped.`)
          notice(g, 'Admirer', `You had a glamorous few months with ${a.name ?? 'your admirer'}: dinners, gifts, a weekend away. When you hinted the gifts might slow down, so did everything else.`, { emoji: '\u{1F942}' })
        },
      },
      {
        id: 'prenup',
        label: () => 'Mention a prenup on the first date',
        emoji: '\u{1F4DC}',
        run: (g, a) => {
          addStat(g, 'happiness', randInt(g, 1, 3))
          notice(g, 'Admirer', `You brought up a prenup over the appetizers. ${a.name ?? 'Your admirer'} remembered an urgent appointment before the main course. You ate both desserts.`, { emoji: '\u{1F4DC}' })
        },
      },
    ],
  },
  // ----- Charity and fans -------------------------------------------------------
  {
    id: 'charity.gala',
    noLabel: 'Decline politely',
    minTier: 2,
    cooldown: 2,
    when: (g, tier) => !g.character.prison && !boundary(g, 'charity') && (tier >= 3 || g.character.hidden.fame >= 30),
    weight: (g) => 1.5 + g.character.hidden.fame / 50,
    build: (g) => {
      const cause = charityName(g)
      const [a, b, c] = donationTiers(g)
      return { k: 'charity.gala', name: cause, title: 'Charity Gala', emoji: '\u{1F396}\u{FE0F}', text: `You've been invited to the gala for ${cause}, which means you're expected to give. Everybody will see the number on the big board.`, amt: b, what: `a donation to ${cause}`, x: { a, b, c, cause } }
    },
    custom: true,
    extras: [0, 1, 2].map((i) => ({
      id: `d${i}`,
      label: (_g: GameState, a: Ask) => `${['Donate', 'Donate', 'Make the headline gift:'][i]} ${money(donationOf(a, i))}`,
      emoji: ['\u{1FA99}', '\u{1F4B5}', '\u{1F4B0}'][i],
      // Only the gifts you can actually pay for right now.
      show: (g: GameState, a: Ask) => g.character.money >= donationOf(a, i),
      run: (g: GameState, a: Ask) => giveToCause(g, a, donationOf(a, i)),
    })),
  },
  {
    id: 'charity.wing',
    noLabel: 'Decline politely',
    minTier: 4,
    cooldown: 6,
    when: (g) => !g.character.prison && !boundary(g, 'charity'),
    weight: () => 1,
    build: (g) => {
      const what = pick(g, [`a new wing at the ${g.character.city} hospital`, 'a library at your old school', 'a scholarship fund in your name', 'a park with a statue of you (tasteful, mostly)'])
      const [a, b, c] = donationTiers(g, true)
      return { k: 'charity.wing', name: 'the committee', title: 'Your Name on a Building', emoji: '\u{1F3DB}\u{FE0F}', text: `A very polite committee would like to build ${what}. They have already drafted the plaque. Your name is in a lovely serif font.`, amt: b, what, x: { a, b, c, cause: what } }
    },
    custom: true,
    extras: [0, 1, 2].map((i) => ({
      id: `d${i}`,
      label: (_g: GameState, a: Ask) => `${['Chip in', 'Fund most of it:', 'Fund all of it:'][i]} ${money(donationOf(a, i))}`,
      emoji: ['\u{1FA99}', '\u{1F4B5}', '\u{1F3DB}\u{FE0F}'][i],
      show: (g: GameState, a: Ask) => g.character.money >= donationOf(a, i),
      run: (g: GameState, a: Ask) => {
        if (giveToCause(g, a, donationOf(a, i)) && i === 2) remember(g, `Funded ${typeof a.x?.cause === 'string' ? a.x.cause : 'a building'}.`)
      },
    })),
  },
  {
    id: 'fans.letter',
    minTier: 1,
    cooldown: 1,
    when: (g) => g.character.hidden.fame >= 50,
    weight: (g) => g.character.hidden.fame / 25,
    build: (g) => {
      const first = randomFirstName(g, g.character.countryId, pick(g, ['male', 'female'] as const))
      const why = pick(g, ["a sick dog's vet bill", 'a wedding dress', 'bus fare to see you perform', 'a new wheelchair', 'their grandmother\'s birthday trip'])
      const amt = round(randInt(g, 200, 2_500) * goodsScale(g))
      return { k: 'fans.letter', name: `a fan named ${first}`, title: 'Fan Mail', emoji: '\u{1F48C}', text: `A fan named ${first} wrote you a heartfelt letter asking for help with ${why} (${money(amt)}). There's a drawing of you. It's... a drawing.`, amt, what: why, small: true }
    },
    onGive: (g, _a, _p, amount) => {
      const k = donationKarma(g, amount)
      noteDonation(g, amount)
      addHidden(g, 'karma', k)
      return 'They posted the thank-you letter everywhere. Your fans are very loud about it.'
    },
  },
]

function donationOf(a: Ask, i: number): number {
  const v = a.x?.[['a', 'b', 'c'][i]]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : a.amt
}

function giveToCause(g: GameState, a: Ask, amount: number): boolean {
  const cause = typeof a.x?.cause === 'string' ? a.x.cause : a.what
  const karmaBefore = g.character.hidden.karma
  const fameBefore = g.character.hidden.fame
  if (!donate(g, amount, cause)) {
    notice(g, a.title, `You don't have ${money(amount)} in cash right now. You sent your regrets and a very nice card.`, { emoji: '\u{1F4B8}' })
    return false
  }
  const karma = g.character.hidden.karma - karmaBefore
  const fame = g.character.hidden.fame - fameBefore
  const effect = karma >= 5 ? 'People are calling you a philanthropist.' : karma >= 2 ? 'It felt good.' : 'It felt good, though the applause is getting quieter: people expect it from you now.'
  notice(g, a.title, `You gave ${money(amount)} to ${cause}. ${effect}${fame > 0 ? ' The papers covered it.' : ''}`, { emoji: '\u{1F49D}', tone: 'good' })
  return true
}
