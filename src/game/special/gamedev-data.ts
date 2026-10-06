// Pure data for the Game Industry (special/gamedev*.ts and business/gamestudio*.ts): genres,
// platforms, scopes, engines, the studios you can work for, the job ladder, awards and the
// interview questions. Every studio, store, console, engine and award is invented.
// No game-logic imports here, so the light readers (gamedev-state, the CV) can use it too.

// ---------------------------------------------------------------------------
// Genres

export type GenreId =
  | 'platformer'
  | 'rpg'
  | 'shooter'
  | 'strategy'
  | 'puzzle'
  | 'cozy'
  | 'horror'
  | 'racing'
  | 'sports'
  | 'fighting'
  | 'sim'
  | 'roguelike'
  | 'adventure'
  | 'battleRoyale'
  | 'party'

export interface GenreDef {
  id: GenreId
  label: string
  /** Mid-sentence: "a cozy farming game". */
  noun: string
  emoji: string
  /** How much code, art and design matter (sums to 1). */
  mix: [number, number, number]
  /** Base audience appeal (1 = average). */
  appeal: number
  /** Production cost multiplier (open-world RPGs cost more than puzzle games). */
  cost: number
  /** Title ideas ({food}, {city}, {landmark}, {sport} are filled locally). */
  titles: string[]
}

export const GENRES: GenreDef[] = [
  {
    id: 'platformer',
    label: 'Platformer',
    noun: 'platformer',
    emoji: '\u{1F344}',
    mix: [0.3, 0.3, 0.4],
    appeal: 0.9,
    cost: 0.9,
    titles: ['Hop Kingdom', 'Snail Velocity', 'Gravity Pudding', 'Tiny Knight, Big Jump', 'Moonboot', 'Pogo Panic', 'Super Toast Adventure'],
  },
  {
    id: 'rpg',
    label: 'RPG',
    noun: 'role-playing game',
    emoji: '\u{1F5E1}\u{FE0F}',
    mix: [0.3, 0.3, 0.4],
    appeal: 1.15,
    cost: 1.3,
    titles: ['Chronicles of the Ashen Crown', 'Dragonless', 'The Last Innkeeper', 'Saga of {landmark}', 'Embervale', 'Heroes of the Broken Sigil', 'Quest for the Lost Sock'],
  },
  {
    id: 'shooter',
    label: 'Shooter',
    noun: 'shooter',
    emoji: '\u{1F52B}',
    mix: [0.45, 0.35, 0.2],
    appeal: 1.15,
    cost: 1.3,
    titles: ['Warpath Zero', 'Iron Rain', 'Bulletproof Bureaucracy', 'Hollow Point Protocol', 'Stormline', 'Last Squad Standing', 'Laser Tag Tactical'],
  },
  {
    id: 'strategy',
    label: 'Strategy',
    noun: 'strategy game',
    emoji: '\u{265F}\u{FE0F}',
    mix: [0.35, 0.2, 0.45],
    appeal: 0.8,
    cost: 0.9,
    titles: ['Empire of Crumbs', 'Tea Time Tactics', 'Siegecraft', 'Supply Lines', 'Kingdom Spreadsheet', 'Overlord Logistics', 'Pigeon Wars'],
  },
  {
    id: 'puzzle',
    label: 'Puzzle',
    noun: 'puzzle game',
    emoji: '\u{1F9E9}',
    mix: [0.25, 0.25, 0.5],
    appeal: 0.7,
    cost: 0.6,
    titles: ['Block Therapy', 'Mind the Gap', 'Cubes & Consequences', 'Quiet Gears', 'Lantern Logic', 'Tetrabakery', 'Folded'],
  },
  {
    id: 'cozy',
    label: 'Cozy Game',
    noun: 'cozy game',
    emoji: '\u{1F33B}',
    mix: [0.2, 0.45, 0.35],
    appeal: 1,
    cost: 0.8,
    titles: ['Cozy {food} Farm', 'Moss & Muffins', 'Teacup Village', 'Sleepy Harbor', 'Lighthouse Bakery', 'Garden of Small Things', 'Knit Happens'],
  },
  {
    id: 'horror',
    label: 'Horror',
    noun: 'horror game',
    emoji: '\u{1F47B}',
    mix: [0.3, 0.4, 0.3],
    appeal: 0.85,
    cost: 0.9,
    titles: ['The Hallway Never Ends', 'Do Not Open', 'The Basement Under {city}', 'Night Shift at the Morgue', 'Static', 'Hush Little', 'Room 404'],
  },
  {
    id: 'racing',
    label: 'Racing',
    noun: 'racing game',
    emoji: '\u{1F3CE}\u{FE0F}',
    mix: [0.45, 0.4, 0.15],
    appeal: 0.8,
    cost: 1.1,
    titles: ['Shopping Cart Grand Prix', 'Nitro Goats', 'Apex Hearts', 'Gridlock Legends', 'Rally Round {landmark}', 'Midnight Downshift', 'Kart Chaos'],
  },
  {
    id: 'sports',
    label: 'Sports',
    noun: 'sports game',
    emoji: '\u{26BD}',
    mix: [0.4, 0.35, 0.25],
    appeal: 1,
    cost: 1.1,
    titles: ['Pro {sport} Manager', '{sport} Legends', 'Ultimate {sport}', 'Backyard {sport}', '{sport} Dynasty', 'Sunday League Heroes', 'Benchwarmer Glory'],
  },
  {
    id: 'fighting',
    label: 'Fighting',
    noun: 'fighting game',
    emoji: '\u{1F94A}',
    mix: [0.45, 0.3, 0.25],
    appeal: 0.75,
    cost: 1,
    titles: ['Fist Fiesta', 'Knuckle Kingdom', 'Combo Breakers', 'Iron Grudge', 'Brawl of the Grannies', 'Uppercut Alley', 'Slap Masters'],
  },
  {
    id: 'sim',
    label: 'Simulation',
    noun: 'simulation game',
    emoji: '\u{1F3D7}\u{FE0F}',
    mix: [0.35, 0.2, 0.45],
    appeal: 0.95,
    cost: 0.9,
    titles: ['Goblin Accountant', 'Dungeon Landlord', 'Bus Driver Simulator: {city}', 'Lighthouse Keeper Sim', 'Toaster Repair Simulator', 'Mayor of Nowhere', 'Laundromat Tycoon'],
  },
  {
    id: 'roguelike',
    label: 'Roguelike',
    noun: 'roguelike',
    emoji: '\u{1F3B2}',
    mix: [0.3, 0.25, 0.45],
    appeal: 0.9,
    cost: 0.7,
    titles: ['Coo: A Pigeon Roguelike', 'Dice of Doom', 'Hundred Doors', 'Pocket Labyrinth', 'Spelunk Again', 'Die, Retry, Repeat', 'Soup Dungeon'],
  },
  {
    id: 'adventure',
    label: 'Story Adventure',
    noun: 'story-driven adventure',
    emoji: '\u{1F5FA}\u{FE0F}',
    mix: [0.2, 0.4, 0.4],
    appeal: 0.8,
    cost: 0.9,
    titles: ['The Lighthouse at {landmark}', 'Paper Boats', 'Whispers of the Old Mill', 'A Long Walk Home', 'Postcards from Nowhere', 'The Cartographer', 'Grandma’s Attic'],
  },
  {
    id: 'battleRoyale',
    label: 'Battle Royale',
    noun: 'battle royale',
    emoji: '\u{1FA82}',
    mix: [0.5, 0.3, 0.2],
    appeal: 1.05,
    cost: 1.2,
    titles: ['Last Llama Standing', 'Drop Zone 100', 'Circle of Doom', 'Pigeon Royale', 'Storm Island', 'Final Hundred', 'Couch Royale'],
  },
  {
    id: 'party',
    label: 'Party Game',
    noun: 'party game',
    emoji: '\u{1F389}',
    mix: [0.3, 0.3, 0.4],
    appeal: 0.75,
    cost: 0.7,
    titles: ['Pass the Pickle', 'Couch Chaos', 'Party Goblins', 'Sabotage Supper', 'Who Ate the Cake?', 'Karaoke Catastrophe', 'Friendship Ender'],
  },
]

const GENRE_MAP = new Map<string, GenreDef>(GENRES.map((x) => [x.id, x]))

export function genreDef(id: string): GenreDef {
  return GENRE_MAP.get(id) ?? GENRES[0]
}

export function isGenre(id: unknown): id is GenreId {
  return typeof id === 'string' && GENRE_MAP.has(id)
}

// ---------------------------------------------------------------------------
// Platforms

export type PlatformId = 'pc' | 'console' | 'mobile' | 'handheld' | 'vr' | 'multi'

export interface PlatformDef {
  id: PlatformId
  label: string
  emoji: string
  /** Audience multiplier. */
  audience: number
  /** Price multiplier (mobile games sell for pocket change). */
  priceMult: number
  /** US cost of dev kits, certification and ratings per release. */
  certUsd: number
  /** Lowest scope index (see SCOPES) that can ship here. */
  minScope: number
  note: string
}

export const PLATFORMS: PlatformDef[] = [
  { id: 'pc', label: 'PC (PixelPantry)', emoji: '\u{1F5A5}\u{FE0F}', audience: 1, priceMult: 1, certUsd: 0, minScope: 0, note: 'Cheapest to ship on, crowded storefront' },
  { id: 'mobile', label: 'Phones & Tablets', emoji: '\u{1F4F1}', audience: 1.7, priceMult: 0.22, certUsd: 0, minScope: 0, note: 'Huge audience that pays almost nothing' },
  { id: 'handheld', label: 'Pocket Wish (handheld)', emoji: '\u{1F3AE}', audience: 0.9, priceMult: 1, certUsd: 4_000, minScope: 1, note: 'Indie-friendly handheld from Tanuki Corp' },
  { id: 'console', label: 'Home Consoles (Orbit & KBox)', emoji: '\u{1F579}\u{FE0F}', audience: 1.3, priceMult: 1, certUsd: 25_000, minScope: 2, note: 'Dev kits and certification cost real money' },
  { id: 'vr', label: 'VR Headsets', emoji: '\u{1F97D}', audience: 0.3, priceMult: 1, certUsd: 2_000, minScope: 1, note: 'Tiny audience that loves to be impressed' },
  { id: 'multi', label: 'Every Platform', emoji: '\u{1F310}', audience: 2, priceMult: 1, certUsd: 70_000, minScope: 3, note: 'Maximum reach, maximum porting pain' },
]

const PLATFORM_MAP = new Map<string, PlatformDef>(PLATFORMS.map((x) => [x.id, x]))

export function platformDef(id: string): PlatformDef {
  return PLATFORM_MAP.get(id) ?? PLATFORMS[0]
}

export function isPlatform(id: unknown): id is PlatformId {
  return typeof id === 'string' && PLATFORM_MAP.has(id)
}

/** Platform holders who pay for exclusives (and their consoles). */
export const PLATFORM_HOLDERS = [
  { name: 'Orbis Interactive', console: 'the Orbit 5' },
  { name: 'Kestrel Systems', console: 'the KBox Infinity' },
  { name: 'Tanuki Corp', console: 'the Pocket Wish' },
]

// ---------------------------------------------------------------------------
// Scopes

export type ScopeId = 'jam' | 'small' | 'indie' | 'aa' | 'aaa'

export interface ScopeDef {
  id: ScopeId
  index: number
  label: string
  emoji: string
  /** Development years at the nominal team size. */
  years: number
  /** Nominal team size. */
  team: number
  /** US price of a copy. */
  price: number
  /** Copies a 100-quality game could sell in its first year (before luck and reach). */
  potential: number
  /** Yearly US production costs beyond salaries (outsourcing, licensed music, mocap...). */
  extraUsd: number
  /** US launch marketing at a normal budget. */
  marketingUsd: number
  /** Subtracted from quality for a small team trying something this big. */
  difficulty: number
  /** Heavy-tail luck: median and spread of the audience multiplier. */
  luck: [number, number]
  /** Minimum studio headcount to greenlight it (0 = solo is fine). */
  minTeam: number
}

export const SCOPES: ScopeDef[] = [
  { id: 'jam', index: 0, label: 'Game Jam', emoji: '\u{1F355}', years: 0, team: 1, price: 0, potential: 4_000, extraUsd: 0, marketingUsd: 0, difficulty: -8, luck: [0.4, 1.1], minTeam: 0 },
  { id: 'small', index: 1, label: 'Small Indie', emoji: '\u{1F331}', years: 1, team: 1, price: 9.99, potential: 55_000, extraUsd: 2_500, marketingUsd: 4_000, difficulty: 0, luck: [0.3, 1.15], minTeam: 1 },
  { id: 'indie', index: 2, label: 'Indie', emoji: '\u{1F3A8}', years: 2, team: 5, price: 19.99, potential: 450_000, extraUsd: 40_000, marketingUsd: 90_000, difficulty: 6, luck: [0.35, 1.05], minTeam: 3 },
  { id: 'aa', index: 3, label: 'AA', emoji: '\u{1F3AC}', years: 3, team: 35, price: 39.99, potential: 2_500_000, extraUsd: 1_200_000, marketingUsd: 4_000_000, difficulty: 10, luck: [0.55, 0.8], minTeam: 20 },
  { id: 'aaa', index: 4, label: 'AAA Blockbuster', emoji: '\u{1F4A5}', years: 4, team: 160, price: 69.99, potential: 11_000_000, extraUsd: 9_000_000, marketingUsd: 45_000_000, difficulty: 14, luck: [0.7, 0.6], minTeam: 90 },
]

const SCOPE_MAP = new Map<string, ScopeDef>(SCOPES.map((x) => [x.id, x]))

export function scopeDef(id: string): ScopeDef {
  return SCOPE_MAP.get(id) ?? SCOPES[1]
}

export function isScope(id: unknown): id is ScopeId {
  return typeof id === 'string' && SCOPE_MAP.has(id)
}

// ---------------------------------------------------------------------------
// Engines

export type EngineId = 'cobalt' | 'titan' | 'homebrew' | 'blocks'

export interface EngineDef {
  id: EngineId
  label: string
  emoji: string
  /** Development speed multiplier. */
  speed: number
  /** Flat quality bonus (big scopes get bigBonus instead). */
  bonus: number
  bigBonus: number
  /** Revenue royalty once a game grosses over $1M. */
  royalty: number
  /** Coding skill to use it well (below: slower). */
  minSkill: number
  /** Highest scope index it suits. */
  maxScope: number
  note: string
}

export const ENGINES: EngineDef[] = [
  { id: 'blocks', label: 'Kiddo Blocks', emoji: '\u{1F9F1}', speed: 1.35, bonus: -6, bigBonus: -20, royalty: 0, minSkill: 0, maxScope: 1, note: 'Drag-and-drop blocks. Perfect for kids, limiting for everyone else' },
  { id: 'cobalt', label: 'Cobalt Engine', emoji: '\u{1F537}', speed: 1.15, bonus: 1, bigBonus: 1, royalty: 0.03, minSkill: 15, maxScope: 4, note: 'Friendly and popular; 3% royalty past $1M' },
  { id: 'titan', label: 'Titan Engine', emoji: '\u{1F5FF}', speed: 0.95, bonus: 2, bigBonus: 7, royalty: 0.05, minSkill: 40, maxScope: 4, note: 'Gorgeous graphics, steep learning curve; 5% royalty past $1M' },
  { id: 'homebrew', label: 'Your Own Engine', emoji: '\u{1F527}', speed: 0.75, bonus: 0, bigBonus: 0, royalty: 0, minSkill: 55, maxScope: 4, note: 'No royalties, all the bragging rights, twice the bugs' },
]

const ENGINE_MAP = new Map<string, EngineDef>(ENGINES.map((x) => [x.id, x]))

export function engineDef(id: string): EngineDef {
  return ENGINE_MAP.get(id) ?? ENGINES[1]
}

export function isEngine(id: unknown): id is EngineId {
  return typeof id === 'string' && ENGINE_MAP.has(id)
}

// ---------------------------------------------------------------------------
// The job ladder

export type Track = 'qa' | 'code' | 'art' | 'design'

export const TRACKS: Track[] = ['qa', 'code', 'art', 'design']

export const TRACK_LABEL: Record<Track, string> = { qa: 'QA', code: 'Programming', art: 'Art', design: 'Design' }

export interface LevelDef {
  level: number
  /** Title per track (levels 5-6 are the same for everyone). */
  titles: Partial<Record<Track, string>>
  /** US yearly pay at a mid-size studio. */
  pay: number
  /** Skill needed in your track. */
  skill: number
  /** Shipped games needed to be hired at this level directly. */
  credits: number
  minAge: number
}

export const LEVELS: LevelDef[] = [
  { level: 0, titles: { qa: 'QA Tester' }, pay: 36_000, skill: 0, credits: 0, minAge: 16 },
  { level: 1, titles: { qa: 'QA Lead', code: 'Junior Programmer', art: 'Junior Artist', design: 'Junior Designer' }, pay: 60_000, skill: 40, credits: 0, minAge: 18 },
  { level: 2, titles: { code: 'Programmer', art: 'Artist', design: 'Game Designer' }, pay: 82_000, skill: 55, credits: 1, minAge: 19 },
  { level: 3, titles: { code: 'Senior Programmer', art: 'Senior Artist', design: 'Senior Designer' }, pay: 112_000, skill: 68, credits: 3, minAge: 22 },
  { level: 4, titles: { code: 'Lead Programmer', art: 'Art Director', design: 'Lead Designer' }, pay: 148_000, skill: 78, credits: 5, minAge: 25 },
  { level: 5, titles: { code: 'Creative Director', art: 'Creative Director', design: 'Creative Director' }, pay: 205_000, skill: 80, credits: 7, minAge: 28 },
  { level: 6, titles: { code: 'Studio Head', art: 'Studio Head', design: 'Studio Head' }, pay: 285_000, skill: 80, credits: 9, minAge: 30 },
]

export const MAX_LEVEL = LEVELS.length - 1

export function levelDef(level: number): LevelDef {
  return LEVELS[Math.max(0, Math.min(MAX_LEVEL, Math.round(level)))]
}

/** Job title for a track and level (QA tops out at QA Lead; leadership is the same for everyone). */
export function titleFor(track: Track, level: number): string {
  const l = levelDef(level)
  if (track === 'qa') return l.titles.qa ?? (l.level >= 5 ? (l.titles.design as string) : 'QA Lead')
  return l.titles[track] ?? l.titles.code ?? 'Game Developer'
}

export const QA_PAY = 30_000

// ---------------------------------------------------------------------------
// Studios you can work for

export type Tier = 'indie' | 'mid' | 'aaa'

export const TIER_LABEL: Record<Tier, string> = { indie: 'indie studio', mid: 'mid-size studio', aaa: 'AAA giant' }

/** Pay multiplier, studio craft (base game quality) range, typical scopes. */
export const TIER_INFO: Record<Tier, { pay: number; craft: [number, number]; scopes: ScopeId[] }> = {
  indie: { pay: 0.78, craft: [48, 72], scopes: ['small', 'indie'] },
  mid: { pay: 1, craft: [55, 76], scopes: ['indie', 'aa'] },
  aaa: { pay: 1.22, craft: [64, 84], scopes: ['aa', 'aaa', 'aaa'] },
}

export interface GiantDef {
  name: string
  /** Headquarters country. */
  hq: string
  /** Flagship franchise (flavor and studio game titles). */
  franchise: string
  genres: GenreId[]
  /** One-line reputation. */
  blurb: string
}

/** Global AAA publishers with offices in the big game-making hubs. */
export const GIANTS: GiantDef[] = [
  { name: 'Colossus Interactive', hq: 'us', franchise: 'Warfront', genres: ['shooter', 'battleRoyale'], blurb: 'Ships a Warfront every autumn whether it is finished or not' },
  { name: 'Omnivault Games', hq: 'us', franchise: 'Skyhaven Online', genres: ['rpg', 'battleRoyale', 'shooter'], blurb: 'Has turned "live service" into a lifestyle' },
  { name: 'Gigaton Entertainment', hq: 'us', franchise: 'Street Kings', genres: ['racing', 'adventure', 'shooter'], blurb: 'Open worlds so big the maps need maps' },
  { name: 'Kaiju Byte', hq: 'jp', franchise: 'Monster Ranch', genres: ['rpg', 'cozy', 'fighting'], blurb: 'Forty years of cute monsters and secret boss fights' },
  { name: 'Sakura Circuit', hq: 'jp', franchise: 'Turbo Drift', genres: ['racing', 'fighting', 'party'], blurb: 'Arcade legends with very strict cafeteria rules' },
  { name: 'Red Comet Works', hq: 'pl', franchise: 'The Ashen Road', genres: ['rpg', 'adventure'], blurb: 'Huge story RPGs, huger patch notes' },
  { name: 'Northwind Entertainment', hq: 'se', franchise: 'Frostblock', genres: ['sim', 'puzzle', 'strategy'], blurb: 'Made one block game that paid for a castle' },
  { name: 'Lumière Interactive', hq: 'fr', franchise: 'Shadows of Avignon', genres: ['adventure', 'shooter', 'sports'], blurb: 'Climbable towers in every game since the dawn of time' },
  { name: 'Jade Dragon Interactive', hq: 'cn', franchise: 'Immortal Realm', genres: ['rpg', 'battleRoyale'], blurb: 'Free to play, expensive to win' },
  { name: 'Tiger Pixel', hq: 'kr', franchise: 'Starlight Arena', genres: ['battleRoyale', 'fighting', 'rpg'], blurb: 'Esports royalty with a very loud office' },
  { name: 'Maple Forge Studios', hq: 'ca', franchise: 'Hockey Heroes', genres: ['sports', 'shooter'], blurb: 'Hires half the programmers in the country every spring' },
  { name: 'Foggy Bottom Games', hq: 'gb', franchise: 'Tea Time Tactics', genres: ['strategy', 'racing'], blurb: 'Very British, very good at tanks' },
]

/** Countries where the giants keep big offices (besides their own headquarters). */
export const HUBS = ['us', 'ca', 'gb', 'fr', 'de', 'pl', 'se', 'fi', 'jp', 'kr', 'cn', 'au', 'es', 'nl', 'ua', 'ro', 'in', 'br', 'mx', 'sg', 'ie', 'it', 'cz']

export const MID_WORDS = ['Brightmoor', 'Hexacore', 'Silver Lantern', 'Copperfox', 'Blue Heron', 'Ironleaf', 'Half Moon', 'Wild Pine', 'Paper Kite', 'Thunderjar', 'Grey Gull', 'Lucky Anvil']
export const MID_SUFFIX = ['Games', 'Interactive', 'Studios', 'Entertainment', 'Softworks']
export const INDIE_WORDS = ['Two Raccoons', 'Pixel Pickle', 'Sleepy Goblin', 'Tiny Volcano', 'Soggy Toast', 'Moth & Lamp', 'Lazy Llama', 'Bad Cabbage', 'Grumpy Owl', 'Velvet Snail', 'Loud Pigeon', 'Cardboard Castle']
export const INDIE_SUFFIX = ['Games', 'Studio', 'Collective', 'Workshop', 'Arcade']

/** Publishers that sign indie and AA games. */
export const PUBLISHERS = ['Lantern Bay Publishing', 'Velvet Rope Games', 'Hungry Fox Publishing', 'Northstar Arcade', 'Paperplane Publishing', 'Moonshot Interactive', 'Kettle Black Games', 'Bramble & Co.']

// ---------------------------------------------------------------------------
// Awards, press and events

/** Share of the sticker price a studio actually receives: stores keep 30%, and the average copy sells at a discount. */
export const NET_PER_PRICE = 0.7 * 0.78

export const CRITIC_SITE = 'CritiQ'
export const STORE = 'PixelPantry'
export const CONVENTION = 'GameFest'

export const AWARDS = {
  goty: 'Pixel Crown for Game of the Year',
  joypad: 'Golden Joypad',
  indie: 'Indie Spark Award',
  worst: 'Rusty Cartridge for Worst Game of the Year',
  jam: 'Midnight Pizza Jam gold medal',
} as const

export const JOYPAD_CATEGORIES = ['Best Art Direction', 'Best Narrative', 'Best Game Design', 'Best Soundtrack', 'Best Performance', 'Most Innovative']

export const JAM_THEMES = ['Only One Button', 'It Grows', 'Out of Control', 'Small World', 'You Are the Villain', 'Upside Down', 'Delivery', 'Too Many Cats', 'Running Out of Time', 'Opposites Attract']

// ---------------------------------------------------------------------------
// Interview questions (offline; one is asked per application)

export interface InterviewQuestion {
  track: Track | 'any'
  text: string
  answers: { id: string; label: string; emoji: string; score: number; reply: string }[]
}

export const INTERVIEWS: InterviewQuestion[] = [
  {
    track: 'qa',
    text: 'The lead hands you a build and says, "Break it." What do you do first?',
    answers: [
      { id: 'walls', label: 'Walk into every wall to find a hole', emoji: '\u{1F9F1}', score: 18, reply: 'You fell through the map in four minutes. The lead looked proud.' },
      { id: 'report', label: 'Write a 40-page report about the font', emoji: '\u{1F4DD}', score: 6, reply: 'Thorough. Exhausting. The font is, admittedly, bad.' },
      { id: 'play', label: 'Play it normally and say it seems fine', emoji: '\u{1F44D}', score: -10, reply: 'It crashed when they pressed Start. You said it seemed fine.' },
    ],
  },
  {
    track: 'qa',
    text: 'You find a bug that lets players duplicate gold. The game ships in two days. What do you do?',
    answers: [
      { id: 'flag', label: 'Flag it as critical with exact repro steps', emoji: '\u{1F6A9}', score: 18, reply: 'Clear steps, video attached. They wrote your name on the whiteboard.' },
      { id: 'secret', label: 'Keep it secret for when the game launches', emoji: '\u{1F92B}', score: -14, reply: 'You said it with a wink. Nobody winked back.' },
      { id: 'meme', label: 'Post a clip of it on social media', emoji: '\u{1F4F1}', score: -20, reply: 'Interviewers are not fans of leaked builds.' },
    ],
  },
  {
    track: 'code',
    text: 'Live coding test: the player jumps through the ceiling every 50th jump. How do you start?',
    answers: [
      { id: 'repro', label: 'Reproduce it, log the physics, find the edge case', emoji: '\u{1F50D}', score: 18, reply: 'You found a floating-point bug in nine minutes and explained it without crying.' },
      { id: 'clamp', label: 'Clamp the jump height and move on', emoji: '\u{1FA79}', score: 6, reply: 'It works. The senior programmer made a face that meant "for now."' },
      { id: 'rewrite', label: 'Propose rewriting the whole physics engine', emoji: '\u{1F525}', score: -8, reply: 'The interviewer quietly checked the time.' },
    ],
  },
  {
    track: 'code',
    text: 'The game runs at 12 frames per second on the target console. Your call?',
    answers: [
      { id: 'profile', label: 'Profile it before touching anything', emoji: '\u{1F4CA}', score: 18, reply: 'The correct answer. The interviewer relaxed visibly.' },
      { id: 'lod', label: 'Lower every texture until it runs', emoji: '\u{1F4C9}', score: 4, reply: 'It runs! It also looks like 1997.' },
      { id: 'blame', label: 'Blame the artists', emoji: '\u{1F449}', score: -12, reply: 'The art director was on the panel.' },
    ],
  },
  {
    track: 'art',
    text: 'Portfolio review. The art director asks which piece you are proudest of and why.',
    answers: [
      { id: 'process', label: 'Walk through the sketches, feedback and final piece', emoji: '\u{270F}\u{FE0F}', score: 18, reply: 'Showing the process was exactly what they wanted to see.' },
      { id: 'all', label: '"All of them, they are all masterpieces"', emoji: '\u{1F451}', score: -6, reply: 'Confidence: high. Self-awareness: pending.' },
      { id: 'style', label: 'Talk about your style and influences', emoji: '\u{1F3A8}', score: 8, reply: 'They nodded and wrote "has taste."' },
    ],
  },
  {
    track: 'art',
    text: 'Art test: "Draw a goblin who is also an accountant." You have one hour.',
    answers: [
      { id: 'silhouette', label: 'Nail a readable silhouette first, then details', emoji: '\u{1F47A}', score: 18, reply: 'Even as a black shape he looks like he will audit you. Hired energy.' },
      { id: 'render', label: 'Spend the whole hour rendering one very shiny calculator', emoji: '\u{1F9EE}', score: 2, reply: 'The calculator is stunning. The goblin is a smudge.' },
      { id: 'trace', label: 'Trace something from the internet', emoji: '\u{1F5A8}\u{FE0F}', score: -20, reply: 'They recognized it. They always recognize it.' },
    ],
  },
  {
    track: 'design',
    text: 'Pitch a game in thirty seconds.',
    answers: [
      { id: 'hook', label: 'One clear hook, one core loop, why it is fun', emoji: '\u{1F3AF}', score: 18, reply: '"A heist game where you are the getaway shopping cart." They laughed, then asked follow-ups.' },
      { id: 'everything', label: 'An open-world MMO battle royale RPG with farming', emoji: '\u{1F300}', score: -8, reply: 'They asked about the budget. You said "yes."' },
      { id: 'clone', label: 'Their own best seller, but with zombies', emoji: '\u{1F9DF}', score: 4, reply: 'Flattering. Unoriginal. They wrote "safe."' },
    ],
  },
  {
    track: 'design',
    text: 'Playtesters say level 3 is boring. What do you do?',
    answers: [
      { id: 'watch', label: 'Watch recordings to see where they lose interest', emoji: '\u{1F3A5}', score: 18, reply: 'Data and empathy. The lead designer bought you a coffee on the spot.' },
      { id: 'explosions', label: 'Add explosions', emoji: '\u{1F4A5}', score: 4, reply: 'Honestly? It sometimes works.' },
      { id: 'wrong', label: 'The playtesters are wrong', emoji: '\u{1F644}', score: -12, reply: 'Players are never wrong about how they feel. Usually wrong about the fix, though.' },
    ],
  },
  {
    track: 'any',
    text: 'Last question: "What does crunch mean to you?"',
    answers: [
      { id: 'plan', label: 'A planning failure we should avoid', emoji: '\u{1F4C5}', score: 10, reply: 'Half the panel nodded. The producer looked at the floor.' },
      { id: 'badge', label: 'A badge of honor! I live at my desk', emoji: '\u{1F6CF}\u{FE0F}', score: 4, reply: 'They smiled in a way that will cost you your twenties.' },
      { id: 'cereal', label: 'A breakfast cereal', emoji: '\u{1F963}', score: -4, reply: 'One person laughed. That person is now your favorite.' },
    ],
  },
]
