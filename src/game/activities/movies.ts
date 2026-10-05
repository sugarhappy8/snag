// Movie Theater (pick a genre, go alone or with someone) and the Zoo.
import { addRelationship, addStat, count, log, relationLabel } from '../core'
import { notePerson } from '../people'
import { chance, pick, randInt, weightedPick } from '../rng'
import { randomFirstName, randomLastName } from '../world'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { brokeNotice, companionCandidates, gate, localPrice, money, payFor, result, usesLeft } from './common'
import { maybeAskedOut, presentSos } from './encounters'

type Genre =
  | 'Family'
  | 'Action'
  | 'Adventure'
  | 'Comedy'
  | 'Documentary'
  | 'Drama'
  | 'Fantasy'
  | 'Horror'
  | 'Indie'
  | 'Musical'
  | 'Mystery'
  | 'Romantic Comedy'
  | 'Science Fiction'
  | 'Sports'
  | 'Thriller'
  | 'War'
  | 'Western'

interface GenreDef {
  id: Genre
  emoji: string
  minAge: number
  titles: string[]
}

// {first} / {last} are filled with random names, sometimes the player's own.
const GENRES: GenreDef[] = [
  {
    id: 'Family',
    emoji: '\u{1F9F8}',
    minAge: 0,
    titles: ['My Hamster Is a Spy', 'The Secret Elevator in My Closet', 'Dinosaur Bones in My Backyard', '{first} and the Bamboo Beanstalk', 'Overcast with a Chance of Pancakes', "{first}'s Unicorn", 'The Muscular Merman', 'Grandma Goes to Space', 'Pickle Patrol'],
  },
  {
    id: 'Action',
    emoji: '\u{1F4A5}',
    minAge: 13,
    titles: ['Maximum Endangerment', 'Savage {first}', 'Explosion Highway 4', 'No Time to Blink', 'Die Harder Than Before', '{last}: Rogue Agent', 'Fist Protocol'],
  },
  {
    id: 'Adventure',
    emoji: '\u{1F5FA}\u{FE0F}',
    minAge: 13,
    titles: ["A Sailor's Warning", 'Idaho {last} and the Pyramid of Doom', "{first}'s Journey to the Bottom of the Sea", 'Rebel of the East', 'Witches of the Wood', 'The Lost Map of Captain {last}'],
  },
  {
    id: 'Comedy',
    emoji: '\u{1F602}',
    minAge: 13,
    titles: ['A Bunch of Malarkey', 'Brouhaha', 'Cattywampus', 'Kung Fu Tofu', "Grandpa's Unfiltered Opinion", 'Mr. {last} Goes to Philadelphia', "There's Something About {first}", '{first} Relocates to Rural Florida', 'Honey Badger Is Unbothered'],
  },
  {
    id: 'Documentary',
    emoji: '\u{1F3A5}',
    minAge: 13,
    titles: ['A History of Badminton', 'Happy Little Trees: The Legend of a Painter', 'I Love Math: The Musical Mathematicians', 'Sea Creatures: What Lies Beneath', 'Who Is Eating What: Why We Photograph Food', 'The Other Web: Inside the Dark Net', 'Politicians Without Limits', 'Vultures of Time'],
  },
  {
    id: 'Drama',
    emoji: '\u{1F3AD}',
    minAge: 16,
    titles: ['Blacksmith of the South', 'Heir Without Fear', 'Lavender Fields', 'Good {first}', 'The Curious Case of Poppy Hill', 'The Godmother', 'Citizen {last}'],
  },
  {
    id: 'Fantasy',
    emoji: '\u{1F9D9}',
    minAge: 13,
    titles: ['Atop the Beanstalk', 'Fantastic Dreams of {first}', 'Into the Unknown Realm', 'Meet You on the Moon', 'The Clairvoyant of Chattanooga', "{first}'s Labyrinth"],
  },
  {
    id: 'Horror',
    emoji: '\u{1F47B}',
    minAge: 16,
    titles: ['A Dull Blade', 'Man in the Forest', 'Paranormal Problems', 'The Devil’s in the Details', "Your Grandmother's Attic", "You've Been Warned", "{first}'s Nightmare", 'Under the Knife with Dr. Gravesend'],
  },
  {
    id: 'Indie',
    emoji: '\u{1F3B8}',
    minAge: 16,
    titles: ['Millennial Man', 'My Budding Flower', "My Sister's Skinny Jeans", 'Spilling the Tea', "Who's Salty?"],
  },
  {
    id: 'Musical',
    emoji: '\u{1F3B6}',
    minAge: 6,
    titles: ['Fiddler in the Attic', 'Ghost in the Concert Hall', 'Singing in the Snow', 'Shop Full of Fright', '{first}! The Musical'],
  },
  {
    id: 'Mystery',
    emoji: '\u{1F575}\u{FE0F}',
    minAge: 13,
    titles: ['Dinner at the Haunted Mansion', 'Get a Clue!', "I'm Dead!", 'The Man Who Ghosted Me', 'Who Took the Last Cookie?'],
  },
  {
    id: 'Romantic Comedy',
    emoji: '\u{1F498}',
    minAge: 13,
    titles: ['99 Things I Love About You', 'Bounce with My Bae', "Breakfast at {first}'s", 'Duke with Funny Socks', 'I Fell for a Mortician', 'Mom Meets My Boyfriends', "My Best Friend's Funeral", 'When Harry Met {first}', 'Sorry Not Sorry'],
  },
  {
    id: 'Science Fiction',
    emoji: '\u{1F47D}',
    minAge: 13,
    titles: ['Cryostasis', 'Dr. {last}', 'Robot of Darkness', 'Volunteer of the New World', "{first}'s Computer Takes Over", 'Planet of the Sentient Toasters'],
  },
  {
    id: 'Sports',
    emoji: '\u{1F3C8}',
    minAge: 13,
    titles: ['Bang-Bang Play', "Bill's Big League Breaststroke", 'Bump and Run', 'Rising to the Occasion', 'Sammy Splits the Uprights', 'The Switch Hitter'],
  },
  {
    id: 'Thriller',
    emoji: '\u{1F52A}',
    minAge: 16,
    titles: ['Duchess of the Ocean', 'Hunter of the Nether', 'The Campfire', 'The River Styx', 'The Talented Mr. {last}', "We're Watching You", 'What Sits Upon the Top Floor'],
  },
  {
    id: 'War',
    emoji: '\u{1F396}\u{FE0F}',
    minAge: 16,
    titles: ['Hardened Harry', 'Loud as Thunder on the Eastern Front', 'Solid as a Rock', 'The Last Battle', 'Saving Private {last}'],
  },
  {
    id: 'Western',
    emoji: '\u{1F920}',
    minAge: 13,
    titles: ['Arrowhead', 'Gravestone', 'High Noon in Tumbleweed', 'The Superior Six', 'Uncle Outlaw'],
  },
]

const MOVIES_PER_YEAR = 6

function movieTitle(g: GameState, genre: GenreDef): string {
  const c = g.character
  const own = chance(g, 0.12)
  const gender = chance(g, 0.5) ? 'male' : 'female'
  const first = own ? c.firstName : randomFirstName(g, c.countryId, gender)
  const last = own ? c.lastName : randomLastName(g, c.countryId)
  return pick(g, genre.titles).replace('{first}', first).replace('{last}', last)
}

function ticketPrice(g: GameState): number {
  return localPrice(g, 12)
}

function availableGenres(g: GameState): GenreDef[] {
  const age = g.character.age
  if (age < 13) return GENRES.filter((x) => x.id === 'Family' || x.id === 'Musical')
  return GENRES.filter((x) => age >= x.minAge)
}

const REVIEWS: Record<number, string[]> = {
  1: ['It was the worst movie you have ever seen. You want those two hours back.', 'You fell asleep halfway through and woke up to the credits. You did not miss anything.'],
  2: ['It was... fine. You forgot the plot before you reached the parking lot.', 'The trailer was better than the movie.'],
  3: ['It was a perfectly decent movie. Solid popcorn flick.', 'Not bad! A couple of good scenes and a nice soundtrack.'],
  4: ['You loved it! You are already planning to see it again.', 'Great movie. You stayed through the credits for the bonus scene.'],
  5: ['A masterpiece. You left the theater a changed person.', 'Best movie of the year. You clapped when it ended and you are not even embarrassed.'],
}

const MISHAPS = [
  'Someone kicked the back of your seat for the entire movie.',
  "Someone's phone kept ringing during the quiet parts.",
  'You spilled an entire tub of popcorn in your lap.',
  'A couple behind you narrated the whole thing.',
]

function watchMovie(g: GameState, genre: GenreDef, companionId: string | null): void {
  const c = g.character
  const companion = companionId ? g.people.find((p) => p.id === companionId && p.alive) : undefined
  if (companionId && !companion) return
  if ((g.yearActions['act.movie'] ?? 0) >= MOVIES_PER_YEAR) {
    result(g, 'Movie Theater', pick(g, [
      "You've already seen everything worth watching this year.",
      'The ticket clerk knows you by name. Maybe take a break from the movies until next year.',
    ]), '\u{1F37F}')
    return
  }
  if (!companion && c.age < 13) {
    result(g, 'Too Young', "You're too young to go to the movies by yourself. Ask someone to come with you!", '\u{1F9D2}')
    return
  }
  if (companion) {
    if ((g.yearActions[`act.movie.p.${companion.id}`] ?? 0) >= 1) {
      result(g, 'Not Again', `${companion.firstName} already went to the movies with you this year.`, '\u{1F37F}')
      return
    }
    const minRel = companion.relation === 'child' && companion.age < 13 ? 0 : 20
    if (companion.relationship < minRel) {
      g.yearActions[`act.movie.p.${companion.id}`] = 1
      log(g, `${companion.firstName} refused to go to the movies with me.`, 'bad')
      result(g, 'Declined', `${companion.firstName} said ${companion.gender === 'male' ? 'he' : 'she'} would rather watch paint dry than go to the movies with you.`, '\u{1F645}', 'bad')
      return
    }
  }
  const tickets = companion ? 2 : 1
  const cost = ticketPrice(g) * tickets
  const paid = payFor(g, cost, true)
  if (!paid) {
    brokeNotice(g, cost, tickets > 1 ? 'two movie tickets' : 'a movie ticket')
    return
  }
  g.yearActions['act.movie'] = (g.yearActions['act.movie'] ?? 0) + 1
  if (companion) g.yearActions[`act.movie.p.${companion.id}`] = 1
  count(g, 'movies')
  const title = movieTitle(g, genre)
  const stars = weightedPick(g, [1, 2, 3, 4, 5], (s) => [0, 10, 20, 30, 25, 15][s])
  let happy = (stars - 2) * 2 + randInt(g, 0, 2)
  if (genre.id === 'Comedy' || genre.id === 'Family') happy += 2
  addStat(g, 'happiness', happy)
  let extra = ''
  if (genre.id === 'Documentary') {
    const s = stars >= 3 ? randInt(g, 2, 4) : 1
    addStat(g, 'smarts', s)
    extra = '\n\nYou learned a lot.'
  }
  if (genre.id === 'Horror' && chance(g, 0.3)) extra = '\n\nYou screamed so loudly during the jump scare that the whole theater laughed at you.'
  if (chance(g, 0.12)) {
    addStat(g, 'happiness', -1)
    extra += `\n\n${pick(g, MISHAPS)}`
  }
  let withLine = ''
  if (companion) {
    addRelationship(companion, randInt(g, 4, 10))
    notePerson(companion, `Saw "${title}" at the movies with the player.`)
    withLine = `\n\nYou and ${companion.firstName} had a great time together.`
  }
  log(g, companion ? `I saw "${title}" with ${companion.firstName}. ${stars}/5 stars.` : `I went to see "${title}." ${stars}/5 stars.`, stars >= 3 ? 'good' : 'neutral')
  const payer = paid.by === 'parent' && paid.parent && paid.parent.id !== companion?.id ? `\n\nYour ${paid.parent.gender === 'male' ? 'dad' : 'mom'} paid for the tickets.` : ''
  result(g, title, `${genre.emoji} ${genre.id}\n${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}\n\n${pick(g, REVIEWS[stars])}${extra}${withLine}${payer}`, '\u{1F3AC}', stars >= 3 ? 'good' : undefined)
  if (!companion) maybeAskedOut(g, 'movie theater', 0.05)
}

function companionNodes(g: GameState, prefix: string, run: (d: GameState, id: string | null) => void, minAge: number): MenuNode[] {
  const nodes: MenuNode[] = []
  if (g.character.age >= 13) {
    nodes.push({ type: 'action', id: `${prefix}.alone`, label: 'Go Alone', emoji: '\u{1F9CD}', run: (d) => run(d, null) })
  }
  const people = companionCandidates(g, { minAge, max: 8 })
  if (people.length) nodes.push({ type: 'heading', id: `${prefix}.with`, label: 'Go with someone' })
  for (const p of people) {
    const action: MenuAction = {
      type: 'action',
      id: `${prefix}.p.${p.id}`,
      label: `${p.firstName} ${p.lastName}`.trim(),
      emoji: '\u{1F465}',
      subtitle: relationLabel(p),
      run: (d) => run(d, p.id),
    }
    nodes.push(action)
  }
  if (!nodes.length) nodes.push({ type: 'info', id: `${prefix}.none`, text: "You don't have anyone to go with.", emoji: '\u{1F622}' })
  return nodes
}

export const moviesMenu: MenuGroup = {
  type: 'menu',
  id: 'movies',
  label: 'Movie Theater',
  emoji: '\u{1F3AC}',
  subtitle: 'Go to the movies',
  disabledReason: (g) => gate(g, { minAge: 6 }),
  header: (g) => `Tickets cost ${money(ticketPrice(g))}. You can see ${usesLeft(g, 'act.movie', MOVIES_PER_YEAR)} more movies this year.`,
  children: (g): MenuNode[] =>
    availableGenres(g).map(
      (genre): MenuGroup => ({
        type: 'menu',
        id: `movies.${genre.id}`,
        label: genre.id === 'Family' ? 'Family Movie' : genre.id,
        emoji: genre.emoji,
        subtitle: genre.id === 'Documentary' ? 'Learn something' : genre.id === 'Comedy' ? 'Have a laugh' : undefined,
        header: () => 'Who do you want to go with?',
        children: (s) => companionNodes(s, `movies.${genre.id}`, (d, id) => watchMovie(d, genre, id), 4),
      }),
    ),
}

// ---------------------------------------------------------------------------
// Zoo

const ZOO_PER_YEAR = 2

const ZOO_HIGHLIGHTS = [
  'You watched the penguins waddle around and laughed until you cried.',
  'A giraffe ate lettuce right out of your hand. Its tongue was purple and way too long.',
  'The lions were asleep the entire time. Very majestic naps.',
  'You spent an hour at the gorilla exhibit having a staring contest with a silverback. You lost.',
  'The baby elephant splashed water on the crowd and you got soaked.',
  'You watched the sea lion show and got front-row seats in the splash zone.',
  'The otters were holding hands. You took 60 pictures.',
  'A peacock fanned its feathers just for you. Probably.',
]

const ZOO_MISHAPS = [
  { text: 'A monkey threw something at you. It was not a banana.', happy: -3 },
  { text: 'A goat in the petting zoo ate part of your shirt.', happy: -1 },
  { text: 'You paid $9 for a hot dog that tasted like sadness.', happy: -1 },
  { text: 'It rained the whole time and the animals all hid inside.', happy: -2 },
]

function zooVisit(g: GameState, companionId: string | null): void {
  const c = g.character
  const companion = companionId ? g.people.find((p) => p.id === companionId && p.alive) : undefined
  if (companionId && !companion) return
  if ((g.yearActions['act.zoo'] ?? 0) >= ZOO_PER_YEAR) {
    result(g, 'Zoo', "You've already been to the zoo enough this year. The animals are starting to recognize you.", '\u{1F981}')
    return
  }
  if (!companion && c.age < 13) {
    result(g, 'Too Young', "You're too young to go to the zoo alone. Ask someone to take you!", '\u{1F9D2}')
    return
  }
  if (companion && companion.relationship < 20 && !(companion.relation === 'child' && companion.age < 13)) {
    log(g, `${companion.firstName} didn't want to go to the zoo with me.`, 'bad')
    result(g, 'Declined', `${companion.firstName} said no. Apparently a day at the zoo with you isn't worth it.`, '\u{1F645}', 'bad')
    return
  }
  const cost = localPrice(g, 25) * (companion ? 2 : 1)
  const paid = payFor(g, cost, true)
  if (!paid) {
    brokeNotice(g, cost, companion ? 'two zoo tickets' : 'a zoo ticket')
    return
  }
  g.yearActions['act.zoo'] = (g.yearActions['act.zoo'] ?? 0) + 1
  count(g, 'zooVisits')
  addStat(g, 'happiness', randInt(g, 3, 8))
  if (companion) {
    addRelationship(companion, randInt(g, 4, 10))
    notePerson(companion, 'Went to the zoo with the player.')
  }
  log(g, companion ? `I went to the zoo with ${companion.firstName}.` : 'I went to the zoo.', 'good')
  if (c.age >= 13 && chance(g, 0.015)) {
    presentSos(g, 'zoo')
    return
  }
  const withLine = companion ? `\n\nYou and ${companion.firstName} had a wonderful day together.` : ''
  if (chance(g, 0.15)) {
    const m = pick(g, ZOO_MISHAPS)
    addStat(g, 'happiness', m.happy)
    result(g, 'Zoo', `${pick(g, ZOO_HIGHLIGHTS)}\n\n${m.text}${withLine}`, '\u{1F412}')
    return
  }
  result(g, 'Zoo', `${pick(g, ZOO_HIGHLIGHTS)}${withLine}`, '\u{1F981}', 'good')
}

export const zooMenu: MenuGroup = {
  type: 'menu',
  id: 'zoo',
  label: 'Zoo',
  emoji: '\u{1F981}',
  subtitle: 'Go to the zoo',
  disabledReason: (g) => gate(g, { minAge: 4 }),
  header: (g) => `Tickets cost ${money(localPrice(g, 25))}. Who do you want to go with?`,
  children: (g) => companionNodes(g, 'zoo', zooVisit, 2),
}

