// Search words for menu rows (G.9), as data. A row keeps its own `keywords` when it has them; this table adds the words a
// player would type for the ones that do not, keyed by the row's id, so the menus that build the rows stay untouched.
// Plain data, no imports: the search index (R1-N4) reads it through keywordsOf.
//
// Rules for a row: lowercase ASCII, each word at most 24 characters, no duplicate inside the row. test/nav-people.test.ts
// checks the rules, and checks that every key is a real node id in the canned states (a typo here would never match).
// A key can name a row that exists only some of the time (military, royal.court, corruption, workshop, inv-penny,
// inv-crypto, thisYear); the test lists those by hand.

const ROWS: Record<string, readonly string[]> = {
  investments: ['invest', 'portfolio', 'shares', 'funds', 'etf'],
  'inv-stocks': ['buy a stock', 'buy stocks', 'shares', 'equities', 'stock market', 'trade'],
  'inv-penny': ['penny', 'speculate'],
  'inv-crypto': ['bitcoin', 'coins', 'crypto'],
  'inv-bonds': ['bonds', 'savings', 'interest', 'deposit'],
  businesses: ['company', 'companies', 'business', 'ceo', 'firm'],
  'biz.start': ['found', 'startup', 'open a shop', 'new company'],
  'biz.buy': ['acquire', 'buy company'],
  banking: ['loan', 'loans', 'mortgage', 'credit', 'debt', 'borrow', 'bank'],
  realEstate: ['house', 'home', 'property', 'buy a house', 'apartment', 'land'],
  rentals: ['rent', 'apartment', 'landlord', 'lease'],
  carDealers: ['car', 'vehicle', 'buy a car', 'auto'],
  specialtyVehicles: ['boat', 'plane', 'yacht', 'jet', 'motorcycle'],
  jewelers: ['ring', 'diamond', 'watch', 'jewelry'],
  collectibles: ['art', 'paintings', 'antiques', 'auction'],
  electronicsStore: ['phone', 'laptop', 'gadgets'],
  'money-team': ['advisor', 'accountant', 'wealth manager'],
  'occupation.jobs': ['job', 'work', 'apply', 'career'],
  'occupation.parttime': ['part time', 'side job'],
  'occupation.freelance': ['gig', 'freelance', 'odd jobs'],
  'occupation.recruiter': ['headhunter', 'recruit'],
  'cv.menu': ['resume', 'history', 'cv'],
  military: ['army', 'navy', 'enlist', 'soldier'],
  specialCareers: ['actor', 'musician', 'astronaut', 'politician', 'athlete'],
  doctor: ['health', 'sick', 'hospital', 'medicine', 'checkup', 'therapy'],
  mindBody: ['gym', 'exercise', 'meditate', 'yoga', 'diet', 'workout'],
  love: ['date', 'marry', 'marriage', 'dating', 'wedding', 'divorce', 'propose'],
  adoption: ['adopt', 'child', 'baby'],
  pets: ['dog', 'cat', 'pet'],
  nightlife: ['party', 'club', 'bar', 'drink'],
  casino: ['gamble', 'slots', 'blackjack', 'poker', 'roulette'],
  lottery: ['lotto', 'scratch', 'jackpot'],
  sweepstakes: ['contest', 'giveaway'],
  crime: ['steal', 'rob', 'burglary', 'heist', 'illegal'],
  lawsuit: ['sue', 'court', 'lawyer', 'legal'],
  surrender: ['police', 'confess', 'arrest'],
  vacation: ['holiday', 'trip', 'travel', 'cruise', 'resort'],
  emigrate: ['move abroad', 'immigrate', 'visa', 'citizenship'],
  licenses: ['driver', 'driving', 'permit', 'pilot'],
  fame: ['celebrity', 'paparazzi'],
  socialMedia: ['followers', 'instagram', 'post', 'influencer', 'viral'],
  movies: ['cinema', 'film', 'theater'],
  computer: ['code', 'coding', 'program', 'app', 'software'],
  workshop: ['invent', 'patent', 'inventor'],
  will: ['inherit', 'estate', 'heir', 'testament'],
  identity: ['name change', 'alias'],
  surgery: ['plastic surgery', 'cosmetic', 'botox'],
  rehab: ['addiction', 'sober', 'detox'],
  salon: ['spa', 'haircut', 'massage'],
  pray: ['church', 'religion', 'faith', 'temple'],
  charity: ['donate', 'volunteer'],
  economy: ['inflation', 'unemployment', 'interest rates'],
  thisYear: ['news', 'headlines'],
  'royal.court': ['royal', 'palace', 'crown'],
  lifePriorities: ['routine', 'stress', 'balance'],
  shopping: ['shop', 'store', 'mall'],
  pastimes: ['hang out', 'hobby'],
  zoo: ['animals'],
  corruption: ['bribe', 'backroom'],
  'shared.projects': ['mentor', 'collaborate'],
}

/**
 * Row id to its search words. Frozen all the way down, and with no prototype, so `KEYWORDS['constructor']` is undefined
 * and nothing a consumer does can change what search finds.
 */
export const KEYWORDS: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.assign(
    Object.create(null) as Record<string, readonly string[]>,
    Object.fromEntries(Object.entries(ROWS).map(([id, words]) => [id, Object.freeze([...words])])),
  ),
)

/**
 * The words that find a node: its own `keywords` first, then the table row for its id. Lowercase, trimmed, de-duplicated
 * (the first spelling's place wins). Anything that is not a non-empty string is skipped. A fresh array every call.
 */
export function keywordsOf(node: { id: string; keywords?: readonly string[] }): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (raw: unknown): void => {
    if (typeof raw !== 'string') return
    const word = raw.trim().toLowerCase()
    if (word === '' || seen.has(word)) return
    seen.add(word)
    out.push(word)
  }
  if (Array.isArray(node.keywords)) for (const word of node.keywords) add(word)
  const row = typeof node.id === 'string' && Object.hasOwn(KEYWORDS, node.id) ? KEYWORDS[node.id] : undefined
  if (row) for (const word of row) add(word)
  return out
}
