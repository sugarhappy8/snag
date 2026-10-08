// Era pack 1900-1945, popup events for childhood and youth: the iceman, the first wireless set, the
// telegram boy, the strap and the dunce cap, leaving school at fourteen, quarantine cards, the
// flickers and the talkies. Ids start with 'era.1900.'; each only fits its years and places.
import { contractCondition } from '../health'
import { techOdds } from '../history/timeline'
import { leaveSchoolToWork, schoolLeavingAge } from '../education'
import { chance, pick } from '../rng'
import type { GameState } from '../types'
import { aParent, ch, defineEvents, money, say, siblings } from './helpers'
import { at, richFamily, poorFamily } from './era-pack-where'
import { householdMoney, itemCost, minor, niceRound, parentWord } from './era-pack-kit'

const WESTERN = ['us', 'uk', 'dominion', 'europe'] as const

function inSchool(g: GameState): boolean {
  const cur = g.character.education.current
  return !!cur && (cur.level === 'elementary' || cur.level === 'middle' || cur.level === 'high')
}

export const KID_EVENTS_1900 = defineEvents([
  {
    id: 'era.1900.iceMilkman',
    emoji: '🧊',
    title: 'The Iceman Cometh',
    minAge: 4,
    maxAge: 12,
    weight: 14,
    cooldown: 6,
    when: (g) => g.year >= 1900 && g.year <= 1945 && at(g, ...WESTERN) && !poorFamily(g),
    setup: (g) => {
      const horse = g.year < 1935
      return {
        text: horse
          ? 'The iceman’s wagon rattles down the street behind a big, patient horse, and the milkman is two doors up with his clinking crate. The wagon is a magnet for every child on the block. What will you do?'
          : 'The iceman’s truck stops outside, and the milkman is two doors up with his clinking crate. The truck is a magnet for every child on the block. What will you do?',
        choices: [ch('chips', 'Chase the wagon for ice chips', '🧊'), ch('help', 'Offer to help the milkman', '🥛'), ch('treat', horse ? 'Feed the horse a sugar lump' : 'Ask for a ride on the running board', horse ? '🐴' : '🚚')],
      }
    },
    resolve: {
      chips: (g, x) => say(g, x, 'Ice Chips', 'You chased the wagon down the block and caught a handful of ice from the back. It was the coldest, finest treat of the summer, and your mittens were soaked.', 'I chased the ice wagon for chips on a hot day.', { happiness: 4, health: 0 }, 'good'),
      help: (g, x) => {
        const pay = niceRound(itemCost(g, 'wage', 0.5) + 1)
        say(g, x, 'A Helping Hand', `You carried two bottles up the steps for the milkman. He gave you a coin and a nod. You felt like an employee for the whole afternoon.`, 'I helped the milkman carry bottles and earned a coin.', { happiness: 3, karma: 2, money: pay }, 'good')
      },
      treat: (g, x) => {
        if (g.year < 1935) {
          const bitten = chance(g, 0.25)
          say(g, x, bitten ? 'Nibbled' : 'A New Friend', bitten ? 'You held out the sugar lump on a flat palm. The horse took it, and a good part of your sleeve with it. Your mother was not pleased about the sleeve.' : 'You held out a sugar lump on a flat palm. The horse took it gently and nudged you for more. It was the start of a beautiful friendship, at least on his side.', bitten ? 'A horse ate part of my sleeve along with a sugar lump.' : 'I made friends with the iceman’s horse.', { happiness: bitten ? 0 : 4 }, bitten ? 'neutral' : 'good')
        } else {
          const fell = chance(g, 0.2)
          say(g, x, fell ? 'Off the Running Board' : 'A Short Ride', fell ? 'You hopped on the running board for a ride down the block, slipped on the turn and skinned both knees. The iceman was kind about it, and your mother was not.' : 'You hopped on the running board for a ride down the block, waving at everyone. The iceman chuckled and let you down at the corner.', fell ? 'I fell off the running board of the ice truck and skinned both knees.' : 'I rode the running board of the ice truck for a block.', { happiness: fell ? -2 : 3, health: fell ? -2 : 0 }, fell ? 'bad' : 'good')
        }
      },
    },
  },

  {
    id: 'era.1900.firstMotorcar',
    emoji: '🚗',
    title: 'A Horseless Carriage',
    minAge: 4,
    maxAge: 17,
    once: true,
    weight: 22,
    when: (g) => g.year >= 1900 && g.year <= 1918 && !at(g, 'india', 'china', 'nigeria', 'indonesia', 'seasia', 'mena'),
    setup: () => ({
      text: 'A noisy, smoking motorcar has chugged into your street, the first anyone has seen here. Horses shy, dogs bark and every child comes running. The driver is wearing goggles and a long dust coat. What will you do?',
      choices: [ch('run', 'Run alongside it', '🏃'), ch('ask', 'Ask the driver for a ride', '🙋'), ch('hide', 'Cover my ears and watch from the gate', '🙉')],
    }),
    resolve: {
      run: (g, x) => {
        const tripped = chance(g, 0.3)
        say(g, x, tripped ? 'Dust and Gravel' : 'Racing the Motorcar', tripped ? 'You ran beside the motorcar for two blocks, tripped on a cobblestone and skidded into a hedge. The driver honked as if applauding.' : 'You ran beside the motorcar for two blocks and beat it up the hill, since it had to slow down for the horses. You told everyone about it for a month.', tripped ? 'I raced the first motorcar down our street and fell on my face.' : 'I raced the first motorcar down our street and nearly won.', { happiness: tripped ? -1 : 4, health: tripped ? -1 : 1, athleticism: tripped ? 0 : 1 }, tripped ? 'bad' : 'good')
      },
      ask: (g, x) => {
        const yes = chance(g, 0.55)
        say(g, x, yes ? 'The Ride of a Lifetime' : 'Not Today', yes ? 'The driver laughed, lifted you onto the seat and took you around the block at the unheard-of speed of fifteen miles an hour. Your hat blew away. You never wanted anything so much again than to drive.' : 'The driver shook his head and said it was no vehicle for children. You were crushed, and a bit relieved when it backfired right in front of you.', yes ? 'I rode in a motorcar for the first time and lost my hat.' : 'I asked for a ride in the first motorcar and was turned down.', { happiness: yes ? 8 : -1, smarts: yes ? 1 : 0 }, yes ? 'good' : 'neutral')
      },
      hide: (g, x) => say(g, x, 'Safe Distance', 'You covered your ears and watched from the gate as the motorcar went past in a cloud of dust and smoke. The horses calmed down eventually, and so did your heart.', 'I watched the first motorcar go past from behind our gate.', { happiness: 1, smarts: 1 }),
    },
  },

  {
    id: 'era.1900.strap',
    emoji: '📏',
    title: 'The Ruler Comes Down',
    minAge: 6,
    maxAge: 15,
    cooldown: 4,
    weight: (g) => (g.year < 1960 ? 16 : 8),
    when: (g) => g.year >= 1900 && g.year <= 1979 && inSchool(g) && !(at(g, 'japan') && g.year >= 1947),
    setup: (g) => {
      const strict = g.year < 1950
      return {
        text: strict
          ? 'You were caught whispering in class. The teacher marches you to the front and takes up the ruler, the whole class watching. Discipline in this school is not a debate. What will you do?'
          : 'You were caught passing notes in class, and the teacher is not amused. The headmaster’s office has a reputation, and so does what happens in it. What will you do?',
        choices: [ch('stoic', 'Take it without a sound', '😤'), ch('plead', 'Plead for mercy', '🥺'), ch('tell', 'Tell my parents afterward', '🏠')],
      }
    },
    resolve: {
      stoic: (g, x) => say(g, x, 'Stiff Upper Lip', 'You held out your hand and didn’t make a sound. The class was impressed, the teacher less so, and your palm stung for the rest of the afternoon. You learned to whisper more quietly.', 'I took my punishment at school without a sound.', { happiness: -3, discipline: 3, willpower: 2 }),
      plead: (g, x) => {
        const spared = chance(g, 0.4)
        say(g, x, spared ? 'Let Off' : 'No Mercy', spared ? 'You begged, promised and nearly cried. The teacher sighed, lowered the ruler and let you off with a lecture about honor. The class thought you a genius, or a coward.' : 'You begged, promised and nearly cried, and it made no difference whatsoever. You took your punishment with a red face and a red hand.', spared ? 'I talked my way out of a caning.' : 'I begged for mercy at school and it did not help.', { happiness: spared ? 1 : -4, karma: spared ? -1 : 0 }, spared ? 'neutral' : 'bad')
      },
      tell: (g, x) => {
        const p = aParent(g)
        const backed = chance(g, 0.65)
        say(g, x, backed ? 'The Same Again' : 'A Word with the Teacher', backed ? `You told your ${parentWord(p)} about it at supper. “Then you must have deserved it,” came the reply, and a second lecture followed. You decided not to mention school at supper for a while.` : `You told your ${parentWord(p)}, who put down the fork, went very quiet and visited the school the next morning. The teacher was much more careful with you after that, though your classmates thought you a tattletale.`, backed ? 'I told my parents I was punished at school and got a second lecture.' : 'My parents went to the school to complain about the strap.', { happiness: backed ? -2 : 3, rel: backed ? -1 : 3 }, backed ? 'bad' : 'good')
      },
    },
  },

  {
    id: 'era.1900.dunce',
    emoji: '🎓',
    title: 'The Corner Stool',
    minAge: 6,
    maxAge: 12,
    once: true,
    weight: 12,
    when: (g) => g.year >= 1900 && g.year <= 1965 && inSchool(g) && !at(g, 'japan', 'china'),
    setup: (g) => ({
      text: `You got six words wrong in the spelling test, and the teacher has sent you to the stool in the corner ${g.year < 1950 ? 'with a tall paper cap and a sign that reads DUNCE' : 'facing the wall for the rest of the lesson'}. Everyone is looking. What will you do?`,
      choices: [ch('grin', 'Wear it with a grin', '😁'), ch('refuse', 'Refuse to sit there', '🙅'), ch('study', 'Study the words that night', '📖')],
    }),
    resolve: {
      grin: (g, x) => say(g, x, 'Good Sport', 'You sat on the stool with a smile, and by lunchtime half the class wanted a turn. Even the teacher had to look out of the window to hide a smile. You were never so popular.', 'I took the dunce stool with a grin and became the class favorite.', { happiness: 2, karma: 1, discipline: -1 }, 'good'),
      refuse: (g, x) => {
        say(g, x, 'Sent to the Head', 'You folded your arms and said no. The teacher marched you to the headmaster, who gave you a longer lecture and a punishment more memorable than the stool.', 'I refused the dunce stool and ended up in the headmaster’s office.', { happiness: -4, discipline: -2, grades: -2 }, 'bad')
      },
      study: (g, x) => say(g, x, 'Spelling Champion', 'You studied the list by the stove until your eyes crossed, and the next day you spelled every word right, even “necessary.” The teacher raised an eyebrow, and then a gold star.', 'I studied hard after being sent to the dunce stool and aced the next test.', { smarts: 3, happiness: 2, grades: 4, willpower: 2 }, 'good'),
    },
  },

  {
    id: 'era.1900.leaveSchool',
    emoji: '🎒',
    title: 'Time to Leave School?',
    minAge: 11,
    maxAge: 15,
    once: true,
    weight: (g) => (richFamily(g) ? 6 : 36),
    when: (g) => g.year >= 1900 && g.year <= 1959 && inSchool(g) && g.character.age >= schoolLeavingAge(g),
    setup: (g) => {
      const smart = g.character.stats.smarts >= 68
      const choices = [ch('work', 'Leave school and take a job', '💼'), ch('stay', 'Stay in school', '📚')]
      if (smart) choices.push(ch('scholar', 'Sit for a scholarship place', '🏅'))
      return {
        text: `You have reached the age when most children here leave school to earn. The family could use the wage, and there is an errand-boy post going at a shop in town. But your teacher thinks you could do more.${smart ? ' She has put your name down for a scholarship examination.' : ''} What will you do?`,
        choices,
      }
    },
    resolve: {
      work: (g, x) => {
        const wage = niceRound(itemCost(g, 'wage', 700) * 0.3)
        const ok = leaveSchoolToWork(g)
        say(g, x, ok ? 'First Wage' : 'Odd Jobs', ok ? `You left school and started work the following Monday. The first pay envelope was thin, but you handed most of it to your ${parentWord(aParent(g))} and felt like a grown-up. Part of you still looks back at the classroom door.` : 'You took odd jobs when school let out and helped bring in a little money.', 'I left school to go to work.', { money: wage, happiness: -1, rel: 4, smarts: -1 }, 'neutral')
      },
      stay: (g, x) => {
        say(g, x, 'Staying On', 'You told your family you wanted to stay. There was a long, quiet supper, and then your father said, “If you are going to do it, do it properly.” Money would be tighter, and you were determined to deserve it.', 'I stayed in school when I could have left to work.', { happiness: -1, rel: -2, smarts: 2, grades: 3, willpower: 3 }, 'good')
      },
      scholar: (g, x) => {
        const p = Math.min(0.8, 0.25 + (g.character.stats.smarts - 60) / 60)
        const won = chance(g, p)
        say(g, x, won ? 'Scholarship!' : 'Close, But No', won ? 'You sat three hours in a cold hall with a stub of pencil and wrote until your hand cramped. The letter came in the spring: you had won a place. Your mother read it twice and cried into her apron.' : 'You sat three hours in a cold hall and did your best. The letter was polite and short. You stayed on at your old school, with a very useful lesson about exams.', won ? 'I won a scholarship place at school.' : 'I sat for a scholarship and just missed.', won ? { happiness: 10, smarts: 4, grades: 6, rel: 4, karma: 1 } : { happiness: -3, smarts: 2, grades: 2 }, won ? 'good' : 'neutral')
      },
    },
  },

  {
    id: 'era.1900.quarantine',
    emoji: '🏠',
    title: 'The Card on the Door',
    minAge: 3,
    maxAge: 13,
    cooldown: 8,
    weight: 12,
    when: (g) => g.year >= 1900 && g.year <= 1944 && at(g, ...WESTERN, 'latam', 'brazil'),
    setup: () => ({
      text: 'A sign has been nailed to your front door: SCARLET FEVER, in big red letters. Nobody may come in or out for weeks, and the neighbors cross the road to avoid your gate. The house is small, the days are long and the windows are right there. What will you do?',
      choices: [ch('stay', 'Stay put and make the best of it', '🛋️'), ch('sneak', 'Sneak out the back to play', '🏃'), ch('nurse', 'Help nurse the sick', '🍵')],
    }),
    resolve: {
      stay: (g, x) => say(g, x, 'Quarantine', 'You played every board game twice, read the family Bible for the pictures and counted the cracks in the ceiling. It was the longest month of your life, and everyone in the house stayed well.', 'I spent a month in quarantine reading and playing board games.', { happiness: -2, smarts: 3 }),
      sneak: (g, x) => {
        const sick = chance(g, 0.35)
        if (sick) {
          contractCondition(g, 'Scarlet Fever', { diagnosed: true, quiet: true })
          say(g, x, 'Caught It', 'You squeezed out the back window to play with the neighbors’ children, and a week later you were burning with a fever and a rash like sunburn. The doctor said nothing at all, which was worse than a lecture.', 'I broke quarantine and caught scarlet fever.', { happiness: -5, karma: -4 }, 'bad')
        } else {
          say(g, x, 'Close Call', 'You squeezed out the back window to play with the neighbors’ children, and nobody was the wiser. Your luck held, but your conscience kept you awake that night.', 'I sneaked out during quarantine and got away with it.', { happiness: 3, karma: -4 }, 'neutral')
        }
      },
      nurse: (g, x) => {
        const sick = chance(g, 0.3)
        if (sick) contractCondition(g, 'Scarlet Fever', { diagnosed: true, quiet: true })
        say(g, x, sick ? 'Nursing Duty' : 'The Kind Nurse', sick ? 'You carried broth and cold cloths to the sickroom for a week, and learned a good deal about patience, and about how contagious fevers really are. You caught it yourself in the last days.' : 'You carried broth and cold cloths to the sickroom for a week. Everyone recovered, and your family looked at you in a new light.', sick ? 'I nursed a sick family member and caught scarlet fever myself.' : 'I helped nurse a sick relative through scarlet fever.', { happiness: sick ? -3 : 3, karma: 5, rel: 3 }, sick ? 'bad' : 'good')
      },
    },
  },

  {
    id: 'era.1900.nickelodeon',
    emoji: '🎞️',
    title: 'The Flickers',
    minAge: 6,
    maxAge: 60,
    once: true,
    weight: 24,
    when: (g) => g.year >= 1905 && g.year <= 1926 && at(g, ...WESTERN, 'latam', 'brazil', 'japan'),
    setup: (g) => {
      const fee = Math.max(1, itemCost(g, 'movie'))
      return {
        text: `A shop on the main street has been turned into a picture show. A painted sign promises “Moving Pictures! Admission ${money(fee)}.” You can hear the piano playing and people laughing inside. What will you do?`,
        choices: [ch('pay', `Pay for a seat (${money(fee)})`, '🎟️'), ch('sneak', 'Slip in under the curtain', '🥷'), ch('wait', 'Wait for someone else to tell you about it', '🪑')],
        data: { fee },
      }
    },
    resolve: {
      pay: (g, x) => {
        const fee = x.n('fee')
        say(g, x, 'The Pictures Move!', 'The lights went down, the piano began and a train raced toward the audience. People screamed, then laughed. You have never seen anything like it, and you will think about it for weeks.', 'I saw my first moving picture and could talk of nothing else.', { money: -fee, happiness: 8, smarts: 1 }, 'good')
      },
      sneak: (g, x) => {
        const caught = chance(g, 0.45)
        say(g, x, caught ? 'Collared' : 'Free Show', caught ? 'You wriggled under the curtain and got three minutes of a chase before a hand grabbed your collar. The manager threw you out onto the pavement and told your parents. You still saw the chase.' : 'You wriggled under the curtain and got a place on the floor in the dark. You saw the whole show for nothing and left with a conscience as heavy as a brick.', caught ? 'I sneaked into the picture show and was thrown out.' : 'I sneaked into my first picture show for free.', { happiness: caught ? -2 : 6, karma: -4, rel: caught ? -3 : 0 }, caught ? 'bad' : 'neutral')
      },
      wait: (g, x) => say(g, x, 'Second-hand Wonder', 'A neighbor described the show to you in breathless detail, with sound effects. You waited a year to see one, and when you did, it was not half as good as the story.', 'I heard about the flickers from a neighbor long before I saw them.', { happiness: 1 }),
    },
  },

  {
    id: 'era.1900.talkies',
    emoji: '🎬',
    title: 'The Pictures Talk',
    minAge: 7,
    maxAge: 70,
    once: true,
    weight: 24,
    when: (g) => g.year >= 1928 && g.year <= 1934 && at(g, ...WESTERN, 'latam', 'brazil', 'japan', 'india'),
    setup: (g) => {
      const fee = Math.max(1, itemCost(g, 'movie'))
      return {
        text: `The picture house on the corner has put up a sign: “ALL TALKING! ALL SINGING!” People are lined up around the block to see the first talking picture in town. The seats cost ${money(fee)}. What will you do?`,
        choices: [ch('opening', `Go on opening night (${money(fee * 2)})`, '🌟'), ch('matinee', `Go to the cheap matinee (${money(fee)})`, '🎟️'), ch('silent', 'Stick with the silent pictures', '🤫')],
        data: { fee },
      }
    },
    resolve: {
      opening: (g, x) => say(g, x, 'It Talks!', 'The whole audience gasped when the actors opened their mouths and words came out. Someone applauded, someone laughed, and a lady near you fainted. You walked home in a daze, repeating lines from the film.', 'I saw my first talking picture on opening night.', { money: -x.n('fee') * 2, happiness: 8 }, 'good'),
      matinee: (g, x) => say(g, x, 'The Matinee', 'You squeezed into the matinee with a hundred shouting children. The sound was crackly and the film was a week old, but the voices were magic, and a boy behind you repeated every line out loud.', 'I saw my first talking picture at a children’s matinee.', { money: -x.n('fee'), happiness: 6 }, 'good'),
      silent: (g, x) => say(g, x, 'The Purist', 'You told everyone that the pictures were an art and the talking would ruin them. The theater down the road kept a silent show for a few more months, and you were there every Saturday, one of the last audience.', 'I stuck with silent pictures after the talkies arrived.', { happiness: 1, smarts: 1 }),
    },
  },

  {
    id: 'era.1900.telegram',
    emoji: '✉️',
    title: 'The Telegram Boy',
    minAge: 9,
    maxAge: 80,
    cooldown: 8,
    weight: 14,
    when: (g) => g.year >= 1900 && g.year <= 1950 && at(g, ...WESTERN, 'latam', 'brazil', 'japan', 'india', 'southafrica'),
    setup: (g) => {
      const war = (g.year >= 1914 && g.year <= 1918) || (g.year >= 1939 && g.year <= 1945)
      return {
        text: war ? 'A boy in uniform stands at the door with a yellow envelope. Everyone in the street knows what that might mean in wartime. Your heart is in your throat. What will you do?' : 'A boy on a bicycle is at the door with a yellow envelope. Telegrams are not for ordinary news, and the whole household has gone quiet. What will you do?',
        choices: [ch('open', 'Open it at once', '📩'), ch('wait', 'Wait for the grown-ups', '🕯️'), ch('tip', 'Give the boy a coin and a drink of water', '🥤')],
        data: { war: war ? 1 : 0 },
      }
    },
    resolve: {
      open: (g, x) => {
        const war = x.n('war') === 1
        const bad = war ? chance(g, 0.35) : chance(g, 0.12)
        if (bad) say(g, x, 'Bad News', war ? 'The telegram was from the services: a relative was missing in action. It was short and polite and nobody in the room could speak for a long time.' : 'The telegram was from a relative: someone in the family had passed away. You read it twice before you could understand it.', war ? 'A telegram brought bad news about a relative at the war.' : 'A telegram brought news of a death in the family.', { happiness: -9 }, 'bad')
        else say(g, x, 'Good News', pick(g, ['The telegram was from an uncle overseas: a new baby cousin, and everyone was well. The room erupted in laughter and tea.', 'The telegram was about a job offer for a relative, and the whole house danced around the kitchen.', 'The telegram was from a soldier on leave: he was safe and coming home. Nobody stopped smiling all week.']), 'A telegram brought good news.', { happiness: 6 }, 'good')
      },
      wait: (g, x) => {
        const p = aParent(g)
        say(g, x, 'The Longest Wait', `You put the envelope on the table and sat with it for what felt like an hour until your ${parentWord(p)} came home. Together you opened it. News is somehow easier shared, whatever it says.`, 'I waited for my family before opening a telegram.', { happiness: -1, rel: 3 })
      },
      tip: (g, x) => say(g, x, 'A Kind Word', 'You gave the boy a coin and a cup of water. He told you he had run eleven miles that day, and you saw how young he was. It was a small kindness that you remembered.', 'I gave the telegram boy a drink of water and a coin.', { money: -itemCost(g, 'wage', 0.2), karma: 4, happiness: 1 }, 'good'),
    },
  },

  {
    id: 'era.1900.firstWireless',
    emoji: '📻',
    title: 'The First Wireless',
    minAge: 5,
    maxAge: 70,
    once: true,
    weight: 26,
    when: (g) => g.year >= 1921 && g.year <= 1945 && techOdds(g, 'radio') >= 0.03 && techOdds(g, 'radio') <= 0.7,
    setup: (g) => {
      const cost = itemCost(g, 'wireless')
      const adult = !minor(g)
      const kitCost = Math.max(1, Math.round(cost * 0.12))
      const choices = [ch('build', `Build a crystal set from a kit (${money(kitCost)})`, '🔧')]
      if (adult && g.character.money >= cost) choices.push(ch('buy', `Buy a factory-made set (${money(cost)})`, '📻'))
      if (!adult) choices.push(ch('beg', 'Beg the family for a set', '🙏'))
      choices.push(ch('listen', 'Listen at the neighbor’s window', '👂'))
      return {
        text: 'Everyone on your street is talking about the same thing: voices and music coming out of the air. A neighbor has a wireless set, and it is the talk of the town. You want one. What will you do?',
        choices,
        data: { cost, kit: kitCost },
      }
    },
    resolve: {
      build: (g, x) => {
        const win = chance(g, 0.3 + g.character.stats.smarts / 180)
        say(g, x, win ? 'It Works!' : 'Only Static', win ? 'You wound the coil, fixed the crystal and clamped on the headphones. Faint at first, then clear, a band was playing in a city fifty miles away. You stayed up listening until the lamp went out.' : 'You wound the coil and fiddled with the crystal for a week and got nothing but crackles. You learned a lot, mostly about patience, and a little about electricity.', win ? 'I built a crystal wireless set and heard a band playing from far away.' : 'I tried to build a wireless set and only got static.', { money: -x.n('kit'), smarts: win ? 3 : 1, happiness: win ? 8 : -1 }, win ? 'good' : 'neutral')
      },
      buy: (g, x) => say(g, x, 'The Wireless Arrives', 'The shop sent a boy with the set on a handcart. It sat in the best corner of the room, and the neighbors came to listen. The family arranged itself in a half circle around it for the evening program.', 'I bought a wireless set and the whole family gathered round it.', { money: -x.n('cost'), happiness: 8, smarts: 1 }, 'good'),
      beg: (g, x) => {
        const cost = x.n('cost')
        const can = householdMoney(g) >= cost * 3
        const yes = can && chance(g, 0.55)
        say(g, x, yes ? 'A Set for the House' : 'Not This Year', yes ? 'You begged, did chores and promised to be good. The following month a wireless set appeared in the front room, and your father twiddled the dial more than you did.' : 'You begged and promised, and the answer was that money was tight and the set would have to wait. You listened at the neighbor’s window instead.', yes ? 'My family bought a wireless set at last.' : 'My family couldn’t afford a wireless set yet.', { happiness: yes ? 9 : -2, rel: yes ? 2 : -1 }, yes ? 'good' : 'neutral')
      },
      listen: (g, x) => {
        const caught = chance(g, 0.3)
        say(g, x, caught ? 'Invited In' : 'Eavesdropping', caught ? 'You stood under the neighbor’s window for an hour until a head popped out. “Come in and sit down before you catch your death,” said the neighbor, who made you tea and let you listen by the fire.' : 'You crouched under the neighbor’s window and heard a whole concert in tatters. Only the dog noticed you.', caught ? 'A neighbor invited me in to listen to the wireless.' : 'I listened to the neighbor’s wireless from under the window.', { happiness: caught ? 5 : 2, karma: caught ? 1 : -1 }, 'good')
      },
    },
  },

  {
    id: 'era.1900.gramophone',
    emoji: '🎶',
    title: 'The Gramophone',
    minAge: 5,
    maxAge: 70,
    once: true,
    weight: 18,
    when: (g) => g.year >= 1900 && g.year <= 1935 && at(g, ...WESTERN, 'latam', 'brazil', 'japan') && !poorFamily(g),
    setup: () => ({
      text: 'A big brass horn gleams on the parlor table: the family has a gramophone. It has three records, a handle that must be wound just so, and a new needle for each play. Everyone wants a turn. What will you do?',
      choices: [ch('crank', 'Wind it and play for the whole family', '🎵'), ch('jazz', 'Sneak on a record your parents dislike', '🎷'), ch('dance', 'Dance in the parlor to the music', '💃')],
    }),
    resolve: {
      crank: (g, x) => {
        const p = aParent(g)
        say(g, x, 'Family Concert', 'You wound the handle, set the needle down and the parlor filled with music. Grandmother hummed, Father tapped his foot and nobody spoke until the record finished and you had to wind it again.', 'I played the gramophone for the whole family.', { happiness: 5, rels: p ? [{ p, d: 3 }] : [] }, 'good')
      },
      jazz: (g, x) => {
        const caught = chance(g, 0.5)
        say(g, x, caught ? 'Turn That Off!' : 'The Secret Record', caught ? 'You put on the lively new record and had a minute of bliss before your father stormed in and lifted the needle. “That is not music, it is a noise.” The record vanished the next day.' : 'You put on the lively new record in the afternoon while the grown-ups were out, and played it till your arm hurt from winding. You hid it again in time.', caught ? 'I played a forbidden jazz record and my father confiscated it.' : 'I played a jazz record in secret while the house was empty.', { happiness: caught ? -2 : 6, karma: -1, rel: caught ? -3 : 0 }, caught ? 'bad' : 'neutral')
      },
      dance: (g, x) => say(g, x, 'Parlor Dance', 'You danced around the furniture until the record ran down and your steps slowed to a crawl. You collapsed on the rug, out of breath and delighted.', 'I danced in the parlor to a gramophone record.', { happiness: 5, health: 1, athleticism: 1 }, 'good'),
    },
  },

  {
    id: 'era.1900.pennyBank',
    emoji: '🪙',
    title: 'Saving Day',
    minAge: 6,
    maxAge: 13,
    cooldown: 5,
    weight: 10,
    when: (g) => g.year >= 1905 && g.year <= 1955 && inSchool(g) && at(g, ...WESTERN),
    setup: (g) => {
      const coin = Math.max(1, itemCost(g, 'candy', 2))
      return {
        text: `Every Friday the school collects pennies for the savings bank, and the teacher writes each child’s name on the chart. You have one coin in your pocket, and the candy shop is on the way home. What will you do?`,
        choices: [ch('save', 'Put it in the savings bank', '🏦'), ch('spend', 'Spend it on sweets', '🍬'), ch('share', 'Give it to a friend who has none', '🤝')],
        data: { coin },
      }
    },
    resolve: {
      save: (g, x) => say(g, x, 'A Saver', 'You handed over the coin and watched the teacher write it down. By the end of the year you had a small, real savings book with your own name in it.', 'I put my pennies in the school savings bank every Friday.', { money: x.n('coin') * 2, happiness: 1, discipline: 3, willpower: 2 }, 'good'),
      spend: (g, x) => say(g, x, 'A Sweet Tooth', 'You bought a stick of licorice and made it last two whole blocks. It was glorious. The teacher’s chart went one name short.', 'I spent my savings-day penny on sweets.', { happiness: 4, discipline: -1 }),
      share: (g, x) => say(g, x, 'A Generous Heart', 'Your friend had nothing to put in, and the shame in her face was awful to see. You pressed your coin into her hand. She never forgot it, and neither did you.', 'I gave my penny to a friend who had none.', { karma: 5, happiness: 3 }, 'good'),
    },
  },

  {
    id: 'era.1900.sweetRation',
    emoji: '🍬',
    title: 'The Sweet Ration',
    minAge: 4,
    maxAge: 14,
    cooldown: 4,
    weight: 22,
    when: (g) => (g.year >= 1942 && g.year <= 1953 && at(g, 'uk', 'dominion')) || (g.year >= 1943 && g.year <= 1950 && at(g, 'europe')),
    setup: () => ({
      text: 'This week’s sweet ration is a tiny paper bag that has to last a fortnight. Your sibling’s bag is the same size, and the friend next door has a bigger one. The shopkeeper is looking the other way. What will you do?',
      choices: [ch('hoard', 'Eat one a day and make it last', '⏳'), ch('swap', 'Swap with a friend for something better', '🔄'), ch('share', 'Share with your sibling', '🤝')],
    }),
    resolve: {
      hoard: (g, x) => say(g, x, 'Willpower', 'You counted them out: one a day, no more. It took iron discipline and a hiding place that the dog couldn’t find. It was the best candy you ever tasted.', 'I made my sweet ration last a fortnight.', { discipline: 4, willpower: 3, happiness: 2 }, 'good'),
      swap: (g, x) => {
        const win = chance(g, 0.5)
        say(g, x, win ? 'A Good Bargain' : 'Fleeced', win ? 'You bargained with the boy next door and came away with two toffees and a marble for your humbugs. A fine day’s work.' : 'You traded your sweets for what turned out to be a rather ordinary button. The boy next door is now very popular.', win ? 'I swapped my sweet ration at a profit.' : 'I swapped my sweet ration for a button.', { happiness: win ? 4 : -3, smarts: win ? 1 : 0 }, win ? 'good' : 'bad')
      },
      share: (g, x) => {
        const sib = siblings(g).find((s) => s.alive && s.age < 18)
        say(g, x, 'Sharing', sib ? `You split your ration with ${sib.firstName}, who was astonished. Neither of you could make a half last more than an afternoon, but it was a good afternoon.` : 'You split your ration with a friend, who was astonished. It was gone in an afternoon, but it was a good afternoon.', 'I shared my sweet ration.', { karma: 4, happiness: 3, rel: sib ? 4 : 0 }, 'good')
      },
    },
  },

  {
    id: 'era.1900.brownie',
    emoji: '📷',
    title: 'The Box Camera',
    minAge: 8,
    maxAge: 40,
    once: true,
    weight: 14,
    when: (g) => g.year >= 1900 && g.year <= 1940 && at(g, ...WESTERN, 'japan', 'latam', 'brazil', 'india'),
    setup: () => ({
      text: 'A relative has given you a simple box camera, a Kodak Brownie. It takes six pictures on a roll, and developing them costs money. Everybody wants to be photographed, and you want to be the photographer. What will you do?',
      choices: [ch('family', 'Take the family portrait', '👨‍👩‍👧'), ch('street', 'Photograph the neighbors for a few coins', '🏘️'), ch('nature', 'Photograph birds and trees', '🌳')],
    }),
    resolve: {
      family: (g, x) => say(g, x, 'The Family Album', 'You lined everyone up in the sun and told them not to move. Four of the six pictures had a thumb in them, but the fifth was perfect and sat on the mantel for fifty years.', 'I took the family’s first photograph with a box camera.', { happiness: 5, rel: 3, smarts: 1 }, 'good'),
      street: (g, x) => say(g, x, 'Neighborhood Photographer', 'You charged the neighbors a few coins for a portrait on their front step. Business was better than expected, and you learned that people will pay surprisingly well to look their best.', 'I took photographs for the neighbors and earned a few coins.', { money: itemCost(g, 'wage', 3), happiness: 3, smarts: 1 }, 'good'),
      nature: (g, x) => say(g, x, 'The Naturalist', 'You spent a whole spring chasing birds with the camera and got nothing but blurs. The last picture, a surprised sparrow, was perfect, and it hung over your bed for years.', 'I took photographs of birds and trees with a box camera.', { smarts: 2, happiness: 4, willpower: 1 }, 'good'),
    },
  },

  {
    id: 'era.1900.wishBook',
    emoji: '📖',
    title: 'The Wish Book',
    minAge: 5,
    maxAge: 14,
    cooldown: 7,
    weight: (g) => (richFamily(g) ? 3 : 12),
    when: (g) => g.year >= 1900 && g.year <= 1945 && at(g, 'us', 'dominion', 'uk'),
    setup: () => ({
      text: 'The big mail-order catalog has arrived, thick as a brick and soft as a pillow. You have been given permission to circle one thing for your birthday. The pages are full of toys, boots, bicycles and magic tricks. What will you pick?',
      choices: [ch('toy', 'A toy train', '🚂'), ch('boots', 'A pair of sturdy boots', '🥾'), ch('book', 'A book of adventures', '📕')],
    }),
    resolve: {
      toy: (g, x) => say(g, x, 'A Toy Train', 'Six weeks later a box arrived, with a tin locomotive and a little bit of track. You ran it around the kitchen until the spring broke, and nothing could have made you happier.', 'I got a toy train from the mail-order catalog.', { happiness: 7 }, 'good'),
      boots: (g, x) => say(g, x, 'Sensible Choice', 'Your parents were very impressed by your good sense, and you were very impressed by your parents’ idea of a present. The boots were comfortable and lasted two winters.', 'I chose a pair of boots from the catalog.', { happiness: 2, health: 1, rel: 3 }),
      book: (g, x) => say(g, x, 'Lost in a Book', 'The book came wrapped in brown paper, and you read it three times under the covers. By the end, the pirates were more real than your teachers.', 'I got an adventure book from the mail-order catalog.', { happiness: 6, smarts: 3 }, 'good'),
    },
  },

  {
    id: 'era.1900.churchSocial',
    emoji: '⛪',
    title: 'The Church Social',
    minAge: 8,
    maxAge: 30,
    cooldown: 6,
    weight: 12,
    when: (g) => g.year >= 1900 && g.year <= 1950 && at(g, 'us', 'dominion', 'uk', 'europe', 'brazil', 'latam'),
    setup: () => ({
      text: 'The church is holding a social in the hall: lemonade, sandwiches, sack races and a cake raffle. Everyone from the minister to the baby will be there, and the whole town’s gossip will be too. What will you do?',
      choices: [ch('cake', 'Bake a cake for the raffle', '🎂'), ch('game', 'Join the sack race', '🏃'), ch('wall', 'Hang about the wall with friends', '🧱')],
    }),
    resolve: {
      cake: (g, x) => {
        const good = chance(g, 0.5 + g.character.stats.smarts / 300)
        say(g, x, good ? 'Best in Show' : 'A Sunken Middle', good ? 'Your cake rose high, tasted of vanilla and won the raffle prize. The minister’s wife asked for the recipe, and you were insufferable all week.' : 'Your cake sank in the middle, but an honest slice was eaten out of kindness by the minister. You decided to specialize in something else.', good ? 'My cake won a prize at the church social.' : 'My cake sank at the church social.', { happiness: good ? 6 : -1, smarts: good ? 1 : 0, karma: 1 }, good ? 'good' : 'neutral')
      },
      game: (g, x) => {
        const win = chance(g, 0.3 + g.character.hidden.athleticism / 200)
        say(g, x, win ? 'First Past the Post' : 'Face-first', win ? 'You hopped like a kangaroo and crossed the line first in the sack race. The prize was a bag of marbles and a ribbon.' : 'You hopped three feet and fell flat on your face to uproarious laughter. You got a cup of lemonade for your trouble.', win ? 'I won the sack race at the church social.' : 'I fell on my face in the sack race at the church social.', { happiness: win ? 6 : 1, athleticism: 1 }, win ? 'good' : 'neutral')
      },
      wall: (g, x) => say(g, x, 'Gossip Corner', 'You leaned on the wall with your friends and learned who had been walking out with whom, who had a new hat and who owed the grocer. By the time the lemonade ran out, you knew everything.', 'I spent the church social catching up on all the gossip.', { happiness: 3, smarts: 0 }),
    },
  },
])
