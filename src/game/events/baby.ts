// Baby & toddler events (ages 0-7): first words, mashed vegetables, vaccinations,
// tantrums at the grocery store... Mostly harmless, a little bit of smarts/looks.
import { locale, localPick } from '../data/locales'
import { chance, pick } from '../rng'
import { pickLine } from '../text/pick'
import type { GameState, Person } from '../types'
import { aParent, ch, defineEvents, mother, say, siblings, v } from './helpers'
import { cars, common, landline } from './era'

/** "your mother" / "your caretaker" for baby events. */
function carer(g: GameState): { p: Person | undefined; word: string } {
  const m = mother(g) ?? aParent(g)
  if (!m) return { p: undefined, word: 'caretaker' }
  return { p: m, word: m.gender === 'female' ? 'mother' : 'father' }
}

const FOODS = ['@1985 mashed avocado', 'puréed peas', 'strained spinach', 'mushy carrots', 'beet purée', 'pumpkin mush']
const SNACKS = ['candy bar', 'bag of chips', 'lollipop', 'giant cookie', 'box of gummy bears', 'chocolate egg']
/** Free samples anyone might hand out at a supermarket (no pork by default). */
const SAMPLES = ['@1970 mini pizza bites', 'cheese cubes', 'chocolate brownies', 'cookies', 'fruit slices']
const COLORS = ['red', 'purple', 'green', 'blue', 'orange', 'pink']

export const BABY_EVENTS = defineEvents([
  {
    id: 'baby.mouthNoises',
    emoji: '👄',
    title: 'Mouth Noises',
    minAge: 1,
    maxAge: 2,
    once: true,
    weight: 14,
    setup: (g) => {
      const c = carer(g)
      return {
        text: `Your ${c.word} is cooing at you in a soft voice. You feel inclined to respond. How will you react?`,
        choices: [ch('mama', "Say 'ma ma'"), ch('dada', "Say 'da da'"), ch('cry', 'Cry'), ch('spit', 'Spit')],
        person: c.p,
        data: { word: c.word },
      }
    },
    resolve: {
      mama: (g, x) =>
        say(g, x, ['Big moment', 'First word!'], `You said "ma ma"! Your ${x.s('word')} nearly fainted with joy and smothered you in kisses.`, `I said "ma ma" and my ${x.s('word')} became ecstatic. I was held, kissed and fed immediately.`, { happiness: 16, smarts: 8, rel: 6 }, 'good'),
      dada: (g, x) =>
        say(g, x, ['Close enough', 'Wrong parent'], `You said "da da." Your ${x.s('word')} looked a little disappointed, but fed you promptly anyway.`, `I said "da da." My ${x.s('word')} was a little disappointed but fed me anyway.`, { smarts: 4, rel: 2 }),
      cry: (g) =>
        say(g, null, 'Wah', 'You burst into tears, overwhelmed by the intricacies of human language.', 'I cried after finding myself confused by the intricacies of human language.', { happiness: -16, smarts: -4 }, 'bad', '😭'),
      spit: (g, x) =>
        say(g, x, ['Gross', 'Bullseye'], `You spat a mouthful of milk right into your ${x.s('word')}'s face. They were not amused.`, `I spat milk onto my ${x.s('word')}'s face. They weren't happy!`, { rel: -4, happiness: 4 }, 'neutral', '💦'),
    },
  },
  {
    id: 'baby.mashedFood',
    emoji: '🥑',
    title: 'Dinner Time',
    minAge: 1,
    maxAge: 3,
    setup: (g) => {
      const c = carer(g)
      const food = v(g, FOODS)
      return {
        text: `It's dinner time and, once again, your ${c.word} is swirling a spoonful of ${food} through the air like an airplane. The spoon approaches your lips. What will you do?`,
        choices: [ch('eat', 'Eat it'), ch('cry', 'Cry'), ch('slap', 'Slap the spoon')],
        person: c.p,
        data: { food, word: c.word },
      }
    },
    resolve: {
      eat: (g, x) =>
        say(g, x, ['Good eater', 'Yum?'], `You ate the ${x.s('food')}. Your ${x.s('word')} gave you a big smile and a kiss.`, `I ate the ${x.s('food')} my ${x.s('word')} shoveled into my face.`, { smarts: 8, health: 2, rel: 4 }, 'good'),
      cry: (g, x) =>
        say(g, x, 'Negotiator', `You wailed until your ${x.s('word')} gave up and handed you a banana instead.`, `I wailed when my ${x.s('word')} tried to feed me ${x.s('food')}. I got a banana instead.`, { happiness: 4 }),
      slap: (g, x) =>
        say(g, x, ['Splat', 'Not today'], `You slapped the spoon and painted the kitchen wall with ${x.s('food')}.`, `I slapped a spoonful of ${x.s('food')} onto the floor.`, { happiness: 6, rel: -3 }, 'neutral', '💥'),
    },
  },
  {
    id: 'baby.cribToys',
    emoji: '🧸',
    title: 'Toying Around',
    minAge: 0,
    maxAge: 2,
    setup: () => ({
      text: "You're lying in your crib. Luckily, there are a few things nearby to keep you occupied. Which will you reach for?",
      choices: [ch('truck', 'The fire truck', '🚒'), ch('book', 'The picture book', '📖'), ch('xylo', 'The xylophone', '🎶'), ch('socks', 'A pair of dirty socks', '🧦')],
    }),
    resolve: {
      truck: (g) => say(g, null, 'Vroom', 'You pushed the toy fire truck around your crib making siren noises.', 'I played with a toy fire truck in my crib.', { smarts: 4, happiness: 4 }),
      book: (g) => say(g, null, 'Little reader', 'You stared at the pictures in your book with deep concentration. The duck is your favorite.', 'I looked at a picture book in my crib.', { smarts: 8 }, 'good'),
      xylo: (g) => say(g, null, ['Musical genius', 'Encore!'], 'You banged on the xylophone until everyone in the house had a headache.', 'I banged on a xylophone in my crib.', { smarts: 4, happiness: 6 }),
      socks: (g) => say(g, null, 'Why', 'You chewed on a pair of dirty socks. Nobody knows why.', 'I played with a pair of dirty socks.', { smarts: -4, happiness: 2 }, 'neutral', '🧦'),
    },
  },
  {
    id: 'baby.cheekSqueezer',
    emoji: '👵',
    title: 'Tolerance',
    minAge: 1,
    maxAge: 4,
    setup: (g) => {
      const c = carer(g)
      return {
        text: `While playing at the park, a big-haired, colorful lady chatting with your ${c.word} squeezes your cheek and tries to pick you up. How will you react?`,
        choices: [ch('hit', 'Hit her'), ch('scream', 'Scream'), ch('up', 'Up, up!')],
        person: c.p,
        data: { word: c.word },
      }
    },
    resolve: {
      hit: (g, x) =>
        say(g, x, ['Right hook', 'Knockout'], 'You clocked the strange lady right in the jaw. Your parent apologized for ten straight minutes.', 'I clocked a weird lady in the jaw after she tried to pick me up at the park.', { happiness: 4, rel: -4, karma: -2 }, 'neutral', '🥊'),
      scream: (g) =>
        say(g, null, 'Stranger danger', 'You screamed so loudly that a flock of pigeons took off across the park.', 'I screamed after a strange-looking woman tried to lift me up at the park.', { looks: -4 }),
      up: (g) =>
        say(g, null, 'Charmer', 'You let the lady hold you. She declared you the most beautiful baby she had ever seen.', 'I allowed a strange-looking woman to hold me at the park.', { looks: 8, happiness: 4 }, 'good'),
    },
  },
  {
    id: 'baby.vaccination',
    emoji: '💉',
    title: 'Vaccination',
    minAge: 1,
    maxAge: 4,
    once: true,
    weight: 14,
    setup: (g) => {
      const p = aParent(g)
      const who = p ? `Your ${p.gender === 'female' ? 'mother' : 'father'}` : 'Your caretaker'
      return {
        text: `${who} is taking you to the doctor's office to get vaccinated. How will you behave?`,
        choices: [ch('bite', p ? `Bite ${p.gender === 'female' ? 'her' : 'him'}` : 'Bite them'), ch('tantrum', 'Throw a tantrum'), ch('calm', 'Try to stay calm')],
        person: p,
      }
    },
    resolve: {
      bite: (g, x) =>
        say(g, x, ['Chomp', 'Little piranha'], 'You bit your parent on the arm. You still got the shot.', 'I bit my parent when they took me to get vaccinated.', { happiness: -8, rel: -8, health: 3 }, 'bad', '🦷'),
      tantrum: (g, x) =>
        say(g, x, 'Meltdown', 'You threw an epic tantrum in the waiting room. You still got the shot, plus a lollipop for surviving.', 'I threw a tantrum when I was taken to get vaccinated.', { happiness: -16, rel: -3, health: 3 }, 'bad'),
      calm: (g, x) =>
        say(g, x, ['Brave', 'Tough cookie'], "You stayed calm and barely flinched. The nurse said you were the bravest kid she'd seen all week.", 'I remained calm when I got vaccinated.', { happiness: 4, health: 4, rel: 3 }, 'good', '⭐'),
    },
  },
  {
    id: 'baby.teething',
    emoji: '🦷',
    title: 'Teething',
    minAge: 0,
    maxAge: 2,
    setup: (g) => {
      const c = carer(g)
      return {
        text: "Your gums hurt and you're looking for something within reach to chew on. What will you grab?",
        choices: [
          ch('marker', g.year >= 1955 ? 'A permanent marker' : 'A crayon'),
          g.year >= 1980 && common(g, 'tv') ? ch('remote', 'The TV remote') : ch('remote', 'A wooden spoon'),
          common(g, 'mobilePhone') ? ch('phone', `My ${c.word}'s phone`) : ch('phone', `My ${c.word}'s house keys`),
          ch('ring', g.year >= 1950 ? 'A rubber chew ring' : 'A teething rusk'),
        ],
        person: c.p,
        data: { word: c.word },
      }
    },
    resolve: {
      marker: (g) => {
        const tool = g.year >= 1955 ? 'permanent marker' : 'crayon'
        say(g, null, 'Blue mouth', `You chewed on a ${tool}. Your tongue will be blue for a week.`, `I chewed on a ${tool} to soothe my gums.`, { health: -4, looks: -2 }, 'bad', '🖍️')
      },
      remote: (g) =>
        g.year >= 1980 && common(g, 'tv')
          ? say(g, null, 'Channel surfer', 'You gnawed the TV remote and somehow ordered a pay-per-view boxing match.', 'I chewed on the TV remote to soothe my gums.', { happiness: 4 })
          : say(g, null, 'Drummer', 'You gnawed the wooden spoon, then used it to drum on every pot in the kitchen.', 'I chewed on a wooden spoon to soothe my gums.', { happiness: 4 }),
      phone: (g, x) =>
        common(g, 'mobilePhone')
          ? say(g, x, 'Drool proof?', `You slobbered all over your ${x.s('word')}'s phone. It now only works when held at an angle.`, `I chewed on my ${x.s('word')}'s phone to soothe my gums.`, { happiness: 4, rel: -3 })
          : say(g, x, 'Jingle jangle', `You gnawed your ${x.s('word')}'s house keys. They were sticky for a week.`, `I chewed on my ${x.s('word')}'s house keys to soothe my gums.`, { happiness: 4, rel: -2 }),
      ring: (g) =>
        g.year >= 1950
          ? say(g, null, 'Sweet relief', 'You chomped on the chew ring. Ahhh, much better.', 'I chewed on a rubber chew ring to soothe my gums.', { happiness: 6, health: 2 }, 'good')
          : say(g, null, 'Sweet relief', 'You gummed a teething rusk into a soggy paste. Ahhh, much better.', 'I chewed on a teething rusk to soothe my gums.', { happiness: 6, health: 2 }, 'good'),
    },
  },
  {
    id: 'baby.sweetDreams',
    emoji: '🛏️',
    title: 'Sweet Dreams',
    minAge: 1,
    maxAge: 5,
    setup: () => ({
      text: "It's late at night and you are completely wide awake. You've already been tucked in twice. What will you do?",
      choices: [ch('play', 'Get up and play'), ch('sleep', 'Try to sleep'), ch('parents', 'Go get my parents')],
    }),
    resolve: {
      play: (g) => say(g, null, 'Night owl', 'You quietly got up and built a block tower in the dark. Then you stepped on a block.', 'I got up and played after I couldn\'t fall asleep.', { happiness: 6, health: -2 }),
      sleep: (g) => say(g, null, 'Out like a light', 'You squeezed your eyes shut and willed yourself to sleep. It worked!', 'I managed to fall asleep after setting my mind to it.', { smarts: 4, health: 2 }, 'good', '😴'),
      parents: (g) => {
        const p = aParent(g)
        say(g, null, 'Monster check', p ? `You toddled into your parents' room. ${p.firstName} grumbled but checked under your bed for monsters.` : 'You went looking for a grown-up. Someone grumbled and checked under your bed for monsters.', 'I got my parents up in the middle of the night.', { happiness: 4, rels: [{ p, d: -2 }] })
      },
    },
  },
  {
    id: 'toddler.jumpAround',
    emoji: '🍂',
    title: 'Jump Around',
    minAge: 2,
    maxAge: 6,
    setup: (g) => {
      // Autumn leaf piles are a temperate thing; tropical and desert parks have sand piles.
      const pile = locale(g).climate === 'tropical' || locale(g).climate === 'arid' ? 'sand' : 'leaves'
      return {
        text: 'While at the park, you see many awesome things you want to jump in. Which will you choose?',
        choices: [ch('leaves', `A pile of ${pile}`), ch('puddle', 'A huge puddle'), ch('lake', 'The lake'), ch('poop', 'A pile of horse droppings')],
        data: { pile },
      }
    },
    resolve: {
      leaves: (g, x) =>
        x.s('pile') === 'sand'
          ? say(g, x, 'Crunch', 'You cannonballed into a giant pile of sand. You were finding it in your ears for a week. Best day ever.', 'I had a great time jumping into a big pile of sand at the park.', { happiness: 8 }, 'good')
          : say(g, x, 'Crunch', 'You cannonballed into a giant pile of leaves. Best day ever.', 'I had a great time jumping into a big pile of leaves at the park.', { happiness: 8 }, 'good'),
      puddle: (g) => say(g, null, 'Splash zone', 'You stomped through an enormous puddle and soaked everyone within ten feet.', 'I had a great time splashing in an enormous puddle at the park.', { happiness: 6, looks: 4 }),
      lake: (g) => say(g, null, ['Fully clothed', 'Swim team'], 'You ran straight into the lake with all your clothes on. A very wet adult fished you out.', 'I ran and jumped into a lake with all of my clothes on.', { happiness: 8, smarts: -4, looks: 4 }),
      poop: (g) => say(g, null, ['Why?!', 'Regret'], 'You leapt into a pile of horse droppings. You were hosed off in the parking lot.', 'I jumped into a pile of horse droppings at the park.', { happiness: -6, looks: -8, health: -2 }, 'bad', '💩'),
    },
  },
  {
    id: 'toddler.wetPants',
    emoji: '😬',
    title: 'Wet Pants',
    minAge: 3,
    maxAge: 6,
    setup: () => ({
      text: 'While playing at the park, you accidentally wet your pants. What will you do?',
      choices: [ch('home', 'Go home'), ch('fountain', 'Splash water on myself'), ch('own', 'Own it')],
    }),
    resolve: {
      home: (g) => say(g, null, 'Walk of shame', 'You went home with your head hung low.', 'I went home with my head hung low after I wet myself at the park.', { happiness: -4, looks: -4 }, 'bad'),
      fountain: (g) => say(g, null, ['Genius', 'Cover story'], 'You "accidentally" sprayed yourself at the drinking fountain. Nobody suspected a thing.', 'I splashed myself at the drinking fountain so nobody would notice I wet my pants.', { smarts: 16 }, 'good', '⛲'),
      own: (g) => say(g, null, 'Confidence', 'You laughed it off and everyone laughed with you. Legend.', 'I joked with my friends after I wet myself and we all had a good laugh.', { happiness: 4, smarts: 4 }),
    },
  },
  {
    id: 'toddler.toyGrab',
    emoji: '😲',
    title: 'Favorite Toy',
    minAge: 2,
    maxAge: 6,
    setup: (g) => {
      const toy = pickLine(g, ['teddy bear', 'toy dinosaur', 'race car', 'stuffed bunny', 'action figure', 'rubber duck'])
      const boy = pickLine(g, ['little boy', 'little girl'])
      return {
        text: `You're playing with some kids when suddenly a ${boy} grabs your ${toy} right out of your hands. How will you react?`,
        choices: [ch('let', 'Let them play with it'), ch('cry', 'Cry'), ch('grab', 'Grab it back'), ch('tattle', 'Be a tattletale')],
        data: { toy, boy },
      }
    },
    resolve: {
      let: (g, x) => say(g, x, 'Sharing is caring', `You let the ${x.s('boy')} play with your ${x.s('toy')}. Your parents were very proud.`, `I let another kid play with my ${x.s('toy')}.`, { smarts: 4, karma: 3 }, 'good'),
      cry: (g, x) => say(g, x, 'Waterworks', `You sobbed until a grown-up returned your ${x.s('toy')}.`, `I cried when a kid took my ${x.s('toy')}.`, { happiness: -4 }),
      grab: (g, x) => say(g, x, 'Mine!', `You yanked your ${x.s('toy')} right back. The ${x.s('boy')} burst into tears.`, `I grabbed my ${x.s('toy')} back when another kid took it.`, { happiness: 4, karma: -2 }),
      tattle: (g, x) => say(g, x, 'Snitch', `You told on the ${x.s('boy')}. They got a time-out and you got your ${x.s('toy')} back.`, `I tattled on a kid who took my ${x.s('toy')}.`, { happiness: 2 }),
    },
  },
  {
    id: 'toddler.bees',
    emoji: '🐝',
    title: 'Bee Careful',
    minAge: 3,
    maxAge: 8,
    setup: () => ({
      text: 'While playing on the sidewalk outside your home, you notice a group of buzzing insects flying in and out of a nearby lamp post. What will you do?',
      choices: [ch('observe', 'Observe them'), ch('ignore', 'Disregard them'), ch('rock', 'Throw a rock at them')],
    }),
    resolve: {
      observe: (g) => say(g, null, 'Little scientist', 'You carefully watched the bees come and go. You learned that they are, in fact, very busy.', 'I carefully examined some bees I spotted outside my home.', { smarts: 16 }, 'good'),
      ignore: (g) => say(g, null, 'Not my business', 'You ignored the bees. The bees ignored you. Everybody won.', 'I ignored some bees I spotted outside my home.', {}),
      rock: (g) => say(g, null, ['Bad idea', 'Swarmed'], 'You threw a rock at the hive and were chased home by a furious swarm. You got stung four times.', 'I threw a rock at a beehive and was chased home by a swarm of angry bees.', { smarts: -8, happiness: -8, health: -4 }, 'bad', '🐝'),
    },
  },
  {
    id: 'toddler.bigFlex',
    emoji: '🤔',
    title: 'Big Flex',
    minAge: 2,
    maxAge: 5,
    setup: () => ({
      text: "You're deciding which skill you'll perfect to impress everyone you know. Which will you choose?",
      choices: [ch('teeth', 'Tooth brushing skills'), ch('trike', 'Tricycle skills'), ch('writing', 'Writing skills'), ch('blocks', 'Building block skills')],
    }),
    resolve: {
      teeth: (g) => say(g, null, 'Sparkly', 'You practiced brushing until you could clean every tooth without missing a spot. Your dentist wept.', 'I worked intensely on my tooth brushing skills.', { smarts: 8, looks: 16 }, 'good', '🪥'),
      trike: (g) => say(g, null, 'Speed demon', 'You trained until you could ride your tricycle to the corner and back in under a minute.', 'I trained until I could ride my tricycle to the corner and back in under a minute.', { looks: 16, health: 4 }, 'good', '🚲'),
      writing: (g) => say(g, null, 'Penmanship', 'You practiced until you could write your name flawlessly. Mostly. The S is still backwards.', 'I practiced my penmanship until I could write my name.', { smarts: 8 }, 'good', '✏️'),
      blocks: (g) => say(g, null, 'Architect', 'You stacked 25 blocks into a tower. Then the dog knocked it over.', 'I developed my block stacking skills until I could stack 25 blocks.', { smarts: 8 }, 'good', '🧱'),
    },
  },
  {
    id: 'toddler.mud',
    emoji: '💩',
    title: 'Mud?',
    minAge: 2,
    maxAge: 6,
    setup: () => ({
      text: "While playing outside, you notice a neat pile of brown 'mud' swirled on the sidewalk. What will you do?",
      choices: [ch('throw', 'Throw it'), ch('leave', 'Leave it alone'), ch('stomp', 'Stomp on it')],
    }),
    resolve: {
      throw: (g) => say(g, null, ['That was not mud', 'Oh no'], 'You grabbed it and tossed it. It smelled absolutely horrible and left smudges all over your hands.', 'I grabbed a pile of "mud" off the sidewalk and threw it. It was not mud.', { happiness: -16, smarts: -8 }, 'bad'),
      leave: (g) => say(g, null, 'Wise choice', 'You left the suspicious pile alone. Some instincts are just good.', 'I left a suspicious pile of "mud" alone on the sidewalk.', { smarts: 4 }, 'good'),
      stomp: (g) => say(g, null, 'Squelch', 'You stomped right on it. Your shoes were thrown in the trash.', 'I stomped on a pile of "mud" on the sidewalk. It smelled horrid.', { smarts: -8, happiness: -4 }, 'bad'),
    },
  },
  {
    id: 'toddler.dentalCare',
    emoji: '🦷',
    title: 'Dental Care',
    minAge: 3,
    maxAge: 9,
    setup: () => ({
      text: "You're told to brush your teeth before bed. What will you do?",
      choices: [ch('well', 'Brush them well'), ch('pass', "I'll pass"), ch('mouthwash', 'Mouthwash only'), ch('floss', 'Brush and floss')],
    }),
    resolve: {
      well: (g) => say(g, null, 'Squeaky clean', 'You brushed thoroughly for two whole minutes.', 'I brushed my teeth thoroughly before bed.', { smarts: 4, looks: 8 }, 'good'),
      pass: (g) => say(g, null, 'Cavity club', g.year >= 1980 ? 'You finished your juice box and went to bed without brushing.' : 'You finished your glass of milk and went to bed without brushing.', 'I went to bed without brushing my teeth even though I was told to.', { looks: -4, health: -2 }, 'bad'),
      mouthwash: (g) => say(g, null, 'Shortcut', 'You swished some mouthwash, spat most of it on the mirror, and called it a night.', 'I just rinsed with mouthwash instead of brushing.', { smarts: -4, looks: -4 }),
      floss: (g) => say(g, null, ['Pearly whites', 'Model patient'], 'You brushed AND flossed. Your smile is blinding.', 'I brushed and flossed my teeth to keep my pearly whites shining.', { happiness: 8, smarts: 8, looks: 16 }, 'good', '✨'),
    },
  },
  {
    id: 'toddler.grocery',
    emoji: '🛒',
    title: 'Rejection',
    minAge: 3,
    maxAge: 7,
    when: (g) => !!aParent(g),
    setup: (g) => {
      const p = aParent(g)
      if (!p) return null
      const snack = pickLine(g, SNACKS)
      return {
        text: `Your ${p.gender === 'female' ? 'mother' : 'father'} is refusing to buy you a ${snack} on a trip to the grocery store. What will you do?`,
        choices: [ch('steal', 'Steal it'), ch('tantrum', 'Throw a tantrum'), ch('cool', 'Stay cool')],
        person: p,
        data: { snack },
      }
    },
    resolve: {
      steal: (g, x) => say(g, x, ['Tiny criminal', 'Five-finger discount'], `You secretly stuffed the ${x.s('snack')} into your pocket and ate it ${cars(g) ? 'in the car' : 'on the way home'}. Delicious crime.`, `I secretly stole and ate a ${x.s('snack')} at the grocery store.`, { happiness: 4, karma: -4 }, 'neutral', '🍫'),
      tantrum: (g, x) => say(g, x, 'Aisle 5 meltdown', `You threw yourself on the floor kicking and screaming. You still didn't get the ${x.s('snack')}.`, `I threw a tantrum because I didn't get the ${x.s('snack')} I wanted. I still didn't get it.`, { happiness: -8, rel: -4 }, 'bad'),
      cool: (g, x) => say(g, x, 'Mature', 'You kept your composure. Your parent was so impressed they bought you a sticker.', `I kept my composure when I didn't get the ${x.s('snack')} I wanted.`, { smarts: 4, rel: 4 }, 'good'),
    },
  },
  {
    id: 'toddler.freeSamples',
    emoji: '🍪',
    title: 'Free Samples',
    minAge: 2,
    maxAge: 5,
    // Supermarkets with shopping carts: the US from the forties, most places decades later.
    when: (g) => !!aParent(g) && g.year >= (g.character.countryId === 'us' ? 1940 : 1965),
    setup: (g) => {
      const p = aParent(g)
      if (!p) return null
      const local = localPick(g, 'food')
      const food = local && chance(g, 0.5) ? local : v(g, SAMPLES)
      return {
        text: `You're riding in the cart at the supermarket when you pass a lady handing out free samples of ${food}. You want some, but your parent says no and keeps walking. How will you react?`,
        choices: [ch('kick', 'Kick and scream'), ch('again', 'Ask again, and again'), ch('cry', 'Cry'), ch('nothing', 'Say nothing')],
        person: p,
        data: { food },
      }
    },
    resolve: {
      kick: (g, x) => say(g, x, 'Scene', 'You kicked and screamed so hard the sample lady gave you two just to make it stop.', `I threw a tantrum because I wasn't allowed a free sample of ${x.s('food')}.`, { smarts: -8, happiness: 2, rel: -4 }),
      again: (g, x) => say(g, x, 'Broken record', 'You asked 47 times. The answer remained no.', `I annoyed my parent by repeatedly asking for a free sample of ${x.s('food')}.`, { happiness: -8, smarts: -4, rel: -2 }),
      cry: (g, x) => say(g, x, 'Sad cart', 'You cried all the way to the dairy aisle.', `I cried when I wasn't allowed a free sample of ${x.s('food')}.`, { happiness: -4 }),
      nothing: (g, x) => say(g, x, 'Zen toddler', 'You accepted your fate with quiet dignity.', `I didn't protest when I wasn't allowed a free sample of ${x.s('food')}.`, { smarts: 4, rel: 3 }, 'good'),
    },
  },
  {
    id: 'toddler.napTime',
    emoji: '💤',
    title: 'Nap Time',
    minAge: 2,
    maxAge: 5,
    setup: (g) => ({
      text: "You're being told it's time for a nap, but you want to play some more. What will you do?",
      choices: [ch('kick', 'Kick and scream'), ch('compromise', 'Compromise'), ch('cry', 'Cry'), ch('nap', 'Take a nap')],
      person: aParent(g),
    }),
    resolve: {
      kick: (g, x) => say(g, x, 'Resistance', 'You kicked and screamed, then fell asleep mid-scream.', 'I threw a tantrum because I had to take a nap.', { happiness: -4, rel: -2 }),
      compromise: (g, x) => say(g, x, ['Dealmaker', 'Negotiator'], 'You negotiated ten more minutes of play time. A future lawyer, perhaps.', 'I negotiated an extra ten minutes of play time before my nap.', { smarts: 8, rel: 2 }, 'good', '🤝'),
      cry: (g) => say(g, null, 'Tears', 'You cried until you were too tired to keep crying. Then you napped.', 'I cried because I had to take a nap.', { happiness: -2 }),
      nap: (g) => say(g, null, 'Recharged', 'You took a glorious two-hour nap and woke up a new person.', 'I took a nap when I was told to.', { health: 4, happiness: 2 }, 'good'),
    },
  },
  {
    id: 'toddler.favoriteActivity',
    emoji: '🖍️',
    title: 'Favorite Activity',
    minAge: 1,
    maxAge: 4,
    setup: () => ({
      text: "You're learning new things to do with your body and trying to decide which activity you like most. What will you choose?",
      choices: [ch('color', 'Coloring'), ch('tower', 'Building a tower'), ch('march', 'Marching in a line'), ch('throw', 'Throwing food on the floor')],
    }),
    resolve: {
      color: (g) => say(g, null, 'Artist', 'You decided coloring is the best thing ever. Mostly outside the lines.', 'I decided that coloring was my favorite thing to do.', { smarts: 4, happiness: 4 }, 'good'),
      tower: (g) => say(g, null, 'Engineer', 'You built a really tall tower and knocked it down. Then you did it again. And again.', 'I decided building tall block towers was my favorite thing to do.', { smarts: 4, happiness: 4 }, 'good'),
      march: (g) => say(g, null, 'Left, right', 'You marched around the living room in a perfectly straight line for an hour.', 'I decided that marching in a straight line was my favorite thing to do.', { health: 4, happiness: 2 }),
      throw: (g) => say(g, null, 'Chaos', 'You discovered gravity by hurling spaghetti off your high chair. Science!', 'I had fun throwing food off my high chair.', { happiness: 6, smarts: -2 }),
    },
  },
  {
    id: 'toddler.pretending',
    emoji: '💭',
    title: 'Pretending',
    minAge: 3,
    maxAge: 6,
    setup: (g) => ({
      text: "Pretending to do things is a lot of fun, but you're not sure which game is the best. What will you choose?",
      choices: [ch('house', 'Playing house'), ch('cook', 'Cooking food'), ch('drive', g.year >= 1920 ? 'Driving a car' : 'Driving a horse and cart'), ch('phone', landline(g) ? 'Talking on the phone' : 'Delivering the mail')],
    }),
    resolve: {
      house: (g) => say(g, null, 'Homemaker', 'You set up an elaborate pretend household. The stuffed animals pay rent.', 'I decided that playing house is the most fun thing to do.', { happiness: 4, smarts: 2 }),
      cook: (g) => say(g, null, 'Little chef', `You served your parents a five-course meal of ${g.year >= 1955 ? 'plastic vegetables' : 'mud pies'}. They said it was delicious.`, 'I decided that pretending to cook is the most fun thing to do.', { happiness: 4, smarts: 4 }, 'good'),
      drive: (g) =>
        g.year >= 1920
          ? say(g, null, 'Road rage', 'You "drove" a cardboard box across the living room, honking at the cat.', 'I decided that pretending to drive a car is the most fun thing to do.', { happiness: 6 })
          : say(g, null, 'Giddy-up', 'You "drove" a broomstick horse around the yard, shouting at imaginary traffic.', 'I decided that pretending to drive a horse and cart is the most fun thing to do.', { happiness: 6 }),
      phone: (g) =>
        landline(g)
          ? say(g, null, 'Very busy', 'You held important business calls on a banana all afternoon.', 'I decided that pretending to talk on the phone is the most fun thing to do.', { happiness: 4, smarts: 2 })
          : say(g, null, 'Very busy', 'You delivered important letters to every room in the house. Most of them were blank.', 'I decided that pretending to be a mail carrier is the most fun thing to do.', { happiness: 4, smarts: 2 }),
    },
  },
  {
    id: 'toddler.playground',
    emoji: '🎪',
    title: 'Playground',
    minAge: 3,
    maxAge: 8,
    setup: () => ({
      text: 'Wow, the playground is actually empty! What will you pick?',
      choices: [ch('swing', 'The swings'), ch('slide', 'The slide'), ch('bars', 'The monkey bars'), ch('none', "None, they're too dangerous")],
    }),
    resolve: {
      swing: (g) => say(g, null, 'Higher!', 'You swung so high you briefly considered becoming an astronaut.', 'I played on the swings.', { happiness: 6 }, 'good'),
      slide: (g) => say(g, null, 'Wheee', 'You went down the slide 30 times. Static electricity made your hair stand straight up.', 'I played on the slide.', { happiness: 6 }, 'good'),
      bars: (g) => say(g, null, 'Grip strength', 'You made it all the way across the monkey bars!', 'I played on the monkey bars.', { health: 4, happiness: 4 }, 'good'),
      none: (g) => say(g, null, 'Safety first', 'You sat on the bench and watched the empty playground judgmentally.', "I refused to get on the playground equipment because it's too dangerous.", { happiness: -2 }),
    },
  },
  {
    id: 'toddler.peaNose',
    emoji: '🫛',
    title: 'Nasal Pea',
    minAge: 2,
    maxAge: 5,
    setup: (g) => ({
      text: 'For reasons known only to you, you stuck a pea up your nose. It is not coming out. What will you do?',
      choices: [ch('tell', 'Tell a grown-up'), ch('blow', 'Try to blow it out'), ch('leave', 'Leave it there')],
      person: aParent(g),
    }),
    resolve: {
      tell: (g, x) => say(g, x, 'Rescued', x.p ? `${x.p.firstName} spent 20 minutes extracting the pea with tweezers and a flashlight.` : 'A grown-up spent 20 minutes extracting the pea with tweezers.', 'I stuck a pea up my nose and had to have it removed.', { smarts: 2 }),
      blow: (g) => say(g, null, 'Projectile', 'You blew so hard the pea shot across the room and hit the cat.', 'I blew a pea out of my nose and hit the cat.', { happiness: 6 }, 'good'),
      leave: (g) => say(g, null, 'Doctor visit', 'You left it in there. Three days later, a doctor had to remove it while your parents filled out a very embarrassing form.', 'I had to go to the doctor to have a pea removed from my nose.', { health: -4, happiness: -4 }, 'bad'),
    },
  },
  {
    id: 'toddler.crayonWall',
    emoji: '🖍️',
    title: 'Masterpiece',
    minAge: 2,
    maxAge: 5,
    setup: (g) => {
      const color = pick(g, COLORS)
      return {
        text: `You found a ${color} ${g.year >= 1955 ? 'marker' : 'crayon'} and there's a big, beautiful, empty white wall in the hallway. What will you do?`,
        choices: [ch('draw', 'Create a masterpiece'), ch('paper', 'Ask for some paper'), ch('sibling', siblings(g).length ? 'Draw on my sibling' : 'Draw on the dog')],
        data: { color, tool: g.year >= 1955 ? 'marker' : 'crayon' },
      }
    },
    resolve: {
      draw: (g, x) => say(g, x, ['Crowning achievement', 'Art critic'], `You drew a sprawling ${x.s('color')} mural across the hallway. Your parents did not appreciate the vision.`, `I created my crowning achievement on the walls of my home with a ${x.s('color')} ${x.s('tool') || 'marker'}.`, { happiness: 8, smarts: 2, rels: [{ p: aParent(g), d: -4 }] }),
      paper: (g) => say(g, null, 'Responsible artist', 'You asked for paper like a civilized person. Your drawing went straight onto the fridge.', 'I asked for paper instead of drawing on the wall. My drawing went on the fridge.', { smarts: 4, happiness: 4, rels: [{ p: aParent(g), d: 3 }] }, 'good'),
      sibling: (g, x) => {
        const sib = siblings(g)[0]
        say(g, x, 'Body art', sib ? `You drew a ${x.s('color')} mustache on ${sib.firstName} while ${sib.gender === 'male' ? 'he' : 'she'} napped.` : `You drew ${x.s('color')} spots on the dog. The dog seemed fine with it.`, sib ? `I drew a mustache on my sibling, ${sib.firstName}, with a ${x.s('tool') || 'marker'}.` : `I drew spots on the dog with a ${x.s('tool') || 'marker'}.`, { happiness: 8, rels: [{ p: sib, d: -5 }] })
      },
    },
  },
  {
    id: 'toddler.imaginaryFriend',
    emoji: '👻',
    title: 'Imaginary Friend',
    minAge: 3,
    maxAge: 6,
    setup: (g) => {
      const name = pick(g, ['Mr. Biscuits', 'Captain Sparkle', 'Gloop', 'Sir Reginald', 'Tiny Steve', 'Princess Noodle'])
      return {
        text: `Your new best friend, ${name}, is invisible and insists on having a seat at the dinner table. What will you do?`,
        choices: [ch('seat', 'Demand a seat for them'), ch('blame', 'Blame them for my mess'), ch('bye', 'Say goodbye to them')],
        data: { name },
      }
    },
    resolve: {
      seat: (g, x) => say(g, x, 'Party of four', `Your family set an extra plate for ${x.s('name')}. They didn't eat much.`, `My imaginary friend, ${x.s('name')}, got a seat at the dinner table.`, { happiness: 6, smarts: 2 }, 'good'),
      blame: (g, x) => say(g, x, 'Scapegoat', `You blamed ${x.s('name')} for the juice on the couch. Nobody bought it.`, `I blamed my imaginary friend, ${x.s('name')}, for spilling juice on the couch.`, { karma: -2, smarts: 2 }),
      bye: (g, x) => say(g, x, 'Growing up', `You told ${x.s('name')} it was time to go. You feel oddly mature.`, `I said goodbye to my imaginary friend, ${x.s('name')}.`, { smarts: 4, happiness: -2 }),
    },
  },
  {
    id: 'toddler.lostInStore',
    emoji: '🏬',
    title: 'Lost!',
    minAge: 3,
    maxAge: 7,
    setup: () => ({
      text: "You wandered off at the department store and now you can't find your family anywhere. What will you do?",
      choices: [ch('cry', 'Cry loudly'), ch('guard', 'Find a security guard'), ch('hide', 'Hide in a clothes rack')],
    }),
    resolve: {
      cry: (g) => say(g, null, 'Found', 'You wailed until a crowd formed and your parent came sprinting over.', 'I got lost at a department store and cried until my parent found me.', { happiness: -6 }),
      guard: (g) => say(g, null, ['Smart cookie', 'Attention shoppers'], g.year >= 1930 ? 'You found a security guard, who announced your name over the loudspeaker. Your family picked you up in minutes.' : 'You found a store detective, who marched you to the front desk. Your family picked you up in minutes.', 'I got lost at a department store and found a security guard to help me.', { smarts: 8 }, 'good', '👮'),
      hide: (g) => say(g, null, 'Hide and seek champion', 'You hid in a clothes rack for an hour while half the store searched for you. When they finally found you, you were asleep.', 'I hid in a clothes rack after getting lost at a department store.', { happiness: 4, rels: [{ p: aParent(g), d: -3 }] }),
    },
  },
])
