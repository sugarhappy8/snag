// Catalogs for the everyday stores (shops/everyday.ts): bikes, sporting goods, furniture & decor,
// clothing, toys, garden & hardware and pet supplies. Prices are what the item costs in an average
// US city, in dollars; everyday.ts scales them for the player's market and rolls a per-year stock.
import type { Gender } from '../types'

/**
 * How an item's price moves between countries:
 * - local: made and sold locally (thrift clothes, rugs, toys): purchasing power only.
 * - traded: imported or globally traded goods with local retail margins (bikes, sports gear).
 * - tech: electronics-heavy items, priced like gadgets (e-bikes, massage chairs, solar).
 * - luxury: designer goods, priced like the luxury boutique.
 * - food: groceries (pet food), priced like the local grocery basket.
 */
export type PriceBasis = 'local' | 'traded' | 'tech' | 'luxury' | 'food'

/** What the item lets you do once you own it (see USES in everyday.ts). */
export type UseId =
  | 'ride'
  | 'workout'
  | 'yoga'
  | 'box'
  | 'golf'
  | 'slopes'
  | 'surf'
  | 'paddle'
  | 'racket'
  | 'bounce'
  | 'fish'
  | 'camp'
  | 'ballgame'
  | 'skate'
  | 'climb'
  | 'relax'
  | 'massage'
  | 'movie'
  | 'fishtank'
  | 'plants'
  | 'wear'
  | 'play'
  | 'build'
  | 'boardgame'
  | 'puzzle'
  | 'cards'
  | 'bbq'
  | 'soak'
  | 'mow'
  | 'fix'
  | 'fire'

export interface ItemDef {
  key: string
  name: string
  emoji: string
  /** US price in dollars. */
  base: number
  basis: PriceBasis
  /** Resale value right after purchase, as a share of the price. */
  keep: number
  use?: UseId
  /** Youngest player who sees it (default: the store's minimum age). */
  minAge?: number
  /** Kid-sized: only shown to children this age or younger, or to parents of such kids. */
  kidsUpTo?: number
  gender?: Gender
  /** Only sold in these countries. */
  only?: readonly string[]
  /** Not sold in these countries. */
  except?: readonly string[]
  /** 'home': you need a place of your own (owned or rented); 'house': a house you own. */
  needs?: 'home' | 'house'
  /** Yearly running cost in US dollars (hot tub chemicals and power). */
  upkeep?: number
  /** Can show up second-hand. */
  used?: boolean
  /** Clothing tier: 1 thrift, 2 fast fashion, 3 premium or traditional, 4 designer. */
  tier?: number
  /** Accident risk per ride for bikes and boards. */
  risk?: number
  /** Asset category override (game consoles are 'electronics' so they age like gadgets). */
  category?: string
  /** Sport or activity name used in the Use action ("Play cricket"). */
  sport?: string
  /** Solar panels: a share of the price saved on power bills every year. */
  solar?: boolean
  /** Shown in the listing subtitle. */
  note?: string
}

// ---------------------------------------------------------------------------
// Country groups

/** Countries with real ski slopes. */
export const SNOW = ['us', 'ca', 'ad', 'at', 'ch', 'fr', 'de', 'it', 'no', 'se', 'fi', 'jp', 'kr', 'cn', 'nz', 'au', 'cl', 'ar', 'pl', 'cz', 'sk', 'ro', 'ru', 'ua', 'ge', 'kz', 'mn', 'ir', 'tr', 'es', 'gr', 'rs', 'hr', 'ee', 'lb', 'ma', 'in', 'pk', 'il', 'hu', 'bo'] as const
/** No coastline: no surfing, no snorkeling. */
export const LANDLOCKED = ['ad', 'at', 'ch', 'cz', 'hu', 'sk', 'rs', 'et', 'ug', 'zw', 'af', 'kz', 'mn', 'np', 'bo', 'py'] as const
export const CRICKET = ['in', 'pk', 'bd', 'au', 'gb', 'nz', 'za', 'jm', 'gy', 'af', 'np', 'zw', 'ie', 'ae', 'ke', 'bs', 'pg', 'ws'] as const
export const BASEBALL = ['us', 'jp', 'kr', 'tw', 'cu', 'do', 'pr', 've', 'mx', 'ni', 'pa', 'ca', 'aw'] as const
export const HOCKEY = ['ca', 'us', 'fi', 'se', 'ru', 'cz', 'sk', 'ch', 'no', 'at', 'de', 'kz'] as const
export const RUGBY = ['nz', 'za', 'ws', 'fr', 'ie', 'gb', 'au', 'ar', 'ge', 'pg', 'it', 'uy', 'ro'] as const
/** Where everyone and their grandmother rides a bike. */
export const BIKE_NATIONS = ['nl', 'dk', 'de', 'be', 'jp', 'cn', 'se', 'fi', 'ch', 'at', 'tw', 'vn'] as const
export const SURF_NATIONS = ['au', 'br', 'us', 'pt', 'cr', 'sv', 'id', 'za', 'nz', 'ws', 'pe', 'ma', 'fr', 'mx', 'ph', 'pr'] as const
/** Hot all year: nobody sells puffer jackets or wool coats here. */
export const HOT = ['aw', 'bs', 'bz', 'cr', 'cu', 'do', 'sv', 'gt', 'ht', 'jm', 'ni', 'pa', 'pr', 'gy', 've', 'dj', 'cd', 'ng', 'ao', 'ug', 'ae', 'qa', 'kw', 'sa', 'bd', 'id', 'my', 'ph', 'sg', 'th', 'ws', 'pg'] as const
/** Snowy enough that a snow blower is a sane purchase. */
export const SNOW_BLOWER = ['us', 'ca', 'no', 'se', 'fi', 'ru', 'ch', 'at', 'jp', 'kz', 'mn', 'ee', 'pl', 'cz', 'sk', 'de', 'ua'] as const

// ---------------------------------------------------------------------------
// Bike Shop

export const BIKES: ItemDef[] = [
  { key: 'balance', name: 'Balance Bike', emoji: '🚲', base: 90, basis: 'traded', keep: 0.5, use: 'ride', minAge: 2, kidsUpTo: 5, risk: 0.02 },
  { key: 'training', name: "Kids' Bike with Training Wheels", emoji: '🚲', base: 160, basis: 'traded', keep: 0.5, use: 'ride', minAge: 4, kidsUpTo: 9, risk: 0.03, used: true },
  { key: 'bmx', name: 'BMX Bike', emoji: '🚲', base: 350, basis: 'traded', keep: 0.55, use: 'ride', minAge: 7, risk: 0.06, used: true },
  { key: 'cruiser', name: 'Beach Cruiser', emoji: '🚲', base: 400, basis: 'traded', keep: 0.55, use: 'ride', minAge: 10, risk: 0.02, used: true },
  { key: 'city', name: 'Single-Speed City Bike', emoji: '🚲', base: 450, basis: 'traded', keep: 0.55, use: 'ride', minAge: 10, risk: 0.03, used: true },
  { key: 'folding', name: 'Folding Bike', emoji: '🚲', base: 700, basis: 'traded', keep: 0.55, use: 'ride', minAge: 12, risk: 0.03 },
  { key: 'hybrid', name: 'Hybrid Commuter Bike', emoji: '🚲', base: 650, basis: 'traded', keep: 0.55, use: 'ride', minAge: 12, risk: 0.03, used: true },
  { key: 'road', name: 'Road Bike', emoji: '🚴', base: 1_400, basis: 'traded', keep: 0.6, use: 'ride', minAge: 13, risk: 0.04, used: true },
  { key: 'carbon', name: 'Carbon Road Bike', emoji: '🚴', base: 3_800, basis: 'traded', keep: 0.6, use: 'ride', minAge: 16, risk: 0.04 },
  { key: 'hardtail', name: 'Hardtail Mountain Bike', emoji: '🚵', base: 900, basis: 'traded', keep: 0.55, use: 'ride', minAge: 12, risk: 0.05, used: true },
  { key: 'fullsus', name: 'Full-Suspension Mountain Bike', emoji: '🚵', base: 2_800, basis: 'traded', keep: 0.6, use: 'ride', minAge: 14, risk: 0.06 },
  { key: 'gravel', name: 'Gravel Bike', emoji: '🚴', base: 1_800, basis: 'traded', keep: 0.6, use: 'ride', minAge: 14, risk: 0.04 },
  { key: 'ebike', name: 'Commuter E-Bike', emoji: '🔋', base: 1_900, basis: 'tech', keep: 0.55, use: 'ride', minAge: 14, risk: 0.04 },
  { key: 'emtb', name: 'Electric Mountain Bike', emoji: '🔋', base: 4_500, basis: 'tech', keep: 0.55, use: 'ride', minAge: 16, risk: 0.06 },
  { key: 'cargo', name: 'Electric Cargo Bike', emoji: '📦', base: 3_400, basis: 'tech', keep: 0.6, use: 'ride', minAge: 18, risk: 0.03 },
  { key: 'tandem', name: 'Tandem Bicycle', emoji: '🚲', base: 1_100, basis: 'traded', keep: 0.5, use: 'ride', minAge: 14, risk: 0.04 },
  { key: 'kick', name: 'Kick Scooter', emoji: '🛴', base: 90, basis: 'traded', keep: 0.4, use: 'ride', minAge: 4, risk: 0.04 },
  { key: 'escooter', name: 'Electric Scooter', emoji: '🛴', base: 600, basis: 'tech', keep: 0.45, use: 'ride', minAge: 14, risk: 0.07 },
  { key: 'unicycle', name: 'Unicycle', emoji: '🎪', base: 120, basis: 'traded', keep: 0.5, use: 'ride', minAge: 8, risk: 0.12 },
  { key: 'dutch', name: 'Upright Dutch City Bike', emoji: '🚲', base: 750, basis: 'traded', keep: 0.6, use: 'ride', minAge: 12, risk: 0.02, used: true, only: ['nl', 'be', 'dk', 'de'] },
  { key: 'mamachari', name: 'Mamachari Shopping Bike', emoji: '🚲', base: 300, basis: 'traded', keep: 0.5, use: 'ride', minAge: 12, risk: 0.02, used: true, only: ['jp'] },
  { key: 'roadster', name: 'Classic Black Roadster Bike', emoji: '🚲', base: 120, basis: 'local', keep: 0.6, use: 'ride', minAge: 10, risk: 0.03, used: true, only: ['in', 'cn', 'bd', 'pk', 'np', 'vn', 'ng', 'ke', 'ug', 'et'] },
]

// ---------------------------------------------------------------------------
// Sporting Goods

export const SPORTS_GEAR: ItemDef[] = [
  { key: 'homegym', name: 'Home Gym Set', emoji: '🏋️', base: 1_500, basis: 'traded', keep: 0.45, use: 'workout', minAge: 14 },
  { key: 'treadmill', name: 'Treadmill', emoji: '🏃', base: 1_200, basis: 'tech', keep: 0.4, use: 'workout', minAge: 14, used: true },
  { key: 'rower', name: 'Rowing Machine', emoji: '🚣', base: 900, basis: 'traded', keep: 0.45, use: 'workout', minAge: 14 },
  { key: 'spinbike', name: 'Smart Exercise Bike', emoji: '🚴', base: 1_400, basis: 'tech', keep: 0.4, use: 'workout', minAge: 14 },
  { key: 'dumbbells', name: 'Adjustable Dumbbells', emoji: '💪', base: 350, basis: 'traded', keep: 0.6, use: 'workout', minAge: 13, used: true },
  { key: 'yoga', name: 'Yoga Mat & Blocks', emoji: '🧘', base: 60, basis: 'local', keep: 0.3, use: 'yoga', minAge: 10 },
  { key: 'bag', name: 'Punching Bag & Gloves', emoji: '🥊', base: 180, basis: 'traded', keep: 0.45, use: 'box', minAge: 10 },
  { key: 'golf', name: 'Set of Golf Clubs', emoji: '🏌️', base: 900, basis: 'traded', keep: 0.5, use: 'golf', minAge: 10, used: true, sport: 'golf' },
  { key: 'skis', name: 'Skis, Boots & Poles', emoji: '⛷️', base: 800, basis: 'traded', keep: 0.45, use: 'slopes', minAge: 6, only: SNOW, used: true, sport: 'skiing' },
  { key: 'snowboard', name: 'Snowboard & Bindings', emoji: '🏂', base: 600, basis: 'traded', keep: 0.45, use: 'slopes', minAge: 8, only: SNOW, used: true, sport: 'snowboarding' },
  { key: 'surfboard', name: 'Surfboard', emoji: '🏄', base: 550, basis: 'traded', keep: 0.5, use: 'surf', minAge: 8, except: LANDLOCKED, used: true },
  { key: 'kayak', name: 'Kayak & Paddle', emoji: '🛶', base: 900, basis: 'traded', keep: 0.55, use: 'paddle', minAge: 10, used: true },
  { key: 'sup', name: 'Stand-Up Paddleboard', emoji: '🏄', base: 700, basis: 'traded', keep: 0.5, use: 'paddle', minAge: 10 },
  { key: 'tennis', name: 'Tennis Racket & Balls', emoji: '🎾', base: 200, basis: 'traded', keep: 0.45, use: 'racket', minAge: 7, sport: 'tennis' },
  { key: 'badminton', name: 'Badminton Set', emoji: '🏸', base: 60, basis: 'local', keep: 0.4, use: 'racket', minAge: 6, sport: 'badminton' },
  { key: 'pingpong', name: 'Table Tennis Table', emoji: '🏓', base: 500, basis: 'traded', keep: 0.45, use: 'racket', minAge: 7, sport: 'table tennis' },
  { key: 'trampoline', name: 'Backyard Trampoline', emoji: '🤸', base: 450, basis: 'traded', keep: 0.35, use: 'bounce', minAge: 4, risk: 0.06 },
  { key: 'rod', name: 'Fishing Rod & Tackle Box', emoji: '🎣', base: 180, basis: 'traded', keep: 0.5, use: 'fish', minAge: 7, used: true },
  { key: 'camping', name: 'Camping Kit (Tent & Sleeping Bags)', emoji: '⛺', base: 400, basis: 'traded', keep: 0.45, use: 'camp', minAge: 8 },
  { key: 'cricket', name: 'Cricket Bat, Ball & Pads', emoji: '🏏', base: 150, basis: 'local', keep: 0.45, use: 'ballgame', minAge: 6, only: CRICKET, sport: 'cricket' },
  { key: 'baseball', name: 'Baseball Bat & Glove', emoji: '⚾', base: 120, basis: 'traded', keep: 0.45, use: 'ballgame', minAge: 6, only: BASEBALL, sport: 'baseball' },
  { key: 'soccer', name: 'Match Soccer Ball', emoji: '⚽', base: 35, basis: 'local', keep: 0.3, use: 'ballgame', minAge: 4, sport: 'soccer' },
  { key: 'hoop', name: 'Basketball Hoop', emoji: '🏀', base: 350, basis: 'traded', keep: 0.45, use: 'ballgame', minAge: 6, sport: 'basketball' },
  { key: 'hockey', name: 'Hockey Stick & Skates', emoji: '🏒', base: 400, basis: 'traded', keep: 0.45, use: 'ballgame', minAge: 6, only: HOCKEY, used: true, sport: 'hockey' },
  { key: 'rugby', name: 'Rugby Ball', emoji: '🏉', base: 40, basis: 'local', keep: 0.3, use: 'ballgame', minAge: 6, only: RUGBY, sport: 'rugby' },
  { key: 'skateboard', name: 'Skateboard', emoji: '🛹', base: 120, basis: 'traded', keep: 0.4, use: 'skate', minAge: 6, risk: 0.07, used: true },
  { key: 'inline', name: 'Inline Skates', emoji: '⛸️', base: 150, basis: 'traded', keep: 0.4, use: 'skate', minAge: 6, risk: 0.05 },
  { key: 'climb', name: 'Climbing Harness & Shoes', emoji: '🧗', base: 450, basis: 'traded', keep: 0.45, use: 'climb', minAge: 12, risk: 0.04 },
]

// ---------------------------------------------------------------------------
// Furniture & Home Decor

export const FURNITURE: ItemDef[] = [
  { key: 'sofa', name: 'Three-Seat Sofa', emoji: '🛋️', base: 1_200, basis: 'local', keep: 0.3, use: 'relax', needs: 'home', used: true },
  { key: 'sectional', name: 'Velvet Sectional Sofa', emoji: '🛋️', base: 3_200, basis: 'traded', keep: 0.3, use: 'relax', needs: 'home' },
  { key: 'bed', name: 'King Bed & Memory-Foam Mattress', emoji: '🛏️', base: 2_000, basis: 'traded', keep: 0.2, use: 'relax', needs: 'home' },
  { key: 'dining', name: 'Solid Oak Dining Set', emoji: '🍽️', base: 1_800, basis: 'local', keep: 0.35, needs: 'home', used: true },
  { key: 'prints', name: 'Framed Art Prints', emoji: '🖼️', base: 250, basis: 'local', keep: 0.2, needs: 'home' },
  { key: 'bookshelf', name: 'Floor-to-Ceiling Bookshelf', emoji: '📚', base: 600, basis: 'local', keep: 0.3, needs: 'home', used: true },
  { key: 'smarthome', name: 'Smart-Home Kit', emoji: '🏠', base: 900, basis: 'tech', keep: 0.25, use: 'relax', needs: 'home', note: 'Lights, locks and a speaker that mishears you' },
  { key: 'massage', name: 'Massage Chair', emoji: '💺', base: 3_500, basis: 'tech', keep: 0.35, use: 'massage', needs: 'home' },
  { key: 'aquarium', name: 'Tropical Aquarium', emoji: '🐠', base: 1_200, basis: 'traded', keep: 0.3, use: 'fishtank', needs: 'home', upkeep: 150 },
  { key: 'theater', name: 'Home Theater System', emoji: '🎬', base: 4_000, basis: 'tech', keep: 0.35, use: 'movie', needs: 'home' },
  { key: 'beanbag', name: 'Giant Bean Bag Chair', emoji: '🫘', base: 250, basis: 'local', keep: 0.2, use: 'relax', needs: 'home' },
  { key: 'desk', name: 'Standing Desk', emoji: '🖥️', base: 650, basis: 'traded', keep: 0.4, needs: 'home', used: true },
  { key: 'recliner', name: 'Leather Recliner', emoji: '💺', base: 1_100, basis: 'traded', keep: 0.3, use: 'relax', needs: 'home', used: true },
  { key: 'chandelier', name: 'Crystal Chandelier', emoji: '💡', base: 2_500, basis: 'traded', keep: 0.4, needs: 'home' },
  { key: 'plants', name: 'Houseplant Jungle Bundle', emoji: '🪴', base: 300, basis: 'local', keep: 0.1, use: 'plants', needs: 'home' },
  { key: 'rug', name: 'Hand-Knotted Area Rug', emoji: '🧶', base: 1_500, basis: 'local', keep: 0.5, needs: 'home', except: ['ir', 'ma', 'tr', 'af', 'pk'] },
  { key: 'persian', name: 'Hand-Knotted Persian Rug', emoji: '🧶', base: 2_500, basis: 'local', keep: 0.7, needs: 'home', only: ['ir', 'af', 'pk'] },
  { key: 'berber', name: 'Berber Wool Rug', emoji: '🧶', base: 900, basis: 'local', keep: 0.6, needs: 'home', only: ['ma', 'dz', 'tn'] },
  { key: 'kilim', name: 'Handwoven Kilim Rug', emoji: '🧶', base: 1_000, basis: 'local', keep: 0.6, needs: 'home', only: ['tr', 'ge', 'kz'] },
  { key: 'hammock', name: 'Woven Hammock', emoji: '🌴', base: 120, basis: 'local', keep: 0.3, use: 'relax', needs: 'home', only: ['br', 'co', 'mx', 've', 'ni', 'sv', 'gt', 'cr', 'pa', 'bz', 'ec', 'pe', 'py', 'cu', 'do'] },
  { key: 'kotatsu', name: 'Kotatsu Heated Table', emoji: '♨️', base: 400, basis: 'local', keep: 0.35, use: 'relax', needs: 'home', only: ['jp'] },
  { key: 'futon', name: 'Futon & Tatami Mat Set', emoji: '🛏️', base: 600, basis: 'local', keep: 0.3, use: 'relax', needs: 'home', only: ['jp'] },
  { key: 'majlis', name: 'Majlis Floor Seating Set', emoji: '🛋️', base: 2_500, basis: 'local', keep: 0.35, use: 'relax', needs: 'home', only: ['ae', 'sa', 'qa', 'kw', 'jo', 'iq', 'lb', 'sy'] },
  { key: 'sauna', name: 'Home Sauna Cabin', emoji: '🧖', base: 6_000, basis: 'traded', keep: 0.4, use: 'massage', needs: 'house', upkeep: 200, only: ['fi', 'ee', 'se', 'no', 'ru', 'de', 'at', 'ch'] },
]

// ---------------------------------------------------------------------------
// Clothing & Fashion

export const CLOTHES: ItemDef[] = [
  { key: 'thriftjeans', name: 'Thrift-Store Jeans', emoji: '👖', base: 15, basis: 'local', keep: 0.2, use: 'wear', tier: 1 },
  { key: 'bandtee', name: 'Vintage Band T-Shirt', emoji: '👕', base: 20, basis: 'local', keep: 0.3, use: 'wear', tier: 1 },
  { key: 'leather2', name: 'Secondhand Leather Jacket', emoji: '🧥', base: 45, basis: 'local', keep: 0.3, use: 'wear', tier: 1 },
  { key: 'uglysweater', name: 'Gloriously Ugly Knit Sweater', emoji: '🧶', base: 12, basis: 'local', keep: 0.2, use: 'wear', tier: 1, except: HOT },
  { key: 'hoodie', name: 'Graphic Hoodie', emoji: '👕', base: 35, basis: 'local', keep: 0.15, use: 'wear', tier: 2 },
  { key: 'jeans', name: 'Skinny Jeans', emoji: '👖', base: 40, basis: 'local', keep: 0.15, use: 'wear', tier: 2 },
  { key: 'sundress', name: 'Summer Dress', emoji: '👗', base: 35, basis: 'local', keep: 0.15, use: 'wear', tier: 2, gender: 'female' },
  { key: 'chinos', name: 'Chinos & Polo Combo', emoji: '👔', base: 50, basis: 'local', keep: 0.15, use: 'wear', tier: 2, gender: 'male' },
  { key: 'puffer', name: 'Puffer Jacket', emoji: '🧥', base: 80, basis: 'local', keep: 0.2, use: 'wear', tier: 2, except: HOT },
  { key: 'sneakers', name: 'Canvas Sneakers', emoji: '👟', base: 55, basis: 'local', keep: 0.2, use: 'wear', tier: 2 },
  { key: 'tracksuit', name: 'Matching Tracksuit', emoji: '🩳', base: 60, basis: 'local', keep: 0.15, use: 'wear', tier: 2 },
  { key: 'swim', name: 'Swimsuit', emoji: '🩱', base: 30, basis: 'local', keep: 0.1, use: 'wear', tier: 2 },
  { key: 'overcoat', name: 'Wool Overcoat', emoji: '🧥', base: 350, basis: 'traded', keep: 0.3, use: 'wear', tier: 3, except: HOT },
  { key: 'blazer', name: 'Tailored Blazer', emoji: '🧥', base: 280, basis: 'traded', keep: 0.25, use: 'wear', tier: 3 },
  { key: 'boots', name: 'Leather Boots', emoji: '👢', base: 250, basis: 'traded', keep: 0.3, use: 'wear', tier: 3 },
  { key: 'cashmere', name: 'Cashmere Sweater', emoji: '🧶', base: 220, basis: 'traded', keep: 0.25, use: 'wear', tier: 3, except: HOT },
  { key: 'runners', name: 'Carbon-Plated Running Shoes', emoji: '👟', base: 220, basis: 'traded', keep: 0.25, use: 'wear', tier: 3 },
  { key: 'raincoat', name: 'Waterproof Raincoat', emoji: '🧥', base: 180, basis: 'traded', keep: 0.3, use: 'wear', tier: 3 },
  { key: 'silk', name: 'Silk Blouse', emoji: '👚', base: 160, basis: 'traded', keep: 0.25, use: 'wear', tier: 3, gender: 'female' },
  { key: 'djeans', name: 'Designer Jeans', emoji: '👖', base: 450, basis: 'luxury', keep: 0.3, use: 'wear', tier: 4, minAge: 14 },
  { key: 'dhoodie', name: 'Designer Logo Hoodie', emoji: '👕', base: 750, basis: 'luxury', keep: 0.35, use: 'wear', tier: 4, minAge: 14 },
  { key: 'dsneakers', name: 'Designer Runway Sneakers', emoji: '👟', base: 950, basis: 'luxury', keep: 0.4, use: 'wear', tier: 4, minAge: 14 },
  { key: 'dcoat', name: 'Designer Statement Coat', emoji: '🧥', base: 2_400, basis: 'luxury', keep: 0.35, use: 'wear', tier: 4, minAge: 16 },
]

/** Traditional and regional clothing, sold where people actually wear it. */
export const LOCAL_CLOTHES: ItemDef[] = [
  { key: 'yukata', name: 'Cotton Yukata', emoji: '👘', base: 120, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['jp'], note: 'For summer festivals' },
  { key: 'kimono', name: 'Silk Kimono', emoji: '👘', base: 1_800, basis: 'local', keep: 0.45, use: 'wear', tier: 3, only: ['jp'], minAge: 12, note: 'Formal, with an obi sash' },
  { key: 'hanbok', name: 'Silk Hanbok', emoji: '👘', base: 600, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['kr'], note: 'For Chuseok and weddings' },
  { key: 'sari', name: 'Silk Sari', emoji: '🥻', base: 150, basis: 'local', keep: 0.4, use: 'wear', tier: 3, only: ['in', 'np', 'bd'], gender: 'female' },
  { key: 'sherwani', name: 'Embroidered Sherwani', emoji: '🧥', base: 250, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['in', 'pk', 'bd'], gender: 'male', note: 'Wedding-season essential' },
  { key: 'kurta', name: 'Cotton Kurta', emoji: '👕', base: 25, basis: 'local', keep: 0.2, use: 'wear', tier: 2, only: ['in', 'pk', 'bd', 'np'] },
  { key: 'shalwar', name: 'Shalwar Kameez', emoji: '👕', base: 40, basis: 'local', keep: 0.2, use: 'wear', tier: 2, only: ['pk', 'af'] },
  { key: 'agbada', name: 'Embroidered Agbada', emoji: '🧥', base: 180, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['ng'], gender: 'male' },
  { key: 'ankara', name: 'Ankara Print Dress & Gele', emoji: '👗', base: 90, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['ng'], gender: 'female' },
  { key: 'kente', name: 'Handwoven Kente Stole', emoji: '🧣', base: 140, basis: 'local', keep: 0.45, use: 'wear', tier: 3, only: ['ng'], note: 'Straight from a West African weaver' },
  { key: 'cowboy', name: 'Cowboy Boots', emoji: '👢', base: 300, basis: 'local', keep: 0.4, use: 'wear', tier: 3, only: ['us', 'ca', 'mx'] },
  { key: 'stetson', name: 'Felt Cowboy Hat', emoji: '🤠', base: 150, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['us', 'ca', 'mx'] },
  { key: 'guayabera', name: 'Linen Guayabera Shirt', emoji: '👔', base: 60, basis: 'local', keep: 0.25, use: 'wear', tier: 3, only: ['mx', 'cu', 'pr', 'do', 'pa'] },
  { key: 'rebozo', name: 'Woven Rebozo Shawl', emoji: '🧣', base: 70, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['mx', 'gt'] },
  { key: 'huipil', name: 'Embroidered Huipil Blouse', emoji: '👚', base: 90, basis: 'local', keep: 0.4, use: 'wear', tier: 3, only: ['gt', 'mx', 'sv'] },
  { key: 'pollera', name: 'Pollera Festival Dress', emoji: '👗', base: 900, basis: 'local', keep: 0.45, use: 'wear', tier: 3, only: ['pa'], gender: 'female' },
  { key: 'vueltiao', name: 'Sombrero Vueltiao', emoji: '👒', base: 60, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['co'] },
  { key: 'poncho', name: 'Alpaca Wool Poncho', emoji: '🧥', base: 120, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['pe', 'bo', 'ec'] },
  { key: 'gaucho', name: 'Gaucho Poncho & Boina', emoji: '🧥', base: 110, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['ar', 'uy', 'py'] },
  { key: 'flipflops', name: 'Rubber Flip-Flops', emoji: '🩴', base: 10, basis: 'local', keep: 0.1, use: 'wear', tier: 2, only: ['br', 'ph', 'th', 'id', 'au', 'ws', 'pg'] },
  { key: 'wax', name: 'Waxed Cotton Jacket & Wellies', emoji: '🧥', base: 280, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['gb', 'ie'] },
  { key: 'aran', name: 'Aran Fisherman Sweater', emoji: '🧶', base: 130, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['ie'] },
  { key: 'lederhosen', name: 'Leather Lederhosen', emoji: '🩳', base: 350, basis: 'local', keep: 0.45, use: 'wear', tier: 3, only: ['de', 'at'], gender: 'male', note: 'Beer festival approved' },
  { key: 'dirndl', name: 'Dirndl Dress', emoji: '👗', base: 280, basis: 'local', keep: 0.4, use: 'wear', tier: 3, only: ['de', 'at'], gender: 'female', note: 'Beer festival approved' },
  { key: 'clogs', name: 'Painted Wooden Clogs', emoji: '👞', base: 45, basis: 'local', keep: 0.3, use: 'wear', tier: 2, only: ['nl'] },
  { key: 'nordic', name: 'Nordic Patterned Wool Sweater', emoji: '🧶', base: 220, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['no', 'se', 'fi', 'dk', 'ee'] },
  { key: 'ushanka', name: 'Fur-Lined Ushanka Hat', emoji: '🧢', base: 70, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['ru', 'kz', 'mn', 'ua'] },
  { key: 'vyshyvanka', name: 'Embroidered Vyshyvanka Shirt', emoji: '👕', base: 90, basis: 'local', keep: 0.4, use: 'wear', tier: 3, only: ['ua'] },
  { key: 'flamenco', name: 'Flamenco Dress', emoji: '💃', base: 350, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['es'], gender: 'female' },
  { key: 'espadrilles', name: 'Handmade Espadrilles', emoji: '👡', base: 40, basis: 'local', keep: 0.25, use: 'wear', tier: 2, only: ['es', 'fr', 'ad'] },
  { key: 'breton', name: 'Breton Striped Shirt & Beret', emoji: '🥖', base: 90, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['fr', 'mc', 'be'] },
  { key: 'loafers', name: 'Italian Leather Loafers', emoji: '👞', base: 320, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['it', 'mc'] },
  { key: 'kandura', name: 'White Kandura & Ghutra', emoji: '👳', base: 150, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['ae', 'sa', 'qa', 'kw'], gender: 'male' },
  { key: 'abaya', name: 'Embroidered Abaya', emoji: '🧕', base: 220, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['ae', 'sa', 'qa', 'kw', 'jo', 'iq'], gender: 'female' },
  { key: 'galabeya', name: 'Cotton Galabeya', emoji: '👘', base: 40, basis: 'local', keep: 0.25, use: 'wear', tier: 2, only: ['eg'] },
  { key: 'djellaba', name: 'Hooded Djellaba & Babouches', emoji: '🧥', base: 90, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['ma', 'dz', 'tn'] },
  { key: 'habesha', name: 'Habesha Kemis', emoji: '👗', base: 180, basis: 'local', keep: 0.4, use: 'wear', tier: 3, only: ['et'], gender: 'female' },
  { key: 'shuka', name: 'Maasai Shuka Blanket', emoji: '🧣', base: 25, basis: 'local', keep: 0.3, use: 'wear', tier: 2, only: ['ke'] },
  { key: 'shweshwe', name: 'Shweshwe Print Dress', emoji: '👗', base: 70, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['za'], gender: 'female' },
  { key: 'qipao', name: 'Silk Qipao', emoji: '👗', base: 250, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['cn', 'tw', 'hk', 'sg', 'my'], gender: 'female' },
  { key: 'tang', name: 'Tang Suit Jacket', emoji: '🧥', base: 150, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['cn', 'tw', 'hk', 'sg', 'my'], gender: 'male' },
  { key: 'aodai', name: 'Silk Áo Dài', emoji: '👘', base: 120, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['vn'] },
  { key: 'barong', name: 'Barong Tagalog', emoji: '👔', base: 110, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['ph'], gender: 'male' },
  { key: 'batik', name: 'Hand-Drawn Batik Shirt', emoji: '👕', base: 70, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['id', 'my', 'sg'] },
  { key: 'elephant', name: 'Elephant-Print Pants', emoji: '🐘', base: 10, basis: 'local', keep: 0.1, use: 'wear', tier: 2, only: ['th'] },
  { key: 'deel', name: 'Wool-Lined Deel Robe', emoji: '🧥', base: 160, basis: 'local', keep: 0.4, use: 'wear', tier: 3, only: ['mn'] },
  { key: 'chapan', name: 'Embroidered Chapan Robe', emoji: '🧥', base: 180, basis: 'local', keep: 0.4, use: 'wear', tier: 3, only: ['kz', 'af'] },
  { key: 'lavalava', name: 'Patterned Lavalava', emoji: '🌺', base: 25, basis: 'local', keep: 0.25, use: 'wear', tier: 2, only: ['ws'] },
  { key: 'stockman', name: "Stockman's Hat & Sheepskin Boots", emoji: '🤠', base: 260, basis: 'local', keep: 0.35, use: 'wear', tier: 3, only: ['au', 'nz'] },
  { key: 'merino', name: 'Merino Wool Jumper', emoji: '🧶', base: 160, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['nz', 'au'] },
  { key: 'flannel', name: 'Plaid Flannel Jacket & Toque', emoji: '🧥', base: 110, basis: 'local', keep: 0.3, use: 'wear', tier: 3, only: ['ca'] },
  { key: 'football', name: 'National Team Football Jersey', emoji: '⚽', base: 90, basis: 'traded', keep: 0.3, use: 'wear', tier: 3, only: ['br', 'ar', 'uy', 'mx', 'co', 'ng', 'it', 'es', 'pt', 'nl', 'hr', 'ma', 'eg', 'de', 'fr', 'gb'] },
]

// ---------------------------------------------------------------------------
// Toy Store

export const TOYS: ItemDef[] = [
  { key: 'teddy', name: 'Teddy Bear', emoji: '🧸', base: 25, basis: 'local', keep: 0.2, use: 'play', minAge: 2, kidsUpTo: 8 },
  { key: 'dinos', name: 'Roaring Dinosaur Set', emoji: '🦖', base: 30, basis: 'traded', keep: 0.2, use: 'play', minAge: 3, kidsUpTo: 9 },
  { key: 'train', name: 'Wooden Train Set', emoji: '🚂', base: 60, basis: 'local', keep: 0.3, use: 'play', minAge: 2, kidsUpTo: 7 },
  { key: 'kitchen', name: 'Play Kitchen', emoji: '🍳', base: 120, basis: 'traded', keep: 0.3, use: 'play', minAge: 3, kidsUpTo: 7 },
  { key: 'dollhouse', name: 'Three-Story Dollhouse', emoji: '🏠', base: 150, basis: 'traded', keep: 0.3, use: 'play', minAge: 3, kidsUpTo: 10 },
  { key: 'unicorn', name: 'Giant Plush Unicorn', emoji: '🦄', base: 30, basis: 'local', keep: 0.2, use: 'play', minAge: 2, kidsUpTo: 10 },
  { key: 'bricks', name: 'Building Brick Set', emoji: '🧱', base: 60, basis: 'traded', keep: 0.4, use: 'build', minAge: 5, kidsUpTo: 14 },
  { key: 'castle', name: 'Giant Brick Castle Set (4,000 pieces)', emoji: '🏰', base: 280, basis: 'traded', keep: 0.5, use: 'build', minAge: 8 },
  { key: 'rccar', name: 'Remote-Control Monster Truck', emoji: '🏎️', base: 80, basis: 'traded', keep: 0.25, use: 'play', minAge: 6, kidsUpTo: 14 },
  { key: 'drone', name: 'Mini Toy Drone', emoji: '🛸', base: 90, basis: 'tech', keep: 0.25, use: 'play', minAge: 9, kidsUpTo: 16 },
  { key: 'figure', name: 'Superhero Action Figure', emoji: '🦸', base: 20, basis: 'traded', keep: 0.25, use: 'play', minAge: 4, kidsUpTo: 12 },
  { key: 'boardgame', name: 'Family Board Game', emoji: '🎲', base: 40, basis: 'traded', keep: 0.3, use: 'boardgame', minAge: 6 },
  { key: 'puzzle', name: '1,000-Piece Jigsaw Puzzle', emoji: '🧩', base: 25, basis: 'local', keep: 0.1, use: 'puzzle', minAge: 8 },
  { key: 'science', name: 'Volcano Science Kit', emoji: '🌋', base: 50, basis: 'traded', keep: 0.1, use: 'puzzle', minAge: 8, kidsUpTo: 14 },
  { key: 'magic', name: 'Junior Magician Kit', emoji: '🎩', base: 35, basis: 'traded', keep: 0.2, use: 'play', minAge: 7, kidsUpTo: 13 },
  { key: 'blaster', name: 'Super-Soaker Water Blaster', emoji: '🔫', base: 25, basis: 'traded', keep: 0.2, use: 'play', minAge: 5, kidsUpTo: 14 },
  { key: 'kite', name: 'Rainbow Stunt Kite', emoji: '🪁', base: 20, basis: 'local', keep: 0.2, use: 'play', minAge: 5 },
  { key: 'slime', name: 'Glow-in-the-Dark Slime Kit', emoji: '🟢', base: 20, basis: 'traded', keep: 0.05, use: 'play', minAge: 6, kidsUpTo: 12 },
  { key: 'art', name: 'Deluxe Art Set', emoji: '🎨', base: 40, basis: 'local', keep: 0.2, use: 'puzzle', minAge: 4, kidsUpTo: 14 },
  { key: 'cards', name: 'Trading Card Booster Box', emoji: '🃏', base: 120, basis: 'traded', keep: 0.6, use: 'cards', minAge: 8 },
  { key: 'yoyo', name: 'Light-Up Yo-Yo', emoji: '🪀', base: 10, basis: 'local', keep: 0.2, use: 'play', minAge: 6, kidsUpTo: 13 },
  { key: 'handheld', name: 'Handheld Game Console', emoji: '🎮', base: 220, basis: 'tech', keep: 0.5, use: 'play', minAge: 8, category: 'electronics' },
  { key: 'console', name: 'Home Game Console', emoji: '🕹️', base: 500, basis: 'tech', keep: 0.6, use: 'play', minAge: 11, category: 'electronics' },
  { key: 'kendama', name: 'Wooden Kendama', emoji: '🎯', base: 15, basis: 'local', keep: 0.3, use: 'play', minAge: 6, only: ['jp'] },
  { key: 'daruma', name: 'Daruma Wishing Doll', emoji: '🔴', base: 20, basis: 'local', keep: 0.3, use: 'play', minAge: 4, only: ['jp'] },
  { key: 'diabolo', name: 'Chinese Yo-Yo (Diabolo)', emoji: '🪀', base: 15, basis: 'local', keep: 0.3, use: 'play', minAge: 6, only: ['cn', 'tw', 'hk', 'sg'] },
  { key: 'carrom', name: 'Carrom Board', emoji: '🎯', base: 40, basis: 'local', keep: 0.4, use: 'boardgame', minAge: 6, only: ['in', 'pk', 'bd', 'np'] },
  { key: 'lattu', name: 'Wooden Spinning Top', emoji: '🌀', base: 5, basis: 'local', keep: 0.3, use: 'play', minAge: 5, only: ['in', 'pk', 'bd', 'np', 'ph', 'id', 'my'] },
  { key: 'pinata', name: 'Donkey Piñata', emoji: '🪅', base: 30, basis: 'local', keep: 0, use: 'play', minAge: 3, only: ['mx', 'gt', 'sv', 'ni', 'co', 've', 'pe', 'cu', 'do', 'pr', 'us'] },
  { key: 'balero', name: 'Wooden Balero Cup-and-Ball', emoji: '🎯', base: 8, basis: 'local', keep: 0.3, use: 'play', minAge: 5, only: ['mx', 'ar', 'co', 'cl'] },
  { key: 'matryoshka', name: 'Nesting Dolls', emoji: '🪆', base: 35, basis: 'local', keep: 0.4, use: 'play', minAge: 3, only: ['ru', 'ua', 'kz'] },
  { key: 'mancala', name: 'Carved Mancala Board', emoji: '🎲', base: 30, basis: 'local', keep: 0.4, use: 'boardgame', minAge: 5, only: ['ng', 'ke', 'et', 'ug', 'zw', 'cd', 'ao', 'za'] },
  { key: 'backgammon', name: 'Inlaid Backgammon Set', emoji: '🎲', base: 80, basis: 'local', keep: 0.5, use: 'boardgame', minAge: 8, only: ['tr', 'lb', 'sy', 'jo', 'eg', 'ir', 'iq', 'gr', 'il', 'ge'] },
  { key: 'gonggi', name: 'Gonggi Jack Stones', emoji: '🪨', base: 5, basis: 'local', keep: 0.3, use: 'play', minAge: 5, only: ['kr'] },
]

// ---------------------------------------------------------------------------
// Garden & Hardware

export const GARDEN: ItemDef[] = [
  { key: 'toolkit', name: '200-Piece Tool Kit', emoji: '🧰', base: 120, basis: 'local', keep: 0.4, use: 'fix', minAge: 16 },
  { key: 'drill', name: 'Cordless Power Drill Set', emoji: '🪛', base: 180, basis: 'traded', keep: 0.4, use: 'fix', minAge: 16, used: true },
  { key: 'washer', name: 'Pressure Washer', emoji: '💦', base: 250, basis: 'traded', keep: 0.4, use: 'fix', needs: 'house' },
  { key: 'grill', name: 'Gas BBQ Grill', emoji: '🍖', base: 450, basis: 'traded', keep: 0.35, use: 'bbq', needs: 'home', used: true },
  { key: 'smoker', name: 'Wood-Fired Meat Smoker', emoji: '🔥', base: 650, basis: 'traded', keep: 0.4, use: 'bbq', needs: 'house' },
  { key: 'firepit', name: 'Backyard Fire Pit', emoji: '🔥', base: 250, basis: 'local', keep: 0.3, use: 'fire', needs: 'house' },
  { key: 'mower', name: 'Push Lawn Mower', emoji: '🌱', base: 350, basis: 'traded', keep: 0.35, use: 'mow', needs: 'house', used: true },
  { key: 'rider', name: 'Riding Lawn Mower', emoji: '🚜', base: 2_800, basis: 'traded', keep: 0.5, use: 'mow', needs: 'house', used: true },
  { key: 'snowblower', name: 'Snow Blower', emoji: '❄️', base: 900, basis: 'traded', keep: 0.45, use: 'mow', needs: 'house', only: SNOW_BLOWER },
  { key: 'hottub', name: 'Six-Person Hot Tub', emoji: '♨️', base: 7_500, basis: 'traded', keep: 0.35, use: 'soak', needs: 'house', upkeep: 450 },
  { key: 'solar', name: 'Rooftop Solar Panel Kit', emoji: '☀️', base: 14_000, basis: 'tech', keep: 0.4, needs: 'house', solar: true, note: 'Cuts your power bills every year' },
  { key: 'gnome', name: 'Garden Gnome', emoji: '🧙', base: 40, basis: 'local', keep: 0.5, needs: 'house', note: 'Watches. Judges.' },
  { key: 'greenhouse', name: 'Backyard Greenhouse', emoji: '🪴', base: 1_800, basis: 'local', keep: 0.35, use: 'plants', needs: 'house' },
  { key: 'patio', name: 'Teak Patio Furniture Set', emoji: '🪑', base: 1_200, basis: 'local', keep: 0.35, use: 'relax', needs: 'home', used: true },
]

// ---------------------------------------------------------------------------
// Pet Supplies

export type PetGroup = 'dog' | 'cat' | 'small' | 'fish' | 'bird' | 'reptile' | 'horse' | 'farm' | 'bigcat' | 'primate' | 'other'

export function petGroup(species: string | undefined): PetGroup {
  switch (species) {
    case 'Dog':
    case 'Wolf':
    case 'Fox':
      return 'dog'
    case 'Cat':
      return 'cat'
    case 'Rabbit':
    case 'Guinea Pig':
    case 'Hamster':
    case 'Ferret':
      return 'small'
    case 'Fish':
      return 'fish'
    case 'Bird':
    case 'Parrot':
      return 'bird'
    case 'Turtle':
    case 'Lizard':
    case 'Snake':
      return 'reptile'
    case 'Horse':
      return 'horse'
    case 'Goat':
    case 'Pig':
      return 'farm'
    case 'Tiger':
    case 'Lion':
      return 'bigcat'
    case 'Monkey':
    case 'Gorilla':
      return 'primate'
    default:
      return 'other'
  }
}

export interface PetItemDef extends ItemDef {
  groups: readonly PetGroup[]
  /** A one-year supply: no asset, just a healthier, happier pet next year. */
  consumable?: boolean
  /** GPS collar: the pet is easier to find if it runs off. */
  gps?: boolean
}

export const PET_SUPPLIES: PetItemDef[] = [
  { key: 'dogbed', name: 'Orthopedic Dog Bed', emoji: '🛏️', base: 120, basis: 'traded', keep: 0.2, groups: ['dog'] },
  { key: 'chew', name: 'Indestructible Chew Toy Bundle', emoji: '🦴', base: 35, basis: 'traded', keep: 0, groups: ['dog'], consumable: true },
  { key: 'dogfood', name: 'Premium Dog Food (1-Year Supply)', emoji: '🥩', base: 700, basis: 'food', keep: 0, groups: ['dog'], consumable: true },
  { key: 'raincoat', name: 'Dog Raincoat & Booties', emoji: '🧥', base: 45, basis: 'local', keep: 0.1, groups: ['dog'] },
  { key: 'agility', name: 'Backyard Agility Course', emoji: '🏁', base: 160, basis: 'traded', keep: 0.25, groups: ['dog'] },
  { key: 'gps', name: 'GPS Tracking Collar', emoji: '📡', base: 150, basis: 'tech', keep: 0.2, groups: ['dog', 'cat'], gps: true },
  { key: 'groom', name: 'Grooming Kit', emoji: '✂️', base: 60, basis: 'traded', keep: 0.2, groups: ['dog', 'cat', 'small', 'horse', 'farm'] },
  { key: 'cattree', name: 'Five-Level Cat Tree', emoji: '🌳', base: 150, basis: 'traded', keep: 0.2, groups: ['cat'] },
  { key: 'scratch', name: 'Sisal Scratching Post', emoji: '🪵', base: 40, basis: 'local', keep: 0.1, groups: ['cat'], note: 'Your sofa thanks you' },
  { key: 'litter', name: 'Self-Cleaning Litter Box', emoji: '🚽', base: 450, basis: 'tech', keep: 0.3, groups: ['cat'] },
  { key: 'laser', name: 'Laser Pointer', emoji: '🔴', base: 15, basis: 'traded', keep: 0.2, groups: ['cat'] },
  { key: 'catfood', name: 'Gourmet Cat Food (1-Year Supply)', emoji: '🐟', base: 500, basis: 'food', keep: 0, groups: ['cat'], consumable: true },
  { key: 'hammockcat', name: 'Window Perch Hammock', emoji: '🪟', base: 45, basis: 'traded', keep: 0.1, groups: ['cat'] },
  { key: 'hutch', name: 'Deluxe Two-Story Hutch', emoji: '🏡', base: 180, basis: 'traded', keep: 0.3, groups: ['small'] },
  { key: 'wheel', name: 'Silent Exercise Wheel', emoji: '🎡', base: 30, basis: 'traded', keep: 0.2, groups: ['small'] },
  { key: 'pellets', name: 'Premium Pellets & Hay (1-Year Supply)', emoji: '🥕', base: 180, basis: 'food', keep: 0, groups: ['small'], consumable: true },
  { key: 'tank', name: 'Aquarium Upgrade (Bigger Tank)', emoji: '🐠', base: 300, basis: 'tech', keep: 0.3, groups: ['fish'] },
  { key: 'ship', name: 'Sunken Pirate Ship Ornament', emoji: '🏴‍☠️', base: 25, basis: 'local', keep: 0.2, groups: ['fish'] },
  { key: 'flakes', name: 'Premium Fish Flakes (1-Year Supply)', emoji: '🐟', base: 45, basis: 'food', keep: 0, groups: ['fish'], consumable: true },
  { key: 'cage', name: 'Walk-In Flight Cage', emoji: '🪺', base: 280, basis: 'traded', keep: 0.3, groups: ['bird'] },
  { key: 'birdtoys', name: 'Mirror, Bell & Swing Toy Set', emoji: '🔔', base: 30, basis: 'traded', keep: 0.1, groups: ['bird'] },
  { key: 'seed', name: 'Premium Seed & Fruit Mix (1-Year Supply)', emoji: '🌻', base: 180, basis: 'food', keep: 0, groups: ['bird'], consumable: true },
  { key: 'terrarium', name: 'Heated Glass Terrarium', emoji: '🦎', base: 350, basis: 'tech', keep: 0.35, groups: ['reptile'] },
  { key: 'uvlamp', name: 'UV Basking Lamp', emoji: '💡', base: 60, basis: 'tech', keep: 0.2, groups: ['reptile'] },
  { key: 'reptilefood', name: 'Premium Reptile Food (1-Year Supply)', emoji: '🦗', base: 220, basis: 'food', keep: 0, groups: ['reptile'], consumable: true },
  { key: 'saddle', name: 'Hand-Stitched Leather Saddle', emoji: '🐎', base: 1_600, basis: 'traded', keep: 0.5, groups: ['horse'] },
  { key: 'blanket', name: 'Quilted Horse Blanket', emoji: '🧣', base: 150, basis: 'traded', keep: 0.25, groups: ['horse'] },
  { key: 'hay', name: 'Premium Hay & Feed (1-Year Supply)', emoji: '🌾', base: 2_400, basis: 'food', keep: 0, groups: ['horse'], consumable: true },
  { key: 'pen', name: 'Pen & Shelter Upgrade', emoji: '🏚️', base: 400, basis: 'local', keep: 0.3, groups: ['farm'] },
  { key: 'farmfeed', name: 'Premium Feed (1-Year Supply)', emoji: '🌽', base: 500, basis: 'food', keep: 0, groups: ['farm'], consumable: true },
  { key: 'brush', name: 'Back-Scratching Brush', emoji: '🪮', base: 20, basis: 'local', keep: 0.1, groups: ['farm'] },
  { key: 'bigball', name: 'Giant Enrichment Ball', emoji: '⚪', base: 450, basis: 'traded', keep: 0.2, groups: ['bigcat'] },
  { key: 'meat', name: 'Raw Meat Delivery (1-Year Supply)', emoji: '🥩', base: 9_000, basis: 'food', keep: 0, groups: ['bigcat'], consumable: true },
  { key: 'enclosure', name: 'Reinforced Enclosure Upgrade', emoji: '🚧', base: 15_000, basis: 'local', keep: 0.4, groups: ['bigcat'], note: 'The neighbors asked nicely' },
  { key: 'climbgym', name: 'Rope Climbing Gym', emoji: '🧗', base: 1_200, basis: 'traded', keep: 0.3, groups: ['primate'] },
  { key: 'feeder', name: 'Puzzle Feeder', emoji: '🧩', base: 80, basis: 'traded', keep: 0.2, groups: ['primate', 'bird', 'dog'] },
  { key: 'fruit', name: 'Fresh Fruit Delivery (1-Year Supply)', emoji: '🍌', base: 1_500, basis: 'food', keep: 0, groups: ['primate'], consumable: true },
  { key: 'petbed', name: 'Cozy Pet Bed', emoji: '🛏️', base: 60, basis: 'traded', keep: 0.2, groups: ['other', 'small', 'farm'] },
  { key: 'treats', name: 'Gourmet Treats (1-Year Supply)', emoji: '🍪', base: 120, basis: 'food', keep: 0, groups: ['other', 'dog', 'cat', 'small', 'horse', 'farm'], consumable: true },
]
