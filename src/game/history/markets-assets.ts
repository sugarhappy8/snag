// Prices that are the same everywhere: gold, crude oil and the crypto market, as they really
// moved (nominal US dollars, year-end unless noted). history/markets.ts turns them into the
// engine's constant PRESENT_YEAR dollars.
//
// Crypto is fictional but faithful: the game's first coin follows Bitcoin's real path, its
// smart-contract coin follows Ethereum (from 2015), its meme coin a famous dog-themed token
// (from 2013), and its algorithmic "stablecoin" launches in 2020 and collapses in 2022, as one
// infamously did. There is no crypto at all before 2009.

/** Gold, US dollars per troy ounce at year-end, from 1900. */
export const GOLD_FROM = 1900
export const GOLD_NOMINAL: readonly number[] = [
  // 1900-1932: the gold standard's fixed $20.67
  ...Array.from({ length: 33 }, () => 20.67),
  // 1933: the dollar comes off gold
  26,
  // 1934-1967: the official $35
  ...Array.from({ length: 34 }, () => 35),
  // 1968-1979
  41.9, 35.2, 37.4, 43.6, 64.9, 112.3, 186.5, 140.3, 134.5, 164.95, 226, 512,
  // 1980-1989
  589.5, 397.5, 456.9, 382.4, 308.3, 327, 390.9, 486.5, 410.15, 401,
  // 1990-1999
  386.2, 353.15, 333, 391.75, 383.25, 387, 369.25, 290.2, 287.8, 290.25,
  // 2000-2009
  272.65, 276.5, 342.75, 417.25, 435.6, 513, 632, 833.75, 869.75, 1087.5,
  // 2010-2019
  1405.5, 1531, 1657.5, 1204.5, 1206, 1060, 1145.9, 1291, 1279, 1523,
  // 2020-2025
  1891, 1806, 1812, 2078, 2610, 4320,
]

/** Crude oil, average US dollars per barrel (anchors before 1971 are interpolated). */
export const OIL_ANCHORS: readonly (readonly [number, number])[] = [
  [1900, 1.19], [1910, 0.61], [1913, 0.95], [1918, 1.98], [1920, 3.07], [1921, 1.73], [1926, 1.88], [1931, 0.65], [1933, 0.67],
  [1940, 1.02], [1945, 1.05], [1947, 1.9], [1948, 1.99], [1950, 1.71], [1957, 1.9], [1960, 1.9], [1965, 1.8], [1970, 1.8],
  [1971, 2.2], [1972, 2.5], [1973, 3.3], [1974, 11.6], [1975, 11.5], [1976, 12.8], [1977, 13.9], [1978, 14.0], [1979, 31.6],
  [1980, 36.8], [1981, 35.9], [1982, 32.9], [1983, 29.6], [1984, 28.8], [1985, 27.6], [1986, 14.4], [1987, 18.4], [1988, 14.9], [1989, 18.2],
  [1990, 23.7], [1991, 20.0], [1992, 19.3], [1993, 17.0], [1994, 15.8], [1995, 17.0], [1996, 20.7], [1997, 19.1], [1998, 12.7], [1999, 17.9],
  [2000, 28.7], [2001, 24.4], [2002, 25.0], [2003, 28.8], [2004, 38.3], [2005, 54.5], [2006, 65.1], [2007, 72.4], [2008, 97.0], [2009, 61.7],
  [2010, 79.6], [2011, 111.3], [2012, 111.7], [2013, 108.7], [2014, 98.9], [2015, 52.4], [2016, 43.7], [2017, 54.2], [2018, 71.3], [2019, 64.2],
  [2020, 41.8], [2021, 70.9], [2022, 99.0], [2023, 82.5], [2024, 80.5], [2025, 69],
]

/** The history of one coin slot of invest/engine.ts (slot order: Bitbuck, Aetherium, Corgicoin, the stablecoin). */
export interface CoinSlotHistory {
  /** Each generation of the slot: launch year, year-end nominal prices, and the year it collapsed. */
  gens: readonly { launch: number; prices: Readonly<Record<number, number>>; collapsed?: number }[]
  /** Coins in circulation (millions) by year, for the market's size (the early market was tiny). */
  supplyM: readonly (readonly [number, number])[]
}

export const COIN_HISTORY: readonly CoinSlotHistory[] = [
  {
    // Bitcoin's path: fractions of a cent in 2009, $1,000 by late 2013, the 2017 mania, the 2018
    // winter, $47K at the end of 2021, $16.5K after 2022's crash, and $90K+ by 2024.
    gens: [
      {
        launch: 2009,
        prices: {
          2009: 0.0009, 2010: 0.3, 2011: 4.7, 2012: 13.4, 2013: 754, 2014: 320, 2015: 430, 2016: 964, 2017: 13860,
          2018: 3740, 2019: 7190, 2020: 28990, 2021: 46310, 2022: 16550, 2023: 42270, 2024: 93430, 2025: 87500,
        },
      },
    ],
    supplyM: [[2009, 1.6], [2010, 5.0], [2011, 8.0], [2012, 10.6], [2013, 12.2], [2014, 13.7], [2015, 15.0], [2016, 16.1], [2017, 16.8], [2018, 17.4], [2019, 18.1], [2020, 18.6], [2021, 18.9], [2022, 19.2], [2023, 19.6], [2024, 19.8], [2025, 19.97]],
  },
  {
    gens: [
      {
        launch: 2015,
        prices: { 2015: 0.93, 2016: 8.0, 2017: 755, 2018: 133, 2019: 129, 2020: 737, 2021: 3683, 2022: 1196, 2023: 2282, 2024: 3332, 2025: 2970 },
      },
    ],
    supplyM: [[2015, 72], [2017, 96], [2019, 109], [2021, 119], [2023, 120], [2025, 121]],
  },
  {
    gens: [
      {
        launch: 2013,
        prices: {
          2013: 0.00056, 2014: 0.00016, 2015: 0.00013, 2016: 0.00022, 2017: 0.009, 2018: 0.0024, 2019: 0.002, 2020: 0.0047,
          2021: 0.17, 2022: 0.07, 2023: 0.09, 2024: 0.316, 2025: 0.13,
        },
      },
    ],
    supplyM: [[2013, 50_000], [2014, 100_000], [2016, 108_000], [2020, 127_000], [2025, 148_000]],
  },
  {
    // An algorithmic dollar paying fat "staking rewards" launches in 2020 and collapses in 2022.
    // A new one, promising it's different this time, launches in 2024.
    gens: [
      { launch: 2020, prices: { 2020: 1, 2021: 1 }, collapsed: 2022 },
      { launch: 2024, prices: { 2024: 1, 2025: 1 } },
    ],
    supplyM: [[2020, 1_000], [2021, 10_000], [2022, 18_000], [2024, 500], [2025, 2_000]],
  },
]

/** The first year any cryptocurrency existed. */
export const CRYPTO_FROM = 2009
