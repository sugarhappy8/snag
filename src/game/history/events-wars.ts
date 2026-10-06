// Wars and conscription by era: which countries were at war in which years, who was drafted
// (ages, how likely, how harshly refusal was treated), where troops were sent, and when a
// country had peacetime national service. special/military.ts reads it for wartime drafts and
// national service; history/events.ts for the home front and the AI's era line. Real history
// only: nothing after PRESENT_YEAR (the future has no scripted wars). Pure data + lookups.
import { PRESENT_YEAR } from './timeline'

export interface DraftRule {
  /** Calendar years when call-ups happened (inclusive). */
  from: number
  to: number
  minAge: number
  maxAge: number
  /** Chance per war year that an eligible man is called up. */
  odds: number
  /** Women were called up too. */
  women?: boolean
  /** Refusal meant prison (or worse) and exemptions were rare. */
  harsh?: boolean
  /** University students were deferred until this year (inclusive). */
  studentsDeferredUntil?: number
}

export interface WarDef {
  id: string
  /** 'the Second World War', 'the Vietnam War'. */
  name: string
  from: number
  to: number
  /** Countries at war: their people live through it (news, the home front, deployments). */
  countries: readonly string[]
  /** Countries that joined after `from` (the US in 1941), by country id. */
  joined?: Readonly<Record<string, number>>
  /** Who was drafted, by country id. */
  draft?: Readonly<Record<string, DraftRule>>
  /** Where troops were sent, by country id ('*' for everyone else at war). */
  fronts?: Readonly<Record<string, readonly string[]>>
  /** Fighting, bombing or occupation on home soil in these countries. */
  homeFront?: readonly string[]
}

function d(from: number, to: number, minAge: number, maxAge: number, odds: number, extra: Partial<DraftRule> = {}): DraftRule {
  return { from, to, minAge, maxAge, odds, ...extra }
}
const harsh = { harsh: true }

const WWI_EMPIRES = ['pl', 'cz', 'sk', 'hr']
const SOVIET = ['ru', 'ua', 'ge', 'kz', 'ee']

export const WARS: readonly WarDef[] = [
  {
    id: 'boer', name: 'the Boer War', from: 1899, to: 1902, countries: ['za', 'gb', 'au', 'nz', 'ca'],
    draft: { za: d(1900, 1902, 16, 60, 0.5) },
    fronts: { '*': ['the South African veldt', 'the Orange Free State'] }, homeFront: ['za'],
  },
  { id: 'philippine', name: 'the Philippine-American War', from: 1899, to: 1902, countries: ['ph', 'us'], fronts: { '*': ['Luzon', 'the Visayas'] }, homeFront: ['ph'] },
  {
    id: 'russojapanese', name: 'the Russo-Japanese War', from: 1904, to: 1905, countries: ['ru', 'jp', 'ua', 'ee', 'ge', 'kz', 'pl', 'fi'],
    draft: { ru: d(1904, 1905, 21, 38, 0.35, harsh), ua: d(1904, 1905, 21, 38, 0.3, harsh), jp: d(1904, 1905, 20, 37, 0.4, harsh) },
    fronts: { '*': ['Manchuria', 'Port Arthur', 'Mukden'] },
  },
  {
    id: 'mexrev', name: 'the Mexican Revolution', from: 1910, to: 1920, countries: ['mx'],
    draft: { mx: d(1913, 1914, 18, 40, 0.3, harsh) }, fronts: { '*': ['the northern deserts', 'Torreón', 'Zacatecas'] }, homeFront: ['mx'],
  },
  {
    id: 'italoturkish', name: 'the Italo-Turkish War', from: 1911, to: 1912, countries: ['it', 'tr'],
    draft: { it: d(1911, 1912, 20, 30, 0.3), tr: d(1911, 1912, 20, 40, 0.3, harsh) }, fronts: { '*': ['Libya', 'Tripoli'] },
  },
  {
    id: 'balkan', name: 'the Balkan Wars', from: 1912, to: 1913, countries: ['gr', 'rs', 'tr'],
    draft: { gr: d(1912, 1913, 20, 40, 0.6), rs: d(1912, 1913, 20, 40, 0.7, harsh), tr: d(1912, 1913, 20, 40, 0.6, harsh) },
    fronts: { '*': ['Macedonia', 'Thrace', 'Edirne'] }, homeFront: ['rs', 'gr', 'tr'],
  },
  {
    id: 'ww1', name: 'the First World War', from: 1914, to: 1918,
    joined: { it: 1915, pt: 1916, ro: 1916, us: 1917, gr: 1917, br: 1917 },
    countries: ['de', 'fr', 'gb', 'at', 'hu', 'ru', 'ua', 'ee', 'ge', 'kz', 'rs', 'be', 'tr', 'it', 'us', 'ca', 'au', 'nz', 'za', 'in', 'jp', 'pt', 'ro', 'gr', 'br', 'ie', ...WWI_EMPIRES],
    draft: {
      de: d(1914, 1918, 18, 45, 0.75, harsh),
      at: d(1914, 1918, 18, 45, 0.75, harsh),
      hu: d(1914, 1918, 18, 45, 0.75, harsh),
      fr: d(1914, 1918, 18, 45, 0.8, harsh),
      gb: d(1916, 1918, 18, 41, 0.7),
      ru: d(1914, 1917, 18, 43, 0.6, harsh),
      ua: d(1914, 1917, 18, 43, 0.6, harsh),
      ee: d(1914, 1917, 18, 43, 0.5, harsh),
      ge: d(1914, 1917, 18, 43, 0.5, harsh),
      rs: d(1914, 1918, 18, 50, 0.8, harsh),
      be: d(1914, 1918, 19, 40, 0.5),
      tr: d(1914, 1918, 18, 45, 0.7, harsh),
      it: d(1915, 1918, 18, 40, 0.7, harsh),
      us: d(1917, 1918, 18, 45, 0.45),
      ca: d(1917, 1918, 20, 45, 0.4),
      nz: d(1916, 1918, 20, 45, 0.5),
      pt: d(1916, 1918, 20, 40, 0.4),
      ro: d(1916, 1918, 18, 45, 0.7, harsh),
      gr: d(1917, 1918, 20, 40, 0.5),
      ...Object.fromEntries(WWI_EMPIRES.map((id) => [id, d(1914, 1918, 18, 45, 0.6, harsh)])),
    },
    fronts: {
      '*': ['the Western Front', 'the trenches of Flanders', 'the Somme'],
      de: ['the Western Front', 'the Eastern Front', 'Verdun'],
      fr: ['Verdun', 'the Western Front', 'the Marne'],
      ru: ['the Eastern Front', 'Galicia'], ua: ['the Eastern Front', 'Galicia'], ee: ['the Eastern Front', 'Riga'], ge: ['the Caucasus front'],
      at: ['the Eastern Front', 'the Isonzo', 'Galicia'], hu: ['the Eastern Front', 'the Isonzo'],
      pl: ['the Eastern Front', 'Galicia'], cz: ['the Eastern Front', 'the Isonzo'], sk: ['the Eastern Front', 'the Carpathians'], hr: ['the Isonzo', 'the Serbian front'],
      it: ['the Isonzo', 'the Alps', 'the Piave'], tr: ['Gallipoli', 'the Caucasus front', 'Palestine', 'Mesopotamia'],
      rs: ['the Serbian front', 'Salonika'], au: ['Gallipoli', 'the Western Front', 'Palestine'], nz: ['Gallipoli', 'the Western Front'],
      us: ['the Western Front', 'the Argonne Forest'], gr: ['the Macedonian front'], ro: ['the Romanian front', 'the Carpathians'], pt: ['Flanders', 'Mozambique'],
      in: ['Mesopotamia', 'the Western Front'], za: ['German South West Africa', 'East Africa'],
    },
    homeFront: ['fr', 'be', 'rs', 'pl', 'ua', 'ro', 'it'],
  },
  {
    id: 'russiancivil', name: 'the Russian Civil War', from: 1917, to: 1922, countries: ['ru', 'ua', 'ge', 'kz', 'ee', 'fi'],
    draft: { ru: d(1918, 1920, 18, 40, 0.5, harsh), ua: d(1918, 1920, 18, 40, 0.5, harsh), ee: d(1918, 1920, 18, 35, 0.6), fi: d(1918, 1918, 18, 40, 0.4, harsh) },
    fronts: { '*': ['the Volga', 'Siberia', 'the Don steppe'], ee: ['the Narva front'], fi: ['Tampere'] }, homeFront: ['ru', 'ua', 'ge', 'kz', 'ee', 'fi'],
  },
  {
    id: 'polishsoviet', name: 'the Polish-Soviet War', from: 1919, to: 1921, countries: ['pl', 'ru', 'ua'],
    draft: { pl: d(1920, 1920, 18, 35, 0.5) }, fronts: { '*': ['the Vistula', 'Ukraine'] }, homeFront: ['pl', 'ua'],
  },
  {
    id: 'grecoturkish', name: 'the Greco-Turkish War', from: 1919, to: 1922, countries: ['gr', 'tr'],
    draft: { gr: d(1919, 1922, 20, 35, 0.6), tr: d(1919, 1922, 18, 40, 0.6, harsh) }, fronts: { '*': ['Anatolia', 'Smyrna', 'the Sakarya River'] }, homeFront: ['tr'],
  },
  { id: 'irish', name: 'the Irish War of Independence', from: 1919, to: 1923, countries: ['ie'], homeFront: ['ie'] },
  {
    id: 'chaco', name: 'the Chaco War', from: 1932, to: 1935, countries: ['bo', 'py'],
    draft: { bo: d(1932, 1935, 18, 40, 0.6, harsh), py: d(1932, 1935, 18, 40, 0.7, harsh) }, fronts: { '*': ['the Chaco scrubland', 'Boquerón', 'Nanawa'] },
  },
  {
    id: 'ethiopia', name: 'the Second Italo-Ethiopian War', from: 1935, to: 1941, countries: ['et', 'it'],
    draft: { et: d(1935, 1936, 18, 45, 0.6, harsh), it: d(1935, 1936, 20, 30, 0.3, harsh) }, fronts: { et: ['the northern highlands', 'Maychew'], it: ['Abyssinia', 'Adwa'] }, homeFront: ['et'],
  },
  {
    id: 'spanishcivil', name: 'the Spanish Civil War', from: 1936, to: 1939, countries: ['es'],
    draft: { es: d(1936, 1939, 18, 40, 0.7, harsh) }, fronts: { '*': ['the Madrid front', 'the Ebro', 'Aragon', 'Teruel'] }, homeFront: ['es'],
  },
  {
    id: 'ww2', name: 'the Second World War', from: 1939, to: 1945,
    joined: {
      it: 1940, nl: 1940, be: 1940, no: 1940, dk: 1940, gr: 1940, eg: 1940, et: 1940,
      ru: 1941, ua: 1941, ge: 1941, kz: 1941, ee: 1941, hu: 1941, ro: 1941, rs: 1941, hr: 1941, us: 1941, jp: 1941, cn: 1941,
      th: 1941, ph: 1941, my: 1941, sg: 1941, hk: 1941, id: 1941, vn: 1941, kr: 1941, tw: 1941, br: 1942, mx: 1942, pg: 1942,
    },
    countries: [
      'de', 'at', 'gb', 'fr', 'pl', 'it', ...SOVIET, 'fi', 'us', 'ca', 'au', 'nz', 'za', 'in', 'jp', 'cn', 'hu', 'ro', 'sk', 'cz', 'gr', 'rs', 'hr',
      'nl', 'be', 'no', 'dk', 'ph', 'th', 'my', 'sg', 'hk', 'id', 'vn', 'kr', 'tw', 'mn', 'br', 'mx', 'eg', 'et', 'pg',
    ],
    draft: {
      de: d(1939, 1945, 18, 45, 0.8, harsh),
      at: d(1939, 1945, 18, 45, 0.8, harsh),
      gb: d(1939, 1945, 18, 41, 0.75),
      fr: d(1939, 1940, 20, 45, 0.8),
      pl: d(1939, 1939, 18, 45, 0.7, harsh),
      it: d(1940, 1943, 18, 40, 0.7, harsh),
      ...Object.fromEntries(SOVIET.map((id) => [id, d(1941, 1945, 18, 45, 0.8, harsh)])),
      fi: d(1939, 1944, 18, 45, 0.85, harsh),
      us: d(1940, 1945, 18, 37, 0.6),
      ca: d(1940, 1945, 21, 45, 0.4),
      au: d(1939, 1945, 18, 35, 0.4),
      nz: d(1940, 1945, 18, 45, 0.5),
      jp: d(1941, 1945, 19, 45, 0.8, harsh),
      hu: d(1941, 1945, 18, 40, 0.7, harsh),
      ro: d(1941, 1945, 18, 40, 0.7, harsh),
      sk: d(1939, 1944, 20, 40, 0.5, harsh),
      gr: d(1940, 1941, 20, 40, 0.7),
      rs: d(1941, 1941, 20, 40, 0.6),
      hr: d(1941, 1941, 20, 40, 0.6),
      nl: d(1940, 1940, 19, 35, 0.6),
      be: d(1940, 1940, 19, 35, 0.6),
      no: d(1940, 1940, 19, 35, 0.6),
      th: d(1941, 1945, 18, 35, 0.3, harsh),
      br: d(1943, 1945, 21, 30, 0.15),
      ph: d(1941, 1942, 21, 30, 0.4),
      kr: d(1944, 1945, 20, 25, 0.4, harsh),
      tw: d(1945, 1945, 20, 25, 0.3, harsh),
      mn: d(1939, 1939, 18, 40, 0.3, harsh),
    },
    fronts: {
      '*': ['North Africa', 'Normandy', 'Italy', 'the Pacific islands', 'Burma'],
      us: ['Normandy', 'the Pacific islands', 'North Africa', 'Italy', 'the Ardennes', 'Okinawa'],
      ca: ['Normandy', 'Italy', 'the Netherlands'],
      au: ['North Africa', 'New Guinea', 'Crete', 'the Pacific islands'], nz: ['North Africa', 'Crete', 'Italy', 'the Pacific islands'],
      ...Object.fromEntries(SOVIET.map((id) => [id, ['the Eastern Front', 'Stalingrad', 'Kursk', 'Leningrad', 'Berlin']])),
      de: ['the Eastern Front', 'North Africa', 'Normandy', 'Italy'], at: ['the Eastern Front', 'Italy', 'the Balkans'],
      it: ['North Africa', 'Greece', 'the Eastern Front'], hu: ['the Eastern Front', 'the Don River'], ro: ['the Eastern Front', 'Odessa'], sk: ['the Eastern Front'],
      fi: ['the Karelian Isthmus', 'the frozen forests of Karelia'], jp: ['China', 'the Pacific islands', 'Burma', 'the Philippines', 'New Guinea'],
      pl: ['the Polish border', 'the Bzura River'], fr: ['the Maginot Line', 'the Ardennes'], gr: ['the Albanian mountains'],
      nl: ['the Grebbe line'], be: ['the Lys River'], no: ['Narvik'], rs: ['the Yugoslav border'], hr: ['the Yugoslav border'],
      th: ['the Shan States'], br: ['the Italian Apennines'], ph: ['Bataan', 'Corregidor'], kr: ['Manchuria', 'the Pacific islands'], tw: ['the Pacific islands'],
      mn: ['Khalkhin Gol'], in: ['Burma', 'North Africa', 'Italy'], za: ['North Africa', 'Italy'],
    },
    homeFront: ['gb', 'de', 'at', 'fr', 'pl', ...SOVIET, 'it', 'nl', 'be', 'no', 'dk', 'gr', 'rs', 'hr', 'cz', 'sk', 'hu', 'ro', 'fi', 'jp', 'cn', 'ph', 'my', 'sg', 'hk', 'id', 'vn', 'th', 'eg', 'et', 'pg'],
  },
  {
    id: 'sinojapanese', name: 'the Second Sino-Japanese War', from: 1937, to: 1945, countries: ['cn', 'jp', 'tw', 'hk'],
    draft: { cn: d(1937, 1945, 18, 45, 0.5, harsh), jp: d(1937, 1945, 20, 40, 0.6, harsh) },
    fronts: { cn: ['Shanghai', 'Wuhan', 'the Yangtze front', 'Changsha'], jp: ['China', 'Manchuria', 'Shanghai'], '*': ['China'] }, homeFront: ['cn'],
  },
  {
    id: 'chinesecivil', name: 'the Chinese Civil War', from: 1945, to: 1949, countries: ['cn', 'tw'],
    draft: { cn: d(1946, 1949, 18, 40, 0.5, harsh) }, fronts: { '*': ['Manchuria', 'the Huai River', 'the Yangtze'] }, homeFront: ['cn'],
  },
  {
    id: 'indonesian', name: 'the Indonesian War of Independence', from: 1945, to: 1949, countries: ['id', 'nl'],
    draft: { nl: d(1946, 1949, 19, 25, 0.4) }, fronts: { '*': ['Java', 'Sumatra'] }, homeFront: ['id'],
  },
  {
    id: 'indochina', name: 'the First Indochina War', from: 1946, to: 1954, countries: ['vn', 'fr'],
    draft: { vn: d(1946, 1954, 18, 40, 0.3, harsh) }, fronts: { '*': ['the Red River Delta', 'Dien Bien Phu', 'the Tonkin highlands'] }, homeFront: ['vn'],
  },
  {
    id: 'greekcivil', name: 'the Greek Civil War', from: 1946, to: 1949, countries: ['gr'],
    draft: { gr: d(1946, 1949, 20, 30, 0.6) }, fronts: { '*': ['the Grammos mountains', 'Vitsi'] }, homeFront: ['gr'],
  },
  {
    id: 'arabisraeli', name: 'the first Arab-Israeli War', from: 1948, to: 1949, countries: ['il', 'eg', 'jo', 'sy', 'lb', 'iq'],
    draft: { il: d(1948, 1949, 17, 40, 0.9, { women: true }), eg: d(1948, 1948, 18, 35, 0.3, harsh) },
    fronts: { il: ['the Negev', 'Jerusalem', 'the Galilee'], '*': ['the Sinai', 'Gaza', 'Jerusalem'] }, homeFront: ['il'],
  },
  {
    id: 'korea', name: 'the Korean War', from: 1950, to: 1953,
    countries: ['kr', 'us', 'gb', 'au', 'ca', 'nz', 'tr', 'ph', 'th', 'co', 'et', 'za', 'cn', 'fr', 'be', 'nl', 'gr'],
    draft: { kr: d(1950, 1953, 18, 40, 0.8, harsh), us: d(1950, 1953, 18, 26, 0.35) },
    fronts: { kr: ['the Pusan perimeter', 'the 38th parallel', 'Seoul'], '*': ['the Korean peninsula', 'the Chosin Reservoir', 'the 38th parallel'] }, homeFront: ['kr'],
  },
  { id: 'malaya', name: 'the Malayan Emergency', from: 1948, to: 1960, countries: ['my', 'gb', 'sg'], fronts: { '*': ['the Malayan jungle'] }, homeFront: ['my'] },
  { id: 'maumau', name: 'the Mau Mau uprising', from: 1952, to: 1960, countries: ['ke', 'gb'], fronts: { '*': ['the Kenyan highlands'] }, homeFront: ['ke'] },
  {
    id: 'algeria', name: 'the Algerian War', from: 1954, to: 1962, countries: ['dz', 'fr'],
    draft: { fr: d(1955, 1962, 20, 25, 0.6) }, fronts: { '*': ['the Aurès mountains', 'the Casbah of Algiers', 'the Kabylie'] }, homeFront: ['dz'],
  },
  {
    id: 'suez', name: 'the Suez Crisis', from: 1956, to: 1956, countries: ['eg', 'gb', 'fr', 'il'],
    draft: { eg: d(1956, 1956, 18, 35, 0.3, harsh) }, fronts: { '*': ['the Suez Canal', 'the Sinai', 'Port Said'] }, homeFront: ['eg'],
  },
  {
    id: 'vietnam', name: 'the Vietnam War', from: 1955, to: 1975, countries: ['vn', 'us', 'au', 'nz', 'kr', 'th', 'ph'],
    joined: { us: 1964, au: 1965, nz: 1965, kr: 1964, th: 1965, ph: 1966 },
    draft: { vn: d(1960, 1975, 18, 40, 0.6, harsh), us: d(1964, 1973, 18, 26, 0.25, { studentsDeferredUntil: 1971 }) },
    fronts: { vn: ['the Ho Chi Minh Trail', 'the Mekong Delta', 'the Central Highlands'], '*': ['the Mekong Delta', 'the Central Highlands', 'Khe Sanh', 'the jungles of Vietnam'] },
    homeFront: ['vn'],
  },
  { id: 'sinoindian', name: 'the Sino-Indian War', from: 1962, to: 1962, countries: ['cn', 'in'], fronts: { '*': ['the Himalayan border', 'Aksai Chin'] } },
  {
    id: 'portuguesecolonial', name: 'the Portuguese Colonial War', from: 1961, to: 1974, countries: ['pt', 'ao'],
    draft: { pt: d(1961, 1974, 20, 25, 0.7, harsh) }, fronts: { '*': ['Angola', 'Mozambique', 'Guinea-Bissau'] }, homeFront: ['ao'],
  },
  { id: 'indopak65', name: 'the Indo-Pakistani War', from: 1965, to: 1965, countries: ['in', 'pk'], fronts: { '*': ['Kashmir', 'the Punjab border'] } },
  {
    id: 'sixday', name: 'the Six-Day War', from: 1967, to: 1967, countries: ['il', 'eg', 'sy', 'jo'],
    draft: { eg: d(1967, 1967, 18, 40, 0.4, harsh), sy: d(1967, 1967, 18, 40, 0.4, harsh), jo: d(1967, 1967, 18, 40, 0.4, harsh) },
    fronts: { '*': ['the Sinai', 'the Golan Heights', 'the West Bank'] },
  },
  {
    id: 'attrition', name: 'the War of Attrition', from: 1967, to: 1970, countries: ['eg', 'il'],
    draft: { eg: d(1968, 1970, 18, 30, 0.4, harsh) }, fronts: { '*': ['the Suez Canal'] },
  },
  {
    id: 'biafra', name: 'the Nigerian Civil War', from: 1967, to: 1970, countries: ['ng'],
    draft: { ng: d(1967, 1970, 18, 35, 0.4, harsh) }, fronts: { '*': ['Biafra', 'the Niger Delta', 'Onitsha'] }, homeFront: ['ng'],
  },
  {
    id: 'rhodesia', name: 'the Rhodesian Bush War', from: 1964, to: 1979, countries: ['zw'],
    draft: { zw: d(1966, 1979, 18, 38, 0.3) }, fronts: { '*': ['the Zambezi Valley', 'the eastern border'] }, homeFront: ['zw'],
  },
  {
    id: 'saborder', name: 'the South African Border War', from: 1966, to: 1989, countries: ['za', 'ao'],
    draft: { za: d(1967, 1989, 18, 25, 0.3) }, fronts: { '*': ['the Namibian border', 'southern Angola'] },
  },
  { id: 'bangladesh', name: 'the Bangladesh Liberation War', from: 1971, to: 1971, countries: ['bd', 'pk', 'in'], fronts: { '*': ['East Pakistan', 'Dhaka'] }, homeFront: ['bd'] },
  {
    id: 'yomkippur', name: 'the Yom Kippur War', from: 1973, to: 1973, countries: ['il', 'eg', 'sy'],
    draft: { eg: d(1973, 1973, 18, 40, 0.5, harsh), sy: d(1973, 1973, 18, 40, 0.5, harsh) }, fronts: { '*': ['the Sinai', 'the Golan Heights'] },
  },
  { id: 'cyprus', name: 'the Cyprus war', from: 1974, to: 1974, countries: ['tr', 'gr'], draft: { gr: d(1974, 1974, 20, 45, 0.5) }, fronts: { '*': ['Cyprus'] } },
  { id: 'lebanon', name: 'the Lebanese Civil War', from: 1975, to: 1990, countries: ['lb'], homeFront: ['lb'] },
  {
    id: 'angola', name: 'the Angolan Civil War', from: 1975, to: 2002, countries: ['ao'],
    draft: { ao: d(1976, 2002, 18, 35, 0.4, harsh) }, fronts: { '*': ['the southern bush', 'Cuito Cuanavale', 'the central highlands'] }, homeFront: ['ao'],
  },
  {
    id: 'ethiopia-derg', name: "Ethiopia's civil wars", from: 1974, to: 1991, countries: ['et'],
    draft: { et: d(1977, 1991, 18, 30, 0.4, harsh) }, fronts: { '*': ['Eritrea', 'Tigray', 'the Ogaden'] }, homeFront: ['et'],
  },
  {
    id: 'soviet-afghan', name: 'the Soviet-Afghan War', from: 1979, to: 1989, countries: ['af', ...SOVIET],
    draft: { af: d(1980, 1989, 18, 35, 0.5, harsh) }, fronts: { '*': ['Afghanistan', 'the Panjshir Valley', 'Kandahar'], af: ['the Panjshir Valley', 'Kandahar', 'Herat'] }, homeFront: ['af'],
  },
  {
    id: 'iraniraq', name: 'the Iran-Iraq War', from: 1980, to: 1988, countries: ['ir', 'iq'],
    draft: { ir: d(1980, 1988, 18, 40, 0.7, harsh), iq: d(1980, 1988, 18, 45, 0.8, harsh) }, fronts: { '*': ['the marshes of Basra', 'Khorramshahr', 'the Faw Peninsula'] }, homeFront: ['ir', 'iq'],
  },
  {
    id: 'elsalvador', name: 'the Salvadoran Civil War', from: 1980, to: 1992, countries: ['sv'],
    draft: { sv: d(1980, 1992, 18, 30, 0.4, harsh) }, fronts: { '*': ['the Morazán mountains', 'Chalatenango'] }, homeFront: ['sv'],
  },
  {
    id: 'guatemala', name: 'the Guatemalan Civil War', from: 1960, to: 1996, countries: ['gt'],
    draft: { gt: d(1978, 1996, 18, 30, 0.35, harsh) }, fronts: { '*': ['the western highlands', 'the Petén jungle'] }, homeFront: ['gt'],
  },
  {
    id: 'contra', name: 'the Contra War', from: 1981, to: 1990, countries: ['ni'],
    draft: { ni: d(1983, 1990, 18, 25, 0.6, harsh) }, fronts: { '*': ['the Honduran border', 'the northern jungle'] }, homeFront: ['ni'],
  },
  {
    id: 'falklands', name: 'the Falklands War', from: 1982, to: 1982, countries: ['ar', 'gb'],
    draft: { ar: d(1982, 1982, 18, 20, 0.6, harsh) }, fronts: { '*': ['the Falkland Islands', 'the South Atlantic'] },
  },
  {
    id: 'gulf', name: 'the Gulf War', from: 1990, to: 1991, countries: ['iq', 'kw', 'us', 'gb', 'fr', 'sa', 'eg', 'sy', 'ca', 'au', 'it'],
    draft: { iq: d(1990, 1991, 18, 45, 0.7, harsh) }, fronts: { iq: ['Kuwait', 'the southern desert'], '*': ['the Kuwaiti desert', 'the Saudi border'] }, homeFront: ['kw', 'iq'],
  },
  {
    id: 'yugoslav', name: 'the Yugoslav Wars', from: 1991, to: 1995, countries: ['hr', 'rs'],
    draft: { hr: d(1991, 1995, 18, 45, 0.6), rs: d(1991, 1995, 18, 45, 0.5, harsh) }, fronts: { '*': ['Vukovar', 'the Krajina', 'Bosnia'] }, homeFront: ['hr'],
  },
  { id: 'algeriacivil', name: "Algeria's civil war", from: 1992, to: 2002, countries: ['dz'], fronts: { '*': ['the Atlas mountains', 'the Mitidja plain'] }, homeFront: ['dz'] },
  { id: 'chechnya1', name: 'the First Chechen War', from: 1994, to: 1996, countries: ['ru'], fronts: { '*': ['Grozny', 'the Caucasus mountains'] } },
  {
    id: 'cenepa', name: 'the Cenepa War', from: 1995, to: 1995, countries: ['pe', 'ec'],
    draft: { pe: d(1995, 1995, 18, 30, 0.3), ec: d(1995, 1995, 18, 30, 0.3) }, fronts: { '*': ['the Cenepa Valley'] },
  },
  {
    id: 'congo', name: 'the Congo Wars', from: 1996, to: 2003, countries: ['cd', 'ao', 'ug', 'zw'],
    draft: { cd: d(1996, 2003, 18, 35, 0.3, harsh) }, fronts: { '*': ['the eastern Congo', 'Kisangani'] }, homeFront: ['cd'],
  },
  {
    id: 'ethiopiaeritrea', name: 'the Eritrean-Ethiopian War', from: 1998, to: 2000, countries: ['et'],
    draft: { et: d(1998, 2000, 18, 40, 0.5, harsh) }, fronts: { '*': ['Badme', 'the Eritrean border'] },
  },
  {
    id: 'kosovo', name: 'the Kosovo War', from: 1998, to: 1999, countries: ['rs'],
    draft: { rs: d(1998, 1999, 18, 45, 0.5, harsh) }, fronts: { '*': ['Kosovo'] }, homeFront: ['rs'],
  },
  { id: 'kargil', name: 'the Kargil War', from: 1999, to: 1999, countries: ['in', 'pk'], fronts: { '*': ['Kargil', 'the Kashmir heights'] } },
  { id: 'chechnya2', name: 'the Second Chechen War', from: 1999, to: 2009, countries: ['ru'], fronts: { '*': ['Grozny', 'the Caucasus mountains'] } },
  {
    id: 'afghanistan', name: 'the war in Afghanistan', from: 2001, to: 2021,
    countries: ['af', 'us', 'gb', 'ca', 'au', 'nz', 'de', 'fr', 'it', 'nl', 'dk', 'no', 'pl', 'ro', 'ge', 'es', 'be', 'cz', 'ee', 'hu', 'tr'],
    fronts: { '*': ['Helmand', 'Kandahar', 'the Korengal Valley', 'Kabul'] }, homeFront: ['af'],
  },
  {
    id: 'iraq', name: 'the Iraq War', from: 2003, to: 2011, countries: ['iq', 'us', 'gb', 'au', 'pl', 'it', 'kr', 'ge', 'ro', 'dk', 'nl', 'ua', 'es'],
    draft: { iq: d(2003, 2003, 18, 45, 0.5, harsh) }, fronts: { '*': ['Baghdad', 'Fallujah', 'Basra', 'the Sunni Triangle'] }, homeFront: ['iq'],
  },
  { id: 'lebanon2006', name: 'the 2006 Lebanon War', from: 2006, to: 2006, countries: ['il', 'lb'], fronts: { '*': ['southern Lebanon'] }, homeFront: ['lb', 'il'] },
  {
    id: 'georgia', name: 'the Russo-Georgian War', from: 2008, to: 2008, countries: ['ge', 'ru'],
    draft: { ge: d(2008, 2008, 18, 40, 0.3) }, fronts: { '*': ['South Ossetia', 'Gori'] }, homeFront: ['ge'],
  },
  {
    id: 'syria', name: 'the Syrian Civil War', from: 2011, to: 2024, countries: ['sy'],
    draft: { sy: d(2011, 2024, 18, 42, 0.6, harsh) }, fronts: { '*': ['Aleppo', 'Homs', 'the eastern desert', 'Idlib'] }, homeFront: ['sy'],
  },
  { id: 'isis', name: 'the war against the Islamic State', from: 2014, to: 2017, countries: ['iq', 'sy', 'us', 'gb', 'fr', 'au'], fronts: { '*': ['Mosul', 'Raqqa', 'Ramadi'] }, homeFront: ['iq'] },
  {
    id: 'donbas', name: 'the war in Donbas', from: 2014, to: 2021, countries: ['ua', 'ru'],
    draft: { ua: d(2014, 2015, 20, 50, 0.3) }, fronts: { '*': ['the Donbas', 'Debaltseve', 'Ilovaisk'] }, homeFront: ['ua'],
  },
  {
    id: 'ukraine', name: 'the Russian invasion of Ukraine', from: 2022, to: PRESENT_YEAR - 1, countries: ['ua', 'ru'],
    draft: { ua: d(2022, PRESENT_YEAR - 1, 25, 55, 0.45, harsh), ru: d(2022, 2022, 20, 50, 0.12, harsh) },
    fronts: { '*': ['the Donbas', 'Bakhmut', 'Kharkiv', 'Zaporizhzhia', 'Kherson'] }, homeFront: ['ua'],
  },
  { id: 'gaza', name: 'the Gaza war', from: 2023, to: PRESENT_YEAR - 1, countries: ['il'], fronts: { '*': ['Gaza', 'the Lebanese border'] }, homeFront: ['il'] },
]

const WAR_BY_ID = new Map(WARS.map((w) => [w.id, w]))

export function getWar(id: string): WarDef | undefined {
  return WAR_BY_ID.get(id)
}

/** The year this country entered a war (the US joined the Second World War in 1941). */
export function warStartFor(war: WarDef, countryId: string): number {
  return Math.max(war.from, war.joined?.[countryId] ?? war.from)
}

/** Wars this country was fighting in this year (none after PRESENT_YEAR - 1). */
export function warsAt(countryId: string, year: number): WarDef[] {
  if (year >= PRESENT_YEAR) return []
  return WARS.filter((w) => w.countries.includes(countryId) && year >= warStartFor(w, countryId) && year <= w.to)
}

/** The war whose draft calls up people of this country this year, with its rule (or null). */
export function warDraftAt(countryId: string, year: number): { war: WarDef; rule: DraftRule } | null {
  if (year >= PRESENT_YEAR) return null
  for (const w of WARS) {
    const rule = w.draft?.[countryId]
    if (rule && year >= rule.from && year <= rule.to) return { war: w, rule }
  }
  return null
}

/** Places this country's troops were sent in a war. */
export function warFronts(war: WarDef, countryId: string): readonly string[] {
  return war.fronts?.[countryId] ?? war.fronts?.['*'] ?? []
}

/** True when this war was fought on (or bombed, or occupied) this country's own soil. */
export function homeFrontAt(war: WarDef, countryId: string): boolean {
  return war.homeFront?.includes(countryId) ?? false
}

// ---------------------------------------------------------------------------
// Peacetime national service

/**
 * Years with peacetime conscription of young men, by country. Countries not listed follow the
 * present-day rule in world.ts (Country.conscription) for every year.
 */
const CONSCRIPTION: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  us: [[1940, 1973]],
  gb: [[1939, 1960]],
  au: [[1951, 1959], [1964, 1972]],
  nz: [[1949, 1958], [1962, 1972]],
  fr: [[1900, 1996]],
  de: [[1900, 1918], [1935, 1945], [1956, 2010]],
  at: [[1900, 1918], [1938, 1945], [1955, 9999]],
  it: [[1900, 2004]],
  es: [[1900, 2001]],
  pt: [[1911, 2004]],
  nl: [[1900, 1996]],
  be: [[1909, 1994]],
  pl: [[1918, 2008]],
  cz: [[1918, 2004]],
  sk: [[1918, 2005]],
  hu: [[1900, 2004]],
  ro: [[1900, 2006]],
  rs: [[1900, 2010]],
  hr: [[1918, 2007], [2025, 9999]],
  ar: [[1901, 1994]],
  pe: [[1898, 1999]],
  ec: [[1902, 2008]],
  jp: [[1900, 1945]],
  za: [[1967, 1993]],
  my: [[2004, 2018]],
  iq: [[1935, 2003]],
  sy: [[1953, 2024]],
  lb: [[1983, 2007]],
  jo: [[1966, 1991], [2020, 9999]],
  kw: [[1978, 2001], [2017, 9999]],
  qa: [[2014, 9999]],
  ae: [[2014, 9999]],
  ma: [[1966, 2006], [2019, 9999]],
  ee: [[1918, 9999]],
  ua: [[1900, 2012], [2014, 9999]],
  se: [[1901, 2009], [2017, 9999]],
  sg: [[1967, 9999]],
  tw: [[1951, 9999]],
  kr: [[1949, 9999]],
  il: [[1949, 9999]],
  kz: [[1920, 9999]],
  ge: [[1922, 9999]],
  mn: [[1921, 9999]],
  cu: [[1963, 9999]],
  dz: [[1969, 9999]],
  tn: [[1957, 9999]],
  ao: [[1975, 9999]],
  eg: [[1947, 9999]],
  vn: [[1955, 9999]],
  th: [[1905, 9999]],
  ir: [[1925, 9999]],
  fi: [[1918, 9999]],
  br: [[1908, 9999]],
  bo: [[1907, 9999]],
  et: [[1983, 1991]],
}

/** Women called up in peacetime too (from this year). */
const WOMEN_FROM: Readonly<Record<string, number>> = { il: 1949, no: 2015, se: 2017 }

/**
 * Was there peacetime national service in this country and (historical) year? `today` is the
 * present-day rule (Country.conscription), used for countries without history data.
 */
export function conscriptionAt(countryId: string, year: number, today: boolean): boolean {
  const spans = CONSCRIPTION[countryId]
  if (!spans) return today
  return spans.some(([a, b]) => year >= a && year <= b)
}

/** Did national service call up women in this country and year? */
export function womenConscriptedAt(countryId: string, year: number): boolean {
  const from = WOMEN_FROM[countryId]
  return from !== undefined && year >= from
}

/** Chance that an eligible 18-20-year-old was called up at all (ballots and lotteries). */
export function serviceOddsAt(countryId: string, year: number): number {
  switch (countryId) {
    case 'us':
      return 0.4
    case 'au':
      return year < 1960 ? 1 : 0.25
    case 'nz':
      return year < 1960 ? 1 : 0.3
    case 'za':
    case 'th':
      return 0.5
    case 'my':
      return 0.2
    default:
      return 1
  }
}

/** University students were deferred from peacetime service here and then. */
export function studentsDeferredAt(countryId: string, year: number): boolean {
  return countryId === 'us' && year <= 1971
}
