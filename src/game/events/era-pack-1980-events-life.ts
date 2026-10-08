// Era pack 1980-1999: more popups, for grown-ups and for the parts of the world where the decade
// looked different (shared TVs, phone kiosks, the first cyber cafes). Outcomes are weighted
// rolls; money is always engine dollars from eraPrice(); real brands only as touchstones.
import { endJob, earnIncome, formatMoney } from '../core'
import { hasTalent } from '../talents'
import { employerRef } from '../shops/everyday-brands'
import type { EventDef } from './helpers'
import { anyOf, friends, jobCompany, kids, money } from './helpers'
import { adoption, anglo, eraEvents, eraPrice, inYears, poorerCountry, regionIs, richCountry, wealthOf, type EraEventSpec } from './era-late-kit'
import { common } from './era'

const consumer = (g: Parameters<typeof wealthOf>[0]): boolean => wealthOf(g) >= 0.3
const fullTime = (g: Parameters<typeof wealthOf>[0]): boolean => g.character.job?.category === 'fulltime'
const company = (g: Parameters<typeof wealthOf>[0]): string => employerRef(jobCompany(g), 'your company')

/** The nominal US dollars a mobile phone cost in a year (falls fast through the nineties). */
function mobileCost(year: number): number {
  return year <= 1994 ? 400 : year <= 1997 ? 220 : year <= 1999 ? 120 : 70
}

const SPECS: EraEventSpec[] = [
  {
    id: 'era.1990s.downsizing',
    emoji: '\u{1F4C9}',
    title: 'Downsizing',
    minAge: 22,
    maxAge: 62,
    years: [1981, 1999],
    weight: 18,
    cooldown: 7,
    when: (g) => fullTime(g) && (inYears(g, 1981, 1983) || inYears(g, 1990, 1993) || inYears(g, 1996, 1998)) && wealthOf(g) >= 0.45,
    text: (g) => ({
      text: `A memo from head office says ${company(g)} is "right-sizing for a competitive future," which everybody on your floor knows means layoffs. The rumor is that 1 in 8 jobs will go. What will you do?`,
      data: { salary: g.character.job?.salary ?? 0 },
    }),
    opts: [
      {
        id: 'buyout',
        label: 'Volunteer for the buyout package',
        emoji: '\u{1F4B5}',
        outs: [
          {
            t: 'Take the Money',
            x: (_g, x) => `You signed up for the voluntary package and walked out with a cardboard box and ${formatMoney(Math.round(x.n('salary') * 0.3))} in severance. The future is wide open and a bit terrifying.`,
            l: 'I took a buyout during a round of downsizing.',
            fx: (_g, x) => ({ happiness: -3, money: Math.round(x.n('salary') * 0.3) }),
            after: (g) => endJob(g, 'job', 'laid off'),
          },
        ],
      },
      {
        id: 'harder',
        label: 'Stay and work twice as hard',
        emoji: '\u{1F4AA}',
        outs: [
          { w: 7, t: 'Survivor', x: 'You worked late every night and skipped every lunch. When the list came out, your name was not on it. Half your department’s was.', l: 'I survived a round of downsizing at work.', fx: { perf: 8, happiness: -4, health: -2 }, tone: 'good' },
          {
            w: 3,
            t: 'On the List',
            x: 'You worked late every night and skipped every lunch. When the list came out, your name was on it anyway. You were walked to the door with your coat.',
            l: 'I was let go in a round of downsizing despite working extra hard.',
            fx: { happiness: -10 },
            tone: 'bad',
            after: (g) => {
              const sev = Math.round((g.character.job?.salary ?? 0) * 0.15)
              endJob(g, 'job', 'laid off')
              if (sev > 0) earnIncome(g, sev)
            },
          },
        ],
      },
      {
        id: 'transfer',
        label: 'Ask for a transfer to another department',
        emoji: '\u{1F501}',
        outs: [
          { w: 5, t: 'Moved Sideways', x: 'Your manager found you a desk in a department that was hiring. The paperwork took a month, and the commute was longer, but you kept your job.', fx: { perf: 4, happiness: 1 } },
          { w: 5, t: 'No Room', x: 'Every department was cutting. Your manager apologized and said you would be better off looking outside. You updated your résumé on the night shift.', fx: { happiness: -4, smarts: 1 } },
        ],
      },
    ],
  },
  {
    id: 'era.1990s.dotcomOffer',
    emoji: '\u{1F680}',
    title: 'A Start-Up Calls',
    minAge: 21,
    maxAge: 50,
    years: [1998, 2000],
    weight: 16,
    once: true,
    when: (g) => fullTime(g) && adoption(g, 'internet', 0.04) && wealthOf(g) >= 0.6,
    text: (g) => ({
      text: `A recruiter calls from a start-up with a bean-bag chair in the lobby, a free soda fridge and a website that nobody can explain. They want you to leave ${company(g)} for a lower salary and a pile of stock options. "This is the future," the recruiter says. What will you do?`,
      data: { salary: g.character.job?.salary ?? 0 },
    }),
    opts: [
      {
        id: 'join',
        label: 'Join the start-up',
        emoji: '\u{1F4A5}',
        hint: { talent: 'Investing', of: 0, text: (pct) => `Your gut says the options pay off about ${pct}% of the time. The bubble does not last.` },
        outs: [
          {
            w: 15,
            t: 'Options Come Through',
            x: 'The start-up went public and your options turned into real money before the market cooled. You sold the shares early and bought a nice car with them.',
            l: 'I left my job for a start-up and cashed in my options at the top.',
            fx: (_g, x) => ({ money: Math.round(x.n('salary') * 1.2), happiness: 10 }),
            tone: 'good',
            after: (g) => endJob(g, 'job', 'quit'),
          },
          {
            w: 85,
            t: 'Bubble',
            x: 'The start-up burned through its money on parties and billboards. The doors closed within a year and your stock options became a wall decoration. You kept the bean-bag chair.',
            l: 'The start-up I joined collapsed in the dot-com bust.',
            fx: { happiness: -8, perf: -5 },
            tone: 'bad',
            after: (g) => endJob(g, 'job', 'quit'),
          },
        ],
      },
      {
        id: 'stay',
        label: 'Stay in my safe job',
        emoji: '\u{1F3E0}',
        outs: [{ t: 'Boring and Employed', x: 'You thanked the recruiter and stayed. When the bubble burst, you were one of the few people in your circle who still had a job.', fx: { happiness: 1, perf: 2 } }],
      },
      {
        id: 'side',
        label: 'Build a website on the side',
        emoji: '\u{1F4BB}',
        outs: [
          { w: 6, t: 'Weekend Project', x: 'You built a small website over four weekends. It earned a few dollars and a lot of respect from your nephew.', fx: (g) => ({ money: eraPrice(g, 150), smarts: 2, happiness: 3 }) },
          { w: 4, t: 'Burned Out', x: 'You spent every weekend on the website and nobody visited it but you. You learned a lot of things, mostly about sleep.', fx: { smarts: 2, health: -2, happiness: -3 } },
        ],
      },
    ],
  },
  {
    id: 'era.1990s.y2kOvertime',
    emoji: '\u{1F5A5}\u{FE0F}',
    title: 'The Millennium Bug',
    minAge: 20,
    maxAge: 62,
    years: [1998, 1999],
    weight: 22,
    once: true,
    when: (g) => fullTime(g) && adoption(g, 'homeComputer', 0.1),
    text: (g) => ({
      text: `Management has discovered that every ${hasTalent(g, 'Programming') ? 'program' : 'system'} at ${company(g)} thinks the year 2000 is 1900. A "Y2K compliance team" is forming, and they want volunteers for the long hours. What will you do?`,
      data: { pay: eraPrice(g, 900) },
    }),
    opts: [
      {
        id: 'volunteer',
        label: 'Join the team and pull overtime',
        emoji: '\u{23F0}',
        outs: [{ t: 'Millennium Warrior', x: (_g, x) => `You spent nights and weekends hunting two-digit years in old code. Management paid ${formatMoney(x.n('pay'))} in overtime and a pizza voucher.`, l: 'I worked overtime to fix the millennium bug.', fx: (_g, x) => ({ money: x.n('pay'), perf: 8, health: -3, happiness: -3, smarts: 1 }) }],
      },
      {
        id: 'minimum',
        label: 'Do the minimum',
        emoji: '\u{1F937}',
        outs: [{ t: 'Not My Department', x: 'You checked the boxes on the form and went home on time. Someone else got the credit and the pizza.', fx: { perf: -2, happiness: 2 } }],
      },
      {
        id: 'stock',
        label: 'Prepare for the worst at home',
        emoji: '\u{1F96B}',
        outs: [{ t: 'Candles and Cans', x: 'You bought canned food, bottled water and a hand-crank radio, and printed your bank statements. On New Year’s Day everything worked. You have enough beans for a decade.', fx: (g) => ({ money: -eraPrice(g, 150), happiness: 1 }) }],
      },
    ],
  },
  {
    id: 'era.1990s.firstMobile',
    emoji: '\u{1F4F1}',
    title: 'The First Mobile',
    minAge: 18,
    maxAge: 65,
    years: [1993, 2002],
    weight: 20,
    once: true,
    when: (g) => adoption(g, 'mobilePhone', 0.03) && consumer(g),
    text: (g) => ({
      text: `A mobile phone, a gadget you can call people from while standing in a field, costs ${money(eraPrice(g, mobileCost(g.year)))} and every minute you talk is charged by the second. Everyone at work has been showing theirs off. What will you do?`,
      data: { cost: eraPrice(g, mobileCost(g.year)), bill: eraPrice(g, 130) },
    }),
    opts: [
      {
        id: 'emergency',
        label: 'Buy one, for emergencies only',
        emoji: '\u{1F198}',
        when: (g) => g.character.money >= eraPrice(g, mobileCost(g.year)),
        outs: [{ t: 'Careful Caller', x: 'You bought a phone and kept it switched off in the glove box. When you broke down on a dark road six months later, it was the best purchase you had ever made.', l: 'I bought my first mobile phone for emergencies.', fx: (_g, x) => ({ money: -x.n('cost'), happiness: 3 }) }],
      },
      {
        id: 'free',
        label: 'Buy one and use it all the time',
        emoji: '\u{1F4DE}',
        when: (g) => g.character.money >= eraPrice(g, mobileCost(g.year)) + eraPrice(g, 130),
        outs: [{ t: 'Bill Shock', x: (_g, x) => `You called everyone you knew from the supermarket queue. The first bill was ${formatMoney(x.n('bill'))}, and you could hear your wallet whimper.`, l: 'My first mobile phone bill was a shock.', fx: (_g, x) => ({ money: -x.n('cost') - x.n('bill'), happiness: 4 }), tone: 'bad' }],
      },
      {
        id: 'work',
        label: 'Take the one my work offers',
        emoji: '\u{1F4BC}',
        when: (g) => !!g.character.job,
        outs: [{ t: 'On Call', x: 'The company gave you a phone, and every boss in the building learned how to find you. It turns out being reachable is not a perk.', fx: { perf: 3, happiness: -3 } }],
      },
      {
        id: 'booth',
        label: 'Stick with the phone booth',
        emoji: '\u{1F4DE}',
        outs: [{ t: 'Old School', x: 'You kept a pocketful of coins and a phone card, and called from the booth on the corner. You were not reachable and you did not mind at all.', fx: { happiness: 1 } }],
      },
    ],
  },
  {
    id: 'era.1980s.compactDisc',
    emoji: '\u{1F4BF}',
    title: 'Compact Discs',
    minAge: 16,
    maxAge: 60,
    years: [1984, 1999],
    weight: 16,
    once: true,
    when: (g) => consumer(g) && (g.year >= 1987 || richCountry(g)),
    text: (g) => ({
      text: `Your friend ${anyOf(g, friends(g))?.firstName ?? 'next door'} says vinyl and cassettes are history: compact discs are crystal clear, never wear out, and you can skip tracks. A player costs ${money(eraPrice(g, 250))} and every disc costs ${money(eraPrice(g, 16))}, double what a tape does. What will you do?`,
      data: { player: eraPrice(g, 250), disc: eraPrice(g, 16) },
    }),
    opts: [
      {
        id: 'switch',
        label: 'Buy a player and my favorite album on disc',
        emoji: '\u{1F4B8}',
        when: (g) => g.character.money >= eraPrice(g, 250) + eraPrice(g, 16),
        outs: [{ t: 'Digital Sound', x: 'You played your favorite album and heard instruments you never knew were in the song. You then spent three months replacing your whole collection.', l: 'I bought my first compact disc player.', fx: (_g, x) => ({ money: -x.n('player') - x.n('disc'), happiness: 8 }) }],
      },
      {
        id: 'wait',
        label: 'Wait until prices drop',
        emoji: '\u{23F3}',
        outs: [{ t: 'Patient Listener', x: 'You kept your cassettes and waited a few years. The players got cheaper, the discs got cheaper, and your patience got a small round of applause.', fx: { happiness: 1, discipline: 2 } }],
      },
      {
        id: 'tape',
        label: 'Keep my records and tapes',
        emoji: '\u{1F4FC}',
        outs: [{ t: 'Warm Crackle', x: 'You said that vinyl sounded warmer and the crackle was part of the music. Nobody argued with you, except for the friends who had discs.', fx: { happiness: 1 } }],
      },
    ],
  },
  {
    id: 'era.1980s.camcorder',
    emoji: '\u{1F4F9}',
    title: 'Home Video',
    minAge: 22,
    maxAge: 60,
    years: [1985, 1999],
    weight: 16,
    cooldown: 6,
    when: (g) => consumer(g) && kids(g, 0, 14).length > 0,
    text: (g) => {
      const kid = anyOf(g, kids(g, 0, 14))
      return {
        text: `Your family bought a camcorder, a shoulder-mounted machine the size of a toaster. ${kid ? kid.firstName : 'Your child'} is about to ${kid && kid.age < 4 ? 'take a first step' : 'perform in the school show'}. What will you do?`,
        person: kid,
      }
    },
    opts: [
      {
        id: 'film',
        label: 'Film every second',
        emoji: '\u{1F3A5}',
        outs: [
          { w: 6, t: 'For the Family Archive', x: (_g, x) => `You filmed the whole thing, shaky and wonderful. Years later, the family watched ${x.p?.firstName ?? 'your child'} on a tape that smelled of dust and laughed until they cried.`, fx: { happiness: 4, rel: 3 }, tone: 'good' },
          { w: 4, t: 'You Missed It', x: (_g, x) => `You looked through the viewfinder so intently that you only saw the moment on a tiny screen. ${x.p?.firstName ?? 'Your child'} said, "Did you see me?" You had, kind of.`, fx: { happiness: -2, rel: -2 } },
        ],
      },
      {
        id: 'watch',
        label: 'Put the camcorder down and just watch',
        emoji: '\u{1F440}',
        outs: [{ t: 'Present', x: (_g, x) => `You watched with both eyes, clapped in the right places and hugged ${x.p?.firstName ?? 'your child'} afterwards. No tape exists. The memory does.`, fx: { happiness: 5, rel: 5 }, tone: 'good' }],
      },
    ],
  },
  {
    id: 'era.1980s.liveAid',
    emoji: '\u{1F3B8}',
    title: 'The Whole World Watching',
    minAge: 8,
    maxAge: 80,
    years: [1985, 1985],
    weight: 40,
    once: true,
    when: (g) => common(g, 'tv'),
    text: () => ({
      text: 'Two huge concerts, one in London and one in Philadelphia, are being broadcast live to the whole world to raise money for famine relief in Ethiopia. The phone lines for pledges are open. What will you do?',
    }),
    opts: [
      {
        id: 'give',
        label: 'Call in a donation',
        emoji: '\u{1F4B5}',
        when: (g) => g.character.money >= eraPrice(g, 20),
        outs: [{ t: 'Do They Know?', x: 'You pledged your donation and watched with a lump in your throat as the total ticked up. For one day, everyone was doing the same thing.', l: 'I donated during the famine relief concerts that the whole world watched.', fx: (g) => ({ money: -eraPrice(g, 20), karma: 6, happiness: 5 }), tone: 'good' }],
      },
      {
        id: 'watch',
        label: 'Watch every hour of it',
        emoji: '\u{1F4FA}',
        outs: [{ t: 'Global Living Room', x: 'You watched sixteen hours of music, from sunrise until the final song. It felt as if the whole planet was sitting in the same room.', l: 'I watched the famine relief concerts live with the whole world.', fx: { happiness: 5, karma: 1 } }],
      },
      {
        id: 'collect',
        label: 'Organize a collection at school or work',
        emoji: '\u{1F4E6}',
        outs: [{ t: 'Pass the Hat', x: 'You went around with a hat and a clipboard. Some people gave a lot, some gave a little and one man gave you a lecture, but the hat got heavy.', l: 'I organized a collection for famine relief.', fx: { karma: 8, happiness: 5, smarts: 1 }, tone: 'good' }],
      },
    ],
  },
  {
    id: 'era.1980s.dayAfter',
    emoji: '\u{2622}\u{FE0F}',
    title: 'The Movie Everyone Is Talking About',
    minAge: 12,
    maxAge: 70,
    years: [1983, 1984],
    weight: 28,
    once: true,
    when: (g) => common(g, 'tv') && (anglo(g) || regionIs(g, 'europe')),
    text: () => ({
      text: 'A television film about what would happen after a nuclear war is airing tonight, and schools and newspapers have been warning everyone about it for weeks. Your family is divided about whether to watch. What will you do?',
    }),
    opts: [
      {
        id: 'watch',
        label: 'Watch it with the family',
        emoji: '\u{1F4FA}',
        outs: [{ t: 'Quiet Night', x: 'Nobody spoke for the last half hour. Afterward your parents turned off the TV and talked for hours, about fear, about the world and about what really matters.', l: 'I watched a TV film about nuclear war with my family.', fx: { happiness: -3, smarts: 1, rel: 3, karma: 1 } }],
      },
      {
        id: 'skip',
        label: 'Skip it and read a book',
        emoji: '\u{1F4D6}',
        outs: [{ t: 'Not Tonight', x: 'You decided you had enough to worry about, and spent the evening with a book. The next day, everybody at school wanted to talk about nothing else.', fx: { happiness: 1, smarts: 1 } }],
      },
      {
        id: 'talk',
        label: 'Watch and then write to my local paper',
        emoji: '\u{270D}\u{FE0F}',
        outs: [{ t: 'Letter to the Editor', x: 'You wrote a letter asking why the world needed so many bombs. The paper printed it under the headline "Young Reader Worries." You felt a little less helpless.', fx: { happiness: 2, smarts: 2, karma: 2 } }],
      },
    ],
  },
  {
    id: 'era.1980s.stickerAlbum',
    emoji: '\u{26BD}',
    title: 'The Sticker Album',
    minAge: 7,
    maxAge: 16,
    years: [1982, 1998],
    weight: 18,
    cooldown: 5,
    when: (g) => consumer(g) && (g.year % 2 === 0) && (regionIs(g, 'europe', 'uk', 'latam', 'brazil', 'oceania') || g.character.countryId === 'mx'),
    text: (g) => ({
      text: `It is a World Cup or European Championship year, and the whole school is collecting the sticker album. You are only seven stickers short of a full page, and a packet costs ${money(eraPrice(g, 0.5))}. What will you do?`,
      data: { pack: eraPrice(g, 0.5) },
    }),
    opts: [
      {
        id: 'buy',
        label: 'Spend my pocket money on packets',
        emoji: '\u{1F4B5}',
        when: (g) => g.character.money >= eraPrice(g, 3),
        outs: [{ t: 'Doubles Again', x: 'You bought ten packets and got nine stickers you already had. The one you needed was a goalkeeper from a team that did not qualify.', fx: (g) => ({ money: -eraPrice(g, 3), happiness: 2 }) }],
      },
      {
        id: 'swap',
        label: 'Swap doubles in the playground',
        emoji: '\u{1F501}',
        outs: [
          { w: 7, t: 'Wheeler-Dealer', x: 'By break time you had swapped two doubles for the one you needed and learned a lot about negotiating with eight-year-olds.', fx: { happiness: 6, smarts: 1 }, tone: 'good' },
          { w: 3, t: 'Shiny Trap', x: 'A classmate talked you into trading a shiny sticker for three plain ones. You still have the three plain ones.', fx: { happiness: -2 } },
        ],
      },
      {
        id: 'skip',
        label: 'Give up on the album',
        emoji: '\u{1F937}',
        outs: [{ t: 'Incomplete', x: 'You gave up the album and cheered for your team from the sofa. The album still sits in a drawer, with its last page empty.', fx: { happiness: -1 } }],
      },
    ],
  },
  {
    id: 'era.1990s.rollerRink',
    emoji: '\u{1F6FC}',
    title: 'Roller Rink',
    minAge: 6,
    maxAge: 18,
    years: [1980, 1999],
    weight: 16,
    cooldown: 5,
    when: (g) => anglo(g) || regionIs(g, 'europe', 'japan'),
    text: (g) => {
      const f = anyOf(g, friends(g))
      return {
        text: `${f ? f.firstName : 'A friend'} is having a birthday party at the roller rink, which has a disco ball, a snack bar and a boy playing the same song over and over. You have never been on skates. What will you do?`,
        person: f,
      }
    },
    opts: [
      {
        id: 'skate',
        label: 'Lace up and give it a go',
        emoji: '\u{1F6FC}',
        outs: [
          { w: 5, t: 'Smooth Moves', x: 'After the first ten minutes of clinging to the wall, you let go and glided. By the end of the party you were doing a backwards lap, sort of.', fx: { happiness: 8, health: 1 }, tone: 'good' },
          { w: 4, t: 'Wall Hugger', x: 'You clung to the wall for the entire party and learned that your friends are quite kind, and your tailbone is not.', fx: { happiness: 3, health: -1 } },
          { w: 1, t: 'Sprained Wrist', x: 'You went down on the first lap and your wrist went with you. The party continued without you, and the cake was not that great anyway.', fx: { happiness: -4, health: -4 }, tone: 'bad' },
        ],
      },
      {
        id: 'snack',
        label: 'Sit at the snack bar',
        emoji: '\u{1F35F}',
        outs: [{ t: 'Snack Expert', x: 'You ate fries, watched your friends go around in circles and judged the music. You laughed more than anyone on the rink.', fx: { happiness: 4 } }],
      },
      {
        id: 'skip',
        label: 'Make an excuse and stay home',
        emoji: '\u{1F3E0}',
        outs: [{ t: 'Missed It', x: 'You said you had a cold. The party was legendary, and you heard about it for weeks.', fx: { happiness: -3, rel: -2 } }],
      },
    ],
  },
  {
    id: 'era.1990s.tamagotchi',
    emoji: '\u{1F95A}',
    title: 'A Pet in Your Pocket',
    minAge: 6,
    maxAge: 18,
    years: [1996, 1998],
    weight: 24,
    once: true,
    when: (g) => consumer(g) && (g.year >= 1997 || g.character.countryId === 'jp'),
    text: () => ({
      text: 'You got a tiny egg-shaped toy with a screen and three buttons, with a pixel pet inside that needs feeding, cleaning and attention day and night. It beeps. It beeps in class. What will you do?',
    }),
    opts: [
      {
        id: 'class',
        label: 'Take it to class and care for it all day',
        emoji: '\u{1F3EB}',
        outs: [
          { w: 6, t: 'Confiscated', x: 'It beeped in the middle of a test. The teacher took it away and put it in her desk. You listened to it beep for the rest of the day, and felt like a bad parent.', l: 'My teacher confiscated my digital pet.', fx: { happiness: -5, grades: -1 }, tone: 'bad' },
          { w: 4, t: 'A Model Pet', x: 'You fed it under the desk and kept it alive for three weeks, which is more than you can say for your science project.', fx: { happiness: 5 } },
        ],
      },
      {
        id: 'home',
        label: 'Leave it at home on the shelf',
        emoji: '\u{1F3E0}',
        outs: [{ t: 'Gone Too Soon', x: 'You came back from school to find that your pet had passed away on the shelf. You held a small funeral in your head, and reset it the same night.', l: 'My digital pet died while I was at school.', fx: { happiness: -3 } }],
      },
      {
        id: 'sibling',
        label: 'Ask a family member to feed it',
        emoji: '\u{1F46A}',
        outs: [{ t: 'Pet Sitter', x: 'Your grandmother took over the pet and kept it alive for a month. She called it "the little fellow" and cried when it finally went away.', fx: { happiness: 4, rel: 4 } }],
      },
    ],
  },
  {
    id: 'era.1980s.karaoke',
    emoji: '\u{1F3A4}',
    title: 'Karaoke Night',
    minAge: 16,
    maxAge: 65,
    years: [1985, 1999],
    weight: 20,
    cooldown: 4,
    when: (g) => regionIs(g, 'japan', 'korea', 'china', 'seasia') || (anglo(g) && g.year >= 1990),
    text: (g) => {
      const f = anyOf(g, friends(g))
      return {
        text: `${f ? f.firstName : 'Your friends'} drag you to a karaoke bar, where strangers take turns murdering the songs of the decade while the lyrics scroll across a screen. Your name just came up on the list. What will you do?`,
        person: f,
      }
    },
    opts: [
      {
        id: 'sing',
        label: 'Sing a big ballad with all my heart',
        emoji: '\u{1F3B6}',
        hint: { talent: 'Music', of: 0, text: (pct) => `With your voice, about ${pct}% the room goes wild.` },
        outs: [
          { w: (g) => (hasTalent(g, 'Music') ? 70 : 25), t: 'Standing Ovation', x: 'The room went silent, then roared. A stranger bought you a drink and asked if you were a professional.', l: 'I brought the house down at karaoke.', fx: { happiness: 10, fame: 1 }, tone: 'good' },
          { w: (g) => (hasTalent(g, 'Music') ? 30 : 75), t: 'Brave and Off-Key', x: 'You hit about half the notes, the room applauded politely and your friends cheered for the whole second verse. It was a triumph, of a kind.', fx: { happiness: 6 } },
        ],
      },
      {
        id: 'duet',
        label: 'Drag a friend up for a duet',
        emoji: '\u{1F46B}',
        when: (g) => friends(g).length > 0,
        outs: [{ t: 'Duet Disaster', x: (_g, x) => `You and ${x.p?.firstName ?? 'your friend'} sang with such terrible harmony that people stopped talking to listen. The friendship has never been stronger.`, fx: { happiness: 7, rel: 6 } }],
      },
      {
        id: 'pass',
        label: 'Hide in the bathroom until it passes',
        emoji: '\u{1F6BB}',
        outs: [{ t: 'Stage Fright', x: 'You waited in the bathroom until your name was skipped. Nobody noticed, but you kept the secret of your voice a little longer.', fx: { happiness: -1 } }],
      },
    ],
  },
  {
    id: 'era.1980s.breakdance',
    emoji: '\u{1F57A}',
    title: 'Cardboard Dance Floor',
    minAge: 10,
    maxAge: 22,
    years: [1984, 1987],
    weight: 22,
    once: true,
    when: (g) => consumer(g) && common(g, 'tv'),
    text: (g) => {
      const f = anyOf(g, friends(g))
      return {
        text: `Everybody in the neighborhood suddenly breakdances. ${f ? f.firstName : 'A friend'} has flattened a refrigerator box on the pavement and a boombox is playing at full volume. They are waving you over. What will you do?`,
        person: f,
      }
    },
    opts: [
      {
        id: 'spin',
        label: 'Try the head spin',
        emoji: '\u{1F300}',
        outs: [
          { w: (g) => 2 + Math.round(g.character.hidden.athleticism / 25), t: 'Spinning', x: 'You spun on your back for four glorious seconds. A crowd gathered and you gave your first ever autograph, on a flattened can.', fx: { happiness: 9, health: -1, fame: 1 }, tone: 'good' },
          { w: 4, t: 'Sore Back', x: 'You tried the head spin and landed in a heap. The crowd gasped. You lay on the cardboard with your eyes closed, whispering "I am fine."', fx: { happiness: -2, health: -4 }, tone: 'bad' },
        ],
      },
      {
        id: 'moves',
        label: 'Stick to the easy moves',
        emoji: '\u{1F57A}',
        outs: [{ t: 'The Wave', x: 'You mastered the wave and the robot in an afternoon, and spent the rest of the summer doing them in the supermarket aisles.', fx: { happiness: 6, athleticism: 1 } }],
      },
      {
        id: 'watch',
        label: 'Watch from the curb',
        emoji: '\u{1F440}',
        outs: [{ t: 'Spectator', x: 'You watched the cardboard champions all afternoon and clapped at the right moments. Everyone needs an audience.', fx: { happiness: 2 } }],
      },
    ],
  },
  {
    id: 'era.1980s.scaryMovie',
    emoji: '\u{1F47B}',
    title: 'Scary Movie Sleepover',
    minAge: 9,
    maxAge: 16,
    years: [1983, 1999],
    weight: 18,
    cooldown: 4,
    when: (g) => consumer(g) && common(g, 'tv') && g.year >= 1985,
    text: (g) => {
      const f = anyOf(g, friends(g))
      return {
        text: `${f ? f.firstName : 'A friend'} has rented a horror video that is "definitely too scary" and invited you to a sleepover. The parents are asleep upstairs. What will you do?`,
        person: f,
      }
    },
    opts: [
      {
        id: 'watch',
        label: 'Watch the whole thing',
        emoji: '\u{1F3AC}',
        outs: [
          { w: 6, t: 'Survived', x: 'You watched with the blanket over your face, and the sound turned down. You will never go into a basement again. It was the best sleepover ever.', fx: { happiness: 7, rel: 4 } },
          { w: 4, t: 'Nightmares', x: 'You didn\'t sleep. You counted sheep, counted ghosts, and eventually counted the cracks in the ceiling. At breakfast, you were the first to say "that was nothing."', fx: { happiness: -2, health: -1, rel: 3 } },
        ],
      },
      {
        id: 'cartoons',
        label: 'Suggest a comedy instead',
        emoji: '\u{1F602}',
        outs: [{ t: 'Comedy Hour', x: 'Everyone secretly wanted something funny, and the sleepover saw a comedy twice, plus popcorn fights. Someone slept on the floor, and you were declared a hero.', fx: { happiness: 6, rel: 3 } }],
      },
      {
        id: 'sleep',
        label: 'Pretend to fall asleep',
        emoji: '\u{1F634}',
        outs: [{ t: 'Fake Snore', x: 'You faked a snore so convincingly that you fell asleep. The others finished the film without you. You still hear about your "cowardice" at every reunion.', fx: { happiness: -1, rel: -2 } }],
      },
    ],
  },
  {
    id: 'era.1980s.aerobics',
    emoji: '\u{1F483}',
    title: 'Feel the Burn',
    minAge: 18,
    maxAge: 60,
    years: [1982, 1992],
    weight: 16,
    cooldown: 5,
    when: (g) => consumer(g) && (anglo(g) || regionIs(g, 'europe', 'japan', 'brazil', 'latam')),
    text: (g) => ({
      text: `Everybody is exercising to music in leotards and legwarmers. A new aerobics class is starting at the community center for ${money(eraPrice(g, 25))} a month, and a video version is available for home. What will you do?`,
      data: { fee: eraPrice(g, 25) },
    }),
    opts: [
      {
        id: 'class',
        label: 'Sign up for the class',
        emoji: '\u{1F3CB}\u{FE0F}',
        when: (g) => g.character.money >= eraPrice(g, 25),
        outs: [
          { w: 6, t: 'In Step', x: 'You mastered the grapevine, the step touch and the breathing. After a month you felt great, and your legwarmers were a legend.', l: 'I took an aerobics class and felt great.', fx: (_g, x) => ({ money: -x.n('fee'), health: 5, happiness: 5, looks: 1 }), tone: 'good' },
          { w: 4, t: 'Out of Step', x: 'You were always one step behind everyone else and facing the wrong way. You stayed anyway and felt great, mostly because of the donuts afterward.', fx: (_g, x) => ({ money: -x.n('fee'), health: 3, happiness: 3 }) },
        ],
      },
      {
        id: 'home',
        label: 'Work out at home with the video',
        emoji: '\u{1F4FA}',
        outs: [{ t: 'Living Room Workout', x: 'You pushed the coffee table aside and followed the instructor on screen. Your cat watched in disbelief from the sofa.', fx: { health: 3, happiness: 3 } }],
      },
      {
        id: 'skip',
        label: 'It is just a fad',
        emoji: '\u{1F6CB}\u{FE0F}',
        outs: [{ t: 'Couch Philosopher', x: 'You said it was just a phase, and sat on the couch eating crisps. You were right, it was a phase, but the exercise would have done you good.', fx: { health: -1, happiness: 1 } }],
      },
    ],
  },
  // --- Parts of the world where the decade looked different ---
  {
    id: 'era.1990s.sharedTv',
    emoji: '\u{1F4FA}',
    title: 'One TV for the Whole Street',
    minAge: 5,
    maxAge: 60,
    years: [1980, 1999],
    weight: 24,
    cooldown: 4,
    when: (g) => poorerCountry(g) && adoption(g, 'tv', 0.25),
    text: () => ({
      text: 'The big match is on tonight, and the only television on your street belongs to the neighbor. Half the neighborhood is already squeezed into his living room, with benches borrowed from the church. What will you do?',
    }),
    opts: [
      {
        id: 'go',
        label: 'Squeeze in and watch with everyone',
        emoji: '\u{1F465}',
        outs: [{ t: 'Goal!', x: 'Forty people screamed at once when the goal went in, and the roof nearly came off. You hugged people you had never met.', l: 'I watched the big match with the whole street at one neighbor’s TV.', fx: { happiness: 9, rel: 2 }, tone: 'good' }],
      },
      {
        id: 'radio',
        label: 'Listen on the radio with my family',
        emoji: '\u{1F4FB}',
        outs: [{ t: 'Radio Commentary', x: 'You and your family gathered around the crackling radio. The commentator described the match so well that you could see it all in your head.', fx: { happiness: 5, rel: 3 } }],
      },
      {
        id: 'bring',
        label: 'Bring snacks and make friends',
        emoji: '\u{1F36A}',
        outs: [{ t: 'Popular Guest', x: 'You brought a bag of roasted peanuts to share. By halftime you had a dozen new friends, and the neighbor called you "the nicest kid on the street."', fx: (g) => ({ money: -eraPrice(g, 1), happiness: 6, rel: 3, karma: 1 }) }],
      },
    ],
  },
  {
    id: 'era.1990s.phoneKiosk',
    emoji: '\u{260E}\u{FE0F}',
    title: 'A Call from Far Away',
    minAge: 12,
    maxAge: 80,
    years: [1985, 2004],
    weight: 22,
    cooldown: 4,
    when: (g) => poorerCountry(g) && !adoption(g, 'mobilePhone', 0.4),
    text: (g) => ({
      text: `A relative who lives far away has asked you to call at the phone kiosk at the end of the road. The owner charges by the minute, there is a queue of people and the call will cost ${money(eraPrice(g, 2))} a minute. What will you do?`,
      data: { rate: eraPrice(g, 2) },
    }),
    opts: [
      {
        id: 'short',
        label: 'Keep it short and to the point',
        emoji: '\u{23F1}\u{FE0F}',
        outs: [{ t: 'Three Minutes', x: 'You said everything you needed to say in three minutes, hung up and felt both relieved and a bit guilty. You wrote a long letter that evening to make up for it.', fx: (_g, x) => ({ money: -x.n('rate') * 3, happiness: 2 }) }],
      },
      {
        id: 'long',
        label: 'Talk for as long as I want',
        emoji: '\u{1F4AC}',
        when: (g) => g.character.money >= eraPrice(g, 2) * 12,
        outs: [{ t: 'Long Distance', x: (_g, x) => `You talked for twelve minutes, laughing and crying. It cost ${formatMoney(x.n('rate') * 12)}, and you did not regret a single second.`, l: 'I spent far too much on a call to a faraway relative, and it was worth it.', fx: (_g, x) => ({ money: -x.n('rate') * 12, happiness: 8, rel: 4 }), tone: 'good' }],
      },
      {
        id: 'letter',
        label: 'Send a letter instead',
        emoji: '\u{2709}\u{FE0F}',
        outs: [{ t: 'Slow Mail', x: 'You wrote four pages by hand and sent them off. The reply arrived five weeks later, and you read it forty times.', fx: { happiness: 3, smarts: 1 } }],
      },
    ],
  },
  {
    id: 'era.1990s.cyberCafe',
    emoji: '\u{1F5A5}\u{FE0F}',
    title: 'The Cyber Cafe',
    minAge: 12,
    maxAge: 50,
    years: [1997, 2006],
    weight: 24,
    once: true,
    when: (g) => poorerCountry(g) && !adoption(g, 'homeComputer', 0.15),
    text: (g) => ({
      text: `A new shop has opened in town: rows of glowing screens behind glass, a handwritten sign that says "cyber cafe," and a price of ${money(eraPrice(g, 1.5))} per hour. A boy at the next machine says you can talk to people anywhere in the world. What will you do?`,
      data: { hour: eraPrice(g, 1.5) },
    }),
    opts: [
      {
        id: 'relative',
        label: 'Write to a relative abroad',
        emoji: '\u{1F30D}',
        when: (g) => g.character.money >= eraPrice(g, 1.5),
        outs: [{ t: 'Instant Letter', x: 'You typed a long letter to your cousin overseas and pressed a button. Next day, the answer was waiting. You felt as if the world had folded in half.', l: 'I wrote to a faraway relative from a cyber cafe.', fx: (_g, x) => ({ money: -x.n('hour'), happiness: 9, rel: 3 }), tone: 'good' }],
      },
      {
        id: 'learn',
        label: 'Learn to use the machine properly',
        emoji: '\u{1F393}',
        when: (g) => g.character.money >= eraPrice(g, 1.5) * 2,
        outs: [
          { w: 7, t: 'Skills for Hire', x: 'The owner taught you to type properly, use a word processor and search for things. Within a month you were helping neighbors write their job applications.', l: 'I learned computer skills at a cyber cafe.', fx: (_g, x) => ({ money: -x.n('hour') * 2, smarts: 4, happiness: 4 }), tone: 'good' },
          { w: 3, t: 'Slow Connection', x: 'The connection was so slow that two hours produced one page of results and a very good chat with the owner.', fx: (_g, x) => ({ money: -x.n('hour') * 2, smarts: 1, happiness: 1 }) },
        ],
      },
      {
        id: 'games',
        label: 'Play games with the other boys',
        emoji: '\u{1F3AE}',
        when: (g) => g.character.money >= eraPrice(g, 1.5),
        outs: [{ t: 'Gaming Crew', x: 'You played until the cafe closed with a gang of strangers who became friends. The hour cost more than lunch, and it was worth every cent.', fx: (_g, x) => ({ money: -x.n('hour'), happiness: 8, grades: -1 }) }],
      },
      {
        id: 'look',
        label: 'Only look through the window',
        emoji: '\u{1F440}',
        outs: [{ t: 'Next Year', x: 'You pressed your nose to the glass and promised yourself you would be back when you had saved a little more.', fx: { happiness: 0 } }],
      },
    ],
  },
  {
    id: 'era.1990s.videoHall',
    emoji: '\u{1F3AC}',
    title: 'The Video Hall',
    minAge: 8,
    maxAge: 50,
    years: [1983, 2005],
    weight: 22,
    cooldown: 4,
    when: (g) => poorerCountry(g) && adoption(g, 'tv', 0.25) && wealthOf(g) >= 0.12,
    text: (g) => ({
      text: `A shed at the end of the road has been turned into a video hall: a TV on a stand, a rented tape, a generator that coughs, and rows of benches full of people watching an action film for ${money(eraPrice(g, 0.5))} a seat. The next show starts in ten minutes. What will you do?`,
      data: { fee: eraPrice(g, 0.5) },
    }),
    opts: [
      {
        id: 'pay',
        label: 'Pay and take a seat on the bench',
        emoji: '\u{1F39F}\u{FE0F}',
        when: (g) => g.character.money >= eraPrice(g, 0.5),
        outs: [{ t: 'Standing Room Only', x: 'The tape was scratched, the sound was loud and the whole hall roared when the hero arrived. You walked home quoting every line in the dark.', l: 'I paid to watch a film at the neighborhood video hall.', fx: (_g, x) => ({ money: -x.n('fee'), happiness: 8 }), tone: 'good' }],
      },
      {
        id: 'window',
        label: 'Watch through the window with the other kids',
        emoji: '\u{1FA9F}',
        outs: [
          { w: 6, t: 'Free Show', x: 'You and half a dozen other kids peered through a crack in the wall and watched half the film upside-down. It was magnificent.', fx: { happiness: 5 } },
          { w: 4, t: 'Chased Off', x: 'The owner chased the crowd of kids away with a broom, shouting about charity. You ran, laughing, until you were out of breath.', fx: { happiness: 2, health: 1 } },
        ],
      },
      {
        id: 'save',
        label: 'Keep my money and study instead',
        emoji: '\u{1F4DA}',
        outs: [{ t: 'Saving Up', x: 'You went home and studied by the lamp, and put the coin back in the tin. In time that tin became a school fee.', fx: { smarts: 2, grades: 1, discipline: 2, happiness: -1 } }],
      },
    ],
  },
  {
    id: 'era.1990s.powerCut',
    emoji: '\u{1F56F}\u{FE0F}',
    title: 'Power Cut',
    minAge: 8,
    maxAge: 60,
    years: [1980, 2005],
    weight: 24,
    cooldown: 3,
    when: (g) => poorerCountry(g),
    text: (g) => {
      const student = g.character.age < 25
      return {
        text: student ? 'The lights went out again, the night before a big exam. The neighborhood is dark, the generators next door are roaring and you have a candle, a stub of a pencil and a textbook. What will you do?' : 'The lights went out again in the middle of the evening, and the neighborhood is dark except for the glow of a few generators. What will you do?',
        data: { student: student ? 1 : 0 },
      }
    },
    opts: [
      {
        id: 'candle',
        label: 'Study by candlelight',
        emoji: '\u{1F56F}\u{FE0F}',
        when: (g) => g.character.age < 25,
        outs: [
          { w: 7, t: 'Burning the Midnight Oil', x: 'You read until the candle was a puddle. Your eyes hurt, but the answers came back in the exam hall as if you had written them yourself.', l: 'I studied by candlelight the night before an exam.', fx: { grades: 4, smarts: 2, health: -1 }, tone: 'good' },
          { w: 3, t: 'Wax and Worry', x: 'You fell asleep over the book and woke up with wax in your hair and the exam in four hours. You did your best.', fx: { grades: -1, health: -1, happiness: -2 } },
        ],
      },
      {
        id: 'neighbor',
        label: 'Go to the neighbor who has a generator',
        emoji: '\u{1F50C}',
        outs: [{ t: 'Borrowed Light', x: 'The neighbor with the generator let you sit by the one bulb, along with six other students. By midnight, you had all quizzed each other and become friends.', fx: { grades: 2, smarts: 1, happiness: 4, rel: 2 } }],
      },
      {
        id: 'talk',
        label: 'Sit outside and talk to the neighbors',
        emoji: '\u{1F319}',
        when: (g) => g.character.age >= 14,
        outs: [{ t: 'Darkness and Stories', x: 'Half the street came out to sit on steps and trade stories under the stars. Nobody mentioned the lights until they came back on at two in the morning.', fx: { happiness: 6, rel: 2 } }],
      },
      {
        id: 'sleep',
        label: 'Go to bed early',
        emoji: '\u{1F6CF}\u{FE0F}',
        outs: [{ t: 'Early Night', x: 'You went to bed with the sun, rose with the roosters and felt remarkably well. The exam was a different matter.', fx: { health: 2, happiness: 1 } }],
      },
    ],
  },
]

export const EVENTS_1980_LIFE: EventDef[] = eraEvents(SPECS)
