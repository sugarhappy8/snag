// Market history for every other country, plus the rules of each era: when each stock exchange
// opened, the years it was shut (wars, occupations) or wiped out (revolutions that nationalized
// every listed company), where private investing was impossible (the communist decades), when
// owning gold was illegal, which governments defaulted, which banking crises cost depositors
// money, the hyperinflations, the recessions and booms behind each country's business cycle,
// and the year's headline for the financial news.
//
// Countries without a hand-written series (history/markets-major.ts) follow a calibrated proxy:
// their region's real stock returns, scaled by a beta, plus deterministic local noise, with the
// famous local events below written in by hand.

/** Real stock-index returns (%) for notable years where the proxy alone would miss the story. */
export const EQUITY_EVENTS: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  au: { 1907: -15, 1929: -20, 1930: -30, 1931: -10, 1932: 25, 1969: 40, 1970: -35, 1973: -35, 1974: -40, 1975: 40 },
  ca: { 1907: -20, 1929: -20, 1930: -35, 1931: -40, 1932: -10, 1933: 60, 1973: -10, 1974: -35, 1979: 35 },
  hk: { 1941: -30, 1942: -20, 1943: -20, 1944: -20, 1945: -20, 1946: 50, 1949: -20, 1950: -20, 1965: -30, 1967: -40, 1968: 40, 1969: 30 },
  cn: { 1910: -50, 1911: -20, 1921: -40, 1932: -20, 1935: -15, 1937: -40, 1938: -10, 1941: -30, 1946: -50, 1947: -60, 1948: -70 },
  in: { 1947: -30, 1962: -20, 1965: -15, 1969: -10, 1973: -25, 1974: -40, 1975: 20, 1977: 20, 1978: 20 },
  kr: { 1961: -40, 1975: 40, 1976: 50, 1977: 40, 1978: 20, 1979: -20 },
  tw: { 1973: 60, 1974: -60, 1975: 40, 1978: 20, 1979: -10, 1982: -20, 1983: 60, 1984: 5 },
  za: {
    1932: 60, 1960: -30, 1969: 40, 1970: -40, 1974: -20, 1976: -30, 1979: 60, 1980: 40, 1981: -30, 1982: 20,
    1984: -10, 1985: -20, 1986: 30, 1987: -15, 1989: 30, 1990: -20, 1991: 20, 1992: -5, 1993: 40,
  },
  br: { 1968: 60, 1969: 80, 1970: 60, 1971: 40, 1972: -50, 1973: -30, 1974: -30, 1981: -30, 1982: -20, 1983: 100, 1984: 40, 1985: 60, 1986: 30, 1987: -70, 1988: 100 },
  mx: { 1978: 60, 1979: 80, 1980: -20, 1981: -50, 1982: -70, 1983: 100, 1984: -20, 1985: 40, 1986: 80, 1987: -50, 1988: 50 },
  ar: { 1930: -35, 1931: -20, 1952: -30, 1975: -60, 1976: 50, 1977: 20, 1979: 50, 1980: -40, 1981: -50, 1982: -30, 1983: 30, 1984: -20, 1985: 40, 1986: 40, 1987: -40, 1988: -20 },
  ru: { 1904: -15, 1905: -30, 1906: -10, 1910: 20, 1911: 15, 1914: -25, 1915: -15, 1916: -20, 1917: -70 },
  it: {
    1922: 20, 1943: -50, 1944: -40, 1945: -30, 1959: 50, 1960: 40, 1961: 10, 1962: -25, 1963: -20, 1964: -25,
    1981: 15, 1985: 80, 1986: 60, 1987: -35, 1997: 50, 1998: 40, 1999: 20, 2000: 0, 2001: -25, 2002: -25, 2008: -50,
    2011: -25, 2012: 8, 2022: -10, 2025: 30,
  },
  es: { 1936: -30, 1937: -20, 1938: -20, 1939: 30, 1974: -30, 1976: -30, 1977: -40, 1978: -30, 1980: -15, 1981: 10, 1982: -15, 1986: 100, 1987: -20 },
  nl: { 1940: -20, 1944: -30, 2001: -20, 2002: -35, 2008: -50 },
  be: { 1940: -20, 1944: -30, 2002: -30, 2008: -55 },
  ch: { 1990: -20, 1997: 55, 2002: -28, 2008: -35 },
  at: { 1919: -40, 1920: -30, 1921: -20, 1922: -80, 1931: -40, 1938: -20, 1945: -60, 2008: -60 },
  se: { 1990: -30, 1991: 10, 1992: -5, 2000: -10, 2001: -20, 2002: -38, 2008: -40 },
  dk: { 2008: -50 },
  no: { 1987: -20, 2008: -55 },
  fi: { 1918: -40, 1990: -35, 1991: -20, 1992: -10, 1998: 65, 1999: 150, 2000: -15, 2001: -30, 2002: -35, 2008: -55 },
  ie: { 2007: -27, 2008: -66, 2009: 25, 2010: -5 },
  pt: { 1974: -40, 1975: -70, 1976: -20, 2008: -50, 2011: -25 },
  gr: {
    1941: -30, 1942: -40, 1943: -40, 1944: -60, 1999: 100, 2000: -40, 2001: -25, 2002: -32, 2003: 30, 2007: 15, 2008: -66, 2009: 20,
    2010: -40, 2011: -55, 2012: 30, 2013: 25, 2014: -30, 2015: -25, 2017: 25, 2018: -25, 2019: 45, 2020: -12, 2023: 40, 2025: 40,
  },
  pl: { 1993: 900, 1994: -40, 2008: -50 },
  hu: { 1997: 90, 1998: -30, 2008: -55 },
  cz: { 2008: -45 },
  ro: { 2007: 20, 2008: -70 },
  rs: { 2007: 40, 2008: -75 },
  hr: { 2007: 60, 2008: -67 },
  ee: { 2007: -20, 2008: -63 },
  eg: { 2005: 140, 2008: -55, 2011: -50, 2016: -20 },
  ng: { 2007: 60, 2008: -50, 2009: -40, 2016: -40 },
  zw: { 2007: -40, 2008: -80, 2009: 50 },
  ir: { 1978: -30, 2019: 60, 2020: 100, 2021: -30 },
  il: { 1983: -40, 1994: -40, 2008: -40 },
  kw: { 1982: -50, 1990: -30, 2008: -40 },
  lb: { 1975: -30, 2019: -20, 2020: -30 },
  qa: { 2008: -28 },
  sa: { 2005: 100, 2006: -53, 2008: -56, 2014: -10, 2015: -18 },
  ae: { 2005: 100, 2006: -45, 2008: -72, 2009: 10 },
  bd: { 1996: 200, 1997: -50, 2010: 80, 2011: -37 },
  pk: { 2008: -60 },
  vn: { 2006: 145, 2007: 23, 2008: -66, 2022: -33 },
  id: { 1997: -45, 1998: -45, 1999: 60, 2008: -50 },
  th: { 1994: -20, 1995: -10, 1996: -35, 1997: -55, 1998: -10, 1999: 35, 2008: -48 },
  my: { 1993: 98, 1994: -20, 1997: -52, 1998: -2, 1999: 38, 2008: -40 },
  ph: { 1997: -41, 2008: -48 },
  sg: { 1973: -30, 1974: -50, 1997: -31, 2008: -50 },
  nz: { 1987: -40, 1988: -20, 2008: -35 },
  cl: { 1972: -40, 1975: -40, 1982: -30, 1983: -20, 1998: -25 },
  pe: { 1998: -30, 2008: -40 },
  co: { 1998: -40, 2008: -30, 2015: -40 },
  ve: { 2008: -40, 2014: -30, 2015: -50 },
  jm: { 1992: 150, 1993: -30, 1996: -40 },
}

export interface ExchangeRules {
  /** First year the exchange traded. */
  opened: number
  /** Years trading was suspended (wars, occupations): prices move on, but nobody can trade. */
  closed?: readonly (readonly [number, number])[]
  /** Why it was shut (a clause for "The exchange is closed: ..."). */
  closedWhy?: string
  /** Years a revolution nationalized every listed company (shareholders got nothing). */
  expropriated?: readonly number[]
  /** Years after an expropriation with no stock market at all, until it reopened. */
  none?: readonly (readonly [number, number])[]
}

/** Stock exchanges by home country (countries with no exchange use their region's hub). */
export const EXCHANGE_RULES: Readonly<Record<string, ExchangeRules>> = {
  us: { opened: 1792 }, gb: { opened: 1801 }, jp: { opened: 1878, closed: [[1945, 1948]], closedWhy: 'the war is over, but the occupation authorities keep it shut.' }, de: { opened: 1585 }, fr: { opened: 1724 },
  ca: { opened: 1861 }, au: { opened: 1871 }, hk: { opened: 1891, closed: [[1942, 1945]], closedWhy: 'Hong Kong is under wartime occupation.' }, in: { opened: 1875 },
  cn: { opened: 1891, closed: [[1942, 1945]], closedWhy: 'Shanghai is under wartime occupation.', expropriated: [1949], none: [[1950, 1990]] },
  kr: { opened: 1956 }, tw: { opened: 1962 }, za: { opened: 1887 }, br: { opened: 1890 }, mx: { opened: 1894 },
  ru: { opened: 1703, expropriated: [1918], none: [[1919, 1994]] },
  ar: { opened: 1854 }, tr: { opened: 1986 }, it: { opened: 1808 }, es: { opened: 1831, closed: [[1936, 1939]], closedWhy: 'civil war has split the country.' }, nl: { opened: 1602 },
  be: { opened: 1801 }, ch: { opened: 1850 }, at: { opened: 1771 }, se: { opened: 1863 }, dk: { opened: 1808 }, no: { opened: 1819 },
  fi: { opened: 1912 }, ie: { opened: 1793 }, pt: { opened: 1769, closed: [[1974, 1976]], closedWhy: 'a revolution has turned the country upside down.' }, gr: { opened: 1876, closed: [[1941, 1944]], closedWhy: 'Greece is under wartime occupation.' },
  pl: { opened: 1817, closed: [[1939, 1944]], closedWhy: 'Poland is under wartime occupation.', expropriated: [1946], none: [[1947, 1990]] },
  hu: { opened: 1864, expropriated: [1948], none: [[1949, 1989]] },
  cz: { opened: 1871, expropriated: [1948], none: [[1949, 1992]] },
  ro: { opened: 1882, expropriated: [1948], none: [[1949, 1994]] },
  rs: { opened: 1894, expropriated: [1946], none: [[1947, 1989]] },
  hr: { opened: 1918, expropriated: [1946], none: [[1947, 1990]] },
  ee: { opened: 1920, expropriated: [1940], none: [[1941, 1995]] },
  eg: { opened: 1883, expropriated: [1961], none: [[1962, 1991]] },
  ma: { opened: 1929 }, ng: { opened: 1961 }, ke: { opened: 1954 }, tn: { opened: 1969 }, ug: { opened: 1997 }, zw: { opened: 1896 },
  ir: { opened: 1967, expropriated: [1979], none: [[1980, 1988]] },
  iq: { opened: 1992, closed: [[2003, 2003]], closedWhy: 'war has come to Baghdad.' }, il: { opened: 1953 }, jo: { opened: 1978 },
  kw: { opened: 1977, closed: [[1990, 1992]], closedWhy: 'the invasion wrecked the market, and rebuilding it takes time.' }, lb: { opened: 1920, closed: [[1983, 1995]], closedWhy: 'civil war has torn Beirut apart.' }, qa: { opened: 1997 }, sa: { opened: 1985 },
  ae: { opened: 2000 }, sy: { opened: 2009 }, bd: { opened: 1954 }, pk: { opened: 1947 }, np: { opened: 1994 }, vn: { opened: 2000 },
  kz: { opened: 1993 }, mn: { opened: 1991 },
  id: { opened: 1912, closed: [[1942, 1951]], closedWhy: 'war, occupation and the fight for independence come first.', expropriated: [1958], none: [[1959, 1976]] },
  th: { opened: 1975 }, my: { opened: 1960 }, ph: { opened: 1927, closed: [[1942, 1945]], closedWhy: 'the islands are under wartime occupation.' }, sg: { opened: 1960 }, nz: { opened: 1870 },
  jm: { opened: 1968 }, bs: { opened: 2000 }, pa: { opened: 1990 }, pe: { opened: 1860 }, cl: { opened: 1893 }, co: { opened: 1928 }, ve: { opened: 1947 },
}

/** Years when private investing was impossible for residents (communist planning, revolutions). */
export const BLOCKED_INVESTING: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  ru: [[1918, 1991]], ua: [[1919, 1991]], ge: [[1921, 1991]], kz: [[1920, 1991]], mn: [[1921, 1990]], ee: [[1940, 1991]],
  pl: [[1945, 1989]], hu: [[1948, 1989]], cz: [[1948, 1989]], sk: [[1948, 1989]], ro: [[1947, 1989]], rs: [[1945, 1989]], hr: [[1945, 1990]],
  cn: [[1949, 1990]], vn: [[1976, 1999]], cu: [[1959, 2100]], et: [[1975, 1991]], ao: [[1975, 1991]], ir: [[1979, 1988]],
  sy: [[1963, 2008]], iq: [[1964, 1991]], eg: [[1961, 1991]], dz: [[1965, 1989]], af: [[1978, 2001]],
}

/** Years private gold was banned or restricted ('recall': gold had to be handed in that year). */
export const GOLD_BANS: Readonly<Record<string, readonly { from: number; to: number; recall?: boolean; note: string }[]>> = {
  us: [{ from: 1933, to: 1974, recall: true, note: 'A presidential order made it illegal for Americans to hoard gold: coins and bullion had to be sold to the government at the official price.' }],
  gb: [{ from: 1966, to: 1979, note: 'Exchange controls stop British residents from buying gold bullion and coins.' }],
  in: [{ from: 1968, to: 1990, note: 'The Gold Control Act makes it illegal to hold gold bars.' }],
  au: [{ from: 1959, to: 1976, note: 'Australians need a government licence to own gold.' }],
  cn: [{ from: 1950, to: 2001, note: 'Private gold trading is banned; the state buys and sells all of it.' }],
}

/** Governments that defaulted on their bonds, and the share of value bondholders lost. */
export const DEFAULTS: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  ru: { 1918: 1, 1998: 0.75 }, cn: { 1949: 1 }, cu: { 1960: 1 }, de: { 1948: 0.9 },
  mx: { 1982: 0.3 }, ar: { 1982: 0.3, 1989: 0.6, 2001: 0.7, 2014: 0.2, 2020: 0.45 }, br: { 1983: 0.2, 1987: 0.2, 1990: 0.5 },
  gr: { 2012: 0.535 }, ec: { 1999: 0.4, 2008: 0.6 }, ve: { 2017: 0.7 }, lb: { 2020: 0.8 }, ua: { 1998: 0.3, 2015: 0.2, 2022: 0.6 },
  pk: { 1999: 0.2 }, uy: { 2003: 0.15 }, pe: { 1984: 0.5 }, cl: { 1983: 0.2 }, ng: { 1983: 0.4 }, id: { 1998: 0.3 },
  zw: { 2006: 0.8 }, iq: { 1990: 0.8 }, jm: { 2010: 0.2, 2013: 0.1 }, et: { 2023: 0.3 }, pl: { 1946: 0.9 }, hu: { 1948: 0.9 },
  cz: { 1948: 0.9 }, ro: { 1948: 0.9 }, ee: { 1940: 1 }, eg: { 1961: 0.5 }, ir: { 1979: 0.6 }, tr: { 1978: 0.3 },
}

/** Banking crises in which depositors lost money: the share of uninsured deposits recovered. */
export const BANK_CRISES: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  us: { 1930: 0.75, 1931: 0.6, 1932: 0.7, 1933: 0.6 }, de: { 1931: 0.8, 1948: 0.07 }, at: { 1931: 0.6 }, jp: { 1946: 0.4 },
  ru: { 1918: 0.05, 1947: 0.7, 1991: 0.5, 1998: 0.4 }, ar: { 1989: 0.5, 2001: 0.4 }, br: { 1990: 0.6 },
  id: { 1998: 0.7 }, th: { 1997: 0.8 }, kr: { 1997: 0.9 }, ec: { 1999: 0.5 }, uy: { 2002: 0.7 }, ve: { 1994: 0.6 },
  lb: { 2019: 0.4, 2020: 0.3 }, ng: { 2009: 0.8 }, ua: { 2014: 0.8 }, jm: { 1996: 0.8 }, tr: { 2001: 0.85 }, zw: { 2008: 0.2 },
  mx: { 1995: 0.9 }, co: { 1999: 0.9 }, cn: { 1949: 0.1 }, gr: { 1944: 0.05 }, hu: { 1946: 0.01 },
}

/** First year each country explicitly insured bank deposits (before that, none). */
export const DEPOSIT_INSURANCE_FROM: Readonly<Record<string, number>> = {
  us: 1934, in: 1962, no: 1961, ph: 1963, ca: 1967, de: 1966, fi: 1969, jp: 1971, be: 1974, es: 1977, nl: 1979, at: 1979,
  ar: 1995, fr: 1980, gb: 1982, tr: 1983, ch: 1984, co: 1985, ve: 1985, ke: 1985, tw: 1985, cl: 1986, it: 1987, dk: 1988,
  ng: 1988, ie: 1989, mx: 1990, pt: 1992, pe: 1992, gr: 1993, ug: 1994, br: 1995, kr: 1996, se: 1996, ma: 1996, jo: 2000,
  ru: 2004, my: 2005, id: 2005, hk: 2006, sg: 2006, au: 2008, th: 2008, cn: 2015, za: 2024, nz: 2024,
}

/** The US limit per depositor in dollars of the day (year, limit). */
export const US_DEPOSIT_LIMITS: readonly (readonly [number, number])[] = [
  [1934, 5_000], [1950, 10_000], [1966, 15_000], [1969, 20_000], [1974, 40_000], [1980, 100_000], [2008, 250_000],
]

/** Inflation (%) in the hyperinflations and other high-inflation years of the proxy countries. */
export const INFLATION_EVENTS: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  at: { 1919: 150, 1920: 100, 1921: 200, 1922: 1800, 1923: 30, 1945: 100, 1946: 60, 1947: 80 },
  hu: { 1920: 100, 1921: 150, 1922: 400, 1923: 900, 1924: 200, 1945: 100000, 1946: 1e12, 1990: 30, 1991: 35, 1992: 23, 1993: 22, 1994: 19, 1995: 28, 1996: 24, 1997: 18 },
  pl: { 1920: 200, 1921: 250, 1922: 500, 1923: 10000, 1940: 50, 1941: 100, 1942: 150, 1943: 200, 1944: 200, 1989: 250, 1990: 585, 1991: 70, 1992: 43, 1993: 35, 1994: 32, 1995: 28, 1996: 20, 1997: 15 },
  gr: { 1941: 100, 1942: 2000, 1943: 3000, 1944: 1e10, 1945: 100, 1946: 50, 1973: 15, 1974: 27, 1979: 19, 1980: 25, 1981: 24, 1985: 19, 1990: 20 },
  it: { 1917: 40, 1918: 40, 1919: 25, 1920: 30, 1943: 70, 1944: 340, 1945: 100, 1946: 20, 1947: 60, 1974: 19, 1975: 17, 1976: 17, 1977: 17, 1980: 21, 1981: 19, 1982: 16, 1983: 15 },
  es: { 1946: 15, 1977: 25, 1978: 20, 1979: 16, 1980: 15, 1981: 14, 1982: 14 },
  pt: { 1975: 20, 1976: 25, 1977: 27, 1983: 25, 1984: 29 },
  ro: { 1990: 5, 1991: 170, 1992: 210, 1993: 256, 1994: 137, 1995: 32, 1996: 39, 1997: 154, 1998: 59, 1999: 46, 2000: 46 },
  rs: { 1989: 1250, 1990: 600, 1991: 120, 1992: 9000, 1993: 1e12, 1994: 1e6, 1995: 80, 1996: 90, 1997: 20, 1998: 30, 1999: 40, 2000: 70, 2001: 90 },
  hr: { 1990: 600, 1991: 120, 1992: 660, 1993: 1500, 1994: 100 },
  ua: { 1992: 2000, 1993: 10000, 1994: 400, 1995: 180, 1996: 40, 1997: 16, 1998: 11, 1999: 23, 2000: 28, 2014: 25, 2015: 43, 2022: 27 },
  ge: { 1992: 900, 1993: 15000, 1994: 8000, 1995: 160 },
  kz: { 1992: 1500, 1993: 2000, 1994: 1900, 1995: 176, 1996: 39 },
  mn: { 1991: 100, 1992: 300, 1993: 270, 1994: 90 },
  ee: { 1992: 1000, 1993: 90, 1994: 48 },
  bo: { 1982: 120, 1983: 270, 1984: 1300, 1985: 11750, 1986: 280 },
  pe: { 1983: 110, 1985: 160, 1988: 667, 1989: 3399, 1990: 7482, 1991: 409, 1992: 74 },
  cl: { 1972: 163, 1973: 508, 1974: 376, 1975: 340, 1976: 174, 1977: 92, 1978: 40 },
  uy: { 1965: 90, 1967: 100, 1968: 125, 1972: 77, 1973: 97, 1990: 129, 1991: 81 },
  ni: { 1985: 220, 1986: 680, 1987: 1300, 1988: 33000, 1989: 1700, 1990: 13000, 1991: 870 },
  il: { 1979: 110, 1980: 130, 1981: 120, 1982: 120, 1983: 190, 1984: 445, 1985: 185, 1986: 20 },
  ve: { 1989: 81, 1996: 100, 2014: 69, 2015: 180, 2016: 274, 2017: 863, 2018: 65000, 2019: 19906, 2020: 2960, 2021: 686, 2022: 234, 2023: 190, 2024: 48, 2025: 200 },
  zw: { 2000: 56, 2001: 77, 2002: 140, 2003: 431, 2004: 282, 2005: 302, 2006: 1281, 2007: 66212, 2008: 1e10, 2009: 6, 2019: 255, 2020: 557, 2021: 98, 2022: 104, 2023: 667, 2024: 100, 2025: 50 },
  ao: { 1991: 80, 1992: 300, 1993: 1400, 1994: 950, 1995: 2700, 1996: 4100, 1997: 100, 1998: 100, 1999: 250, 2000: 300, 2001: 150, 2002: 100, 2003: 98, 2004: 43 },
  cd: { 1991: 2000, 1992: 4000, 1993: 4600, 1994: 23000, 1995: 500, 1996: 700, 1997: 200, 1998: 30, 1999: 300, 2000: 500, 2001: 300 },
  ng: { 1988: 50, 1989: 50, 1993: 57, 1994: 57, 1995: 73, 1996: 29 },
  lb: { 1986: 100, 1987: 500, 1988: 100, 1989: 70, 1990: 70, 1991: 50, 1992: 100, 2020: 85, 2021: 154, 2022: 171, 2023: 221, 2024: 46 },
  ir: { 1980: 23, 1988: 29, 1995: 49, 1996: 23, 2013: 35, 2019: 41, 2020: 47, 2021: 40, 2022: 46, 2023: 41, 2024: 32, 2025: 40 },
  sy: { 2013: 80, 2014: 20, 2015: 40, 2016: 50, 2020: 110, 2021: 100, 2022: 70, 2023: 100 },
  vn: { 1986: 400, 1987: 360, 1988: 400, 1989: 35 },
  id: { 1960: 20, 1962: 100, 1963: 120, 1965: 300, 1966: 1100, 1967: 170, 1968: 120, 1998: 58 },
  iq: { 1992: 80, 1993: 200, 1994: 450, 1995: 380, 1996: 15 },
  ec: { 1988: 58, 1989: 75, 1999: 60, 2000: 96, 2001: 37 },
  do: { 1990: 100, 2003: 42 },
  jm: { 1991: 80, 1992: 40 },
  py: { 1990: 40 },
  et: { 2008: 25, 2020: 20, 2021: 27, 2022: 34, 2023: 30 },
  eg: { 2017: 30, 2023: 34, 2024: 28 },
  cu: { 2021: 70, 2022: 40, 2023: 30 },
  ht: { 2019: 20, 2020: 23, 2021: 16, 2022: 27, 2023: 40 },
}

/**
 * Recessions (negative) and booms (positive) behind the business cycle, -1 (the Great
 * Depression) … +1. 'world' events reach every country (scaled by `reach`); the rest are local.
 */
export interface CycleEvent {
  from: number
  to: number
  score: number
  where: 'world' | readonly string[]
  /** For world events: the share of the shock felt by countries not in `core` (default 0.6). */
  reach?: number
  core?: readonly string[]
}

const WEST = ['us', 'gb', 'de', 'fr', 'it', 'nl', 'be', 'ch', 'at', 'se', 'dk', 'no', 'fi', 'ie', 'es', 'pt', 'ca', 'au', 'nz', 'jp']
const EUROPE_WEST = ['gb', 'de', 'fr', 'it', 'nl', 'be', 'ch', 'at', 'se', 'dk', 'no', 'fi', 'ie', 'es', 'pt', 'gr']
const OCCUPIED_WWII = ['fr', 'nl', 'be', 'no', 'dk', 'gr', 'pl', 'cz', 'sk', 'hu', 'ro', 'rs', 'hr', 'ee', 'ua', 'ph', 'sg', 'my', 'id', 'hk', 'cn', 'kr', 'vn', 'th']
const SOVIET = ['ru', 'ua', 'ge', 'kz', 'ee', 'mn']
const EASTERN_BLOC = ['pl', 'hu', 'cz', 'sk', 'ro', 'rs', 'hr']
const GULF = ['sa', 'kw', 'ae', 'qa', 'ir', 'iq']
const OIL_EXPORTERS = ['sa', 'kw', 'ae', 'qa', 'ir', 'iq', 'ng', 've', 'mx', 'ao', 'ru', 'kz', 'no']
const ASIA_CRISIS = ['th', 'id', 'kr', 'my', 'ph']
const LATAM_DEBT = ['mx', 'br', 'ar', 'cl', 'pe', 'co', 've', 'uy', 'bo', 'ec', 'py']

export const CYCLE_EVENTS: readonly CycleEvent[] = [
  { from: 1907, to: 1908, score: -0.4, where: 'world', core: ['us'], reach: 0.4 },
  { from: 1914, to: 1914, score: -0.3, where: 'world', reach: 0.5 },
  { from: 1915, to: 1918, score: -0.3, where: ['de', 'at', 'fr', 'ru', 'it', 'be', 'hu'] },
  { from: 1920, to: 1921, score: -0.6, where: 'world', reach: 0.6 },
  { from: 1922, to: 1923, score: -0.8, where: ['de', 'at', 'hu', 'pl'] },
  { from: 1918, to: 1922, score: -0.9, where: SOVIET },
  { from: 1925, to: 1929, score: 0.35, where: ['us', 'ca', 'fr'] },
  { from: 1930, to: 1930, score: -0.6, where: 'world', reach: 0.75 },
  { from: 1931, to: 1931, score: -0.9, where: 'world', reach: 0.75 },
  { from: 1932, to: 1932, score: -1, where: 'world', reach: 0.75 },
  { from: 1933, to: 1933, score: -0.7, where: 'world', reach: 0.7 },
  { from: 1934, to: 1935, score: -0.35, where: 'world', reach: 0.7 },
  { from: 1938, to: 1938, score: -0.5, where: ['us'] },
  { from: 1940, to: 1945, score: -0.8, where: OCCUPIED_WWII },
  { from: 1941, to: 1945, score: -0.9, where: SOVIET },
  { from: 1942, to: 1944, score: 0.5, where: ['us', 'ca', 'au'] },
  { from: 1944, to: 1948, score: -0.9, where: ['de', 'jp', 'it', 'at'] },
  { from: 1946, to: 1949, score: -0.8, where: ['cn'] },
  { from: 1946, to: 1946, score: -0.3, where: ['us'] },
  { from: 1949, to: 1949, score: -0.2, where: ['us'] },
  { from: 1950, to: 1953, score: -0.9, where: ['kr'] },
  { from: 1950, to: 1972, score: 0.3, where: 'world', core: WEST, reach: 0.4 },
  { from: 1951, to: 1965, score: 0.4, where: ['de', 'it', 'at', 'jp'] },
  { from: 1955, to: 1973, score: 0.4, where: ['jp'] },
  { from: 1954, to: 1954, score: -0.3, where: ['us'] },
  { from: 1958, to: 1958, score: -0.4, where: ['us', 'ca'] },
  { from: 1959, to: 1961, score: -1, where: ['cn'] },
  { from: 1966, to: 1968, score: -0.6, where: ['cn'] },
  { from: 1965, to: 1966, score: -0.6, where: ['id'] },
  { from: 1965, to: 1995, score: 0.5, where: ['kr', 'tw', 'sg', 'hk'] },
  { from: 1968, to: 1973, score: 0.6, where: ['br'] },
  { from: 1970, to: 1970, score: -0.2, where: ['us'] },
  { from: 1974, to: 1975, score: -0.55, where: 'world', reach: 0.6 },
  { from: 1974, to: 1981, score: 0.7, where: GULF },
  { from: 1980, to: 1980, score: -0.4, where: ['us', 'ca'] },
  { from: 1981, to: 1982, score: -0.5, where: 'world', reach: 0.5 },
  { from: 1982, to: 1983, score: -0.7, where: LATAM_DEBT },
  { from: 1984, to: 1985, score: -0.35, where: LATAM_DEBT },
  { from: 1986, to: 1987, score: -0.5, where: OIL_EXPORTERS.filter((c) => c !== 'no' && c !== 'ru') },
  { from: 1979, to: 1981, score: -0.8, where: ['ir'] },
  { from: 1980, to: 1988, score: -0.6, where: ['iq', 'ir'] },
  { from: 1986, to: 1990, score: 0.4, where: ['jp'] },
  { from: 1990, to: 1991, score: -0.4, where: ['us', 'gb', 'ca', 'au', 'nz'] },
  { from: 1991, to: 1993, score: -0.7, where: ['fi', 'se', 'no'] },
  { from: 1992, to: 1993, score: -0.35, where: EUROPE_WEST },
  { from: 1990, to: 1995, score: -0.8, where: [...SOVIET, ...EASTERN_BLOC.slice(0, 2)] },
  { from: 1990, to: 1992, score: -0.6, where: EASTERN_BLOC },
  { from: 1991, to: 1995, score: -0.9, where: ['rs', 'hr'] },
  { from: 1992, to: 2003, score: -0.3, where: ['jp'] },
  { from: 1998, to: 1998, score: -0.5, where: ['jp'] },
  { from: 1992, to: 2015, score: 0.7, where: ['cn'] },
  { from: 1995, to: 1995, score: -0.8, where: ['mx'] },
  { from: 1995, to: 1995, score: -0.4, where: ['ar'] },
  { from: 1997, to: 1998, score: -0.9, where: ASIA_CRISIS },
  { from: 1998, to: 1998, score: -0.5, where: ['hk', 'sg', 'jp'] },
  { from: 1998, to: 1999, score: -0.8, where: ['ru', 'ua', 'kz'] },
  { from: 1999, to: 1999, score: -0.4, where: ['br', 'ec', 'co'] },
  { from: 1995, to: 2007, score: 0.6, where: ['ie'] },
  { from: 1996, to: 2000, score: 0.35, where: ['us'] },
  { from: 2001, to: 2001, score: -0.3, where: 'world', core: ['us'], reach: 0.5 },
  { from: 2001, to: 2002, score: -1, where: ['ar', 'uy'] },
  { from: 2001, to: 2001, score: -0.8, where: ['tr'] },
  { from: 2000, to: 2008, score: 0.6, where: ['ru', 'kz'] },
  { from: 2003, to: 2010, score: 0.5, where: ['in'] },
  { from: 2003, to: 2008, score: 0.5, where: GULF },
  { from: 1998, to: 2007, score: 0.4, where: ['es'] },
  { from: 2004, to: 2010, score: 0.4, where: ['br'] },
  { from: 2008, to: 2008, score: -0.4, where: 'world', reach: 0.6 },
  { from: 2009, to: 2009, score: -0.8, where: 'world', reach: 0.55 },
  { from: 2009, to: 2010, score: -0.8, where: ['ie', 'gr', 'ee', 'ua'] },
  { from: 2010, to: 2013, score: -0.9, where: ['gr'] },
  { from: 2011, to: 2013, score: -0.5, where: ['pt', 'es', 'it', 'ie'] },
  { from: 2014, to: 2020, score: -1, where: ['ve'] },
  { from: 2015, to: 2016, score: -0.8, where: ['br'] },
  { from: 2015, to: 2016, score: -0.5, where: ['ru', 'ng', 'sa', 'kz'] },
  { from: 2018, to: 2019, score: -0.6, where: ['ar', 'tr'] },
  { from: 2019, to: 2021, score: -1, where: ['lb'] },
  { from: 2020, to: 2020, score: -0.9, where: 'world', reach: 0.9 },
  { from: 2021, to: 2021, score: 0.4, where: 'world', reach: 0.8 },
  { from: 2022, to: 2022, score: -0.3, where: ['ru'] },
  { from: 2022, to: 2023, score: -0.9, where: ['ua'] },
  { from: 2011, to: 2025, score: -0.9, where: ['sy'] },
  { from: 2022, to: 2023, score: -0.5, where: ['pk', 'eg'] },
]

/** One-line headlines for the financial news ('world' notes reach every market). */
export const WORLD_NOTES: Readonly<Record<number, string>> = {
  1907: 'The Panic of 1907: bank runs spread until a group of bankers pools money to stop them.',
  1914: 'War breaks out in Europe and stock exchanges shut their doors for months.',
  1920: 'A sharp postwar slump: prices, profits and share prices all tumble.',
  1927: 'The Roaring Twenties bull market is in full swing.',
  1928: 'Everyone is buying shares on borrowed money. What could go wrong?',
  1929: 'The Great Crash: Black Tuesday ends the Roaring Twenties.',
  1930: 'The crash turns into the Great Depression.',
  1931: 'Banks fail by the thousand and the Depression deepens.',
  1932: 'The bottom of the Great Depression: shares are worth a fraction of their 1929 peak.',
  1933: 'A new government, a bank holiday and a huge relief rally.',
  1937: 'The recession within the Depression knocks shares down again.',
  1939: 'War breaks out in Europe.',
  1940: 'War spreads across Europe and the markets brace.',
  1941: 'The war becomes a world war.',
  1945: 'The Second World War ends.',
  1954: 'A postwar boom: shares finally pass their 1929 peak.',
  1962: 'A sudden spring slide spooks the bull market.',
  1966: 'Rising interest rates end the go-go years of the early sixties.',
  1969: 'Inflation and a slowing economy bring the bull market to a halt.',
  1973: 'The oil embargo quadruples oil prices and the Nifty Fifty collapse.',
  1974: 'Stagflation: soaring prices, a deep recession and a brutal bear market.',
  1975: 'A huge relief rally as the worst of the oil shock passes.',
  1979: 'A second oil shock sends inflation back into double digits.',
  1980: 'Inflation peaks and gold hits a record high.',
  1981: 'Central banks raise interest rates to near 20% to break inflation.',
  1982: 'Interest rates finally fall and a great bull market begins.',
  1987: 'Black Monday: markets drop more than 20% in a single day, then claw their way back.',
  1990: 'A Gulf War oil spike and a recession.',
  1995: 'The internet arrives and tech stocks take off.',
  1996: 'Irrational exuberance? Shares keep climbing.',
  1997: 'The Asian financial crisis rattles markets worldwide.',
  1998: 'Russia defaults, a giant hedge fund implodes, and dot-com stocks keep soaring anyway.',
  1999: 'Dot-com mania: any company with ".com" in its name doubles overnight.',
  2000: 'The dot-com bubble bursts.',
  2001: 'The dot-com bust deepens, and the September 11 attacks shake the world.',
  2002: 'Accounting scandals at giant companies end the slide in a final capitulation.',
  2003: 'Markets bounce back from the dot-com bust.',
  2006: 'Cheap credit and a housing boom lift almost everything.',
  2007: 'Cracks appear in the housing market.',
  2008: 'The global financial crisis: a giant investment bank collapses and markets crash.',
  2009: 'Governments bail out the banks and markets rebound from the lows.',
  2010: 'The euro debt crisis begins in Greece.',
  2011: 'The euro debt crisis spreads and markets lurch.',
  2013: 'Central banks keep printing money and stocks climb.',
  2015: 'An oil price collapse and a wobble in China.',
  2018: 'A trade war and rising rates end the year in the red.',
  2020: 'A pandemic: markets crash in March, then stage a record rebound.',
  2021: 'Meme stocks, crypto mania and cheap money everywhere.',
  2022: 'Inflation returns and central banks hike interest rates fast.',
  2023: 'The artificial intelligence boom lifts tech stocks.',
  2024: 'The AI boom keeps rolling.',
  2025: 'Tariff turmoil in the spring, then the AI boom carries markets higher.',
}

/** Local headlines that replace the world note in that market. */
export const LOCAL_NOTES: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  jp: {
    1946: 'Tokyo\'s stock exchange stays closed under the occupation while prices soar.',
    1949: 'The Tokyo Stock Exchange reopens.',
    1972: 'A land and stock boom sweeps Japan.',
    1987: 'Japan\'s bubble economy is in full swing.',
    1989: 'The Nikkei hits a record high. Tokyo land is said to be worth more than all of America.',
    1990: 'Japan\'s bubble bursts: the Nikkei loses almost 40%.',
    1992: 'Japan\'s banks drown in bad loans as the bust drags on.',
    1997: 'Big Japanese banks and brokers fail.',
    2003: 'The Nikkei sinks to a 20-year low.',
    2011: 'An earthquake and tsunami hit Japan.',
    2013: 'Bold money printing sends Japanese shares soaring.',
    2024: 'The Nikkei finally beats its 1989 record, 34 years later.',
  },
  gb: {
    1974: 'Britain\'s worst stock market crash: a property and banking crisis, strikes and three-day weeks.',
    1975: 'British shares double in a spectacular recovery.',
    1992: 'Black Wednesday: the pound crashes out of the European exchange-rate system.',
    2016: 'Britain votes to leave the European Union.',
  },
  de: {
    1922: 'Hyperinflation: German money loses its value by the hour.',
    1923: 'Prices double every few days. Savings and bonds become worthless.',
    1948: 'A currency reform wipes out savings but starts an economic miracle.',
    1954: 'Germany\'s economic miracle lifts shares year after year.',
    1990: 'Germany reunifies.',
  },
  fr: {
    1968: 'Student protests and a general strike paralyze France.',
    1981: 'A new government nationalizes the big banks and industrial groups.',
  },
  hk: {
    1942: 'Hong Kong is under occupation and its stock exchange is closed.',
    1973: 'Hong Kong\'s stock mania ends in a crash.',
    1982: 'Talks over Hong Kong\'s future spook its market.',
    1989: 'Turmoil in Beijing rattles Hong Kong.',
    1997: 'Hong Kong returns to China, then the Asian crisis hits.',
  },
  cn: {
    1937: 'Full-scale war with Japan reaches Shanghai.',
    1948: 'Hyperinflation: the currency collapses as the civil war ends.',
    1949: 'The revolution nationalizes private companies. The old stock exchange closes for good.',
    1991: 'China opens a stock exchange in Shanghai for the first time in 40 years.',
    2007: 'Chinese share mania: the Shanghai index doubles in a year.',
    2008: 'China\'s share bubble bursts.',
    2015: 'A margin-trading mania in Chinese shares ends in a summer crash.',
  },
  ru: {
    1917: 'Revolution in Russia.',
    1918: 'The new government nationalizes industry and banks and repudiates the old bonds.',
    1992: 'Prices are freed and the ruble collapses.',
    1996: 'Russian shares rocket as foreign money pours in.',
    1998: 'Russia defaults on its debt and devalues the ruble. Banks collapse.',
    2008: 'Oil crashes and Russian shares lose three quarters of their value.',
    2014: 'Sanctions and an oil collapse send the ruble tumbling.',
    2022: 'War and sanctions: trading is suspended for a month and foreign investors are locked in.',
  },
  in: {
    1991: 'A balance-of-payments crisis forces India to open up its economy.',
    1992: 'A stock-market scam ends a frenzied boom in Indian shares.',
    2008: 'Indian shares halve in the global crash.',
  },
  kr: {
    1997: 'The Asian crisis: Korea needs an emergency loan as the won collapses.',
    2025: 'Korean shares soar on chip demand and market reforms.',
  },
  tw: { 1989: 'Taiwan\'s stock mania peaks.', 1990: 'Taiwan\'s bubble bursts: shares lose almost 80% from the peak.' },
  th: { 1997: 'The baht collapses and the Asian financial crisis begins in Thailand.' },
  id: { 1998: 'The rupiah collapses, riots break out and a long-ruling government falls.' },
  my: { 1998: 'Malaysia imposes capital controls to stop money fleeing.' },
  mx: { 1982: 'Mexico runs out of dollars, nationalizes its banks and the peso collapses.', 1994: 'The Tequila crisis: the peso collapses.', 1995: 'Mexico needs an emergency rescue as the peso crisis bites.' },
  br: { 1990: 'A new government freezes most bank accounts to fight hyperinflation.', 1994: 'A new currency, the real, finally tames inflation.', 1999: 'Brazil devalues the real.' },
  ar: {
    1989: 'Hyperinflation: prices rise thousands of percent and time deposits are swapped for bonds.',
    1991: 'The peso is pegged to the dollar and shares take off.',
    2001: 'Bank accounts are frozen and Argentina defaults on its debt.',
    2002: 'The peso peg breaks and savings are converted at a loss.',
    2018: 'A currency crisis forces Argentina back to the IMF.',
    2024: 'Argentine shares soar as inflation falls.',
  },
  tr: { 1994: 'A currency crisis halves the lira.', 2001: 'A banking crisis and a lira crash.', 2018: 'The lira loses almost 30%.', 2022: 'Inflation tops 70% while interest rates are cut.' },
  gr: { 2010: 'Greece needs a bailout as the euro crisis begins.', 2012: 'Greece restructures its debt: bondholders lose more than half.', 2015: 'Greek banks close for three weeks and capital controls arrive.' },
  ie: { 2008: 'Ireland\'s property bubble bursts and its banks need rescuing.' },
  es: { 1936: 'Civil war: the Madrid exchange closes.', 2008: 'Spain\'s housing boom turns to bust.' },
  fi: { 1999: 'A mobile-phone giant makes the Helsinki market one of the world\'s hottest.', 1991: 'Finland\'s banking crisis and a deep depression.' },
  se: { 1992: 'A banking crisis: Sweden rescues its banks and lets the krona float.' },
  pl: { 1991: 'The Warsaw Stock Exchange reopens after half a century.', 1993: 'Polish shares rise more than tenfold in a single year.' },
  hu: { 1990: 'The Budapest Stock Exchange reopens.' },
  cz: { 1993: 'Prague\'s stock exchange reopens after the fall of communism.' },
  eg: { 1961: 'Egypt nationalizes banks, insurers and big industry.', 1992: 'Egypt\'s stock exchange comes back to life.' },
  ir: { 1979: 'Revolution in Iran: banks and big industry are nationalized.', 1989: 'Tehran\'s stock exchange reopens.' },
  kw: { 1982: 'An unofficial stock market crashes, leaving a mountain of bad checks.', 1990: 'Iraq invades Kuwait and the exchange shuts.' },
  sa: { 2006: 'Saudi Arabia\'s stock bubble bursts, halving the market.' },
  ae: { 2008: 'Dubai\'s property and stock boom collapses.', 2009: 'Dubai asks to delay its debt payments.' },
  ve: { 2018: 'Hyperinflation tops 60,000%.' },
  zw: { 2008: 'Hyperinflation: prices double every day and the currency is abandoned.' },
  lb: { 2019: 'Banks freeze deposits as Lebanon\'s financial system collapses.', 2020: 'Lebanon defaults on its debt.' },
  ua: { 1993: 'Hyperinflation in newly independent Ukraine.', 2014: 'Crisis and conflict send the hryvnia tumbling.', 2022: 'Full-scale war.' },
  vn: { 2000: 'Vietnam opens its first stock exchange.', 2008: 'Vietnam\'s stock bubble bursts.' },
  nz: { 1987: 'New Zealand\'s share market loses more than half after Black Monday.' },
  pt: { 1974: 'A revolution in Portugal: the Lisbon exchange closes for two years.' },
}

/** Real house-price changes (%) in the booms and busts of the proxy countries. */
export const HOUSING_EVENTS: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  es: { 1998: 6, 1999: 8, 2000: 8, 2001: 10, 2002: 12, 2003: 14, 2004: 13, 2005: 10, 2006: 6, 2007: 2, 2008: -5, 2009: -8, 2010: -6, 2011: -10, 2012: -12, 2013: -9, 2014: -1 },
  ie: { 1996: 10, 1997: 12, 1998: 15, 1999: 15, 2000: 10, 2001: 5, 2002: 6, 2003: 10, 2004: 8, 2005: 8, 2006: 10, 2007: -8, 2008: -12, 2009: -18, 2010: -12, 2011: -15, 2012: -10 },
  nl: { 1978: 10, 1979: 5, 1980: -15, 1981: -15, 1982: -10, 2009: -5, 2010: -3, 2011: -5, 2012: -8, 2013: -7 },
  dk: { 2005: 15, 2006: 15, 2007: -2, 2008: -8, 2009: -12, 2010: 0, 2011: -5, 2012: -4 },
  se: { 1990: -5, 1991: -10, 1992: -15, 1993: -10, 2022: -12, 2023: -8 },
  fi: { 1987: 15, 1988: 25, 1989: 5, 1990: -15, 1991: -15, 1992: -15, 1993: -8 },
  no: { 1988: -8, 1989: -10, 1990: -10, 1991: -8, 1992: -5 },
  it: { 2012: -6, 2013: -6, 2014: -5, 2015: -3 },
  gr: { 2009: -5, 2010: -8, 2011: -10, 2012: -12, 2013: -10, 2014: -7, 2015: -5, 2016: -3, 2017: -2 },
  nz: { 2003: 15, 2004: 10, 2005: 10, 2006: 8, 2007: 6, 2008: -10, 2021: 20, 2022: -12, 2023: -8 },
  sg: { 1996: 10, 1997: -15, 1998: -25, 2013: 0, 2014: -5, 2015: -4 },
  th: { 1997: -20, 1998: -20 },
  my: { 1997: -15, 1998: -20 },
  id: { 1998: -40 },
  ar: { 2002: -40 },
  br: { 2015: -12, 2016: -8, 2017: -4, 2018: -3 },
  mx: { 1995: -25 },
  ru: { 1998: -40, 2008: -15, 2015: -15 },
  tr: { 2018: -12, 2019: -10, 2022: 40 },
  ae: { 2005: 30, 2006: 25, 2007: 30, 2008: -25, 2009: -30, 2010: -15, 2015: -8, 2016: -8, 2017: -6, 2018: -8, 2019: -8, 2021: 10, 2022: 15, 2023: 15, 2024: 15 },
}

/** Sector stories outside the US: excess return vs the local market (%), e.g. Japan's banks after 1990. */
export const LOCAL_SECTOR_EVENTS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<number, number>>>>>> = {
  jp: {
    banks: { 1990: -20, 1991: -10, 1992: -25, 1995: -15, 1997: -30, 1998: -20, 2002: -30, 2003: 20 },
    property: { 1987: 30, 1988: 20, 1990: -30, 1991: -20, 1992: -30, 1993: -10, 2005: 40, 2007: -20, 2008: -30 },
    construction: { 1990: -20, 1992: -20 },
  },
  es: {
    banks: { 2008: -15, 2010: -20, 2011: -15, 2012: -30 },
    property: { 2007: -30, 2008: -60, 2009: -30, 2010: -30, 2011: -30, 2012: -20 },
    construction: { 2007: -20, 2008: -40, 2009: -20, 2010: -20, 2011: -20, 2012: -20 },
  },
  ie: { banks: { 2007: -40, 2008: -80, 2009: -50, 2010: -60 }, property: { 2007: -30, 2008: -50, 2009: -30 }, construction: { 2008: -50 } },
  gr: { banks: { 2010: -30, 2011: -50, 2012: -50, 2015: -60 } },
  it: { banks: { 2011: -20, 2016: -40 } },
  se: { banks: { 1990: -30, 1991: -40, 1992: -40 } },
  fi: { banks: { 1990: -30, 1991: -40, 1992: -40 } },
  no: { banks: { 1990: -30, 1991: -40, 1992: -30 } },
  cn: { property: { 2021: -50, 2022: -40, 2023: -50, 2024: -20 }, construction: { 2021: -20, 2022: -20 } },
  hk: { property: { 1998: -20, 2022: -15 } },
  gb: { banks: { 1973: -20, 1974: -40, 2008: -40 }, property: { 1972: 40, 1973: -30, 1974: -60, 1990: -30, 2008: -40 } },
  ae: { property: { 2008: -40, 2009: -30 } },
  th: { banks: { 1997: -40, 1998: -30 } },
  id: { banks: { 1997: -40, 1998: -50 } },
  kr: { banks: { 1997: -40, 1998: -30 } },
  my: { banks: { 1997: -40, 1998: -30 } },
  ru: { banks: { 1998: -60 } },
  ar: { banks: { 2001: -30, 2002: -30 } },
  mx: { banks: { 1994: -20, 1995: -40 } },
}
