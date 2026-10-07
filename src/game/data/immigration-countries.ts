// Per-country immigration law for all 102 playable countries (approximate, era-aware).
// Fields are documented on CountryLaw (immigration.ts). Numbers are game-scaled but grounded:
// passport strength ≈ the 2020s visa-free share; strictness ≈ how hard a discretionary visa is
// to get; natz = years of residence before naturalization (null where foreigners practically
// never naturalize: the Gulf monarchies, mainland China, Lebanon...).
import type { Anchors, CountryLaw, DualRule, ExitTaxRule, PointsSystem } from './immigration'

interface Spec {
  pass: number
  passHist?: Anchors<number>
  strict: number | Anchors<number>
  points?: PointsSystem[]
  natz: number | null | Anchors<number | null>
  natzFrom?: 'arrival' | 'pr'
  pr: number | null
  dual: DualRule | Anchors<DualRule>
  soli?: number | null | Anchors<number | null>
  lang: string
  border: number | Anchors<number>
  enforce: number | Anchors<number>
  asylum: number | null | Anchors<number>
  exitTax?: ExitTaxRule
}

function anchors<T>(v: T | Anchors<T>): Anchors<T> {
  return Array.isArray(v) ? (v as Anchors<T>) : [[1900, v as T]]
}

function law(id: string, s: Spec): CountryLaw {
  return {
    id,
    pass: s.pass,
    passHist: s.passHist,
    strict: anchors(s.strict),
    points: s.points,
    natz: anchors<number | null>(s.natz),
    natzFrom: s.natzFrom ?? 'arrival',
    pr: s.pr,
    dual: anchors(s.dual),
    soli: anchors<number | null>(s.soli ?? null),
    lang: s.lang,
    border: anchors(s.border),
    enforce: anchors(s.enforce),
    asylum: s.asylum === null ? null : anchors(s.asylum),
    exitTax: s.exitTax,
  }
}

// Shared histories.
const SOVIET_PASS: Anchors<number> = [[1900, 40], [1917, 15], [1991, 28], [2005, 40]]
const EAST_BLOC_PASS: Anchors<number> = [[1900, 45], [1939, 25], [1948, 15], [1989, 25], [1995, 55], [2004, 85]]
const US_STRICT: Anchors<number> = [[1900, 0.15], [1917, 0.3], [1921, 0.5], [1924, 0.7], [1952, 0.65], [1965, 0.55], [1990, 0.55], [2001, 0.65], [2017, 0.75], [2021, 0.65], [2025, 0.75]]
const US_ENFORCE: Anchors<number> = [[1900, 0.01], [1954, 0.03], [1960, 0.01], [1996, 0.025], [2017, 0.04], [2021, 0.03], [2025, 0.06]]

export const COUNTRY_LAWS: CountryLaw[] = [
  // ----- North America & the Caribbean -----
  law('us', {
    pass: 93, passHist: [[1900, 62], [1945, 60], [1970, 75], [1990, 85], [2010, 92]],
    strict: US_STRICT, natz: 5, natzFrom: 'pr', pr: 5, dual: [[1900, 'limited'], [1967, 'yes']], soli: 0, lang: 'English',
    border: [[1900, 0.2], [1924, 0.3], [1994, 0.5], [2006, 0.6], [2025, 0.65]], enforce: US_ENFORCE, asylum: [[1900, 0.3], [1980, 0.45], [2017, 0.35], [2021, 0.45], [2025, 0.3]],
    exitTax: { from: 2008, threshold: 2_000_000, rate: 0.238, name: 'the US expatriation tax', on: 'renounce' },
  }),
  law('aw', { pass: 96, strict: 0.6, natz: 5, pr: 5, dual: 'limited', lang: 'Dutch', border: 0.6, enforce: 0.04, asylum: 0.05 }),
  law('bs', { pass: 81, strict: 0.6, natz: 10, pr: 10, dual: 'no', lang: 'English', border: 0.6, enforce: 0.06, asylum: 0.05 }),
  law('bz', { pass: 52, strict: 0.45, natz: 5, pr: 1, dual: 'yes', soli: 0, lang: 'English', border: 0.3, enforce: 0.03, asylum: 0.3 }),
  law('ca', {
    pass: 95, strict: [[1900, 0.2], [1914, 0.35], [1930, 0.6], [1947, 0.45], [1967, 0.4], [2025, 0.45]],
    points: [{ from: 1967, pass: 67, result: 'permanent', name: 'Federal Skilled Worker points test' }],
    natz: [[1900, 5], [1977, 3], [2015, 4], [2017, 3]], natzFrom: 'pr', pr: 2, dual: [[1900, 'no'], [1977, 'yes']], soli: 0, lang: 'English',
    border: 0.7, enforce: 0.03, asylum: 0.6,
    exitTax: { from: 1972, threshold: 500_000, rate: 0.27, name: 'the Canadian departure tax', on: 'leave' },
  }),
  law('cr', { pass: 77, strict: 0.45, natz: 7, pr: 3, dual: 'yes', soli: 0, lang: 'Spanish', border: 0.35, enforce: 0.02, asylum: 0.5 }),
  law('cu', { pass: 33, passHist: [[1900, 45], [1959, 25], [2013, 30]], strict: 0.9, natz: 5, pr: null, dual: 'no', soli: 0, lang: 'Spanish', border: 0.7, enforce: 0.05, asylum: 0.05 }),
  law('do', { pass: 37, strict: 0.55, natz: 7, pr: 5, dual: 'yes', soli: [[1900, 0], [2010, null]], lang: 'Spanish', border: 0.4, enforce: 0.04, asylum: 0.05 }),
  law('sv', { pass: 70, strict: 0.6, natz: 5, pr: 5, dual: 'yes', soli: 0, lang: 'Spanish', border: 0.3, enforce: 0.02, asylum: 0.1 }),
  law('gt', { pass: 69, strict: 0.6, natz: 5, pr: 5, dual: 'limited', soli: 0, lang: 'Spanish', border: 0.3, enforce: 0.02, asylum: 0.1 }),
  law('ht', { pass: 26, strict: 0.8, natz: 5, pr: 5, dual: [[1900, 'no'], [2012, 'yes']], lang: 'French', border: 0.3, enforce: 0.02, asylum: 0.05 }),
  law('jm', { pass: 46, strict: 0.6, natz: 5, pr: 5, dual: 'yes', soli: 0, lang: 'English', border: 0.6, enforce: 0.04, asylum: 0.1 }),
  law('mx', { pass: 82, strict: 0.45, natz: 5, pr: 4, dual: [[1900, 'no'], [1998, 'yes']], soli: 0, lang: 'Spanish', border: 0.35, enforce: 0.04, asylum: 0.35 }),
  law('ni', { pass: 65, strict: 0.7, natz: 4, pr: 3, dual: 'limited', soli: 0, lang: 'Spanish', border: 0.3, enforce: 0.02, asylum: 0.1 }),
  law('pa', { pass: 74, strict: 0.35, natz: 5, pr: 5, dual: 'yes', soli: 0, lang: 'Spanish', border: 0.35, enforce: 0.03, asylum: 0.2 }),
  // Puerto Rico follows US federal immigration law (Puerto Ricans are US citizens since 1917).
  law('pr', {
    pass: 93, passHist: [[1900, 62], [1945, 60], [1970, 75], [1990, 85], [2010, 92]],
    strict: US_STRICT, natz: 5, natzFrom: 'pr', pr: 5, dual: [[1900, 'limited'], [1967, 'yes']], soli: 0, lang: 'Spanish',
    border: 0.6, enforce: US_ENFORCE, asylum: [[1900, 0.3], [1980, 0.45]],
  }),

  // ----- South America -----
  law('ar', { pass: 89, strict: [[1900, 0.1], [1930, 0.4], [1945, 0.35], [2004, 0.3]], natz: 2, pr: 3, dual: 'yes', soli: 0, lang: 'Spanish', border: 0.3, enforce: 0.01, asylum: 0.4 }),
  law('bo', { pass: 41, strict: 0.5, natz: 3, pr: 2, dual: [[1900, 'no'], [2009, 'yes']], soli: 0, lang: 'Spanish', border: 0.25, enforce: 0.01, asylum: 0.2 }),
  law('br', { pass: 88, strict: [[1900, 0.1], [1934, 0.45], [1980, 0.5], [2017, 0.45]], natz: 4, pr: 4, dual: [[1900, 'no'], [1994, 'yes']], soli: 0, lang: 'Portuguese', border: 0.25, enforce: 0.01, asylum: 0.4 }),
  law('cl', { pass: 91, strict: [[1900, 0.2], [1930, 0.45]], natz: 5, pr: 1, dual: [[1900, 'no'], [2005, 'yes']], soli: 0, lang: 'Spanish', border: 0.4, enforce: 0.02, asylum: 0.2 }),
  law('co', { pass: 70, strict: 0.45, natz: 5, pr: 5, dual: [[1900, 'no'], [1991, 'yes']], lang: 'Spanish', border: 0.3, enforce: 0.01, asylum: 0.2 }),
  law('ec', { pass: 48, strict: 0.4, natz: 3, pr: 2, dual: 'yes', soli: 0, lang: 'Spanish', border: 0.3, enforce: 0.01, asylum: 0.4 }),
  law('gy', { pass: 47, strict: 0.55, natz: 5, pr: 5, dual: 'yes', soli: 0, lang: 'English', border: 0.3, enforce: 0.02, asylum: 0.1 }),
  law('py', { pass: 77, strict: 0.35, natz: 3, pr: 2, dual: 'limited', soli: 0, lang: 'Spanish', border: 0.25, enforce: 0.01, asylum: 0.2 }),
  law('pe', { pass: 71, strict: 0.45, natz: 2, pr: 3, dual: 'yes', soli: 0, lang: 'Spanish', border: 0.3, enforce: 0.02, asylum: 0.2 }),
  law('uy', { pass: 80, strict: [[1900, 0.15], [1930, 0.35]], natz: 5, pr: 2, dual: 'yes', soli: 0, lang: 'Spanish', border: 0.3, enforce: 0.01, asylum: 0.4 }),
  law('ve', { pass: 64, passHist: [[1900, 45], [1960, 60], [1990, 70], [2010, 75], [2020, 64]], strict: [[1900, 0.5], [1948, 0.25], [1959, 0.6], [2000, 0.7]], natz: 10, pr: 3, dual: 'yes', soli: 0, lang: 'Spanish', border: 0.4, enforce: 0.02, asylum: 0.1 }),

  // ----- Europe -----
  law('ad', { pass: 89, strict: 0.6, natz: 20, pr: 10, dual: [[1900, 'no'], [2022, 'limited']], lang: 'Catalan', border: 0.4, enforce: 0.05, asylum: 0.02 }),
  law('at', { pass: 98, passHist: [[1900, 60], [1938, 25], [1946, 25], [1955, 60], [1990, 88]], strict: [[1900, 0.4], [1962, 0.35], [1973, 0.65], [2000, 0.6]], natz: 10, pr: 5, dual: 'no', lang: 'German', border: 0.5, enforce: 0.04, asylum: 0.55 }),
  law('be', { pass: 97, strict: [[1900, 0.35], [1974, 0.6], [2000, 0.55]], natz: 5, pr: 5, dual: [[1900, 'no'], [2008, 'yes']], lang: 'French', border: 0.55, enforce: 0.04, asylum: 0.55 }),
  law('hr', { pass: 94, passHist: [[1900, 45], [1945, 30], [1965, 50], [1991, 45], [2010, 85]], strict: 0.5, natz: 8, pr: 5, dual: 'yes', lang: 'Croatian', border: 0.5, enforce: 0.04, asylum: 0.1 }),
  law('cz', { pass: 97, passHist: EAST_BLOC_PASS, strict: 0.55, natz: 5, pr: 5, dual: [[1900, 'no'], [2014, 'yes']], lang: 'Czech', border: 0.5, enforce: 0.04, asylum: 0.15 }),
  law('dk', {
    pass: 98, strict: [[1900, 0.45], [1973, 0.6], [2002, 0.7]], natz: 9, pr: 8, dual: [[1900, 'no'], [2015, 'yes']], lang: 'Danish', border: 0.6, enforce: 0.05, asylum: [[1900, 0.5], [2015, 0.25]],
    points: [{ from: 2008, to: 2016, pass: 65, result: 'visa', name: 'Danish Green Card points test' }],
    exitTax: { from: 1995, threshold: 500_000, rate: 0.42, name: 'the Danish exit tax', on: 'leave' },
  }),
  law('ee', { pass: 96, passHist: [[1900, 40], [1920, 50], [1940, 15], [1991, 35], [2004, 88]], strict: 0.5, natz: 8, pr: 5, dual: 'no', lang: 'Estonian', border: 0.5, enforce: 0.04, asylum: 0.1 }),
  law('fi', { pass: 98, strict: 0.55, natz: [[1900, 6], [2011, 5], [2024, 8]], pr: 4, dual: [[1900, 'no'], [2003, 'yes']], lang: 'Finnish', border: 0.6, enforce: 0.04, asylum: 0.4 }),
  law('fr', {
    pass: 98, strict: [[1900, 0.25], [1945, 0.35], [1974, 0.6], [2000, 0.55]], natz: 5, pr: 5, dual: 'yes', lang: 'French', border: 0.5, enforce: 0.04, asylum: 0.45,
    exitTax: { from: 2011, threshold: 900_000, rate: 0.3, name: 'the French exit tax', on: 'leave' },
  }),
  law('de', {
    pass: 98, passHist: [[1900, 60], [1933, 40], [1945, 15], [1955, 65], [1990, 88]],
    strict: [[1900, 0.35], [1933, 0.8], [1946, 0.6], [1955, 0.35], [1973, 0.7], [2005, 0.55], [2012, 0.45]],
    points: [{ from: 2024, pass: 60, result: 'visa', name: 'Opportunity Card points test' }],
    natz: [[1900, 10], [2000, 8], [2024, 5]], pr: 4, dual: [[1900, 'no'], [2007, 'limited'], [2024, 'yes']], soli: [[1900, null], [2000, 8], [2024, 5]], lang: 'German',
    border: 0.55, enforce: 0.03, asylum: [[1900, 0.3], [1949, 0.6], [1993, 0.45], [2015, 0.65], [2017, 0.5]],
    exitTax: { from: 1972, threshold: 1_000_000, rate: 0.28, name: 'the German exit tax', on: 'leave' },
  }),
  law('gr', { pass: 97, strict: 0.55, natz: [[1900, 10], [2015, 7]], pr: 5, dual: 'yes', lang: 'Greek', border: 0.35, enforce: 0.04, asylum: 0.2 }),
  law('hu', { pass: 96, passHist: [[1900, 55], [1949, 15], [1989, 30], [2004, 88]], strict: 0.6, natz: 8, pr: 3, dual: 'yes', lang: 'Hungarian', border: 0.5, enforce: 0.05, asylum: [[1900, 0.3], [2015, 0.02]] }),
  law('ie', { pass: 98, strict: [[1900, 0.4], [2004, 0.45]], natz: 5, pr: 5, dual: 'yes', soli: [[1900, 0], [2005, 3]], lang: 'English', border: 0.6, enforce: 0.03, asylum: 0.4 }),
  law('it', { pass: 98, strict: 0.55, natz: [[1900, 5], [1992, 10]], pr: 5, dual: [[1900, 'no'], [1992, 'yes']], lang: 'Italian', border: 0.35, enforce: 0.03, asylum: 0.4 }),
  law('mc', { pass: 88, strict: 0.7, natz: 10, pr: 10, dual: 'no', lang: 'French', border: 0.5, enforce: 0.08, asylum: 0.02 }),
  law('nl', {
    pass: 98, strict: [[1900, 0.4], [1974, 0.55], [2000, 0.5]], natz: 5, pr: 5, dual: 'limited', lang: 'Dutch', border: 0.55, enforce: 0.04, asylum: 0.5,
    exitTax: { from: 1997, threshold: 1_000_000, rate: 0.25, name: 'the Dutch exit tax', on: 'leave' },
  }),
  law('no', {
    pass: 97, strict: [[1900, 0.4], [1975, 0.6], [2000, 0.55]], natz: [[1900, 7], [2022, 8]], pr: 3, dual: [[1900, 'no'], [2020, 'yes']], lang: 'Norwegian', border: 0.6, enforce: 0.05, asylum: 0.45,
    exitTax: { from: 2006, threshold: 300_000, rate: 0.378, name: 'the Norwegian exit tax', on: 'leave' },
  }),
  law('pl', { pass: 96, passHist: [[1900, 45], [1920, 50], [1939, 20], [1948, 15], [1989, 30], [2004, 88]], strict: 0.5, natz: 8, pr: 5, dual: 'yes', lang: 'Polish', border: 0.5, enforce: 0.04, asylum: 0.1 }),
  law('pt', { pass: 97, passHist: [[1900, 55], [1933, 40], [1974, 55], [1990, 85]], strict: 0.4, natz: [[1900, 10], [2006, 6], [2018, 5]], pr: 5, dual: [[1900, 'no'], [1981, 'yes']], lang: 'Portuguese', border: 0.45, enforce: 0.03, asylum: 0.3 }),
  law('ro', { pass: 93, passHist: [[1900, 45], [1947, 12], [1990, 25], [2007, 75], [2019, 90]], strict: 0.5, natz: 8, pr: 5, dual: 'yes', lang: 'Romanian', border: 0.45, enforce: 0.04, asylum: 0.1 }),
  law('ru', { pass: 60, passHist: [...SOVIET_PASS, [2021, 62]], strict: 0.6, natz: 5, pr: 3, dual: [[1900, 'no'], [1991, 'yes']], lang: 'Russian', border: 0.5, enforce: 0.05, asylum: 0.02 }),
  law('rs', { pass: 70, passHist: [[1900, 45], [1945, 30], [1965, 55], [1992, 15], [2001, 30], [2010, 65]], strict: 0.5, natz: 3, pr: 5, dual: 'yes', lang: 'Serbian', border: 0.45, enforce: 0.03, asylum: 0.05 }),
  law('sk', { pass: 95, passHist: EAST_BLOC_PASS, strict: 0.55, natz: 8, pr: 5, dual: [[1900, 'yes'], [2010, 'no'], [2022, 'limited']], lang: 'Slovak', border: 0.5, enforce: 0.04, asylum: 0.05 }),
  law('es', {
    pass: 98, passHist: [[1900, 55], [1936, 35], [1975, 55], [1990, 85]], strict: [[1900, 0.3], [1985, 0.55], [2000, 0.45]], natz: 10, pr: 5, dual: 'limited', lang: 'Spanish', border: 0.35, enforce: 0.03, asylum: 0.2,
    exitTax: { from: 2015, threshold: 4_500_000, rate: 0.26, name: 'the Spanish exit tax', on: 'leave' },
  }),
  law('se', { pass: 98, strict: [[1900, 0.4], [1950, 0.3], [1972, 0.55], [2015, 0.6]], natz: 5, pr: 4, dual: [[1900, 'no'], [2001, 'yes']], lang: 'Swedish', border: 0.6, enforce: 0.04, asylum: [[1900, 0.4], [1940, 0.6], [2016, 0.4]] }),
  law('ch', { pass: 97, strict: 0.7, natz: [[1900, 12], [2018, 10]], pr: 10, dual: [[1900, 'no'], [1992, 'yes']], lang: 'German', border: 0.5, enforce: 0.05, asylum: 0.4 }),
  law('ua', { pass: 76, passHist: [...SOVIET_PASS, [2017, 70]], strict: 0.55, natz: 5, pr: 3, dual: 'no', lang: 'Ukrainian', border: 0.45, enforce: 0.04, asylum: 0.02 }),
  law('gb', {
    pass: 96, strict: [[1900, 0.3], [1905, 0.35], [1962, 0.5], [1971, 0.6], [2008, 0.6], [2021, 0.6]],
    points: [{ from: 2002, to: 2011, pass: 75, result: 'visa', name: 'Highly Skilled Migrant Programme' }],
    natz: [[1900, 5], [1983, 6]], pr: 5, dual: 'yes', soli: [[1900, 0], [1983, null]], lang: 'English', border: 0.6, enforce: 0.03, asylum: 0.4,
  }),

  // ----- Africa -----
  law('dz', { pass: 28, strict: 0.8, natz: 7, pr: 7, dual: 'yes', lang: 'Arabic', border: 0.5, enforce: 0.04, asylum: 0.02 }),
  law('ao', { pass: 26, strict: 0.7, natz: 10, pr: 10, dual: [[1900, 'no'], [2016, 'yes']], lang: 'Portuguese', border: 0.35, enforce: 0.04, asylum: 0.1 }),
  law('dj', { pass: 23, strict: 0.7, natz: 10, pr: 10, dual: 'yes', lang: 'French', border: 0.35, enforce: 0.04, asylum: 0.2 }),
  law('cd', { pass: 21, strict: 0.8, natz: 10, pr: 10, dual: 'no', lang: 'French', border: 0.25, enforce: 0.03, asylum: 0.2 }),
  law('eg', { pass: 27, strict: 0.7, natz: 10, pr: 5, dual: 'limited', lang: 'Arabic', border: 0.55, enforce: 0.04, asylum: 0.1 }),
  law('et', { pass: 24, strict: 0.75, natz: 4, pr: 3, dual: 'no', lang: 'Amharic', border: 0.3, enforce: 0.03, asylum: 0.3 }),
  law('ke', { pass: 38, strict: 0.6, natz: 7, pr: 7, dual: [[1900, 'no'], [2010, 'yes']], lang: 'Swahili', border: 0.3, enforce: 0.03, asylum: 0.3 }),
  law('ma', { pass: 36, strict: 0.6, natz: 5, pr: 10, dual: 'yes', lang: 'Arabic', border: 0.45, enforce: 0.04, asylum: 0.05 }),
  law('ng', { pass: 23, strict: 0.7, natz: 15, pr: 15, dual: 'limited', lang: 'English', border: 0.3, enforce: 0.03, asylum: 0.05 }),
  law('za', { pass: 53, passHist: [[1900, 45], [1960, 40], [1985, 25], [1995, 50]], strict: 0.6, natz: 5, pr: 5, dual: 'yes', lang: 'English', border: 0.35, enforce: 0.05, asylum: 0.3 }),
  law('tn', { pass: 37, strict: 0.65, natz: 5, pr: 5, dual: 'yes', lang: 'Arabic', border: 0.5, enforce: 0.04, asylum: 0.02 }),
  law('ug', { pass: 35, strict: 0.6, natz: 20, pr: 10, dual: [[1900, 'no'], [2005, 'yes']], lang: 'English', border: 0.3, enforce: 0.02, asylum: 0.5 }),
  law('zw', { pass: 33, strict: 0.7, natz: 10, pr: 5, dual: [[1900, 'no'], [2013, 'yes']], lang: 'English', border: 0.35, enforce: 0.04, asylum: 0.1 }),

  // ----- Middle East -----
  law('ge', { pass: 63, passHist: [...SOVIET_PASS, [2017, 58]], strict: 0.3, natz: 10, pr: 6, dual: 'limited', lang: 'Georgian', border: 0.4, enforce: 0.02, asylum: 0.05 }),
  law('ir', { pass: 21, passHist: [[1900, 40], [1975, 55], [1980, 25]], strict: 0.9, natz: 5, pr: null, dual: 'limited', lang: 'Persian', border: 0.5, enforce: 0.05, asylum: 0.05 }),
  law('iq', { pass: 16, passHist: [[1900, 35], [1975, 35], [1990, 20], [2005, 15]], strict: 0.9, natz: 10, pr: null, dual: 'yes', lang: 'Arabic', border: 0.45, enforce: 0.04, asylum: 0.02 }),
  law('il', { pass: 84, passHist: [[1948, 45], [1990, 70]], strict: 0.85, natz: 5, pr: null, dual: 'yes', lang: 'Hebrew', border: 0.75, enforce: 0.06, asylum: 0.02 }),
  law('jo', { pass: 26, strict: 0.7, natz: 15, pr: null, dual: 'yes', lang: 'Arabic', border: 0.5, enforce: 0.04, asylum: 0.2 }),
  law('kw', { pass: 51, strict: 0.5, natz: null, pr: null, dual: 'no', lang: 'Arabic', border: 0.7, enforce: 0.08, asylum: null }),
  law('lb', { pass: 21, passHist: [[1900, 40], [1970, 55], [1980, 25]], strict: 0.8, natz: null, pr: null, dual: 'yes', lang: 'Arabic', border: 0.5, enforce: 0.05, asylum: 0.02 }),
  law('qa', { pass: 55, strict: 0.4, natz: null, pr: null, dual: 'no', lang: 'Arabic', border: 0.75, enforce: 0.08, asylum: null }),
  law('sa', { pass: 46, strict: 0.5, natz: null, pr: null, dual: 'no', lang: 'Arabic', border: 0.7, enforce: 0.1, asylum: null }),
  law('sy', { pass: 14, passHist: [[1900, 35], [1970, 35], [2010, 30], [2015, 14]], strict: 0.9, natz: 10, pr: null, dual: 'yes', lang: 'Arabic', border: 0.5, enforce: 0.05, asylum: 0.02 }),
  law('tr', { pass: 61, strict: 0.5, natz: 5, pr: 8, dual: [[1900, 'no'], [1981, 'yes']], lang: 'Turkish', border: 0.4, enforce: 0.05, asylum: 0.4 }),
  law('ae', { pass: 93, passHist: [[1971, 30], [2000, 40], [2015, 60], [2019, 90]], strict: 0.35, natz: null, pr: null, dual: 'no', lang: 'Arabic', border: 0.75, enforce: 0.08, asylum: null }),

  // ----- Asia -----
  law('af', { pass: 13, passHist: [[1900, 30], [1970, 40], [1979, 20], [2001, 15], [2021, 13]], strict: 0.95, natz: 5, pr: null, dual: 'yes', lang: 'Pashto', border: 0.3, enforce: 0.03, asylum: 0.01 }),
  law('bd', { pass: 20, strict: 0.85, natz: 5, pr: null, dual: 'limited', lang: 'Bengali', border: 0.35, enforce: 0.03, asylum: 0.02 }),
  law('cn', { pass: 44, passHist: [[1900, 30], [1949, 10], [1980, 20], [2000, 30]], strict: 0.9, natz: null, pr: null, dual: 'no', lang: 'Mandarin', border: 0.65, enforce: 0.06, asylum: 0.01 }),
  law('hk', { pass: 88, passHist: [[1900, 55], [1970, 70], [1997, 80]], strict: 0.55, natz: [[1900, 7], [1997, null]], pr: 7, dual: [[1900, 'yes'], [1997, 'no']], lang: 'Cantonese', border: 0.7, enforce: 0.06, asylum: 0.01 }),
  law('in', { pass: 31, passHist: [[1900, 40], [1950, 40], [1990, 30]], strict: 0.85, natz: 12, pr: null, dual: 'no', soli: [[1900, 0], [1987, null]], lang: 'Hindi', border: 0.4, enforce: 0.03, asylum: 0.1 }),
  law('id', { pass: 39, strict: 0.7, natz: 5, pr: 4, dual: 'no', lang: 'Indonesian', border: 0.5, enforce: 0.04, asylum: 0.02 }),
  law('jp', {
    pass: 98, passHist: [[1900, 55], [1941, 25], [1952, 40], [1970, 80], [1990, 92]],
    strict: [[1900, 0.7], [1941, 0.98], [1952, 0.9], [1990, 0.85], [2019, 0.75]], natz: 5, pr: 10, dual: 'no', lang: 'Japanese', border: 0.85, enforce: 0.06, asylum: 0.02,
    exitTax: { from: 2015, threshold: 700_000, rate: 0.15, name: 'the Japanese exit tax', on: 'leave' },
  }),
  law('kz', { pass: 40, passHist: [...SOVIET_PASS], strict: 0.6, natz: 5, pr: 1, dual: 'no', lang: 'Russian', border: 0.4, enforce: 0.04, asylum: 0.02 }),
  law('my', { pass: 93, strict: 0.6, natz: 10, pr: 10, dual: 'no', lang: 'Malay', border: 0.5, enforce: 0.06, asylum: null }),
  law('mn', { pass: 34, passHist: [[1900, 30], [1924, 10], [1990, 25]], strict: 0.7, natz: 5, pr: 5, dual: 'no', lang: 'Mongolian', border: 0.4, enforce: 0.04, asylum: 0.02 }),
  law('np', { pass: 19, strict: 0.8, natz: 15, pr: null, dual: 'no', lang: 'Nepali', border: 0.3, enforce: 0.02, asylum: 0.05 }),
  law('pk', { pass: 17, passHist: [[1947, 40], [1980, 30], [2000, 20]], strict: 0.8, natz: 5, pr: null, dual: 'limited', soli: 0, lang: 'Urdu', border: 0.4, enforce: 0.03, asylum: 0.2 }),
  law('ph', { pass: 34, strict: 0.6, natz: 10, pr: 3, dual: [[1900, 'no'], [2003, 'yes']], lang: 'Filipino', border: 0.6, enforce: 0.04, asylum: 0.1 }),
  law('sg', { pass: 100, passHist: [[1965, 60], [1990, 85]], strict: 0.6, natz: 4, pr: 2, dual: 'no', lang: 'English', border: 0.9, enforce: 0.08, asylum: null }),
  law('kr', { pass: 98, passHist: [[1948, 25], [1970, 30], [1990, 55], [2005, 85], [2015, 97]], strict: 0.7, natz: 5, pr: 5, dual: [[1900, 'no'], [2011, 'limited']], lang: 'Korean', border: 0.85, enforce: 0.06, asylum: 0.03 }),
  law('tw', { pass: 73, passHist: [[1949, 25], [1980, 35], [2010, 70]], strict: 0.7, natz: 5, pr: 5, dual: 'limited', lang: 'Mandarin', border: 0.85, enforce: 0.06, asylum: null }),
  law('th', { pass: 42, strict: 0.65, natz: 10, pr: 3, dual: 'limited', lang: 'Thai', border: 0.45, enforce: 0.04, asylum: 0.02 }),
  law('vn', { pass: 26, passHist: [[1900, 30], [1975, 10], [1990, 15], [2010, 25]], strict: 0.75, natz: 5, pr: 3, dual: [[1900, 'no'], [2008, 'limited']], lang: 'Vietnamese', border: 0.45, enforce: 0.04, asylum: 0.01 }),

  // ----- Oceania -----
  law('au', {
    pass: 96, strict: [[1900, 0.35], [1930, 0.6], [1945, 0.4], [1973, 0.45], [1989, 0.5]],
    points: [{ from: 1979, pass: 65, result: 'permanent', name: 'General Skilled Migration points test' }],
    natz: [[1900, 5], [1984, 2], [2007, 4]], pr: 3, dual: [[1900, 'limited'], [2002, 'yes']], soli: [[1900, 0], [1986, null]], lang: 'English',
    border: 0.9, enforce: 0.08, asylum: [[1900, 0.4], [2001, 0.2], [2013, 0.05]],
    exitTax: { from: 1985, threshold: 500_000, rate: 0.25, name: 'the Australian departure capital gains tax', on: 'leave' },
  }),
  law('nz', {
    pass: 97, strict: [[1900, 0.3], [1974, 0.45]],
    points: [{ from: 1991, pass: 65, result: 'permanent', name: 'Skilled Migrant points test' }],
    natz: [[1900, 5], [1977, 3], [2005, 5]], natzFrom: 'pr', pr: 2, dual: 'yes', soli: [[1900, 0], [2006, null]], lang: 'English', border: 0.95, enforce: 0.06, asylum: 0.3,
  }),
  law('pg', { pass: 36, strict: 0.7, natz: 8, pr: 15, dual: [[1900, 'no'], [2016, 'yes']], lang: 'English', border: 0.5, enforce: 0.02, asylum: 0.1 }),
  law('ws', { pass: 66, strict: 0.7, natz: 5, pr: 10, dual: [[1900, 'no'], [2004, 'yes']], lang: 'Samoan', border: 0.7, enforce: 0.03, asylum: 0.02 }),
]
