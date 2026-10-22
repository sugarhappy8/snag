// Competition data: how big each industry's market is in every year (real history up to
// PRESENT_YEAR, the procedural future after), who it is fought over (the whole world for
// tradable industries, one country for local trades), how strongly the winner takes most, the
// kind of rivals it breeds, when the industry could exist at all, and how hard each country's
// competition authority comes down on a dominant company in each era. Pure data and pure helpers:
// no game state is touched here.
import type { Industry } from '../data/markets'
import { techAdoption, type TechId } from '../history/timeline'
import { inEu } from './deeptech-data'
import { DEVICE_NETWORK } from './devices-data'

export type MarketScope = 'world' | 'national'

export interface MarketDef {
  scope: MarketScope
  /** What the market is called in a sentence: 'AI', 'restaurant'. */
  noun: string
  /**
   * World markets: the yearly sales of a solid reference competitor, in US-baseline outlets (one
   * office, factory...) or deep-tech market units (industries.ts `demand`). National markets: 1.
   */
  ref: number
  /**
   * World markets: rivals' combined pull at PRESENT_YEAR, in reference competitors (a crowded field
   * is 30-300). National markets: outlets per million people in a rich market (the whole trade).
   */
  field: number
  /** Share of the rivals' customers held by the long tail ("everyone else"). */
  fringe: number
  /** Network effects and scale: how strongly the biggest player keeps getting bigger (0 none - 8 winner-take-most). */
  network: number
  /** Named rivals tracked at any one time. */
  named: number
  /** True for markets that had to be invented (rivals arrive as the market grows, years behind it). */
  emerging: boolean
  /** Market size vs PRESENT_YEAR (constant dollars) at anchor years; geometric in between. */
  curve: readonly (readonly [number, number])[]
  /** Earliest year anyone can found one, and why not before. */
  from?: number
  notYet?: string
  /** Technology that must exist in the founding country (history/timeline hasTech). */
  needs?: TechId
  /** Where global rivals are headquartered (weights). */
  hubs?: readonly (readonly [string, number])[]
  /** Invented name parts for global rivals (local name words are mixed in). */
  names?: { pre: readonly string[]; post: readonly string[] }
  /** State-backed incumbents that own the market until it opens up (space before private launch). */
  legacy?: { count: number; pull: number; fadeFrom: number; fadeTo: number; label: string }
}

const FLAT: readonly (readonly [number, number])[] = [
  [1800, 1],
  [2200, 1],
]

function national(noun: string, field: number, extra: Partial<MarketDef> = {}): MarketDef {
  return { scope: 'national', noun, ref: 1, field, fringe: 0.85, network: 1, named: 10, emerging: false, curve: FLAT, ...extra }
}

export const MARKETS: Record<Industry, MarketDef> = {
  investmentFirm: national('investment management', 100),
  bank: national('retail banking', 60),
  onlineBank: national('online banking', 40, { from: 1995 }),
  casino: national('casino entertainment', 80),
  nightclub: national('nightlife', 250),
  stripClub: national('adult entertainment', 100),
  solar: national('solar power', 15, { from: 1975, emerging: true, curve: [[1975, .01], [2000, .15], [2026, 1], [2050, 2]] }),
  battery: national('battery storage', 35, { from: 1900 }),
  water: national('water treatment', 30),
  recycling: national('recycling', 120),
  telecom: national('telecommunications', 45, { from: 1880, network: 3 }),
  dataCenter: national('data center', 40, { from: 1960, emerging: true, curve: [[1960, .01], [2000, .2], [2026, 1], [2050, 2.5]] }),
  education: national('private education', 250),
  petCare: national('pet care', 400),
  homeCare: national('home services', 700),
  packaging: national('packaging', 100),
  furniture: national('furniture', 160),
  travel: national('travel services', 100),
  foodTruck: national('street food', 100, { from: 1900 }),
  restaurant: national('restaurant', 1_800),
  cafe: national('café', 350),
  bakery: national('bakery', 250),
  bar: national('bar', 250),
  brewery: national('craft beer', 30, { fringe: 0.7 }),
  grocery: national('grocery', 300, { fringe: 0.6, network: 1.5 }),
  fashion: national('fashion', 250),
  beauty: national('beauty', 120, { fringe: 0.7 }),
  salon: national('salon', 900, { fringe: 0.92 }),
  gym: national('fitness', 120),
  autoShop: national('car repair', 450, { from: 1905, notYet: 'There are barely any cars to repair yet.' }),
  construction: national('construction', 1_500),
  realEstate: national('real estate', 300),
  marketing: national('marketing', 120, { fringe: 0.75 }),
  clinic: national('private healthcare', 500),
  hotel: national('hotel', 160, { fringe: 0.7 }),
  logistics: national('logistics', 180, { fringe: 0.7, network: 1.5 }),
  farm: national('farming', 1_200, { fringe: 0.95 }),
  entertainment: national('live entertainment', 60, { fringe: 0.7 }),
  software: {
    scope: 'world', noun: 'software', ref: 10, field: 300, fringe: 0.25, network: 7, named: 18, emerging: true,
    from: 1955, notYet: 'Computers are room-sized machines that come with their own programmers; nobody sells software yet.',
    curve: [[1955, 0.0005], [1965, 0.004], [1970, 0.01], [1975, 0.02], [1980, 0.04], [1985, 0.08], [1990, 0.13], [1995, 0.22], [1999, 0.38], [2000, 0.4], [2001, 0.32], [2002, 0.3], [2005, 0.38], [2008, 0.48], [2009, 0.45], [2012, 0.58], [2015, 0.7], [2020, 0.86], [2022, 0.92], [2026, 1], [2040, 1.6], [2060, 2.2]],
    hubs: [['us', 45], ['cn', 8], ['in', 6], ['de', 6], ['gb', 6], ['jp', 5], ['il', 4], ['fr', 4], ['ca', 4], ['kr', 3], ['se', 2], ['nl', 2], ['au', 2], ['br', 2], ['ee', 1]],
    names: { pre: ['Bytewise', 'Codecraft', 'Stackline', 'Cloudloom', 'Datavine', 'Logicraft', 'Pixelforge', 'Kernelworks', 'Bitharbor', 'Softwind', 'Nimbleware', 'Quarkware', 'Loopwright', 'Syntaxa'], post: ['Software', 'Systems', 'Technologies', 'Labs', 'Soft'] },
  },
  gameStudio: {
    scope: 'world', noun: 'video game', ref: 3, field: 400, fringe: 0.35, network: 2, named: 18, emerging: true,
    // Studios need the game machines themselves: the tech table's consoles (1972) reach each country on their own rollout.
    from: 1971, needs: 'videoGameConsole', notYet: 'Video games barely exist outside a few university labs. The first arcade cabinets are still a few years off.',
    curve: [[1971, 0.001], [1975, 0.006], [1978, 0.02], [1982, 0.05], [1983, 0.03], [1985, 0.015], [1990, 0.06], [1995, 0.1], [2000, 0.17], [2005, 0.25], [2008, 0.38], [2010, 0.4], [2015, 0.6], [2020, 0.95], [2022, 0.9], [2026, 1], [2040, 1.5], [2060, 1.9]],
    hubs: [['us', 30], ['jp', 20], ['cn', 10], ['kr', 8], ['gb', 6], ['fr', 5], ['ca', 5], ['se', 4], ['pl', 4], ['fi', 3], ['de', 3]],
    names: { pre: ['Pixelstorm', 'Dragonfire', 'Moonbyte', 'Starforge', 'Questline', 'Bitstorm', 'Neon Owl', 'Glitchworks', 'Lucky Cat', 'Ironclad', 'Paper Crane', 'Red Kite'], post: ['Games', 'Interactive', 'Studios', 'Entertainment'] },
  },
  ecommerce: {
    scope: 'world', noun: 'online shopping', ref: 10, field: 250, fringe: 0.3, network: 7, named: 18, emerging: true,
    from: 1994, needs: 'onlineShopping', notYet: 'There is no internet to shop on here yet. Mail-order catalogs are as online as it gets.',
    curve: [[1994, 0.001], [1996, 0.008], [1998, 0.03], [1999, 0.06], [2000, 0.065], [2001, 0.045], [2002, 0.05], [2005, 0.12], [2008, 0.2], [2010, 0.27], [2015, 0.45], [2019, 0.68], [2020, 0.85], [2021, 0.9], [2026, 1], [2040, 1.6], [2060, 2]],
    hubs: [['us', 30], ['cn', 25], ['in', 6], ['jp', 6], ['de', 5], ['gb', 5], ['kr', 4], ['br', 4], ['id', 3], ['ru', 3], ['sg', 2], ['ar', 2], ['tr', 2], ['pl', 2], ['ng', 1]],
    names: { pre: ['Cartwheel', 'Parcelio', 'Basketly', 'Shopnest', 'Boxbound', 'Swiftcart', 'Bazaario', 'Mallora', 'Orderly', 'Kartiq', 'Doorstep', 'Haulbox'], post: ['', ' Online', ' Direct', ' Market', ' Express'] },
  },
  manufacturing: {
    scope: 'world', noun: 'manufacturing', ref: 5, field: 1_500, fringe: 0.5, network: 2.5, named: 18, emerging: false,
    curve: [[1800, 0.03], [1900, 0.12], [1929, 0.22], [1932, 0.13], [1940, 0.25], [1945, 0.3], [1950, 0.3], [1970, 0.5], [1980, 0.6], [1990, 0.7], [2000, 0.8], [2009, 0.8], [2010, 0.87], [2026, 1], [2050, 1.35], [2100, 1.6]],
    hubs: [['cn', 25], ['us', 15], ['de', 12], ['jp', 12], ['kr', 6], ['it', 5], ['in', 5], ['tw', 4], ['mx', 3], ['fr', 3], ['gb', 3], ['ch', 2], ['br', 2], ['vn', 2], ['th', 2]],
    names: { pre: [], post: ['Industries', 'Manufacturing', 'Works', 'Heavy Industries', 'Precision', 'Machinery'] },
  },
  energy: {
    scope: 'world', noun: 'energy', ref: 2, field: 2_000, fringe: 0.4, network: 2, named: 18, emerging: false,
    from: 1880, notYet: 'Electric power stations are still an inventor’s dream.',
    curve: [[1880, 0.01], [1900, 0.04], [1920, 0.1], [1930, 0.15], [1950, 0.3], [1970, 0.6], [1973, 0.65], [1980, 0.72], [1990, 0.78], [2000, 0.85], [2010, 0.92], [2026, 1], [2050, 1.3], [2100, 1.5]],
    hubs: [['us', 18], ['cn', 15], ['ru', 8], ['sa', 8], ['gb', 6], ['fr', 6], ['de', 5], ['in', 5], ['ca', 5], ['br', 4], ['jp', 4], ['ae', 4], ['no', 4], ['it', 3], ['es', 3], ['mx', 3]],
    names: { pre: [], post: ['Energy', 'Power', 'Petroleum', 'Utilities', 'Renewables', 'Oil & Gas'] },
  },
  semiconductor: {
    scope: 'world', noun: 'chip', ref: 4, field: 40, fringe: 0.2, network: 6, named: 16, emerging: true,
    from: 1948, notYet: 'The transistor hasn’t been invented yet. Computers run on vacuum tubes.',
    curve: [[1948, 0.0005], [1955, 0.002], [1960, 0.006], [1965, 0.012], [1970, 0.025], [1975, 0.04], [1980, 0.07], [1985, 0.09], [1990, 0.13], [1995, 0.27], [2000, 0.36], [2001, 0.24], [2003, 0.28], [2007, 0.4], [2009, 0.35], [2010, 0.48], [2015, 0.5], [2018, 0.62], [2019, 0.55], [2021, 0.75], [2022, 0.8], [2023, 0.7], [2024, 0.85], [2026, 1], [2035, 1.7], [2050, 2.6]],
    hubs: [['us', 30], ['tw', 18], ['kr', 14], ['jp', 12], ['cn', 12], ['nl', 5], ['de', 4], ['il', 2], ['sg', 2], ['fr', 1]],
    names: { pre: ['Wafera', 'Lithon', 'Nanogate', 'Dielectra', 'Microvolt', 'Photonix', 'Gatewell', 'Transistora', 'Dopant', 'Junctiva'], post: ['Semiconductor', 'Micro', 'Silicon', 'Devices', 'Chips'] },
  },
  aiLab: {
    scope: 'world', noun: 'AI', ref: 14, field: 35, fringe: 0.2, network: 8, named: 16, emerging: true,
    from: 1956, notYet: 'Nobody has even coined the term "artificial intelligence" yet.',
    curve: [[1956, 0.0004], [1980, 0.001], [1986, 0.003], [1990, 0.0015], [2000, 0.003], [2005, 0.005], [2010, 0.01], [2012, 0.015], [2014, 0.035], [2016, 0.07], [2018, 0.12], [2020, 0.18], [2022, 0.3], [2023, 0.45], [2024, 0.62], [2025, 0.8], [2026, 1], [2030, 1.8], [2035, 2.8], [2045, 4], [2060, 5]],
    hubs: [['us', 40], ['cn', 18], ['gb', 7], ['fr', 5], ['ca', 5], ['il', 4], ['kr', 4], ['jp', 4], ['de', 4], ['in', 3], ['sg', 2], ['ae', 2], ['ch', 2]],
    names: { pre: ['Cortexa', 'Synaptic', 'Lumenmind', 'Axiomatic', 'Neurova', 'Halcyon', 'Cogitar', 'Mindforge', 'Parallax', 'Noetica', 'Tensorly', 'Inferia', 'Latentia', 'Perceptra'], post: ['Labs', 'AI', 'Intelligence', 'Research', 'Minds'] },
  },
  robotics: {
    scope: 'world', noun: 'robotics', ref: 3, field: 45, fringe: 0.25, network: 4, named: 16, emerging: true,
    from: 1954, notYet: 'Robots only exist in science fiction so far.',
    curve: [[1954, 0.0005], [1961, 0.003], [1970, 0.02], [1980, 0.06], [1985, 0.1], [1990, 0.14], [2000, 0.2], [2005, 0.25], [2009, 0.2], [2010, 0.3], [2015, 0.45], [2020, 0.65], [2026, 1], [2035, 2.2], [2050, 4]],
    hubs: [['jp', 22], ['us', 22], ['de', 15], ['cn', 14], ['kr', 9], ['ch', 5], ['se', 4], ['it', 3], ['fr', 3], ['dk', 3]],
    names: { pre: ['Mechanova', 'Servotek', 'Automata', 'Roboro', 'Jointworks', 'Gantry', 'Actuon', 'Gripwell', 'Torsion', 'Cobotix'], post: ['Robotics', 'Automation', 'Dynamics', 'Machines'] },
  },
  biotech: {
    scope: 'world', noun: 'biotech', ref: 2.5, field: 60, fringe: 0.3, network: 2, named: 16, emerging: true,
    from: 1953, notYet: 'Nobody knows what DNA looks like yet. Medicine is chemistry, not biology.',
    curve: [[1953, 0.01], [1976, 0.03], [1982, 0.05], [1990, 0.15], [2000, 0.35], [2005, 0.45], [2010, 0.6], [2015, 0.75], [2020, 0.95], [2021, 1.05], [2023, 0.9], [2026, 1], [2040, 1.6], [2060, 2.2]],
    hubs: [['us', 45], ['ch', 10], ['gb', 8], ['de', 6], ['jp', 6], ['cn', 6], ['fr', 5], ['dk', 4], ['be', 3], ['kr', 3], ['il', 2], ['in', 2]],
    names: { pre: ['Helixa', 'Proteonix', 'Cellara', 'Vaxora', 'Immunelle', 'Peptira', 'Codonis', 'Enzymia', 'Riboscient', 'Antivra'], post: ['Therapeutics', 'Bio', 'Pharma', 'Biosciences', 'Genomics'] },
  },
  spaceTech: {
    scope: 'world', noun: 'launch', ref: 2, field: 18, fringe: 0.15, network: 5, named: 12, emerging: true,
    from: 1957, notYet: 'Nothing has ever reached orbit. Rockets are still weapons and fireworks.',
    curve: [[1957, 0.002], [1962, 0.01], [1980, 0.03], [1990, 0.06], [2000, 0.08], [2002, 0.08], [2008, 0.1], [2012, 0.18], [2016, 0.3], [2020, 0.55], [2023, 0.8], [2026, 1], [2035, 2], [2050, 3.5]],
    hubs: [['us', 45], ['cn', 12], ['fr', 6], ['jp', 6], ['in', 6], ['ru', 6], ['gb', 5], ['nz', 3], ['de', 3], ['il', 2], ['ae', 2], ['kr', 2]],
    names: { pre: ['Apogee', 'Starward', 'Orbitra', 'Skyforge', 'Ascenda', 'Celestar', 'Highline', 'Meridian', 'Perihelion', 'Farside'], post: ['Aerospace', 'Space', 'Orbital', 'Launch', 'Rocketworks'] },
    legacy: { count: 3, pull: 25, fadeFrom: 2004, fadeTo: 2016, label: 'state rocket works' },
  },
  electricVehicles: {
    scope: 'world', noun: 'electric vehicle', ref: 3.5, field: 30, fringe: 0.2, network: 4, named: 16, emerging: true,
    // The electric cars of 1900-1915 lost to gasoline; the modern industry restarts with
    // California's zero-emission mandate and the first lithium cars of the late 1990s.
    from: 1996, notYet: 'Gasoline won the car wars back in the 1920s. Battery cars are golf carts and milk floats now, and no investor will touch one.',
    curve: [[1996, 0.0015], [1997, 0.002], [2008, 0.004], [2010, 0.01], [2012, 0.025], [2015, 0.04], [2018, 0.1], [2020, 0.2], [2022, 0.55], [2024, 0.85], [2026, 1], [2030, 1.6], [2035, 2.4], [2045, 3.2], [2060, 3.6]],
    hubs: [['cn', 35], ['us', 22], ['de', 12], ['jp', 8], ['kr', 7], ['fr', 5], ['gb', 3], ['se', 3], ['in', 3], ['vn', 2]],
    names: { pre: ['Voltara', 'Coilworth', 'Sparkline', 'Fluxdrive', 'Ohmway', 'Kilowatt', 'Currento', 'Lumivolt', 'Torqua', 'Glidepath'], post: ['Motors', 'Autoworks', 'Automotive', 'Electric', 'Mobility'] },
  },
  quantum: {
    scope: 'world', noun: 'quantum computing', ref: 6, field: 25, fringe: 0.2, network: 6, named: 12, emerging: true,
    from: 1985, notYet: 'Nobody has even proposed a quantum computer yet. Physicists are still arguing about the cat.',
    curve: [[1985, 0.0002], [1995, 0.0005], [2005, 0.002], [2010, 0.004], [2016, 0.03], [2019, 0.08], [2022, 0.3], [2024, 0.6], [2026, 1], [2030, 2.5], [2035, 6], [2040, 12], [2050, 20]],
    hubs: [['us', 40], ['cn', 14], ['ca', 10], ['gb', 9], ['de', 6], ['jp', 6], ['fr', 5], ['ch', 4], ['au', 3], ['nl', 3]],
    names: { pre: ['Qubitron', 'Superpose', 'Entangla', 'Planck', 'Bosonic', 'Fermion', 'Spinor', 'Ketra', 'Hilbert', 'Q-Lattice'], post: ['Quantum', 'Computing', 'Q Systems', 'Labs'] },
  },
  cybersecurity: {
    scope: 'world', noun: 'cybersecurity', ref: 2, field: 60, fringe: 0.3, network: 5, named: 16, emerging: true,
    // Security as a business arrives with the internet (antivirus floppies came a few years before).
    from: 1991, notYet: 'There is barely a network to break into yet.',
    curve: [[1975, 0.001], [1985, 0.005], [1990, 0.015], [1995, 0.04], [2000, 0.1], [2005, 0.18], [2010, 0.3], [2015, 0.5], [2020, 0.72], [2026, 1], [2040, 2], [2060, 2.6]],
    hubs: [['us', 40], ['il', 18], ['gb', 8], ['cn', 6], ['de', 5], ['ru', 5], ['fr', 4], ['in', 4], ['ca', 4], ['jp', 3], ['kr', 3]],
    names: { pre: ['Bastion', 'Sentinelle', 'Rampart', 'Cipherion', 'Watchtower', 'Bulwark', 'Portcullis', 'Moatline', 'Keyward', 'Tripwire'], post: ['Security', 'Cyber', 'Defense', 'Shield', 'Labs'] },
  },
  fusion: {
    scope: 'world', noun: 'fusion power', ref: 3, field: 20, fringe: 0.15, network: 5, named: 12, emerging: true,
    // Private fusion starts with the first venture-backed labs of the late 1990s; before that it is government science.
    from: 1998, notYet: 'Fusion is a government science project. No investor will back a private reactor yet.',
    curve: [[1998, 0.001], [2010, 0.01], [2018, 0.1], [2021, 0.35], [2024, 0.75], [2026, 1], [2030, 2.5], [2035, 8], [2045, 30], [2060, 60]],
    hubs: [['us', 45], ['gb', 12], ['cn', 12], ['ca', 6], ['de', 6], ['jp', 6], ['fr', 4], ['kr', 3], ['ch', 2], ['au', 2]],
    names: { pre: ['Tokamaq', 'Stellara', 'Heliora', 'Plasmion', 'Sunforge', 'Deuteron', 'Magnetar', 'Corona', 'Pinchwell', 'Lawson'], post: ['Fusion', 'Energy', 'Power', 'Plasma'] },
  },
  neurotech: {
    scope: 'world', noun: 'brain interface', ref: 2, field: 25, fringe: 0.2, network: 4, named: 12, emerging: true,
    // The first brain implants that let a paralyzed patient move a cursor date from the late 1990s.
    from: 1998, notYet: 'Nobody has wired a computer to a human brain yet. It is still science fiction.',
    curve: [[1998, 0.001], [2005, 0.005], [2012, 0.02], [2018, 0.08], [2022, 0.3], [2024, 0.6], [2026, 1], [2030, 2.5], [2035, 5], [2045, 10], [2060, 16]],
    hubs: [['us', 50], ['cn', 12], ['ch', 6], ['gb', 6], ['de', 5], ['au', 4], ['fr', 4], ['il', 4], ['nl', 3], ['jp', 3]],
    names: { pre: ['Synapta', 'Cortica', 'Neuroweave', 'Axonics', 'Dendra', 'Gliaworks', 'Thoughtwire', 'Mindbridge', 'Spikeline', 'Neurona'], post: ['Neuro', 'Neural', 'Interfaces', 'Labs'] },
  },
  drones: {
    scope: 'world', noun: 'drone', ref: 3, field: 40, fringe: 0.25, network: 4, named: 14, emerging: true,
    // Consumer and survey drones become a business with cheap flight controllers in the mid-2000s.
    from: 2005, notYet: 'Drones are military hardware and radio-controlled toys. Nobody sells one to a farmer yet.',
    curve: [[2005, 0.005], [2010, 0.03], [2014, 0.15], [2016, 0.3], [2020, 0.55], [2024, 0.85], [2026, 1], [2030, 1.8], [2035, 3.2], [2045, 5], [2060, 6.5]],
    hubs: [['cn', 35], ['us', 30], ['de', 6], ['fr', 5], ['il', 5], ['gb', 4], ['jp', 4], ['kr', 3], ['br', 2], ['ch', 2]],
    names: { pre: ['Rotora', 'Hoverline', 'Skylift', 'Aerivo', 'Quadwing', 'Liftworks', 'Propella', 'Vertiq', 'Glidex', 'Nimbus'], post: ['Aero', 'Air', 'Aviation', 'Drones', 'Mobility'] },
  },
  carbonCapture: {
    scope: 'world', noun: 'carbon removal', ref: 3, field: 30, fringe: 0.25, network: 3, named: 12, emerging: true,
    // The first direct-air-capture startups were founded around 2009.
    from: 2008, notYet: 'Nobody pays to take carbon dioxide out of the air yet. Most people have not heard of the problem.',
    curve: [[2008, 0.002], [2015, 0.01], [2019, 0.05], [2022, 0.25], [2024, 0.6], [2026, 1], [2030, 3], [2035, 7], [2045, 15], [2060, 22]],
    hubs: [['us', 40], ['ch', 10], ['ca', 8], ['gb', 8], ['de', 6], ['no', 5], ['se', 4], ['ke', 3], ['au', 3], ['jp', 3]],
    names: { pre: ['Airloom', 'Carbona', 'Skyscrub', 'Basaltic', 'Terravent', 'Stonebind', 'Sequestra', 'Biocharred', 'Ventora', 'Greenfin'], post: ['Carbon', 'Climate', 'Removal', 'Air'] },
  },
  devices: {
    scope: 'world', noun: 'device', ref: 5, field: 90, fringe: 0.3, network: DEVICE_NETWORK, named: 16, emerging: true,
    // The first home computers sold in 1977. The 2007-2013 rise is drawn flatter than plain sales would be, because the
    // smartphone history wave adds demand on top (tech-wave-data.ts).
    from: 1977, needs: 'homeComputer', notYet: "Computers fill rooms and cost a fortune. A home computer doesn't exist yet.",
    curve: [[1977, 0.001], [1980, 0.006], [1984, 0.03], [1990, 0.08], [1995, 0.15], [2000, 0.28], [2001, 0.25], [2005, 0.35], [2007, 0.4], [2010, 0.62], [2013, 0.88], [2016, 1], [2019, 0.97], [2022, 0.98], [2026, 1], [2040, 1.35], [2060, 1.7]],
    hubs: [['us', 26], ['cn', 24], ['kr', 12], ['jp', 10], ['tw', 8], ['in', 6], ['gb', 3], ['de', 3], ['fi', 2], ['sg', 2], ['fr', 2]],
    names: { pre: ['Pocketwave', 'Glassline', 'Slateworks', 'Nimbo', 'Pixelcore', 'Lumio', 'Orbitron', 'Wristly', 'Visora', 'Kinetica'], post: ['Devices', 'Mobile', 'Electronics', 'Computing', 'Labs'] },
  },
}

export function marketDef(industry: string): MarketDef {
  return (MARKETS as Record<string, MarketDef>)[industry] ?? MARKETS.restaurant
}

export function isWorldMarket(industry: string): boolean {
  return marketDef(industry).scope === 'world'
}

/** The outside option: customers who would rather buy nothing at all (in reference competitors). */
export const OUTSIDE = 1

/** Network-effect curve shape: barely anything below ~10% share, a lot above ~40%. */
export const NETWORK_KNEE = 0.2

/**
 * How big this industry's market is in `year` vs PRESENT_YEAR, in constant dollars (0 before it
 * could exist). Real history up to PRESENT_YEAR (booms, the dot-com bust, 2008, the AI explosion),
 * the procedural future after.
 */
export function sizeRatio(industry: string, year: number): number {
  const d = marketDef(industry)
  if (d.from !== undefined && year < d.from) return 0
  const c = d.curve
  if (year <= c[0][0]) return c[0][1]
  for (let i = 1; i < c.length; i++) {
    const [y1, v1] = c[i]
    if (year <= y1) {
      const [y0, v0] = c[i - 1]
      const t = (year - y0) / Math.max(1, y1 - y0)
      return v0 * Math.pow(v1 / v0, t)
    }
  }
  return c[c.length - 1][1]
}

/** Yearly growth of the market over the `span` years up to `year` (0.25 = +25% a year). */
export function marketGrowth(industry: string, year: number, span = 5): number {
  const now = sizeRatio(industry, year)
  const then = sizeRatio(industry, year - span)
  if (!(now > 0) || !(then > 0)) return 0
  return Math.pow(now / then, 1 / span) - 1
}

// ---------------------------------------------------------------------------
// Dominance tiers

export type TierId = 'startup' | 'niche' | 'contender' | 'leader' | 'dominant' | 'monopoly'

export interface TierDef {
  id: TierId
  label: string
  emoji: string
}

export const TIERS: Record<TierId, TierDef> = {
  startup: { id: 'startup', label: 'Startup', emoji: '\u{1F331}' },
  niche: { id: 'niche', label: 'Niche player', emoji: '\u{1F50E}' },
  contender: { id: 'contender', label: 'Contender', emoji: '\u{1F94A}' },
  leader: { id: 'leader', label: 'Market leader', emoji: '\u{1F947}' },
  dominant: { id: 'dominant', label: 'Dominant', emoji: '\u{1F451}' },
  monopoly: { id: 'monopoly', label: 'Near-monopoly', emoji: '\u{1F3F0}' },
}

/** The tier for a market share and rank (1 = biggest). */
export function tierFor(share: number, rank: number): TierId {
  if (share >= 0.7) return 'monopoly'
  if (share >= 0.4 && rank === 1) return 'dominant'
  if ((share >= 0.12 && rank === 1) || share >= 0.25) return 'leader'
  if (share >= 0.03) return 'contender'
  if (share >= 0.005) return 'niche'
  return 'startup'
}

export const TIER_ORDER: TierId[] = ['startup', 'niche', 'contender', 'leader', 'dominant', 'monopoly']

// ---------------------------------------------------------------------------
// Competition law by country and era

export interface Regime {
  /** Who enforces it: 'the European Commission'. */
  name: string
  /** 0 (anything goes) - 1 (trust-busters with teeth). */
  strict: number
  /** Biggest fine as a share of yearly sales. */
  fine: number
  /** Can force a break-up / divestiture. */
  breakUp: boolean
}

const LAX: Regime = { name: 'the national competition authority', strict: 0.15, fine: 0.02, breakUp: false }

function usRegime(year: number): Regime {
  const name = year < 1915 ? 'the Justice Department' : 'the FTC and the Justice Department'
  if (year < 1890) return { name: 'Congress', strict: 0.05, fine: 0.01, breakUp: false }
  // Trust-busting (Standard Oil, 1911), the lax 1920s, the New Deal and postwar enforcement, the
  // permissive 1980s-2010s (with the Microsoft case around 2000), then big tech under scrutiny.
  const strict = year < 1920 ? 0.7 : year < 1937 ? 0.3 : year < 1981 ? 0.6 : year >= 1998 && year <= 2002 ? 0.55 : year < 2019 ? 0.35 : 0.6
  return { name, strict, fine: 0.03, breakUp: true }
}

function euRegime(countryId: string, year: number): Regime {
  if (year < 1958) return { name: 'the national competition authority', strict: countryId === 'de' && year >= 1950 ? 0.3 : 0.15, fine: 0.02, breakUp: false }
  // The Treaty of Rome's competition rules, then a Commission that fines the world's giants
  // (Microsoft 2004, Google 2017-19) and the Digital Markets Act (2022).
  const strict = year < 1990 ? 0.35 : year < 2004 ? 0.6 : year < 2022 ? 0.8 : 0.9
  return { name: 'the European Commission', strict, fine: 0.1, breakUp: year >= 2022 }
}

/** The competition regime a company headquartered in `countryId` answers to in `year`. */
export function regimeFor(countryId: string, year: number): Regime {
  if (countryId === 'us') return usRegime(year)
  if (inEu(countryId)) return euRegime(countryId, year)
  switch (countryId) {
    case 'gb':
      return year < 1948 ? LAX : { name: year >= 2014 ? 'the Competition and Markets Authority' : 'the Monopolies Commission', strict: year < 1998 ? 0.4 : 0.65, fine: 0.1, breakUp: true }
    case 'cn':
      return year < 2008 ? { ...LAX, strict: 0.1 } : { name: 'the State Administration for Market Regulation', strict: year < 2020 ? 0.3 : 0.75, fine: 0.1, breakUp: false }
    case 'jp':
      return year < 1947 ? LAX : { name: 'the Japan Fair Trade Commission', strict: 0.45, fine: 0.1, breakUp: false }
    case 'kr':
      return year < 1981 ? LAX : { name: 'the Korea Fair Trade Commission', strict: 0.55, fine: 0.06, breakUp: false }
    case 'in':
      return year < 2009 ? LAX : { name: 'the Competition Commission of India', strict: 0.45, fine: 0.1, breakUp: false }
    case 'br':
      return year < 1994 ? LAX : { name: 'CADE', strict: 0.4, fine: 0.2, breakUp: false }
    case 'ca':
      return year < 1986 ? { ...LAX, strict: 0.3 } : { name: 'the Competition Bureau', strict: 0.45, fine: 0.03, breakUp: false }
    case 'au':
      return year < 1974 ? LAX : { name: 'the ACCC', strict: 0.55, fine: 0.1, breakUp: false }
    case 'ru':
      return { name: 'the Federal Antimonopoly Service', strict: year < 1991 ? 0.05 : 0.25, fine: 0.15, breakUp: false }
    case 'ch':
      return year < 1996 ? LAX : { name: 'the Competition Commission', strict: 0.45, fine: 0.1, breakUp: false }
    case 'za':
      return year < 1999 ? LAX : { name: 'the Competition Commission', strict: 0.4, fine: 0.1, breakUp: false }
    case 'mx':
      return year < 1993 ? LAX : { name: 'the competition commission', strict: 0.35, fine: 0.1, breakUp: year >= 2013 }
    case 'tr':
      return year < 1997 ? LAX : { name: 'the Turkish Competition Authority', strict: 0.35, fine: 0.1, breakUp: false }
    case 'no':
      return { name: 'the Norwegian Competition Authority', strict: year < 1994 ? 0.3 : 0.6, fine: 0.1, breakUp: false }
    default:
      return year < 1990 ? { ...LAX, strict: 0.08 } : LAX
  }
}

/**
 * The toughest regime a company must answer to: its home country's, plus the European
 * Commission's for companies that sell across the world (since the 1990s it fines foreign giants
 * that dominate Europe too).
 */
export function effectiveRegime(countryId: string, year: number, worldMarket: boolean): Regime {
  const home = regimeFor(countryId, year)
  if (!worldMarket || year < 1990 || inEu(countryId)) return home
  const eu = euRegime('fr', year)
  const reach = { ...eu, strict: eu.strict * 0.85 }
  return reach.strict > home.strict ? reach : home
}

/** Combined share above which a merger gets blocked in this regime (0.32 strict EU ... 0.6 anything goes). */
export function mergerLimit(r: Regime): number {
  return Math.max(0.3, Math.min(0.62, 0.62 - 0.35 * r.strict))
}

/**
 * Why nobody can found this industry in `countryId` in `year` (it hasn't been invented, or the
 * technology it needs hasn't reached the country), or null.
 */
export function industryEraBlock(industry: string, countryId: string, year: number): string | null {
  const d = marketDef(industry)
  if (d.from !== undefined && year < d.from) return d.notYet ?? 'Nobody has invented this business yet.'
  if (d.needs && techAdoption(countryId, d.needs, year) < 0.02) return d.notYet ?? 'The technology this business needs hasn’t arrived here yet.'
  return null
}
