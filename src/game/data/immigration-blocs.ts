// Free movement, shared citizenship, exit restrictions, crises, amnesties, quotas and exclusion
// laws, with their years. Approximate but grounded in the real dates; the copy that cites them
// stays factual and neutral (several of these were discriminatory laws, named as such).
import type { Anchors } from './immigration'

// ---------------------------------------------------------------------------
// Free-movement blocs

export interface BlocMember {
  id: string
  from: number
  /** Last year of membership (inclusive). */
  to?: number
}

export interface Bloc {
  id: string
  names: Anchors<string>
  emoji: string
  /** 'free': live and work anywhere in the bloc; 'residence': a fast residence permit (2 years, then permanent). */
  kind: 'free' | 'residence'
  members: BlocMember[]
  /** Directional blocs: members may move freely only INTO these countries. */
  into?: string[]
  /** Base odds the move goes through (EEC workers needed a job or the means to live). */
  odds: number
  /** [new member, destination, first open year]: transitional limits on workers from new members. */
  transitions?: [string, string, number][]
  note: string
}

const m = (ids: string[], from: number, to?: number): BlocMember[] => ids.map((id) => ({ id, from, to }))

// Transitional arrangements after the 2004, 2007 and 2013 enlargements (old members that opened
// at once, like the UK, Ireland and Sweden in 2004, have no entry).
const T2004 = ['cz', 'ee', 'hu', 'pl', 'sk']
const T2004_LIMITS: [string, number][] = [['de', 2011], ['at', 2011], ['ch', 2011], ['be', 2009], ['dk', 2009], ['fr', 2008], ['nl', 2007], ['no', 2009], ['it', 2006], ['es', 2006], ['pt', 2006], ['gr', 2006], ['fi', 2006]]
const T2007_LIMITS: [string, number][] = [['gb', 2014], ['de', 2014], ['fr', 2014], ['nl', 2014], ['be', 2014], ['at', 2014], ['es', 2014], ['ch', 2016], ['ie', 2012], ['it', 2012], ['no', 2012], ['dk', 2009], ['gr', 2009], ['pt', 2009], ['hu', 2009]]
const T2013_LIMITS: [string, number][] = [['at', 2020], ['nl', 2018], ['gb', 2018], ['be', 2015], ['de', 2015], ['fr', 2015], ['it', 2015], ['es', 2015], ['gr', 2015], ['ch', 2022]]

export const BLOCS: Bloc[] = [
  {
    id: 'eec',
    names: [[1968, 'the EEC']],
    emoji: '\u{1F1EA}\u{1F1FA}',
    kind: 'free',
    odds: 0.9,
    members: [...m(['be', 'de', 'fr', 'it', 'nl'], 1968, 1992), ...m(['dk', 'ie', 'gb'], 1973, 1992), ...m(['gr'], 1988, 1992), ...m(['es', 'pt'], 1992, 1992)],
    note: 'EEC workers could move for a job, or with the means to support themselves.',
  },
  {
    id: 'eu',
    names: [[1993, 'the EU'], [1994, 'the EU/EEA']],
    emoji: '\u{1F1EA}\u{1F1FA}',
    kind: 'free',
    odds: 0.99,
    members: [
      ...m(['be', 'de', 'fr', 'it', 'nl', 'dk', 'ie', 'gr', 'es', 'pt'], 1993),
      { id: 'gb', from: 1993, to: 2020 },
      ...m(['at', 'fi', 'se', 'no'], 1994),
      { id: 'ch', from: 2002 },
      ...m(T2004, 2004),
      { id: 'ro', from: 2007 },
      { id: 'hr', from: 2013 },
    ],
    transitions: [
      ...T2004.flatMap((src) => T2004_LIMITS.map(([dst, y]): [string, string, number] => [src, dst, y])),
      ...T2007_LIMITS.map(([dst, y]): [string, string, number] => ['ro', dst, y]),
      ...T2013_LIMITS.map(([dst, y]): [string, string, number] => ['hr', dst, y]),
    ],
    note: 'Citizens of member states can live and work anywhere in the bloc.',
  },
  { id: 'nordic', names: [[1954, 'the Nordic Passport Union']], emoji: '\u{1F30C}', kind: 'free', odds: 0.99, members: m(['dk', 'fi', 'no', 'se'], 1954), note: 'Nordic citizens can settle anywhere in the Nordic countries.' },
  { id: 'cta', names: [[1923, 'the Common Travel Area']], emoji: '\u{1F340}', kind: 'free', odds: 0.99, members: m(['gb', 'ie'], 1923), note: 'British and Irish citizens can live in each other\'s countries.' },
  { id: 'tasman', names: [[1973, 'the Trans-Tasman Travel Arrangement']], emoji: '\u{1F998}', kind: 'free', odds: 0.98, members: m(['au', 'nz'], 1973), note: 'Australians and New Zealanders can live and work in each other\'s countries.' },
  { id: 'gcc', names: [[2008, 'the GCC common market']], emoji: '\u{1F54C}', kind: 'free', odds: 0.97, members: m(['kw', 'qa', 'sa', 'ae'], 2008), note: 'Gulf citizens can live and work across the Gulf states.' },
  {
    id: 'mercosur',
    names: [[2009, 'the Mercosur Residence Agreement']],
    emoji: '\u{1F30E}',
    kind: 'residence',
    odds: 0.95,
    members: [...m(['ar', 'br', 'py', 'uy', 'bo', 'cl'], 2009), { id: 'pe', from: 2011 }, { id: 'co', from: 2012 }, { id: 'ec', from: 2014 }],
    note: 'South Americans from member states get two years of residence, then permanent residency.',
  },
  { id: 'eac', names: [[2010, 'the East African Common Market']], emoji: '\u{1F30D}', kind: 'residence', odds: 0.85, members: [...m(['ke', 'ug'], 2010), { id: 'cd', from: 2023 }], note: 'East African citizens can work across the member states.' },
  { id: 'eaeu', names: [[2015, 'the Eurasian Economic Union']], emoji: '\u{1F3D4}\u{FE0F}', kind: 'free', odds: 0.95, members: m(['ru', 'kz'], 2015), note: 'Citizens of member states can work anywhere in the union.' },
  {
    id: 'commonwealth',
    names: [[1948, 'Commonwealth citizenship']],
    emoji: '\u{1F451}',
    kind: 'free',
    odds: 0.95,
    into: ['gb'],
    members: [...m(['au', 'nz', 'ca', 'in', 'pk', 'bd', 'jm', 'bs', 'bz', 'gy', 'ke', 'ug', 'ng', 'zw', 'my', 'sg', 'hk', 'ws'], 1948, 1961), { id: 'za', from: 1948, to: 1960 }],
    note: 'Until the 1962 Commonwealth Immigrants Act, citizens of the Commonwealth could settle in Britain freely.',
  },
  { id: 'algeria', names: [[1947, 'French Algeria']], emoji: '\u{1F1EB}\u{1F1F7}', kind: 'free', odds: 0.95, members: m(['fr', 'dz'], 1947, 1962), note: 'Until independence in 1962, Algeria was part of France and people moved freely between them.' },
  { id: 'cplp', names: [[2021, 'the CPLP mobility agreement']], emoji: '\u{1F30D}', kind: 'residence', odds: 0.9, members: m(['pt', 'br', 'ao'], 2021), note: 'Portuguese-speaking countries fast-track each other\'s citizens for residence.' },
]

// ---------------------------------------------------------------------------
// Shared citizenship: unions that existed for a while (a Ukrainian in 1980 was a Soviet citizen
// and could move to Russia like anyone else), and territories whose people hold the other
// country's citizenship (Puerto Ricans are US citizens, Arubans are Dutch).

export interface Union {
  id: string
  names: Anchors<string>
  members: BlocMember[]
  /** At dissolution, residents become citizens of where they live; false = only people born there. */
  zeroOption?: Record<string, boolean>
}

export const UNIONS: Union[] = [
  { id: 'russia', names: [[1900, 'the Russian Empire'], [1917, 'Soviet Russia'], [1922, 'the Soviet Union']], members: [...m(['ru', 'ua', 'ge', 'kz'], 1900, 1991), { id: 'ee', from: 1900, to: 1917 }, { id: 'ee', from: 1940, to: 1991 }], zeroOption: { ee: false } },
  { id: 'austria-hungary', names: [[1900, 'Austria-Hungary']], members: m(['at', 'hu', 'cz', 'sk', 'hr'], 1900, 1918) },
  { id: 'yugoslavia', names: [[1918, 'Yugoslavia']], members: m(['rs', 'hr'], 1918, 1991) },
  { id: 'czechoslovakia', names: [[1918, 'Czechoslovakia']], members: m(['cz', 'sk'], 1918, 1992) },
  { id: 'british-india', names: [[1900, 'British India']], members: m(['in', 'pk', 'bd'], 1900, 1947) },
  { id: 'pakistan', names: [[1947, 'Pakistan']], members: m(['pk', 'bd'], 1947, 1971) },
  { id: 'malaysia', names: [[1963, 'Malaysia']], members: m(['my', 'sg'], 1963, 1965) },
  { id: 'uk-ireland', names: [[1900, 'the United Kingdom']], members: m(['gb', 'ie'], 1900, 1921) },
  { id: 'us-pr', names: [[1917, 'the United States']], members: m(['us', 'pr'], 1917) },
  { id: 'kingdom-nl', names: [[1900, 'the Kingdom of the Netherlands']], members: m(['nl', 'aw'], 1900) },
]

// ---------------------------------------------------------------------------
// Exit restrictions: regimes that didn't let their own citizens leave.

export interface ExitWindow {
  from: number
  to: number
  permit?: number
  escape?: number
  /** Only toward these destinations (e.g. the Mariel boatlift to the US). */
  dest?: string[]
  note: string
}

export interface ExitRegime {
  id: string
  /** The state as the copy names it. */
  name: string
  countries: string[]
  from: number
  /** Last restricted year (inclusive). */
  to: number
  /** Odds the authorities grant an exit visa. */
  permit: number
  /** Odds an escape attempt succeeds. */
  escape: number
  windows?: ExitWindow[]
  /** A group the regime let out in larger numbers in some years. */
  special?: { religion: string; permit: number; dest: string[]; years: [number, number][]; note: string }
  note: string
}

export const EXIT_REGIMES: ExitRegime[] = [
  {
    id: 'soviet', name: 'the Soviet Union', countries: ['ru', 'ua', 'ge', 'kz'], from: 1922, to: 1990, permit: 0.02, escape: 0.05,
    special: { religion: 'Judaism', permit: 0.35, dest: ['il', 'us'], years: [[1971, 1981], [1987, 1990]], note: 'Soviet Jews were allowed out in larger numbers in these years.' },
    note: 'Soviet citizens needed an exit visa, and almost nobody got one.',
  },
  { id: 'soviet-baltic', name: 'the Soviet Union', countries: ['ee'], from: 1940, to: 1990, permit: 0.02, escape: 0.06, note: 'Soviet citizens needed an exit visa, and almost nobody got one.' },
  { id: 'poland', name: 'communist Poland', countries: ['pl'], from: 1948, to: 1988, permit: 0.12, escape: 0.15, windows: [{ from: 1981, to: 1983, permit: 0.03, note: 'Martial law sealed the borders.' }], note: 'Passports were kept by the police and handed out for approved trips only.' },
  { id: 'czechoslovakia', name: 'communist Czechoslovakia', countries: ['cz', 'sk'], from: 1948, to: 1989, permit: 0.05, escape: 0.12, windows: [{ from: 1968, to: 1969, permit: 0.5, escape: 0.7, note: 'After the Prague Spring, the borders stayed open for a few months.' }], note: 'The Iron Curtain ran along the western border.' },
  { id: 'hungary', name: 'communist Hungary', countries: ['hu'], from: 1949, to: 1988, permit: 0.06, escape: 0.12, windows: [{ from: 1956, to: 1956, escape: 0.75, note: 'During the 1956 uprising, the border to Austria was briefly open.' }], note: 'Leaving without permission was a crime.' },
  { id: 'romania', name: 'communist Romania', countries: ['ro'], from: 1947, to: 1989, permit: 0.03, escape: 0.08, note: 'The regime let almost no one leave.' },
  { id: 'yugoslavia', name: 'early communist Yugoslavia', countries: ['rs', 'hr'], from: 1945, to: 1962, permit: 0.05, escape: 0.25, note: 'Until the 1960s, Yugoslavs rarely got passports.' },
  { id: 'china', name: 'Maoist China', countries: ['cn'], from: 1949, to: 1978, permit: 0.02, escape: 0.25, note: 'Leaving the country was all but forbidden.' },
  {
    id: 'cuba', name: 'revolutionary Cuba', countries: ['cu'], from: 1961, to: 2012, permit: 0.08, escape: 0.3,
    windows: [
      { from: 1965, to: 1973, permit: 0.5, dest: ['us'], note: 'The Freedom Flights carried Cubans to Miami.' },
      { from: 1980, to: 1980, permit: 0.85, dest: ['us'], note: 'The Mariel boatlift let anyone with a boat ride leave for the US.' },
      { from: 1994, to: 1994, escape: 0.75, dest: ['us'], note: 'During the rafter crisis, the coast guard looked the other way at home.' },
    ],
    note: 'Cubans needed an exit permit (the "white card") until 2013.',
  },
  { id: 'vietnam', name: 'postwar Vietnam', countries: ['vn'], from: 1975, to: 1988, permit: 0.15, escape: 0.4, note: 'Most people who left went by boat; the Orderly Departure Program let a few out legally.' },
  { id: 'mongolia', name: 'the Mongolian People\'s Republic', countries: ['mn'], from: 1924, to: 1990, permit: 0.02, escape: 0.04, note: 'Travel abroad was for officials only.' },
  { id: 'ethiopia', name: 'the Derg regime', countries: ['et'], from: 1977, to: 1991, permit: 0.05, escape: 0.35, note: 'Exit visas were rarely granted.' },
  { id: 'iraq', name: 'Ba\'athist Iraq', countries: ['iq'], from: 1980, to: 2003, permit: 0.12, escape: 0.35, note: 'Travel bans and huge exit fees kept most Iraqis in.' },
  { id: 'iran-war', name: 'wartime Iran', countries: ['ir'], from: 1980, to: 1988, permit: 0.2, escape: 0.4, note: 'Men of military age could not leave during the war.' },
  { id: 'afghanistan', name: 'Soviet-era Afghanistan', countries: ['af'], from: 1979, to: 1989, permit: 0.05, escape: 0.55, note: 'Millions fled over the mountains instead of asking for permission.' },
]

// ---------------------------------------------------------------------------
// Crises behind asylum claims (tactful, headline-level labels).

export interface Crisis {
  country: string
  from: number
  to: number
  label: string
  /** 1 serious … 3 catastrophic (how likely claims succeed). */
  severity: 1 | 2 | 3
}

const cr = (country: string, from: number, to: number, label: string, severity: 1 | 2 | 3): Crisis => ({ country, from, to, label, severity })

export const CRISES: Crisis[] = [
  cr('ru', 1917, 1922, 'the revolution and civil war', 3),
  cr('de', 1933, 1945, 'persecution under the Nazi regime', 3),
  cr('at', 1938, 1945, 'persecution under the Nazi regime', 3),
  cr('cz', 1938, 1945, 'the occupation', 3),
  cr('pl', 1939, 1945, 'the occupation', 3),
  cr('es', 1936, 1939, 'the civil war', 3),
  cr('gr', 1946, 1949, 'the civil war', 2),
  cr('cn', 1946, 1949, 'the civil war', 2),
  cr('hu', 1956, 1957, 'the crushed uprising', 3),
  cr('cu', 1959, 1962, 'the revolution', 2),
  cr('cz', 1968, 1969, 'the Soviet invasion', 2),
  cr('ng', 1967, 1970, 'the Biafran War', 3),
  cr('bd', 1971, 1971, 'the Liberation War', 3),
  cr('ug', 1971, 1986, 'the Amin and Obote years', 3),
  cr('cl', 1973, 1990, 'the military dictatorship', 2),
  cr('uy', 1973, 1985, 'the military dictatorship', 2),
  cr('ar', 1976, 1983, 'the military dictatorship', 2),
  cr('et', 1974, 1991, 'the Derg years', 3),
  cr('ao', 1975, 2002, 'the civil war', 3),
  cr('lb', 1975, 1990, 'the civil war', 3),
  cr('vn', 1975, 1990, 'the postwar exodus', 3),
  cr('za', 1976, 1990, 'apartheid repression', 2),
  cr('ir', 1979, 1988, 'the revolution and war', 2),
  cr('ni', 1979, 1990, 'the Contra war', 2),
  cr('af', 1979, 1989, 'the Soviet war', 3),
  cr('sv', 1980, 1992, 'the civil war', 3),
  cr('gt', 1980, 1996, 'the civil war', 3),
  cr('iq', 1980, 1988, 'the Iran–Iraq War', 2),
  cr('tr', 1980, 1983, 'the military coup', 1),
  cr('pe', 1980, 2000, 'the internal conflict', 2),
  cr('pl', 1981, 1983, 'martial law', 1),
  cr('co', 1985, 2016, 'the armed conflict', 2),
  cr('iq', 1991, 1991, 'the Gulf War and uprisings', 3),
  cr('ht', 1991, 1994, 'the military coup', 2),
  cr('rs', 1991, 1999, 'the Yugoslav Wars', 3),
  cr('hr', 1991, 1995, 'the war of independence', 3),
  cr('af', 1992, 2001, 'civil war and Taliban rule', 3),
  cr('dz', 1992, 2002, 'the civil war', 2),
  cr('ge', 1992, 1993, 'the Abkhazia war', 2),
  cr('cd', 1996, 2003, 'the Congo wars', 3),
  cr('zw', 2000, 2009, 'the political and economic crisis', 2),
  cr('iq', 2003, 2009, 'the war and insurgency', 3),
  cr('pk', 2007, 2014, 'the northwestern insurgency', 1),
  cr('ke', 2008, 2008, 'post-election violence', 1),
  cr('ge', 2008, 2008, 'the war', 1),
  cr('cd', 2008, 2026, 'the eastern conflict', 3),
  cr('ng', 2009, 2026, 'the northeastern insurgency', 2),
  cr('ht', 2010, 2010, 'the earthquake', 2),
  cr('sy', 2011, 2026, 'the civil war', 3),
  cr('eg', 2013, 2014, 'the crackdown', 1),
  cr('iq', 2014, 2017, 'the war against ISIS', 3),
  cr('ua', 2014, 2021, 'the Donbas war', 2),
  cr('ve', 2015, 2026, 'the economic and political collapse', 2),
  cr('tr', 2016, 2018, 'the post-coup purges', 1),
  cr('ni', 2018, 2026, 'the crackdown', 2),
  cr('et', 2020, 2022, 'the Tigray war', 3),
  cr('af', 2021, 2026, 'Taliban rule', 3),
  cr('ht', 2021, 2026, 'gang violence', 2),
  cr('ua', 2022, 2026, 'the full-scale invasion', 3),
  cr('ru', 2022, 2026, 'wartime mobilization and repression', 1),
]

// ---------------------------------------------------------------------------
// Amnesties and regularizations for undocumented residents.

export interface Amnesty {
  country: string
  year: number
  /** Years living there undocumented needed to qualify. */
  minYears: number
  label: string
  result: 'permanent' | 'visa'
  /** Only people who arrived as children under this age (DACA). */
  arrivedUnder?: number
  /** Only nationals of these countries (Patria Grande). */
  origins?: string[]
}

export const AMNESTIES: Amnesty[] = [
  { country: 'us', year: 1986, minYears: 4, label: 'the Immigration Reform and Control Act amnesty', result: 'permanent' },
  { country: 'us', year: 2012, minYears: 5, label: 'Deferred Action for Childhood Arrivals (DACA)', result: 'visa', arrivedUnder: 16 },
  { country: 'fr', year: 1981, minYears: 1, label: 'the 1981 regularization', result: 'visa' },
  { country: 'fr', year: 1997, minYears: 3, label: 'the 1997 regularization', result: 'visa' },
  { country: 'it', year: 1990, minYears: 1, label: 'the Martelli law regularization', result: 'visa' },
  { country: 'it', year: 2002, minYears: 1, label: 'the Bossi-Fini regularization', result: 'visa' },
  { country: 'it', year: 2009, minYears: 1, label: 'the care-worker regularization', result: 'visa' },
  { country: 'it', year: 2020, minYears: 1, label: 'the pandemic regularization', result: 'visa' },
  { country: 'es', year: 1991, minYears: 1, label: 'the 1991 regularization', result: 'visa' },
  { country: 'es', year: 2000, minYears: 1, label: 'the 2000 regularization', result: 'visa' },
  { country: 'es', year: 2005, minYears: 1, label: 'the 2005 normalization', result: 'visa' },
  { country: 'pt', year: 2001, minYears: 1, label: 'the 2001 regularization', result: 'visa' },
  { country: 'gr', year: 1998, minYears: 1, label: 'the 1998 regularization', result: 'visa' },
  { country: 'gr', year: 2005, minYears: 2, label: 'the 2005 regularization', result: 'visa' },
  { country: 'be', year: 2000, minYears: 3, label: 'the 2000 regularization', result: 'visa' },
  { country: 'be', year: 2009, minYears: 3, label: 'the 2009 regularization', result: 'visa' },
  { country: 'nl', year: 2007, minYears: 5, label: 'the general pardon', result: 'permanent' },
  { country: 'ar', year: 2004, minYears: 1, label: 'the 2004 regularization', result: 'visa' },
  { country: 'ar', year: 2006, minYears: 0, label: 'the Patria Grande program', result: 'visa', origins: ['bo', 'br', 'cl', 'co', 'ec', 'py', 'pe', 'uy', 've'] },
  { country: 'br', year: 1998, minYears: 1, label: 'the 1998 amnesty', result: 'visa' },
  { country: 'br', year: 2009, minYears: 1, label: 'the 2009 amnesty', result: 'permanent' },
  { country: 'mx', year: 2008, minYears: 3, label: 'the regularization program', result: 'visa' },
  { country: 'za', year: 1996, minYears: 5, label: 'the SADC amnesty', result: 'permanent', origins: ['zw', 'ao', 'cd'] },
  { country: 'th', year: 2004, minYears: 1, label: 'the migrant worker registration', result: 'visa' },
  { country: 'my', year: 2011, minYears: 1, label: 'the 6P legalization program', result: 'visa' },
  { country: 'ae', year: 2018, minYears: 1, label: 'the 2018 amnesty', result: 'visa' },
  { country: 'sa', year: 2013, minYears: 1, label: 'the correction period', result: 'visa' },
  { country: 'ec', year: 2010, minYears: 1, label: 'the regularization for Venezuelans and others', result: 'visa' },
  { country: 'co', year: 2021, minYears: 0, label: 'the Temporary Protection Statute', result: 'visa', origins: ['ve'] },
]

// ---------------------------------------------------------------------------
// Historic US national-origins quotas (1924-1965) and modern per-country backlogs.

/** Rough odds a quota number came up for people from each country, 1924-1965. */
export const US_QUOTA_ODDS: Record<string, number> = {
  gb: 0.9, ie: 0.9, de: 0.85, nl: 0.7, be: 0.6, fr: 0.6, ch: 0.6, se: 0.65, no: 0.65, dk: 0.65, fi: 0.4, at: 0.45,
  cz: 0.3, sk: 0.3, pl: 0.2, hu: 0.15, it: 0.15, gr: 0.08, pt: 0.08, es: 0.08, ru: 0.05, ua: 0.05, ge: 0.05, kz: 0.05,
  ro: 0.1, rs: 0.08, hr: 0.08, ee: 0.15, tr: 0.05, au: 0.3, nz: 0.3, za: 0.2, il: 0.1, mc: 0.3, ad: 0.3,
}

/** [destination, origin, from, to, extra years of wait]: per-country caps that pile up backlogs. */
export const BACKLOGS: [string, string, number, number, number][] = [
  ['us', 'mx', 1980, 2100, 8],
  ['us', 'ph', 1980, 2100, 6],
  ['us', 'in', 2008, 2100, 9],
  ['us', 'cn', 2008, 2100, 4],
  ['us', 'vn', 2018, 2100, 2],
]

// ---------------------------------------------------------------------------
// Exclusion laws: historical bars on immigrants from some countries (named as what they were).

export interface Exclusion {
  dest: string
  from: number
  to: number
  /** Country ids, or continents from world.ts. */
  origins: string[]
  label: string
}

const ASIA_BARRED = ['in', 'pk', 'bd', 'af', 'th', 'vn', 'my', 'id', 'sg', 'mn', 'np', 'hk', 'tw', 'kr', 'jp', 'cn', 'ph']

export const EXCLUSIONS: Exclusion[] = [
  { dest: 'us', from: 1900, to: 1943, origins: ['cn', 'hk', 'tw'], label: 'the Chinese Exclusion Act' },
  { dest: 'us', from: 1917, to: 1952, origins: ASIA_BARRED.filter((x) => !['cn', 'hk', 'tw'].includes(x)), label: 'the Asiatic Barred Zone' },
  { dest: 'ca', from: 1923, to: 1947, origins: ['cn', 'hk', 'tw'], label: 'the Chinese Immigration Act' },
  { dest: 'ca', from: 1908, to: 1947, origins: ['in', 'pk', 'bd'], label: 'the continuous journey rule' },
  { dest: 'au', from: 1901, to: 1973, origins: ['Asia', 'Africa', 'Middle East', 'pg', 'ws', 'jm', 'ht', 'bs', 'do', 'cu', 'gy', 'bz'], label: 'the White Australia policy' },
  { dest: 'nz', from: 1920, to: 1974, origins: ['Asia', 'Africa', 'Middle East'], label: 'New Zealand\'s race-based entry permits' },
  { dest: 'za', from: 1913, to: 1991, origins: ['Asia', 'Middle East'], label: 'apartheid-era immigration law' },
]

// ---------------------------------------------------------------------------
// The Schengen area (no border checks between members): [country, first year].
export const SCHENGEN: [string, number][] = [
  ['fr', 1995], ['de', 1995], ['be', 1995], ['nl', 1995], ['es', 1995], ['pt', 1995], ['it', 1997], ['at', 1997], ['gr', 2000],
  ['dk', 2001], ['fi', 2001], ['no', 2001], ['se', 2001], ['ee', 2007], ['cz', 2007], ['hu', 2007], ['pl', 2007], ['sk', 2007],
  ['ch', 2008], ['hr', 2023], ['ro', 2024], ['mc', 1995], ['ad', 1995],
]
