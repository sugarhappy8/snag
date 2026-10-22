// Era pack 1900-1945, popup events for working life and home: courtship under supervision, the
// doctor's house call, a bank run, riding the rails, a factory accident and the union meeting, the
// company store, a sewing machine on payments, the vacuum salesman, the party line, victory
// gardens, ration-book temptations and the blackout warden. Ids start with 'era.1900.'.
import { jobIsManual } from './era-pack-jobs'
import { chance } from '../rng'
import { pickLine } from '../text/pick'
import type { GameState } from '../types'
import { aParent, ch, defineEvents, money, say } from './helpers'
import { at, homeFrontNow, poorFamily, rationed } from './era-pack-where'
import { itemCost } from './era-pack-kit'

const WESTERN = ['us', 'uk', 'dominion', 'europe'] as const

function fairFor(g: GameState): string | null {
  const id = g.character.countryId
  switch (g.year) {
    case 1900:
    case 1937:
      return id === 'fr' || at(g, 'europe') ? 'the great Paris Exposition' : null
    case 1904:
      return id === 'us' ? 'the St. Louis World’s Fair' : null
    case 1915:
      return id === 'us' ? 'the Panama-Pacific Exposition in San Francisco' : null
    case 1924:
    case 1925:
      return at(g, 'uk', 'dominion') ? 'the British Empire Exhibition at Wembley' : null
    case 1933:
    case 1934:
      return id === 'us' ? 'the Century of Progress fair in Chicago' : null
    case 1939:
      return id === 'us' ? 'the New York World’s Fair' : null
    default:
      return null
  }
}

export const ADULT_EVENTS_1900 = defineEvents([
  {
    id: 'era.1900.courtship',
    emoji: '💌',
    title: 'Walking Out',
    minAge: 15,
    maxAge: 28,
    cooldown: 5,
    weight: 14,
    when: (g) => g.year >= 1900 && g.year <= 1939 && at(g, ...WESTERN) && !g.character.prison,
    setup: (g) => {
      const parent = aParent(g)
      return {
        text: `Someone from church, the shop or the Saturday dance has caught your eye, and the feeling seems to be mutual. In ${g.year < 1920 ? 'these' : 'these slightly less stuffy'} times, courtship has rules: calls at the house, chaperones and the whole street watching. ${parent ? `Your ${parent.gender === 'male' ? 'father' : 'mother'} has opinions.` : 'The neighbors have opinions.'} What will you do?`,
        choices: [ch('ask', 'Ask permission to call properly', '🎩'), ch('note', 'Slip a note after church', '✉️'), ch('group', 'Join the same group outings and see what happens', '🚲')],
      }
    },
    resolve: {
      ask: (g, x) => {
        const ok = chance(g, 0.7)
        const p = aParent(g)
        say(g, x, ok ? 'Calling Hours' : 'Not Just Yet', ok ? 'You asked the way your parents would have wished, in your best clothes with a freshly combed head. The answer was yes, for Sunday afternoons, in the parlor, with a plate of biscuits and an eagle-eyed aunt. It was the most nervous hour of your life.' : 'You asked with all due formality, and the answer was “not yet, and not that family.” You swallowed your pride and a plate of disappointment.', ok ? 'I was allowed to call on someone special, properly.' : 'I was told to wait before courting.', { happiness: ok ? 6 : -4, karma: 1, rels: p ? [{ p, d: ok ? 3 : -1 }] : [] }, ok ? 'good' : 'bad')
      },
      note: (g, x) => {
        const caught = chance(g, 0.4)
        const p = aParent(g)
        say(g, x, caught ? 'Intercepted' : 'A Reply', caught ? 'You tucked the note into a hymn book. Unfortunately, it was your aunt who found it. The note was read aloud at tea, and the house was silent for a week.' : 'You tucked the note into a hymn book, and a week later a reply arrived, in much neater handwriting. You kept it under your pillow for a year.', caught ? 'A note I wrote was found by my aunt.' : 'A secret note got a reply.', { happiness: caught ? -5 : 7, karma: -1, rels: p ? [{ p, d: caught ? -4 : 0 }] : [] }, caught ? 'bad' : 'good')
      },
      group: (g, x) => say(g, x, 'Safety in Numbers', 'You joined the cycling club, the choir and the picnic party that was organized by somebody’s grandmother. In the crowd, nobody counted as a chaperone, which meant that everyone was one. You had a very pleasant summer.', 'I took part in group outings and got to know someone special.', { happiness: 4, health: 1, athleticism: 1 }, 'good'),
    },
  },

  {
    id: 'era.1900.bob',
    emoji: '✂️',
    title: 'A New Look',
    minAge: 14,
    maxAge: 35,
    once: true,
    weight: 16,
    when: (g) => g.year >= 1920 && g.year <= 1930 && at(g, ...WESTERN),
    setup: (g) => {
      const man = g.character.gender === 'male'
      return {
        text: man
          ? 'Every film star has slicked-back hair and a pencil moustache, and the barber is offering the new look for a few coins. Your father says a short back and sides was good enough for him. What will you do?'
          : 'All the girls at the dance have bobbed hair now, and the barber has a chair free. Your mother says you will look like a boy and your grandmother says it is the end of civilization. What will you do?',
        choices: man ? [ch('slick', 'Slick it back and go for the look', '💈'), ch('keep', 'Keep the usual cut', '✂️'), ch('moustache', 'Grow a thin moustache', '🥸')] : [ch('bob', 'Have it bobbed', '✂️'), ch('keep', 'Keep it long', '💇'), ch('hat', 'Pin it up under a cloche hat', '👒')],
      }
    },
    resolve: {
      slick: (g, x) => say(g, x, 'Dapper', 'The barber slicked it back with scented oil, and you left the shop looking like a leading man. Your father said nothing, loudly, and the girls at the dance said plenty.', 'I got a slick new hairstyle.', { looks: 3, happiness: 4, rels: aParent(g) ? [{ p: aParent(g), d: -2 }] : [] }, 'good'),
      moustache: (g, x) => say(g, x, 'A Moustache Attempt', 'It took two months and a great deal of optimism to grow, and what appeared looked like a smudge. Your friends complimented it with straight faces, which was their greatest kindness.', 'I tried to grow a moustache and it was a smudge.', { looks: -1, happiness: 1 }, 'neutral'),
      bob: (g, x) => {
        const p = aParent(g)
        say(g, x, 'Bobbed!', 'Snip, snip, and ten inches of hair lay on the floor. You felt light, modern and very daring. Your grandmother wept into her apron, and your friends fell on your neck.', 'I had my hair bobbed.', { looks: 3, happiness: 5, rels: p ? [{ p, d: -3 }] : [] }, 'good')
      },
      hat: (g, x) => say(g, x, 'Cloche Compromise', 'You pinned your hair up under a cloche hat pulled right down to your eyebrows, and discovered you could see only the ground. Everybody told you that you looked very fashionable, which is what people say.', 'I wore a cloche hat to hide my hair.', { happiness: 2, looks: 1 }),
      keep: (g, x) => say(g, x, 'Old-fashioned', 'You stayed as you were, and your family breathed a sigh of relief. Your friends teased you gently for a week and then moved on to the next craze.', 'I kept my hair the way it was.', { happiness: 0, karma: 1, rels: aParent(g) ? [{ p: aParent(g), d: 2 }] : [] }),
    },
  },

  {
    id: 'era.1900.houseCall',
    emoji: '🩺',
    title: 'The Doctor’s Bag',
    minAge: 1,
    maxAge: 90,
    cooldown: 6,
    weight: (g) => (g.character.stats.health < 80 ? 14 : 4),
    when: (g) => g.year >= 1900 && g.year <= 1950 && at(g, ...WESTERN, 'latam', 'brazil', 'mena'),
    setup: (g) => {
      const fee = itemCost(g, 'doctor', 1)
      const child = g.character.age < 18
      return {
        text: `${child ? 'You have been feverish for three days.' : 'You have been laid low for three days with a cough that won’t quit.'} The family doctor makes house calls, but he charges for the trip, and the neighbors all have their own cures. What will you do?`,
        choices: [ch('doctor', `Send for the doctor (${money(fee)})`, '🩺'), ch('remedy', 'Try the old home remedies', '🧅'), ch('tonic', 'Buy a bottle of patent tonic', '🍶')],
        data: { fee },
      }
    },
    resolve: {
      doctor: (g, x) => {
        const quality = g.year >= 1935 ? 0.8 : 0.6
        const well = chance(g, quality)
        say(g, x, 'The Black Bag', 'The doctor arrived with a black bag, a dry cough of his own and a thermometer. He listened to your chest, shook his head and left a bottle of medicine and an order to stay in bed. The household obeyed him as it never obeyed anyone else.', 'The family doctor came to the house.', { money: -x.n('fee'), health: well ? 6 : 2, happiness: 1 }, 'good')
      },
      remedy: (g, x) => {
        const ok = chance(g, 0.5)
        say(g, x, ok ? 'Granny Knows Best' : 'Not Much Better', ok ? 'A mustard poultice, onion syrup, a hot toddy of honey and lemon and a week under three blankets: you were better by Sunday, and your grandmother was insufferable.' : 'A mustard poultice, onion syrup and a hot-water bottle did their best, but the cough hung on for weeks. You will never again doubt a doctor, or a grandmother, quite so cheerfully.', ok ? 'I got better with my grandmother’s home remedies.' : 'Old home remedies didn’t help much.', { health: ok ? 4 : -3, happiness: ok ? 2 : -2 }, ok ? 'good' : 'bad')
      },
      tonic: (g, x) => say(g, x, 'Snake Oil', 'The tonic was mostly alcohol, with a pinch of something bitter and a label full of promises. You slept very well that night and felt only a little better in the morning.', 'I bought a bottle of patent tonic and slept well.', { money: -itemCost(g, 'meal', 2), health: 1, happiness: 1, smarts: 0 }),
    },
  },

  {
    id: 'era.1900.bankRun',
    emoji: '🏦',
    title: 'A Run on the Bank',
    minAge: 18,
    maxAge: 80,
    once: true,
    weight: 30,
    when: (g) => g.year >= 1929 && g.year <= 1933 && at(g, 'us', 'dominion', 'europe', 'latam') && g.character.money >= itemCost(g, 'wage', 200),
    setup: () => ({
      text: 'Word is going round the street that the bank on the corner is in trouble. A line has formed outside its doors, and people are clutching their savings books. Your own savings are inside. Nobody knows whether the rumor is true. What will you do?',
      choices: [ch('withdraw', 'Join the line and take it all out', '💰'), ch('half', 'Take out half and leave half', '⚖️'), ch('trust', 'Trust the bank and go home', '🙏')],
    }),
    resolve: {
      withdraw: (g, x) => {
        const lost = chance(g, 0.12) ? Math.round(g.character.money * 0.25) : 0
        const fee = Math.round(g.character.money * 0.03)
        say(g, x, 'Cash in Hand', lost > 0 ? 'You queued for three hours and walked out with your savings in an envelope inside your coat. You hid it so well that you forgot where, and a thief or a mouse made off with a good share before you found it again.' : 'You queued for three hours and walked out with your savings in an envelope inside your coat. You slept with one hand on it for months. The bank, as it turned out, stayed open another year.', lost > 0 ? 'I withdrew my savings in a panic and some of it went missing.' : 'I took my savings out of the bank during a run.', { money: -(lost + fee), happiness: -1, karma: -1 }, lost > 0 ? 'bad' : 'neutral')
      },
      half: (g, x) => {
        const fails = chance(g, 0.25)
        const lost = fails ? Math.round(g.character.money * 0.25) : 0
        say(g, x, fails ? 'Half Saved' : 'Hedged', fails ? 'You took out half and left the rest for the bank to look after. The bank’s doors closed the following month, and the half you left was lost. The half in your coat saved you.' : 'You took out half and left the rest. The bank wobbled and held, and you spent months wondering if you’d been a coward or a sage.', fails ? 'I saved half my money when my bank failed.' : 'I took out half my savings during a bank run.', { money: -lost, happiness: fails ? -3 : 1 }, fails ? 'bad' : 'neutral')
      },
      trust: (g, x) => {
        const fails = chance(g, 0.25)
        const lost = fails ? Math.round(g.character.money * 0.5) : 0
        say(g, x, fails ? 'The Doors Close' : 'Business as Usual', fails ? 'You went home and told yourself the bank was sound. A month later its doors were closed with a notice on them, and half of what you had saved went with them. The neighbors who had queued looked at you with great sympathy.' : 'You went home and told yourself the bank was sound, and so it was. The line dispersed, the doors stayed open and your savings earned a little interest.', fails ? 'My bank failed and took half my savings.' : 'I trusted my bank during a run, and it held.', { money: fails ? -lost : itemCost(g, 'meal', 2), happiness: fails ? -8 : 3, karma: fails ? 0 : 1 }, fails ? 'bad' : 'good')
      },
    },
  },

  {
    id: 'era.1900.rails',
    emoji: '🚂',
    title: 'Riding the Rails',
    minAge: 15,
    maxAge: 35,
    cooldown: 6,
    weight: 22,
    when: (g) => g.year >= 1930 && g.year <= 1939 && at(g, 'us', 'dominion', 'europe', 'latam') && !g.character.job && !g.character.prison,
    setup: (g) => {
      const us = g.character.countryId === 'us' && g.year >= 1933
      return {
        text: 'The work has dried up at home. Word comes that the harvest two states away needs hands, and a freight train leaves the yard tonight. Plenty of young people are going. What will you do?',
        choices: [ch('ride', 'Hop the freight train', '🚂'), us ? ch('camp', 'Sign up for a government work camp', '🌲') : ch('gang', 'Join a public works gang', '⛏️'), ch('stay', 'Stay and scrape by', '🏠')],
      }
    },
    resolve: {
      ride: (g, x) => {
        const hurt = chance(g, 0.15)
        const found = chance(g, 0.6)
        const pay = found ? itemCost(g, 'wage', 260) : 0
        say(g, x, hurt ? 'A Hard Landing' : found ? 'Harvest Hands' : 'Nothing But Miles', hurt ? 'You swung up into a boxcar and slipped on the way. The ground was hard and the train didn’t stop. A farmer’s wife patched you up and sent you back, bruised and wiser, with a sandwich.' : found ? 'You rode three days with a dozen strangers in a draughty boxcar and arrived to find the harvest in full swing. You worked until your hands bled and went home with a little money and a lot of stories.' : 'You rode three days in a draughty boxcar to find the harvest already hired. You rode home as you came, hungry and with nothing to show but a tan.', hurt ? 'I fell hopping a freight train.' : found ? 'I rode the rails to the harvest and earned a little money.' : 'I rode the rails looking for work and found none.', hurt ? { health: -6, happiness: -4 } : { money: pay, happiness: found ? 3 : -3, health: found ? -1 : -2, willpower: 2 }, hurt || !found ? 'bad' : 'good')
      },
      camp: (g, x) => say(g, x, 'The Camp', 'You signed up for six months of planting trees, building trails and digging ditches. The food was plain and plentiful and the pay was small. You sent most of it home and came back stronger than you left.', 'I spent six months in a government work camp and sent my pay home.', { money: itemCost(g, 'wage', 250), health: 4, discipline: 3, happiness: 2, rel: 0 }, 'good'),
      gang: (g, x) => say(g, x, 'Public Works', 'You joined a gang digging a road, paid a modest day’s wage and a hot meal. The work was hard but steady, and for the first time in months you felt useful.', 'I joined a public works gang.', { money: itemCost(g, 'wage', 250), health: 2, discipline: 2, happiness: 1 }, 'good'),
      stay: (g, x) => say(g, x, 'Holding On', 'You stayed, picked up odd jobs, dug your neighbors’ gardens for a meal and looked after the younger ones. It wasn’t glamorous, and it wasn’t nothing.', 'I stayed home and scraped by during hard times.', { happiness: -2, karma: 2, rel: 0 }),
    },
  },

  {
    id: 'era.1900.relief',
    emoji: '🥫',
    title: 'The Relief Line',
    minAge: 18,
    maxAge: 70,
    cooldown: 6,
    weight: (g) => (poorFamily(g) ? 22 : 3),
    when: (g) => g.year >= 1930 && g.year <= 1939 && at(g, 'us', 'uk', 'dominion', 'europe', 'latam') && !g.character.job,
    setup: () => ({
      text: 'The pantry is bare and the rent is overdue. Outside the town hall there is a line for relief: a food parcel and a few coins for those with no other means. A proud person would rather starve, but a hungry one thinks about the children. What will you do?',
      choices: [ch('line', 'Swallow pride and join the line', '🥫'), ch('refuse', 'Refuse charity and scrape by', '🛑'), ch('neighbors', 'Help organize the neighbors', '🤝')],
    }),
    resolve: {
      line: (g, x) => say(g, x, 'Relief', 'You stood in line for two hours with your head high and your cap in your hand. The parcel was plain and the clerk was kind. It was the hardest and the easiest thing you did that year.', 'I joined the relief line.', { money: itemCost(g, 'wage', 100), happiness: -3, health: 2 }),
      refuse: (g, x) => say(g, x, 'Pride', 'You told yourself that you’d manage, and for a while you did. You ate less, wore your coat indoors and sold the clock. It was a grim winter, and your pride kept you warm for part of it.', 'I refused relief and scraped by.', { happiness: -5, health: -4, willpower: 3 }, 'bad'),
      neighbors: (g, x) => say(g, x, 'Mutual Aid', 'You knocked on doors and a dozen neighbors came to the church hall. A soup kitchen, a swap shop and a rota for childminding were born that week. Nobody got rich, but nobody went hungry either.', 'I helped neighbors organize mutual aid in hard times.', { karma: 8, happiness: 3, health: 1 }, 'good'),
    },
  },

  {
    id: 'era.1900.danceMarathon',
    emoji: '💃',
    title: 'The Dance Marathon',
    minAge: 16,
    maxAge: 35,
    once: true,
    weight: 14,
    when: (g) => g.year >= 1928 && g.year <= 1935 && at(g, 'us', 'uk', 'dominion'),
    setup: (g) => ({
      text: `A hall in town has announced a dance marathon: couples dance for as long as they can stand, with a prize of ${money(itemCost(g, 'wage', 300))} for the last pair on their feet. The meals are free. The crowds are enormous. What will you do?`,
      choices: [ch('enter', 'Enter with a partner', '💃'), ch('watch', 'Buy a ticket and watch', '👀'), ch('sell', 'Sell sandwiches to the crowd', '🥪')],
      data: { prize: itemCost(g, 'wage', 300) },
    }),
    resolve: {
      enter: (g, x) => {
        const stamina = (g.character.stats.health + g.character.hidden.athleticism) / 2
        const won = chance(g, 0.08 + stamina / 400)
        say(g, x, won ? 'Last Couple Standing' : 'Down for the Count', won ? 'After one hundred and sixty hours, with your head on your partner’s shoulder and your feet in knots, the last other couple collapsed. You took the prize with bandaged feet and a smile.' : 'You shuffled, swayed and slept on your feet, but after a day and a half your knees gave way. You collapsed with a free meal in your belly and a story in your pocket.', won ? 'I won a dance marathon.' : 'I danced in a marathon until I dropped.', { money: won ? x.n('prize') : 0, health: won ? -4 : -3, happiness: won ? 9 : 2, athleticism: 1 }, won ? 'good' : 'neutral')
      },
      watch: (g, x) => say(g, x, 'Spectator', 'You paid for a seat and watched the couples sway, swoon and sag. It was fascinating, a little sad and impossible to look away from.', 'I watched a dance marathon.', { money: -itemCost(g, 'movie'), happiness: 2 }),
      sell: (g, x) => say(g, x, 'Sandwich Business', 'You sold sandwiches and lemonade to a hungry, tired crowd, for pennies a piece and a dozen pieces to a customer. By the end of the week, your pocket was heavier than your feet.', 'I sold sandwiches at a dance marathon.', { money: itemCost(g, 'wage', 25), happiness: 3, smarts: 1 }, 'good'),
    },
  },

  {
    id: 'era.1900.accident',
    emoji: '⚙️',
    title: 'A Hand in the Works',
    minAge: 16,
    maxAge: 62,
    cooldown: 8,
    weight: (g) => (jobIsManual(g) ? 22 : 4),
    when: (g) => g.year >= 1900 && g.year <= 1945 && at(g, ...WESTERN, 'latam', 'brazil', 'japan', 'india') && !!g.character.job && g.character.job.category === 'fulltime',
    setup: (g) => ({
      text: jobIsManual(g)
        ? 'A machine with no guard on it caught your hand during a rush order. The cut is deep and the foreman is waving a rag and a cheery word. The shop steward is already looking at you and then at the foreman. What will you do?'
        : 'In the rush of a deadline, a heavy drawer of the old filing cabinet slammed shut on your hand. The bruise is deep and the office manager is waving a handkerchief and a cheery word. The clerks’ association representative is already looking at you and then at the manager. What will you do?',
      choices: [ch('union', 'Bring it up at the union meeting', '✊'), ch('quiet', 'Bind it up and work on', '🩹'), ch('settle', 'Take the foreman’s envelope', '✉️')],
    }),
    resolve: {
      union: (g, x) => {
        const win = chance(g, 0.65)
        say(g, x, win ? 'Guards Fitted' : 'Marked Man', win ? 'At the meeting a dozen others had stories like yours. The union made a case to the management, and by the end of the month there were guards on every machine and a small payment for your hand. It was a small win for a lot of people.' : 'At the meeting a dozen others had stories like yours, but the management would not budge. The foreman never forgot who started it, and you found yourself on the worst shifts.', win ? 'I raised a safety complaint through the union and won.' : 'I raised a safety complaint and the foreman never forgot it.', { money: win ? itemCost(g, 'wage', 60) : 0, health: -3, perf: win ? 4 : -8, karma: 4, happiness: win ? 5 : -3, condition: { name: 'Crushed Hand', kind: 'injury', severity: 20 } }, win ? 'good' : 'bad')
      },
      quiet: (g, x) => say(g, x, 'Working Through It', 'You wrapped the hand in a rag, finished the shift and went home with it throbbing. The wound healed badly, and the machine sat unguarded for the next person.', 'I worked through a hand injury at the factory.', { health: -5, perf: 2, happiness: -3, condition: { name: 'Crushed Hand', kind: 'injury', severity: 28 } }, 'bad'),
      settle: (g, x) => say(g, x, 'Hush Money', 'The foreman slipped a small envelope into your good hand and asked you to forget it. You did, mostly. You kept your job and the machine kept its teeth.', 'I took a small payout for a hand injury and said nothing.', { money: itemCost(g, 'wage', 25), health: -3, karma: -3, happiness: -1, condition: { name: 'Crushed Hand', kind: 'injury', severity: 22 } }, 'neutral'),
    },
  },

  {
    id: 'era.1900.companyStore',
    emoji: '🏭',
    title: 'The Company Store',
    minAge: 18,
    maxAge: 62,
    cooldown: 10,
    weight: (g) => (jobIsManual(g) ? 14 : 3),
    when: (g) => g.year >= 1900 && g.year <= 1945 && at(g, 'us', 'uk', 'dominion', 'latam', 'brazil', 'southafrica') && !!(g.character.job || g.character.partTimeJob),
    setup: () => ({
      text: 'Part of your pay comes in company scrip, and it spends only at the company store, where prices are higher than in town. The town is a long walk. The foreman says the store is a convenience. Everyone else says it is a trap. What will you do?',
      choices: [ch('store', 'Shop at the company store', '🏪'), ch('town', 'Walk to town on Saturdays', '🥾'), ch('complain', 'Complain to the foreman', '📢')],
    }),
    resolve: {
      store: (g, x) => say(g, x, 'On the Tab', 'It was easy and quick, and by the end of the month a good deal of your pay had gone round in a circle. The store clerk kept the book, and the book kept you.', 'I shopped at the company store and paid for the privilege.', { money: -itemCost(g, 'wage', 12), happiness: -1, perf: 1 }),
      town: (g, x) => say(g, x, 'The Long Walk', 'You walked six miles with a sack on your back to the town market. Your boots wore thin but the groceries cost two-thirds as much. The neighbors who didn’t think of it soon asked you for lifts.', 'I walked to town to shop rather than use the company store.', { money: itemCost(g, 'wage', 8), health: 1, happiness: 1, smarts: 1 }, 'good'),
      complain: (g, x) => {
        const heard = chance(g, 0.35)
        say(g, x, heard ? 'A Small Reform' : 'Noted', heard ? 'The foreman scratched his head and spoke to the manager. A month later the store dropped a few prices. Nobody thanked you, but everybody noticed.' : 'The foreman wrote your name in a little book. Nothing changed except the way he looked at you.', heard ? 'I complained about the company store and prices came down a little.' : 'I complained about the company store and the foreman noted my name.', { perf: heard ? 2 : -5, karma: 2, happiness: heard ? 3 : -2 }, heard ? 'good' : 'bad')
      },
    },
  },

  {
    id: 'era.1900.sewing',
    emoji: '🧵',
    title: 'A Sewing Machine on Payments',
    minAge: 18,
    maxAge: 60,
    once: true,
    weight: 14,
    when: (g) => g.year >= 1900 && g.year <= 1945 && at(g, ...WESTERN, 'latam', 'brazil', 'japan', 'india', 'indonesia') && g.character.money >= itemCost(g, 'wage', 30),
    setup: (g) => {
      const price = itemCost(g, 'wage', 100)
      return {
        text: `A traveling agent for a famous sewing machine company, Singer, is demonstrating the treadle model at the market. It costs ${money(price)} on payments. Everyone says a sewing machine pays for itself in a year, if you can get the work. What will you do?`,
        choices: [ch('buy', `Buy it on payments (${money(Math.round(price * 0.5))} down)`, '🧵'), ch('borrow', 'Borrow a neighbor’s machine instead', '🏘️'), ch('pass', 'Keep sewing by hand', '🪡')],
        data: { price },
      }
    },
    resolve: {
      buy: (g, x) => {
        const price = x.n('price')
        const orders = chance(g, 0.65 + g.character.stats.smarts / 400)
        say(g, x, orders ? 'Orders Come In' : 'Slow Season', orders ? 'The machine stitched like a dream. Within weeks you were hemming, patching and making curtains for half the street, and the payments were met with room to spare.' : 'The machine stitched like a dream, but orders were slower than promised and the payments were hard to meet. By the end of the year it more or less broke even.', orders ? 'I bought a sewing machine on payments and it paid for itself.' : 'My sewing machine barely broke even.', { money: orders ? Math.round(price * 0.5) : -Math.round(price * 0.2), happiness: orders ? 5 : -2, smarts: 1 }, orders ? 'good' : 'neutral')
      },
      borrow: (g, x) => say(g, x, 'Neighborly', 'You borrowed the neighbor’s machine on Tuesdays and paid her in apple pies. It was a happy arrangement, if a slow one.', 'I borrowed a neighbor’s sewing machine.', { karma: 2, happiness: 1 }),
      pass: (g, x) => say(g, x, 'By Hand', 'You kept stitching by hand in the evenings, and your fingers were calloused and your seams were perfect. There are worse ways to spend the evening.', 'I kept sewing by hand.', { smarts: 1, willpower: 1, happiness: 0 }),
    },
  },

  {
    id: 'era.1900.vacuum',
    emoji: '🧹',
    title: 'The Door-to-Door Salesman',
    minAge: 20,
    maxAge: 75,
    cooldown: 10,
    weight: 12,
    when: (g) => g.year >= 1908 && g.year <= 1945 && at(g, 'us', 'uk', 'dominion', 'europe') && g.character.residence.status !== 'homeless',
    setup: (g) => {
      const price = itemCost(g, 'wage', 80)
      return {
        text: `A neat young man in a suit is on your doorstep with a vacuum cleaner, a brand called Hoover, and a bag of dirt that he proposes to spill on your carpet. “Only ${money(Math.round(price / 10))} down, madam or sir, and the rest on easy terms!” What will you do?`,
        choices: [ch('buy', `Buy it on payments (${money(price)})`, '🧹'), ch('demo', 'Let him demonstrate, buy nothing', '🪣'), ch('door', 'Close the door politely', '🚪')],
        data: { price },
      }
    },
    resolve: {
      buy: (g, x) => say(g, x, 'Spotless', 'The machine roared like a lion and swallowed the dust of a decade. The whole family took turns, and the neighbors came to look at it. It was a bit of a luxury, but the house had never been cleaner.', 'I bought a vacuum cleaner on payments.', { money: -x.n('price'), happiness: 5, health: 1 }, 'good'),
      demo: (g, x) => say(g, x, 'Free Show', 'He spilled the dirt, ran the machine and the carpet came up bright, and then he went away disappointed. Your floor was cleaner than it had been in years, at no cost whatever, except to your conscience.', 'I let a salesman clean my carpet and bought nothing.', { karma: -2, happiness: 2 }),
      door: (g, x) => say(g, x, 'No, Thank You', 'You said no kindly, and he tipped his hat and left. Nothing was lost, and nothing was gained, but you did hear the sales pitch from the street, from the neighbor’s window.', 'I turned away a door-to-door salesman.', { karma: 1, happiness: 0 }),
    },
  },

  {
    id: 'era.1900.partyLine',
    emoji: '☎️',
    title: 'The Party Line',
    minAge: 10,
    maxAge: 70,
    cooldown: 8,
    weight: 14,
    when: (g) => g.year >= 1920 && g.year <= 1950 && at(g, 'us', 'dominion', 'uk', 'europe') && g.character.residence.status !== 'homeless',
    setup: () => ({
      text: 'Your household shares a telephone line with three neighbors, each with their own ring. Tonight, the ring that is not yours rings, and the receiver is right there on the hook. What will you do?',
      choices: [ch('listen', 'Pick up and listen in', '👂'), ch('ignore', 'Leave it alone', '🙊'), ch('join', 'Chime in with a joke', '🤭')],
    }),
    resolve: {
      listen: (g, x) => {
        const caught = chance(g, 0.4)
        say(g, x, caught ? 'Busted' : 'Juicy Gossip', caught ? 'You heard a delicious piece of news about the baker’s wife. Then a click, and a stern voice said, “I can hear you breathing.” By Sunday everyone knew who had been listening.' : 'You heard a delicious piece of news about the baker’s wife, and you kept it to yourself for exactly one day.', caught ? 'I got caught listening in on the party line.' : 'I listened in on the party line.', { karma: -3, happiness: caught ? -3 : 3 }, caught ? 'bad' : 'neutral')
      },
      ignore: (g, x) => say(g, x, 'Honor Among Neighbors', 'You let it ring and went on with your evening. Not everyone on the line was so good, but you knew you were.', 'I resisted the temptation to listen in on the party line.', { karma: 3, happiness: 1 }, 'good'),
      join: (g, x) => {
        const laughs = chance(g, 0.5)
        say(g, x, laughs ? 'Comic Relief' : 'Awkward Silence', laughs ? 'You cracked a joke into the receiver, and a stranger’s voice burst out laughing. It became the story of the street for a week.' : 'You cracked a joke into the receiver. There was a long, awkward silence, then a click. You decided to take up a quieter hobby.', laughs ? 'I joked on the party line and made the street laugh.' : 'I chimed in on the party line and it fell flat.', { happiness: laughs ? 4 : -2, karma: -1 }, laughs ? 'good' : 'bad')
      },
    },
  },

  {
    id: 'era.1900.victoryGarden',
    emoji: '🥕',
    title: 'Dig for Victory',
    minAge: 8,
    maxAge: 80,
    cooldown: 3,
    weight: 24,
    when: (g) => g.year >= 1940 && g.year <= 1945 && at(g, 'us', 'uk', 'dominion', 'europe') && g.character.residence.status !== 'homeless',
    setup: () => ({
      text: 'The newsreels, the posters and the neighbors all say the same thing: grow your own. The lawn out the back is the only patch of ground you have, and it has been beautifully kept. What will you do?',
      choices: [ch('dig', 'Dig up the lawn for vegetables', '🥕'), ch('share', 'Organize a street allotment', '🧑‍🌾'), ch('keep', 'Keep the lawn and buy rations', '🌳')],
    }),
    resolve: {
      dig: (g, x) => say(g, x, 'Carrots and Pride', 'You dug, planted and watered until your back creaked. By summer the lawn had become a leafy patch of beans, potatoes and onions, and the neighbors leaned over the fence to admire it. The vegetables tasted better than the shop-bought sort.', 'I dug up my lawn to grow vegetables for the war effort.', { health: 3, happiness: 4, karma: 2, money: itemCost(g, 'meal', 2) }, 'good'),
      share: (g, x) => say(g, x, 'Street Allotment', 'You talked six households into pooling their back gardens and sharing the tools. The result was a good harvest, a lot of gossip and a surprising number of new friendships.', 'I organized a street vegetable plot.', { karma: 6, happiness: 4, health: 2, smarts: 1 }, 'good'),
      keep: (g, x) => say(g, x, 'Grass Is Greener', 'You kept your lawn and your standing in the garden club, and paid a bit extra for vegetables. The neighbors did not say anything, but the bean rows next door were a quiet rebuke.', 'I kept my lawn through the war.', { happiness: -1, money: -itemCost(g, 'meal', 2), karma: -1 }),
    },
  },

  {
    id: 'era.1900.blackMarket',
    emoji: '🥩',
    title: 'The Ration Book',
    minAge: 18,
    maxAge: 80,
    cooldown: 4,
    weight: 24,
    when: (g) => rationed(g) && g.year <= 1953 && !g.character.prison,
    setup: (g) => {
      const price = itemCost(g, 'meal', 5)
      return {
        text: `The week’s rations are thin, and the family is hungry. A friend of a friend offers a joint of meat, no coupons, ${money(price)} cash, no questions. The inspectors are about. What will you do?`,
        choices: [ch('buy', `Buy from the black market (${money(price)})`, '🥩'), ch('make', 'Make do with the ration', '🥣'), ch('grow', 'Barter vegetables with the neighbors', '🥕')],
        data: { price },
      }
    },
    resolve: {
      buy: (g, x) => {
        const caught = chance(g, 0.2)
        say(g, x, caught ? 'Caught Red-Handed' : 'A Proper Meal', caught ? 'The inspector knocked on the door as the joint was resting on the table. A fine, a lecture and a hard look from the neighbors followed. It was the most expensive meal of your life.' : 'The joint arrived wrapped in newspaper and the family ate like kings. Nobody asked where it came from, and you didn’t say.', caught ? 'I was caught buying black-market meat.' : 'I bought black-market meat and the family feasted.', { money: -x.n('price') * (caught ? 3 : 1), happiness: caught ? -6 : 7, karma: -5, notoriety: caught ? 2 : 0 }, caught ? 'bad' : 'neutral')
      },
      make: (g, x) => say(g, x, 'Making Do', 'You boiled the bones twice and made a soup from the vegetables. It was thin and filling and nobody complained out loud.', 'I made do on the ration.', { health: -1, happiness: -1, karma: 2, willpower: 2 }),
      grow: (g, x) => say(g, x, 'Swap Shop', 'You swapped half a dozen onions for two eggs, a jar of jam for a pound of flour and a pair of socks for a bit of bacon. You found that a good deal of the neighborhood ran on favors.', 'I bartered vegetables for food during rationing.', { happiness: 3, karma: 2, health: 1, smarts: 1 }, 'good'),
    },
  },

  {
    id: 'era.1900.blackout',
    emoji: '🕯️',
    title: 'Put That Light Out!',
    minAge: 10,
    maxAge: 80,
    cooldown: 4,
    weight: 18,
    when: (g) => g.year >= 1939 && g.year <= 1945 && at(g, 'uk', 'dominion', 'europe', 'japan') && (homeFrontNow(g) || at(g, 'uk')),
    setup: () => ({
      text: 'The blackout is on and the street is as dark as a coal cellar. The warden is out in his tin hat checking every window, and your curtain has a gap. Tonight is your birthday, or someone’s, and a candle on the cake would be nice. What will you do?',
      choices: [ch('cover', 'Fix the curtain and light the candle', '🕯️'), ch('dark', 'Eat the cake in the dark', '🍰'), ch('warden', 'Volunteer to help the warden', '🧑‍🚒')],
    }),
    resolve: {
      cover: (g, x) => say(g, x, 'Tight Curtains', 'You pinned the curtain and put an extra blanket over the gap. The candle burned in a sealed room and the cake tasted all the better for it.', 'I celebrated behind blackout curtains.', { happiness: 4, rel: 0 }),
      dark: (g, x) => say(g, x, 'Cake in the Dark', 'You sang “Happy Birthday” in a whisper and ate the cake by feel. Somebody got the knife handle and somebody got the plate, but nobody got the candle in the ear, mostly.', 'I ate a birthday cake in the dark during the blackout.', { happiness: 3, karma: 1 }),
      warden: (g, x) => say(g, x, 'Little Helper', 'The warden gave you a whistle and a torch with a hooded beam and sent you up the street checking windows. You learned a lot about your neighbors’ curtains, and they learned a lot about you.', 'I helped the air-raid warden check blackout curtains.', { karma: 5, happiness: 3 }, 'good'),
    },
  },

  {
    id: 'era.1900.fair',
    emoji: '🎡',
    title: 'The World’s Fair',
    minAge: 6,
    maxAge: 80,
    once: true,
    weight: 40,
    when: (g) => fairFor(g) !== null,
    setup: (g) => {
      const fee = itemCost(g, 'wage', 6)
      return {
        text: `This year the whole country is talking about ${fairFor(g)}, with new inventions, foreign villages, giant machines and a wheel you can ride. Tickets are ${money(fee)} and the journey is a trip in itself. What will you do?`,
        choices: [ch('go', `Go to the fair (${money(fee)})`, '🎡'), ch('read', 'Read about it in the papers', '📰')],
        data: { fee },
      }
    },
    resolve: {
      go: (g, x) => say(g, x, 'The Wonder of It', pickLine(g, ['You walked for miles along avenues of white buildings and saw a machine that could add up a column of figures. You came home exhausted and full of ideas.', 'You rode the big wheel, ate a candy you had never heard of and watched a demonstration of a machine that could wash dishes. The future looked bright, and slightly noisy.']), 'I went to the world’s fair.', { money: -x.n('fee'), happiness: 8, smarts: 3 }, 'good'),
      read: (g, x) => say(g, x, 'Armchair Traveler', 'You read every word the papers printed about it and told your friends all the details. It was almost as good as going, you said, and nobody believed you.', 'I followed the world’s fair in the newspapers.', { happiness: 1, smarts: 2 }),
    },
  },

  {
    id: 'era.1900.neighborRent',
    emoji: '⌚',
    title: 'A Neighbor’s Watch',
    minAge: 18,
    maxAge: 75,
    cooldown: 8,
    weight: 16,
    when: (g) => g.year >= 1900 && g.year <= 1945 && at(g, 'us', 'uk', 'dominion', 'europe') && !g.character.prison,
    setup: (g) => {
      const need = itemCost(g, 'rent', 1)
      const choices = [ch('collect', 'Pass the hat among the neighbors', '🎩'), ch('decline', 'Say you are sorry but cannot help', '🙁')]
      if (g.character.money >= need * 2) choices.unshift(ch('lend', `Lend the rent (${money(need)})`, '🤝'))
      return {
        text: `A neighbor you like is a week short of the rent and the landlord is not a patient man. She holds out her father’s silver watch as security: “You would be doing me a kindness.” The landlord’s agent is on the stairs. What will you do?`,
        choices,
        data: { need },
      }
    },
    resolve: {
      lend: (g, x) => {
        const repaid = chance(g, 0.6)
        if (repaid) {
          say(g, x, 'Paid in Full', 'You counted the coins into her hand, took the watch and put it in a drawer. A year later she came to your door, paid back every penny with a little extra for the trouble and a plate of shortbread, and took the watch away.', 'I lent a neighbor the rent and she paid me back.', { money: -x.n('need') + Math.round(x.n('need') * 1.1), karma: 4, happiness: 3 }, 'good')
        } else {
          say(g, x, 'The Watch Stays', 'You counted the coins into her hand and put the watch in a drawer. She moved away at the end of the year, and the watch stayed. It is a fine watch, but you would have preferred to be paid.', 'I lent a neighbor the rent and she never paid me back.', { money: -x.n('need'), karma: 3, happiness: -1 }, 'neutral')
        }
      },
      collect: (g, x) => say(g, x, 'Passing the Hat', 'You went from door to door with your cap in your hand. A shilling here, a dime there, a promise of a week’s washing, and by evening the rent was met. The landlord’s agent went away, and the street had a little more to be proud of.', 'I collected the rent for a neighbor from the whole street.', { karma: 6, happiness: 4, smarts: 1 }, 'good'),
      decline: (g, x) => say(g, x, 'Closed Door', 'You said you were sorry, and meant it, and shut the door softly. You heard the bell of the pawnbroker’s next door ring twice that afternoon. You did not sleep well.', 'I turned down a neighbor who asked for help with the rent.', { karma: -2, happiness: -2 }, 'neutral'),
    },
  },
])
