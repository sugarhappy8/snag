// Era pack 2000-2026: popup events about growing up in the age of file sharing, instant
// messengers, social networks, smartphones and short video. Each only makes sense in its years
// and places (the social site is the one the player's country really used); outcomes are honest
// weighted rolls. Real brands and titles are touchstones; no real people are named.
import { parents } from '../core'
import { hasTalent } from '../talents'
import type { EventDef } from './helpers'
import { anyOf, friends, kids, money } from './helpers'
import { adoption, eraEvents, eraPrice, inCountry, regionIs, richCountry, wealthOf, type EraEventSpec } from './era-late-kit'

const consumer = (g: Parameters<typeof wealthOf>[0]): boolean => wealthOf(g) >= 0.3
const firstParent = (g: Parameters<typeof parents>[0]) => parents(g).find((p) => p.alive)

/** The social site most people used where the player lives (a real one, for the years it really ruled). */
export function socialSite(g: Parameters<typeof wealthOf>[0]): string {
  const y = g.year
  if (inCountry(g, 'jp')) return y < 2004 ? 'a homepage site' : y < 2012 ? 'Mixi' : 'LINE'
  if (inCountry(g, 'kr')) return y < 2013 ? 'Cyworld' : 'KakaoTalk'
  if (inCountry(g, 'cn', 'hk', 'tw') && !inCountry(g, 'hk', 'tw')) return y < 2012 ? 'QQ' : 'WeChat'
  if (inCountry(g, 'ru', 'ua', 'kz', 'ge')) return y < 2008 ? 'LiveJournal' : 'VKontakte'
  if (inCountry(g, 'br', 'in')) return y < 2004 ? 'a homepage site' : y <= 2013 ? 'Orkut' : y <= 2015 ? 'Facebook' : 'WhatsApp'
  if (regionIs(g, 'seasia') && y <= 2008) return y < 2003 ? 'a homepage site' : 'Friendster'
  if (y <= 2008) return y < 2003 ? 'a homepage site' : 'MySpace'
  return 'Facebook'
}

/** The messaging app most families used in the player's country (null: plain text messages). */
export function chatApp(g: Parameters<typeof wealthOf>[0]): string | null {
  if (inCountry(g, 'jp') && g.year >= 2011) return 'LINE'
  if (inCountry(g, 'kr') && g.year >= 2010) return 'KakaoTalk'
  if (inCountry(g, 'cn') && g.year >= 2011) return 'WeChat'
  if (inCountry(g, 'us', 'ca')) return null
  return g.year >= 2013 ? 'WhatsApp' : null
}

/** The short-video app of the year ("Douyin" in mainland China). */
export function shortVideoApp(g: Parameters<typeof wealthOf>[0]): string {
  if (inCountry(g, 'cn')) return 'Douyin'
  return g.year >= 2018 ? 'TikTok' : 'Musical.ly'
}

/** What the first white music player cost in nominal US dollars (about; it fell as the line grew). */
function podPrice(year: number): number {
  return year <= 2003 ? 300 : 200
}

const SPECS: EraEventSpec[] = [
  {
    id: 'era.2000s.fileSharing',
    emoji: '\u{1F3B5}',
    title: 'Every Song Ever',
    minAge: 12,
    maxAge: 45,
    years: [2000, 2004],
    weight: 22,
    cooldown: 6,
    when: (g) => adoption(g, 'internet', 0.05) && adoption(g, 'homeComputer', 0.08) && consumer(g),
    text: (g) => {
      const f = anyOf(g, friends(g))
      return {
        text: `${f ? f.firstName : 'A friend'} shows you a program${g.year <= 2001 ? ' called Napster' : ''} that lets strangers swap songs straight from each other’s hard drives. In an hour you could own every album you have ever wanted, free. A CD costs ${money(eraPrice(g, 17))}. What will you do?`,
        person: f,
        data: { cd: eraPrice(g, 17), fix: eraPrice(g, 60) },
      }
    },
    opts: [
      {
        id: 'swap',
        label: 'Download everything I want',
        emoji: '\u{1F4E5}',
        outs: [
          { w: 6, t: 'Hard Drive Heaven', x: 'You downloaded four hundred songs overnight. Half were mislabeled, one was twelve minutes of a stranger’s laugh, and the rest were glorious.', l: 'I filled my hard drive with free music downloaded overnight.', fx: { happiness: 8, karma: -2 } },
          { w: 2, t: 'Virus', x: 'One file from a stranger was not what its name said, and it carried a virus. Your computer slowed to a crawl and you had to pay a repair shop to clean it.', l: 'I got a computer virus from a free song.', fx: (_g, x) => ({ happiness: -5, money: -x.n('fix') }), tone: 'bad' },
        ],
      },
      {
        id: 'buy',
        label: 'Buy the CD like always',
        emoji: '\u{1F4BF}',
        when: (g) => g.character.money >= eraPrice(g, 17),
        outs: [{ t: 'Pay the Band', x: 'You bought the album and read the liner notes on the bus. It was the only CD you owned that nobody asked to borrow.', fx: (_g, x) => ({ money: -x.n('cd'), happiness: 3, karma: 2 }) }],
      },
      {
        id: 'borrow',
        label: 'Borrow friends’ CDs and copy them',
        emoji: '\u{1F91D}',
        when: (g) => friends(g).length > 0,
        outs: [{ t: 'Library Card', x: (_g, x) => `${x.p?.firstName ?? 'Your friend'} lent you a stack of discs and you passed some of yours around. A whole circle of friends ended up with the same ninety albums.`, fx: { happiness: 5, rel: 3 } }],
      },
      {
        id: 'radio',
        label: 'Wait for it to come on the radio',
        emoji: '\u{1F4FB}',
        outs: [{ t: 'Request Line', x: 'You waited three weeks for the song and then it came on while you were brushing your teeth. You did not make it to the end.', fx: { happiness: 1, discipline: 1 } }],
      },
    ],
  },
  {
    id: 'era.2000s.mp3Player',
    emoji: '\u{1F3A7}',
    title: 'A Thousand Songs in Your Pocket',
    minAge: 11,
    maxAge: 45,
    years: [2001, 2012],
    weight: 18,
    once: true,
    when: (g) => consumer(g) && adoption(g, 'homeComputer', 0.1),
    text: (g) => ({
      text: `${g.year >= 2002 ? 'The iPod, a' : 'A'} small white music player that holds a thousand songs, costs ${money(eraPrice(g, podPrice(g.year)))}. A no-name player costs ${money(eraPrice(g, 50))} and holds a hundred. A disc player is free: you already own it. Everyone you know is saving up. What will you do?`,
      data: { top: eraPrice(g, podPrice(g.year)), cheap: eraPrice(g, 50) },
    }),
    opts: [
      {
        id: 'top',
        label: 'Buy the white one with the clickwheel',
        emoji: '\u{1F4B8}',
        when: (g) => g.character.money >= eraPrice(g, podPrice(g.year)),
        outs: [{ t: 'Everything, Everywhere', x: 'You ripped your whole CD collection onto it over a weekend. For the first time, you could take your music anywhere, in order, on shuffle.', l: 'I bought my first digital music player.', fx: (_g, x) => ({ money: -x.n('top'), happiness: 11 }), tone: 'good' }],
      },
      {
        id: 'cheap',
        label: 'Get the cheap one',
        emoji: '\u{1F4B5}',
        when: (g) => g.character.money >= eraPrice(g, 50),
        outs: [
          { w: 6, t: 'Good Enough', x: 'It held a hundred songs, and had a screen the size of a postage stamp. You learned to love the skip button.', fx: (_g, x) => ({ money: -x.n('cheap'), happiness: 5 }) },
          { w: 4, t: 'Wrong Format', x: 'The cheap player only understood a file format that none of your songs were in. It lived in a drawer after the first week.', fx: (_g, x) => ({ money: -x.n('cheap'), happiness: -3 }), tone: 'bad' },
        ],
      },
      {
        id: 'ask',
        label: 'Put it on my birthday list',
        emoji: '\u{1F381}',
        when: (g) => g.character.age < 22 && !!firstParent(g),
        outs: [
          { w: (g) => ((firstParent(g)?.relationship ?? 0) >= 60 ? 60 : 35), t: 'Birthday Present', x: 'It arrived in a small white box with your name on the back. You wore the earphones all through the party, and no one minded.', l: 'I got a digital music player for my birthday.', fx: { happiness: 12, rel: 3 }, tone: 'good' },
          { w: (g) => ((firstParent(g)?.relationship ?? 0) >= 60 ? 40 : 65), t: 'Socks', x: 'You got socks. The player is still on the list.', fx: { happiness: -2 } },
        ],
      },
      {
        id: 'disc',
        label: 'Keep my disc player',
        emoji: '\u{1F4BF}',
        outs: [{ t: 'Skipping Along', x: 'You kept carrying your disc player in a backpack, jogging gently so that the music wouldn’t skip. It skipped.', fx: { happiness: 0 } }],
      },
    ],
  },
  {
    id: 'era.2000s.topFriends',
    emoji: '\u{1F465}',
    title: 'The Friends List',
    minAge: 12,
    maxAge: 30,
    years: [2003, 2010],
    weight: 22,
    cooldown: 5,
    when: (g) => adoption(g, 'socialMedia', 0.03) || (adoption(g, 'internet', 0.15) && g.year >= 2004),
    text: (g) => {
      const site = socialSite(g)
      const f = anyOf(g, friends(g))
      const top = site === 'MySpace' ? ' to arrange your "Top 8," the eight friends who appear on your page for the whole world to see' : ' to decide which friends will appear first on your page'
      return {
        text: `It is Sunday night and you have spent an hour on ${site}${top}. ${f ? f.firstName : 'Your best friend'} has been your closest friend for years, but a popular classmate just asked to be your friend. What will you do?`,
        person: f,
        data: { site },
      }
    },
    opts: [
      {
        id: 'honest',
        label: 'Put my real closest friends first',
        emoji: '\u{1F495}',
        outs: [
          { w: 7, t: 'Loyalty', x: (_g, x) => `You put the people who actually had your back first. ${x.p?.firstName ?? 'Your best friend'} saw it, said nothing and bought you a milkshake the next day.`, fx: { happiness: 4, rel: 6, karma: 1 }, tone: 'good' },
          { w: 3, t: 'Drama', x: (_g, x) => `Somebody who was not on the list noticed, and the next day half the school knew that ${x.p?.firstName ?? 'a friend'} had been moved down. The whole thing took a week to blow over.`, fx: { happiness: -3, rel: -3 }, tone: 'bad' },
        ],
      },
      {
        id: 'popular',
        label: 'Put the popular kid first',
        emoji: '\u{1F451}',
        outs: [
          { w: 5, t: 'Climbing', x: 'The popular classmate noticed and sent you a message with three exclamation marks. You were invited to a party. It was fine, not great.', fx: { happiness: 3, karma: -2 } },
          { w: 5, t: 'Found Out', x: (_g, x) => `${x.p?.firstName ?? 'Your best friend'} saw where they were on your page and went very quiet. It took an apology and a long walk to fix.`, l: 'I dropped my best friend down my friends list to impress a popular kid.', fx: { happiness: -5, rel: -10, karma: -2 }, tone: 'bad' },
        ],
      },
      {
        id: 'hide',
        label: 'Hide the list. Nobody needs to see it.',
        emoji: '\u{1F648}',
        outs: [{ t: 'Private Page', x: 'You hid the list from everybody and felt like a spy. Somebody joked that you had something to hide. You did not, and that was the point.', fx: { happiness: 1, smarts: 1 } }],
      },
    ],
  },
  {
    id: 'era.2000s.messenger',
    emoji: '\u{1F4AC}',
    title: 'Away Message',
    minAge: 12,
    maxAge: 35,
    years: [2000, 2010],
    weight: 20,
    cooldown: 5,
    when: (g) => adoption(g, 'internet', 0.06) && adoption(g, 'homeComputer', 0.08) && consumer(g),
    text: (g) => ({
      text: `It is 11 p.m., the family computer is humming in the corner and ${g.year >= 2005 ? 'half your class is' : 'your friends are'} on ${inCountry(g, 'cn') ? 'QQ' : inCountry(g, 'jp', 'kr') ? 'instant messenger' : 'MSN Messenger'}, typing in lowercase with a dozen windows open. Your parents think you are doing your homework. What will you do?`,
    }),
    opts: [
      {
        id: 'stay',
        label: 'Stay on until your eyes close',
        emoji: '\u{1F319}',
        outs: [
          { w: 6, t: 'Midnight Confessions', x: 'You talked about everything and nothing until 1:30 a.m. Your friendships have never been closer, and you cannot keep your eyes open in third period.', fx: { happiness: 7, rel: 4, health: -1, grades: -1 } },
          { w: 4, t: 'Caught', x: 'A glowing screen under the door gave you away. Your parent took the computer’s keyboard and the next day you used a library card.', l: 'My parents caught me chatting online past midnight.', fx: (g) => ({ happiness: -4, rels: [{ p: firstParent(g), d: -6 }], grades: -1 }), tone: 'bad' },
        ],
      },
      {
        id: 'away',
        label: 'Set a song lyric as my away message',
        emoji: '\u{1F3B6}',
        when: (g) => g.character.age >= 13,
        outs: [
          { w: 3, t: 'Subtle Hint', x: 'Your crush read the lyric, understood exactly who it was for and answered with a lyric of their own. It was the most romantic conversation of your life, and nobody said a word.', fx: { happiness: 8 }, tone: 'good' },
          { w: 7, t: 'Wrong Reader', x: 'Nobody got the message, except a cousin who commented on it at the family dinner.', fx: { happiness: -2 } },
        ],
      },
      {
        id: 'log',
        label: 'Sign off at ten, as agreed',
        emoji: '\u{1F4F4}',
        outs: [{ t: 'Early to Bed', x: 'You signed off, finished your homework and got a full night’s sleep. You missed the conversation of the year. Probably.', fx: { grades: 2, health: 2, happiness: -1, discipline: 2 } }],
      },
    ],
  },
  {
    id: 'era.2000s.textBill',
    emoji: '\u{1F4F1}',
    title: 'The Phone Bill',
    minAge: 12,
    maxAge: 19,
    years: [2001, 2012],
    weight: 20,
    cooldown: 4,
    when: (g) => adoption(g, 'mobilePhone', 0.15) && consumer(g) && !!firstParent(g) && g.character.residence.status === 'parents',
    text: (g) => ({
      text: `Your parents are holding the phone bill. You sent 1,400 text messages at ${money(eraPrice(g, 0.1))} each, and called a number you shouldn’t have. The total comes to ${money(eraPrice(g, 140))}. It is dinnertime. What will you do?`,
      data: { bill: eraPrice(g, 140) },
    }),
    opts: [
      {
        id: 'pay',
        label: 'Pay half of it from my own money',
        emoji: '\u{1F4B5}',
        when: (g) => g.character.money >= eraPrice(g, 70),
        outs: [{ t: 'Taking Responsibility', x: 'You handed over half of the bill from your savings and apologized. Your parents were impressed enough to switch you to a cheaper plan.', fx: (g) => ({ money: -eraPrice(g, 70), happiness: -2, karma: 2, rels: [{ p: firstParent(g), d: 5 }] }), tone: 'good' }],
      },
      {
        id: 'chores',
        label: 'Offer to do chores for a month',
        emoji: '\u{1F9F9}',
        outs: [{ t: 'Work Off the Debt', x: 'You washed the car, cleaned the garage and learned how many chores there are in a house. By the end of the month you could do them in your sleep.', fx: { happiness: -3, discipline: 3, rel: 3 } }],
      },
      {
        id: 'plan',
        label: 'Argue that the plan is the problem',
        emoji: '\u{1F4D1}',
        outs: [
          { w: 4, t: 'Unlimited Argument', x: 'You presented a table showing that an unlimited plan would have been cheaper. Your parent studied it, found it was right and switched plans, grumbling the whole way.', fx: { happiness: 4, smarts: 2, rel: 2 }, tone: 'good' },
          { w: 6, t: 'Grounded', x: 'You presented a table showing that an unlimited plan would have been cheaper. Your parent studied it and said "Grounded for a week."', fx: (g) => ({ happiness: -4, rels: [{ p: firstParent(g), d: -3 }] }), tone: 'bad' },
        ],
      },
      {
        id: 'blame',
        label: 'Blame a sibling or a glitch',
        emoji: '\u{1F937}',
        outs: [{ t: 'Not Convincing', x: 'You blamed the phone company. Your parent called the phone company, and the phone company produced the numbers and the times. The dinner got cold.', fx: (g) => ({ happiness: -5, karma: -3, rels: [{ p: firstParent(g), d: -8 }] }), tone: 'bad' }],
      },
    ],
  },
  {
    id: 'era.2000s.firstSmartphone',
    emoji: '\u{1F4F1}',
    title: 'The Phone Everyone Wants',
    minAge: 12,
    maxAge: 60,
    years: [2008, 2016],
    weight: 22,
    once: true,
    when: (g) => adoption(g, 'smartphone', 0.05) && !adoption(g, 'smartphone', 0.7) && consumer(g),
    text: (g) => ({
      text: `Everyone has one: a phone with no buttons, a screen that responds to your fingers and thousands of little programs to download. The top model${richCountry(g) && g.year >= 2008 ? ', the iPhone,' : ''} costs ${money(eraPrice(g, 650))}. A decent one with a lesser camera costs ${money(eraPrice(g, 250))}. Your old phone still works, mostly. What will you do?`,
      data: { top: eraPrice(g, 650), mid: eraPrice(g, 250), crack: eraPrice(g, 120) },
    }),
    opts: [
      {
        id: 'top',
        label: 'Buy the top model',
        emoji: '\u{1F4B8}',
        when: (g) => g.character.money >= eraPrice(g, 650),
        outs: [
          { w: 7, t: 'Fingertip Future', x: 'The photographs were sharp, the maps knew where you were, and you spent the whole first weekend downloading games.', l: 'I bought my first smartphone.', fx: (_g, x) => ({ money: -x.n('top'), happiness: 11 }), tone: 'good' },
          { w: 3, t: 'Drop Zone', x: 'You dropped it on the pavement on the third day. The screen now looks like a spider’s web, and the repair costs a fortune.', l: 'I cracked the screen of my brand-new smartphone.', fx: (_g, x) => ({ money: -x.n('top') - x.n('crack'), happiness: 3 }), tone: 'bad' },
        ],
      },
      {
        id: 'mid',
        label: 'Buy the cheaper one',
        emoji: '\u{1F4B5}',
        when: (g) => g.character.money >= eraPrice(g, 250),
        outs: [{ t: 'Sensible Choice', x: 'It did everything that mattered, never stopped you from sending messages and cost far less. The camera made everyone look as if they were standing in fog.', fx: (_g, x) => ({ money: -x.n('mid'), happiness: 7 }) }],
      },
      {
        id: 'ask',
        label: 'Ask my parents',
        emoji: '\u{1F64F}',
        when: (g) => g.character.age < 20 && !!firstParent(g),
        outs: [
          { w: (g) => ((firstParent(g)?.relationship ?? 0) >= 60 ? 55 : 30), t: 'Early Present', x: 'Your parents turned the box over in their hands and said "Don\'t lose it." You promised, and lost it twice that year.', l: 'My parents bought me a smartphone.', fx: { happiness: 11, rel: 3 }, tone: 'good' },
          { w: (g) => ((firstParent(g)?.relationship ?? 0) >= 60 ? 45 : 70), t: 'When You Are Older', x: 'Your parents said you could have a smartphone when you could pay for the plan. They did not mention how.', fx: { happiness: -4 } },
        ],
      },
      {
        id: 'keep',
        label: 'Keep my old phone',
        emoji: '\u{1F4DF}',
        outs: [{ t: 'Museum Piece', x: 'You kept your old phone and your friends called it "vintage." It survived another two winters and made you very hard to track.', fx: { happiness: -1, smarts: 0 } }],
      },
    ],
  },
  {
    id: 'era.2010s.streamingBinge',
    emoji: '\u{1F4FA}',
    title: 'One More Episode',
    minAge: 14,
    maxAge: 65,
    years: [2013, 2026],
    weight: 20,
    cooldown: 4,
    when: (g) => adoption(g, 'streaming', 0.12),
    text: () => ({
      text: 'A new series has just dropped on a streaming service and all ten episodes are ready. The cliffhanger at the end of each one counts down to the next episode in five seconds. It is Friday evening. What will you do?',
    }),
    opts: [
      {
        id: 'binge',
        label: 'Watch the whole season this weekend',
        emoji: '\u{1F37F}',
        outs: [
          { w: 7, t: 'Season Finale', x: 'You finished the season at 4 a.m. on Sunday, with a bowl of crumbs on your chest and a story you need to tell everybody. You loved every minute.', l: 'I binged an entire series in one weekend.', fx: { happiness: 8, health: -2 } },
          { w: 3, t: 'Sunday Slump', x: 'You finished the season at 4 a.m. on Sunday. By Monday you had red eyes, a dull headache and no memory of the first three episodes.', fx: (g) => ({ happiness: 1, health: -3, grades: g.character.education.current ? -2 : 0, perf: g.character.job ? -3 : 0 }), tone: 'bad' },
        ],
      },
      {
        id: 'pace',
        label: 'Watch one episode a night',
        emoji: '\u{23F3}',
        outs: [{ t: 'Savoring It', x: 'You treated yourself to one episode every evening and spent the rest of the day wondering what would happen. It stretched the joy out for ten days.', fx: { happiness: 5, discipline: 2 } }],
      },
      {
        id: 'together',
        label: 'Watch it with someone else',
        emoji: '\u{1F46B}',
        when: (g) => friends(g).length > 0 || !!firstParent(g),
        outs: [{ t: 'Couch Club', x: 'You invited someone over, shared a bowl of snacks and argued about the plot after each episode. Good company made a good show better.', fx: { happiness: 7, rel: 5 }, tone: 'good' }],
      },
      {
        id: 'skip',
        label: 'Skip it and go outside',
        emoji: '\u{1F333}',
        outs: [{ t: 'Real Life', x: 'You left the series for later and went for a long walk. Friends spoiled the ending by Wednesday.', fx: { health: 2, happiness: 1 } }],
      },
    ],
  },
  {
    id: 'era.2010s.familyChat',
    emoji: '\u{1F46A}',
    title: 'The Family Group Chat',
    minAge: 16,
    maxAge: 70,
    years: [2013, 2026],
    weight: 20,
    cooldown: 5,
    when: (g) => adoption(g, 'smartphone', 0.25) && !!firstParent(g),
    text: (g) => {
      const p = firstParent(g)
      return {
        text: `You were added to the family group chat${chatApp(g) ? ` on ${chatApp(g)}` : ''}: sixty-one members, of whom the most active is ${p ? p.firstName : 'a parent'} and a great-aunt who sends a good-morning picture every day at 5:12 a.m. Your phone buzzes once a minute. What will you do?`,
        person: p,
      }
    },
    opts: [
      {
        id: 'mute',
        label: 'Mute the chat',
        emoji: '\u{1F515}',
        outs: [
          { w: 6, t: 'Peace and Quiet', x: 'You muted the chat and the world got quieter. You check it once a day, like a newspaper.', fx: { happiness: 3 } },
          { w: 4, t: 'You Missed It', x: 'You muted the chat and missed the announcement of a family dinner. You were the only one who did not know.', fx: (g) => ({ happiness: -3, rels: [{ p: firstParent(g), d: -4 }] }), tone: 'bad' },
        ],
      },
      {
        id: 'engage',
        label: 'Reply to every message',
        emoji: '\u{1F4AC}',
        outs: [{ t: 'Family Correspondent', x: 'You replied to every photograph, every recipe and every blessing. Your grandmother said you were the nicest grandchild, and you are not entirely sure that was a compliment.', fx: (g) => ({ happiness: 2, rels: [{ p: firstParent(g), d: 6 }], karma: 1 }) }],
      },
      {
        id: 'memes',
        label: 'Start posting jokes and pictures of the dog',
        emoji: '\u{1F602}',
        outs: [
          { w: 7, t: 'Family Comedian', x: 'A joke about your uncle’s driving got forty-one thumbs-up, and the uncle replied with a thumbs-up of his own. You are now the group’s unofficial entertainer.', fx: { happiness: 6, rel: 4 }, tone: 'good' },
          { w: 3, t: 'Wrong Joke', x: 'A joke you sent landed on the wrong side of the family and was met with a very long silence, followed by sixty-one angry paragraphs.', fx: (g) => ({ happiness: -4, rels: [{ p: firstParent(g), d: -6 }] }), tone: 'bad' },
        ],
      },
      {
        id: 'leave',
        label: 'Leave the group',
        emoji: '\u{1F6AA}',
        outs: [{ t: 'Left the Group', x: 'You left the chat and, within a minute, a phone call arrived from three different relatives. You were added back before dinner with an apology you did not need to give.', fx: (g) => ({ happiness: -2, rels: [{ p: firstParent(g), d: -6 }] }), tone: 'bad' }],
      },
    ],
  },
  {
    id: 'era.2010s.parentRequest',
    emoji: '\u{1F46D}',
    title: 'Friend Request from Mom',
    minAge: 13,
    maxAge: 28,
    years: [2008, 2018],
    weight: 20,
    once: true,
    when: (g) => adoption(g, 'socialMedia', 0.12) && !!firstParent(g),
    text: (g) => {
      const p = firstParent(g)
      return {
        text: `${p ? p.firstName : 'Your parent'} has just joined ${socialSite(g)} and sent you a friend request, with a message that says "Hello dear, how do I find the camera?" Your page has photographs your parent should not see. What will you do?`,
        person: p,
      }
    },
    opts: [
      {
        id: 'accept',
        label: 'Accept. Clean up the page first.',
        emoji: '\u{2705}',
        outs: [{ t: 'Friends with Mom', x: 'You accepted, spent an hour deleting evidence and learned that your parent comments on everything, including photos of your lunch. The relationship improved. The page did not.', fx: { happiness: -2, rel: 5 } }],
      },
      {
        id: 'limited',
        label: 'Accept, but put them on the limited list',
        emoji: '\u{1F512}',
        outs: [
          { w: 7, t: 'Smart Settings', x: 'You set it so that your parent only saw the photographs of your dog. Your parent has never been prouder of you.', fx: { happiness: 2, rel: 3, smarts: 1 } },
          { w: 3, t: 'Settings Slip', x: 'You got a setting wrong, and for exactly one night your parent saw everything. The next day began with a very long conversation.', fx: (g) => ({ happiness: -5, rels: [{ p: firstParent(g), d: -5 }] }), tone: 'bad' },
        ],
      },
      {
        id: 'ignore',
        label: 'Leave it pending forever',
        emoji: '\u{1F648}',
        outs: [{ t: 'Pending', x: 'The request sat there for weeks. Your parent asked about it at dinner, and when you said "I never check that," neither of you believed it.', fx: (g) => ({ happiness: 0, rels: [{ p: firstParent(g), d: -5 }] }) }],
      },
      {
        id: 'second',
        label: 'Make a second account for my real life',
        emoji: '\u{1F575}\u{FE0F}',
        outs: [
          { w: 7, t: 'Double Life', x: 'You made a secret account under a nickname and kept your real page tidy for the family. It worked beautifully for a year.', fx: { smarts: 1, happiness: 3 } },
          { w: 3, t: 'Discovered', x: 'Your aunt found your secret account within a week and showed it to everybody at the family lunch.', l: 'My family found my secret social account.', fx: (g) => ({ happiness: -6, rels: [{ p: firstParent(g), d: -8 }] }), tone: 'bad' },
        ],
      },
    ],
  },
  {
    id: 'era.2010s.oldPost',
    emoji: '\u{1F4F8}',
    title: 'Something From the Past Resurfaces',
    minAge: 16,
    maxAge: 60,
    years: [2010, 2026],
    weight: 18,
    cooldown: 8,
    when: (g) => adoption(g, 'socialMedia', 0.12),
    text: (g) => ({
      text: `A friend sends you a screenshot: something you posted ${g.year - 2010 >= 8 ? 'eight' : 'five'} years ago, when you were younger and sillier, is going around again. It is not harmful, but it is deeply embarrassing, and people are leaving comments. What will you do?`,
    }),
    opts: [
      {
        id: 'delete',
        label: 'Delete it and say nothing',
        emoji: '\u{1F5D1}\u{FE0F}',
        outs: [
          { w: 6, t: 'Cleared', x: 'You deleted the post, and by the weekend the internet had moved on to a goat that sings. Whew.', fx: { happiness: 1 } },
          { w: 4, t: 'Screenshots Are Forever', x: 'You deleted the post, but a stranger had already saved it. The image kept circulating, now with a caption.', fx: (g) => ({ happiness: -5, perf: g.character.job ? -2 : 0 }), tone: 'bad' },
        ],
      },
      {
        id: 'own',
        label: 'Laugh about it publicly',
        emoji: '\u{1F604}',
        hint: { talent: 'Comedy', of: 0, text: (pct) => `With your sense of humor, about ${pct}% of people laugh with you.` },
        outs: [
          { w: (g) => (hasTalent(g, 'Comedy') ? 70 : 45), t: 'Good Sport', x: 'You posted "Yes, that was me, and yes, the haircut was a mistake." People loved it. A few strangers even asked for the haircut again.', l: 'I laughed about an old embarrassing post, and it went well.', fx: { happiness: 6, fame: 1 }, tone: 'good' },
          { w: (g) => (hasTalent(g, 'Comedy') ? 30 : 55), t: 'Making It Worse', x: 'You tried to joke about it and the joke fell flat. The comment section found a second, more painful thing to quote.', fx: (g) => ({ happiness: -5, perf: g.character.job ? -2 : 0 }), tone: 'bad' },
        ],
      },
      {
        id: 'apologize',
        label: 'Say sorry for what is worth apologizing for',
        emoji: '\u{1F64F}',
        outs: [{ t: 'Honest Answer', x: 'You wrote a short and sincere reply. It got far fewer reactions than the original post, and you felt a lot better.', fx: { karma: 3, happiness: 2 } }],
      },
      {
        id: 'ignore',
        label: 'Ignore it completely',
        emoji: '\u{1F910}',
        outs: [{ t: 'Fifteen Minutes', x: 'You put the phone in a drawer and went to the park. By the time you returned, the story had been replaced by a cat in a spacesuit.', fx: { happiness: 2, health: 1 } }],
      },
    ],
  },
  {
    id: 'era.2010s.ghosted',
    emoji: '\u{1F47B}',
    title: 'Left on Read',
    minAge: 15,
    maxAge: 40,
    years: [2012, 2026],
    weight: 20,
    cooldown: 5,
    when: (g) => adoption(g, 'smartphone', 0.25),
    text: () => ({
      text: 'You and someone you really liked had been messaging every day for three weeks. Then, nothing. Your last message shows "seen" and has not been answered for nine days. What will you do?',
    }),
    opts: [
      {
        id: 'once',
        label: 'Send one last, friendly message',
        emoji: '\u{1F4E8}',
        outs: [
          { w: 3, t: 'Plot Twist', x: 'They answered within the hour: they had lost their phone in a lake. You both laughed. It turned into a real date.', fx: { happiness: 9 }, tone: 'good' },
          { w: 7, t: 'Still Seen', x: 'The message was seen and not answered. At least you did not have to wonder anymore.', fx: { happiness: -4, karma: 1 } },
        ],
      },
      {
        id: 'move',
        label: 'Let it go and talk to a friend',
        emoji: '\u{1F91D}',
        outs: [{ t: 'Better Than Closure', x: 'You called your best friend and ate pasta from the pot. By midnight you were laughing about it. The person who ghosted you never found out how well you did.', fx: { happiness: 3, rel: 3 } }],
      },
      {
        id: 'post',
        label: 'Post something vague and pointed',
        emoji: '\u{1F4DD}',
        outs: [
          { w: 5, t: 'Subtweet', x: 'You posted a quote about "people who disappear." Forty people liked it, none of them the right one. Your cousin asked if you were okay.', fx: { happiness: -2 } },
          { w: 5, t: 'Backfire', x: 'Your post was spotted by their friends, who screenshotted it. You looked bitter, and you were.', fx: { happiness: -6, karma: -1 }, tone: 'bad' },
        ],
      },
      {
        id: 'block',
        label: 'Block and delete',
        emoji: '\u{1F6AB}',
        outs: [{ t: 'Clean Break', x: 'You deleted the chat, the photos and the little notification sound you had picked for them. It felt cold and clean.', fx: { happiness: 1, willpower: 2 } }],
      },
    ],
  },
  {
    id: 'era.2010s.shortVideo',
    emoji: '\u{1F483}',
    title: 'The Challenge',
    minAge: 12,
    maxAge: 35,
    years: [2016, 2026],
    weight: 22,
    cooldown: 4,
    when: (g) => adoption(g, 'smartphone', 0.25) && adoption(g, 'videoSharing', 0.2),
    text: (g) => {
      const f = anyOf(g, friends(g))
      return {
        text: `Everyone is learning the same thirty-second dance for a short-video app (${shortVideoApp(g)}), and ${f ? f.firstName : 'your friend'} has asked if you would film it with them on the roof. You have been practicing in the bathroom. What will you do?`,
        person: f,
      }
    },
    opts: [
      {
        id: 'post',
        label: 'Film it and post it',
        emoji: '\u{1F3AC}',
        hint: { talent: 'Acting', of: 0, text: (pct) => `Your presence on camera gives a ${pct}% chance it takes off.` },
        outs: [
          { w: (g) => (hasTalent(g, 'Acting') ? 14 : 6), t: 'It Took Off', x: 'The video got a few thousand views before lunch and a hundred thousand by the weekend. Strangers know the dance because of you.', l: 'A dance video I posted went viral.', fx: { happiness: 10, fame: 3 }, tone: 'good' },
          { w: 54, t: 'Forty Views', x: 'The video got forty views, thirty of which were your family. It was still fun to make.', fx: { happiness: 4 } },
          { w: (g) => (hasTalent(g, 'Acting') ? 6 : 12), t: 'Oops', x: 'Someone in the video background looked horrified. The comments noticed, and quoted it.', fx: { happiness: -5 }, tone: 'bad' },
        ],
      },
      {
        id: 'friends',
        label: 'Film it for ourselves, not for posting',
        emoji: '\u{1F46F}',
        when: (g) => friends(g).length > 0,
        outs: [{ t: 'Private Show', x: (_g, x) => `You and ${x.p?.firstName ?? 'your friend'} filmed it fourteen times and laughed more at the outtakes than at the take. The video lives on two phones, and that is enough.`, fx: { happiness: 7, rel: 5 }, tone: 'good' }],
      },
      {
        id: 'watch',
        label: 'Just watch the others do it',
        emoji: '\u{1F440}',
        outs: [{ t: 'Spectator', x: 'You watched the dance fifty times, and learned it by accident. You will never perform it, but you will never forget it.', fx: { happiness: 2 } }],
      },
    ],
  },
  {
    id: 'era.2000s.allNighter',
    emoji: '\u{1F3AE}',
    title: 'One More Match',
    minAge: 13,
    maxAge: 40,
    years: [2004, 2026],
    weight: 18,
    cooldown: 5,
    when: (g) => adoption(g, 'videoGameConsole', 0.2) && consumer(g),
    text: (g) => ({
      text: `It is ${g.character.age < 20 ? '1 a.m. on a school night' : 'past midnight on a work night'}. You are on a winning streak in an online game, and your team is begging you to stay for "just one more match." Your alarm is in five hours. What will you do?`,
    }),
    opts: [
      {
        id: 'more',
        label: 'Play on until the sun comes up',
        emoji: '\u{1F31E}',
        hint: { talent: 'Gaming', of: 0, text: (pct) => `Your skills are sharp: about ${pct}% that the streak holds.` },
        outs: [
          { w: (g) => (hasTalent(g, 'Gaming') ? 55 : 35), t: 'Winning Streak', x: 'You won eleven matches in a row, climbed the rankings and watched the sun rise through a gap in the curtains. You feel like a champion and look like a ghost.', l: 'I stayed up all night on a winning streak in an online game.', fx: (g) => ({ happiness: 9, health: -3, grades: g.character.education.current ? -1 : 0, perf: g.character.job ? -2 : 0 }) },
          { w: (g) => (hasTalent(g, 'Gaming') ? 45 : 65), t: 'Tilt', x: 'The streak ended at 2:30 a.m. and so did your good mood. You kept playing anyway and lost nine matches in a row. At 6 a.m. you slept for forty minutes.', fx: (g) => ({ happiness: -4, health: -4, grades: g.character.education.current ? -2 : 0, perf: g.character.job ? -3 : 0 }), tone: 'bad' },
        ],
      },
      {
        id: 'timer',
        label: 'One match, then set a timer and log off',
        emoji: '\u{23F0}',
        outs: [{ t: 'Self-Control', x: 'You played one match, said goodnight to the team and slept like a baby. They called you a traitor. You called yourself rested.', fx: { happiness: 2, health: 2, discipline: 3 } }],
      },
      {
        id: 'invite',
        label: 'Ask a friend to take over my place',
        emoji: '\u{1F91D}',
        when: (g) => friends(g).length > 0,
        outs: [{ t: 'Substitute', x: 'A friend took your seat and carried the team to victory. You slept eight hours and woke to a message full of exclamation marks.', fx: { happiness: 4, rel: 3, health: 1 } }],
      },
    ],
  },
  {
    id: 'era.2010s.inAppBill',
    emoji: '\u{1F4B3}',
    title: 'The Tablet Tab',
    minAge: 24,
    maxAge: 60,
    years: [2011, 2020],
    weight: 18,
    cooldown: 6,
    when: (g) => adoption(g, 'smartphone', 0.2) && kids(g, 3, 12).length > 0 && consumer(g),
    text: (g) => {
      const kid = anyOf(g, kids(g, 3, 12))
      return {
        text: `You open your card statement: ${kid ? kid.firstName : 'your child'} has spent ${money(eraPrice(g, 180))} on virtual gems, pet food and a golden hat in a free game on your phone. "It was free!" ${kid ? kid.firstName : 'your child'} insists. What will you do?`,
        person: kid,
        data: { bill: eraPrice(g, 180) },
      }
    },
    opts: [
      {
        id: 'refund',
        label: 'Ask the store for a refund',
        emoji: '\u{1F4E7}',
        outs: [
          { w: 5, t: 'Refunded', x: 'After a long email and a short wait, you got most of the money back, along with a polite note about parental controls.', fx: (_g, x) => ({ money: -Math.round(x.n('bill') * 0.2), happiness: 2 }), tone: 'good' },
          { w: 5, t: 'Denied', x: 'The store said that every purchase had been approved, and a very patient person explained how, step by step. You are out the money.', fx: (_g, x) => ({ money: -x.n('bill'), happiness: -4 }), tone: 'bad' },
        ],
      },
      {
        id: 'lesson',
        label: 'Pay it and teach a lesson about money',
        emoji: '\u{1F9E0}',
        outs: [{ t: 'Expensive Lesson', x: (_g, x) => `You paid the bill and sat ${x.p?.firstName ?? 'your child'} down with a notebook. They now understand that "free" can be a trap, and they say so at every shop.`, l: 'My child ran up a huge bill on my phone and I turned it into a lesson.', fx: (_g, x) => ({ money: -x.n('bill'), happiness: -2, rel: 3, karma: 1 }) }],
      },
      {
        id: 'ground',
        label: 'Take the tablet away for a month',
        emoji: '\u{1F512}',
        outs: [{ t: 'Device Detox', x: (_g, x) => `You paid, and locked the tablet in a drawer. ${x.p?.firstName ?? 'Your child'} discovered a pile of board games that had been waiting for years.`, fx: (_g, x) => ({ money: -x.n('bill'), happiness: -2, rel: -3 }) }],
      },
    ],
  },
  {
    id: 'era.2000s.mobileMoney',
    emoji: '\u{1F4F2}',
    title: 'Money by Phone',
    minAge: 18,
    maxAge: 70,
    years: [2007, 2026],
    weight: 24,
    cooldown: 5,
    when: (g) => regionIs(g, 'africa', 'india', 'seasia', 'latam') && adoption(g, 'mobilePhone', 0.15) && wealthOf(g) < 0.5,
    text: (g) => {
      const service = inCountry(g, 'ke') && g.year >= 2007 ? 'M-Pesa' : 'mobile money'
      return {
        text: `Your mother in the village needs money for the school fees. The bus costs ${money(eraPrice(g, 6))} each way and takes two days. The ${service} agent on the corner says she can pick up the money tomorrow for a small fee. What will you do?`,
        data: { fee: eraPrice(g, 0.4), trip: eraPrice(g, 12), service },
      }
    },
    opts: [
      {
        id: 'phone',
        label: (g) => `Send it through ${inCountry(g, 'ke') && g.year >= 2007 ? 'M-Pesa' : 'mobile money'}`,
        emoji: '\u{1F4F2}',
        outs: [{ t: 'Same Day', x: 'You typed a number, a name and an amount, and an hour later your mother called from the agent’s shop to say it had arrived. She had never been happier about a piece of plastic.', l: 'I sent money to my mother by phone and it arrived in an hour.', fx: (_g, x) => ({ money: -x.n('fee'), happiness: 5, karma: 2, rel: 3 }), tone: 'good' }],
      },
      {
        id: 'bus',
        label: 'Carry the cash home myself',
        emoji: '\u{1F68C}',
        when: (g) => g.character.money >= eraPrice(g, 12),
        outs: [
          { w: 9, t: 'Home for a Weekend', x: 'You took the bus for two days and handed your mother the envelope in person. She cooked for an entire day. It was the best weekend of the year.', fx: (_g, x) => ({ money: -x.n('trip'), happiness: 8, rel: 8 }), tone: 'good' },
          { w: 1, t: 'Pickpocket', x: 'Somewhere on the bus, a very skilled hand found your pocket. By the time you reached the village, the envelope was gone and so was your good mood.', fx: (_g, x) => ({ money: -x.n('trip') * 3, happiness: -8 }), tone: 'bad' },
        ],
      },
      {
        id: 'wait',
        label: 'Wait until payday',
        emoji: '\u{23F3}',
        outs: [{ t: 'Too Late', x: 'You waited a week, and your mother borrowed from a neighbor in the meantime. She never complained, and it stung more than if she had.', fx: { happiness: -4, rel: -4 }, tone: 'bad' }],
      },
    ],
  },
  {
    id: 'era.2000s.lanHouse',
    emoji: '\u{1F5A5}\u{FE0F}',
    title: 'The Lan House',
    minAge: 8,
    maxAge: 30,
    years: [2000, 2014],
    weight: 24,
    cooldown: 4,
    when: (g) => inCountry(g, 'br') && adoption(g, 'internet', 0.02),
    text: (g) => ({
      text: `Down the street, a small shop full of computers has opened, with a hand-painted sign that says "Lan House." An hour costs ${money(eraPrice(g, 1))}. Half the neighborhood is inside: kids playing, adults looking for jobs and one man paying his taxes. You have a coin and an hour. What will you do?`,
      data: { hour: eraPrice(g, 1) },
    }),
    opts: [
      {
        id: 'play',
        label: 'Play with the neighborhood kids',
        emoji: '\u{1F3AE}',
        when: (g) => g.character.money >= eraPrice(g, 1),
        outs: [{ t: 'Team of the Block', x: 'You and eight kids filled a row of computers, shouted across the room and got scolded by the owner. By the end of the hour you had a team name and a rival.', l: 'I played games with the whole block at the lan house.', fx: (_g, x) => ({ money: -x.n('hour'), happiness: 8, rel: 3 }) }],
      },
      {
        id: 'homework',
        label: 'Look up my school research',
        emoji: '\u{1F4DA}',
        when: (g) => g.character.money >= eraPrice(g, 1),
        outs: [{ t: 'Better Than the Library', x: 'You found information about the rainforest that the school library did not have. Your teacher asked where you found it.', fx: (_g, x) => ({ money: -x.n('hour'), smarts: 3, grades: 2, happiness: 2 }) }],
      },
      {
        id: 'social',
        label: 'Check my profile on the social network',
        emoji: '\u{1F465}',
        when: (g) => g.character.money >= eraPrice(g, 1) && g.year >= 2004,
        outs: [{ t: 'Scrapbook', x: 'You spent the hour reading messages that people had left on your page and answering every one. You left feeling popular, and with no time left for anything else.', fx: (_g, x) => ({ money: -x.n('hour'), happiness: 6, rel: 2 }) }],
      },
      {
        id: 'watch',
        label: 'Watch the others play',
        emoji: '\u{1F440}',
        outs: [{ t: 'Free Show', x: 'You stood behind a row of players and learned two tricks that you would use the day you finally got your own turn.', fx: { happiness: 2, smarts: 1 } }],
      },
    ],
  },
]

export const EVENTS_2000_CULTURE: EventDef[] = eraEvents(SPECS)
