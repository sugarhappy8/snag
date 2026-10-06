// Pure data for the legit side of the home computer: project kinds and venture types.
// Kept free of game-logic imports so cv.ts and careers.ts can read it without pulling in the
// whole computer module graph.
import { money, plural } from './dev-state'
import type { DevProject, VentureData, VentureType } from './dev-state'
import type { EraGate } from './era'

export interface ProjectKind {
  id: string
  label: string
  /** Mid-sentence name: "Scratch game", "website", "mobile app". */
  noun: string
  emoji: string
  minAge: number
  maxAge?: number
  /** Coding skill needed to even start. */
  minSkill: number
  /** Language use it needs ('web', 'apps'...). */
  use: string
  /** Subtracted from quality: harder things are harder. */
  difficulty: number
  /** How it makes money: none, ads, sales, donations or premium upgrades. */
  income: 'none' | 'ads' | 'sales' | 'donations' | 'premium'
  /** Users at quality 100 (before luck). */
  users: [number, number]
  /** Yearly US dollars per user at launch. */
  arpu: number
  /** What a user is called. */
  unit: string
  names: string[]
  flops: string[]
  great: string
  /** CV title for a project with this name. */
  cvTitle: (name: string) => string
  /** A hit can be spun into a venture of this type. */
  spin?: 'app' | 'game'
  /** When people build these (no phone apps before smartphones, no BBS after the web won). */
  era?: EraGate
}

export const PROJECT_KINDS: ProjectKind[] = [
  {
    id: 'scratch',
    noun: 'Scratch game',
    label: 'Scratch Game',
    emoji: '\u{1F431}',
    minAge: 8,
    maxAge: 14,
    minSkill: 0,
    use: 'kids',
    difficulty: -10,
    income: 'none',
    users: [50, 3_000],
    arpu: 0,
    unit: 'play',
    names: ['Cat vs. Homework', 'Dodge the Broccoli', 'Super Hamster Dash', 'Pizza Rain', 'Escape From Bedtime', 'Dinosaur Dentist'],
    flops: ['The cat sprite walked off the screen and never came back.', 'Your game had one level, and the level was a bug.'],
    great: 'It got featured on the front page and a kid in another country made a sequel.',
    cvTitle: (n) => `Made "${n}", a Scratch game`,
    era: { tech: 'internet', from: 2007 },
  },
  {
    id: 'website',
    noun: 'website',
    label: 'Website',
    emoji: '\u{1F310}',
    minAge: 9,
    minSkill: 5,
    use: 'web',
    difficulty: 0,
    income: 'ads',
    users: [300, 40_000],
    arpu: 0.02,
    unit: 'visitor',
    names: ['a fan site for {sport}', 'a {food} review blog', 'a guide to {landmark}', 'a website ranking every bench in {city}', 'a portfolio site', 'a site of extremely niche facts about pigeons'],
    flops: ['It looked fine on your screen and like a ransom note on everyone else\'s.', 'You spent the whole time picking a font. The site is one heading in that font.'],
    great: 'It ranked first in search results for something oddly specific.',
    cvTitle: (n) => `Built ${n}`,
    era: { tech: 'internet', from: 1994 },
  },
  {
    id: 'mod',
    noun: 'game mod',
    label: 'Game Mod',
    emoji: '\u{1F9F1}',
    minAge: 10,
    minSkill: 12,
    use: 'mods',
    difficulty: 3,
    income: 'donations',
    users: [2_000, 400_000],
    arpu: 0.004,
    unit: 'download',
    names: ['Better Cows', 'Hats for Everyone', '100x Chickens', 'Realistic Weather (It Rains Forever)', 'No More Creepers', 'Pocket Dimensions'],
    flops: ['Your mod turned every tree into a chicken. Not on purpose.', 'It crashed the game so hard it deleted a friend\'s save. You are no longer friends.'],
    great: 'The Dirtblock forums voted it mod of the month.',
    cvTitle: (n) => `Created "${n}", a Dirtblock mod`,
    era: { tech: 'internet', from: 2010 },
  },
  {
    id: 'bot',
    noun: 'chat bot',
    label: 'Chat Bot',
    emoji: '\u{1F916}',
    minAge: 11,
    minSkill: 15,
    use: 'bots',
    difficulty: 4,
    income: 'donations',
    users: [50, 30_000],
    arpu: 0.01,
    unit: 'server',
    names: ['DiceGoblin', 'PollParrot', 'HomeworkNag', 'MemeButler', 'QuoteMachine', 'TriviaTroll'],
    flops: ['Your bot replied to every message with "undefined." Your friends muted it.', 'It got stuck in a loop and posted the same joke 40,000 times.'],
    great: 'Half the group chats in your school run it now.',
    cvTitle: (n) => `Built ${n}, a chat bot`,
    era: { tech: 'smartphone', from: 2010 },
  },
  {
    id: 'extension',
    noun: 'browser extension',
    label: 'Browser Extension',
    emoji: '\u{1F9E9}',
    minAge: 12,
    minSkill: 22,
    use: 'browser',
    difficulty: 6,
    income: 'premium',
    users: [300, 100_000],
    arpu: 0.04,
    unit: 'user',
    names: ['TabTamer', 'Dark Mode Everything', 'Recipe Skipper', 'Cookie Banner Begone', 'Focus Goblin', 'Typo Police'],
    flops: ['The extension store rejected it for "doing nothing, aggressively."', 'It worked perfectly until a browser update the next morning.'],
    great: 'A tech newsletter called it "the only extension you need."',
    cvTitle: (n) => `Built ${n}, a browser extension`,
    era: { tech: 'internet', from: 2005 },
  },
  {
    id: 'app',
    noun: 'mobile app',
    label: 'Mobile App',
    emoji: '\u{1F4F1}',
    minAge: 12,
    minSkill: 25,
    use: 'apps',
    difficulty: 8,
    income: 'ads',
    users: [200, 150_000],
    arpu: 0.08,
    unit: 'download',
    names: ['StudyBuddy', 'PlantPal', 'Splitzy', '{city} Bus Buddy', '{food} Finder', 'ChoreQuest', 'NapTime'],
    flops: ['Your app crashed every time someone opened it. Including you.', 'The app store reviewer wrote "what is this" and nothing else.'],
    great: 'It hit the top charts in your country for a week!',
    cvTitle: (n) => `Built "${n}", a mobile app`,
    spin: 'app',
    era: { tech: 'smartphone', from: 2008 },
  },
  {
    id: 'game',
    noun: 'indie game',
    label: 'Indie Game',
    emoji: '\u{1F47E}',
    minAge: 12,
    minSkill: 28,
    use: 'games',
    difficulty: 12,
    income: 'sales',
    users: [100, 40_000],
    arpu: 1.5,
    unit: 'player',
    names: ['Pigeon Royale', 'Cozy {food} Farm', 'Goblin Accountant', 'Shopping Cart Grand Prix', 'Snail Odyssey', 'Dungeon Landlord'],
    flops: ['Your game had a bug where the player falls through the floor. Forever. Players called it "an art piece."', 'You spent eight months on the menu screen. There is no game behind it.'],
    great: 'It hit "Overwhelmingly Positive" on PixelPantry!',
    cvTitle: (n) => `Released "${n}", an indie game`,
    spin: 'game',
    era: { tech: 'homeComputer' },
  },
  // Before the web: what bedroom coders built in the 80s and 90s (appended so old ids stay put).
  {
    id: 'listing',
    noun: 'magazine type-in program',
    label: 'Magazine Type-In',
    emoji: '\u{1F4F0}',
    minAge: 10,
    minSkill: 8,
    use: 'games',
    difficulty: 0,
    income: 'sales',
    users: [200, 25_000],
    arpu: 0.02,
    unit: 'reader',
    names: ['Lunar Lander Deluxe', 'Snake Pit', 'Grandpa Invaders', 'Maze of the Minotaur', 'Checkbook Wizard', 'Frog Crossing {city}'],
    flops: ['The magazine sent it back with a polite note: "Our readers have enough snake games."', 'You mailed it off on a cassette. It arrived as a cassette of static.'],
    great: 'A computer magazine printed it, paid you for it, and readers wrote in to say they typed it in with their dads.',
    cvTitle: (n) => `Published "${n}" as a magazine type-in program`,
    era: { tech: 'homeComputer', until: 1994 },
  },
  {
    id: 'shareware',
    noun: 'shareware program',
    label: 'Shareware Program',
    emoji: '\u{1F4BE}',
    minAge: 12,
    minSkill: 18,
    use: 'systems',
    difficulty: 4,
    income: 'donations',
    users: [300, 60_000],
    arpu: 0.05,
    unit: 'user',
    names: ['DiskDoctor', 'QuickRecipe', 'FileFerret', 'StarChart Pro', 'TypeTutor', 'BudgetBuddy'],
    flops: ['Nobody registered it. Somebody did send you a postcard that just says "why."', 'It reformatted your own hard drive during testing. Version 2 will be better.'],
    great: 'Copies spread on floppy disks across the country, and registration checks started arriving in the mail.',
    cvTitle: (n) => `Wrote ${n}, a shareware program`,
    era: { tech: 'homeComputer', from: 1985, until: 2003 },
  },
  {
    id: 'bbs',
    noun: 'bulletin board system',
    label: 'Bulletin Board (BBS)',
    emoji: '\u{1F4DE}',
    minAge: 12,
    minSkill: 15,
    use: 'systems',
    difficulty: 2,
    income: 'donations',
    users: [30, 3_000],
    arpu: 0.3,
    unit: 'caller',
    names: ['The Dungeon BBS', 'Midnight Modem', 'The {city} Underground', 'Byte Me BBS', 'Castle Kilobyte', 'The Phone Bill'],
    flops: ['Your mom picked up the phone during every call. Your callers gave up.', 'Twelve people called. Eleven of them were the same person.'],
    great: 'Half the computer nerds in town dial in every night, and your phone line is never free.',
    cvTitle: (n) => `Ran ${n}, a dial-up bulletin board`,
    era: { tech: 'homeComputer', from: 1982, until: 1998 },
  },
]

export function getProjectKind(id: string): ProjectKind | undefined {
  return PROJECT_KINDS.find((k) => k.id === id)
}

export function projectDetail(p: DevProject): string {
  const kind = getProjectKind(p.kind)
  const bits = [plural(p.users, kind?.unit ?? 'user')]
  if (p.earned > 0) bits.push(`${money(p.earned)} earned`)
  return bits.join(' • ')
}

// ---------------------------------------------------------------------------
// Venture types

export interface Tier {
  label: string
  /** US price: per month (SaaS), per year per user (app), average order (store), per copy (game). */
  price: number
  /** Effect on new users. */
  growth: number
  /** SaaS: monthly churn. Store: gross margin. App/game: unused. */
  x: number
}

export interface TypeDef {
  type: VentureType
  /** When this kind of online business exists. */
  era?: EraGate
  label: string
  /** "a SaaS", "an app"... */
  noun: string
  emoji: string
  minAge: number
  /** Coding skill to build it yourself (0 = no code needed). */
  minSkill: number
  /** Language use for its code. */
  use: string
  unit: [string, string]
  tiers: Tier[]
  /** US cost of hiring a freelancer to build the first version (0 = can't). */
  hireUsd: number
  /** US cost to get going (domain, store fees, first inventory). */
  startUsd: number
  /** Yearly US cost of keeping it running once live (hosting, tools, store plans, accounting). */
  fixedUsd: number
  /** Share of the market that is local (the rest depends on reach). */
  localWeight: number
  niche: [number, number]
  /** Build progress per year at skill 50 when you work on it. */
  buildRate: number
  /** Yearly organic signups as a share of the market at quality 100. */
  organic: number
  /** "Ship Features" etc. */
  workLabel: string
}

export const VENTURE_DEFS: Record<VentureType, TypeDef> = {
  saas: {
    type: 'saas',
    era: { tech: 'internet', from: 2000 },
    label: 'SaaS',
    noun: 'a SaaS',
    emoji: '\u{2601}\u{FE0F}',
    minAge: 13,
    minSkill: 35,
    use: 'web',
    unit: ['customer', 'customers'],
    tiers: [
      { label: 'Budget', price: 9, growth: 2.2, x: 0.06 },
      { label: 'Standard', price: 29, growth: 1, x: 0.04 },
      // Eleven times the price sells to a much smaller crowd (who churn less).
      { label: 'Premium', price: 99, growth: 0.2, x: 0.025 },
    ],
    hireUsd: 7_000,
    startUsd: 150,
    fixedUsd: 1_800,
    localWeight: 0.45,
    niche: [2_500, 60_000],
    buildRate: 55,
    organic: 0.007,
    workLabel: 'Ship Features',
  },
  app: {
    type: 'app',
    era: { tech: 'smartphone', from: 2008 },
    label: 'Mobile App',
    noun: 'an app',
    emoji: '\u{1F4F2}',
    minAge: 12,
    minSkill: 20,
    use: 'apps',
    unit: ['user', 'users'],
    tiers: [
      { label: 'Free with ads', price: 1.2, growth: 1.4, x: 0 },
      { label: 'Freemium', price: 3, growth: 1, x: 0 },
      { label: 'Paid upfront', price: 2.99, growth: 0.45, x: 0 },
    ],
    hireUsd: 5_000,
    startUsd: 100,
    fixedUsd: 500,
    localWeight: 0.35,
    niche: [40_000, 2_000_000],
    buildRate: 80,
    organic: 0.018,
    workLabel: 'Ship an Update',
  },
  store: {
    type: 'store',
    era: { tech: ['internet', 'onlineShopping'], from: 1996 },
    label: 'Online Store',
    noun: 'an online store',
    emoji: '\u{1F6CD}\u{FE0F}',
    minAge: 12,
    minSkill: 0,
    use: 'web',
    unit: ['customer', 'customers'],
    tiers: [
      { label: 'Bargain', price: 25, growth: 1.8, x: 0.25 },
      { label: 'Fair', price: 50, growth: 1, x: 0.35 },
      { label: 'Boutique', price: 120, growth: 0.3, x: 0.5 },
    ],
    hireUsd: 0,
    startUsd: 400,
    fixedUsd: 500,
    localWeight: 0.85,
    niche: [2_000, 40_000],
    buildRate: 100,
    organic: 0.04,
    workLabel: 'Restock & Shoot Photos',
  },
  game: {
    type: 'game',
    era: { tech: 'internet', from: 2004 },
    label: 'Indie Game',
    noun: 'an indie game',
    emoji: '\u{1F579}\u{FE0F}',
    minAge: 12,
    minSkill: 25,
    use: 'games',
    unit: ['player', 'players'],
    tiers: [
      { label: 'Bargain bin', price: 4.99, growth: 1.4, x: 0 },
      { label: 'Standard', price: 14.99, growth: 1, x: 0 },
      { label: 'Premium', price: 24.99, growth: 0.6, x: 0 },
    ],
    hireUsd: 9_000,
    startUsd: 100,
    fixedUsd: 150,
    localWeight: 0.15,
    niche: [20_000, 1_500_000],
    buildRate: 38,
    organic: 0,
    workLabel: 'Keep Developing',
  },
}

export const MAX_VENTURES = 3

/** "1.2K customers". */
export function ventureUnits(v: VentureData, n: number): string {
  const d = VENTURE_DEFS[v.type]
  return plural(n, d.unit[0], d.unit[1])
}
