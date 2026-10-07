// How the investment world looked in each era: a 1925 "tech" company is a tabulating-machine
// maker, a 1985 e-commerce slot is a mail-order catalog, 1999's penny stocks are dot-coms, the
// S&P 500 was the Dow before 1957, index funds only arrive in 1976 and REITs in 1960, and
// brokers charged fixed commissions until the mid-1970s.
//
// Pure data and functions of (sector/country, year). From PRESENT_YEAR on (and for the modern
// era of each sector) everything returns the modern identity unchanged, so the present plays
// exactly as before. invest/engine.ts eraIdentity() applies these to listed companies.
import { PRESENT_YEAR } from '../history/timeline'
import { getCountry } from '../world'
import type { SectorId } from './engine'

export interface EraSector {
  /** Last year this stand-in applies (the next entry, or the modern sector, takes over after). */
  until: number
  label: string
  emoji: string
  /** Name patterns ({w} = the company's local word); omitted = keep the modern name. */
  names?: readonly string[]
  blurbs: readonly string[]
  /** The sector whose real history this stand-in follows (default: its own). */
  as?: SectorId
}

/** Period stand-ins for sectors that didn't exist yet (oldest first). */
export const ERA_SECTORS: Partial<Record<SectorId, readonly EraSector[]>> = {
  tech: [
    { until: 1949, label: 'Office Machines', emoji: '🗄️', names: ['{w} Business Machines', '{w} Tabulating', '{w} Typewriter', '{w} Calculating Machines'], blurbs: ['Sells punch-card tabulators to governments and railroads.', 'Makes typewriters, adding machines and a great deal of office noise.'], as: 'industrials' },
    { until: 1979, label: 'Computers', emoji: '🖥️', names: ['{w} Computers', '{w} Data Systems', '{w} Business Machines', '{w} Computing'], blurbs: ['Leases room-sized mainframes to banks and airlines.', 'Its computers fill a room and need their own air conditioning.'] },
    { until: 1994, label: 'Computers & Software', emoji: '💾', blurbs: ['Sells personal computers with a whole 640K of memory.', 'Its software comes on a stack of floppy disks and a very thick manual.'] },
    { until: 2015, label: 'Technology', emoji: '💻', blurbs: ['Sells software and servers to every company going online.', 'Its share price assumes everyone will need its software. Everyone might.'] },
  ],
  games: [
    { until: 1971, label: 'Toys & Games', emoji: '🧸', names: ['{w} Toys', '{w} Playthings', '{w} Games'], blurbs: ['Board games, model trains and a yo-yo craze every few years.', 'Makes the toy every child wants this Christmas, and none of them want by Easter.'], as: 'leisure' },
    { until: 1994, label: 'Video Games', emoji: '🕹️', blurbs: ['Makes arcade cabinets and home consoles that plug into the TV.', 'Its cartridge games sell by the million, and so does the next console.'] },
    { until: 2009, label: 'Video Games', emoji: '🎮', blurbs: ['One hit franchise, eleven sequels and a very loyal fan club.', 'Its next game is delayed, which is somehow good news.'] },
  ],
  ecommerce: [
    { until: 1994, label: 'Mail-Order Retail', emoji: '📬', names: ['{w} Mail Order', '{w} Catalog Company', '{w} Department Stores'], blurbs: ['Its thick catalog sells everything from socks to garden sheds.', 'Order by mail, wait six weeks, wonder if it was worth it.'], as: 'supermarkets' },
    { until: 2005, label: 'Internet Retail', emoji: '🌐', names: ['{w}.com', '{w} Online', '{w} Web Store'], blurbs: ['Sells books on the World Wide Web and loses money on every one.', 'A website, a warehouse and a sock-puppet mascot.'] },
  ],
  semis: [
    { until: 1957, label: 'Radio Valves', emoji: '📻', names: ['{w} Radio', '{w} Valve Company', '{w} Wireless'], blurbs: ['Makes the glowing vacuum tubes inside every radio set.', 'Its valves warm up slowly and burn out quickly. Business is good.'], as: 'electronics' },
    { until: 1994, label: 'Semiconductors', emoji: '💾', blurbs: ['Makes the memory chips inside calculators and computers.', 'Every chip cycle wrecks its share price; every boom makes up for it.'] },
  ],
  ai: [
    { until: 1949, label: 'Calculating Machines', emoji: '🧮', names: ['{w} Calculating Machines', '{w} Adding Machines', '{w} Cash Register'], blurbs: ['Makes cash registers and mechanical calculators for shops and banks.', 'Its adding machines are the fastest in the land, at four sums a minute.'], as: 'industrials' },
    { until: 2011, label: 'Computing', emoji: '🖥️', names: ['{w} Computing', '{w} Data Processing', '{w} Information Systems'], blurbs: ['Runs payrolls and databases for big companies.', 'Sells the software that keeps banks and airlines ticking.'], as: 'tech' },
  ],
  robotics: [
    { until: 1960, label: 'Machine Tools', emoji: '⚙️', names: ['{w} Machine Tools', '{w} Tool Works', '{w} Lathe Company'], blurbs: ['Builds the lathes and presses that factories run on.', 'Every factory needs its machines, until the next recession.'], as: 'industrials' },
    { until: 1999, label: 'Industrial Automation', emoji: '🦾', names: ['{w} Automation', '{w} Robotics'], blurbs: ['Its robot arms weld car bodies on assembly lines.', 'Sells automation to factories that want fewer coffee breaks.'], as: 'industrials' },
  ],
  biotech: [
    { until: 1979, label: 'Chemicals', emoji: '🧪', names: ['{w} Chemical', '{w} Laboratories', '{w} Dyes & Chemicals'], blurbs: ['Makes dyes, fertilizers and the odd miracle plastic.', 'Its laboratories turn coal tar into things you can sell.'], as: 'pharma' },
  ],
  space: [
    { until: 1956, label: 'Aircraft', emoji: '✈️', names: ['{w} Aircraft', '{w} Aviation', '{w} Aero Works'], blurbs: ['Builds aeroplanes for the air force and the mail service.', 'Its new airliner seats twenty people, and usually all of them arrive.'], as: 'industrials' },
    { until: 2007, label: 'Aerospace & Defence', emoji: '🛰️', names: ['{w} Aerospace', '{w} Defence Systems'], blurbs: ['Builds satellites and missiles for the government.', 'Lives on defence contracts and the occasional space mission.'], as: 'industrials' },
  ],
  ev: [
    { until: 2007, label: 'Batteries & Motors', emoji: '🔋', names: ['{w} Batteries', '{w} Electric Motors', '{w} Accumulator'], blurbs: ['Makes car batteries, flashlight batteries and electric motors.', 'Promises the electric car is coming. It has promised this since 1910.'], as: 'electronics' },
  ],
  quantum: [
    { until: 2015, label: 'Scientific Instruments', emoji: '🔬', names: ['{w} Instruments', '{w} Optics', '{w} Scientific'], blurbs: ['Makes microscopes, lab gear and very expensive measuring devices.', 'Sells precision instruments to universities and the military.'], as: 'electronics' },
  ],
  cyber: [
    { until: 1994, label: 'Security Services', emoji: '🔐', names: ['{w} Safe & Lock', '{w} Security', '{w} Alarm Company'], blurbs: ['Makes safes, locks and the alarm bells banks rely on.', 'Guards, vaults and armored cars: security, the physical kind.'], as: 'industrials' },
  ],
  airlines: [
    { until: 1929, label: 'Railways', emoji: '🚂', names: ['{w} Railway', '{w} Railroad', '{w} Rail Lines'], blurbs: ["Runs the trains that carry the nation's freight and passengers.", 'Lays track, carries coal and charges whatever the line will bear.'], as: 'industrials' },
  ],
  telecom: [
    { until: 1984, label: 'Telephone & Telegraph', emoji: '☎️', names: ['{w} Telephone', '{w} Telegraph', '{w} Telephone & Telegraph'], blurbs: ['Runs the telephone exchanges and the operators who connect your calls.', 'A regulated monopoly on talking at a distance.'] },
  ],
  media: [
    { until: 1949, label: 'Newspapers & Radio', emoji: '📰', names: ['{w} Press', '{w} Publishing', '{w} Broadcasting'], blurbs: ['Prints the morning paper and runs a radio station on the side.', 'Sells headlines, advertising and the occasional scoop.'] },
    { until: 2009, label: 'Media & Advertising', emoji: '📺', blurbs: ['Owns TV channels, newspapers and a lot of billboards.', 'Sells your attention to whoever bids highest.'] },
  ],
  entertainment: [
    { until: 1929, label: 'Music Halls & Pictures', emoji: '🎭', names: ['{w} Pictures', '{w} Theatres', '{w} Amusements'], blurbs: ['Runs picture palaces and vaudeville houses.', 'Silent films, live orchestras and very sticky floors.'] },
    { until: 1954, label: 'Entertainment', emoji: '🎬', blurbs: ['Owns movie studios, picture palaces and a stable of stars.', 'Makes talking pictures and sells popcorn at a markup.'] },
  ],
  electronics: [
    { until: 1949, label: 'Electrical Equipment', emoji: '💡', names: ['{w} Electric', '{w} Electrical Works', '{w} Lamp Company'], blurbs: ['Makes light bulbs, dynamos and electric fans.', 'Electrifying the nation one appliance at a time.'] },
    { until: 1999, label: 'Electronics', emoji: '🔌', blurbs: ['Makes radios, televisions and the transistors inside them.', 'Its color TVs are the pride of every living room.'] },
  ],
  automakers: [
    { until: 1909, label: 'Carriages & Motor Cars', emoji: '🚗', names: ['{w} Motor Car', '{w} Carriage Works'], blurbs: ['Builds horseless carriages by hand, a few hundred a year.', 'Half of its customers still want a horse.'] },
    { until: 2009, label: 'Automakers', emoji: '🚗', blurbs: ['Builds sensible cars and one unreasonably fast one for the brochure.', 'Rolls a new car off the assembly line every minute.'] },
  ],
  banks: [{ until: 1994, label: 'Banking', emoji: '🏦', blurbs: ['Lends your savings to people buying houses they can barely afford.', 'Has a marble lobby, a stern manager and a branch on every main street.'] }],
  oil: [{ until: 1999, label: 'Oil & Gas', emoji: '🛢️', blurbs: ['Pumps oil, prints money and owns half the gas stations in the country.', 'Its profits rise and fall with the price of a barrel.'] }],
  supermarkets: [{ until: 1989, label: 'Grocery Stores', emoji: '🛒', blurbs: ['People need groceries in good times and bad, which is the whole pitch.', 'Thin margins, huge volumes and a butcher counter.'] }],
  cosmetics: [{ until: 2004, label: 'Cosmetics', emoji: '💄', blurbs: ['Lipstick, cold cream and an advertising budget bigger than its factory.', 'Sells glamour by the jar.'] }],
  fashion: [{ until: 1999, label: 'Fashion', emoji: '👗', blurbs: ['Two collections a year and a warehouse full of last season.', 'Its logo is worth more than its factories.'] }],
  leisure: [{ until: 1974, label: 'Sports & Leisure', emoji: '🎳', blurbs: ['Sporting goods, bowling alleys and holiday camps.', 'Sells the dream of a healthy hobby.'] }],
}

/** The stand-in a sector wore in `year`, or null for its modern identity. */
export function eraSector(sector: SectorId, year: number): EraSector | null {
  if (!Number.isFinite(year) || year >= PRESENT_YEAR) return null
  for (const e of ERA_SECTORS[sector] ?? []) if (year <= e.until) return e
  return null
}

/** The sector whose real history a company followed in `year` (stand-ins follow their period twin). */
export function historySector(sector: SectorId, year: number): SectorId {
  return eraSector(sector, year)?.as ?? sector
}

// ---------------------------------------------------------------------------
// Penny stocks of each era

export interface EraPennyKind {
  noun: string
  pitch: string
  /** The sector whose real story these tiny companies rode (dot-coms in 1999-2002...). */
  as?: SectorId
}

const PENNY_ERAS: readonly { until: number; kinds: readonly EraPennyKind[] }[] = [
  {
    until: 1929,
    kinds: [
      { noun: 'Gold Mines', pitch: 'Has a map, a mule and a very confident prospector.', as: 'mining' },
      { noun: 'Rubber Plantations', pitch: 'Every motor car needs tyres, and it owns a lot of trees. Somewhere.', as: 'agri' },
      { noun: 'Oil Wells', pitch: "Drilling in a farmer's back pasture. Smells promising.", as: 'oil' },
      { noun: 'Radium Tonics', pitch: "Sells glowing health water. Doctors are 'looking into it'." },
      { noun: 'Flying Machines', pitch: 'Has built an aeroplane. It has flown twice.' },
      { noun: 'Motor Carriages', pitch: 'Builds horseless carriages, one at a time, by hand.', as: 'automakers' },
    ],
  },
  {
    until: 1949,
    kinds: [
      { noun: 'Gold Mines', pitch: 'Has a map, a mule and a very confident prospector.', as: 'mining' },
      { noun: 'Oil Wells', pitch: "Drilling in a farmer's back pasture. Smells promising.", as: 'oil' },
      { noun: 'Electrical Laboratories', pitch: 'Promises moving pictures in every home. Has one working set, in the lab.', as: 'electronics' },
      { noun: 'Synthetic Rubber', pitch: 'Makes tyres out of chemistry. The war department is interested.' },
      { noun: 'Aircraft Parts', pitch: 'Makes propellers in a garage and dreams of a factory.', as: 'industrials' },
      { noun: 'Frozen Foods', pitch: 'Freezes peas. Believes this is the future. Might be right.' },
    ],
  },
  {
    until: 1969,
    kinds: [
      { noun: 'Uranium Mines', pitch: 'Bought a Geiger counter and a lot of desert.', as: 'mining' },
      { noun: 'Electronics', pitch: "Added '-tronics' to its name. The stock tripled.", as: 'electronics' },
      { noun: 'Bowling Alleys', pitch: 'Plans an automatic bowling alley in every town.' },
      { noun: 'Rocket Fuels', pitch: 'Mixes rocket fuel in a barn. The neighbours have complained.' },
      { noun: 'Drive-In Diners', pitch: 'Burgers served on roller skates, coming soon to a highway near you.' },
      { noun: 'Computer Leasing', pitch: 'Rents out mainframes it hasn\'t bought yet.', as: 'tech' },
    ],
  },
  {
    until: 1979,
    kinds: [
      { noun: 'Oil & Gas Exploration', pitch: 'The price of oil just quadrupled and it has a drilling permit. What could go wrong?', as: 'oil' },
      { noun: 'Gold Explorers', pitch: 'Gold is finally allowed to float, and it owns a hole in the ground.', as: 'mining' },
      { noun: 'Pocket Calculators', pitch: 'Its calculator does square roots and costs a month\'s wages.', as: 'electronics' },
      { noun: 'CB Radios', pitch: 'Sells CB radios to truckers and everyone who wants to talk like one, good buddy.', as: 'electronics' },
      { noun: 'Fast Food Franchises', pitch: 'Plans a drive-thru on every corner, starting with the one corner it has.', as: 'food' },
      { noun: 'Solar Panels', pitch: 'The energy crisis made solar power the future. The future is taking a while.' },
    ],
  },
  {
    until: 1989,
    kinds: [
      { noun: 'Oil & Gas Exploration', pitch: 'Oil is $35 a barrel and it has a drilling permit. What could go wrong?', as: 'oil' },
      { noun: 'Gold Explorers', pitch: 'Gold is soaring and it owns a hole in the ground.', as: 'mining' },
      { noun: 'Home Computers', pitch: 'Its computer has 4K of memory and a cassette drive.', as: 'tech' },
      { noun: 'Biotech', pitch: 'Gene-splicing pioneers with one lab, zero revenue and a CEO who is "very excited".', as: 'biotech' },
      { noun: 'Video Rentals', pitch: 'Plans a video rental shop on every corner. Be kind, rewind.' },
      { noun: 'Solar Panels', pitch: 'The energy crisis made solar power the future. The future is taking a while.' },
    ],
  },
  {
    until: 1994,
    kinds: [
      { noun: 'Biotech', pitch: 'One drug candidate, zero revenue and a CEO who is "very excited".', as: 'biotech' },
      { noun: 'Gold Explorers', pitch: 'Has been about to strike gold since the gold rush.', as: 'mining' },
      { noun: 'Cellular Phones', pitch: 'Sells car phones the size of a brick. Executives love them.', as: 'telecom' },
      { noun: 'CD-ROM Multimedia', pitch: 'Puts a whole encyclopedia on a shiny disc. The future of learning, apparently.', as: 'tech' },
      { noun: 'Video Game Cartridges', pitch: 'One hit game, a mascot with attitude and a sequel promised for Christmas.', as: 'games' },
      { noun: 'Virtual Reality', pitch: 'Its headset makes you feel slightly sick in three whole dimensions.', as: 'electronics' },
    ],
  },
  {
    until: 2008,
    kinds: [
      { noun: 'Dot-Com', pitch: 'A website, a sock-puppet mascot and no revenue.', as: 'ecommerce' },
      { noun: 'Biotech', pitch: 'One drug candidate, zero revenue and a CEO who is "very excited".', as: 'biotech' },
      { noun: 'Internet Telephony', pitch: 'Free phone calls over the internet, once the dial-up connects.', as: 'telecom' },
      { noun: 'Gold Explorers', pitch: 'Has been about to strike gold for years.', as: 'mining' },
      { noun: 'Fuel Cells', pitch: 'Promises hydrogen cars by next year, definitely.' },
      { noun: 'Online Pet Supplies', pitch: 'Ships 40-pound bags of dog food for free. Losing money on every bag.', as: 'ecommerce' },
    ],
  },
]

/** The penny-stock kind a listing had in `year` (null in the modern era: use its own). */
export function eraPennyKind(year: number, index: number): EraPennyKind | null {
  if (!Number.isFinite(year) || year >= PRESENT_YEAR) return null
  for (const e of PENNY_ERAS) if (year <= e.until) return e.kinds[Math.abs(Math.round(index)) % e.kinds.length]
  return null
}

/** The sectors today's penny-stock themes ride in real history (for the years before PRESENT_YEAR). */
export const MODERN_PENNY_SECTOR: Readonly<Record<string, SectorId>> = {
  'Lithium Ventures': 'mining', Biotech: 'biotech', 'Gold Explorers': 'mining', 'AI Labs': 'ai', 'Rare Earths': 'mining',
  'Quantum Holdings': 'quantum', 'Space Mining': 'space', Hydrogen: 'ev', 'Drone Delivery': 'robotics',
}

/** Modern penny kinds that only make sense from a certain year (else the 2000s list stands in). */
export const MODERN_PENNY_SINCE: Readonly<Record<string, number>> = {
  'Blockchain Solutions': 2017, 'AI Labs': 2016, 'Drone Delivery': 2013, Graphene: 2010, 'Quantum Holdings': 2018,
  'Vertical Farms': 2012, 'Space Mining': 2012, 'Lithium Ventures': 2009, 'Rare Earths': 2010, Hydrogen: 2009,
}

/** The 2000s penny kinds, for modern listings whose theme hadn't arrived yet. */
export function lateEraPennyKind(index: number): EraPennyKind {
  const kinds = PENNY_ERAS[PENNY_ERAS.length - 1].kinds
  return kinds[Math.abs(Math.round(index)) % kinds.length]
}

// ---------------------------------------------------------------------------
// Index and exchange names

const INDEX_ERAS: Readonly<Record<string, readonly { until: number; name: string }[]>> = {
  us: [{ until: 1956, name: 'Dow Jones Industrial Average' }],
  gb: [{ until: 1934, name: 'London share index' }, { until: 1983, name: 'FT 30' }],
  de: [{ until: 1987, name: 'Frankfurt share index' }],
  fr: [{ until: 1987, name: 'CAC General' }],
  jp: [{ until: 1949, name: 'Tokyo share index' }],
  hk: [{ until: 1968, name: 'Hong Kong share index' }],
  kr: [{ until: 1982, name: 'Korea Composite Index' }],
  cn: [{ until: 1949, name: 'Shanghai share index' }],
  in: [{ until: 1978, name: 'Bombay share index' }],
  ca: [{ until: 2001, name: 'TSE 300' }],
  au: [{ until: 1999, name: 'All Ordinaries' }],
  br: [{ until: 1967, name: 'Rio de Janeiro share index' }],
  mx: [{ until: 1977, name: 'Mexico share index' }, { until: 2016, name: 'IPC' }],
  ru: [{ until: 1917, name: 'St. Petersburg share index' }, { until: 2011, name: 'RTS Index' }],
  ar: [{ until: 1988, name: 'Buenos Aires share index' }, { until: 2016, name: 'Merval' }],
  tr: [{ until: 2012, name: 'ISE National 100' }],
  es: [{ until: 1991, name: 'Madrid General Index' }],
  it: [{ until: 2003, name: 'MIB' }],
  nl: [{ until: 1982, name: 'Amsterdam share index' }],
  se: [{ until: 1985, name: 'Stockholm share index' }],
  ch: [{ until: 1987, name: 'Swiss share index' }],
}

/** The name of the market's headline index in `year` ('Dow Jones Industrial Average' in 1929...). */
export function indexNameFor(home: string, year: number, modern: string): string {
  if (!Number.isFinite(year) || year >= PRESENT_YEAR) return modern
  for (const e of INDEX_ERAS[home] ?? []) if (year <= e.until) return e.name
  // Most modern index brands date from the 1990s: older years get a plain name.
  if (!INDEX_ERAS[home] && year < 1990 && home !== 'tw' && home !== 'za') return `${getCountry(home).name} share index`
  return modern
}

const EXCHANGE_ERAS: Readonly<Record<string, readonly { until: number; name: string }[]>> = {
  fr: [{ until: 1999, name: 'Paris Bourse' }],
  nl: [{ until: 1999, name: 'Amsterdam Stock Exchange' }],
  be: [{ until: 1999, name: 'Brussels Stock Exchange' }],
  pt: [{ until: 2001, name: 'Lisbon Stock Exchange' }],
  br: [{ until: 2007, name: 'São Paulo Stock Exchange' }, { until: 2016, name: 'BM&FBovespa' }],
  ar: [{ until: 2016, name: 'Buenos Aires Stock Exchange' }],
  ru: [{ until: 1917, name: 'St. Petersburg Stock Exchange' }, { until: 2010, name: 'Russian Trading System' }],
  hk: [{ until: 1999, name: 'Hong Kong Stock Exchange' }],
  sg: [{ until: 1972, name: 'Malayan Stock Exchange' }, { until: 1998, name: 'Stock Exchange of Singapore' }],
  kr: [{ until: 2004, name: 'Korea Stock Exchange' }],
  au: [{ until: 1986, name: 'Sydney Stock Exchange' }],
}

/** The exchange's name in `year` ('Paris Bourse' before Euronext...). */
export function exchangeNameFor(home: string, year: number, modern: string): string {
  if (!Number.isFinite(year) || year >= PRESENT_YEAR) return modern
  for (const e of EXCHANGE_ERAS[home] ?? []) if (year <= e.until) return e.name
  return modern
}

// ---------------------------------------------------------------------------
// Products and costs of each era

/** The first index fund a country's investors could buy (before: an expensive investment trust). */
export function indexFundSince(home: string): number {
  if (home === 'us') return 1976
  const w = getCountry(home).wealth ?? 0.5
  return w >= 0.8 ? 1986 : 2000
}

/** Yearly fee of the old investment trusts that came before index funds. */
export const TRUST_FEE = 0.0125

const REIT_SINCE: Readonly<Record<string, number>> = {
  us: 1960, nl: 1969, au: 1971, br: 1993, ca: 1993, be: 1995, jp: 2001, kr: 2001, sg: 2002, fr: 2003, hk: 2005, gb: 2007,
  de: 2007, it: 2007, es: 2009, mx: 2011, za: 2013, in: 2019, my: 2005, th: 2003, tr: 1999, nz: 1990,
}

/** The first year a listed property trust (REIT) existed on this market. */
export function reitSince(home: string): number {
  const known = REIT_SINCE[home]
  if (known !== undefined) return known
  return (getCountry(home).wealth ?? 0.5) >= 0.5 ? 2005 : 2010
}

/** How much more brokers charged in `year` than today (fixed commissions before the mid-1970s). */
export function brokerEraMult(year: number): number {
  if (!Number.isFinite(year) || year >= PRESENT_YEAR) return 1
  if (year < 1975) return 5
  if (year < 1996) return 3
  if (year < 2013) return 1.5
  return 1
}
