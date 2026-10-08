// Childhood events (roughly 4-14): broken vases, road trips, stray dogs, sibling
// spats, chores, talent shows, daredevil friends and other kid stuff.
import { createPerson } from '../people'
import { chance, pick, randInt } from '../rng'
import type { GameState, Person } from '../types'
import {
  aParent,
  anyOf,
  ch,
  country,
  defineEvents,
  dollars,
  englishSchooling,
  friends,
  mother,
  money,
  pets,
  say,
  siblings,
  strangerName,
  v,
} from './helpers'
import { hasSnow, locale, localSoftDrink } from '../data/locales'
import { seededBrandName } from '../shops/everyday-brands'
import { cars, common, indoorGame, landline, prized, privileges } from './era'

const BROKEN_ITEMS = ['favorite vase', '@2006 flat-screen TV', 'antique clock', 'reading glasses', 'wedding photo frame', '@1972 coffee maker', '@1995,homeComputer laptop', 'porcelain cat statue', '@-1960 gramophone record']
const PETS = [
  { species: 'Dog', names: ['Buddy', 'Max', 'Biscuit', 'Daisy', 'Rocky', 'Luna'] },
  { species: 'Cat', names: ['Whiskers', 'Mittens', 'Shadow', 'Pumpkin', 'Oreo', 'Cleo'] },
  { species: 'Hamster', names: ['Nibbles', 'Peanut', 'Hammy', 'Squeaky'] },
  { species: 'Rabbit', names: ['Thumper', 'Clover', 'Cinnabun', 'Hopscotch'] },
]

function addPet(g: GameState, species: string, name: string): Person {
  const pet = createPerson(g, { relation: 'pet', age: randInt(g, 0, 3), firstName: name, species, relationship: 75, livesWithPlayer: true })
  return pet
}

/** Kid gets caught by a parent: relationship hit with a random parent. */
function parentMad(g: GameState, d: number): { p: Person | undefined; d: number }[] {
  return [{ p: aParent(g), d }]
}

/** The kid's pick of a real fast-food chain of a kind that trades where they live this year (stable for the year, no RNG). */
function fastChain(g: GameState, kind: 'burger' | 'pizza' | 'chicken'): string | undefined {
  const name = seededBrandName(g, 'fast-food', `kid-${kind}`, '', { segment: kind })
  return name || undefined
}

export const KID_EVENTS = defineEvents([
  {
    id: 'kid.integrity',
    emoji: '😳',
    title: 'Integrity',
    minAge: 4,
    maxAge: 11,
    once: true,
    weight: 18,
    when: (g) => !!aParent(g),
    setup: (g) => {
      const item = v(g, BROKEN_ITEMS)
      const sib = siblings(g).find((s) => s.age >= 3 && s.age < 18)
      return {
        text: `You broke your parents' ${item} while you were playing. What will you do?`,
        choices: [ch('admit', 'Admit that I broke it'), ch('lie', "It wasn't me"), ...(sib ? [ch('blame', `Blame ${sib.firstName}`)] : [ch('hide', 'Hide the pieces')])],
        data: { item },
        other: sib,
      }
    },
    resolve: {
      admit: (g, x) =>
        say(g, x, ['Honest kid', 'Integrity'], `You admitted you broke the ${x.s('item')}. Your parents were upset, but proud of your honesty.`, `I admitted to my parents that I broke their ${x.s('item')}.`, { karma: 8, smarts: 4, rels: parentMad(g, 2) }, 'good'),
      lie: (g, x) => {
        const caught = chance(g, 0.5)
        say(
          g,
          x,
          caught ? 'Busted' : 'Got away with it',
          caught ? `You claimed it wasn't you, but there was ${x.s('item')} dust all over your shirt. You were grounded for two weeks.` : `You swore you had no idea what happened to the ${x.s('item')}. Your parents blamed the wind.`,
          `I broke my parents' ${x.s('item')} and then lied about it.`,
          caught ? { karma: -6, happiness: -8, rels: parentMad(g, -8) } : { karma: -6 },
          caught ? 'bad' : 'neutral',
        )
      },
      blame: (g, x) =>
        say(g, x, ['Framed', 'Cold-blooded'], x.q ? `You told your parents ${x.q.firstName} broke the ${x.s('item')}. ${x.q.firstName} got grounded and will never forgive you.` : `You blamed your sibling for the ${x.s('item')}.`, x.q ? `I broke my parents' ${x.s('item')} and blamed it on my sibling, ${x.q.firstName}.` : `I broke my parents' ${x.s('item')} and blamed my sibling.`, { karma: -10, rel2: -20 }, 'bad'),
      hide: (g, x) => {
        const caught = chance(g, 0.6)
        say(g, x, caught ? 'Evidence found' : 'Cover-up', caught ? `You hid the pieces of the ${x.s('item')} under your bed. Your mother found them while vacuuming.` : `You buried the pieces of the ${x.s('item')} in the backyard. The perfect crime.`, `I broke my parents' ${x.s('item')} and hid the pieces.`, caught ? { karma: -6, happiness: -6, rels: parentMad(g, -6) } : { karma: -6, happiness: 2 }, caught ? 'bad' : 'neutral')
      },
    },
  },
  {
    id: 'kid.roadTrip',
    emoji: '🚘',
    title: 'Family Vacation',
    minAge: 4,
    maxAge: 15,
    cooldown: 4,
    when: (g) => !!aParent(g) && g.character.residence.status === 'parents',
    setup: (g) => {
      const p = aParent(g)
      const city = pick(g, country(g).cities)
      // A road trip once families have cars; a long train ride before that.
      const trip = cars(g) ? 'road trip' : 'train trip'
      return {
        text: `Your parents want to take you on a ${trip} to visit relatives in ${city}. How will you behave?`,
        choices: [ch('happy', 'Be appreciative'), ch('complain', 'Complain but go'), ch('refuse', 'Refuse to go')],
        person: p,
        data: { city, trip },
      }
    },
    resolve: {
      happy: (g, x) => say(g, x, ['Vacay', 'It was great'], `You thanked your parents and had a wonderful time in ${x.s('city')}. Your aunt pinched your cheeks 41 times.`, `I went on a ${x.s('trip') || 'road trip'} with my family to visit relatives in ${x.s('city')}. I was very appreciative.`, { happiness: 12, rels: [...parentMad(g, 6)] }, 'good'),
      complain: (g, x) => say(g, x, 'Are we there yet?', `You whined the whole way to ${x.s('city')}. It was actually kind of fun once you got there.`, `I complained the whole way to ${x.s('city')} on a family ${x.s('trip') || 'road trip'}.`, { happiness: 4, rels: parentMad(g, -3) }),
      refuse: (g, x) => say(g, x, ['Home alone', 'I might not leave, ever'], `You refused to go. You spent the weekend at a neighbor's house eating ${g.year >= 1985 ? 'microwave dinners' : 'cold leftovers'}.`, `I refused to go with my family on a ${x.s('trip') || 'road trip'} to ${x.s('city')}.`, { happiness: -4, rels: parentMad(g, -8) }, 'bad'),
    },
  },
  {
    id: 'kid.grossDinner',
    emoji: '🍛',
    title: 'Dinner',
    minAge: 5,
    maxAge: 12,
    setup: (g) => {
      const f = anyOf(g, friends(g).filter((p) => p.age < 18))
      const name = f?.firstName ?? strangerName(g).first
      return {
        text: `You're at your friend ${name}'s house sitting down to dinner, but the food looks... kind of disgusting. What will you do?`,
        choices: [ch('refuse', 'Refuse to eat it'), ch('eat', 'Suck it up and eat it'), ch('dog', 'Slip it to the dog')],
        person: f,
        data: { name },
      }
    },
    resolve: {
      refuse: (g, x) => say(g, x, 'Picky', `You pushed your plate away. ${x.s('name')}'s mom looked personally offended.`, `I refused to eat a gross dinner at my friend ${x.s('name')}'s house.`, { happiness: -2, rel: -6 }),
      eat: (g, x) => say(g, x, ['Polite guest', 'Iron stomach'], `You choked it all down and said "thank you, it was delicious." Your parents raised you right.`, `I made myself eat a gross dinner at my friend ${x.s('name')}'s house.`, { karma: 4, health: -2, rel: 6 }, 'good'),
      dog: (g, x) => {
        const caught = chance(g, 0.35)
        say(g, x, caught ? 'Caught red-handed' : 'Good boy', caught ? `You were caught feeding your dinner to the family dog. Awkward silence followed.` : `You discreetly fed your dinner to the dog under the table. The dog is now your best friend.`, `I slipped my dinner to the dog at my friend ${x.s('name')}'s house.`, caught ? { rel: -8, happiness: -4 } : { happiness: 4 }, caught ? 'bad' : 'neutral')
      },
    },
  },
  {
    id: 'kid.fastFood',
    emoji: '🍔',
    title: 'Favorite Fast Food',
    minAge: 3,
    maxAge: 9,
    // Real chains that trade where you live this year; none yet in a country or year without them.
    when: (g) => !!aParent(g) && !!fastChain(g, 'burger'),
    setup: (g) => ({
      text: 'Your parents are taking you out for dinner and want to know which fast food place is your favorite. What will you tell them?',
      choices: [ch('pizza', fastChain(g, 'pizza') ?? 'The pizza place', '🍕'), ch('burger', fastChain(g, 'burger') ?? 'The burger place', '🍔'), ch('chicken', fastChain(g, 'chicken') ?? 'The chicken place', '🍗'), ch('none', "I don't like fast food", '🥦')],
    }),
    resolve: {
      pizza: (g) => say(g, null, 'Pizza party', `You picked ${fastChain(g, 'pizza') ?? 'the pizza place'} and ate four slices.`, `I told my parents that ${fastChain(g, 'pizza') ?? 'the pizza place'} is my favorite fast food place.`, { happiness: 6, health: -2 }),
      burger: (g) => say(g, null, 'Kids meal', `You picked ${fastChain(g, 'burger') ?? 'the burger place'}. The toy in your kids meal broke in the parking lot.`, `I told my parents that ${fastChain(g, 'burger') ?? 'the burger place'} is my favorite fast food place.`, { happiness: 4, health: -2 }),
      chicken: (g) => say(g, null, 'Finger lickin\'', cars(g) ? `You picked ${fastChain(g, 'chicken') ?? 'the chicken place'} and got grease on the car seats.` : `You picked ${fastChain(g, 'chicken') ?? 'the chicken place'} and got grease all over your good shirt.`, `I told my parents that ${fastChain(g, 'chicken') ?? 'the chicken place'} is my favorite fast food place.`, { happiness: 6, health: -2 }),
      none: (g) => say(g, null, ['Health nut', 'Refined palate'], 'You told your parents fast food tastes fake. They were stunned and a little proud.', "I told my parents that I don't like fast food because it tastes fake.", { smarts: 16, health: 4 }, 'good'),
    },
  },
  {
    id: 'kid.swearClub',
    emoji: '🤬',
    title: 'Swear Club',
    minAge: 6,
    maxAge: 11,
    setup: () => ({
      text: 'Some neighborhood kids are starting a secret club. They call it the "Swear Club" and only kids who say bad words can join. What will you do?',
      choices: [ch('join', 'Let me in, dammit!'), ch('ignore', 'Ignore them'), ch('tell', 'Tell an adult')],
    }),
    resolve: {
      join: (g) => say(g, null, ['Potty mouth', 'Initiated'], 'You recited a word you heard your dad say in traffic. You were voted president of the club.', 'I joined a secret profanity club for kids in my neighborhood.', { happiness: 8, karma: -3, craziness: 2 }),
      ignore: (g) => say(g, null, 'Clean record', 'You walked away. Somebody yelled "fudge!" at you. It sounded different.', 'I took no part in a naughty club that some kids in my neighborhood organized.', {}),
      tell: (g) => say(g, null, ['Snitch', 'Club disbanded'], 'You told an adult. The Swear Club was disbanded and its members now refer to you by a word you cannot repeat.', 'I tattled on the neighborhood Swear Club and it was disbanded.', { karma: 4, happiness: -4 }),
    },
  },
  {
    id: 'kid.talentShow',
    emoji: '⭐',
    title: 'Talent Show',
    minAge: 5,
    maxAge: 11,
    setup: (g) => ({
      text: `You've been invited to perform at a children's talent show at ${g.character.countryId === 'us' && g.year >= 1962 ? 'the mall' : 'the community hall'}. What will you do?`,
      choices: [ch('joke', 'Tell a joke'), ch('sing', englishSchooling(g) ? 'Sing the ABCs' : 'Sing a nursery rhyme'), ch('dance', g.year >= 1982 ? 'Break dance' : 'Tap dance'), ch('decline', 'Decline')],
    }),
    resolve: {
      joke: (g) => {
        const hit = chance(g, 0.4 + g.character.stats.smarts / 250)
        say(g, null, hit ? 'Comedy gold' : 'Crickets', hit ? 'You told your best knock-knock joke and the crowd roared. A security guard wiped away a tear.' : 'You told a knock-knock joke. Somebody coughed. You walked off stage very slowly.', 'I told my favorite knock-knock joke at a talent show.', hit ? { happiness: 10, smarts: 2 } : { happiness: -6 }, hit ? 'good' : 'bad', '🎤')
      },
      sing: (g) => say(g, null, 'Next big star?', englishSchooling(g) ? 'You sang the ABCs with heartfelt emotion. You forgot the letters between K and P.' : 'You sang a nursery rhyme with heartfelt emotion. You forgot the second verse and hummed it.', englishSchooling(g) ? 'I sang the ABCs at a kiddie talent show.' : 'I sang a nursery rhyme at a kiddie talent show.', { happiness: 6, looks: 2 }),
      dance: (g) => {
        const hit = chance(g, 0.5)
        const breaking = g.year >= 1982
        say(g, null, hit ? 'Crowd favorite' : 'Wipeout', hit ? `${breaking ? 'You spun on your head like a pro.' : 'You tapped so fast your shoes smoked.'} You won a ${money(dollars(g, 10, 10))} ${g.character.countryId === 'us' && g.year >= 1962 ? 'food court gift card' : 'toy store voucher'}!` : breaking ? 'You attempted a headspin and landed on a judge.' : 'You attempted a big finish, slipped and landed on a judge.', breaking ? 'I break danced at a talent show.' : 'I tap danced at a talent show.', hit ? { happiness: 12, health: 2, money: 10 } : { happiness: -4, health: -4 }, hit ? 'good' : 'bad', '🕺')
      },
      decline: (g) => say(g, null, 'Stage fright', 'You politely declined. The spotlight can wait.', 'I declined an invitation to perform at a talent show.', { happiness: -2 }),
    },
  },
  {
    id: 'kid.birthdayTheme',
    emoji: '🎂',
    title: 'Birthday Party',
    minAge: 5,
    maxAge: 10,
    cooldown: 3,
    when: (g) => !!aParent(g),
    setup: (g) => ({
      text: `You are asked what theme you'd like for your ${ordinal(g.character.age)} birthday party. What will you choose?`,
      choices: [ch('dino', 'Dinosaurs', '🦖'), g.year >= 1940 ? ch('hero', 'Superheroes', '🦸') : ch('hero', 'Pirates', '🏴‍☠️'), ch('unicorn', 'Unicorns', '🦄'), common(g, 'tv') ? ch('baby', 'A toddler TV show', '📺') : ch('baby', 'A nursery rhyme', '🐑')],
    }),
    resolve: {
      dino: (g) => say(g, null, 'Rawr', `You had a dinosaur party. A kid named ${strangerName(g, 'male').first} cried when the piñata T. rex lost its head.`, 'I had a dinosaur-themed birthday party.', { happiness: 10 }, 'good'),
      hero: (g) => (g.year >= 1940 ? say(g, null, 'Super party', 'You had a superhero party. Everyone fought over who got to be the strongest one.', 'I had a superhero-themed birthday party.', { happiness: 10 }, 'good') : say(g, null, 'Yo ho ho', 'You had a pirate party. Everyone fought over who got to be the captain.', 'I had a pirate-themed birthday party.', { happiness: 10 }, 'good')),
      unicorn: (g) => say(g, null, 'Magical', 'You had a unicorn party with a rainbow cake. Glitter will be found in the carpet for years.', 'I had a unicorn-themed birthday party.', { happiness: 10 }, 'good'),
      baby: (g) =>
        common(g, 'tv')
          ? say(g, null, ['Awkward', 'Too old for this'], 'You had a party themed after a show for toddlers. You were the only one who dressed up.', "I had a toddler-show-themed birthday party, but I was the only one who dressed up.", { happiness: -4, smarts: -8 }, 'bad')
          : say(g, null, ['Awkward', 'Too old for this'], 'You had a nursery-rhyme party. You came dressed as a sheep. Nobody else did.', 'I had a nursery-rhyme birthday party, but I was the only one who dressed up.', { happiness: -4, smarts: -8 }, 'bad'),
    },
  },
  {
    id: 'kid.daredevil',
    emoji: '🌉',
    title: 'Daredevil',
    minAge: 10,
    maxAge: 17,
    setup: (g) => {
      const n = randInt(g, 2, 3)
      return {
        text: `${n === 2 ? 'Two' : 'Three'} of your friends literally just jumped off a bridge into the river below. They're yelling at you to do it too. What will you do?`,
        choices: [ch('jump', 'Jump!'), ch('leave', 'Turn around and leave'), ch('climb', 'Climb down and swim')],
      }
    },
    resolve: {
      jump: (g) => {
        const hurt = chance(g, 0.15)
        say(g, null, hurt ? 'Belly flop' : ['Daredevil', 'Fearless'], hurt ? 'You jumped and landed flat on your stomach. You heard the splash from three counties away.' : 'You jumped! The water was freezing and you have never felt more alive.', 'I jumped off a bridge after I saw my friends do it.', hurt ? { health: -10, happiness: -2, condition: { name: 'Bruised Ribs', kind: 'injury', severity: 10 } } : { happiness: 12, health: 2 }, hurt ? 'bad' : 'good')
      },
      leave: (g) => say(g, null, 'Not today', 'You turned around and left. Your friends called you a chicken for a week.', 'I was uninterested in jumping off a bridge.', { happiness: -4, smarts: 4 }),
      climb: (g) => say(g, null, 'Compromise', 'You climbed down the bank and swam out to meet them. Your friends said that counted. Sort of.', "I didn't have the guts to jump off a bridge, so I climbed down and swam.", { happiness: 4, health: 2 }),
    },
  },
  {
    id: 'kid.mailbox',
    emoji: '📬',
    title: 'Mailbox Mischief',
    minAge: 10,
    maxAge: 16,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      const name = f?.firstName ?? strangerName(g).first
      // Curbside mailboxes are American; elsewhere the street's trash bins take the beating.
      const us = g.character.countryId === 'us' || g.character.countryId === 'ca'
      return {
        text: us ? `Your delinquent friend ${name} invites you to go bash in mailboxes with a baseball bat. What will you do?` : `Your delinquent friend ${name} invites you to go kick over every trash bin on the street. What will you do?`,
        choices: [ch('watch', "I'll go, but just watch"), ch('busy', "No way, I'm busy"), ch('go', "Let's get into some mischief!")],
        person: f,
        data: { name, thing: us ? 'mailboxes' : 'trash bins', verb: us ? 'bash in' : 'kick over' },
      }
    },
    resolve: {
      watch: (g, x) => say(g, x, 'Lookout', `You tagged along and watched ${x.s('name')} flatten six ${x.s('thing') || 'mailboxes'}. You kept your hands clean... technically.`, `I watched my friend ${x.s('name')} ${x.s('verb') || 'bash in'} ${x.s('thing') || 'mailboxes'}.`, { karma: -2, rel: 4 }),
      busy: (g, x) => say(g, x, 'Good call', `You told ${x.s('name')} you were busy. You later heard the police were looking for "a bat-wielding youth."`, `I turned down an opportunity to ${x.s('verb') || 'bash in'} ${x.s('thing') || 'mailboxes'} with a delinquent friend.`, { karma: 2, rel: -4 }),
      go: (g, x) => {
        const caught = chance(g, 0.18)
        if (caught && g.character.age >= 12) {
          say(g, x, 'Busted', 'A neighbor caught you mid-swing and called the police.', `I got caught vandalizing ${x.s('thing') || 'mailboxes'} with my friend ${x.s('name')}.`, { karma: -8, rel: 6, count: 'crimes', arrest: { crime: 'Vandalism', severity: 1 } }, 'bad', '🚓')
        } else if (caught) {
          say(g, x, 'Grounded', 'A neighbor caught you mid-swing and marched you home. Your parents grounded you for a month.', `I got caught vandalizing ${x.s('thing') || 'mailboxes'} with my friend ${x.s('name')} and was grounded.`, { karma: -8, happiness: -10, rels: parentMad(g, -10) }, 'bad')
        } else {
          say(g, x, ['Street menace', 'Chaos'], `You and ${x.s('name')} destroyed an entire street's worth of ${x.s('thing') || 'mailboxes'} and got away clean.`, `I vandalized ${x.s('thing') || 'mailboxes'} with my friend ${x.s('name')}.`, { karma: -8, happiness: 8, rel: 8, count: 'crimes' })
        }
      },
    },
  },
  {
    id: 'kid.pickingTeams',
    emoji: '⚽',
    title: 'Picking Teams',
    minAge: 7,
    maxAge: 13,
    setup: () => ({
      text: "You're a captain picking teams in gym class and it's down to your last pick. Who will you choose?",
      choices: [ch('nerdy', 'The nerdy kid'), ch('wimpy', 'The wimpy kid'), ch('clumsy', 'The uncoordinated kid'), ch('none', 'Neither, we play short')],
    }),
    resolve: {
      nerdy: (g) => say(g, null, 'Strategist', 'You picked the nerdy kid, who calculated the optimal kicking angle. Your team won!', 'I picked the nerdy kid for my team in gym class.', { happiness: 6, karma: 3 }, 'good'),
      wimpy: (g) => say(g, null, 'Kind captain', "You picked the wimpy kid. Your team lost, but they'll never forget it.", 'I picked the wimpy kid for my team in gym class.', { karma: 4 }),
      clumsy: (g) => say(g, null, 'Own goal', 'You picked the uncoordinated kid, who scored twice — for the other team.', 'I picked the uncoordinated kid for my team in gym class.', { happiness: -2, karma: 3 }),
      none: (g) => say(g, null, 'Ruthless', 'You chose to play a player short rather than pick anyone. The gym teacher made a note in your file.', 'I refused to pick anyone for my team in gym class.', { karma: -6 }, 'bad'),
    },
  },
  {
    id: 'kid.sweetTooth',
    emoji: '🍫',
    title: 'Sweet Tooth',
    minAge: 8,
    maxAge: 15,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      const name = f?.firstName ?? 'one of your friends'
      return {
        text: `While at a grocery store, ${f ? `your friend ${name}` : name} slyly slips a candy bar into their pocket and whispers, "Five-finger discount." What will you do?`,
        choices: [ch('argue', 'Argue with them'), ch('take', 'Take some candy'), ch('nothing', 'Do nothing')],
        person: f,
        data: { name },
      }
    },
    resolve: {
      argue: (g, x) => say(g, x, 'Moral compass', 'You called them out for stealing. They rolled their eyes and put it back.', 'A friend and I argued after I called them out for stealing a candy bar.', { karma: 4, rel: -6 }),
      take: (g, x) => {
        const caught = chance(g, 0.2)
        if (caught && g.character.age >= 13 && chance(g, 0.4)) {
          say(g, x, 'Caught', 'The store manager grabbed you by the collar and called the police.', 'I got caught shoplifting a candy bar.', { karma: -6, smarts: -4, count: 'crimes', arrest: { crime: 'Shoplifting', severity: 1 } }, 'bad', '🚓')
        } else if (caught) {
          say(g, x, 'Caught', "The store manager caught you and called your parents. The ride home was very quiet.", 'I got caught stealing a candy bar and the store called my parents.', { karma: -6, smarts: -4, happiness: -8, rels: parentMad(g, -8) }, 'bad')
        } else {
          say(g, x, 'Sugar rush', 'You pocketed a candy bar too. It tasted like guilt and caramel.', 'I stole a candy bar from the grocery store after a friend showed me how easy it was.', { karma: -6, smarts: -4, happiness: 4, rel: 4, count: 'crimes' })
        }
      },
      nothing: (g) => say(g, null, 'Bystander', 'You pretended not to see anything and studied the gum selection very closely.', 'I ignored a friend who stole a candy bar.', {}),
    },
  },
  {
    id: 'kid.coverMe',
    emoji: '😲',
    title: 'Cover Me',
    minAge: 6,
    maxAge: 12,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      const name = f?.firstName ?? strangerName(g).first
      return {
        text: `Your friend ${name} asks you to tell their mother they were playing with you all morning, even though it's not true. What will you say?`,
        choices: [ch('ok', 'Okay'), ch('no', 'No way'), ch('insult', 'Call them selfish')],
        person: f,
        data: { name },
      }
    },
    resolve: {
      ok: (g, x) => say(g, x, 'Accomplice', `You told ${x.s('name')}'s mom they were with you all morning. She bought it. ${x.s('name')} owes you big.`, `I told my friend ${x.s('name')}'s mom they were with me all morning.`, { karma: -3, rel: 10 }),
      no: (g, x) => say(g, x, 'Honest Abe', `You refused to lie for ${x.s('name')}. They were grounded and blamed you for it.`, `I refused to lie to my friend ${x.s('name')}'s mom.`, { karma: 3, rel: -8 }),
      insult: (g, x) => say(g, x, 'Harsh', `You told ${x.s('name')} they were a selfish idiot for asking. They stormed off.`, `I told my friend ${x.s('name')} they were selfish for asking me to lie.`, { rel: -15, count: 'insults' }, 'bad'),
    },
  },
  {
    id: 'kid.falseClaim',
    emoji: '📝',
    title: 'False Claim',
    minAge: 7,
    maxAge: 12,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      const name = f?.firstName ?? strangerName(g).first
      return {
        text: `While playing in the neighborhood, your friend ${name} tells you to fake a fall on the neighbor's driveway so you can sue them for lots of money. What will you do?`,
        choices: [ch('bad', "That's a bad idea"), ch('great', "That's a great idea"), ch('insult', 'Insult them')],
        person: f,
        data: { name },
      }
    },
    resolve: {
      bad: (g, x) => say(g, x, 'Wise beyond your years', 'You told them it sounded like a terrible idea. Because it is.', "I told my friend that faking a fall on the neighbor's driveway to sue them sounded like a bad idea.", { smarts: 4, karma: 2 }, 'good'),
      great: (g, x) => say(g, x, 'Ouch', 'You flung yourself onto the driveway. It hurt a lot, and nobody gave you any money.', "I faked a fall on the neighbor's driveway, but it only hurt and I didn't get any money.", { health: -6, smarts: -4, karma: -3, rel: 4 }, 'bad', '🤕'),
      insult: (g, x) => say(g, x, 'Rude', `You called ${x.s('name')} a dummy. They went home in a huff.`, `I insulted my friend ${x.s('name')} for suggesting a fake lawsuit.`, { rel: -10, count: 'insults' }),
    },
  },
  {
    id: 'kid.strayAnimal',
    emoji: '🐕',
    title: 'Stray Animal',
    minAge: 5,
    maxAge: 15,
    when: (g) => g.character.residence.status === 'parents',
    setup: (g) => {
      const kind = pick(g, PETS.slice(0, 2))
      const name = pick(g, kind.names)
      return {
        text: `A scruffy stray ${kind.species.toLowerCase()} followed you all the way home and is now sitting on your doorstep, looking at you with big sad eyes. What will you do?`,
        choices: [ch('keep', 'Beg my parents to keep it'), ch('feed', 'Give it some food'), ch('shoo', 'Shoo it away'), ch('call', 'Call animal control')],
        data: { species: kind.species, name },
      }
    },
    resolve: {
      keep: (g, x) => {
        const p = aParent(g)
        const yes = !!p && (p.relationship > 45 || chance(g, 0.35)) && chance(g, 0.65)
        if (yes) {
          addPet(g, x.s('species'), x.s('name'))
          say(g, x, ['New best friend', 'Welcome home'], `Your parents caved! The ${x.s('species').toLowerCase()} is now officially part of the family. You named it ${x.s('name')}.`, `I convinced my parents to let me keep a stray ${x.s('species').toLowerCase()}. I named it ${x.s('name')}.`, { happiness: 16, karma: 6, count: 'pets', rels: p ? [{ p, d: 4 }] : [] }, 'good')
        } else {
          say(g, x, 'Denied', `Your parents said absolutely not. The ${x.s('species').toLowerCase()} was taken to a shelter.`, `My parents wouldn't let me keep a stray ${x.s('species').toLowerCase()}.`, { happiness: -8 }, 'bad')
        }
      },
      feed: (g, x) => say(g, x, 'Kind heart', `You snuck the ${x.s('species').toLowerCase()} some leftovers. It licked your face and trotted away happy.`, `I fed a stray ${x.s('species').toLowerCase()} that followed me home.`, { karma: 6, happiness: 6 }, 'good'),
      shoo: (g, x) => say(g, x, 'Cold', `You shooed the ${x.s('species').toLowerCase()} away. It looked back at you once. You'll think about that look for years.`, `I shooed away a stray ${x.s('species').toLowerCase()}.`, { karma: -4, happiness: -2 }),
      call: (g, x) => say(g, x, 'Responsible', `Animal control picked up the ${x.s('species').toLowerCase()}. Hopefully it finds a nice home.`, `I called animal control about a stray ${x.s('species').toLowerCase()}.`, { karma: 2, smarts: 2 }),
    },
  },
  {
    id: 'kid.siblingSpat',
    emoji: '🗣️',
    title: 'Spat',
    minAge: 5,
    maxAge: 20,
    cooldown: 4,
    when: (g) => siblings(g).some((s) => s.age >= 4),
    setup: (g) => {
      const sib = anyOf(g, siblings(g).filter((s) => s.age >= 4))
      if (!sib) return null
      const topic = v(g, ['@cars who gets the front seat', '@tv whose turn it is to pick the TV show', '@radio,!tv whose turn it is to pick the radio station', 'who ate the last cookie', 'who started it', 'who mom loves more', 'whether a hot dog is a sandwich', 'who gets the bigger bedroom', '@videoGameConsole whose turn it is on the game console'])
      return {
        text: `You and ${yourSib(sib)} are feuding about ${topic}. What will you do?`,
        choices: [ch('apologize', 'Apologize'), ch('agree', 'Agree to disagree'), ch('complain', 'Complain to parents'), ch('insult', 'Insult them'), ch('assault', 'Assault them')],
        person: sib,
        data: { topic },
      }
    },
    resolve: {
      apologize: (g, x) => say(g, x, 'Peacemaker', `You apologized to ${x.p?.firstName ?? 'your sibling'}. They accepted, smugly.`, `I apologized to ${x.p?.firstName ?? 'my sibling'} after we argued about ${x.s('topic')}.`, { rel: 8, karma: 2 }, 'good'),
      agree: (g, x) => say(g, x, 'Truce', 'You agreed to disagree. The cold war continues at a lower temperature.', `My sibling and I agreed to disagree about ${x.s('topic')}.`, { rel: 2 }),
      complain: (g, x) => say(g, x, 'Tattletale', 'You ran to your parents. They told you both to knock it off.', `I complained to my parents about my sibling.`, { rel: -6 }),
      insult: (g, x) => say(g, x, 'Low blow', `You called ${x.p?.firstName ?? 'your sibling'} a ${pick(g, ['troll', 'goblin', 'walking diaper', 'dweeb', 'potato head'])}. They stormed off.`, `I insulted my sibling, ${x.p?.firstName ?? ''}, during an argument.`, { rel: -12, count: 'insults' }, 'bad'),
      assault: (g, x) => {
        const won = chance(g, 0.5 + (g.character.age - (x.p?.age ?? g.character.age)) * 0.05)
        say(g, x, won ? 'Sibling rivalry' : 'Humbled', won ? `You tackled ${x.p?.firstName ?? 'your sibling'} and won the fight. Both of you were grounded.` : `You lunged at ${x.p?.firstName ?? 'your sibling'} and got put in a headlock. Humiliating.`, `I got into a fight with my sibling, ${x.p?.firstName ?? ''}.`, { rel: -18, health: won ? -2 : -6, happiness: won ? 2 : -6, count: 'fights', rels: parentMad(g, -4) }, 'bad', '👊')
      },
    },
  },
  {
    id: 'kid.chores',
    emoji: '🧹',
    title: 'Chores',
    minAge: 5,
    maxAge: 16,
    cooldown: 5,
    when: (g) => !!aParent(g) && g.character.residence.status === 'parents',
    setup: (g) => {
      const p = aParent(g)
      if (!p) return null
      const chore = pick(g, ['clean your room', 'take out the trash', 'wash the dishes', 'mow the lawn', 'fold the laundry', 'clean the bathroom'])
      return {
        text: `${yourParent(p)} asked you to ${chore}. What will you do?`,
        choices: [ch('do', 'Do it right away'), ch('pay', 'Ask to be paid'), ch('badly', 'Do it badly so they never ask again'), ch('refuse', 'Refuse')],
        person: p,
        data: { chore },
      }
    },
    resolve: {
      do: (g, x) => say(g, x, ['Model child', 'Helpful'], `You did it right away. ${x.p?.firstName ?? 'Your parent'} nearly fell over in shock.`, `I helped out at home when I was asked to ${x.s('chore')}.`, { rel: 8, karma: 3 }, 'good'),
      pay: (g, x) => {
        const yes = chance(g, 0.5)
        const amt = randInt(g, 2, 10)
        say(g, x, yes ? 'Little entrepreneur' : 'Nice try', yes ? `${x.p?.firstName ?? 'Your parent'} agreed to pay you ${money(amt)}. Capitalism!` : `${x.p?.firstName ?? 'Your parent'} laughed and said "you get paid in food and shelter." You did it anyway.`, yes ? `I negotiated ${money(amt)} for doing chores.` : 'I tried to get paid for doing chores. It did not work.', yes ? { money: amt, smarts: 2 } : { rel: -2 }, yes ? 'good' : 'neutral', '💵')
      },
      badly: (g, x) => {
        const works = chance(g, 0.4)
        say(g, x, works ? 'Strategic incompetence' : 'Do it again', works ? "You did such a bad job that they decided it's faster to do it themselves. Mission accomplished." : 'You did a terrible job, so you had to do it all again. Twice.', `I deliberately did a bad job when I was asked to ${x.s('chore')}.`, works ? { rel: -4, smarts: 2 } : { rel: -4, happiness: -4 })
      },
      refuse: (g, x) => say(g, x, ['Grounded', 'Rebel'], `You flat-out refused. ${x.p?.firstName ?? 'Your parent'} took away your ${privileges(g)} for a week.`, `I refused to ${x.s('chore')} and was grounded.`, { rel: -10, happiness: -6 }, 'bad'),
    },
  },
  {
    id: 'kid.newKid',
    emoji: '🧒',
    title: 'New Kid',
    minAge: 6,
    maxAge: 15,
    when: (g) => g.character.education.current !== null,
    setup: (g) => {
      const s = strangerName(g)
      return {
        text: `A new kid named ${s.first} ${s.last} is sitting alone at lunch on their first day. What will you do?`,
        choices: [ch('invite', 'Invite them to my table'), ch('ignore', 'Ignore them'), ch('tease', 'Make fun of them')],
        data: { first: s.first, last: s.last, gender: s.gender },
      }
    },
    resolve: {
      invite: (g, x) => {
        const p = createPerson(g, { relation: 'friend', age: g.character.age + randInt(g, -1, 1), firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', relationship: 70 })
        say(g, x, ['New friend', 'Lunch buddy'], `You invited ${p.firstName} to sit with you. You hit it off immediately!`, `I befriended a new kid at school named ${p.firstName}.`, { happiness: 8, karma: 6 }, 'good')
      },
      ignore: (g, x) => say(g, x, 'Eh', `You ate your sandwich and ignored ${x.s('first')}. Someone else will probably talk to them.`, `I ignored a new kid at school named ${x.s('first')}.`, {}),
      tease: (g, x) => {
        const p = createPerson(g, { relation: 'enemy', age: g.character.age, firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', relationship: 10 })
        say(g, x, 'Bully alert', `You made fun of ${p.firstName}'s shoes in front of everyone. You've made an enemy for life.`, `I made fun of a new kid at school named ${p.firstName}.`, { karma: -10, happiness: 2, count: 'insults' }, 'bad')
      },
    },
  },
  {
    id: 'kid.lemonade',
    emoji: '🍋',
    title: 'Lemonade Stand',
    minAge: 6,
    maxAge: 12,
    // Lemonade stands are a North American thing; elsewhere kids sell a cold local drink.
    setup: (g) => {
      const us = g.character.countryId === 'us' || g.character.countryId === 'ca'
      const drink = us ? 'lemonade' : `iced ${localSoftDrink(g).replace(/^iced /i, '')}`
      const price = us ? 5 : dollars(g, 3, 5)
      return {
        title: us ? 'Lemonade Stand' : 'Drink Stand',
        text: us ? "It's a scorching summer day and you have an idea: a lemonade stand! How will you run it?" : `It's a scorching day and you have an idea: a stand selling ${drink} outside your house! How will you run it?`,
        choices: [ch('cheap', 'Charge a fair price'), ch('gouge', `Charge ${money(price)} a cup`), ch('free', 'Give it away free'), ch('skip', "Nah, it's too hot")],
        data: { drink, price, stand: us ? 'lemonade stand' : `${drink} stand` },
      }
    },
    resolve: {
      cheap: (g, x) => {
        const amt = dollars(g, 8, 35)
        say(g, x, 'Small business', `Your ${x.s('stand') || 'lemonade stand'} was a hit! You made ${money(amt)}.`, `I ran a ${x.s('stand') || 'lemonade stand'} and made ${money(amt)}.`, { money: amt, happiness: 8, smarts: 2 }, 'good', '💵')
      },
      gouge: (g, x) => {
        const sold = randInt(g, 0, 4)
        const price = x.n('price') || 5
        const drink = x.s('drink') || 'lemonade'
        say(g, x, sold ? 'Supply and demand' : 'Market correction', sold ? `You sold ${sold} cup${sold === 1 ? '' : 's'} at ${money(price)} each to very thirsty, very annoyed neighbors.` : `Nobody paid ${money(price)} for ${drink}. You drank the whole pitcher yourself.`, sold ? `I sold ${drink} for ${money(price)} a cup and made ${money(sold * price)}.` : `I tried to sell ${drink} for ${money(price)} a cup. Nobody bought any.`, { money: sold * price, happiness: sold ? 4 : -4 })
      },
      free: (g, x) => say(g, x, ['Generous', 'Neighborhood hero'], `You gave ${x.s('drink') || 'lemonade'} away for free. The mail carrier said you were the best thing that happened to them all week.`, `I gave away free ${x.s('drink') || 'lemonade'} on a hot day.`, { karma: 8, happiness: 6 }, 'good'),
      skip: (g, x) => say(g, x, 'Too hot', 'You stayed inside in front of a fan instead.', `I decided it was too hot to run a ${x.s('stand') || 'lemonade stand'}.`, {}),
    },
  },
  {
    id: 'kid.snowDay',
    emoji: '❄️',
    title: 'Snow Day',
    minAge: 5,
    maxAge: 17,
    when: (g) => g.character.education.current !== null,
    // A snow day where it snows; a flood day in the tropics, a sandstorm in the desert and a
    // teachers' strike everywhere else.
    setup: (g) => {
      if (hasSnow(g)) {
        return {
          text: "School's canceled! It's a snow day. How will you spend it?",
          choices: [ch('snowman', 'Build a snowman', '⛄'), ch('fight', 'Have a snowball fight', '❄️'), ch('sled', 'Go sledding', '🛷'), ch('games', indoorGame(g).label, '🎮')],
        }
      }
      const climate = locale(g).climate
      if (climate === 'tropical') {
        return {
          title: 'Flood Day',
          text: "School's canceled! The streets flooded after a huge downpour. How will you spend the day?",
          choices: [ch('puddles', 'Splash in the puddles', '💦'), ch('boats', 'Race paper boats', '⛵'), ch('help', 'Help the neighbors clear the drains', '🧹'), ch('games', indoorGame(g).label, '🎮')],
          data: { day: 'flood day' },
        }
      }
      if (climate === 'arid') {
        return {
          title: 'Sandstorm Day',
          text: "School's canceled! A sandstorm turned the sky orange. How will you spend the day?",
          choices: [ch('fort', 'Build a blanket fort', '🏰'), ch('watch', 'Watch the storm from the window', '🌪️'), ch('sneak', 'Sneak outside to look', '😷'), ch('games', indoorGame(g).label, '🎮')],
          data: { day: 'sandstorm day' },
        }
      }
      return {
        title: 'Day Off',
        text: "School's canceled! The teachers are on strike. How will you spend the day?",
        choices: [ch('park', 'Play outside all day', '⚽'), ch('help', 'Help out at home', '🧹'), ch('picket', "Join the teachers' picket line", '🪧'), ch('games', indoorGame(g).label, '🎮')],
        data: { day: 'day off' },
      }
    },
    resolve: {
      snowman: (g) => say(g, null, 'Frosty', 'You built a magnificent snowman. The neighbor kid knocked its head off by dinner.', 'I built a snowman on a snow day.', { happiness: 8 }, 'good'),
      fight: (g) => {
        const iced = chance(g, 0.25)
        say(g, null, iced ? 'Ice ball' : 'Victory', iced ? 'Someone packed an ice ball and nailed you in the eye. Snow day ruined.' : 'You dominated the neighborhood snowball fight. Legends will be told.', 'I had a snowball fight on a snow day.', iced ? { happiness: -4, health: -4 } : { happiness: 10, health: 2 }, iced ? 'bad' : 'good')
      },
      sled: (g) => {
        const tree = chance(g, 0.15)
        say(g, null, tree ? 'Tree 1, You 0' : 'Wheee!', tree ? 'You sledded straight into a tree. Your sled did not survive. You barely did.' : 'You flew down the biggest hill in town. Pure joy.', 'I went sledding on a snow day.', tree ? { health: -8, happiness: -2, condition: { name: 'Concussion', kind: 'injury', severity: 15 } } : { happiness: 12, health: 2 }, tree ? 'bad' : 'good')
      },
      puddles: (g) => {
        const sick = chance(g, 0.2)
        say(g, null, sick ? 'Achoo' : 'Splash!', sick ? 'You splashed in every puddle on the street and came down with a cold by dinner.' : 'You stomped through every puddle on the street. Your mom gave up on your clothes.', 'I splashed in the floodwater when school was canceled.', sick ? { happiness: 4, health: -4 } : { happiness: 10 }, sick ? 'neutral' : 'good')
      },
      boats: (g) => say(g, null, 'Admiral', 'You folded a fleet of paper boats and raced them down the gutter. Yours won. Obviously.', 'I raced paper boats down the flooded street.', { happiness: 8, smarts: 1 }, 'good'),
      help: (g) => say(g, null, ['Good kid', 'Helping hand'], 'You spent the day helping the neighbors clean up. Somebody gave you a snack and called you a hero.', 'I helped the neighbors on a day off from school.', { karma: 6, happiness: 4 }, 'good'),
      fort: (g) => say(g, null, 'Fortress', 'You built a blanket fort so big it had a guest room. The storm never stood a chance.', 'I built a blanket fort during a sandstorm.', { happiness: 8 }, 'good'),
      watch: (g) => say(g, null, 'Apocalypse view', 'You watched the sky turn orange and pretended you were on Mars. Best day ever.', 'I watched a sandstorm from the window.', { happiness: 5, smarts: 1 }, 'good'),
      sneak: (g) => say(g, null, 'Sandblasted', 'You stepped outside for ten seconds and came back with sand in places sand should never be.', 'I snuck out into a sandstorm. Bad idea.', { happiness: -2, health: -3 }, 'bad'),
      park: (g) => say(g, null, 'Freedom', 'You played outside from breakfast until the streetlights came on.', 'I played outside all day when the teachers went on strike.', { happiness: 10, health: 2 }, 'good'),
      picket: (g) => say(g, null, 'Solidarity', 'You made your own sign and marched with the teachers. Your favorite teacher teared up.', "I joined my teachers' picket line.", { happiness: 6, karma: 4 }, 'good'),
      games: (g, x) => say(g, x, 'Cozy', indoorGame(g).text, `I ${indoorGame(g).did} all day on a ${x.s('day') || 'snow day'}.`, { happiness: 6, health: -2 }),
    },
  },
  {
    id: 'kid.toothFairy',
    emoji: '🦷',
    title: 'Loose Tooth',
    minAge: 5,
    maxAge: 8,
    setup: () => ({
      text: 'Your wiggly tooth finally came out! What will you do with it?',
      choices: [ch('pillow', 'Put it under my pillow'), ch('keep', 'Keep it in a jar'), ch('sell', 'Sell it to a sibling')],
    }),
    resolve: {
      pillow: (g) => {
        const amt = randInt(g, 1, 5)
        say(g, null, ['Tooth fairy', 'Cha-ching'], `You woke up to find ${money(amt)} under your pillow. The tooth fairy pays better than your parents.`, `The tooth fairy left me ${money(amt)} for my tooth.`, { money: amt, happiness: 8 }, 'good', '🧚')
      },
      keep: (g) => say(g, null, 'Collector', 'You started a tooth collection in a jar. Your parents are a little concerned.', 'I started a collection of my baby teeth in a jar.', { craziness: 3, happiness: 2 }),
      sell: (g) => {
        const sib = siblings(g)[0]
        say(g, null, sib ? 'Business deal' : 'No buyers', sib ? `You sold your tooth to ${sib.firstName} for a pack of gum. Nobody knows why they wanted it.` : 'You tried to sell your tooth, but nobody wanted it. Weird.', sib ? `I sold my baby tooth to my sibling, ${sib.firstName}, for a pack of gum.` : 'I tried to sell my baby tooth. No buyers.', { happiness: 4, smarts: 2, rels: [{ p: sib, d: 2 }] })
      },
    },
  },
  {
    id: 'kid.sleepover',
    emoji: '🎬',
    title: 'Sleepover',
    minAge: 8,
    maxAge: 13,
    setup: (g) => {
      // A rented horror tape from the eighties, the late movie on TV before that, and ghost
      // stories by flashlight before anyone had a TV.
      const mode = g.year >= 1982 && common(g, 'tv') ? 'tape' : common(g, 'tv') ? 'tv' : 'ghost'
      const call = landline(g)
      return {
        text:
          mode === 'tape'
            ? "At a sleepover, your friends put on a horror movie that's definitely rated for adults. What will you do?"
            : mode === 'tv'
              ? 'At a sleepover, your friends sneak downstairs to watch the late-night horror movie on TV. What will you do?'
              : 'At a sleepover, your friends turn off the lamps and start telling ghost stories by flashlight. What will you do?',
        choices:
          mode === 'ghost'
            ? [ch('watch', 'Listen to every word'), ch('eyes', 'Hide under the blanket'), ch('home', call ? 'Call my parents to pick me up' : 'Run home in the dark')]
            : [ch('watch', 'Watch the whole thing'), ch('eyes', 'Watch through my fingers'), ch('home', call ? 'Call my parents to pick me up' : 'Run home in the dark')],
        data: { mode, call: call ? 1 : 0 },
      }
    },
    resolve: {
      watch: (g, x) => {
        const scared = chance(g, 0.5)
        const ghost = x.s('mode') === 'ghost'
        say(g, x, scared ? 'Nightmares' : 'Fearless', scared ? (ghost ? "You listened to every word. You haven't slept with the lights off since." : "You watched the whole thing. You haven't slept with the lights off since.") : ghost ? 'You listened without flinching and told a scarier one. Your friends now think you might be haunted.' : 'You watched it without flinching. Your friends now think you might be a robot.', ghost ? 'I sat through the scariest ghost stories at a sleepover.' : 'I watched a scary movie at a sleepover.', scared ? { happiness: -6, craziness: 2 } : { happiness: 6 }, scared ? 'bad' : 'good')
      },
      eyes: (g, x) =>
        x.s('mode') === 'ghost'
          ? say(g, x, 'Peekaboo', 'You hid under the blanket and heard roughly 30% of every story.', 'I hid under a blanket during ghost stories at a sleepover.', { happiness: 2 })
          : say(g, x, 'Peekaboo', 'You watched the entire movie through your fingers. You saw roughly 30% of it.', 'I watched a scary movie through my fingers at a sleepover.', { happiness: 2 }),
      home: (g, x) => {
        const why = x.s('mode') === 'ghost' ? 'ghost stories' : 'a scary movie'
        if (x.data.call !== undefined && x.n('call') === 0) say(g, x, 'Early exit', 'You ran all the way home in the dark, which was somehow scarier. Your friends will never let this go.', `I left a sleepover early because of ${why}.`, { happiness: -6 }, 'bad')
        else say(g, x, 'Early exit', 'You called your parents at 10 PM to come get you. Your friends will never let this go.', `I left a sleepover early because of ${why}.`, { happiness: -6 }, 'bad')
      },
    },
  },
  {
    id: 'kid.newWord',
    emoji: '🤐',
    title: 'Vocabulary',
    minAge: 5,
    maxAge: 10,
    when: (g) => !!aParent(g),
    setup: () => ({
      text: 'You learned a brand new word on the playground today. The older kids said it was a VERY grown-up word. What will you do with it?',
      choices: [ch('dinner', 'Say it at family dinner'), ch('ask', 'Ask what it means'), ch('save', 'Save it for later')],
    }),
    resolve: {
      dinner: (g) => say(g, null, ['Soap', 'Silence'], 'You said it at dinner. Your grandmother dropped her fork. You lost dessert privileges for a month.', 'I said a bad word at the dinner table.', { happiness: -6, rels: parentMad(g, -6) }, 'bad'),
      ask: (g) => say(g, null, 'The talk', 'You asked your parent what it meant. They turned bright red and changed the subject to the weather.', 'I asked my parent what a bad word meant.', { smarts: 4 }),
      save: (g) => say(g, null, 'Patient', "You tucked it away for when you really need it, like when you stub your toe.", 'I learned a bad word and saved it for later.', { smarts: 2 }),
    },
  },
  {
    id: 'kid.iceCream',
    emoji: '🍦',
    title: 'Ice Cream Truck',
    minAge: 4,
    maxAge: 10,
    setup: (g) => ({
      text: `You hear the jingle of the ice cream ${g.year >= 1930 ? 'truck' : 'cart'} coming down the street! What will you do?`,
      choices: [ch('beg', 'Beg my parents for money'), ch('chase', 'Chase it down the street'), ch('savings', 'Use my piggy bank savings'), ch('ignore', 'Ignore it')],
    }),
    resolve: {
      beg: (g) => {
        const yes = chance(g, 0.6)
        say(g, null, yes ? 'Brain freeze' : 'No dice', yes ? g.character.countryId === 'us' ? `Your parents caved and gave you a few ${g.year >= 1940 ? 'bucks' : 'nickels'}. You got ${g.year >= 1955 ? 'a rocket pop' : 'a frozen custard'}.` : 'Your parents caved and gave you some coins. You got a rainbow ice pop.' : 'Your parents said you already had dessert. The jingle faded into the distance.', yes ? 'I begged my parents for ice cream money and got a treat.' : "My parents wouldn't give me money for ice cream.", yes ? { happiness: 8 } : { happiness: -4 })
      },
      chase: (g) => {
        const fell = chance(g, 0.2)
        say(g, null, fell ? 'Skinned knee' : 'Cardio', fell ? `You sprinted after the ${g.year >= 1930 ? 'truck' : 'cart'}, tripped and skinned both knees. It kept going.` : `You chased the ${g.year >= 1930 ? 'truck' : 'cart'} for three blocks and finally caught it. The ${g.year >= 1930 ? 'driver' : 'vendor'} gave you a free cone for effort.`, fell ? `I chased the ice cream ${g.year >= 1930 ? 'truck' : 'cart'} and skinned my knees.` : `I chased down the ice cream ${g.year >= 1930 ? 'truck' : 'cart'} and got a free cone.`, fell ? { health: -4, happiness: -4 } : { happiness: 8, health: 2 }, fell ? 'bad' : 'good')
      },
      savings: (g) => {
        if (g.character.money < 3) {
          say(g, null, 'Broke', 'You shook your piggy bank. A single button fell out.', 'I tried to buy ice cream but my piggy bank was empty.', { happiness: -4 }, 'bad', '🐷')
        } else {
          say(g, null, 'Treat yourself', 'You cracked open the piggy bank and bought the biggest ice cream on the menu.', 'I spent my savings on ice cream.', { money: -3, happiness: 8 }, 'good')
        }
      },
      ignore: (g) => say(g, null, 'Self control', `You let the ice cream ${g.year >= 1930 ? 'truck' : 'cart'} pass. Your dentist would be proud.`, `I ignored the ice cream ${g.year >= 1930 ? 'truck' : 'cart'}.`, { health: 2 }),
    },
  },
  {
    id: 'kid.firstPeriod',
    emoji: '🔴',
    title: 'Growing Up',
    minAge: 10,
    maxAge: 15,
    once: true,
    weight: 12,
    when: (g) => g.character.gender === 'female',
    setup: (g) => {
      const mom = mother(g)
      const sis = siblings(g).find((s) => s.gender === 'female' && s.age >= 12)
      const f = anyOf(g, friends(g))
      return {
        text: 'You just got your first period. What will you do?',
        choices: [...(mom ? [ch('mom', 'Tell my mother')] : []), ...(f ? [ch('friend', `Tell ${f.firstName}`)] : []), ...(sis ? [ch('sister', `Tell my sister, ${sis.firstName}`)] : []), ...(!mom && !f ? [ch('nurse', 'Visit the school nurse')] : []), ch('secret', 'Keep it a secret')],
        data: { momId: mom?.id ?? '', friendId: f?.id ?? '', sisId: sis?.id ?? '' },
      }
    },
    resolve: {
      mom: (g, x) => {
        const p = g.people.find((q) => q.id === x.s('momId'))
        say(g, x, 'Mom to the rescue', `You told your mother${p ? `, ${p.firstName},` : ''} who gave you a hug, supplies and a very long talk.`, 'I got my first period and shared the news with my mother.', { happiness: 4, rels: [{ p, d: 10 }] }, 'good')
      },
      friend: (g, x) => {
        const p = g.people.find((q) => q.id === x.s('friendId'))
        say(g, x, 'Solidarity', `You told ${p?.firstName ?? 'your friend'}, who shared every tip she knew.`, 'I got my first period and told my friend.', { happiness: 4, rels: [{ p, d: 8 }] }, 'good')
      },
      nurse: (g, x) => say(g, x, 'Nurse to the rescue', 'The school nurse handed you supplies, a pamphlet and a granola bar, then sent you back to class like a pro.', 'I got my first period and the school nurse helped me out.', { happiness: 3 }, 'good'),
      sister: (g, x) => {
        const p = g.people.find((q) => q.id === x.s('sisId'))
        say(g, x, 'Big sister knows', `You told ${p?.firstName ?? 'your sister'}, who was surprisingly sweet about it.`, 'I got my first period and told my sister.', { happiness: 4, rels: [{ p, d: 10 }] }, 'good')
      },
      secret: (g) => say(g, null, 'Private matter', 'You kept it to yourself and figured it out on your own.', 'I got my first period and kept it to myself.', { smarts: 2 }),
    },
  },
  {
    id: 'kid.diary',
    emoji: '📔',
    title: 'Dear Diary',
    minAge: 9,
    maxAge: 16,
    when: (g) => siblings(g).some((s) => s.age >= 6 && s.age < 25),
    setup: (g) => {
      const sib = anyOf(g, siblings(g).filter((s) => s.age >= 6 && s.age < 25))
      if (!sib) return null
      return {
        text: `You caught ${yourSib(sib)} reading your diary out loud to their friends. What will you do?`,
        choices: [ch('read', "Read their diary back"), ch('parents', 'Tell our parents'), ch('cry', 'Cry'), ch('laugh', 'Laugh along')],
        person: sib,
      }
    },
    resolve: {
      read: (g, x) => say(g, x, 'Mutually assured destruction', `You found ${x.p?.firstName ?? 'their'}'s diary and read the juiciest parts at dinner. Nobody won.`, `I got revenge on my sibling for reading my diary.`, { rel: -12, happiness: 4 }),
      parents: (g, x) => say(g, x, 'Justice', `Your parents confiscated ${x.p?.firstName ?? 'their'}'s ${prized(g)} for a week.`, 'I told my parents my sibling read my diary.', { rel: -6, happiness: 2 }),
      cry: (g, x) => say(g, x, 'Mortified', 'You locked yourself in your room and cried. Your deepest secrets are now public knowledge.', 'My sibling read my diary to their friends.', { happiness: -10, rel: -6 }, 'bad'),
      laugh: (g, x) => say(g, x, 'Unbothered', 'You laughed along. Hard to embarrass someone who has no shame.', 'I laughed it off when my sibling read my diary out loud.', { happiness: 4, rel: 4 }, 'good'),
    },
  },
  {
    id: 'kid.petOffer',
    emoji: '🐾',
    title: 'New Pet',
    minAge: 5,
    maxAge: 14,
    once: true,
    when: (g) => !!aParent(g) && pets(g).length === 0 && g.character.residence.status === 'parents',
    setup: (g) => {
      const kind = pick(g, PETS)
      const name = pick(g, kind.names)
      return {
        text: `Your parents are offering to get you a ${kind.species.toLowerCase()}! What will you do?`,
        choices: [ch('yes', 'Accept it'), ch('no', 'Turn it down')],
        person: aParent(g),
        data: { species: kind.species, name },
      }
    },
    resolve: {
      yes: (g, x) => {
        addPet(g, x.s('species'), x.s('name'))
        say(g, x, ['Best day ever', 'New family member'], `You got a ${x.s('species').toLowerCase()} and named it ${x.s('name')}!`, `My parents got me a ${x.s('species').toLowerCase()} named ${x.s('name')}.`, { happiness: 16, rel: 6, count: 'pets' }, 'good')
      },
      no: (g, x) => {
        const sib = siblings(g).find((s) => s.age >= 4 && s.age < 18)
        say(g, x, 'No thanks', sib ? `You turned down the ${x.s('species').toLowerCase()}. ${sib.firstName} is furious with you.` : `You turned down the ${x.s('species').toLowerCase()}. Your parents were secretly relieved.`, `I turned down my parents' offer to get a ${x.s('species').toLowerCase()}.`, { happiness: -2, rels: [{ p: sib, d: -12 }] })
      },
    },
  },
  {
    id: 'kid.boardGame',
    emoji: '🎲',
    title: 'Game Night',
    minAge: 6,
    maxAge: 13,
    when: (g) => !!aParent(g) || siblings(g).length > 0,
    setup: (g) => {
      const p = anyOf(g, [...siblings(g).filter((s) => s.age >= 5), ...(aParent(g) ? [aParent(g) as Person] : [])])
      if (!p) return null
      return {
        text: `You lost a heated board game to ${yourAny(p)} on family game night. They're doing a victory dance. What will you do?`,
        choices: [ch('flip', 'Flip the board'), ch('congrats', 'Congratulate them'), ch('rematch', 'Demand a rematch')],
        person: p,
      }
    },
    resolve: {
      flip: (g, x) => say(g, x, ['Sore loser', 'Table flip'], g.year >= 1955 ? 'You flipped the board. Little plastic houses are still being found under the couch.' : 'You flipped the board. Little wooden houses are still being found under the couch.', `I flipped the board after losing a game to ${x.p?.firstName ?? 'my family'}.`, { rel: -8, happiness: 2, craziness: 2 }, 'bad'),
      congrats: (g, x) => say(g, x, 'Good sport', 'You congratulated them graciously. Character growth!', `I lost a board game to ${x.p?.firstName ?? 'my family'} and was a good sport.`, { rel: 6, karma: 2 }, 'good'),
      rematch: (g, x) => {
        const won = chance(g, 0.5)
        say(g, x, won ? 'Redemption' : 'Double loss', won ? 'You won the rematch and did an even bigger victory dance.' : 'You lost the rematch too. Badly.', won ? `I won a board game rematch against ${x.p?.firstName ?? 'my family'}.` : `I lost a board game twice in a row to ${x.p?.firstName ?? 'my family'}.`, won ? { happiness: 8 } : { happiness: -4 })
      },
    },
  },
  {
    id: 'kid.recess',
    emoji: '🏃',
    title: 'Recess',
    minAge: 6,
    maxAge: 11,
    when: (g) => g.character.education.current?.level === 'elementary',
    setup: () => ({
      text: 'The recess bell just rang! What will you do?',
      choices: [ch('tag', 'Play tag'), ch('foursquare', 'Play four square'), ch('read', 'Read under a tree'), ch('rule', 'Try to become king of the playground')],
    }),
    resolve: {
      tag: (g) => say(g, null, "You're it", 'You played tag and were "it" for the entire recess. Great cardio, though.', 'I played tag at recess.', { health: 4, happiness: 4 }),
      foursquare: (g) => say(g, null, 'Champion', 'You held the king square for 20 straight minutes. A dynasty.', 'I dominated four square at recess.', { happiness: 6, health: 2 }, 'good'),
      read: (g) => say(g, null, 'Bookworm', 'You read under a tree in peace. Bliss.', 'I read a book under a tree at recess.', { smarts: 6 }, 'good'),
      rule: (g) => {
        const ok = chance(g, 0.35)
        say(g, null, ok ? 'All hail' : 'Overthrown', ok ? 'You were crowned ruler of the jungle gym. Your reign will be remembered.' : `Your coup failed. A third-grader named ${strangerName(g, 'female').first} pushed you off the slide.`, ok ? 'I was crowned ruler of the playground at recess.' : 'I tried to take over the playground at recess and failed.', ok ? { happiness: 10 } : { happiness: -4, health: -2 }, ok ? 'good' : 'bad', '👑')
      },
    },
  },
])

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function yourSib(p: Person): string {
  return `your ${p.gender === 'male' ? 'brother' : 'sister'} ${p.firstName}`
}

function yourParent(p: Person): string {
  return `Your ${p.gender === 'male' ? 'father' : 'mother'}, ${p.firstName},`
}

function yourAny(p: Person): string {
  if (p.relation === 'parent' || p.relation === 'stepparent') return `your ${p.gender === 'male' ? 'father' : 'mother'}`
  return `your ${p.gender === 'male' ? 'brother' : 'sister'}, ${p.firstName}`
}

