// Bookable experiences: a suite at a grand hotel or resort, and a first-class seat (or a state
// room on an ocean liner, or a seat on Concorde). All real places and carriers, offered only in the
// years they really operated; no people. Prices are for a suite or a long-haul fare today in
// constant 2026 dollars, approximate.

export interface Stay {
  id: string
  /** Registry id (data/brands.ts). */
  brand: string
  name: string
  city: string
  /** Country id (world.ts) of the hotel. */
  country: string
  from: number
  until?: number
  /** Price of a suite for one night today (2026 dollars). */
  nightly: number
  /** 'palace' city grand hotels, 'resort' for beaches and mountains. */
  style: 'palace' | 'resort'
  blurb: string
}

export const STAYS: Stay[] = [
  { id: 'ritz-paris', brand: 'ritz-paris', name: 'Ritz Paris', city: 'Paris', country: 'fr', from: 1898, nightly: 2200, style: 'palace', blurb: 'A suite on the Place Vendôme, with a bar named for a famous writer.' },
  { id: 'ritz-london', brand: 'the-ritz-london', name: 'The Ritz London', city: 'London', country: 'gb', from: 1906, nightly: 1100, style: 'palace', blurb: 'Afternoon tea in the Palm Court, under a gilded ceiling.' },
  { id: 'savoy', brand: 'the-savoy', name: 'The Savoy', city: 'London', country: 'gb', from: 1889, nightly: 1300, style: 'palace', blurb: 'The first hotel in London with electric lights and lifts.' },
  { id: 'claridges', brand: 'claridges', name: 'Claridge’s', city: 'London', country: 'gb', from: 1856, nightly: 1200, style: 'palace', blurb: 'Art deco in Mayfair and a doorman who knows everyone.' },
  { id: 'dorchester', brand: 'the-dorchester', name: 'The Dorchester', city: 'London', country: 'gb', from: 1931, nightly: 1200, style: 'palace', blurb: 'A Park Lane landmark overlooking Hyde Park.' },
  { id: 'waldorf', brand: 'waldorf-astoria-new-york', name: 'Waldorf Astoria New York', city: 'New York', country: 'us', from: 1893, nightly: 1400, style: 'palace', blurb: 'A Manhattan tower with a grand ballroom and a famous clock.' },
  { id: 'plaza', brand: 'the-plaza', name: 'The Plaza', city: 'New York', country: 'us', from: 1907, nightly: 1600, style: 'palace', blurb: 'A château-style hotel at the corner of Central Park.' },
  { id: 'raffles', brand: 'raffles-singapore', name: 'Raffles Hotel', city: 'Singapore', country: 'sg', from: 1887, nightly: 1100, style: 'palace', blurb: 'Verandas, ceiling fans and a cocktail invented in the Long Bar.' },
  { id: 'peninsula-hk', brand: 'the-peninsula-hong-kong', name: 'The Peninsula Hong Kong', city: 'Hong Kong', country: 'hk', from: 1928, nightly: 1300, style: 'palace', blurb: 'A fleet of green Rolls-Royces waits at the door.' },
  { id: 'mandarin-hk', brand: 'mandarin-oriental-hong-kong', name: 'Mandarin Oriental', city: 'Hong Kong', country: 'hk', from: 1963, nightly: 1200, style: 'palace', blurb: 'Harbour views from the heart of Central.' },
  { id: 'hotel-de-paris', brand: 'hotel-de-paris-monte-carlo', name: 'Hôtel de Paris', city: 'Monte-Carlo', country: 'mc', from: 1864, nightly: 1800, style: 'palace', blurb: 'Across the square from the casino, above a very deep wine cellar.' },
  { id: 'eden-roc', brand: 'hotel-du-cap-eden-roc', name: 'Hôtel du Cap-Eden-Roc', city: 'Antibes', country: 'fr', from: 1870, nightly: 2500, style: 'resort', blurb: 'The Riviera’s grand summer retreat among the pines.' },
  { id: 'badrutts', brand: 'badrutts-palace', name: 'Badrutt’s Palace', city: 'St. Moritz', country: 'ch', from: 1896, nightly: 1600, style: 'resort', blurb: 'Snow, sunshine and a fur-clad crowd in the Alps.' },
  { id: 'taj-mumbai', brand: 'taj-mahal-palace', name: 'Taj Mahal Palace', city: 'Mumbai', country: 'in', from: 1903, nightly: 700, style: 'palace', blurb: 'A domed palace of a hotel facing the Gateway of India.' },
  { id: 'beverly-hills', brand: 'the-beverly-hills-hotel', name: 'The Beverly Hills Hotel', city: 'Los Angeles', country: 'us', from: 1912, nightly: 1500, style: 'resort', blurb: 'The Pink Palace, with bungalows in the gardens.' },
  { id: 'cipriani', brand: 'belmond-cipriani', name: 'Belmond Hotel Cipriani', city: 'Venice', country: 'it', from: 1958, nightly: 1800, style: 'resort', blurb: 'A garden and a pool across the lagoon from St. Mark’s.' },
  { id: 'amanpuri', brand: 'aman', name: 'Amanpuri', city: 'Phuket', country: 'th', from: 1988, nightly: 1500, style: 'resort', blurb: 'Pavilions above a coconut-palm beach.' },
  { id: 'atlantis', brand: 'atlantis-paradise-island', name: 'Atlantis', city: 'Paradise Island', country: 'bs', from: 1998, nightly: 900, style: 'resort', blurb: 'Waterslides, aquariums and a very pink tower.' },
  { id: 'burj-al-arab', brand: 'burj-al-arab', name: 'Burj Al Arab', city: 'Dubai', country: 'ae', from: 1999, nightly: 2500, style: 'resort', blurb: 'A sail-shaped tower on its own island, with gold leaf in the lobby.' },
]

export interface Voyage {
  id: string
  brand: string
  label: string
  mode: 'sea' | 'air' | 'concorde'
  from: number
  until?: number
  /** A first-class long-haul trip today (2026 dollars); earlier years scale with the luxury index. */
  base: number
  blurb: string
}

export const VOYAGES: Voyage[] = [
  { id: 'liner-cunard', brand: 'cunard', label: 'First-class liner crossing with Cunard', mode: 'sea', from: 1900, until: 1967, base: 9000, blurb: 'Six days across the Atlantic with a captain’s table and a string quartet.' },
  { id: 'liner-white-star', brand: 'white-star-line', label: 'First-class liner crossing with White Star', mode: 'sea', from: 1900, until: 1934, base: 10000, blurb: 'A suite on a floating palace with a grand staircase.' },
  { id: 'clipper', brand: 'pan-am', label: 'Pan Am Clipper first class', mode: 'air', from: 1939, until: 1991, base: 9000, blurb: 'Sleeper berths and a dining room in the sky.' },
  { id: 'twa-first', brand: 'twa', label: 'TWA first class', mode: 'air', from: 1946, until: 2001, base: 7000, blurb: 'White tablecloths and a lounge over the Atlantic.' },
  { id: 'swissair-first', brand: 'swissair', label: 'Swissair first class', mode: 'air', from: 1950, until: 2001, base: 7500, blurb: 'Chocolates, precision and a very quiet cabin.' },
  { id: 'concorde-ba', brand: 'british-airways', label: 'British Airways Concorde', mode: 'concorde', from: 1976, until: 2003, base: 18000, blurb: 'London to New York in under four hours, faster than the sun.' },
  { id: 'concorde-af', brand: 'air-france', label: 'Air France Concorde', mode: 'concorde', from: 1976, until: 2003, base: 18000, blurb: 'Paris to New York at twice the speed of sound.' },
  { id: 'qantas-first', brand: 'qantas', label: 'Qantas first class', mode: 'air', from: 1960, base: 11000, blurb: 'Long, long hours with a bed and a sommelier.' },
  { id: 'lufthansa-first', brand: 'lufthansa', label: 'Lufthansa first class', mode: 'air', from: 1960, base: 10000, blurb: 'White-glove service and a seat that turns into a bed.' },
  { id: 'jal-first', brand: 'japan-airlines', label: 'Japan Airlines first class', mode: 'air', from: 1960, base: 10000, blurb: 'Quiet cabins and exquisite Japanese meals.' },
  { id: 'ba-first', brand: 'british-airways', label: 'British Airways first class', mode: 'air', from: 1974, base: 11000, blurb: 'A quiet cabin, a bed and a captain who says hello.' },
  { id: 'sia-first', brand: 'singapore-airlines', label: 'Singapore Airlines first class', mode: 'air', from: 1972, base: 13000, blurb: 'Famous service and a seat that turns into a bed.' },
  { id: 'emirates-first', brand: 'emirates', label: 'Emirates first class suite', mode: 'air', from: 1985, base: 14000, blurb: 'A private suite and service that never lets your glass go empty.' },
  { id: 'qatar-qsuite', brand: 'qatar-airways', label: 'Qatar Airways Qsuite', mode: 'air', from: 2017, base: 12000, blurb: 'A private suite with sliding doors.' },
  { id: 'etihad-residence', brand: 'etihad', label: 'Etihad Residence', mode: 'air', from: 2014, base: 30000, blurb: 'A three-room apartment in the sky, with a butler.' },
]
