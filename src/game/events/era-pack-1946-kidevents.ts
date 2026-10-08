// Era pack 1946-1979, popup events for childhood and youth: the first television on the street, the
// polio summer and the vaccine, duck-and-cover, the eleven-plus, the drive-in and the sock hop,
// going steady, rock 'n' roll against the parents, the transistor under the pillow, a pop craze,
// hand-me-downs and the Sunday roast. Ids start with 'era.1946.'.
import { contractCondition } from '../health'
import { techOdds } from '../history/timeline'
import { medicalYear } from '../history/events-medicine'
import { chance } from '../rng'
import type { GameState } from '../types'
import { aParent, ch, defineEvents, money, say, siblings, type Ctx, type Fx } from './helpers'
import { at, richFamily } from './era-pack-where'
import { householdMoney, itemCost, minor, parentWord } from './era-pack-kit'

const WESTERN = ['us', 'uk', 'dominion', 'europe'] as const

function inSchool(g: GameState): boolean {
  const cur = g.character.education.current
  return !!cur && (cur.level === 'elementary' || cur.level === 'middle' || cur.level === 'high')
}

export const KID_EVENTS_1946 = defineEvents([
  {
    id: 'era.1946.firstTV',
    emoji: '📺',
    title: 'The First Television on the Street',
    minAge: 4,
    maxAge: 80,
    once: true,
    weight: 30,
    when: (g) => g.year >= 1947 && g.year <= 1976 && techOdds(g, 'tv') >= 0.03 && techOdds(g, 'tv') <= 0.55,
    setup: (g) => {
      const cost = itemCost(g, g.year < 1972 ? 'tubeset' : 'tv')
      const adult = !minor(g)
      const choices = [ch('neighbor', 'Squeeze into the neighbor’s living room', '🛋️')]
      if (adult && cost > 0 && g.character.money >= cost) choices.push(ch('buy', `Buy a set of your own (${money(cost)})`, '📺'))
      if (!adult) choices.push(ch('beg', 'Beg the family for a set', '🙏'))
      choices.push(ch('window', 'Watch through the shop window', '🪟'))
      return {
        text: 'Aerials are sprouting from the rooftops like iron daisies, and tonight a neighbor has promised that the whole street can watch the great event of the week on their new television. The picture is gray, small and wonderful. What will you do?',
        choices,
        data: { cost },
      }
    },
    resolve: {
      neighbor: (g, x) => say(g, x, 'Standing Room Only', 'Thirty people crowded into a living room meant for six. Children sat on the floor, adults on the arms of the sofa, the host on a kitchen chair beside the set with her hand on the dial. The picture flickered and every eye was glued to it. Nobody remembers who won; everybody remembers the evening.', 'I watched television for the first time in a neighbor’s crowded living room.', { happiness: 7, smarts: 1 }, 'good'),
      buy: (g, x) => say(g, x, 'A Set of Our Own', 'The delivery men carried the big wooden cabinet into the front room, a man climbed onto the roof to fit the aerial and the whole family stood in a row to watch the screen light up. The neighbors started dropping by in the evening. It was the new center of the household.', 'I bought our first television set.', { money: -x.n('cost'), happiness: 9, smarts: 1 }, 'good'),
      beg: (g, x) => {
        const cost = x.n('cost')
        const yes = cost > 0 && householdMoney(g) >= cost * 3 && chance(g, 0.5)
        say(g, x, yes ? 'The Big Box' : 'Maybe Next Year', yes ? 'You nagged, you hinted, you promised to be good. One Saturday a van pulled up and men carried in the biggest box you had ever seen. The family sat in front of it in silence for the whole evening, like worshippers.' : 'You nagged, you hinted, you promised to be good, but money was tight and the answer was “maybe next year.” You went to the neighbor’s house instead and sat politely on the floor.', yes ? 'My family bought our first television.' : 'My family couldn’t yet afford a television.', { happiness: yes ? 9 : -2, rel: yes ? 2 : -1 }, yes ? 'good' : 'neutral')
      },
      window: (g, x) => say(g, x, 'Window Shopping', 'A crowd had gathered outside the appliance shop, and the owner turned a set to face the glass in the evening. You stood on the pavement with a hundred strangers, in a drizzle, and watched a tiny man read the news with no sound. It was magic anyway.', 'I watched television through a shop window with a crowd of strangers.', { happiness: 4, health: -1 }),
    },
  },

  {
    id: 'era.1946.polioSummer',
    emoji: '🏊',
    title: 'The Polio Summer',
    minAge: 2,
    maxAge: 20,
    cooldown: 3,
    weight: 24,
    when: (g) => g.year >= 1946 && g.year <= 1961 && at(g, ...WESTERN, 'dominion', 'japan', 'latam', 'brazil') && medicalYear(g.character.countryId, g.year) < 1962 && g.flags['history.polioVaccinated'] !== true,
    setup: () => ({
      text: 'It is the polio season. The public swimming pool has been closed, the cinema is half empty and every parent in the neighborhood has a haunted look. A child on the next street has been taken to hospital. It is a hot day and the other kids are heading to the river. What will you do?',
      choices: [ch('stay', 'Stay home and keep away from crowds', '🏠'), ch('river', 'Go to the river with everyone', '🏊'), ch('wash', 'Go out but wash up and keep clear of crowds', '🧼')],
    }),
    resolve: {
      stay: (g, x) => {
        const sick = chance(g, 0.01)
        if (sick) contractCondition(g, 'Polio', { diagnosed: true, quiet: true })
        say(g, x, sick ? 'Unlucky' : 'A Long Dull Summer', sick ? 'You stayed at home and did everything right, and still fell ill with a stiff neck and a fever. The doctor spoke softly to your parents. It was nobody’s fault.' : 'You stayed home, read every book in the house and counted the days until the first frost. It was the dullest summer of your life, and you stayed well, as did everyone in your house.', sick ? 'I fell ill with polio despite staying home all summer.' : 'I stayed home through the polio summer.', { happiness: sick ? -8 : -3, smarts: sick ? 0 : 2 }, sick ? 'bad' : 'neutral')
      },
      river: (g, x) => {
        const sick = chance(g, 0.04)
        if (sick) contractCondition(g, 'Polio', { diagnosed: true, quiet: true })
        say(g, x, sick ? 'The Fever' : 'A Perfect Day', sick ? 'You spent the afternoon splashing in the river with the others, and a week later you woke with a fever, aching legs and a stiff neck. Your mother wept in the kitchen. The doctor said it would be a long road.' : 'You spent the afternoon splashing in the river with the others, with your parents’ disapproval ringing in your ears. It was a perfect day, and you were lucky.', sick ? 'I caught polio after a day at the river.' : 'I went to the river during the polio summer and was lucky.', { happiness: sick ? -10 : 5, karma: 0 }, sick ? 'bad' : 'good')
      },
      wash: (g, x) => {
        const sick = chance(g, 0.02)
        if (sick) contractCondition(g, 'Polio', { diagnosed: true, quiet: true })
        say(g, x, sick ? 'Caught Anyway' : 'Careful', sick ? 'You were careful, washed your hands, avoided the crowds and came down with a fever all the same. Nobody knew how it spread, and nobody could say why you.' : 'You washed your hands a dozen times a day, avoided the pool and the cinema and stayed out in the open air. The summer ended and you were well. It felt like a victory.', sick ? 'I caught polio despite every precaution.' : 'I took care through the polio summer and stayed well.', { happiness: sick ? -9 : 1, health: sick ? 0 : 1 }, sick ? 'bad' : 'good')
      },
    },
  },

  {
    id: 'era.1946.vaccineDay',
    emoji: '💉',
    title: 'The Vaccine Line',
    minAge: 3,
    maxAge: 18,
    once: true,
    weight: 40,
    when: (g) => g.year >= 1955 && g.year <= 1965 && at(g, ...WESTERN, 'dominion', 'japan', 'latam', 'brazil') && g.flags['history.polioVaccinated'] !== true && medicalYear(g.character.countryId, g.year) >= 1955,
    setup: () => ({
      text: 'The new polio vaccine has come to your school, and the whole class is lined up in the corridor to get it. The teacher is calm, the nurse is brisk and one boy at the front has fainted already. Your turn is coming. What will you do?',
      choices: [ch('brave', 'Roll up my sleeve and be brave', '💪'), ch('cry', 'Cry and get it anyway', '😭'), ch('run', 'Make a run for it', '🏃')],
    }),
    resolve: {
      brave: (g, x) => {
        g.flags['history.polioVaccinated'] = true
        say(g, x, 'Brave Face', 'You rolled up your sleeve and stared at the ceiling. It was over in a moment and you got a badge that said “I’m a Polio Pioneer.” Your arm was sore for a day. The grown-ups looked at you as if you had won a medal.', 'I got the polio vaccine and wore my badge with pride.', { happiness: 3, health: 3, willpower: 2 }, 'good')
      },
      cry: (g, x) => {
        g.flags['history.polioVaccinated'] = true
        say(g, x, 'Tears and a Sticker', 'You howled all the way down the corridor and for a minute after the needle. Your friends cried too, in sympathy. The nurse gave you a sticker anyway, and the vaccine did its work.', 'I cried getting the polio vaccine, but I got it.', { happiness: 1, health: 3 }, 'neutral')
      },
      run: (g, x) => {
        const caught = chance(g, 0.7)
        if (caught) g.flags['history.polioVaccinated'] = true
        say(g, x, caught ? 'Caught' : 'Escaped', caught ? 'You bolted past the nurse, the teacher and two prefects, and were caught by the caretaker in the car park. The caretaker carried you back, kicking, and the nurse got you with the needle while you screamed. Your friends pretended not to know you.' : 'You slipped out through the side door and hid in the shed until the line was over. You felt like a hero until you remembered what polio was. Your mother had a quiet word with you at supper.', caught ? 'I tried to run from the vaccine line and was dragged back.' : 'I ran away from the polio vaccine line.', { happiness: caught ? -3 : 1, health: caught ? 3 : -1, karma: caught ? 0 : -2, rel: caught ? -1 : -2 }, caught ? 'neutral' : 'bad')
      },
    },
  },

  {
    id: 'era.1946.duckCover',
    emoji: '🪖',
    title: 'Duck and Cover',
    minAge: 5,
    maxAge: 14,
    cooldown: 4,
    weight: 22,
    when: (g) => g.year >= 1951 && g.year <= 1966 && at(g, 'us', 'uk', 'dominion', 'europe') && inSchool(g),
    setup: (g) => ({
      text: `${g.character.countryId === 'us' ? 'A siren wails across the schoolyard' : 'The teacher claps her hands twice and announces a drill'}. “Everyone under your desk, hands over your necks, heads down!” she calls. A film earlier this week explained why. The room goes dead quiet. What will you do?`,
      choices: [ch('duck', 'Duck and cover seriously', '🙇'), ch('giggle', 'Giggle with the class', '🤭'), ch('ask', 'Ask the teacher what it is really for', '🙋')],
    }),
    resolve: {
      duck: (g, x) => say(g, x, 'Under the Desk', 'You curled up under the desk with your hands clasped on your neck, eyes squeezed shut. Nothing happened, of course. You thought about it all afternoon, and for a good many nights.', 'I took the duck-and-cover drill very seriously.', { happiness: -3, discipline: 1, smarts: 1 }),
      giggle: (g, x) => say(g, x, 'Class Clown', 'You and the boy beside you ended up under the same desk, giggling until the teacher’s shoes appeared. You got a stern talking-to, a note home and a hero’s welcome at lunch.', 'I giggled through the duck-and-cover drill.', { happiness: 2, discipline: -2, karma: -1 }),
      ask: (g, x) => {
        const honest = chance(g, 0.5)
        say(g, x, honest ? 'A Teacher’s Honesty' : 'A Bright Lie', honest ? 'The teacher paused, and for a moment she looked very tired. “It is a precaution,” she said, “and we all hope we will never need it.” The class was quiet for a long time afterward. You respected her for it.' : 'The teacher said it was just a drill, nothing to be afraid of, and asked you to sit down. You sat. You did not feel better, and it was clear that she didn’t either.', honest ? 'I asked my teacher about the duck-and-cover drill and she told me the truth.' : 'I asked my teacher about the drill and was told not to worry.', { happiness: honest ? 0 : -2, smarts: 2 }, 'neutral')
      },
    },
  },

  {
    id: 'era.1946.elevenPlus',
    emoji: '✏️',
    title: 'The Eleven-Plus',
    minAge: 10,
    maxAge: 11,
    once: true,
    weight: 80,
    when: (g) => g.character.countryId === 'gb' && g.year >= 1946 && g.year <= 1975 && inSchool(g),
    setup: (g) => ({
      text: `This is the year of the eleven-plus, the exam that sorts children into grammar schools and secondary moderns at the age of eleven. ${g.character.age >= 11 ? 'It is the last chance.' : 'It is next year, but everyone is already talking about it.'} The whole street has an opinion on it, and the neighbors are comparing papers. What will you do?`,
      choices: [ch('cram', 'Revise every evening', '📚'), ch('tutor', 'Ask the family for a private tutor', '👩‍🏫'), ch('relax', 'Stay calm and hope for the best', '😌')],
      data: { tutor: itemCost(g, 'wage', 15) },
    }),
    resolve: {
      cram: (g, x) => elevenPlus(g, x, 0.12, 'You worked at the kitchen table every evening with a stack of practice papers, until the shapes and the sums swam in front of your eyes.', { happiness: -3, smarts: 1, willpower: 2 }),
      tutor: (g, x) => {
        const fee = x.n('tutor')
        if (householdMoney(g) < fee * 3) {
          elevenPlus(g, x, 0.06, 'The family counted the pennies and found there was nothing over for a tutor, so you revised from borrowed books at the kitchen table.', { happiness: -1 })
          return
        }
        elevenPlus(g, x, 0.18, 'A retired schoolmistress taught you to think the way the examiners thought, in a front room smelling of lavender and chalk.', { smarts: 2 })
      },
      relax: (g, x) => elevenPlus(g, x, -0.04, 'You told yourself it was only an exam and went out to play. Your mother looked at you very hard over the supper table.', { happiness: 2 }),
    },
  },

  {
    id: 'era.1946.driveIn',
    emoji: '🚗',
    title: 'The Drive-In',
    minAge: 15,
    maxAge: 26,
    cooldown: 5,
    weight: 22,
    when: (g) => (g.year >= 1950 && g.year <= 1975 && at(g, 'us')) || (g.year >= 1952 && g.year <= 1975 && ['ca', 'au', 'nz'].includes(g.character.countryId)),
    setup: (g) => {
      const fee = itemCost(g, 'movie', 2)
      return {
        text: `There is a drive-in on the edge of town, where you can watch a double feature from the front seat for ${money(fee)} a carload. Everyone you know goes on Saturday night, and the film is not always the point. You have a date and a borrowed car. What will you do?`,
        choices: [ch('date', 'Take the date to the drive-in', '🎬'), ch('friends', 'Pile six friends in the trunk and the back seat', '🧑‍🤝‍🧑'), ch('family', 'Take the family instead', '👨‍👩‍👧')],
        data: { fee },
      }
    },
    resolve: {
      date: (g, x) => {
        const good = chance(g, 0.6)
        say(g, x, good ? 'Cinema Under the Stars' : 'Steamed Windows', good ? 'You parked in the back row with a bucket of popcorn and a speaker on the window. The film was forgettable. The evening was not, and neither were the fogged-up windows.' : 'You parked in the back row, the speaker crackled, the popcorn was cold and a car horn went off at the worst moment. Your date laughed so hard that the awkwardness dissolved. You went home friends, at least.', good ? 'I went on a date to the drive-in.' : 'My drive-in date was a comedy of errors.', { money: -x.n('fee'), happiness: good ? 7 : 2, looks: 0 }, good ? 'good' : 'neutral')
      },
      friends: (g, x) => {
        const caught = chance(g, 0.3)
        say(g, x, caught ? 'Stowaways' : 'Free Show', caught ? 'You smuggled three friends into the trunk to save the fee. Halfway through the second feature the manager shone a torch into the trunk and gave you all a lecture. You paid the fee, and a bit more, to make the problem go away.' : 'You smuggled three friends into the trunk to save the fee, and nobody noticed. The film was a dud, but the evening was great.', caught ? 'I got caught smuggling friends into the drive-in.' : 'I smuggled friends into the drive-in.', { money: caught ? -x.n('fee') * 2 : 0, happiness: caught ? -2 : 5, karma: -2 }, caught ? 'bad' : 'neutral')
      },
      family: (g, x) => say(g, x, 'Family Night', 'You packed a hamper, the blankets and the little ones in their pajamas. The children fell asleep before the cartoon ended, and you watched the stars over the screen.', 'I took the family to the drive-in.', { money: -x.n('fee'), happiness: 4, karma: 2 }, 'good'),
    },
  },

  {
    id: 'era.1946.steady',
    emoji: '💍',
    title: 'Going Steady',
    minAge: 13,
    maxAge: 19,
    cooldown: 4,
    weight: 22,
    when: (g) => g.year >= 1950 && g.year <= 1969 && at(g, 'us', 'uk', 'dominion', 'europe') && inSchool(g),
    setup: () => ({
      text: 'Someone from your class has asked you to “go steady”: to wear their ring on a chain, to walk to school together, to sit at the same table at lunch and to be, officially, a couple. The whole school will know by morning. What will you do?',
      choices: [ch('yes', 'Say yes and wear the ring', '💕'), ch('slow', 'Say you want to take it slowly', '🐢'), ch('no', 'Say no, thanks', '🙅')],
    }),
    resolve: {
      yes: (g, x) => {
        const p = aParent(g)
        say(g, x, 'Steady', 'You wore the ring on a chain under your sweater, and the whole school pretended not to look. For six weeks it was heaven. Your parents disapproved of the whole idea and said it was “too serious at your age.”', 'I went steady at school.', { happiness: 6, grades: -2, rels: p ? [{ p, d: -2 }] : [] }, 'good')
      },
      slow: (g, x) => say(g, x, 'Slow and Steady', 'You said you liked them but weren’t ready for the ring. They were disappointed and respectful, and you kept walking to school together as friends for a good long while.', 'I kept things friendly rather than going steady.', { happiness: 2, karma: 1 }),
      no: (g, x) => say(g, x, 'Free as a Bird', 'You said no, politely. A few people were hurt and a few were relieved. You spent the year with your friends instead, and nobody knew what to make of you.', 'I turned down a request to go steady.', { happiness: 0, grades: 2 }),
    },
  },

  {
    id: 'era.1946.sockHop',
    emoji: '🧦',
    title: 'The Sock Hop',
    minAge: 12,
    maxAge: 19,
    cooldown: 3,
    weight: 22,
    when: (g) => g.year >= 1950 && g.year <= 1966 && at(g, 'us', 'dominion') && inSchool(g),
    setup: () => ({
      text: 'The gym floor has been polished, so everyone leaves their shoes by the door and dances in their socks. A record player is blasting the latest hits, a teacher guards the punch bowl and the chaperones are watching with eagle eyes. What will you do?',
      choices: [ch('ask', 'Ask someone to dance', '💃'), ch('wall', 'Hug the wall with my friends', '🧱'), ch('show', 'Show off a new dance step', '🕺')],
    }),
    resolve: {
      ask: (g, x) => {
        const yes = chance(g, 0.6)
        say(g, x, yes ? 'May I?' : 'Not Tonight', yes ? 'You crossed the floor with your heart in your throat and asked. They said yes. You danced one slow number with several inches between you, as per the chaperone’s regulation, and you remember it still.' : 'You crossed the floor with your heart in your throat and asked. They said they were “saving their dances,” a phrase that could mean anything. You made your way back to the punch bowl with all the dignity you could find.', yes ? 'I asked someone to dance at the sock hop and they said yes.' : 'I asked someone to dance at the sock hop and was turned down.', { happiness: yes ? 7 : -3, looks: 0 }, yes ? 'good' : 'bad')
      },
      wall: (g, x) => say(g, x, 'Wallflowers', 'You and your friends held up the wall for three hours, critiquing everyone on the floor in whispers. You went home in a good mood after all, and planned what you would do differently next time.', 'I spent the sock hop with my friends along the wall.', { happiness: 2 }),
      show: (g, x) => {
        const good = chance(g, 0.4 + g.character.hidden.athleticism / 250)
        say(g, x, good ? 'Cutting a Rug' : 'Slip!', good ? 'You launched into the new step you had practiced in the bedroom mirror. The crowd made a circle and clapped. For one glorious song you were a star.' : 'You launched into the new step you had practiced in the bedroom mirror, and the polished floor and your socks conspired against you. You slid across the gym on your back, and the room howled with joy.', good ? 'I showed off a new dance step at the sock hop.' : 'I slipped on the gym floor at the sock hop.', { happiness: good ? 7 : -2, looks: good ? 1 : 0, athleticism: 1 }, good ? 'good' : 'neutral')
      },
    },
  },

  {
    id: 'era.1946.rockRoll',
    emoji: '🎸',
    title: 'Rock ‘n’ Roll Against the Parents',
    minAge: 12,
    maxAge: 19,
    cooldown: 5,
    weight: 24,
    when: (g) => g.year >= 1955 && g.year <= 1966 && at(g, 'us', 'uk', 'dominion', 'europe', 'japan', 'latam', 'brazil') && !!aParent(g),
    setup: (g) => {
      const p = aParent(g)
      return {
        text: `You have saved up for the record everyone at school is talking about. When you put it on, the needle drops and the whole house shakes. Your ${parentWord(p)} appears in the doorway: “That is not music, that is a racket.” The record is loud, and you are in love with it. What will you do?`,
        choices: [ch('loud', 'Play it even louder', '🔊'), ch('quiet', 'Turn it down and keep listening', '🔉'), ch('convert', 'Make them listen to a whole song', '🎶')],
        person: p,
      }
    },
    resolve: {
      loud: (g, x) => say(g, x, 'Turn It Down!', 'You turned it up. Your parent turned it off. The record was confiscated for a fortnight, and you listened to it in your head all day instead.', 'I played my rock ‘n’ roll record too loud and had it confiscated.', { happiness: -2, rel: -4, discipline: -1 }, 'bad'),
      quiet: (g, x) => say(g, x, 'Under the Blanket', 'You turned it down to a respectable level and played it twice more with your ear to the speaker. Peace in the house was maintained, and your love of the record was undiminished.', 'I kept my rock ‘n’ roll to a low volume at home.', { happiness: 3, rel: 1 }),
      convert: (g, x) => {
        const win = chance(g, 0.35)
        say(g, x, win ? 'A Convert' : 'Unmoved', win ? 'You sat your parent down and played the whole song, start to finish. There was a long silence. “The drummer isn’t bad,” your parent said, and tapped a foot. You were never so proud.' : 'You sat your parent down and played the whole song, start to finish. “A lot of noise about nothing,” your parent said, and went back to the paper. You loved the song all the same.', win ? 'I won my parent over to rock ‘n’ roll.' : 'My parent was not won over by my record.', { happiness: win ? 7 : 1, rel: win ? 5 : 0 }, win ? 'good' : 'neutral')
      },
    },
  },

  {
    id: 'era.1946.transistor',
    emoji: '📻',
    title: 'The Radio Under the Pillow',
    minAge: 10,
    maxAge: 19,
    cooldown: 6,
    weight: 14,
    when: (g) => g.year >= 1956 && g.year <= 1973 && at(g, ...WESTERN, 'japan', 'latam', 'brazil', 'india', 'indonesia', 'seasia', 'nigeria', 'mena') && !g.character.prison,
    setup: () => ({
      text: 'You have a pocket transistor radio the size of a cigar box, bought with birthday money. After lights-out, the late-night shows come in crackly and exciting through a tiny earphone. Tonight the parents are still up. What will you do?',
      choices: [ch('listen', 'Listen under the covers', '🛏️'), ch('share', 'Share it with a friend at school', '🧑‍🤝‍🧑'), ch('sleep', 'Save it for the weekend and sleep', '😴')],
    }),
    resolve: {
      listen: (g, x) => {
        const caught = chance(g, 0.35)
        const p = aParent(g)
        say(g, x, caught ? 'Radio Silence' : 'Midnight Music', caught ? 'You were halfway through your favorite song when the door opened and a hand reached under the pillow. The radio was taken away until the end of the month. You hummed the rest of the song in the dark.' : 'You lay under the covers with the earphone pressed to your ear and heard music from a city you had never seen. You felt connected to the whole world, and tired in the morning.', caught ? 'My parents confiscated my transistor radio.' : 'I listened to my transistor radio under the covers.', { happiness: caught ? -3 : 5, health: caught ? 0 : -1, rels: p ? [{ p, d: caught ? -2 : 0 }] : [] }, caught ? 'bad' : 'good')
      },
      share: (g, x) => say(g, x, 'The Class Radio', 'You brought it to school and shared it behind the bike shed, one earphone each. By Friday, half the class had formed a queue. It was the most popular you had ever been.', 'I shared my transistor radio with my friends at school.', { happiness: 5, karma: 2 }, 'good'),
      sleep: (g, x) => say(g, x, 'Good Sense', 'You put the radio in the drawer and slept like a log. On the weekend you listened in the afternoon with the window open, and nobody minded.', 'I saved my transistor radio for the weekend.', { health: 1, happiness: 2, discipline: 1 }),
    },
  },

  {
    id: 'era.1946.popCraze',
    emoji: '🎤',
    title: 'The Pop Craze',
    minAge: 11,
    maxAge: 20,
    once: true,
    weight: 22,
    when: (g) => g.year >= 1963 && g.year <= 1969 && at(g, 'us', 'uk', 'dominion', 'europe', 'japan', 'latam', 'brazil'),
    setup: (g) => {
      const ticket = itemCost(g, 'movie', 3)
      return {
        text: `A mop-haired pop group is the talk of the world, and tickets to their show are going on sale this Saturday. Every girl and boy in the school has a poster, a scarf or a haircut. The tickets are ${money(ticket)}, and the queue is already round the block. What will you do?`,
        choices: [ch('queue', `Queue all night for a ticket (${money(ticket)})`, '🎟️'), ch('hair', 'Copy the haircut', '💇'), ch('home', 'Stay home and listen to the record', '🎵')],
        data: { ticket },
      }
    },
    resolve: {
      queue: (g, x) => {
        const got = chance(g, 0.6)
        say(g, x, got ? 'Screaming Fit' : 'Sold Out', got ? 'You camped on the pavement with a thermos, and got a ticket at dawn. At the concert you screamed so hard that you could not hear the music, and nor could anyone else. You were hoarse for a week.' : 'You camped on the pavement with a thermos, and the tickets ran out two people ahead of you. You cried for an hour and bought the record.', got ? 'I got a ticket to the biggest pop show of the year.' : 'I queued all night for pop tickets and missed out.', { money: got ? -x.n('ticket') : 0, happiness: got ? 10 : -4, health: -1 }, got ? 'good' : 'bad')
      },
      hair: (g, x) => {
        const p = aParent(g)
        say(g, x, 'The Mop Top', 'You combed your hair forward into a fringe and came down to breakfast. Your father looked up from the paper. “You look like a sheepdog,” he said. You never felt better.', 'I copied the pop craze haircut and my father hated it.', { happiness: 5, looks: 1, rels: p ? [{ p, d: -2 }] : [] }, 'good')
      },
      home: (g, x) => say(g, x, 'Record Collector', 'You stayed in with the record player and wore out the grooves. You knew every word and every guitar riff, and nobody could have loved the band more, from the safety of your own bedroom.', 'I stayed home and listened to the pop craze on my record player.', { happiness: 4, smarts: 1 }),
    },
  },

  {
    id: 'era.1946.handMeDowns',
    emoji: '🧥',
    title: 'Hand-Me-Downs',
    minAge: 5,
    maxAge: 15,
    cooldown: 5,
    weight: 16,
    when: (g) => g.year >= 1946 && g.year <= 1965 && at(g, ...WESTERN, 'japan', 'latam', 'brazil') && !richFamily(g),
    setup: (g) => {
      const sib = siblings(g).find((s) => s.alive && s.age > g.character.age)
      return {
        text: `A parcel has arrived from the older ${sib ? (sib.gender === 'male' ? 'brother' : 'sister') : 'cousin'}: a coat, two shirts and a pair of shoes, all outgrown and none of them yours. You were hoping for something new. The school is full of new clothes this term. What will you do?`,
        choices: [ch('wear', 'Wear them with pride', '🧥'), ch('swap', 'Swap with a friend for something better', '🔄'), ch('mend', 'Make them your own with a patch or two', '🪡')],
      }
    },
    resolve: {
      wear: (g, x) => say(g, x, 'Proud and Practical', 'You wore the coat to school with your head up. A couple of children smirked and most didn’t notice. By the second week it was just your coat. Your mother was pleased at your good sense.', 'I wore hand-me-downs with pride.', { happiness: -1, karma: 2, discipline: 2, rels: aParent(g) ? [{ p: aParent(g), d: 2 }] : [] }),
      swap: (g, x) => {
        const win = chance(g, 0.5)
        say(g, x, win ? 'A Good Swap' : 'A Bad Bargain', win ? 'You swapped a shirt for a friend’s scarf and a cap that fit you perfectly. A clever deal, if you say so yourself.' : 'You swapped a good shirt for a hat that did not fit and a promise that was never kept. Lesson learned.', win ? 'I swapped hand-me-downs and came out ahead.' : 'I swapped hand-me-downs and lost out.', { happiness: win ? 3 : -2, smarts: win ? 1 : 0 }, win ? 'good' : 'neutral')
      },
      mend: (g, x) => say(g, x, 'One of a Kind', 'You sewed on a colorful patch, changed the buttons and stitched your initials inside. By Friday, three classmates had asked where you got the coat. You didn’t tell them it was second-hand.', 'I made my hand-me-downs my own with a bit of patching.', { happiness: 4, looks: 1, smarts: 1 }, 'good'),
    },
  },

  {
    id: 'era.1946.sundayRoast',
    emoji: '🍖',
    title: 'Sunday Dinner',
    minAge: 5,
    maxAge: 90,
    cooldown: 6,
    weight: 14,
    when: (g) => g.year >= 1946 && g.year <= 1979 && at(g, 'uk', 'dominion', 'us', 'europe', 'brazil', 'latam'),
    setup: (g) => {
      const place = g.character.countryId
      const text = ['gb', 'ie', 'au', 'nz', 'ca'].includes(place)
        ? 'It is Sunday, and a roast is in the oven: a joint of meat, potatoes, greens, gravy and a pudding to follow. The whole family is squashed around the table, three generations deep, and the grandparents are in rare form. What will you do?'
        : place === 'us'
          ? 'It is Sunday after church, and the whole family has come for dinner: pot roast, mashed potatoes, rolls and three kinds of pie. The aunts are in the kitchen, the uncles in front of the game and the cousins everywhere. What will you do?'
          : 'It is Sunday, and the whole family has come together for the long lunch: soup, a roast, a salad, cheese and a pudding that lasts the afternoon. The conversation is lively, and so are the opinions. What will you do?'
      return { text, choices: [ch('help', 'Help in the kitchen', '👩‍🍳'), ch('seconds', 'Go for seconds and thirds', '🍽️'), ch('grandpa', 'Sit with the grandparents and listen', '🪑')] }
    },
    resolve: {
      help: (g, x) => say(g, x, 'Kitchen Duty', 'You peeled, stirred and carried plates until your hands were wrinkled. The aunts approved and gave you the burnt bit of the roast as a prize. You learned how to make gravy without lumps.', 'I helped cook the Sunday dinner.', { happiness: 3, karma: 3, smarts: 1 }, 'good'),
      seconds: (g, x) => say(g, x, 'The Second Helping', 'You had seconds, and then pudding, and then a bit more of the crust. You rolled out of your chair and onto the sofa for the rest of the afternoon, deeply and satisfyingly stuffed.', 'I stuffed myself at the Sunday dinner.', { happiness: 5, health: -1 }),
      grandpa: (g, x) => say(g, x, 'Old Stories', 'You sat with the grandparents while the rest of the family cleared the table. They told you stories about their youth that were probably true, in places. You didn’t say a word, and it was one of the best afternoons of your life.', 'I listened to my grandparents’ stories after Sunday dinner.', { happiness: 5, smarts: 2, karma: 2 }, 'good'),
    },
  },

  {
    id: 'era.1946.expo',
    emoji: '🌐',
    title: 'The World’s Fair',
    minAge: 6,
    maxAge: 80,
    once: true,
    weight: 40,
    when: (g) => expoFor(g) !== null,
    setup: (g) => {
      const fee = itemCost(g, 'wage', 6)
      return {
        text: `This year ${expoFor(g)} has opened, with pavilions from every country, rockets, robots and a tower you can ride up. Everyone says it is a glimpse of the future. The tickets are ${money(fee)} and the trip is half a day. What will you do?`,
        choices: [ch('go', `Go and see it (${money(fee)})`, '🎡'), ch('read', 'Read about it in the papers', '📰')],
        data: { fee },
      }
    },
    resolve: {
      go: (g, x) => say(g, x, 'The Future, Today', 'You walked through pavilions of gleaming appliances, moving sidewalks and talking machines. You came home with a bag of leaflets, a sore pair of feet and several ideas about the twenty-first century.', 'I visited a world’s fair and saw the future.', { money: -x.n('fee'), happiness: 8, smarts: 3 }, 'good'),
      read: (g, x) => say(g, x, 'Armchair Visitor', 'You read every article and pored over every picture. It was nearly as good as going, you told everyone, who nodded kindly.', 'I followed the world’s fair in the papers.', { happiness: 1, smarts: 2 }),
    },
  },

  {
    id: 'era.1946.independence',
    emoji: '🎉',
    title: 'Independence Day',
    minAge: 4,
    maxAge: 90,
    once: true,
    weight: 80,
    when: (g) => INDEPENDENCE[g.character.countryId] === g.year,
    setup: () => ({
      text: 'Today your country becomes free: the old flag comes down and the new flag goes up at midnight. The streets are full of drums, singing and strangers hugging each other. Everyone is talking about the future. What will you do?',
      choices: [ch('parade', 'March in the parade', '🥁'), ch('flag', 'Wave a flag from the roadside', '🚩'), ch('home', 'Stay home with the family and listen to the radio', '📻')],
    }),
    resolve: {
      parade: (g, x) => say(g, x, 'The Parade', 'You marched with the crowd, past the old buildings with their new flags, until your feet were sore and your voice was gone. It was the biggest day your country had seen, and you were part of it.', 'I marched in the independence parade.', { happiness: 9, karma: 2 }, 'good'),
      flag: (g, x) => say(g, x, 'A Small Flag', 'You waved a little paper flag as the procession went by, and a stranger lifted you onto his shoulders so you could see. You remembered the colors for the rest of your life.', 'I waved a flag on independence day.', { happiness: 7 }, 'good'),
      home: (g, x) => say(g, x, 'By the Radio', 'The family gathered round the radio and listened to the speeches in silence. When the anthem began, your grandfather stood up with tears in his eyes, and you stood with him.', 'I heard the independence speeches on the family radio.', { happiness: 5, rel: 0, karma: 1 }, 'good'),
    },
  },
])

function elevenPlus(g: GameState, x: Ctx, bonus: number, intro: string, fx: Fx): void {
  const base = 0.15 + g.character.stats.smarts / 140
  const pass = chance(g, Math.max(0.05, Math.min(0.92, base + bonus)))
  const text = `${intro} ${pass ? 'The brown envelope arrived in the spring. “Passed,” it said, and your mother read it three times aloud. Grammar school, a blazer and a book of Latin verbs awaited.' : 'The brown envelope arrived in the spring. The news was a secondary modern school, and a lot of kind words from relatives that didn’t help. Plenty of people did well on that road, and you intend to.'}`.trim()
  say(g, x, pass ? 'Passed!' : 'Not This Time', text, pass ? 'I passed the eleven-plus.' : 'I did not pass the eleven-plus.', { ...fx, happiness: (fx.happiness ?? 0) + (pass ? 9 : -4), smarts: (fx.smarts ?? 0) + (pass ? 2 : 0), grades: pass ? 5 : -2 }, pass ? 'good' : 'neutral')
}

const INDEPENDENCE: Readonly<Record<string, number>> = {
  ph: 1946, jo: 1946, sy: 1946, in: 1947, pk: 1947, id: 1949, my: 1957, ma: 1956, tn: 1956, ng: 1960, cd: 1960, ug: 1962, dz: 1962, jm: 1962, ke: 1963, kw: 1961, ae: 1971, qa: 1971, bs: 1973, ao: 1975,
}

function expoFor(g: GameState): string | null {
  const id = g.character.countryId
  switch (g.year) {
    case 1958:
      return at(g, 'europe', 'uk') ? 'the Brussels World’s Fair, with its giant silver atom' : null
    case 1962:
      return id === 'us' ? 'the Seattle World’s Fair, with its needle-shaped tower' : null
    case 1964:
    case 1965:
      return id === 'us' ? 'the New York World’s Fair' : null
    case 1967:
      return id === 'ca' || id === 'us' ? 'the Montreal World’s Fair, Expo 67' : null
    case 1970:
      return id === 'jp' ? 'the Osaka World Exposition' : null
    default:
      return null
  }
}
