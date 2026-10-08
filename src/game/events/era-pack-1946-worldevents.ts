// Era pack 1946-1979, popup events for the lives lived outside the industrial West: the road and the
// power line reaching the village, leaving for the city, the festival year, and the entrance exam that
// sorts a child's future. Ids start with 'era.1946.'; they fit India and its neighbors, China, Japan,
// Korea, Southeast Asia, Africa, the Middle East and Latin America.
import { chance } from '../rng'
import type { GameState } from '../types'
import { ch, defineEvents, money, say, type Ctx, type Fx } from './helpers'
import { at, type Place } from './era-pack-where'
import { householdMoney, itemCost } from './era-pack-kit'

const FAR: readonly Place[] = ['india', 'china', 'japan', 'indonesia', 'seasia', 'easia', 'nigeria', 'southafrica', 'mena', 'brazil', 'latam', 'other']

function far(g: GameState): boolean {
  return at(g, ...FAR)
}

function inSchool(g: GameState): boolean {
  const cur = g.character.education.current
  return !!cur && (cur.level === 'elementary' || cur.level === 'middle' || cur.level === 'high')
}

function examOutcome(g: GameState, x: Ctx, bonus: number, intro: string, fx: Fx): void {
  const pass = chance(g, Math.max(0.05, Math.min(0.92, 0.2 + g.character.stats.smarts / 130 + bonus)))
  const text = `${intro} ${pass ? 'When the results were pinned to the school gate, the crowd of parents parted and your name was near the top. Your mother put her hand over her mouth and your father pretended he had something in his eye.' : 'When the results were pinned to the school gate, you read the list twice from top to bottom. Your name was not among the names. Your parents said that there is always another road, though their faces said it was a narrow one.'}`.trim()
  say(g, x, pass ? 'You Passed!' : 'Not This Year', text, pass ? 'I passed the entrance examination.' : 'I did not pass the entrance examination.', { ...fx, happiness: (fx.happiness ?? 0) + (pass ? 10 : -5), smarts: (fx.smarts ?? 0) + (pass ? 2 : 0), grades: pass ? 5 : -2 }, pass ? 'good' : 'neutral')
}

export const WORLD_EVENTS_1946 = defineEvents([
  {
    id: 'era.1946.examDay',
    emoji: '📝',
    title: 'The Entrance Examination',
    minAge: 11,
    maxAge: 16,
    once: true,
    weight: 70,
    when: (g) => g.year >= 1946 && g.year <= 1979 && at(g, 'india', 'china', 'japan', 'easia', 'nigeria', 'indonesia', 'seasia', 'mena', 'brazil') && inSchool(g),
    setup: (g) => ({
      text: 'The whole district talks of nothing else: the examination that decides who goes on to the good secondary school and who leaves the classroom for good. Only one place in five is open. Neighbors compare mark sheets, and the teacher has put your name down. What will you do?',
      choices: [ch('study', 'Study every evening by lamplight', '🕯️'), ch('tuition', 'Ask the family for private tuition', '👩‍🏫'), ch('calm', 'Stay calm and trust your lessons', '😌')],
      data: { cost: itemCost(g, 'wage', 60) },
    }),
    resolve: {
      study: (g, x) => examOutcome(g, x, 0.12, 'You studied each evening under the one lamp the household could spare, with the mark sheet from last year pinned to the wall and your younger brothers asleep around you.', { happiness: -3, smarts: 1, willpower: 2 }),
      tuition: (g, x) => {
        if (householdMoney(g) < x.n('cost') * 4) {
          examOutcome(g, x, 0.05, 'The family counted what was in the tin and found nothing over for a tutor. A cousin who had passed the year before lent you his notes instead.', {})
          return
        }
        examOutcome(g, x, 0.18, 'A tutor came to the house in the evenings, drilling you on the sums and the compositions that the examiners loved. It was expensive, and your family made a lot of sacrifices.', { smarts: 2 })
      },
      calm: (g, x) => examOutcome(g, x, -0.05, 'You told yourself that it was only a test and went to fly kites with your friends. Your mother watched you from the doorway with a look you remember.', { happiness: 2 }),
    },
  },

  {
    id: 'era.1946.newRoad',
    emoji: '🛣️',
    title: 'The Road Comes to the Village',
    minAge: 10,
    maxAge: 80,
    once: true,
    weight: 22,
    when: (g) => g.year >= 1950 && g.year <= 1979 && far(g) && !g.character.prison,
    setup: (g) => ({
      text: 'For months, trucks, surveyors and men with red flags have been working outside the village. Now the road is finished, black and straight, and the first bus has stopped at the crossroads. A power line is promised next. Everything is about to change, and nobody quite agrees whether for the better. What will you do?',
      choices: [ch('stall', 'Set up a stall by the bus stop', '🧃'), ch('ride', 'Take the first bus to the market town', '🚌'), ch('watch', 'Watch from the roadside and wait', '👀')],
      data: { stock: itemCost(g, 'wage', 10) },
    }),
    resolve: {
      stall: (g, x) => {
        const good = chance(g, 0.55 + g.character.stats.smarts / 400)
        say(g, x, good ? 'Business at the Crossroads' : 'Few Passengers', good ? 'You set up a table with tea, fried snacks and fruit, and the bus came, and then another. By evening you had sold out twice. People started calling the crossroads by your name.' : 'You set up a table with tea, fried snacks and fruit, but the bus was late and half empty. You ate most of the stock yourself, and tried again the next week with better luck.', good ? 'I opened a stall at the new bus stop and did well.' : 'My stall at the new bus stop had few customers at first.', { money: good ? x.n('stock') * 2 : -Math.round(x.n('stock') * 0.3), happiness: good ? 7 : -1, smarts: 1 }, good ? 'good' : 'neutral')
      },
      ride: (g, x) => say(g, x, 'Windows and Wheels', 'The bus lurched along the new road with forty people and a goat. Through the window, the fields, the river and the next village slid by faster than you had ever seen them. At the market town, you gaped at the shops and found your world was larger than you thought.', 'I took the first bus along the new road to the market town.', { money: -itemCost(g, 'transit', 2), happiness: 6, smarts: 2 }, 'good'),
      watch: (g, x) => say(g, x, 'The Old Quiet', 'You stood by the roadside and watched the dust settle. Some neighbors cheered and some shook their heads, and one old man said that the road goes both ways. You thought about it for years.', 'I watched the new road arrive in our village.', { happiness: 1, smarts: 1 }),
    },
  },

  {
    id: 'era.1946.leaveForCity',
    emoji: '🏙️',
    title: 'The Train to the City',
    minAge: 16,
    maxAge: 38,
    once: true,
    weight: 20,
    when: (g) => g.year >= 1946 && g.year <= 1979 && at(g, 'india', 'china', 'indonesia', 'seasia', 'easia', 'nigeria', 'southafrica', 'mena', 'brazil', 'latam', 'japan') && g.character.residence.status !== 'owned',
    setup: (g) => ({
      text: 'Letters from cousins in the city tell of factories hiring, shops open until midnight, cinemas and a wage packet every week. The village is quiet, the land is divided too finely and your family will miss another pair of hands. A train leaves tomorrow. What will you do?',
      choices: [ch('go', 'Take the train to the city', '🚂'), ch('send', 'Send a younger sibling instead', '🧒'), ch('stay', 'Stay and work the land', '🌾')],
      data: { fare: itemCost(g, 'transit', 6), pay: itemCost(g, 'wage', 120) },
    }),
    resolve: {
      go: (g, x) => {
        const found = chance(g, 0.7)
        say(g, x, found ? 'Big City, Small Room' : 'Hard Landing', found ? 'You shared a rented room with five other young men or women and found a job within the week. The work was tiring and the noise unending. You sent money home every month, and learned a new way of speaking, walking and thinking.' : 'You stood on the platform with a bundle and an address that turned out to be wrong. It took three weeks and the kindness of strangers to find work. You wrote home that things were fine, which was not entirely true.', found ? 'I left the village for the city and found work.' : 'I went to the city and found it hard at first.', { money: found ? x.n('pay') - x.n('fare') : -x.n('fare'), happiness: found ? 4 : -4, smarts: 2, willpower: 2, rel: 0 }, found ? 'good' : 'bad')
      },
      send: (g, x) => say(g, x, 'The Family’s Choice', 'You packed your younger sibling’s bag and gave them the address and half of your own savings. Letters came back every month and a little money, and a photograph in front of a shop window. You were proud, and you missed them terribly.', 'I sent a younger sibling to the city to find work.', { karma: 3, happiness: 1, money: -itemCost(g, 'wage', 10) }),
      stay: (g, x) => say(g, x, 'Rooted', 'You stayed, and your hands learned the soil as your father’s had. It wasn’t the future you had pictured as a child, but the harvest suppers were good and everyone knew your name.', 'I stayed in the village and worked the land.', { happiness: 1, health: 1, karma: 2 }),
    },
  },

  {
    id: 'era.1946.festivalYear',
    emoji: '🏮',
    title: 'The Great Festival',
    minAge: 6,
    maxAge: 90,
    cooldown: 4,
    weight: 20,
    when: (g) => g.year >= 1946 && g.year <= 1979 && at(g, 'india', 'china', 'japan', 'easia', 'indonesia', 'seasia', 'mena', 'nigeria') && !g.character.prison,
    setup: (g) => {
      const feast = itemCost(g, 'wage', 12)
      return {
        text: `The biggest festival of the year is here, with new clothes, relatives arriving from all over, sweets in the kitchen and lamps, lanterns or fireworks in the street. A feast costs money, and not everyone can afford the same. What will you do?`,
        choices: [ch('feast', `Host a big feast (${money(feast)})`, '🍲'), ch('modest', 'Keep it modest and simple', '🕯️'), ch('share', 'Share with neighbors who have little', '🤲')],
        data: { feast },
      }
    },
    resolve: {
      feast: (g, x) => {
        const afford = g.character.money >= x.n('feast')
        say(g, x, afford ? 'Table for Thirty' : 'Too Ambitious', afford ? 'The kitchen smelled of spice and sugar for three days. Cousins filled the house, the old people told stories and the children ran about in new clothes. It cost a lot, and everyone said it was worth every bit.' : 'You planned a grand feast and then counted the money. In the end it was a smaller feast than you had imagined, with more laughter than food, and no one minded at all.', afford ? 'I hosted a big festival feast.' : 'My festival feast turned out smaller than planned.', { money: afford ? -x.n('feast') : -Math.round(g.character.money * 0.2), happiness: afford ? 8 : 3, karma: 2 }, 'good')
      },
      modest: (g, x) => say(g, x, 'Simple Joys', 'A few lamps, a plain meal and the family around you: it was enough. In the evening you sat on the step and watched the neighbors’ lights go on, one by one.', 'I kept the festival modest and simple.', { happiness: 4, karma: 1 }),
      share: (g, x) => say(g, x, 'The Open Door', 'You carried plates of food to the households that had little and sat with a widow who had no one. She told you stories about festivals long ago. It was the best festival you remember.', 'I shared my festival meal with neighbors who had little.', { money: -Math.round(x.n('feast') * 0.4), karma: 8, happiness: 6 }, 'good'),
    },
  },
])
