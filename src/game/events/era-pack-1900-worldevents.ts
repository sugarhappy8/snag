// Era pack 1900-1945, popup events for the lives lived outside the industrial West: market day, the
// harvest, the village storyteller, the first bicycle, the picture hall and the mission school. Ids start
// with 'era.1900.'; they fit India and its neighbors, China, Japan, Southeast Asia, Africa, the Middle
// East and Latin America, and never an iceman or a drive-in.
import { chance } from '../rng'
import type { GameState } from '../types'
import { ch, defineEvents, money, say } from './helpers'
import { at, type Place } from './era-pack-where'
import { householdMoney, itemCost, minor } from './era-pack-kit'

const FAR: readonly Place[] = ['india', 'china', 'japan', 'indonesia', 'seasia', 'easia', 'nigeria', 'southafrica', 'mena', 'brazil', 'latam', 'other']

function far(g: GameState): boolean {
  return at(g, ...FAR)
}

function inSchool(g: GameState): boolean {
  const cur = g.character.education.current
  return !!cur && (cur.level === 'elementary' || cur.level === 'middle' || cur.level === 'high')
}

/** The language the mission schools of the place taught beside the Bible (Dutch in the East Indies, English elsewhere). */
function missionTongue(g: GameState): string {
  return at(g, 'indonesia') ? 'Dutch' : 'English'
}

export const WORLD_EVENTS_1900 = defineEvents([
  {
    id: 'era.1900.marketDay',
    emoji: '🧺',
    title: 'Market Day',
    minAge: 8,
    maxAge: 70,
    cooldown: 4,
    weight: 22,
    when: (g) => g.year >= 1900 && g.year <= 1979 && far(g) && !g.character.prison,
    setup: (g) => {
      const goods = itemCost(g, 'wage', 8)
      return {
        text: 'It is market day, and for miles around people have walked in with baskets, cloth, chickens, pots and gossip. The square is a roar of voices, smells and bargaining, and everything has a price that is open to argument. What will you do?',
        choices: [ch('sell', 'Set out your family’s goods to sell', '🧺'), ch('haggle', 'Haggle for something you want', '🗣️'), ch('wander', 'Wander the stalls and take it all in', '👀')],
        data: { goods },
      }
    },
    resolve: {
      sell: (g, x) => {
        const good = chance(g, 0.35 + g.character.stats.smarts / 250)
        say(g, x, good ? 'A Good Day’s Trade' : 'Slow Sales', good ? 'You called your wares in a clear voice, pitched your price a little high and came down just far enough. By afternoon the baskets were empty and your purse was heavy with coins. Your family was proud.' : 'You called your wares, but the next stall had the same goods for a little less. By closing time you had sold half and given away a little. You took the rest home for supper.', good ? 'I sold the family’s goods at market and did well.' : 'Market day was slow for my family’s stall.', { money: good ? x.n('goods') : Math.round(x.n('goods') * 0.35), happiness: good ? 5 : -1, smarts: 1 }, good ? 'good' : 'neutral')
      },
      haggle: (g, x) => {
        const win = chance(g, 0.4 + g.character.stats.smarts / 300)
        say(g, x, win ? 'A Bargain!' : 'Fleeced', win ? 'You pointed out the flaw, sighed, walked away and came back, and the seller finally gave in. It was a fine bargain and a great performance, and you walked home pleased as a lord.' : 'You argued, sighed and walked away, but the seller did not call you back. You returned and paid more than you had started with. A lesson in negotiation, and in pride.', win ? 'I won a hard bargain at market.' : 'I lost a haggling contest at market.', { money: win ? x.n('goods') * 0.2 : -x.n('goods') * 0.1, happiness: win ? 5 : -2, smarts: 1 }, win ? 'good' : 'neutral')
      },
      wander: (g, x) => say(g, x, 'Everything at Once', 'You wandered through the lanes of the market watching a juggler, a letter-writer at his table, a man selling medicine from a cart and a boy leading a camel, a goat or a donkey, depending where you are. You came home with sticky fingers and a head full of faces.', 'I wandered through the market and took it all in.', { happiness: 5, smarts: 1 }, 'good'),
    },
  },

  {
    id: 'era.1900.harvest',
    emoji: '🌾',
    title: 'Harvest Time',
    minAge: 9,
    maxAge: 60,
    cooldown: 5,
    weight: 22,
    when: (g) => g.year >= 1900 && g.year <= 1975 && far(g) && !g.character.prison && g.character.residence.status !== 'homeless',
    setup: (g) => {
      const kid = minor(g)
      return {
        text: `The harvest has come in all at once, and every pair of hands is needed in the fields from dawn to dark.${kid ? ' School has emptied, because the children are in the fields too.' : ''} The weather is turning and there is no time to lose. What will you do?`,
        choices: [ch('work', 'Work the fields all week', '🌾'), ch('half', 'Work mornings, rest afternoons', '⏳'), ch('pay', 'Hire others and keep to your own work', '💰')],
        data: { pay: itemCost(g, 'wage', 40) },
      }
    },
    resolve: {
      work: (g, x) => say(g, x, 'Every Hand', 'You cut, bundled and carried until your back wept and your palms blistered. When the last sheaf was in, the whole village feasted on the threshing floor and you slept where you sat. It was the hardest and happiest week of the year.', 'I worked the fields all week at the harvest.', { health: -2, happiness: 5, karma: 3, willpower: 2, athleticism: 1, money: Math.round(x.n('pay') * 0.4) }, 'good'),
      half: (g, x) => say(g, x, 'Pacing', 'You worked mornings and rested in the heat of the day. The elders grumbled that you were slow, but your back survived the week and the work still got done.', 'I paced myself through the harvest.', { health: 1, happiness: 1, money: Math.round(x.n('pay') * 0.2) }),
      pay: (g, x) => {
        const afford = g.character.money >= x.n('pay') || householdMoney(g) >= x.n('pay') * 2
        say(g, x, afford ? 'Hired Hands' : 'Not Enough Coin', afford ? 'You paid neighbors to bring in your share while you kept to your own work. It was efficient and no one thought less of you. A few muttered, but a few always do.' : 'You meant to hire help, but there was not enough coin and you ended up in the fields after all, behind schedule, with everyone else.', afford ? 'I paid for help at harvest time.' : 'I couldn’t afford help at harvest and worked the fields myself.', { money: afford ? -Math.min(g.character.money, x.n('pay')) : 0, happiness: afford ? 0 : -2, health: afford ? 0 : -2 }, afford ? 'neutral' : 'bad')
      },
    },
  },

  {
    id: 'era.1900.storyteller',
    emoji: '🔥',
    title: 'Stories at Dusk',
    minAge: 5,
    maxAge: 15,
    cooldown: 3,
    weight: 16,
    when: (g) => g.year >= 1900 && g.year <= 1965 && far(g) && !g.character.prison,
    setup: () => ({
      text: 'After the evening meal, the elders gather under the tree with the children at their feet. Tonight the oldest storyteller begins a tale that has been told for a hundred years: kings, tricksters, animals that talk and a moral at the end. The lamp is low. What will you do?',
      choices: [ch('listen', 'Listen with all your attention', '👂'), ch('ask', 'Ask a question in the middle', '🙋'), ch('doze', 'Curl up and doze off', '😴')],
    }),
    resolve: {
      listen: (g, x) => say(g, x, 'The Whole Tale', 'You kept still and let the story fill the dark. Years later you could recite the trickster’s riddle and the old man’s last line word for word, and you told it to your own children.', 'I listened to the elders’ stories under the tree.', { smarts: 2, happiness: 4, karma: 2 }, 'good'),
      ask: (g, x) => {
        const delighted = chance(g, 0.6)
        say(g, x, delighted ? 'A Good Question' : 'Quiet, Child', delighted ? 'The storyteller stopped, smiled and said it was the best question he had heard in years, then made up an entire new episode to answer it. The other children looked at you with envy.' : 'The storyteller raised an eyebrow and an elder said “Quiet, child.” You sank down and listened, red-faced, but a cousin squeezed your hand when no one was looking.', delighted ? 'The village storyteller praised a question I asked.' : 'I was hushed for interrupting the storyteller.', { smarts: delighted ? 3 : 0, happiness: delighted ? 5 : -2 }, delighted ? 'good' : 'neutral')
      },
      doze: (g, x) => say(g, x, 'Sleepy Head', 'You were carried home asleep on an uncle’s shoulder, and you dreamed the tale in a different ending. In the morning you asked what had happened, and everyone laughed.', 'I fell asleep during the village storytelling.', { happiness: 2, health: 1 }),
    },
  },

  {
    id: 'era.1900.bicycle',
    emoji: '🚲',
    title: 'The First Bicycle',
    minAge: 8,
    maxAge: 50,
    once: true,
    weight: 24,
    when: (g) => g.year >= 1915 && g.year <= 1975 && far(g),
    setup: (g) => {
      const cost = itemCost(g, 'wage', 120)
      const choices = [ch('borrow', 'Borrow a neighbor’s bicycle', '🤝'), ch('walk', 'Keep walking for now', '🥾')]
      if (g.character.age >= 16 && g.character.money >= cost) choices.unshift(ch('buy', `Buy one for yourself (${money(cost)})`, '🚲'))
      return {
        text: 'The first bicycles have come to the district, and every child runs after them. A shopkeeper has one, the schoolteacher has one, and a young man in the next village rides to work on his. It is quicker than walking and it looks like flying. What will you do?',
        choices,
        data: { cost },
      }
    },
    resolve: {
      buy: (g, x) => say(g, x, 'Wheels!', 'You rode the bicycle home along the dirt road, bell ringing, to a roar from the whole street. You could reach the market in half the time and the next town by lunch. It changed the shape of your world.', 'I bought my first bicycle.', { money: -x.n('cost'), happiness: 9, athleticism: 2 }, 'good'),
      borrow: (g, x) => {
        const fall = chance(g, 0.4)
        say(g, x, fall ? 'Crash!' : 'Wobbling', fall ? 'You pushed off with a crowd of children shouting advice and wobbled straight into a hedge. The neighbor laughed, the bicycle survived and after a skinned knee you tried again and rode three whole houses.' : 'You pushed off with a crowd of children shouting advice, and wobbled, wobbled and then rode a hundred yards in a straight line. The whole street clapped as you stopped.', fall ? 'I fell off a borrowed bicycle on my first try.' : 'I rode a bicycle for the first time.', { health: fall ? -1 : 0, happiness: fall ? 2 : 6, athleticism: 1 }, 'good')
      },
      walk: (g, x) => say(g, x, 'Shoe Leather', 'You kept walking: the road was long but your legs grew strong. The bicycle would come to you in time, like everything else.', 'I kept walking while the bicycles arrived.', { health: 1, athleticism: 1, happiness: 0 }),
    },
  },

  {
    id: 'era.1900.pictureHall',
    emoji: '🎬',
    title: 'Night at the Picture Hall',
    minAge: 7,
    maxAge: 70,
    cooldown: 4,
    weight: 24,
    when: (g) => g.year >= 1930 && g.year <= 1979 && far(g) && !g.character.prison,
    setup: (g) => {
      const fee = Math.max(1, itemCost(g, 'movie'))
      return {
        text: `A new picture hall has opened and tonight it is showing the film everyone is talking about: songs, romance and a villain who gets what he deserves. The cheap seats are ${money(fee)}. The hall will be packed, loud and happy. What will you do?`,
        choices: [ch('go', `Go with friends (${money(fee)})`, '🎟️'), ch('family', 'Take the whole family', '👨‍👩‍👧'), ch('sing', 'Skip it and sing the songs at home', '🎶')],
        data: { fee },
      }
    },
    resolve: {
      go: (g, x) => say(g, x, 'Cheap Seats', 'The hall was packed, the projector rattled and the whole audience cheered the hero and booed the villain. When the song began, half the hall sang along. You walked home humming and acting out the fight.', 'I went to the picture hall with my friends.', { money: -x.n('fee'), happiness: 7 }, 'good'),
      family: (g, x) => say(g, x, 'A Family Night Out', 'You paid for the whole family, which cost several evenings’ wages, and you didn’t regret it for a moment. The grandmother wept at the sad part and the little ones fell asleep before the end.', 'I took my whole family to the picture hall.', { money: -x.n('fee') * 3, happiness: 6, karma: 2 }, 'good'),
      sing: (g, x) => say(g, x, 'Second-hand Songs', 'You learned the songs from a friend who had been, and sang them at the well all week. It wasn’t the same as seeing the film, but nobody could tell the difference from the tune.', 'I learned the film songs from a friend and sang them all week.', { happiness: 3, smarts: 1 }),
    },
  },

  {
    id: 'era.1900.missionSchool',
    emoji: '🏫',
    title: 'A Place at the Mission School',
    minAge: 8,
    maxAge: 15,
    once: true,
    weight: (g) => (g.character.stats.smarts >= 55 ? 30 : 8),
    when: (g) => g.year >= 1900 && g.year <= 1955 && at(g, 'nigeria', 'southafrica', 'india', 'indonesia', 'seasia', 'china') && inSchool(g),
    setup: (g) => ({
      text: `The teacher from the big mission school in town has visited your village school and singled you out. There is a free place for a clever child: brick classrooms, a library of forty books, ${missionTongue(g)} lessons and the Bible every morning, in return for chores and a promise to work hard. It is a long way from home, and the family needs a pair of hands. What will you do?`,
      choices: [ch('accept', 'Accept the place and board in town', '📖'), ch('half', 'Go in the mornings and work in the afternoons', '⚖️'), ch('decline', 'Stay at the village school and help at home', '🏡')],
    }),
    resolve: {
      accept: (g, x) => say(g, x, 'Letters and Hymns', `You packed a bundle and walked to town beside the teacher. You learned your ${missionTongue(g)} from a slate, sang hymns in a language you hardly knew and stumbled through your first ${missionTongue(g)} sentence. The first book you read all by yourself changed the way you looked at the world.`, 'I took a place at the mission school in town.', { smarts: 4, happiness: 2, grades: 6, willpower: 1 }, 'good'),
      half: (g, x) => say(g, x, 'Both Worlds', 'You went to class in the mornings and worked in the afternoons. The teacher noticed your tired eyes, your family noticed your new words and you learned two lessons: one in school and one outside it.', 'I split my days between the mission school and work at home.', { smarts: 2, health: -1, happiness: 2, willpower: 2, grades: 3 }, 'good'),
      decline: (g, x) => say(g, x, 'Needed at Home', 'You stayed, because the family needed you. You watched the other children go off with their bundles, and you made up your mind that your own children would go to school.', 'I stayed at home to help the family rather than go to the mission school.', { happiness: -2, karma: 2, willpower: 1 }),
    },
  },
])

