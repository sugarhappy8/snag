// Activities > Fame: what celebrities do with their fame (books, commercials, photo shoots,
// talk shows, autographs, merchandise, podcasts, publicity stunts) plus yearly fame decay,
// royalties and paparazzi/stalker/feud scenarios.
import { addHidden, addRelationship, addStat, count, earnIncome, log, parents, remember, scriptChoice, spend, spouse, useYearAction } from '../core'
import { chance, pick, rand, randInt } from '../rng'
import { defineScript } from '../scripts'
import { localStreetName } from '../data/locales'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { CELEBS, FAMOUS, addFame, blocked, cleanName, fameOf, money, ownFlag, peek, prof, say, tell, vary } from './common'

interface Book {
  title: string
  age: number
  verdict: string
  earned: number
  /** Royalty paid next year; halves every year. */
  royalty: number
}

interface FameProfile {
  books: Book[]
  podcast: { name: string; listeners: number; episodes: number; startedAge: number } | null
  merchLines: number
  commercials: number
}

const initFame = (): FameProfile => ({ books: [], podcast: null, merchLines: 0, commercials: 0 })

function fameProfile(g: GameState): FameProfile {
  return prof(g, 'fame', initFame)
}

/** Careers that keep you in the public eye (their own hooks manage fame). */
export function hasFameCareer(g: GameState): boolean {
  const j = g.character.job
  return !!j && j.category === 'special' && j.defId !== 'hustler' && j.defId !== 'astronaut.cadet'
}

function fameMenuVisible(g: GameState): boolean {
  const c = g.character
  return c.alive && !c.prison && c.age >= 6 && (c.hidden.fame >= FAMOUS || hasFameCareer(g))
}

function needFame(min: number) {
  return (g: GameState): string | null => {
    const b = blocked(g, 0)
    if (b) return b
    if (fameOf(g) < min) return `You need to be more famous first (Fame ${min}%+).`
    return null
  }
}

function tooBusy(g: GameState, what: string): void {
  tell(g, 'Not again', `You've already ${what} this year. Give the public a chance to miss you.`, '\u{1F971}')
}

// ---------------------------------------------------------------------------
// Book

const BOOK_TIERS: [number, string, number, number][] = [
  [12, 'an absolute flop', 0.02, -2],
  [25, 'a disappointment', 0.06, -1],
  [38, 'a commercial failure', 0.12, 0],
  [50, 'a modest seller', 0.3, 1],
  [62, 'a commercial success', 0.6, 2],
  [74, 'well received by critics', 1, 3],
  [86, 'a bestseller', 2, 5],
  [999, 'an overnight bestseller', 3.5, 7],
]

const BOOK_COST = 1_000

const bookAction: MenuAction = {
  type: 'action',
  id: 'fame.book',
  label: 'Book',
  emoji: '\u{1F4D6}',
  subtitle: `Write a book (${money(BOOK_COST)} for editing)`,
  disabledReason: needFame(FAMOUS),
  input: {
    kind: 'text',
    label: 'What is the title of your book?',
    placeholder: 'e.g. Unfiltered',
    defaultValue: (g) => `${g.character.firstName}: Unfiltered`,
  },
  run: (g, input) => {
    if (!useYearAction(g, 'fame.book', 1)) return tooBusy(g, 'released a book')
    if (!spend(g, BOOK_COST)) {
      g.yearActions['fame.book'] = 0
      return tell(g, 'Book', `You can't afford the ${money(BOOK_COST)} it costs to get your manuscript edited and printed.`, '\u{1F4B8}')
    }
    const c = g.character
    const title = cleanName(input, `${c.firstName}: Unfiltered`, 60)
    const score = fameOf(g) * 0.55 + c.stats.smarts * 0.35 + randInt(g, -20, 20) + (/writ|author|poet/i.test(c.talent ?? '') ? 10 : 0)
    const [, verdict, mult, fameDelta] = BOOK_TIERS.find(([max]) => score < max) ?? BOOK_TIERS[BOOK_TIERS.length - 1]
    const earned = Math.max(150, vary(g, (4_000 + fameOf(g) ** 2 * 120 + c.stats.smarts * 150) * mult, 0.3))
    earnIncome(g, earned)
    addFame(g, fameDelta)
    addStat(g, 'happiness', fameDelta >= 2 ? 8 : fameDelta < 0 ? -6 : 2)
    addStat(g, 'smarts', 2)
    const p = fameProfile(g)
    p.books.push({ title, age: c.age, verdict, earned, royalty: Math.round(earned * 0.12) })
    count(g, 'fameActions')
    count(g, 'books')
    log(g, `I published a book called "${title}". It was ${verdict}.`, fameDelta >= 2 ? 'good' : fameDelta < 0 ? 'bad' : 'neutral')
    remember(g, `Published the book "${title}" (${verdict}).`)
    const flavor =
      fameDelta >= 5
        ? pick(g, ['Bookstores can\'t keep it on the shelves.', 'Book clubs everywhere are arguing about chapter 7.', 'Even your harshest critics bought two copies.'])
        : fameDelta >= 2
          ? pick(g, ['Readers seem to genuinely like it.', 'A few talk shows mentioned it favorably.', 'Your mom bought fifty copies, but so did strangers.'])
          : pick(g, ['Most copies are being used to level wobbly tables.', 'The reviews were... words were used.', 'Your publisher has stopped returning your calls.'])
    say(g, 'Book', `Your book "${title}" was ${verdict}. ${flavor} You earned ${money(earned)}.`, '\u{1F4D6}', fameDelta >= 2 ? 'good' : fameDelta < 0 ? 'bad' : 'neutral')
  },
}

// ---------------------------------------------------------------------------
// Commercial

const BRANDS: [string, string][] = [
  ['Burger Blast', 'fast food chain'],
  ['Zoomtastic Motors', 'car company'],
  ['Volt Rush', 'energy drink'],
  ['SafeHaven Mutual', 'insurance company'],
  ["Crunchy O's", 'cereal brand'],
  ['AirStride', 'sneaker brand'],
  ['SilkLocks', 'shampoo brand'],
  ['Ringo Wireless', 'phone carrier'],
  ['Purrfect Bites', 'cat food brand'],
  ['SnoozeBarge', 'mattress company'],
  ['Glint', 'toothpaste brand'],
  ['Bargain Barn', 'discount store chain'],
  ['Moo-Moo Farms', 'dairy brand'],
  ['QuickCash Loans', 'payday lender'],
]

const COMMERCIAL_TIERS: { kind: string; min: number; max: number }[] = [
  { kind: 'local', min: 5_000, max: 25_000 },
  { kind: 'regional', min: 25_000, max: 150_000 },
  { kind: 'national', min: 150_000, max: 800_000 },
  { kind: 'international', min: 800_000, max: 3_000_000 },
]

interface CommercialOffer {
  brand: string
  type: string
  kind: string
  pay: number
}

const commercialScript = defineScript('special.fame.commercial', (g, choice, data) => {
  const offer = data as unknown as CommercialOffer
  if (choice !== 'accept') {
    log(g, `I turned down a commercial for ${offer.brand}.`)
    return say(g, 'Commercial', `You turned down ${offer.brand}. Somewhere, an advertising executive is crying into a stack of storyboards.`, '\u{1F4FA}')
  }
  earnIncome(g, offer.pay)
  fameProfile(g).commercials += 1
  count(g, 'fameActions')
  if (offer.pay >= 2_000_000) g.flags['special.endorser'] = true
  const roll = rand(g)
  let text: string
  if (roll < 0.5) {
    addFame(g, randInt(g, 2, 4))
    addStat(g, 'happiness', 5)
    text = pick(g, [
      'Viewers loved it, and your catchphrase is now stuck in everyone\'s head.',
      'The ad was a hit. Kids are quoting it on playgrounds.',
      'Critics called it "the only commercial worth not skipping."',
    ])
  } else if (roll < 0.8) {
    addFame(g, 1)
    text = pick(g, ['The public reception was lukewarm, but the check cleared.', 'Most people watched it on mute. Still counts.'])
  } else {
    addFame(g, 1)
    addStat(g, 'happiness', -4)
    text = pick(g, [
      'It became a meme for all the wrong reasons.',
      'Late-night hosts spent a week mocking your acting in it.',
      'People said you looked like a hostage reading a script.',
    ])
  }
  log(g, `I starred in a ${offer.kind} commercial for ${offer.brand}.`, 'good')
  say(g, 'Commercial', `You filmed a ${offer.kind} commercial for ${offer.brand} and earned ${money(offer.pay)}. ${text}`, '\u{1F4FA}', 'good')
})

const commercialAction: MenuAction = {
  type: 'action',
  id: 'fame.commercial',
  label: 'Commercial',
  emoji: '\u{1F4FA}',
  subtitle: 'Do a TV commercial',
  disabledReason: needFame(FAMOUS),
  run: (g) => {
    if (!useYearAction(g, 'fame.commercial', 1)) return tooBusy(g, 'looked for commercial deals')
    const f = fameOf(g)
    if (f < 30 && chance(g, 0.6)) {
      return tell(g, 'Commercial', 'No companies are interested in putting your face in a commercial right now. Try again next year.', '\u{1F4FA}')
    }
    const tierIdx = Math.max(0, Math.min(3, Math.floor((f - 20) / 20) + (chance(g, 0.25) ? 1 : 0) - (chance(g, 0.25) ? 1 : 0)))
    const tier = COMMERCIAL_TIERS[tierIdx]
    const within = Math.min(1, Math.max(0, (f - 20 - tierIdx * 20) / 20)) * 0.6 + rand(g) * 0.4
    const pay = Math.round((tier.min + (tier.max - tier.min) * within) / 500) * 500
    const [brand, type] = pick(g, BRANDS)
    const offer: CommercialOffer = { brand, type, kind: tier.kind, pay }
    scriptChoice(
      g,
      commercialScript,
      'Commercial',
      `${brand}, a ${type}, wants you to star in a ${tier.kind} TV commercial. They're offering ${money(pay)}.`,
      [
        { id: 'accept', label: 'Accept', emoji: '\u{2705}' },
        { id: 'decline', label: 'Decline', emoji: '\u{274C}' },
      ],
      { emoji: '\u{1F4FA}', data: offer as unknown as Record<string, string | number> },
    )
  },
}

// ---------------------------------------------------------------------------
// Photo shoot

const MAGAZINES = ['Glossy', 'Hype Monthly', 'Velvet', 'The Scene', 'Luxe Living', 'Grit & Iron', 'Runway Weekly', 'Spotlight']
const SHOOTS: { kind: string; minAge: number; mult: number }[] = [
  { kind: 'casual', minAge: 6, mult: 0.6 },
  { kind: 'formal', minAge: 6, mult: 0.8 },
  { kind: 'avant-garde', minAge: 16, mult: 1 },
  { kind: 'swimsuit', minAge: 18, mult: 1.3 },
  { kind: 'cover', minAge: 12, mult: 1.6 },
]

interface ShootOffer {
  magazine: string
  kind: string
  pay: number
}

const photoScript = defineScript('special.fame.photo', (g, choice, data) => {
  const offer = data as unknown as ShootOffer
  if (choice !== 'accept') {
    return say(g, 'Photo Shoot', `You passed on the ${offer.magazine} shoot. Their photographer will have to find another muse.`, '\u{1F4F8}')
  }
  const c = g.character
  earnIncome(g, offer.pay)
  count(g, 'fameActions')
  const good = c.stats.looks + randInt(g, -25, 25) >= 55
  addFame(g, good ? randInt(g, 2, 4) : 1)
  addStat(g, 'happiness', good ? 6 : -3)
  let extra = ''
  if (offer.kind === 'swimsuit' && chance(g, 0.35)) {
    const critic = spouse(g) ?? parents(g)[0]
    if (critic) {
      addRelationship(critic, -randInt(g, 5, 12))
      extra = ` Your ${critic.relation === 'spouse' ? 'spouse' : critic.gender === 'male' ? 'father' : 'mother'} ${critic.firstName} saw the issue and thinks you showed way too much skin.`
    }
  }
  log(g, `I posed for a ${offer.kind} photo shoot in ${offer.magazine}.`, good ? 'good' : 'neutral')
  const reception = good
    ? pick(g, ['Readers couldn\'t stop talking about how stunning you looked.', 'The issue flew off the newsstands.', 'Fashion bloggers declared it the shoot of the year.'])
    : pick(g, ['A few readers said the lighting did you no favors.', 'The photos were airbrushed so much your own mother didn\'t recognize you.', 'The reception was polite at best.'])
  say(g, 'Photo Shoot', `You posed for a ${offer.kind} shoot in ${offer.magazine} and earned ${money(offer.pay)}. ${reception}${extra}`, '\u{1F4F8}', good ? 'good' : 'neutral')
})

const photoAction: MenuAction = {
  type: 'action',
  id: 'fame.photo',
  label: 'Photo Shoot',
  emoji: '\u{1F4F8}',
  subtitle: 'Pose for a magazine',
  disabledReason: needFame(FAMOUS),
  run: (g) => {
    if (!useYearAction(g, 'fame.photo', 1)) return tooBusy(g, 'posed for a magazine')
    const c = g.character
    const options = SHOOTS.filter((s) => c.age >= s.minAge && (s.kind !== 'cover' || fameOf(g) >= 50))
    const shoot = pick(g, options)
    const magazine = pick(g, MAGAZINES)
    const pay = Math.round((2_000 + fameOf(g) ** 2 * 45 * shoot.mult * (0.6 + c.stats.looks / 100)) / 100) * 100
    scriptChoice(
      g,
      photoScript,
      'Photo Shoot',
      `${magazine} magazine wants you for a ${shoot.kind} photo shoot. They're offering ${money(pay)}.`,
      [
        { id: 'accept', label: 'Accept', emoji: '\u{2705}' },
        { id: 'decline', label: 'Decline', emoji: '\u{274C}' },
      ],
      { emoji: '\u{1F4F8}', data: { magazine, kind: shoot.kind, pay } },
    )
  },
}

// ---------------------------------------------------------------------------
// Talk show

const TALK_SHOWS = [
  'Late Night with Chip Danvers',
  'The Morning Mug',
  'Tonight Live with Rosa Ortiz',
  'The Couch with Kendra',
  'Wake Up, World!',
  'Midnight Snack with Benny Fox',
  'The Hot Seat',
  'Sunday Brunch Talk',
]

const TALK_TOPICS = [
  { id: 'story', label: 'Tell a hilarious story', emoji: '\u{1F602}' },
  { id: 'plug', label: 'Plug your latest project', emoji: '\u{1F4E3}' },
  { id: 'gossip', label: 'Spill celebrity gossip', emoji: '\u{1F440}' },
  { id: 'stunt', label: 'Attempt a live stunt', emoji: '\u{1F938}' },
  { id: 'emotional', label: 'Open up about your childhood', emoji: '\u{1F622}' },
]

const talkTopicScript = defineScript('special.fame.talkTopic', (g, choice, data) => {
  const show = String((data as { show?: string } | undefined)?.show ?? 'the show')
  const c = g.character
  const base: Record<string, number> = {
    story: c.stats.smarts * 0.4 + c.hidden.craziness * 0.2,
    plug: 30 + fameOf(g) * 0.3,
    gossip: 20 + c.hidden.craziness * 0.4,
    stunt: c.hidden.athleticism * 0.5,
    emotional: 25 + c.stats.looks * 0.2 + c.hidden.karma * 0.2,
  }
  const score = (base[choice] ?? 30) + randInt(g, -15, 35)
  count(g, 'fameActions')
  let text: string
  let tone: 'good' | 'bad' | 'neutral'
  if (score >= 55) {
    addFame(g, randInt(g, 3, 5))
    addStat(g, 'happiness', 8)
    tone = 'good'
    text = pick(g, [
      `You made a great impression on the viewers of ${show}. Clips of your interview are everywhere.`,
      `The audience on ${show} gave you a standing ovation. The host asked you to come back next season.`,
      `You were the funniest guest ${show} has had in years.`,
    ])
    if (choice === 'gossip') addHidden(g, 'karma', -3)
  } else if (score >= 30) {
    addFame(g, 1)
    tone = 'neutral'
    text = pick(g, [
      `You did an okay job on ${show}. Nobody will remember it, but nobody hated it either.`,
      `Your appearance on ${show} was perfectly fine. The host checked their watch only twice.`,
    ])
  } else {
    addFame(g, -2)
    addStat(g, 'happiness', -8)
    tone = 'bad'
    text =
      choice === 'stunt'
        ? `Your live stunt on ${show} went horribly wrong. You fell into the house band's drum kit on national TV.`
        : pick(g, [
            `You embarrassed yourself on ${show}. You froze up and answered a question nobody asked.`,
            `You called the host by the wrong name three times on ${show}. It's trending.`,
            `You laughed at your own joke for an uncomfortably long time on ${show}.`,
          ])
    if (choice === 'stunt') addStat(g, 'health', -5)
  }
  log(g, `I went on ${show}.`, tone)
  say(g, 'Talk Show', text, '\u{1F399}\u{FE0F}', tone)
})

const talkShowScript = defineScript('special.fame.talkShow', (g, choice, data) => {
  const show = String((data as { show?: string } | undefined)?.show ?? 'the show')
  if (choice !== 'accept') return say(g, 'Talk Show', `You declined the invitation to ${show}. The producers booked a ventriloquist instead.`, '\u{1F399}\u{FE0F}')
  scriptChoice(g, talkTopicScript, show, `The lights are on and the host turns to you. What will you do?`, TALK_TOPICS, { emoji: '\u{1F399}\u{FE0F}', data: { show } })
})

const talkShowAction: MenuAction = {
  type: 'action',
  id: 'fame.talkShow',
  label: 'Talk Show',
  emoji: '\u{1F399}\u{FE0F}',
  subtitle: 'Go on a talk show',
  disabledReason: needFame(FAMOUS),
  run: (g) => {
    if (!useYearAction(g, 'fame.talkShow', 1)) return tooBusy(g, 'been on a talk show')
    const show = pick(g, TALK_SHOWS)
    scriptChoice(
      g,
      talkShowScript,
      'Talk Show',
      `The producers of "${show}" invited you on as a guest.`,
      [
        { id: 'accept', label: 'Go on the show', emoji: '\u{2705}' },
        { id: 'decline', label: 'Decline', emoji: '\u{274C}' },
      ],
      { emoji: '\u{1F399}\u{FE0F}', data: { show } },
    )
  },
}

// ---------------------------------------------------------------------------
// Autographs

const autographAction: MenuAction = {
  type: 'action',
  id: 'fame.autographs',
  label: 'Autographs',
  emoji: '\u{270D}\u{FE0F}',
  subtitle: 'Sign autographs for fans',
  disabledReason: needFame(FAMOUS),
  run: (g) => {
    if (!useYearAction(g, 'fame.autographs', 2)) return tooBusy(g, 'signed enough autographs')
    const f = fameOf(g)
    const fans = Math.max(3, vary(g, f * f * 0.4 + 10, 0.5))
    count(g, 'fameActions')
    addStat(g, 'happiness', randInt(g, 2, 6))
    if (chance(g, 0.5)) addFame(g, 1)
    const weird = chance(g, 0.15)
      ? ' ' + pick(g, ['One fan asked you to sign their forehead.', 'A man asked you to sign his cat.', 'Someone handed you a photo of a completely different celebrity.', 'A fan fainted when you said hello.'])
      : ''
    log(g, `I signed autographs for ${fans} fans.`, 'good')
    say(g, 'Autographs', `You signed autographs for ${fans} adoring fans.${weird}`, '\u{270D}\u{FE0F}', 'good')
  },
}

// ---------------------------------------------------------------------------
// Merchandise

const MERCH: { id: string; label: string; emoji: string; cost: number }[] = [
  { id: 'tshirts', label: 'T-Shirts', emoji: '\u{1F455}', cost: 5_000 },
  { id: 'hoodies', label: 'Hoodies', emoji: '\u{1F9E5}', cost: 10_000 },
  { id: 'bobbleheads', label: 'Bobbleheads', emoji: '\u{1F5FF}', cost: 8_000 },
  { id: 'plush', label: 'Plush Toys', emoji: '\u{1F9F8}', cost: 12_000 },
  { id: 'perfume', label: 'Signature Fragrance', emoji: '\u{1F338}', cost: 25_000 },
  { id: 'drink', label: 'Energy Drink', emoji: '\u{26A1}', cost: 40_000 },
]

const merchScript = defineScript('special.fame.merch', (g, choice) => {
  if (choice === 'cancel') return
  const item = MERCH.find((m) => m.id === choice)
  if (!item) return
  if (!spend(g, item.cost)) {
    g.yearActions['fame.merch'] = 0
    return tell(g, 'Merchandise', `You can't afford the ${money(item.cost)} it costs to manufacture your ${item.label.toLowerCase()}.`, '\u{1F4B8}')
  }
  const f = fameOf(g)
  const mult = (f / 50) ** 2 * (0.3 + rand(g) * 2.2)
  const revenue = Math.round(item.cost * mult)
  earnIncome(g, revenue)
  fameProfile(g).merchLines += 1
  count(g, 'fameActions')
  const profit = revenue - item.cost
  let text: string
  if (profit > item.cost) {
    addStat(g, 'happiness', 8)
    addFame(g, 1)
    text = pick(g, [
      `Your ${item.label.toLowerCase()} sold out in hours!`,
      `Fans camped outside stores to get their hands on your ${item.label.toLowerCase()}.`,
      `Resellers are flipping your ${item.label.toLowerCase()} for triple the price.`,
    ])
  } else if (profit >= 0) {
    addStat(g, 'happiness', 3)
    text = `Your ${item.label.toLowerCase()} sold steadily.`
  } else {
    addStat(g, 'happiness', -6)
    text = pick(g, [
      `You now own a warehouse full of unsold ${item.label.toLowerCase()}.`,
      `Your ${item.label.toLowerCase()} ended up in the bargain bin within a week.`,
    ])
  }
  log(g, `I launched a line of ${item.label.toLowerCase()}.`, profit >= 0 ? 'good' : 'bad')
  say(g, 'Merchandise', `${text} You spent ${money(item.cost)} and made ${money(revenue)} in sales (${profit >= 0 ? 'profit' : 'loss'}: ${money(Math.abs(profit))}).`, item.emoji, profit >= 0 ? 'good' : 'bad')
})

const merchAction: MenuAction = {
  type: 'action',
  id: 'fame.merch',
  label: 'Merchandise',
  emoji: '\u{1F6CD}\u{FE0F}',
  subtitle: 'Launch a merchandise line',
  disabledReason: needFame(30),
  run: (g) => {
    if (!useYearAction(g, 'fame.merch', 1)) return tooBusy(g, 'launched merchandise')
    scriptChoice(
      g,
      merchScript,
      'Merchandise',
      'What kind of merchandise do you want to sell with your face on it?',
      [...MERCH.map((m) => ({ id: m.id, label: `${m.label} (${money(m.cost)})`, emoji: m.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
      { emoji: '\u{1F6CD}\u{FE0F}' },
    )
  },
}

// ---------------------------------------------------------------------------
// Podcast

const startPodcastAction: MenuAction = {
  type: 'action',
  id: 'fame.podcast.start',
  label: 'Podcast',
  emoji: '\u{1F3A7}',
  subtitle: 'Start a podcast',
  visible: (g) => !peek<FameProfile>(g, 'fame')?.podcast,
  disabledReason: needFame(FAMOUS),
  input: { kind: 'text', label: 'Name your podcast', placeholder: 'e.g. Unplugged', defaultValue: (g) => `${g.character.firstName} Unplugged` },
  run: (g, input) => {
    const p = fameProfile(g)
    if (p.podcast) return
    const name = cleanName(input, `${g.character.firstName} Unplugged`)
    const listeners = Math.round(500 + fameOf(g) ** 2 * vary(g, 18, 0.4))
    p.podcast = { name, listeners, episodes: 0, startedAge: g.character.age }
    count(g, 'fameActions')
    addFame(g, 1)
    log(g, `I launched a podcast called "${name}".`, 'good')
    say(g, 'Podcast', `You launched "${name}". ${listeners.toLocaleString('en-US')} people tuned in to your first episode, which you recorded in a closet full of coats for the acoustics.`, '\u{1F3A7}', 'good')
  },
}

const EPISODE_TOPICS = ['your wildest celebrity encounter', 'conspiracy theories', 'your breakfast routine', 'a long rant about parking', 'life advice nobody asked for', 'an interview with your childhood hero', 'true crime']

const recordEpisodeAction: MenuAction = {
  type: 'action',
  id: 'fame.podcast.record',
  label: 'Record an Episode',
  emoji: '\u{1F399}\u{FE0F}',
  subtitle: (g) => {
    const p = peek<FameProfile>(g, 'fame')?.podcast
    return p ? `"${p.name}" · ${p.listeners.toLocaleString('en-US')} listeners` : ''
  },
  visible: (g) => !!peek<FameProfile>(g, 'fame')?.podcast,
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const p = fameProfile(g).podcast
    if (!p) return
    if (!useYearAction(g, 'fame.podcast', 3)) return tooBusy(g, 'recorded plenty of episodes')
    p.episodes += 1
    const topic = pick(g, EPISODE_TOPICS)
    const roll = rand(g)
    let text: string
    if (roll < 0.15) {
      const lost = Math.round(p.listeners * randInt(g, 5, 20) / 100)
      p.listeners = Math.max(50, p.listeners - lost)
      addFame(g, -1)
      addHidden(g, 'notoriety', 2)
      text = `Your episode about ${topic} sparked a controversy. ${lost.toLocaleString('en-US')} listeners unsubscribed in protest.`
    } else {
      const gained = Math.round(p.listeners * (0.03 + rand(g) * 0.15) + fameOf(g) * 20)
      p.listeners += gained
      if (chance(g, 0.4)) addFame(g, 1)
      text = `You recorded an episode about ${topic}. It picked up ${gained.toLocaleString('en-US')} new listeners.`
    }
    count(g, 'fameActions')
    log(g, `I recorded a podcast episode about ${topic}.`)
    say(g, p.name, text, '\u{1F3A7}', roll < 0.15 ? 'bad' : 'good')
  },
}

const endPodcastAction: MenuAction = {
  type: 'action',
  id: 'fame.podcast.end',
  label: 'End Podcast',
  emoji: '\u{1F6D1}',
  visible: (g) => !!peek<FameProfile>(g, 'fame')?.podcast,
  confirm: (g) => `Are you sure you want to end "${peek<FameProfile>(g, 'fame')?.podcast?.name ?? 'your podcast'}"?`,
  run: (g) => {
    const p = fameProfile(g)
    if (!p.podcast) return
    const name = p.podcast.name
    p.podcast = null
    log(g, `I ended my podcast "${name}".`)
    say(g, 'Podcast', `You recorded a tearful final episode of "${name}" and hung up your headphones for good.`, '\u{1F3A7}')
  },
}

// ---------------------------------------------------------------------------
// Publicity stunt

const STUNTS = [
  { id: 'feud', label: 'Start a fake feud with a celebrity', emoji: '\u{1F94A}' },
  { id: 'haircut', label: 'Get an outrageous haircut', emoji: '\u{1F487}' },
  { id: 'redcarpet', label: 'Crash a red carpet event', emoji: '\u{1F3AC}' },
  { id: 'vanish', label: 'Fake your own disappearance', emoji: '\u{1F575}\u{FE0F}' },
  { id: 'charity', label: 'Host a surprise charity giveaway', emoji: '\u{1F381}' },
  { id: 'llama', label: 'Ride a llama down Main Street', emoji: '\u{1F999}' },
  { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
]

const stuntScript = defineScript('special.fame.stunt', (g, choice) => {
  if (choice === 'cancel') return
  const c = g.character
  const celeb = pick(g, CELEBS)
  const win = chance(g, 0.35 + c.hidden.craziness / 250 + fameOf(g) / 400)
  count(g, 'fameActions')
  let text: string
  switch (choice) {
    case 'feud':
      text = win
        ? `You picked a fake fight with ${celeb} online. The internet took sides and both of you trended for a week.`
        : `You tried to start a feud with ${celeb}, who simply replied "who?" Ouch.`
      break
    case 'haircut':
      text = win ? 'Your outrageous new haircut started a trend. Salons are calling it "the You".' : 'Your new haircut was roasted mercilessly. A tabloid compared it to a startled hedgehog.'
      if (!win) addStat(g, 'looks', -3)
      break
    case 'redcarpet':
      text = win ? 'You crashed a red carpet premiere and photographers loved it.' : 'Security tackled you before you reached the red carpet. The footage is humiliating.'
      if (!win) addStat(g, 'health', -3)
      break
    case 'vanish': {
      const fine = Math.min(Math.max(0, c.money), 25_000)
      if (fine > 0) spend(g, fine)
      addHidden(g, 'notoriety', 5)
      text = win
        ? `You "vanished" for two weeks and reappeared to a media frenzy.${fine > 0 ? ` The police fined you ${money(fine)} for wasting their time.` : ''}`
        : `Nobody noticed you were missing.${fine > 0 ? ` The police still fined you ${money(fine)} once they found out.` : ''} That's somehow worse.`
      break
    }
    case 'charity': {
      const cost = Math.min(Math.max(0, c.money), 10_000)
      if (cost > 0) spend(g, cost)
      addHidden(g, 'karma', 5)
      text = win ? `You gave away ${money(cost)} in surprise gifts. Fans called you an angel.` : `You gave away ${money(cost)}, but critics called it a shameless publicity grab.`
      break
    }
    default:
      text = win ? `You rode a llama down ${g.character.countryId === 'us' ? 'Main Street' : localStreetName(g)}. It became the most-shared video of the week.` : 'The llama spat on you, then a news crew, then the mayor.'
  }
  addFame(g, win ? randInt(g, 3, 6) : -randInt(g, 1, 3))
  addStat(g, 'happiness', win ? 6 : -5)
  log(g, win ? 'My publicity stunt paid off.' : 'My publicity stunt backfired.', win ? 'good' : 'bad')
  say(g, 'Publicity Stunt', text, '\u{1F4E2}', win ? 'good' : 'bad')
})

const stuntAction: MenuAction = {
  type: 'action',
  id: 'fame.stunt',
  label: 'Publicity Stunt',
  emoji: '\u{1F4E2}',
  subtitle: 'Do something outrageous for attention',
  disabledReason: needFame(FAMOUS),
  run: (g) => {
    if (!useYearAction(g, 'fame.stunt', 1)) return tooBusy(g, 'pulled a publicity stunt')
    scriptChoice(g, stuntScript, 'Publicity Stunt', 'How will you get the world talking about you?', STUNTS.map((s) => (s.id === 'llama' && g.character.countryId !== 'us' ? { ...s, label: 'Ride a llama through the city center' } : s)), { emoji: '\u{1F4E2}' })
  },
}

export const fameMenu: MenuGroup = {
  type: 'menu',
  id: 'fame',
  label: 'Fame',
  emoji: '\u{1F31F}',
  subtitle: 'Manage your fame',
  visible: fameMenuVisible,
  header: (g) => `Fame: ${fameOf(g)}%${fameOf(g) < FAMOUS ? ' — you are not famous enough for most offers yet.' : ''}`,
  children: (): MenuNode[] => [
    autographAction,
    bookAction,
    commercialAction,
    merchAction,
    photoAction,
    startPodcastAction,
    recordEpisodeAction,
    endPodcastAction,
    stuntAction,
    talkShowAction,
  ],
}

// ---------------------------------------------------------------------------
// Celebrity scenarios (yearly)

const paparazziScript = defineScript('special.fame.paparazzi', (g, choice) => {
  let text: string
  let tone: 'good' | 'bad' | 'neutral' = 'neutral'
  if (choice === 'pose') {
    const good = chance(g, 0.6)
    addFame(g, good ? 2 : 1)
    text = good ? 'You struck a pose. The photos made the front page and you looked fantastic.' : 'You posed, but the tabloids ran the one photo where you were mid-sneeze.'
    tone = good ? 'good' : 'neutral'
  } else if (choice === 'hide') {
    text = pick(g, ['You hid your face behind your bag. The headline read "WHAT IS THE STAR HIDING?"', 'You covered your face and walked into a lamppost.'])
    if (chance(g, 0.4)) addFame(g, -1)
  } else if (choice === 'smash') {
    const fine = Math.min(Math.max(0, g.character.money), randInt(g, 5_000, 40_000))
    if (fine > 0) spend(g, fine)
    addHidden(g, 'notoriety', 4)
    addFame(g, 2)
    text = `You smashed a photographer's camera. ${fine > 0 ? `You paid ${money(fine)} to settle the lawsuit. ` : ''}The video went viral.`
    tone = 'bad'
  } else {
    text = 'You ignored the paparazzi and kept walking. Boring photos make boring headlines.'
  }
  log(g, 'I had a run-in with the paparazzi.', tone)
  say(g, 'Paparazzi', text, '\u{1F4F7}', tone)
})

const stalkerScript = defineScript('special.fame.stalker', (g, choice) => {
  let text: string
  let tone: 'good' | 'bad' | 'neutral' = 'neutral'
  if (choice === 'police') {
    if (chance(g, 0.8)) {
      text = 'You called the police. Your stalker was arrested and slapped with a restraining order.'
      tone = 'good'
    } else {
      text = 'You called the police, but they said there wasn\'t enough evidence to do anything.'
      addStat(g, 'happiness', -5)
    }
  } else if (choice === 'plead') {
    if (chance(g, 0.5)) {
      text = 'You calmly asked your stalker to leave you alone. Surprisingly, they apologized and left.'
      tone = 'good'
    } else {
      text = 'You pleaded with your stalker. They took it as a sign you were in love.'
      addStat(g, 'happiness', -8)
      tone = 'bad'
    }
  } else if (chance(g, 0.3)) {
    addStat(g, 'health', -randInt(g, 5, 15))
    addStat(g, 'happiness', -10)
    text = 'You ignored your stalker, who eventually confronted and attacked you outside your home.'
    tone = 'bad'
  } else {
    text = 'You ignored your stalker. Eventually they moved on to someone more famous.'
  }
  log(g, 'I dealt with a stalker.', tone)
  say(g, 'Stalker', text, '\u{1F441}\u{FE0F}', tone)
})

const insultScript = defineScript('special.fame.insult', (g, choice, data) => {
  const celeb = String((data as { celeb?: string } | undefined)?.celeb ?? 'A celebrity')
  let text: string
  let tone: 'good' | 'bad' | 'neutral' = 'neutral'
  if (choice === 'back') {
    const win = chance(g, 0.5)
    addFame(g, win ? 3 : -2)
    text = win ? `You fired back at ${celeb} with a perfect comeback. The internet declared you the winner.` : `You insulted ${celeb} back, but your comeback fell flat. Even your fans cringed.`
    tone = win ? 'good' : 'bad'
  } else if (choice === 'boxing') {
    const win = chance(g, 0.35 + g.character.hidden.athleticism / 200)
    addFame(g, 4)
    addStat(g, 'health', -randInt(g, 3, 12))
    text = win ? `You beat ${celeb} in a charity boxing match. Respect earned.` : `${celeb} knocked you out in the first round of a charity boxing match. At least it was for a good cause.`
    tone = win ? 'good' : 'bad'
    if (win) addStat(g, 'happiness', 10)
  } else {
    text = `You took the high road and ignored ${celeb}. Classy.`
    addHidden(g, 'karma', 2)
  }
  log(g, `${celeb} insulted me in public.`, tone)
  say(g, 'Celebrity Feud', text, '\u{1F92C}', tone)
})

const fanScript = defineScript('special.fame.fan', (g, choice) => {
  let text: string
  if (choice === 'selfie') {
    addStat(g, 'happiness', 4)
    text = 'You took a selfie with the fan. They posted it and called it the best day of their life.'
  } else if (choice === 'sign') {
    addStat(g, 'happiness', 3)
    text = 'You signed the fan\'s arm. They swore they would get it tattooed.'
  } else {
    addFame(g, -1)
    text = 'You ran away. The fan chased you through the frozen food aisle.'
  }
  say(g, 'Fan Encounter', text, '\u{1F929}')
})

/** Which celebrity scene this year: the same kind (paparazzi again?) waits at least 3 years. */
function scenarioRoll(g: GameState): number {
  const bands: [string, number, number][] = [['paparazzi', 0, 0.35], ['stalker', 0.35, 0.55], ['feud', 0.55, 0.8], ['fan', 0.8, 1]]
  const age = g.character.age
  const fresh = bands.filter(([k]) => {
    const last = g.flags[`fame.scene.${k}`]
    return !(typeof last === 'number' && last <= age && age - last < 3)
  })
  const pool = fresh.length ? fresh : bands
  const total = pool.reduce((sum, b) => sum + (b[2] - b[1]), 0)
  let r = rand(g) * total
  for (const [k, lo, hi] of pool) {
    if (r < hi - lo) {
      g.flags[`fame.scene.${k}`] = age
      return lo + r
    }
    r -= hi - lo
  }
  const [k, lo] = pool[pool.length - 1]
  g.flags[`fame.scene.${k}`] = age
  return lo
}

function celebrityScenario(g: GameState): void {
  const roll = scenarioRoll(g)
  if (roll < 0.35) {
    scriptChoice(
      g,
      paparazziScript,
      'Paparazzi',
      pick(g, ['Paparazzi ambushed you outside a restaurant.', 'A swarm of photographers is waiting outside your gym.', 'Paparazzi caught you buying a suspicious amount of toilet paper.']),
      [
        { id: 'pose', label: 'Pose for them', emoji: '\u{1F4F8}' },
        { id: 'ignore', label: 'Ignore them', emoji: '\u{1F610}' },
        { id: 'hide', label: 'Hide your face', emoji: '\u{1F648}' },
        { id: 'smash', label: 'Smash a camera', emoji: '\u{1F4A5}' },
      ],
      { emoji: '\u{1F4F7}' },
    )
  } else if (roll < 0.55) {
    scriptChoice(
      g,
      stalkerScript,
      'Stalker',
      'A crazed fan has been following you everywhere, and they left a lock of hair in your mailbox.',
      [
        { id: 'plead', label: 'Plead with them', emoji: '\u{1F64F}' },
        { id: 'ignore', label: 'Ignore them', emoji: '\u{1F610}' },
        { id: 'police', label: 'Call the police', emoji: '\u{1F46E}' },
      ],
      { emoji: '\u{1F441}\u{FE0F}' },
    )
  } else if (roll < 0.8) {
    const celeb = pick(g, CELEBS)
    scriptChoice(
      g,
      insultScript,
      'Celebrity Feud',
      `${celeb} ${pick(g, ['mocked your outfit on live TV', 'called you "a total nobody" in an interview', 'made fun of your work on social media'])}.`,
      [
        { id: 'ignore', label: 'Ignore them', emoji: '\u{1F610}' },
        { id: 'back', label: 'Insult them back', emoji: '\u{1F92C}' },
        { id: 'boxing', label: 'Challenge them to a charity boxing match', emoji: '\u{1F94A}' },
      ],
      { emoji: '\u{1F92C}', data: { celeb } },
    )
  } else {
    scriptChoice(
      g,
      fanScript,
      'Fan Encounter',
      'A fan recognized you at the grocery store and burst into tears.',
      [
        { id: 'selfie', label: 'Take a selfie', emoji: '\u{1F933}' },
        { id: 'sign', label: 'Sign their arm', emoji: '\u{270D}\u{FE0F}' },
        { id: 'run', label: 'Run away', emoji: '\u{1F3C3}' },
      ],
      { emoji: '\u{1F929}' },
    )
  }
}

/** Yearly fame upkeep: decay, royalties, podcast income and celebrity scenarios. */
export function yearlyFame(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const p = peek<FameProfile>(g, 'fame')
  if (p) {
    for (const b of p.books) {
      if (b.royalty >= 50) {
        earnIncome(g, b.royalty)
        b.royalty = Math.round(b.royalty / 2)
      } else b.royalty = 0
    }
    if (p.podcast) {
      const pod = p.podcast
      const drift = fameOf(g) >= FAMOUS ? 0.02 + rand(g) * 0.08 : -(0.05 + rand(g) * 0.1)
      pod.listeners = Math.max(50, Math.round(pod.listeners * (1 + drift)))
      const income = Math.round(pod.listeners * (0.4 + rand(g) * 0.5))
      if (income > 0 && !c.prison) {
        earnIncome(g, income)
        log(g, `My podcast "${pod.name}" earned ${money(income)} from ads.`)
      }
    }
  }
  // Fame fades when you stop feeding it.
  const active = ownFlag(g, 'fameActiveAge')
  const lastActive = typeof active === 'number' ? active : -99
  if (c.hidden.fame > 0 && !hasFameCareer(g) && lastActive < c.age - 1) {
    const decay = c.hidden.fame > 60 ? randInt(g, 2, 5) : randInt(g, 1, 3)
    addHidden(g, 'fame', -decay)
  }
  if (!c.prison && c.hidden.fame >= 35 && c.age >= 10 && chance(g, 0.3)) celebrityScenario(g)
}
