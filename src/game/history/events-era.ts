// What a year felt like: a short flavor line per period ("disco, bell-bottoms and oil shocks"),
// the headline technology fact for a family, and the one-line preview the New Life screen shows
// under "Born in". Pure: no RNG, no state.
import { PRESENT_YEAR, techAdoption, type TechId } from './timeline'

const BLURBS: readonly (readonly [number, string])[] = [
  [1900, 'horses still outnumber cars; empires rule the map'],
  [1910, 'ragtime, steamships and the last days of the old empires'],
  [1914, 'the Great War; trenches and telegrams'],
  [1919, "jazz, flappers and the flu's long shadow"],
  [1929, 'the Great Depression; bread lines and dust storms'],
  [1939, 'the Second World War; rationing and blackouts'],
  [1946, 'the postwar baby boom; the Cold War begins'],
  [1955, 'rock and roll, tail fins and the space race'],
  [1960, 'the space race; the Cold War heats up'],
  [1965, 'Vietnam, flower power and the Moon in sight'],
  [1970, 'disco, bell-bottoms and oil shocks'],
  [1975, 'disco; punk; the Cold War grinds on'],
  [1980, "the Cold War; disco's hangover"],
  [1985, "big hair, cassettes and the Cold War's last act"],
  [1990, 'the Cold War is over; grunge and dial tones'],
  [1995, 'the dot-com boom; pagers, boy bands and baggy jeans'],
  [2000, 'the dot-com bust; the War on Terror'],
  [2005, 'the housing bubble; everyone has a profile page'],
  [2008, 'the financial crisis; bank bailouts and foreclosures'],
  [2010, 'the selfie era; the Arab Spring and austerity'],
  [2015, 'streaming, selfies and populism'],
  [2020, 'the pandemic: masks and lockdowns'],
  [2022, 'rising prices and chatbots that write your homework'],
  [2024, 'heat records, sky-high rents and chatbots everywhere'],
  [PRESENT_YEAR, 'the present day'],
  [PRESENT_YEAR + 1, 'the future: anything goes'],
]

/** The flavor line for a year. */
export function eraBlurb(year: number): string {
  let out = BLURBS[0][1]
  for (const [from, text] of BLURBS) if (year >= from) out = text
  return out
}

/** The headline technology fact for a year: "no home internet yet", "black-and-white TV"... */
export function techPhrase(countryId: string, year: number): string {
  const a = (id: TechId) => techAdoption(countryId, id, year)
  if (a('radio') < 0.02) return 'no radio yet; news comes by newspaper and telegram'
  if (a('tv') < 0.02) return a('radio') < 0.35 ? 'the wireless is a marvel; no TV yet' : 'the family gathers around the radio; no TV yet'
  if (a('colorTv') < 0.35) return a('tv') < 0.35 ? 'TV is new and rare' : 'black-and-white TV'
  if (a('homeComputer') < 0.02) return 'color TV, but no home computers yet'
  if (a('internet') < 0.02) return 'no home internet yet'
  if (a('smartphone') < 0.02) return a('internet') < 0.35 ? 'dial-up internet for the lucky few; no smartphones' : 'the internet, but no smartphones yet'
  if (a('aiAssistants') < 0.02) return a('smartphone') < 0.35 ? 'the first smartphones' : 'a smartphone in every pocket'
  if (year > PRESENT_YEAR) return 'technology you can only imagine'
  return 'AI assistants in every pocket'
}

/** One line for the New Life screen: "1980: no home internet yet; the Cold War; disco's hangover". */
export function eraPreview(year: number, countryId = 'us'): string {
  const y = Math.round(year)
  return `${y}: ${techPhrase(countryId, y)}; ${eraBlurb(y)}`
}
