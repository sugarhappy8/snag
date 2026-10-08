// Era pack 1980-1999: popup events about growing up in the eighties and nineties (arcades,
// the Walkman, mixtapes, the video store, pagers, dial-up, pocket monsters). Each only makes
// sense in its years and places; outcomes are honest weighted rolls (the purple Gaming hint
// quotes the same weights). Real brands and titles are touchstones; no real people are named.
import { applyEffects } from '../effects'
import { preferredGender, parents } from '../core'
import { hasTalent } from '../talents'
import type { EventDef } from './helpers'
import { aParent, anyOf, friends, kids, money, partner, strangerName } from './helpers'
import { adoption, anglo, eraEvents, eraPrice, inCountry, richCountry, videoChain, wealthOf, type EraEventSpec } from './era-late-kit'
import { common } from './era'

const consumer = (g: Parameters<typeof wealthOf>[0]): boolean => wealthOf(g) >= 0.3
/** Cassettes and video shops reached nearly everywhere: even the poorer countries had them by the mid-eighties. */
const everyday = (g: Parameters<typeof wealthOf>[0]): boolean => wealthOf(g) >= 0.15
const firstParent = (g: Parameters<typeof parents>[0]) => parents(g).find((p) => p.alive)

/** The big toy of the year, or null when there was no craze (parents queued for it). */
function toyOfYear(year: number): string | null {
  if (year >= 1983 && year <= 1984) return 'a Cabbage Patch Kids doll'
  if (year >= 1985 && year <= 1986) return 'a talking bear called Teddy Ruxpin'
  if (year >= 1987 && year <= 1989) return 'a Nintendo Entertainment System'
  if (year >= 1990 && year <= 1992) return 'the new Super Nintendo'
  if (year >= 1993 && year <= 1995) return 'the Mighty Morphin Power Rangers action figures'
  if (year === 1996) return 'a giggling Tickle Me Elmo'
  if (year === 1997) return 'a Tamagotchi'
  if (year >= 1998 && year <= 1999) return 'a Furby'
  return null
}

const SPECS: EraEventSpec[] = [
  {
    id: 'era.1980s.arcade',
    emoji: '\u{1F579}\u{FE0F}',
    title: 'Quarter Muncher',
    minAge: 8,
    maxAge: 19,
    years: [1980, 1996],
    weight: 20,
    cooldown: 3,
    when: (g) => adoption(g, 'videoGameConsole', 0.04) && consumer(g),
    text: (g) => ({
      text: `The arcade machine everybody talks about has a long line and a high score belonging to somebody with the initials ACE. You have ${money(eraPrice(g, 3))} in coins in your pocket. What will you do?`,
      data: { cost: eraPrice(g, 3) },
    }),
    opts: [
      {
        id: 'play',
        label: 'Feed the machine until the coins run out',
        emoji: '\u{1FA99}',
        when: (g) => g.character.money >= eraPrice(g, 3),
        hint: { talent: 'Gaming', of: 0, text: (pct) => `Your reflexes are real: about ${pct}% to beat the top score.` },
        outs: [
          {
            w: (g) => (hasTalent(g, 'Gaming') ? 34 : 20),
            t: 'New High Score',
            x: 'You beat the top score and typed your own initials in. For a week you were the king of the arcade.',
            l: 'I put my initials at the top of the arcade high-score list.',
            fx: (_g, x) => ({ happiness: 10, fame: 1, money: -x.n('cost') }),
            tone: 'good',
          },
          {
            w: (g) => (hasTalent(g, 'Gaming') ? 66 : 80),
            t: 'Game Over',
            x: 'You spent every coin and made it to the third level. A kid half your size took over the machine and beat your best score in one try.',
            l: 'I blew my coins at the arcade and lost to a small child.',
            fx: (_g, x) => ({ happiness: -3, money: -x.n('cost') }),
            tone: 'bad',
          },
        ],
      },
      {
        id: 'ask',
        label: 'Ask a parent for more coins',
        emoji: '\u{1F64F}',
        when: (g) => g.character.age < 17 && !!firstParent(g),
        outs: [
          { w: (g) => ((firstParent(g)?.relationship ?? 0) >= 50 ? 65 : 35), t: 'A Few Extra Coins', x: 'Your parent sighed, dug into a pocket and gave you a handful of coins. "One hour. Then home."', l: 'A parent gave me extra money for the arcade.', fx: { happiness: 5, rel: 1 } },
          { w: (g) => ((firstParent(g)?.relationship ?? 0) >= 50 ? 35 : 65), t: 'Nice Try', x: 'Your parent said you could play when you had cleaned your room. You looked at the room. You looked at the arcade. You stayed home.', fx: { happiness: -2 } },
        ],
      },
      {
        id: 'watch',
        label: 'Watch the champion and learn the patterns',
        emoji: '\u{1F440}',
        outs: [
          { w: 6, t: 'Student of the Game', x: 'You spent an hour studying the champion’s every move and picked up a pattern or two. You never wasted a coin.', l: 'I spent an afternoon at the arcade studying how the best player did it.', fx: { smarts: 2, happiness: 3 } },
          { w: 4, t: 'Hanger-On', x: 'The line for the machine never moved, and you ended up helping a stranger find a lost sneaker instead.', fx: { happiness: 1 } },
        ],
      },
      {
        id: 'home',
        label: 'Skip it and go do my homework',
        emoji: '\u{1F4D6}',
        outs: [{ t: 'Responsible', x: 'You skipped the arcade and finished your homework. Your future self gives you a small nod.', fx: { happiness: -1, grades: 2, smarts: 1 } }],
      },
    ],
  },
  {
    id: 'era.1980s.walkman',
    emoji: '\u{1F3A7}',
    title: 'Personal Stereo',
    minAge: 9,
    maxAge: 25,
    years: [1980, 1996],
    weight: 18,
    once: true,
    when: everyday,
    text: (g) => {
      const f = anyOf(g, friends(g))
      return {
        text: `${f ? `${f.firstName} walked in wearing` : 'Everybody at school seems to be wearing'} headphones attached to a tape player that clips to a belt, and music follows them everywhere. It costs ${money(eraPrice(g, 70))}. You want one more than you have ever wanted anything. What will you do?`,
        person: f,
        data: { cost: eraPrice(g, 70) },
      }
    },
    opts: [
      {
        id: 'buy',
        label: 'Buy one with my own money',
        emoji: '\u{1F4B5}',
        when: (g) => g.character.money >= eraPrice(g, 70),
        outs: [{ t: 'Soundtrack of My Life', x: 'You bought one and walked home with a soundtrack for the first time. The world felt like a movie.', l: 'I bought my first personal stereo and walked home with music in my ears.', fx: (_g, x) => ({ happiness: 12, money: -x.n('cost') }), tone: 'good' }],
      },
      {
        id: 'ask',
        label: 'Ask my parents for one',
        emoji: '\u{1F64F}',
        when: (g) => g.character.age < 22 && !!firstParent(g),
        outs: [
          { w: (g) => ((firstParent(g)?.relationship ?? 0) >= 60 ? 60 : 35), t: 'Birthday Early', x: 'Your parent frowned, then smiled and said "Call it an early birthday." You wore the headphones all weekend.', l: 'My parents bought me a personal stereo.', fx: { happiness: 12, rel: 3 }, tone: 'good' },
          { w: (g) => ((firstParent(g)?.relationship ?? 0) >= 60 ? 40 : 65), t: 'Too Expensive', x: 'Your parent said that was more than a week of groceries and that you could save up for it. The lesson stung more than the no.', fx: { happiness: -4, rel: -1 } },
        ],
      },
      {
        id: 'borrow',
        label: 'Borrow a friend’s for the weekend',
        emoji: '\u{1F91D}',
        when: (g) => friends(g).length > 0,
        outs: [
          { w: 7, t: 'Sharing Is Caring', x: (_g, x) => `${x.p?.firstName ?? 'Your friend'} lent you theirs for a day. You listened to the same tape eleven times and returned it with fresh batteries.`, fx: { happiness: 5, rel: 3 } },
          { w: 2, t: 'Eaten Tape', x: (_g, x) => `The player ate ${x.p?.firstName ?? 'your friend'}'s favorite tape in a long brown ribbon. You spent an evening winding it back with a pencil and an apology.`, fx: { happiness: -4, rel: -6 }, tone: 'bad' },
        ],
      },
      {
        id: 'radio',
        label: 'Stick with the radio',
        emoji: '\u{1F4FB}',
        outs: [{ t: 'Request Line', x: 'You kept your ear on the radio and your finger on the record button. You made a mixtape, one song at a time, and the DJ always talked over the ending.', fx: { happiness: 2 } }],
      },
    ],
  },
  {
    id: 'era.1980s.mixtape',
    emoji: '\u{1F4FC}',
    title: 'The Mixtape',
    minAge: 12,
    maxAge: 30,
    years: [1980, 2002],
    weight: 18,
    cooldown: 5,
    when: everyday,
    text: (g) => {
      const f = anyOf(g, friends(g))
      const cd = g.year >= 1999 && adoption(g, 'homeComputer', 0.1)
      return {
        text: `You spent the whole weekend ${cd ? 'burning songs onto a disc' : 'recording songs off the radio and from your records onto a blank tape'}, arranging the order carefully so every track says something. ${cd ? 'Now' : 'Now it’s ready, and'} you have to decide who gets to hear it.`,
        person: f,
        data: { medium: cd ? 'mix CD' : 'mixtape' },
      }
    },
    opts: [
      {
        id: 'crush',
        label: 'Give it to my crush',
        emoji: '\u{1F495}',
        when: (g) => g.character.age >= 13 && !partner(g),
        outs: [
          {
            w: (g) => 28 + Math.max(0, Math.round((g.character.stats.looks - 50) / 4)),
            t: 'Side A',
            x: (_g, x) => `Your crush listened to the ${x.s('medium')} twice in a row and asked what song number six was called. By the end of the week you were an item.`,
            l: 'I made a mixtape for my crush and it worked.',
            fx: { happiness: 12 },
            tone: 'good',
            after: (g) => {
              const c = g.character
              applyEffects(g, { newPerson: { relation: 'partner', firstName: strangerName(g, preferredGender(g)).first, gender: preferredGender(g), age: c.age + (c.age < 18 ? 0 : 1) } })
            },
          },
          { w: 40, t: 'Nice Songs', x: (_g, x) => `Your crush said "thanks, that's cool" and put the ${x.s('medium')} in a drawer. It will never be played. You will never know.`, fx: { happiness: -3 } },
          { w: 20, t: 'Passed Around', x: (_g, x) => `Your crush played the ${x.s('medium')} for friends and they laughed at song number four. You heard about it on Monday.`, l: 'My crush laughed at the mixtape I made for them.', fx: { happiness: -7 }, tone: 'bad' },
        ],
      },
      {
        id: 'friend',
        label: 'Give it to a friend',
        emoji: '\u{1F91D}',
        when: (g) => friends(g).length > 0,
        outs: [{ t: 'Best Mix Ever', x: (_g, x) => `${x.p?.firstName ?? 'Your friend'} listened to it on repeat all week and called you "a genius." You are now the unofficial DJ of the group.`, l: 'My mixtape became the soundtrack for my friends.', fx: { happiness: 5, rel: 8 }, tone: 'good' }],
      },
      {
        id: 'keep',
        label: 'Keep it for myself',
        emoji: '\u{1F3B6}',
        outs: [{ t: 'Soundtrack for One', x: (_g, x) => `You played the ${x.s('medium')} until it wore out. It was the best thing you made all year.`, fx: { happiness: 4 } }],
      },
    ],
  },
  {
    id: 'era.1980s.videoStore',
    emoji: '\u{1F4FC}',
    title: 'Overdue',
    minAge: 12,
    maxAge: 70,
    years: [1982, 2005],
    weight: 18,
    cooldown: 6,
    when: (g) => everyday(g) && common(g, 'tv') && (g.year >= 1985 || richCountry(g)),
    text: (g) => {
      const chain = videoChain(g)
      const fee = eraPrice(g, 6)
      const what = g.year >= 1999 ? 'DVD' : 'tape'
      return {
        text: `You find a rented ${what} from ${chain ?? 'the video store'} under the sofa, a week past the due date. The late fee is ${money(fee)} and counting. What will you do?`,
        data: { fee, what, store: chain ?? 'the video store' },
      }
    },
    opts: [
      {
        id: 'pay',
        label: (g) => `Return it and pay the fee (${money(eraPrice(g, 6))})`,
        emoji: '\u{1F4B5}',
        outs: [{ t: 'The Cost of Forgetting', x: (_g, x) => `You paid the late fee at ${x.s('store')} and promised yourself you would rewind and return on time from now on. You will not.`, l: 'I paid a video late fee that cost more than the rental.', fx: (_g, x) => ({ money: -x.n('fee'), happiness: -1 }) }],
      },
      {
        id: 'drop',
        label: 'Slip it into the drop box and hope',
        emoji: '\u{1F91E}',
        outs: [
          { w: 4, t: 'Nobody Noticed', x: 'Nobody checked. The tape went back onto the shelf and your account stayed clean. You feel like a master criminal.', fx: { happiness: 3 } },
          { w: 6, t: 'The Fee Followed', x: (_g, x) => `${x.s('store')} had your name on file. The late fees were added to your account, plus a reminder in a stern little letter.`, l: 'I tried to sneak a late rental back and still got the fee.', fx: (_g, x) => ({ money: -x.n('fee') * 2, happiness: -3 }), tone: 'bad' },
        ],
      },
      {
        id: 'keep',
        label: 'Keep it. It is a classic now.',
        emoji: '\u{1F5C3}\u{FE0F}',
        outs: [{ t: 'Collector', x: (_g, x) => `You kept the ${x.s('what')} and watched it twice more. A bill for the full replacement value arrived a month later, and your membership was cancelled.`, l: 'I kept a rental and got a bill for the full price.', fx: (g) => ({ money: -eraPrice(g, 25), happiness: -3, karma: -2 }), tone: 'bad' }],
      },
    ],
  },
  {
    id: 'era.1980s.mtvVcr',
    emoji: '\u{1F4FA}',
    title: 'Record Over It',
    minAge: 11,
    maxAge: 22,
    years: [1982, 1997],
    weight: 16,
    cooldown: 6,
    when: (g) => consumer(g) && common(g, 'tv') && g.year >= 1985 && !!firstParent(g),
    text: () => ({
      text: 'Your favorite music video is on at four o’clock, and you want it on tape forever. The only blank-looking tape in the house is labeled "WEDDING 1976." What will you do?',
    }),
    opts: [
      {
        id: 'record',
        label: 'Record over the wedding tape',
        emoji: '\u{1F534}',
        outs: [
          { w: 5, t: 'Caught Red-Handed', x: 'Your parent found the tape in the machine and pressed play to hear your video, and not their wedding. The silence was very loud.', l: 'I taped a music video over my parents’ wedding video.', fx: (g) => ({ happiness: -6, rels: [{ p: firstParent(g), d: -12 }], karma: -2 }), tone: 'bad' },
          { w: 5, t: 'Perfect Crime', x: 'You recorded the video, then rewound the tape to the exact start of the wedding. Nobody ever suspected a thing.', fx: { happiness: 7 }, tone: 'good' },
        ],
      },
      {
        id: 'wait',
        label: 'Be patient and catch it next time',
        emoji: '\u{23F3}',
        outs: [{ t: 'Waiting Game', x: 'You waited, and the video played again, two days later, at a better hour. Patience paid off, and the wedding stayed intact.', fx: { happiness: 2, discipline: 2 } }],
      },
      {
        id: 'ask',
        label: 'Ask a parent for a new blank tape',
        emoji: '\u{1F64F}',
        outs: [
          { w: 6, t: 'New Tape', x: 'Your parent found a pack of blank tapes in a drawer. "Don\'t tell your father about the wedding thing," they said, which was strange, since you had not done anything.', fx: { happiness: 4, rel: 2 } },
          { w: 3, t: 'Use What You Have', x: 'Your parent said the family had no money for tapes, then handed you a half-used one. You taped it between two cartoons.', fx: { happiness: 1 } },
        ],
      },
    ],
  },
  {
    id: 'era.1990s.pager',
    emoji: '\u{1F4DF}',
    title: 'Beep',
    minAge: 14,
    maxAge: 50,
    years: [1990, 2002],
    weight: 18,
    cooldown: 6,
    when: (g) => adoption(g, 'mobilePhone', 0.02),
    text: (g) => {
      const teen = g.character.age < 19
      return {
        text: teen ? 'The pager on your belt buzzes in the middle of math class. The number on the little screen is 143, the code for "I love you." What will you do?' : 'Your pager buzzes in the middle of dinner with the number of your workplace. What will you do?',
        data: { teen: teen ? 1 : 0 },
      }
    },
    opts: [
      {
        id: 'check',
        label: 'Check it under the desk',
        emoji: '\u{1F440}',
        when: (g) => g.character.age < 19,
        outs: [
          { w: 6, t: 'Caught', x: 'The teacher confiscated the pager and read the number out loud to the class. You survived the laughter, but not the detention.', l: 'My teacher confiscated my pager in class.', fx: { happiness: -5, grades: -2, rels: [] }, tone: 'bad' },
          { w: 4, t: '143', x: 'Nobody noticed. You sent back "143" from the pay phone at lunch and smiled for the rest of the day.', fx: { happiness: 7 }, tone: 'good' },
        ],
      },
      {
        id: 'ignore',
        label: 'Ignore it until the bell',
        emoji: '\u{1F910}',
        when: (g) => g.character.age < 19,
        outs: [{ t: 'Self-Control', x: 'You kept your hands on your desk, took notes and called back from the hallway. The suspense made lunch taste better.', fx: { grades: 2, discipline: 2, happiness: 1 } }],
      },
      {
        id: 'answer',
        label: 'Answer right away from the nearest phone',
        emoji: '\u{260E}\u{FE0F}',
        when: (g) => g.character.age >= 19,
        outs: [{ t: 'Always On Call', x: 'You found a pay phone, apologized to the table, and sorted out the problem in four minutes. Dinner was cold, but the boss noticed.', l: 'My pager went off in the middle of dinner and I answered.', fx: { perf: 4, happiness: -3 } }],
      },
      {
        id: 'later',
        label: 'Finish dinner. It can wait.',
        emoji: '\u{1F37D}\u{FE0F}',
        when: (g) => g.character.age >= 19,
        outs: [
          { w: 3, t: 'It Could Wait', x: 'You finished dinner in peace and called back an hour later. It was a question about where the stapler was.', fx: { happiness: 4 } },
          { w: 1, t: 'It Could Not', x: 'You finished dinner in peace and called back an hour later. It was important. Your boss let you know.', fx: { happiness: -2, perf: -4 }, tone: 'bad' },
        ],
      },
      {
        id: 'home',
        label: 'Leave the pager at home from now on',
        emoji: '\u{1F3E0}',
        outs: [{ t: 'Unplugged', x: 'You left the pager on the kitchen table. It buzzed alone all evening while you enjoyed the quiet.', fx: { happiness: 3 } }],
      },
    ],
  },
  {
    id: 'era.1990s.dialUp',
    emoji: '\u{1F4DE}',
    title: 'Screech and Silence',
    minAge: 8,
    maxAge: 70,
    years: [1995, 2006],
    weight: 22,
    cooldown: 5,
    when: (g) => adoption(g, 'internet', 0.04) && adoption(g, 'homeComputer', 0.1),
    text: (g) => {
      const kid = g.character.age < 20
      const who = kid ? (aParent(g)?.firstName ?? 'a parent') : 'someone in the house'
      return {
        text: `The modem screeched and you were finally online after four tries. Just as the page began to load, ${who} picked up the phone, the connection dropped and the line went silent. What will you do?`,
        data: { who },
      }
    },
    opts: [
      {
        id: 'yell',
        label: 'Yell about it',
        emoji: '\u{1F620}',
        outs: [{ t: 'Phone War', x: (_g, x) => `You shouted that ${x.s('who')} had ruined everything. The family agreed that you needed a better reason to shout than a half-loaded page.`, fx: { happiness: -2, rel: -3, karma: -1 }, tone: 'bad' }],
      },
      {
        id: 'line',
        label: 'Push for a second phone line',
        emoji: '\u{260E}\u{FE0F}',
        outs: [
          {
            w: (g) => (g.character.age >= 20 ? 1 : 0),
            t: 'Line Two',
            x: 'You paid for a second phone line. The installer left a mess, but from now on the family could talk and you could surf in peace.',
            l: 'I paid for a second phone line so I could stay online.',
            fx: (g) => ({ money: -eraPrice(g, 80), happiness: 6 }),
          },
          { w: (g) => (g.character.age >= 20 ? 0 : 1), t: 'Negotiation', x: 'You made a presentation about how the world was changing and the family needed a second line. Your parents said they would "think about it," which means no.', fx: { happiness: -1, smarts: 1 } },
        ],
      },
      {
        id: 'schedule',
        label: 'Agree on a schedule',
        emoji: '\u{1F4C5}',
        outs: [{ t: 'Peace Treaty', x: 'The family signed an official schedule: phone until eight, modem afterward. It was the most organized thing that ever happened in your house.', fx: { happiness: 3, discipline: 3, rel: 3 }, tone: 'good' }],
      },
      {
        id: 'library',
        label: 'Go to the library instead',
        emoji: '\u{1F4DA}',
        outs: [{ t: 'Quiet Terminal', x: 'You went to the library where the connection was fast, the librarian was kind and nobody was waiting for the phone. You looked up more than you meant to.', fx: { smarts: 3, happiness: 2 } }],
      },
    ],
  },
  {
    id: 'era.1990s.firstEmail',
    emoji: '\u{1F4E7}',
    title: 'You’ve Got a Mailbox',
    minAge: 12,
    maxAge: 65,
    years: [1996, 2004],
    weight: 16,
    once: true,
    when: (g) => adoption(g, 'internet', 0.04),
    text: () => ({
      text: 'You are setting up your very first email address and the form wants a name. Whatever you pick, you will be stuck with it for years. What will you choose?',
    }),
    opts: [
      {
        id: 'silly',
        label: 'Something silly my friends will love',
        emoji: '\u{1F921}',
        outs: [
          { w: 7, t: 'Instant Classic', x: 'Your address was so ridiculous that everyone remembered it. Your friends loved it. For a while.', fx: { happiness: 6, fame: 0 } },
          { w: 3, t: 'Job Application', x: 'Years later you sent a job application from that address and the hiring manager never forgot it. Neither did you.', fx: (g) => ({ happiness: -3, perf: g.character.job ? -2 : 0 }), tone: 'bad' },
        ],
      },
      {
        id: 'name',
        label: 'My own full name, like a grown-up',
        emoji: '\u{1F454}',
        outs: [{ t: 'Professional', x: 'Your name was already taken by three other people, so you added a number. At least no one can say it looks unprofessional.', fx: { smarts: 1, happiness: 1 } }],
      },
      {
        id: 'edgy',
        label: 'Something edgy with lots of x’s',
        emoji: '\u{1F5A4}',
        outs: [{ t: 'Dark and Mysterious', x: 'You picked a name that sounded like a mysterious hacker. The only mail you got was from your mother, who found it hilarious.', fx: { happiness: 3, craziness: 1 } }],
      },
    ],
  },
  {
    id: 'era.1990s.chatRoom',
    emoji: '\u{1F4AC}',
    title: 'Chat Room',
    minAge: 13,
    maxAge: 50,
    years: [1996, 2006],
    weight: 18,
    cooldown: 6,
    when: (g) => adoption(g, 'internet', 0.04),
    text: () => ({
      text: 'A friend shows you a chat room where strangers from all over the world type to each other under made-up names. Somebody called "StarGazer_77" says hello. What will you do?',
    }),
    opts: [
      {
        id: 'chat',
        label: 'Chat with the stranger',
        emoji: '\u{1F44B}',
        outs: [
          { w: 6, t: 'New Pen Pal', x: 'StarGazer_77 turned out to be a decent person who also loved the same band. You typed until midnight and traded real names.', l: 'I made a new friend in an online chat room.', fx: { happiness: 6 }, tone: 'good', after: (g) => applyEffects(g, { newPerson: { relation: 'friend', firstName: strangerName(g).first, age: g.character.age + 1 } }) },
          { w: 3, t: 'Small Talk', x: 'The conversation never got past "a/s/l?" and the weather. You logged off feeling like you had been talking to a very slow parrot.', fx: { happiness: -1 } },
          { w: 2, t: 'Too Many Questions', x: 'The stranger started asking for your address and phone number. You logged off at once, and wrote it down as the day you learned the rules of the internet.', l: 'I learned not to give my details to strangers online.', fx: { smarts: 2, happiness: -2 } },
        ],
      },
      {
        id: 'friends',
        label: 'Use it to talk to my friends from school',
        emoji: '\u{1F465}',
        when: (g) => friends(g).length > 0,
        outs: [{ t: 'Same Friends, New Screen', x: 'You and your friends sat at your own computers and typed to each other instead of talking in person. It made no sense. It was great.', fx: { happiness: 5, rel: 4 }, tone: 'good' }],
      },
      {
        id: 'skip',
        label: 'Close the window',
        emoji: '\u{274C}',
        outs: [{ t: 'Stranger Danger', x: 'You remembered what your parents said about talking to strangers and closed the window. You were not wrong.', fx: { happiness: 0, smarts: 1 } }],
      },
    ],
  },
  {
    id: 'era.1990s.toyCraze',
    emoji: '\u{1F9F8}',
    title: 'The Toy Everyone Wants',
    minAge: 22,
    maxAge: 55,
    years: [1983, 1999],
    weight: 22,
    cooldown: 4,
    when: (g) => consumer(g) && kids(g, 3, 12).length > 0 && toyOfYear(g.year) !== null,
    text: (g) => {
      const kid = anyOf(g, kids(g, 3, 12))
      const toy = toyOfYear(g.year) ?? 'the toy'
      return {
        text: `${kid ? kid.firstName : 'Your child'} has begged for ${toy} since the commercial first aired, and every store in town is sold out. A rumor says a shipment arrives at dawn. What will you do?`,
        person: kid,
        data: { toy, cost: eraPrice(g, 120) },
      }
    },
    opts: [
      {
        id: 'queue',
        label: 'Queue in the dark before the store opens',
        emoji: '\u{1F319}',
        outs: [
          { w: 5, t: 'Got One', x: (_g, x) => `You stood in the cold for three hours with a thermos and a stranger who knew everything about toys. When the doors opened you grabbed ${x.s('toy')}. ${x.p?.firstName ?? 'Your child'} screamed with joy.`, l: 'I queued at dawn to get my child the toy of the year.', fx: { happiness: 8, rel: 10, health: -1 }, tone: 'good' },
          { w: 4, t: 'Sold Out', x: (_g, x) => `You stood in line for three hours, and the box in front of you was the last one. ${x.p?.firstName ?? 'Your child'} took the news bravely. You did not.`, fx: { happiness: -5, rel: 2, health: -1 }, tone: 'bad' },
        ],
      },
      {
        id: 'scalper',
        label: 'Pay a stranger who has a box in his trunk',
        emoji: '\u{1F4B5}',
        when: (g) => g.character.money >= eraPrice(g, 120),
        outs: [{ t: 'Black Market', x: (_g, x) => `A man in a parking lot sold you ${x.s('toy')} for four times the price. ${x.p?.firstName ?? 'Your child'} loved it. Your bank account did not.`, l: 'I overpaid a scalper for the toy of the year.', fx: (_g, x) => ({ money: -x.n('cost'), happiness: 4, rel: 8 }) }],
      },
      {
        id: 'make',
        label: 'Make something similar at home',
        emoji: '\u{1F9F5}',
        outs: [{ t: 'Homemade', x: (_g, x) => `You stitched, glued and painted something that looked a bit like ${x.s('toy')}. ${x.p?.firstName ?? 'Your child'} pretended to love it, and by Thursday actually did.`, fx: { happiness: 3, rel: 5, smarts: 1 } }],
      },
      {
        id: 'no',
        label: 'Say no. Not everything can be bought.',
        emoji: '\u{1F645}',
        outs: [{ t: 'Character Building', x: (_g, x) => `You explained that some things are not worth a three-hour queue. ${x.p?.firstName ?? 'Your child'} sulked until dinner and moved on to a stick.`, fx: { happiness: -1, rel: -3, karma: 1 } }],
      },
    ],
  },
  {
    id: 'era.1980s.homeComputer',
    emoji: '\u{1F4BB}',
    title: 'The Computer in the Den',
    minAge: 8,
    maxAge: 40,
    years: [1981, 1996],
    weight: 22,
    once: true,
    when: (g) => adoption(g, 'homeComputer', 0.03) && consumer(g),
    text: (g) => {
      const model = g.year >= 1995 ? 'a family computer with Windows 95' : inCountry(g, 'gb', 'ie') ? 'a ZX Spectrum' : inCountry(g, 'jp', 'br') && g.year >= 1984 ? 'an MSX' : g.year >= 1982 ? 'a Commodore 64' : 'an Apple II'
      return {
        text: `A big box arrived at your house. Inside is ${model}, and a manual as thick as a phone book. Your family is gathered around the television with cables everywhere. What will you try first?`,
        data: { model },
      }
    },
    opts: [
      {
        id: 'program',
        label: 'Type in a program from a magazine',
        emoji: '\u{2328}\u{FE0F}',
        outs: [
          { w: 6, t: 'It Runs!', x: 'It took three hours, but you typed in every line and the screen printed your name over and over, forever. You felt like a wizard.', l: 'I typed in my first computer program from a magazine.', fx: { smarts: 4, happiness: 6 }, tone: 'good' },
          { w: 4, t: 'One Typo', x: 'After three hours of typing, the screen said "SYNTAX ERROR" in line 140. You never found the typo, but you did learn a lot.', fx: { smarts: 2, happiness: -2 } },
        ],
      },
      {
        id: 'games',
        label: 'Load a game',
        emoji: '\u{1F3AE}',
        outs: [{ t: 'Loading...', x: (g) => (g.year >= 1995 ? 'The game was installed from a disc that took ten minutes, and the sound it made was worth it.' : 'The game took ten minutes to load from tape, with a screech like an angry modem. When it finally started, it was the best ten minutes of your life.'), fx: { happiness: 8, grades: -1 } }],
      },
      {
        id: 'homework',
        label: 'Use it for my school work',
        emoji: '\u{1F4DD}',
        outs: [{ t: 'Very Responsible', x: 'You typed your essay on the computer and printed it, to the delight of your teacher, who had never before seen a paper without a coffee stain.', fx: { grades: 3, smarts: 2 } }],
      },
      {
        id: 'sibling',
        label: 'Let my family play with it first',
        emoji: '\u{1F46A}',
        outs: [{ t: 'Family Night', x: 'The whole family took turns on the new machine, even your grandmother, who typed her name and asked where the paper came out.', fx: { happiness: 5, rel: 4 } }],
      },
    ],
  },
  {
    id: 'era.1990s.lanParty',
    emoji: '\u{1F5A5}\u{FE0F}',
    title: 'LAN Party',
    minAge: 13,
    maxAge: 35,
    years: [1997, 2008],
    weight: 18,
    cooldown: 6,
    when: (g) => adoption(g, 'homeComputer', 0.15) && adoption(g, 'videoGameConsole', 0.15),
    text: (g) => {
      const f = anyOf(g, friends(g))
      return {
        text: `${f ? f.firstName : 'A friend'} is hosting a LAN party in the basement: ten computers, a tangle of cables, a mountain of snacks and a game that lasts until sunrise. You have to carry your own machine. What will you do?`,
        person: f,
      }
    },
    opts: [
      {
        id: 'haul',
        label: 'Haul my whole computer over',
        emoji: '\u{1F4E6}',
        hint: { talent: 'Gaming', of: 0, text: (pct) => `You are a natural: about ${pct}% to end up with the best score.` },
        outs: [
          { w: (g) => (hasTalent(g, 'Gaming') ? 45 : 28), t: 'Last One Standing', x: 'You carried a monitor the size of a small refrigerator up the stairs, and you won the final round at 5 a.m. You will not be able to lift your arms tomorrow.', l: 'I won a LAN party tournament at dawn.', fx: { happiness: 11, health: -2, fame: 1 }, tone: 'good' },
          { w: (g) => (hasTalent(g, 'Gaming') ? 40 : 52), t: 'Great Night', x: 'You didn’t win, but you laughed until dawn, ate your weight in snacks and found out that your friends can be terrifying in a team shooter.', fx: { happiness: 8, rel: 4 } },
          { w: 20, t: 'Blue Screen', x: 'Your computer crashed halfway through the first match and wouldn’t start again. You watched everyone else play and felt like a spectator.', fx: { happiness: -4 }, tone: 'bad' },
        ],
      },
      {
        id: 'borrow',
        label: 'Play on a spare machine',
        emoji: '\u{1F5B1}\u{FE0F}',
        outs: [{ t: 'Guest Seat', x: 'You played on the host’s spare computer with a mouse that had a sticky ball. You lost every round, and had an excellent time.', fx: { happiness: 6, rel: 3 } }],
      },
      {
        id: 'stay',
        label: 'Stay home',
        emoji: '\u{1F3E0}',
        outs: [{ t: 'Next Time', x: 'You stayed home and listened to the stories on Monday. They were better than the party itself, because everyone was fully rested by then.', fx: { happiness: -2 } }],
      },
    ],
  },
  {
    id: 'era.1990s.pokemonCraze',
    emoji: '\u{1F0CF}',
    title: 'Gotta Trade Them All',
    minAge: 6,
    maxAge: 16,
    years: [1996, 2001],
    weight: 22,
    cooldown: 4,
    when: (g) => consumer(g) && (inCountry(g, 'jp') ? g.year >= 1996 : g.year >= 1999) && !!firstParent(g),
    text: (g) => {
      const f = anyOf(g, friends(g))
      return {
        text: `Everyone at school is trading pocket-monster cards, and ${f ? f.firstName : 'a younger kid'} has a shiny one you have wanted for months. A teacher has just banned cards from the playground. What will you do?`,
        person: f,
      }
    },
    opts: [
      {
        id: 'fair',
        label: 'Make a fair trade',
        emoji: '\u{1F91D}',
        outs: [{ t: 'Fair Deal', x: (_g, x) => `You swapped three of your best cards for the shiny one and shook hands with ${x.p?.firstName ?? 'a friend'}. Both of you went home thrilled.`, fx: { happiness: 7, rel: 4 }, tone: 'good' }],
      },
      {
        id: 'cheat',
        label: 'Talk the younger kid into a lopsided trade',
        emoji: '\u{1F608}',
        outs: [
          { w: 6, t: 'Sucker Deal', x: 'You swapped a pile of worthless cards for the shiny one. The kid had no idea what they gave up. You have it. You feel a bit guilty.', l: 'I tricked a younger kid out of a rare card.', fx: { happiness: 4, karma: -6 }, tone: 'bad' },
          { w: 4, t: 'Found Out', x: 'The kid’s older sibling found out and your parents were called. You returned the card and wrote an apology note.', l: 'I got caught cheating a kid at card trading.', fx: (g) => ({ happiness: -6, karma: -3, rels: [{ p: firstParent(g), d: -6 }] }), tone: 'bad' },
        ],
      },
      {
        id: 'smuggle',
        label: 'Sneak the cards into class anyway',
        emoji: '\u{1F92B}',
        outs: [
          { w: 5, t: 'Confiscated', x: 'The teacher caught you holding a card under the desk and put your whole collection in a box in the drawer. You never saw it again.', l: 'My teacher confiscated my trading cards.', fx: { happiness: -7, grades: -1 }, tone: 'bad' },
          { w: 5, t: 'Smooth Operator', x: 'You traded in the toilet stalls and the library like a spy. Nobody was caught, and the shiny card is now yours.', fx: { happiness: 6 } },
        ],
      },
      {
        id: 'out',
        label: 'Stay out of it',
        emoji: '\u{1F6B6}',
        outs: [{ t: 'Above It All', x: 'You decided that cards were a fad and spent the recess reading. In a year you would be asked why you did not buy a few boxes.', fx: { happiness: -1, smarts: 1 } }],
      },
    ],
  },
  {
    id: 'era.1980s.paperRoute',
    emoji: '\u{1F6B2}',
    title: 'The Paper Route',
    minAge: 11,
    maxAge: 16,
    years: [1980, 1999],
    weight: 18,
    once: true,
    when: (g) => anglo(g),
    text: () => ({
      text: 'The local newspaper needs somebody to deliver on the neighborhood route every morning at 5:30. It pays a little, plus tips at Christmas, and there are at least two dogs. What will you do?',
    }),
    opts: [
      {
        id: 'take',
        label: 'Take the route',
        emoji: '\u{1F4F0}',
        outs: [
          { w: 7, t: 'Early Bird', x: 'For a year you pedaled through the dark with a bag of papers. You learned the neighborhood, the weather and which houses had the nicest tips at Christmas.', l: 'I had a morning paper route for a year.', fx: (g) => ({ money: eraPrice(g, 450), health: -1, discipline: 4, happiness: 2 }), tone: 'good' },
          { w: 2, t: 'Dog Days', x: 'A dog on your route chased you every morning until it finally caught you. Your trousers did not survive, but the paper made it to the porch.', fx: (g) => ({ money: eraPrice(g, 300), health: -4, happiness: -2, discipline: 3 }), tone: 'bad' },
        ],
      },
      {
        id: 'pass',
        label: 'Pass. Sleep is important.',
        emoji: '\u{1F634}',
        outs: [{ t: 'Sleeping In', x: 'You turned down the job and slept until eight. Somebody else got the route, and the tips.', fx: { happiness: 3 } }],
      },
    ],
  },
  {
    id: 'era.1980s.latchkey',
    emoji: '\u{1F511}',
    title: 'Latchkey Kid',
    minAge: 7,
    maxAge: 13,
    years: [1980, 1999],
    weight: 16,
    cooldown: 5,
    when: (g) => anglo(g) && !!firstParent(g),
    text: () => ({
      text: 'Both of your parents work, so you let yourself in with a key on a string around your neck. The house is empty until six, the snacks are in the cupboard, and there are very precise rules about the stove. What will you do?',
    }),
    opts: [
      {
        id: 'rules',
        label: 'Follow the rules exactly',
        emoji: '\u{2705}',
        outs: [{ t: 'Responsible', x: 'You did your homework, made a snack from the approved list and called your mother at work. She said you were becoming a grown-up. You weren\'t sure that was a compliment.', fx: { discipline: 3, rel: 2, grades: 1 } }],
      },
      {
        id: 'friends',
        label: 'Invite friends over',
        emoji: '\u{1F389}',
        when: (g) => friends(g).length > 0,
        outs: [
          { w: 6, t: 'Secret Club', x: 'You and your friends watched cartoons and played board games until five-thirty, then cleaned up so well that nobody ever suspected.', fx: { happiness: 7, rel: 4 } },
          { w: 4, t: 'Evidence', x: 'You cleaned up so thoroughly that your mother noticed something was off, and found a juice stain on the ceiling.', fx: (g) => ({ happiness: -3, rels: [{ p: firstParent(g), d: -5 }] }), tone: 'bad' },
        ],
      },
      {
        id: 'explore',
        label: 'Do whatever I want',
        emoji: '\u{1F9E8}',
        outs: [
          { w: 5, t: 'Free Range', x: 'You built a fort, read three comic books and invented a new sandwich. It was glorious until the front door opened.', fx: { happiness: 6 } },
          { w: 5, t: 'Kitchen Experiment', x: 'You decided to cook something grown-up and set off the smoke alarm. The neighbors came running, and so did your mother.', l: 'I set off the smoke alarm when I was home alone.', fx: (g) => ({ happiness: -4, rels: [{ p: firstParent(g), d: -8 }] }), tone: 'bad' },
        ],
      },
    ],
  },
]

export const EVENTS_1980_YOUTH: EventDef[] = eraEvents(SPECS)
