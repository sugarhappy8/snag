// Membership & subscription plans (shops/memberships.ts). Fees are yearly, in US dollars for an
// average US city; memberships.ts scales them for the player's market (gyms and clubs follow local
// wages and rents, streaming follows regional pricing, wine follows local alcohol prices...).
import type { TechId } from '../history/timeline'

/** How a plan's fee moves between countries. */
export type FeeBasis = 'service' | 'club' | 'digital' | 'food' | 'alcohol' | 'goods' | 'global'

export type PlanCategory = 'fitness' | 'club' | 'work' | 'subscription' | 'box' | 'culture' | 'travel' | 'dating'

export interface TierDef {
  id: string
  label: string
  /** Yearly fee, US dollars. */
  fee: number
  perks: string[]
  /** Uses per year at this tier. */
  uses: number
}

export interface PlanDef {
  id: string
  /** Name pattern: {w} = a local name word, {city} = the player's city; `fallback` without name words. */
  names: string[]
  fallback: string
  emoji: string
  category: PlanCategory
  blurb: string
  basis: FeeBasis
  minAge: number
  tiers: TierDef[]
  /** One-time joining fee as a multiple of the first tier's yearly fee (clubs). */
  initiation?: number
  /** The committee reviews applications (clubs). */
  vetted?: boolean
  /** Use action label and emoji. */
  useLabel: string
  useEmoji: string
  /** When this kind of plan exists (no streaming bundles in 1995). */
  era?: { from?: number; tech?: TechId }
}

export const PLANS: PlanDef[] = [
  {
    id: 'gym',
    names: ['{w} Fitness', 'FlexZone 24/7'],
    fallback: 'FlexZone 24/7',
    emoji: '🏋️',
    category: 'fitness',
    blurb: 'Weights, cardio, classes and a smoothie bar',
    basis: 'service',
    minAge: 14,
    tiers: [
      { id: 'budget', label: 'Budget', fee: 300, uses: 3, perks: ['24/7 access', 'A locker that smells like regret', 'Free fitness assessment (they will judge you)'] },
      { id: 'premium', label: 'Premium', fee: 900, uses: 4, perks: ['Every location', 'Group classes', 'Sauna and towel service', 'Guest passes'] },
      { id: 'boutique', label: 'Boutique', fee: 2_400, uses: 4, perks: ['Small-group classes', 'A personal trainer who remembers your name', 'Cucumber water', 'Mood lighting'] },
    ],
    useLabel: 'Hit the Gym',
    useEmoji: '💪',
  },
  {
    id: 'spa',
    names: ['{w} Spa & Wellness'],
    fallback: 'Lotus Spa & Wellness',
    emoji: '💆',
    category: 'fitness',
    blurb: 'Massages, steam rooms, facials',
    basis: 'service',
    minAge: 18,
    tiers: [
      { id: 'basic', label: 'Basic', fee: 1_200, uses: 2, perks: ['Monthly massage', 'Steam room access'] },
      { id: 'luxe', label: 'Luxe', fee: 4_800, uses: 4, perks: ['Unlimited steam and sauna', 'Monthly massage and facial', 'Fluffy robes', 'Cucumbers for your eyes'] },
    ],
    useLabel: 'Spa Day',
    useEmoji: '🧖',
  },
  {
    id: 'tennis',
    names: ['{city} Lawn Tennis Club', '{w} Tennis Club'],
    fallback: 'Riverside Tennis Club',
    emoji: '🎾',
    category: 'fitness',
    blurb: 'Courts, coaching and a doubles ladder',
    basis: 'service',
    minAge: 10,
    tiers: [
      { id: 'social', label: 'Social', fee: 800, uses: 3, perks: ['Court bookings', 'Club tournaments'] },
      { id: 'full', label: 'Full', fee: 2_500, uses: 4, perks: ['Priority courts', 'Weekly coaching', 'A ball machine named Gerald'] },
    ],
    useLabel: 'Play a Match',
    useEmoji: '🎾',
  },
  {
    id: 'golf',
    names: ['{city} Golf Club', '{w} Links'],
    fallback: 'Old Pines Golf Club',
    emoji: '⛳',
    category: 'club',
    blurb: '18 holes, a driving range and a strict dress code',
    basis: 'club',
    minAge: 12,
    tiers: [
      { id: 'weekday', label: 'Weekday', fee: 2_500, uses: 3, perks: ['Weekday tee times', 'Driving range'] },
      { id: 'full', label: 'Full', fee: 9_000, uses: 4, perks: ['Any tee time', 'Locker room', 'Caddies', 'The good parking spots'] },
    ],
    initiation: 1.5,
    vetted: true,
    useLabel: 'Play 18 Holes',
    useEmoji: '🏌️',
  },
  {
    id: 'country',
    names: ['{w} Country Club', '{city} Country Club'],
    fallback: 'Willow Creek Country Club',
    emoji: '🏛️',
    category: 'club',
    blurb: 'Pools, tennis, golf, galas and gossip',
    basis: 'club',
    minAge: 18,
    tiers: [
      { id: 'social', label: 'Social', fee: 8_000, uses: 3, perks: ['Clubhouse and pool', 'Dining room', 'Holiday galas'] },
      { id: 'full', label: 'Full Equity', fee: 24_000, uses: 4, perks: ['Golf and tennis', 'A vote on the board', 'Your name on a plaque', 'Valet parking'] },
    ],
    initiation: 2,
    vetted: true,
    useLabel: 'Spend a Day at the Club',
    useEmoji: '🥂',
  },
  {
    id: 'yacht',
    names: ['{city} Yacht Club', '{w} Sailing Club'],
    fallback: 'Harborside Yacht Club',
    emoji: '⛵',
    category: 'club',
    blurb: 'A berth, regattas and blazers with anchors on them',
    basis: 'club',
    minAge: 18,
    tiers: [
      { id: 'sailing', label: 'Sailing', fee: 3_500, uses: 3, perks: ['Club regattas', 'Clubhouse bar', 'Guest moorings'] },
      { id: 'commodore', label: "Commodore's Circle", fee: 12_000, uses: 4, perks: ['Premium berth', 'Crew on call', 'A tiny flag for your boat'] },
    ],
    initiation: 1,
    vetted: true,
    useLabel: 'Regatta Day',
    useEmoji: '⛵',
  },
  {
    id: 'private',
    names: ['The Gilded Owl', 'The Velvet Room', 'The {w} Club'],
    fallback: 'The Gilded Owl',
    emoji: '🦉',
    category: 'club',
    blurb: 'A private members\' club for "creative types" and their money',
    basis: 'club',
    minAge: 21,
    tiers: [
      { id: 'member', label: 'Member', fee: 3_000, uses: 3, perks: ['Rooftop bar', 'Screening room', 'Strict no-photos policy'] },
      { id: 'founder', label: "Founders' Circle", fee: 9_000, uses: 4, perks: ['Every house worldwide', 'Bedrooms upstairs', 'A table nobody else can sit at'] },
    ],
    initiation: 0.5,
    vetted: true,
    useLabel: 'Network at the Club',
    useEmoji: '🍸',
  },
  {
    id: 'cowork',
    era: { from: 2005 },
    names: ['HiveDesk {city}', '{w} Coworking'],
    fallback: 'HiveDesk Coworking',
    emoji: '💼',
    category: 'work',
    blurb: 'Desks, fast Wi-Fi and free coffee',
    basis: 'service',
    minAge: 18,
    tiers: [
      { id: 'hotdesk', label: 'Hot Desk', fee: 2_400, uses: 3, perks: ['Any free desk', 'Free coffee', 'Kombucha on tap'] },
      { id: 'dedicated', label: 'Dedicated Desk', fee: 4_800, uses: 4, perks: ['Your own desk', 'A locker', 'Meeting room credits'] },
      { id: 'office', label: 'Private Office', fee: 12_000, uses: 4, perks: ['A door that closes', 'Your name on the glass', 'Phone booth priority'] },
    ],
    useLabel: 'Work From the Space',
    useEmoji: '💻',
  },
  {
    id: 'streaming',
    era: { tech: 'streaming' },
    names: ['StreamStack Bundle'],
    fallback: 'StreamStack Bundle',
    emoji: '📺',
    category: 'subscription',
    blurb: 'Movies, series and live sports in one app',
    basis: 'digital',
    minAge: 13,
    tiers: [
      { id: 'ads', label: 'Basic (with Ads)', fee: 96, uses: 3, perks: ['Everything, with ads', 'One screen'] },
      { id: 'standard', label: 'Standard', fee: 216, uses: 4, perks: ['No ads', 'Two screens', 'HD'] },
      { id: 'premium', label: 'Premium 4K', fee: 300, uses: 4, perks: ['4K', 'Four screens', 'Live sports', 'Your ex still uses your login'] },
    ],
    useLabel: 'Binge-Watch a Series',
    useEmoji: '🍿',
  },
  {
    id: 'music',
    era: { tech: 'streaming', from: 2008 },
    names: ['Tunely'],
    fallback: 'Tunely',
    emoji: '🎧',
    category: 'subscription',
    blurb: 'Every song ever, no ads',
    basis: 'digital',
    minAge: 13,
    tiers: [
      { id: 'student', label: 'Student', fee: 72, uses: 3, perks: ['No ads', 'Offline downloads'] },
      { id: 'individual', label: 'Individual', fee: 132, uses: 3, perks: ['No ads', 'Offline downloads', 'Lossless audio'] },
      { id: 'family', label: 'Family', fee: 216, uses: 4, perks: ['Six accounts', 'Your dad\'s playlists ruin your recommendations'] },
    ],
    useLabel: 'Listen to Music',
    useEmoji: '🎶',
  },
  {
    id: 'games',
    era: { tech: 'internet', from: 2002 },
    names: ['GameVault+'],
    fallback: 'GameVault+',
    emoji: '🎮',
    category: 'subscription',
    blurb: 'Hundreds of games and online play',
    basis: 'digital',
    minAge: 10,
    tiers: [
      { id: 'core', label: 'Core', fee: 72, uses: 3, perks: ['Online multiplayer', 'Monthly free games'] },
      { id: 'ultimate', label: 'Ultimate', fee: 216, uses: 4, perks: ['The full library', 'New releases on day one', 'Cloud gaming'] },
    ],
    useLabel: 'Gaming Marathon',
    useEmoji: '🕹️',
  },
  {
    id: 'mealkit',
    era: { tech: 'onlineShopping', from: 2012 },
    names: ['ChefCrate'],
    fallback: 'ChefCrate',
    emoji: '🥘',
    category: 'box',
    blurb: 'Recipes and ingredients delivered weekly',
    basis: 'food',
    minAge: 18,
    tiers: [
      { id: 'two', label: '2 Meals a Week', fee: 2_600, uses: 3, perks: ['Pre-portioned ingredients', 'Recipe cards with optimistic prep times'] },
      { id: 'four', label: '4 Meals a Week', fee: 4_800, uses: 4, perks: ['More meals', 'Fewer grocery runs', 'So much cardboard'] },
    ],
    useLabel: 'Cook a Meal Kit',
    useEmoji: '🔪',
  },
  {
    id: 'wine',
    names: ['Cork & Barrel Wine Club'],
    fallback: 'Cork & Barrel Wine Club',
    emoji: '🍷',
    category: 'box',
    blurb: 'Hand-picked bottles every month',
    basis: 'alcohol',
    minAge: 18,
    tiers: [
      { id: 'table', label: 'Table Wines', fee: 600, uses: 3, perks: ['Two bottles a month', 'Tasting notes you will pretend to understand'] },
      { id: 'cellar', label: 'Cellar Selection', fee: 2_400, uses: 3, perks: ['Rare vintages', 'Invitations to tastings', 'Words like "tannic"'] },
    ],
    useLabel: 'Open a Bottle',
    useEmoji: '🍷',
  },
  {
    id: 'culture',
    names: ['{city} Culture Pass'],
    fallback: 'City Culture Pass',
    emoji: '🏛️',
    category: 'culture',
    blurb: 'Free entry to museums, galleries and the zoo',
    basis: 'service',
    minAge: 13,
    tiers: [
      { id: 'single', label: 'Individual', fee: 120, uses: 3, perks: ['Museums and galleries', 'The zoo', 'Member previews'] },
      { id: 'family', label: 'Family', fee: 280, uses: 4, perks: ['Bring the whole family', 'Café discount', 'Members-only nights'] },
    ],
    useLabel: 'Go on a Culture Day',
    useEmoji: '🦒',
  },
  {
    id: 'warehouse',
    era: { from: 1976 },
    names: ['BulkBarn Warehouse Club'],
    fallback: 'BulkBarn Warehouse Club',
    emoji: '🛒',
    category: 'subscription',
    blurb: 'Groceries by the pallet, at a discount',
    basis: 'goods',
    minAge: 18,
    tiers: [
      { id: 'gold', label: 'Gold', fee: 65, uses: 2, perks: ['Bulk prices', 'Free samples (unofficial lunch)'] },
      { id: 'executive', label: 'Executive', fee: 130, uses: 2, perks: ['2% cash back', 'The dignity of a bigger card'] },
    ],
    useLabel: 'Bulk Shopping Run',
    useEmoji: '🧻',
  },
  {
    id: 'jet',
    era: { from: 1986 },
    names: ['AeroCard Private Jet Card'],
    fallback: 'AeroCard Private Jet Card',
    emoji: '🛩️',
    category: 'travel',
    blurb: 'Prepaid private-jet hours. No security lines, ever.',
    basis: 'global',
    minAge: 21,
    tiers: [
      { id: 'h25', label: '25 Hours', fee: 175_000, uses: 2, perks: ['Light jets', '24-hour notice', 'Champagne on board'] },
      { id: 'h50', label: '50 Hours', fee: 400_000, uses: 4, perks: ['Midsize jets', '10-hour notice', 'Your favorite snacks stocked'] },
      { id: 'h100', label: '100 Hours', fee: 950_000, uses: 6, perks: ['Heavy jets', 'Guaranteed availability', 'A pilot who knows your dog\'s name'] },
    ],
    useLabel: 'Fly Private',
    useEmoji: '🛩️',
  },
  {
    id: 'dating',
    era: { tech: 'datingApps' },
    names: ['Kindling Premium'],
    fallback: 'Kindling Premium',
    emoji: '🔥',
    category: 'dating',
    blurb: 'See who liked you, unlimited swipes, premium matches',
    basis: 'digital',
    minAge: 18,
    tiers: [
      { id: 'plus', label: 'Plus', fee: 120, uses: 2, perks: ['Unlimited swipes', 'Undo that accidental left swipe'] },
      { id: 'platinum', label: 'Platinum', fee: 480, uses: 3, perks: ['See who liked you', 'Priority matches', 'Better-looking disappointments'] },
    ],
    useLabel: 'Browse Premium Matches',
    useEmoji: '💘',
  },
]

/** Local spa traditions: the spa membership is named and flavored after them. */
export const SPA_STYLE: Record<string, { name: string; place: string; line: string }> = {
  jp: { name: 'Onsen & Spa Pass', place: 'the onsen', line: 'You soaked in the hot spring until you were the consistency of noodles.' },
  kr: { name: 'Jjimjilbang Pass', place: 'the jjimjilbang', line: 'You sweated in the kiln room, ate a boiled egg in a towel hat and napped on a heated floor.' },
  tr: { name: 'Hammam Membership', place: 'the hammam', line: 'An attendant scrubbed off what felt like three layers of skin. You emerged reborn.' },
  ma: { name: 'Hammam Membership', place: 'the hammam', line: 'You were steamed, scrubbed with black soap and sent home glowing.' },
  dz: { name: 'Hammam Membership', place: 'the hammam', line: 'You were steamed and scrubbed until you squeaked.' },
  tn: { name: 'Hammam Membership', place: 'the hammam', line: 'You were steamed and scrubbed until you squeaked.' },
  eg: { name: 'Hammam Membership', place: 'the hammam', line: 'You spent the afternoon in steam and marble. Pure bliss.' },
  jo: { name: 'Hammam Membership', place: 'the hammam', line: 'You spent the afternoon in steam and marble. Pure bliss.' },
  lb: { name: 'Hammam Membership', place: 'the hammam', line: 'You spent the afternoon in steam and marble. Pure bliss.' },
  sy: { name: 'Hammam Membership', place: 'the hammam', line: 'You spent the afternoon in steam and marble. Pure bliss.' },
  fi: { name: 'Sauna Club', place: 'the sauna club', line: 'You sat in a 90°C sauna, jumped into a frozen lake and felt immortal.' },
  ee: { name: 'Sauna Club', place: 'the sauna club', line: 'You did three rounds of sauna and cold plunge. Your soul has been reset.' },
  se: { name: 'Sauna & Bath Club', place: 'the bathhouse', line: 'You alternated between sauna and ice bath like a true Nordic.' },
  no: { name: 'Sauna & Bath Club', place: 'the floating sauna', line: 'You sweated in a sauna on the fjord and jumped straight into the water.' },
  ru: { name: 'Banya Club', place: 'the banya', line: 'A large man beat you gently with birch branches. It was the most relaxed you have ever been.' },
  ua: { name: 'Banya Club', place: 'the banya', line: 'You steamed, plunged and drank herbal tea in a bathrobe. Excellent.' },
  kz: { name: 'Banya Club', place: 'the banya', line: 'You steamed with birch branches and emerged pink and peaceful.' },
  hu: { name: 'Thermal Bath Pass', place: 'the thermal baths', line: 'You soaked in a 100-year-old thermal bath while old men played chess in the water.' },
  de: { name: 'Therme Membership', place: 'the therme', line: 'You spent the day between saunas, pools and a quiet room where whispering is a crime.' },
  at: { name: 'Therme Membership', place: 'the therme', line: 'You spent the day between saunas, pools and a quiet room where whispering is a crime.' },
  th: { name: 'Thai Massage Club', place: 'the massage parlor', line: 'A tiny woman folded you like origami. You have never felt better.' },
  in: { name: 'Ayurveda Wellness Pass', place: 'the Ayurveda center', line: 'Warm oil, herbal steam and a lecture about your doshas. You feel balanced.' },
  id: { name: 'Balinese Spa Pass', place: 'the spa', line: 'A Balinese massage and a flower bath. You may never stand up again.' },
}
