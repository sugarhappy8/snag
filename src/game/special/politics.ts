// Special career: Politician. Run for office (party, platform, campaign budget, a three-stop
// campaign trail, election night), then govern: read the newspaper to learn what voters care
// about, broadcast speeches, stage rallies, pass or veto bills, dodge (or pocket) political
// favors, survive scandals and impeachment, and run for re-election or higher office.
// School Board Director → Mayor → Governor → President / Prime Minister. From Mayor up you can
// also abuse the office: market-moving announcements, insider trades and the fallout (see
// "Abuse of power" below).
import { cryptoBanned, enforcement, local, readState as readMoney, regulator } from '../computer/money-common'
import { caseProfit, coinTargets, findTarget, freezeBets, maxBet, minBet, openBetsOn, placeBet, priceLabel, stockTargets, tagBets, type BetTarget } from '../computer/money-stocks'
import { addHidden, addMoney, addStat, count, earnIncome, log, remember, scriptChoice, scriptInput, spend, useYearAction, yearActionsUsed } from '../core'
import { arrestPlayer } from '../crime'
import { killCharacter } from '../death'
import { localPick, localSoftDrink } from '../data/locales'
import { marketOf } from '../data/markets'
import { exchangeInfo } from '../invest/engine'
import { addMarketShock, indexShockFactor, type ShockCause } from '../invest/shocks'
import { investmentHoldings, revalueHoldings } from '../investments'
import { chance, pick, rand, randInt, shuffle } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { countryLabel, getCountry, randomFirstName, randomLastName } from '../world'
import {
  CELEBS,
  addFame,
  blocked,
  clamp100,
  convictions,
  fameOf,
  fameToward,
  hasCollegeDegree,
  hasHighSchool,
  hire,
  leave,
  money,
  myJob,
  num,
  setOwnFlag,
  peek,
  prof,
  quitNote,
  say,
  setRole,
  str,
  syncTenure,
  tell,
  view,
} from './common'

// ---------------------------------------------------------------------------
// Offices

type OfficeId = 'school' | 'mayor' | 'governor' | 'leader'

interface OfficeDef {
  id: OfficeId
  rank: number
  emoji: string
  minAge: number
  salary: number
  term: number
  /** 0 = no limit. */
  termLimit: number
  fame: number
  /** Campaign budget tiers (0 = grassroots). */
  budgets: number[]
  /** Base strength of the typical opponent. */
  opponent: number
}

const OFFICES: OfficeDef[] = [
  { id: 'school', rank: 0, emoji: '\u{1F3EB}', minAge: 18, salary: 22_000, term: 4, termLimit: 0, fame: 4, budgets: [0, 2_000, 10_000, 30_000], opponent: 44 },
  { id: 'mayor', rank: 1, emoji: '\u{1F3D9}\u{FE0F}', minAge: 21, salary: 95_000, term: 4, termLimit: 0, fame: 18, budgets: [0, 25_000, 150_000, 600_000], opponent: 48 },
  { id: 'governor', rank: 2, emoji: '\u{1F3DB}\u{FE0F}', minAge: 30, salary: 150_000, term: 4, termLimit: 2, fame: 40, budgets: [0, 250_000, 1_500_000, 6_000_000], opponent: 51 },
  { id: 'leader', rank: 3, emoji: '\u{1F3DB}\u{FE0F}', minAge: 35, salary: 400_000, term: 4, termLimit: 2, fame: 85, budgets: [0, 2_000_000, 15_000_000, 60_000_000], opponent: 54 },
]

function officeOf(id: string): OfficeDef {
  return OFFICES.find((o) => o.id === id) ?? OFFICES[0]
}

// ---------------------------------------------------------------------------
// Political systems: who runs things here.
//
// The ladder is the same everywhere (four rungs), but the rungs follow the country: a school
// board, Governor and President in the US; a city council, Member of Parliament and Prime
// Minister in Britain; a Minister-President and a Chancellor in Germany; a Chief Minister in
// India; a Taoiseach in Ireland. Monarchies elect prime ministers, never kings.

const PM_COUNTRIES = [
  'gb', 'jp', 'in', 'ca', 'au', 'nz', 'it', 'es', 'nl', 'se', 'no', 'dk', 'be', 'il', 'gr', 'pt', 'pl',
  'hu', 'cz', 'sk', 'hr', 'ee', 'fi', 'ro', 'bd', 'np', 'pk', 'iq', 'lb', 'sg', 'my', 'th', 'jm', 'bs', 'bz',
  'pg', 'ws', 'aw', 'ge', 'mn', 'rs',
]

const LEADER_TITLES: Record<string, string> = {
  de: 'Chancellor',
  at: 'Chancellor',
  ie: 'Taoiseach',
  ad: 'Head of Government',
  mc: 'Minister of State',
  ch: 'President of the Confederation',
}

function leaderTitle(g: GameState): string {
  const id = g.character.countryId
  if (LEADER_TITLES[id]) return LEADER_TITLES[id]
  if (PM_COUNTRIES.includes(id)) return 'Prime Minister'
  return getCountry(id).monarchy ? 'Prime Minister' : 'President'
}

/** Heads of government who answer to parliament (no-confidence votes instead of impeachment). */
function parliamentary(g: GameState): boolean {
  const t = leaderTitle(g)
  return t !== 'President'
}

/** Countries with an elected head of each state/province, and what that office is called. */
const REGIONAL_HEADS: Record<string, { title: string; unit: string }> = {
  us: { title: 'Governor', unit: 'state' },
  mx: { title: 'Governor', unit: 'state' },
  br: { title: 'Governor', unit: 'state' },
  ar: { title: 'Governor', unit: 'province' },
  ng: { title: 'Governor', unit: 'state' },
  id: { title: 'Governor', unit: 'province' },
  jp: { title: 'Governor', unit: 'prefecture' },
  co: { title: 'Governor', unit: 'department' },
  ve: { title: 'Governor', unit: 'state' },
  pe: { title: 'Regional Governor', unit: 'region' },
  bo: { title: 'Governor', unit: 'department' },
  py: { title: 'Governor', unit: 'department' },
  cl: { title: 'Regional Governor', unit: 'region' },
  ke: { title: 'Governor', unit: 'county' },
  ru: { title: 'Governor', unit: 'region' },
  ca: { title: 'Premier', unit: 'province' },
  au: { title: 'Premier', unit: 'state' },
  de: { title: 'Minister-President', unit: 'state' },
  at: { title: 'Governor', unit: 'state' },
  in: { title: 'Chief Minister', unit: 'state' },
  pk: { title: 'Chief Minister', unit: 'province' },
}

/** Elsewhere the middle rung is a seat in the national legislature. */
const LEGISLATORS: Record<string, { title: string; house: string }> = {
  gb: { title: 'Member of Parliament', house: 'the House of Commons' },
  fr: { title: 'Member of the National Assembly', house: 'the National Assembly' },
  it: { title: 'Member of the Chamber of Deputies', house: 'the Chamber of Deputies' },
  es: { title: 'Member of the Congress of Deputies', house: 'the Congress of Deputies' },
  nl: { title: 'Member of the House of Representatives', house: 'the House of Representatives' },
  be: { title: 'Member of the Chamber of Representatives', house: 'the Chamber of Representatives' },
  se: { title: 'Member of the Riksdag', house: 'the Riksdag' },
  no: { title: 'Member of the Storting', house: 'the Storting' },
  dk: { title: 'Member of the Folketing', house: 'the Folketing' },
  fi: { title: 'Member of the Eduskunta', house: 'the Eduskunta' },
  ie: { title: 'Member of the Dáil', house: 'Dáil Éireann' },
  il: { title: 'Member of the Knesset', house: 'the Knesset' },
  pl: { title: 'Member of the Sejm', house: 'the Sejm' },
  pt: { title: 'Member of the Assembly of the Republic', house: 'the Assembly of the Republic' },
  gr: { title: 'Member of the Hellenic Parliament', house: 'the Hellenic Parliament' },
  ch: { title: 'National Councillor', house: 'the National Council' },
  kr: { title: 'Member of the National Assembly', house: 'the National Assembly' },
  ph: { title: 'Representative', house: 'the House of Representatives' },
  tw: { title: 'Legislator', house: 'the Legislative Yuan' },
  tr: { title: 'Member of the Grand National Assembly', house: 'the Grand National Assembly' },
  ua: { title: 'Member of the Verkhovna Rada', house: 'the Verkhovna Rada' },
  eg: { title: 'Member of the House of Representatives', house: 'the House of Representatives' },
  za: { title: 'Member of Parliament', house: 'the National Assembly' },
  hu: { title: 'Member of the National Assembly', house: 'the National Assembly' },
  cz: { title: 'Member of the Chamber of Deputies', house: 'the Chamber of Deputies' },
  ro: { title: 'Member of the Chamber of Deputies', house: 'the Chamber of Deputies' },
}

function regional(g: GameState): { title: string; unit: string } | null {
  return REGIONAL_HEADS[g.character.countryId] ?? null
}

function legislator(g: GameState): { title: string; house: string } {
  return LEGISLATORS[g.character.countryId] ?? { title: 'Member of Parliament', house: 'Parliament' }
}

/** The first rung: an elected school board in the US, the city council elsewhere. */
function localTitle(g: GameState): string {
  return g.character.countryId === 'us' ? 'School Board Director' : 'City Councillor'
}

function leaderMinAge(g: GameState): number {
  return ['us', 'mx', 'br', 'ph'].includes(g.character.countryId) ? 35 : 25
}

function officeTitle(g: GameState, id: OfficeId): string {
  if (id === 'school') return localTitle(g)
  if (id === 'mayor') return 'Mayor'
  if (id === 'governor') return regional(g)?.title ?? legislator(g).title
  return leaderTitle(g)
}

function minAgeFor(g: GameState, o: OfficeDef): number {
  return o.id === 'leader' ? leaderMinAge(g) : o.minAge
}

const US_STATES: Record<string, string> = {
  'New York': 'New York',
  'Los Angeles': 'California',
  'San Diego': 'California',
  Chicago: 'Illinois',
  Houston: 'Texas',
  'San Antonio': 'Texas',
  Dallas: 'Texas',
  Austin: 'Texas',
  Phoenix: 'Arizona',
  Philadelphia: 'Pennsylvania',
  Seattle: 'Washington',
  Denver: 'Colorado',
  Boston: 'Massachusetts',
  Miami: 'Florida',
  Atlanta: 'Georgia',
  Nashville: 'Tennessee',
  Portland: 'Oregon',
  'Las Vegas': 'Nevada',
  Detroit: 'Michigan',
  Minneapolis: 'Minnesota',
}

const REGIONS: Record<string, Record<string, string>> = {
  gb: { London: 'Greater London', Manchester: 'Greater Manchester', Birmingham: 'the West Midlands', Liverpool: 'Merseyside', Leeds: 'West Yorkshire', Glasgow: 'Scotland', Edinburgh: 'Scotland', Bristol: 'the West of England', Cardiff: 'Wales', Belfast: 'Northern Ireland', Newcastle: 'Tyne and Wear', Brighton: 'East Sussex' },
  fr: { Paris: 'Île-de-France', Marseille: "Provence-Alpes-Côte d'Azur", Nice: "Provence-Alpes-Côte d'Azur", Lyon: 'Auvergne-Rhône-Alpes', Toulouse: 'Occitanie', Montpellier: 'Occitanie', Nantes: 'Pays de la Loire', Strasbourg: 'Grand Est', Bordeaux: 'Nouvelle-Aquitaine', Lille: 'Hauts-de-France' },
  jp: { Tokyo: 'Tokyo', Osaka: 'Osaka Prefecture', Yokohama: 'Kanagawa Prefecture', Nagoya: 'Aichi Prefecture', Sapporo: 'Hokkaido', Kobe: 'Hyogo Prefecture', Kyoto: 'Kyoto Prefecture', Fukuoka: 'Fukuoka Prefecture', Hiroshima: 'Hiroshima Prefecture', Sendai: 'Miyagi Prefecture', Kawasaki: 'Kanagawa Prefecture', Nara: 'Nara Prefecture', Naha: 'Okinawa Prefecture', Kanazawa: 'Ishikawa Prefecture' },
  mx: { 'Mexico City': 'Mexico City', Guadalajara: 'Jalisco', Monterrey: 'Nuevo León', Puebla: 'Puebla', Tijuana: 'Baja California', 'Cancún': 'Quintana Roo', 'Mérida': 'Yucatán', 'León': 'Guanajuato', Oaxaca: 'Oaxaca', 'Juárez': 'Chihuahua', 'Mazatlán': 'Sinaloa', 'Puerto Vallarta': 'Jalisco', 'Cabo San Lucas': 'Baja California Sur', Nogales: 'Sonora', Acapulco: 'Guerrero' },
  br: { 'São Paulo': 'São Paulo', 'Rio de Janeiro': 'Rio de Janeiro', 'Brasília': 'the Federal District', Salvador: 'Bahia', Fortaleza: 'Ceará', 'Belo Horizonte': 'Minas Gerais', Manaus: 'Amazonas', Curitiba: 'Paraná', Recife: 'Pernambuco', 'Porto Alegre': 'Rio Grande do Sul', 'Goiânia': 'Goiás', Santos: 'São Paulo', 'Florianópolis': 'Santa Catarina', Natal: 'Rio Grande do Norte' },
  ar: { 'Buenos Aires': 'Buenos Aires', 'Córdoba': 'Córdoba', Rosario: 'Santa Fe', Mendoza: 'Mendoza', 'La Plata': 'Buenos Aires Province', 'Mar del Plata': 'Buenos Aires Province', 'San Miguel de Tucumán': 'Tucumán', Salta: 'Salta', 'Santa Fe': 'Santa Fe', Bariloche: 'Río Negro', Ushuaia: 'Tierra del Fuego', 'Neuquén': 'Neuquén' },
  ng: { Lagos: 'Lagos State', Abuja: 'the Federal Capital Territory', Kano: 'Kano State', Ibadan: 'Oyo State', 'Port Harcourt': 'Rivers State', 'Benin City': 'Edo State', Kaduna: 'Kaduna State', Enugu: 'Enugu State', Jos: 'Plateau State', Abeokuta: 'Ogun State', Onitsha: 'Anambra State', Calabar: 'Cross River State', Owerri: 'Imo State', Maiduguri: 'Borno State' },
  id: { Jakarta: 'Jakarta', Denpasar: 'Bali', Surabaya: 'East Java', Bandung: 'West Java', Medan: 'North Sumatra', Semarang: 'Central Java', Makassar: 'South Sulawesi', Palembang: 'South Sumatra', Yogyakarta: 'Yogyakarta', Malang: 'East Java', Batam: 'the Riau Islands', Manado: 'North Sulawesi', Balikpapan: 'East Kalimantan' },
  co: { 'Bogotá': 'Cundinamarca', 'Medellín': 'Antioquia', Cali: 'Valle del Cauca', Barranquilla: 'Atlántico', Cartagena: 'Bolívar', Bucaramanga: 'Santander', 'Santa Marta': 'Magdalena', Pereira: 'Risaralda', Manizales: 'Caldas', 'Cúcuta': 'Norte de Santander', 'Ibagué': 'Tolima', Pasto: 'Nariño' },
  ve: { Caracas: 'Miranda', Maracaibo: 'Zulia', Valencia: 'Carabobo', Barquisimeto: 'Lara', Maracay: 'Aragua', 'Ciudad Guayana': 'Bolívar', Barcelona: 'Anzoátegui', 'Maturín': 'Monagas', 'Mérida': 'Mérida', 'San Cristóbal': 'Táchira', 'Puerto La Cruz': 'Anzoátegui', 'Cumaná': 'Sucre' },
  pe: { Lima: 'Lima', Cusco: 'Cusco', 'Machu Picchu': 'Cusco', Arequipa: 'Arequipa', Trujillo: 'La Libertad', Chiclayo: 'Lambayeque', Piura: 'Piura', Iquitos: 'Loreto', Huancayo: 'Junín', Puno: 'Puno', Callao: 'Callao', Tacna: 'Tacna' },
  bo: { 'La Paz': 'La Paz', Sucre: 'Chuquisaca', 'Santa Cruz de la Sierra': 'Santa Cruz', Cochabamba: 'Cochabamba', 'El Alto': 'La Paz', Oruro: 'Oruro', 'Potosí': 'Potosí', Tarija: 'Tarija', Trinidad: 'Beni', Uyuni: 'Potosí' },
  py: { 'Asunción': 'Central', 'Ciudad del Este': 'Alto Paraná', 'San Ignacio': 'Misiones', 'San Pedro': 'San Pedro', 'Encarnación': 'Itapúa', Luque: 'Central', 'San Lorenzo': 'Central', 'Capiatá': 'Central', 'Lambaré': 'Central', 'Fernando de la Mora': 'Central', 'Pedro Juan Caballero': 'Amambay', 'Concepción': 'Concepción' },
  cl: { Santiago: 'the Santiago Metropolitan Region', Valdivia: 'Los Ríos', 'Valparaíso': 'Valparaíso', 'Viña del Mar': 'Valparaíso', 'Concepción': 'Biobío', Antofagasta: 'Antofagasta', 'La Serena': 'Coquimbo', Temuco: 'La Araucanía', 'Puerto Montt': 'Los Lagos', 'Punta Arenas': 'Magallanes', Iquique: 'Tarapacá', Arica: 'Arica y Parinacota' },
  ke: { Nairobi: 'Nairobi County', Mombasa: 'Mombasa County', Kisumu: 'Kisumu County', Nakuru: 'Nakuru County', Eldoret: 'Uasin Gishu County', Thika: 'Kiambu County', Malindi: 'Kilifi County', Kitale: 'Trans-Nzoia County', Garissa: 'Garissa County', Nyeri: 'Nyeri County', Machakos: 'Machakos County', Lamu: 'Lamu County', Naivasha: 'Nakuru County' },
  ru: { Moscow: 'Moscow Oblast', 'St. Petersburg': 'St. Petersburg', Novosibirsk: 'Novosibirsk Oblast', Yekaterinburg: 'Sverdlovsk Oblast', Kazan: 'Tatarstan', 'Nizhny Novgorod': 'Nizhny Novgorod Oblast', Chelyabinsk: 'Chelyabinsk Oblast', Samara: 'Samara Oblast', Omsk: 'Omsk Oblast', 'Rostov-on-Don': 'Rostov Oblast', Ufa: 'Bashkortostan', Krasnoyarsk: 'Krasnoyarsk Krai', Vladivostok: 'Primorsky Krai', Sochi: 'Krasnodar Krai', Murmansk: 'Murmansk Oblast' },
  ca: { Toronto: 'Ontario', Montreal: 'Quebec', Vancouver: 'British Columbia', Calgary: 'Alberta', Edmonton: 'Alberta', Ottawa: 'Ontario', Winnipeg: 'Manitoba', 'Quebec City': 'Quebec', Halifax: 'Nova Scotia', Regina: 'Saskatchewan', Saskatoon: 'Saskatchewan', Victoria: 'British Columbia', Hamilton: 'Ontario', Kelowna: 'British Columbia' },
  au: { Sydney: 'New South Wales', Melbourne: 'Victoria', Brisbane: 'Queensland', Perth: 'Western Australia', Adelaide: 'South Australia', 'Gold Coast': 'Queensland', Canberra: 'the Australian Capital Territory', Newcastle: 'New South Wales', Hobart: 'Tasmania', Townsville: 'Queensland', Wollongong: 'New South Wales', Darwin: 'the Northern Territory', Cairns: 'Queensland', Geelong: 'Victoria' },
  de: { Berlin: 'Berlin', Hamburg: 'Hamburg', Munich: 'Bavaria', Cologne: 'North Rhine-Westphalia', Frankfurt: 'Hesse', Stuttgart: 'Baden-Württemberg', 'Düsseldorf': 'North Rhine-Westphalia', Dortmund: 'North Rhine-Westphalia', Leipzig: 'Saxony', Bremen: 'Bremen', Dresden: 'Saxony', Hanover: 'Lower Saxony', Nuremberg: 'Bavaria' },
  at: { Vienna: 'Vienna', Salzburg: 'Salzburg', Graz: 'Styria', Linz: 'Upper Austria', Innsbruck: 'Tyrol', Klagenfurt: 'Carinthia', Villach: 'Carinthia', Wels: 'Upper Austria', 'St. Pölten': 'Lower Austria', Dornbirn: 'Vorarlberg', Bregenz: 'Vorarlberg', Hallstatt: 'Upper Austria' },
  pk: { Karachi: 'Sindh', Lahore: 'Punjab', Islamabad: 'Punjab', Peshawar: 'Khyber Pakhtunkhwa', Abbottabad: 'Khyber Pakhtunkhwa', Rawalpindi: 'Punjab', Faisalabad: 'Punjab', Multan: 'Punjab', Hyderabad: 'Sindh', Quetta: 'Balochistan', Gujranwala: 'Punjab', Sialkot: 'Punjab', Sukkur: 'Sindh' },
  in: { Mumbai: 'Maharashtra', Pune: 'Maharashtra', Delhi: 'Delhi', Bangalore: 'Karnataka', Hyderabad: 'Telangana', Chennai: 'Tamil Nadu', Kolkata: 'West Bengal', Jaipur: 'Rajasthan', Ahmedabad: 'Gujarat', Lucknow: 'Uttar Pradesh', Srinagar: 'Jammu and Kashmir', Surat: 'Gujarat', Kochi: 'Kerala', Varanasi: 'Uttar Pradesh', Chandigarh: 'Punjab' },
}

function regionName(g: GameState): string {
  const c = g.character
  if (c.countryId === 'us') return US_STATES[c.city] ?? 'the State'
  return REGIONS[c.countryId]?.[c.city] ?? `the ${c.city} ${regional(g)?.unit ?? 'region'}`
}

function jurisdiction(g: GameState, id: OfficeId): string {
  const c = g.character
  if (id === 'school') return c.countryId === 'us' ? `${c.city} School District` : `${c.city} City Council`
  if (id === 'mayor') return `City of ${c.city}`
  if (id === 'governor') {
    if (!regional(g)) return uc(legislator(g).house)
    return `${c.countryId === 'us' ? 'State of ' : ''}${regionName(g).replace(/^the /, '')}`
  }
  return getCountry(c.countryId).name
}

/** "Mayor of Chicago", "Governor of Texas", "Premier of Ontario", "Member of Parliament for Leeds". */
function styled(g: GameState, id: OfficeId): string {
  const c = g.character
  if (id === 'school') return c.countryId === 'us' ? `School Board Director for ${c.city}` : `City Councillor in ${c.city}`
  if (id === 'mayor') return `Mayor of ${c.city}`
  if (id === 'governor') return regional(g) ? `${regional(g)!.title} of ${regionName(g)}` : `${legislator(g).title} for ${c.city}`
  return `${leaderTitle(g)} of ${countryLabel(getCountry(c.countryId))}`
}

function uc(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function salaryFor(g: GameState, o: OfficeDef): number {
  const w = getCountry(g.character.countryId).wealth || 1
  return Math.round((o.salary * Math.max(0.3, w)) / 100) * 100
}

// ---------------------------------------------------------------------------
// Parties, issues, bills

interface Party {
  id: string
  name: string
  emoji: string
  /** Bonus to the starting poll. */
  edge: number
  /** Share of the campaign that donors chip in. */
  donors: number
}

const PARTIES: Party[] = [
  { id: 'progressive', name: 'Progressive Party', emoji: '\u{1F54A}\u{FE0F}', edge: 2, donors: 1 },
  { id: 'conservative', name: 'Conservative Party', emoji: '\u{1F985}', edge: 2, donors: 1.1 },
  { id: 'centrist', name: 'Centrist Alliance', emoji: '\u{2696}\u{FE0F}', edge: 1, donors: 0.9 },
  { id: 'green', name: 'Green Party', emoji: '\u{1F33F}', edge: -3, donors: 0.5 },
  { id: 'libertarian', name: 'Liberty Party', emoji: '\u{1F5FD}', edge: -3, donors: 0.6 },
  { id: 'independent', name: 'Independent', emoji: '\u{1F9ED}', edge: -5, donors: 0.25 },
]

function partyOf(id: string): Party {
  return PARTIES.find((p) => p.id === id) ?? PARTIES[PARTIES.length - 1]
}

const ISSUES: { id: string; label: string; emoji: string }[] = [
  { id: 'economy', label: 'The Economy', emoji: '\u{1F4C8}' },
  { id: 'education', label: 'Education', emoji: '\u{1F393}' },
  { id: 'healthcare', label: 'Healthcare', emoji: '\u{1FA7A}' },
  { id: 'crime', label: 'Crime', emoji: '\u{1F6A8}' },
  { id: 'environment', label: 'The Environment', emoji: '\u{1F30E}' },
  { id: 'taxes', label: 'Taxes', emoji: '\u{1F4B8}' },
  { id: 'jobs', label: 'Jobs', emoji: '\u{1F477}' },
  { id: 'housing', label: 'Housing', emoji: '\u{1F3E0}' },
  { id: 'infrastructure', label: 'Roads & Bridges', emoji: '\u{1F6A7}' },
  { id: 'immigration', label: 'Immigration', emoji: '\u{1F6C2}' },
  { id: 'civil', label: 'Civil Rights', emoji: '\u{270A}' },
  { id: 'transit', label: 'Public Transit', emoji: '\u{1F687}' },
]

function issueOf(id: string) {
  return ISSUES.find((i) => i.id === id) ?? ISSUES[0]
}

interface BillDef {
  name: string
  emoji: string
  issue: string
  /** Special side effect when passed. */
  effect?: 'payRaise' | 'holiday' | 'space'
}

const BILLS: Record<OfficeId, BillDef[]> = {
  school: [
    { name: 'Push school start times back an hour', emoji: '\u{23F0}', issue: 'education' },
    { name: 'Ban phones in classrooms', emoji: '\u{1F4F5}', issue: 'education' },
    { name: 'Healthier cafeteria lunches', emoji: '\u{1F966}', issue: 'healthcare' },
    { name: 'A four-day school week', emoji: '\u{1F4C5}', issue: 'education' },
    { name: 'Mandatory school uniforms', emoji: '\u{1F454}', issue: 'education' },
    { name: 'More funding for art and music', emoji: '\u{1F3A8}', issue: 'education' },
    { name: 'Replace the football field with solar panels', emoji: '\u{2600}\u{FE0F}', issue: 'environment' },
    { name: 'Raise teacher salaries', emoji: '\u{1F34E}', issue: 'jobs' },
    { name: 'Remove cursive from the curriculum', emoji: '\u{270D}\u{FE0F}', issue: 'education' },
    { name: 'Raise the board members’ stipend', emoji: '\u{1F4B0}', issue: 'taxes', effect: 'payRaise' },
  ],
  mayor: [
    { name: 'Build protected bike lanes downtown', emoji: '\u{1F6B2}', issue: 'transit' },
    { name: 'An emergency pothole repair fund', emoji: '\u{1F6A7}', issue: 'infrastructure' },
    { name: 'A citywide teen curfew', emoji: '\u{1F319}', issue: 'crime' },
    { name: 'Double downtown parking fees', emoji: '\u{1F17F}\u{FE0F}', issue: 'taxes' },
    { name: 'Publicly fund a new sports stadium', emoji: '\u{1F3DF}\u{FE0F}', issue: 'economy' },
    { name: 'Rent control for apartments', emoji: '\u{1F3E2}', issue: 'housing' },
    { name: 'Open three new dog parks', emoji: '\u{1F415}', issue: 'environment' },
    { name: 'Hire more police officers', emoji: '\u{1F46E}', issue: 'crime' },
    { name: 'Free public Wi-Fi in every park', emoji: '\u{1F4F6}', issue: 'infrastructure' },
    { name: 'Ban leaf blowers before 9 AM', emoji: '\u{1F343}', issue: 'environment' },
    { name: 'Give the mayor a raise', emoji: '\u{1F4B0}', issue: 'taxes', effect: 'payRaise' },
  ],
  governor: [
    { name: 'Raise the minimum wage', emoji: '\u{1F4B5}', issue: 'jobs' },
    { name: 'Legalize sports betting', emoji: '\u{1F3B2}', issue: 'economy' },
    { name: 'Raise the gas tax to fix highways', emoji: '\u{26FD}', issue: 'infrastructure' },
    { name: 'Free community college', emoji: '\u{1F393}', issue: 'education' },
    { name: 'Tougher sentencing for repeat offenders', emoji: '\u{2696}\u{FE0F}', issue: 'crime' },
    { name: 'Ban single-use plastic bags', emoji: '\u{1F6CD}\u{FE0F}', issue: 'environment' },
    { name: 'Build high-speed rail between cities', emoji: '\u{1F684}', issue: 'transit' },
    { name: 'Cut the state income tax', emoji: '\u{2702}\u{FE0F}', issue: 'taxes' },
    { name: 'Expand public hospitals', emoji: '\u{1F3E5}', issue: 'healthcare' },
    { name: 'Name an official state snack', emoji: '\u{1F968}', issue: 'economy' },
    { name: 'A pay raise for state officials', emoji: '\u{1F4B0}', issue: 'taxes', effect: 'payRaise' },
  ],
  leader: [
    { name: 'Universal healthcare', emoji: '\u{1FA7A}', issue: 'healthcare' },
    { name: 'A sweeping tax cut', emoji: '\u{2702}\u{FE0F}', issue: 'taxes' },
    { name: 'Increase the defense budget', emoji: '\u{1FA96}', issue: 'economy' },
    { name: 'Abolish daylight saving time', emoji: '\u{1F570}\u{FE0F}', issue: 'economy' },
    { name: 'Student loan forgiveness', emoji: '\u{1F393}', issue: 'education' },
    { name: 'A trillion-dollar infrastructure plan', emoji: '\u{1F309}', issue: 'infrastructure' },
    { name: 'Overhaul the immigration system', emoji: '\u{1F6C2}', issue: 'immigration' },
    { name: 'A national carbon tax', emoji: '\u{1F3ED}', issue: 'environment' },
    { name: 'Expand voting rights', emoji: '\u{1F5F3}\u{FE0F}', issue: 'civil' },
    { name: 'Fund a crewed mission to Mars', emoji: '\u{1F680}', issue: 'jobs', effect: 'space' },
    { name: 'Create a new national holiday', emoji: '\u{1F389}', issue: 'jobs', effect: 'holiday' },
    { name: 'Raise the salary of the head of government', emoji: '\u{1F4B0}', issue: 'taxes', effect: 'payRaise' },
  ],
}

/** City council business outside the US (councils don't run the schools everywhere). */
const COUNCIL_BILLS: BillDef[] = [
  { name: 'More street lights on dark side streets', emoji: '\u{1F4A1}', issue: 'crime' },
  { name: 'A weekend farmers\' market in the city center', emoji: '\u{1F955}', issue: 'economy' },
  { name: 'Plant a thousand new trees', emoji: '\u{1F333}', issue: 'environment' },
  { name: 'More public toilets downtown', emoji: '\u{1F6BB}', issue: 'infrastructure' },
  { name: 'Free swimming lessons for kids', emoji: '\u{1F3CA}', issue: 'education' },
  { name: 'Rename a street after a local hero', emoji: '\u{1FAA7}', issue: 'civil' },
  { name: 'A noise curfew after midnight', emoji: '\u{1F507}', issue: 'crime' },
  { name: 'Fix the potholes on the main road', emoji: '\u{1F6A7}', issue: 'infrastructure' },
  { name: 'More buses on the night routes', emoji: '\u{1F68C}', issue: 'transit' },
  { name: 'Raise the councillors\' allowance', emoji: '\u{1F4B0}', issue: 'taxes', effect: 'payRaise' },
]

/** Bill wording for the country: no "state" taxes abroad, no student loans where university is free. */
function localBillName(g: GameState, office: OfficeId, name: string): string {
  const c = g.character
  if (c.countryId === 'us') return name
  const country = getCountry(c.countryId)
  const scope = office === 'governor' && regional(g) ? 'regional' : 'national'
  const swaps: Record<string, string> = {
    'Cut the state income tax': `Cut the ${scope} income tax`,
    'Name an official state snack': `Name an official ${scope} snack`,
    'A pay raise for state officials': office === 'governor' && !regional(g) ? 'A pay raise for lawmakers' : `A pay raise for ${scope} officials`,
    'Free community college': country.freeUniversity ? 'Free school lunches for every child' : 'Free vocational college',
    'Student loan forgiveness': country.freeUniversity ? 'Free school lunches nationwide' : 'Student loan forgiveness',
    'Universal healthcare': country.universalHealthcare ? 'Cut hospital waiting lists in half' : 'Universal healthcare',
    'A trillion-dollar infrastructure plan': 'A massive infrastructure plan',
    'Legalize sports betting': country.religions.filter((r) => r === 'Islam').length * 2 > country.religions.length ? 'Build a giant new mosque downtown' : 'Legalize sports betting',
    'Replace the football field with solar panels': 'Put solar panels on the school roofs',
  }
  return swaps[name] ?? name
}

interface Bill {
  name: string
  emoji: string
  issue: string
  support: number
  effect: string
}

// ---------------------------------------------------------------------------
// State

interface PolData {
  office: OfficeId
  party: string
  approval: number
  termLeft: number
  terms: number
  /** Hot topics this year (index into ISSUES ids). */
  hot: string[]
  /** Age at which the newspaper was last read. */
  newsAge: number
  bills: Bill[]
  warChest: number
  favors: number
  scandals: number
  /** Set while a re-election / higher-office decision is pending. */
  termOver: boolean
}

interface HeldOffice {
  office: OfficeId
  title: string
  place: string
  startAge: number
  endAge: number | null
  terms?: number
}

interface PolProfile {
  held: HeldOffice[]
  wins: number
  losses: number
  party: string
  billsPassed: number
  vetoes: number
  impeached: number
  formerLeader: boolean
  formerLeaderTitle: string
  /** Market-moving announcements, insider trades and the cases they left behind (absent in old saves). */
  abuse?: AbuseData
}

const initPol = (): PolProfile => ({ held: [], wins: 0, losses: 0, party: '', billsPassed: 0, vetoes: 0, impeached: 0, formerLeader: false, formerLeaderTitle: '' })

function polProfile(g: GameState): PolProfile {
  return prof(g, 'politics', initPol)
}

function viewPol(g: GameState): PolProfile {
  return peek<PolProfile>(g, 'politics') ?? initPol()
}

export function politicianJob(g: GameState): Job | null {
  return myJob(g, 'politician')
}

function pdata(job: Job): PolData {
  return view<PolData>(job.data)
}

function heldBefore(g: GameState, id: OfficeId): boolean {
  return viewPol(g).held.some((h) => h.office === id)
}

function termsServed(g: GameState, id: OfficeId): number {
  const job = politicianJob(g)
  const current = job && pdata(job).office === id ? pdata(job).terms : 0
  const past = viewPol(g)
    .held.filter((h) => h.office === id && h.endAge !== null)
    .reduce((sum, h) => sum + Math.max(1, h.terms ?? 1), 0)
  return past + current
}

function closeHeld(g: GameState): void {
  const p = polProfile(g)
  const job = politicianJob(g)
  for (const h of p.held) {
    if (h.endAge !== null) continue
    h.endAge = g.character.age
    if (job && pdata(job).office === h.office) h.terms = Math.max(1, pdata(job).terms)
  }
}

function setApproval(job: Job, value: number): void {
  const d = pdata(job)
  d.approval = clamp100(value)
  job.performance = d.approval
}

function addApproval(job: Job, delta: number): void {
  setApproval(job, pdata(job).approval + delta)
}

// ---------------------------------------------------------------------------
// Eligibility

function prereqText(g: GameState, o: OfficeDef): string {
  if (o.id === 'school') return g.character.countryId === 'us' ? 'High school diploma' : 'School-leaving certificate'
  if (o.id === 'mayor') return `University degree or ${g.character.countryId === 'us' ? 'school board' : 'city council'} experience`
  if (o.id === 'governor') return 'Must have served as Mayor'
  return `Must have served as ${officeTitle(g, 'governor')}`
}

/** Why you can't run for this office (null = eligible). */
function runReason(g: GameState, o: OfficeDef, fromOffice = false): string | null {
  const c = g.character
  const b = blocked(g, 0)
  if (b) return b
  if (!fromOffice && politicianJob(g)) return 'You can only run for another office when your current term ends.'
  const min = minAgeFor(g, o)
  if (c.age < min) return `You must be at least ${min} years old to run for ${officeTitle(g, o.id)}.`
  if (c.criminalRecord.some((r) => r.convicted && (r.sentenceYears ?? 0) >= 2)) return 'Voters will not elect someone with a felony conviction on their record.'
  const board = c.countryId === 'us' ? 'the school board' : 'the city council'
  if (o.id === 'school' && !hasHighSchool(g)) return c.countryId === 'us' ? 'You need at least a high school diploma to run for the school board.' : `You need to have finished school to run for ${board}.`
  if (o.id === 'mayor' && !hasCollegeDegree(g) && !heldBefore(g, 'school')) return `You need a university degree or experience on ${board} to run for Mayor.`
  if (o.id === 'governor' && !heldBefore(g, 'mayor') && !(fromOffice && politicianJob(g) && pdata(politicianJob(g)!).office === 'mayor')) return `You need to serve as Mayor before running for ${officeTitle(g, 'governor')}.`
  if (o.id === 'leader' && !heldBefore(g, 'governor') && !(fromOffice && politicianJob(g) && pdata(politicianJob(g)!).office === 'governor')) {
    return `You need to serve as ${officeTitle(g, 'governor')} before running for ${leaderTitle(g)}.`
  }
  if (o.termLimit > 0 && termsServed(g, o.id) >= o.termLimit) return `You've already served the maximum ${o.termLimit} terms as ${officeTitle(g, o.id)}.`
  if (c.age > 85) return 'Your party chairman gently suggested you enjoy retirement instead.'
  return null
}

// ---------------------------------------------------------------------------
// Campaigns

interface Campaign {
  office: OfficeId
  party: string
  issue: string
  budget: number
  poll: number
  round: number
  opponent: string
  oppParty: string
  /** Running from an office whose term just ended. */
  incumbentRun: boolean
}

const PARTY_SCRIPT = 'special.pol.party'
const PLATFORM_SCRIPT = 'special.pol.platform'
const BUDGET_SCRIPT = 'special.pol.budget'
const TRAIL_SCRIPT = 'special.pol.trail'

function opponentName(g: GameState): string {
  const c = g.character
  const gender = chance(g, 0.5) ? 'male' : 'female'
  return `${randomFirstName(g, c.countryId, gender)} ${randomLastName(g, c.countryId)}`
}

function startCampaign(g: GameState, office: OfficeId, incumbentRun: boolean): void {
  const o = officeOf(office)
  const prevParty = viewPol(g).party
  const text = `You're running to become ${styled(g, office)}. Which party will you run with?`
  scriptChoice(
    g,
    PARTY_SCRIPT,
    'Pick a Party',
    text,
    PARTIES.map((p) => ({ id: p.id, label: p.id === prevParty ? `${p.name} (your party)` : p.name, emoji: p.emoji })),
    { emoji: o.emoji, data: { office, incumbentRun } },
  )
}

defineScript(PARTY_SCRIPT, (g, choice, data) => {
  const d = (data ?? {}) as { office?: string; incumbentRun?: boolean }
  const office = officeOf(str(d.office as Json, 'school')).id
  const party = partyOf(choice)
  const issues = shuffle(g, ISSUES).slice(0, 5)
  scriptChoice(
    g,
    PLATFORM_SCRIPT,
    'Your Platform',
    `As the ${party.name} candidate, what will be the centerpiece of your campaign?`,
    issues.map((i) => ({ id: i.id, label: i.label, emoji: i.emoji })),
    { emoji: party.emoji, data: { office, party: party.id, incumbentRun: !!d.incumbentRun } },
  )
})

defineScript(PLATFORM_SCRIPT, (g, choice, data) => {
  const d = (data ?? {}) as { office?: string; party?: string; incumbentRun?: boolean }
  const o = officeOf(str(d.office as Json, 'school'))
  const issue = issueOf(choice)
  const choices = o.budgets.map((b, i) => ({
    id: String(i),
    label: b === 0 ? 'Grassroots (no money)' : `${money(b)} of my own money`,
    emoji: b === 0 ? '\u{1F33E}' : '\u{1F4B0}',
  }))
  scriptChoice(
    g,
    BUDGET_SCRIPT,
    'Campaign Budget',
    `Your platform is ${issue.label.toLowerCase()}. How much of your own money will you pour into the campaign? You have ${money(g.character.money)}.`,
    choices,
    { emoji: '\u{1F4B0}', data: { office: o.id, party: str(d.party as Json, 'independent'), issue: issue.id, incumbentRun: !!d.incumbentRun } },
  )
})

defineScript(BUDGET_SCRIPT, (g, choice, data) => {
  const d = (data ?? {}) as { office?: string; party?: string; issue?: string; incumbentRun?: boolean }
  const o = officeOf(str(d.office as Json, 'school'))
  const party = partyOf(str(d.party as Json, 'independent'))
  let tier = Math.max(0, Math.min(o.budgets.length - 1, Number(choice) || 0))
  let note = ''
  // Can't spend what you don't have: fall back to the biggest tier you can afford.
  while (tier > 0 && g.character.money < o.budgets[tier]) tier--
  if (String(tier) !== choice && Number(choice) > 0) note = ` You couldn't afford that much, so you scaled back to ${tier === 0 ? 'a grassroots campaign' : money(o.budgets[tier])}.`
  const own = o.budgets[tier]
  spend(g, own)
  const fame = fameOf(g)
  const donations = Math.round((o.budgets[1] * party.donors * (0.3 + rand(g) * 0.7) * (1 + fame / 50)) / 100) * 100
  const job = politicianJob(g)
  const chest = job ? pdata(job).warChest : 0
  if (job) pdata(job).warChest = 0
  const total = own + donations + chest
  const c = g.character
  const experience = viewPol(g).held.length * 3
  const budgetBoost = Math.min(14, (total / Math.max(1, o.budgets[2])) * 8)
  const poll =
    44 +
    party.edge +
    (c.stats.smarts - 50) * 0.1 +
    (c.stats.looks - 50) * 0.08 +
    Math.min(12, fame * 0.15) +
    budgetBoost +
    experience -
    convictions(g) * 5 -
    (o.opponent - 50) * 0.6 +
    randInt(g, -6, 6)
  const opp = opponentName(g)
  const oppParty = pick(
    g,
    PARTIES.filter((p) => p.id !== party.id && p.id !== 'independent'),
  )
  const camp: Campaign = {
    office: o.id,
    party: party.id,
    issue: str(d.issue as Json, 'economy'),
    budget: total,
    poll: Math.round(Math.max(12, Math.min(80, poll))),
    round: 1,
    opponent: opp,
    oppParty: oppParty.id,
    incumbentRun: !!d.incumbentRun,
  }
  polProfile(g).party = party.id
  count(g, 'campaigns')
  log(g, `I launched my campaign for ${officeTitle(g, o.id)} as the ${party.name} candidate.`, 'event')
  const intro = `You raised ${money(donations)} from donors${own > 0 ? ` and put in ${money(own)} of your own` : ''}${chest > 0 ? `, plus ${money(chest)} from your war chest` : ''}.${note} Your opponent is ${opp} of the ${oppParty.name}.`
  trailChoice(g, camp, intro)
})

const TRAIL: { id: string; label: string; emoji: string }[] = [
  { id: 'debate', label: 'Debate your opponent', emoji: '\u{1F399}\u{FE0F}' },
  { id: 'rally', label: 'Hold a rally', emoji: '\u{1F4E3}' },
  { id: 'babies', label: 'Kiss babies', emoji: '\u{1F476}' },
  { id: 'attack', label: 'Run attack ads', emoji: '\u{1F5E1}\u{FE0F}' },
  { id: 'doors', label: 'Go door-to-door', emoji: '\u{1F6AA}' },
  { id: 'tv', label: 'Do a TV interview', emoji: '\u{1F4FA}' },
  { id: 'social', label: 'Campaign on social media', emoji: '\u{1F4F1}' },
  { id: 'fair', label: 'Eat a corn dog at the fair', emoji: '\u{1F32D}' },
  { id: 'townhall', label: 'Hold a town hall', emoji: '\u{1F3DB}\u{FE0F}' },
  { id: 'endorse', label: 'Seek a celebrity endorsement', emoji: '\u{2B50}' },
  { id: 'diner', label: 'Shake hands at a diner', emoji: '\u{1F95E}' },
]

/** US campaign stops stay American (corn dogs, diners); elsewhere it's the market and the café. */
function trailLabel(g: GameState, id: string, label: string): string {
  if (g.character.countryId === 'us') return label
  if (id === 'fair') return 'Eat street food at the market'
  if (id === 'diner') return 'Shake hands at a local café'
  return label
}

function pollLine(c: Campaign): string {
  return `Polls: You ${c.poll}% · ${c.opponent} ${100 - c.poll}%`
}

function trailChoice(g: GameState, camp: Campaign, prefix: string): void {
  const opts = shuffle(g, TRAIL).slice(0, 4)
  scriptChoice(
    g,
    TRAIL_SCRIPT,
    `Campaign Trail (${camp.round}/3)`,
    `${prefix}\n\n${pollLine(camp)}\n\nWhat's your next campaign stop?`,
    opts.map((x) => ({ id: x.id, label: trailLabel(g, x.id, x.label), emoji: x.emoji })),
    { emoji: '\u{1F5F3}\u{FE0F}', data: camp as unknown as Json },
  )
}

function trailOutcome(g: GameState, camp: Campaign, action: string): { delta: number; text: string } {
  const c = g.character
  const opp = camp.opponent
  switch (action) {
    case 'debate': {
      const d = Math.round((c.stats.smarts - 50) / 6 + randInt(g, -6, 6))
      return {
        delta: d,
        text:
          d >= 3
            ? pick(g, [`You dismantled ${opp} on live TV. Fact-checkers had nothing to say.`, `You delivered a zinger so good it became a campaign T-shirt by morning.`, `${opp} froze when you asked a simple follow-up question.`])
            : d <= -3
              ? pick(g, [`You confused two countries during the debate. ${opp} pounced.`, 'Your microphone was on while you muttered something rude about the moderator.', `${opp} made you look completely unprepared.`])
              : pick(g, ['The debate was a snoozer. Both of you said "my plan" forty times.', 'Pundits called the debate a draw. Nobody watched the whole thing.']),
      }
    }
    case 'rally': {
      const d = randInt(g, -2, 6)
      return { delta: d, text: d >= 3 ? pick(g, ['The rally was packed. Someone crowd-surfed. It may have been you.', 'Your supporters chanted your name until the fire marshal shut it down.']) : pick(g, ['Turnout at the rally was... intimate. Eleven people and a confused pigeon.', 'It rained on your rally. Your hair did not survive.']) }
    }
    case 'babies': {
      const d = randInt(g, -3, 5)
      return { delta: d, text: d >= 1 ? pick(g, ['You kissed a baby and it giggled on camera. Polls love a giggling baby.', 'You held a baby like a pro. Parents swooned.']) : pick(g, ['The baby screamed the moment you picked it up. The photo went viral for all the wrong reasons.', 'A baby sneezed directly into your mouth. You smiled through it.']) }
    }
    case 'attack': {
      addHidden(g, 'karma', -2)
      const d = randInt(g, -6, 8)
      return { delta: d, text: d >= 2 ? pick(g, [`Your ad dug up ${opp}'s college band. Voters were horrified by the lyrics.`, `Your ads painted ${opp} as a person who reclines their seat on airplanes. It worked.`]) : pick(g, ['Your attack ads backfired. Voters thought they were mean-spirited.', `${opp} turned your attack ad into a fundraising bonanza.`]) }
    }
    case 'doors': {
      const d = randInt(g, 0, 4)
      return { delta: d, text: pick(g, ['You knocked on hundreds of doors. Most people pretended not to be home, but some listened.', 'You went door-to-door and only got chased by one dog. A good day.', 'You learned a lot about your neighbors by knocking on their doors. Some of it you wish you could forget.']) }
    }
    case 'tv': {
      const d = Math.round((c.stats.looks - 50) / 8 + randInt(g, -5, 5))
      return { delta: d, text: d >= 2 ? pick(g, ['You looked confident and camera-ready. The anchor practically endorsed you.', 'Your TV interview was charming. Your approval among grandmas skyrocketed.']) : pick(g, ['You had spinach in your teeth for the entire interview.', 'The interviewer asked about your platform and you blanked on what it was.']) }
    }
    case 'social': {
      const followers = c.social?.followers ?? 0
      const d = randInt(g, -3, 4) + (followers > 100_000 ? 3 : followers > 5_000 ? 1 : 0)
      return { delta: d, text: d >= 2 ? pick(g, ['Your campaign video went viral. Even teenagers shared it, ironically.', 'Your meme game was strong. The youth vote noticed.']) : pick(g, ['You posted an old meme and got roasted in the replies.', 'An intern tweeted from your account by mistake. "lol who even votes"']) }
    }
    case 'fair': {
      const d = randInt(g, -4, 6)
      if (c.countryId !== 'us') {
        const food = localPick(g, 'food') || 'street food'
        return { delta: d, text: d >= 1 ? pick(g, [`You ate ${food} like a true local. A photo of it ran on every front page.`, 'You haggled with every stall owner and bought one of everything. Brilliant.']) : pick(g, [`You ate ${food} with a knife and fork. Voters were disgusted.`, 'You got sauce on your shirt and then stepped in something at the livestock market.']) }
      }
      return { delta: d, text: d >= 1 ? pick(g, ['You ate a corn dog like a true local. A photo of it ran on every front page.', 'You judged the pie contest and gave everyone first place. Brilliant.']) : pick(g, ['You ate the corn dog with a knife and fork. Voters were disgusted.', 'You got mustard on your shirt and then stepped in something at the livestock barn.']) }
    }
    case 'townhall': {
      const d = Math.round((c.stats.smarts - 50) / 10 + randInt(g, -4, 5))
      return { delta: d, text: d >= 2 ? pick(g, ['You answered every question at the town hall with genuine empathy.', 'You won over a hostile crowd at your town hall.']) : pick(g, ['A retired teacher grilled you at the town hall and you had no answers.', 'The town hall turned into a twenty-minute argument about parking.']) }
    }
    case 'endorse': {
      const celeb = pick(g, CELEBS)
      const d = randInt(g, -2, 8)
      return { delta: d, text: d >= 3 ? `${celeb} endorsed you in a heartfelt video. Fans flocked to your campaign.` : d >= 0 ? `${celeb} endorsed you, but their fans were mostly too young to vote.` : `${celeb} endorsed you, then said something awful the next day. Guilt by association.` }
    }
    default: {
      const d = randInt(g, -1, 4)
      if (c.countryId !== 'us') {
        const drink = localSoftDrink(g)
        return { delta: d, text: pick(g, [`You shook hands with everyone in the café and paid for their ${drink}.`, `You charmed the regulars, then accidentally drank someone else's ${drink}.`, 'The café owner loved you. The cook asked for a selfie.']) }
      }
      return { delta: d, text: pick(g, ['You shook hands with everyone in the diner and paid for their coffee.', 'You charmed the diner regulars, then accidentally ate someone else’s pancakes.', 'The diner staff loved you. The cook asked for a selfie.']) }
    }
  }
}

defineScript(TRAIL_SCRIPT, (g, choice, data) => {
  const raw = (data ?? {}) as Partial<Campaign>
  const camp: Campaign = {
    office: officeOf(String(raw.office ?? 'school')).id,
    party: String(raw.party ?? 'independent'),
    issue: String(raw.issue ?? 'economy'),
    budget: num(raw.budget as Json),
    poll: num(raw.poll as Json, 45),
    round: num(raw.round as Json, 1),
    opponent: String(raw.opponent ?? 'your opponent'),
    oppParty: String(raw.oppParty ?? 'centrist'),
    incumbentRun: !!raw.incumbentRun,
  }
  if (!g.character.alive || g.character.prison) return
  const { delta, text } = trailOutcome(g, camp, choice)
  camp.poll = Math.round(Math.max(5, Math.min(92, camp.poll + delta)))
  if (camp.round < 3) {
    camp.round += 1
    trailChoice(g, camp, `${text} (${delta >= 0 ? '+' : ''}${delta} in the polls)`)
    return
  }
  election(g, camp, text)
})

function election(g: GameState, camp: Campaign, lastText: string): void {
  const c = g.character
  const o = officeOf(camp.office)
  const title = officeTitle(g, o.id)
  const share = Math.max(3, Math.min(97, camp.poll + randInt(g, -5, 5)))
  const finalShare = share === 50 ? (chance(g, 0.5) ? 51 : 49) : share
  const p = polProfile(g)
  const current = politicianJob(g)
  if (finalShare > 50) {
    p.wins += 1
    count(g, 'electionsWon')
    const place = jurisdiction(g, o.id)
    const salary = salaryFor(g, o)
    const fresh: PolData = {
      office: o.id,
      party: camp.party,
      approval: Math.round(48 + (finalShare - 50) / 2 + randInt(g, 0, 8)),
      termLeft: o.term,
      terms: 1,
      hot: [],
      newsAge: -1,
      bills: [],
      warChest: 0,
      favors: 0,
      scandals: 0,
      termOver: false,
    }
    let quitText = ''
    if (current) {
      closeHeld(g)
      setRole(g, current, officeTitle(g, o.id), salary, o.rank)
      current.company = place
      current.data = { ...(fresh as unknown as Record<string, Json>), startAge: c.age, roleStartAge: c.age }
      current.yearsAtCompany = 0
      current.performance = fresh.approval
      count(g, 'promotions')
    } else {
      const { quit } = hire(g, { defId: 'politician', title: officeTitle(g, o.id), company: place, salary, level: o.rank, performance: fresh.approval, data: fresh as unknown as Record<string, Json> })
      quitText = quitNote(quit)
    }
    p.held.push({ office: o.id, title, place, startAge: c.age, endAge: null })
    addFame(g, 2 + o.rank * 4)
    addStat(g, 'happiness', 15)
    log(g, `I was elected ${title} with ${finalShare}% of the vote.`, 'good')
    remember(g, `Elected ${styled(g, o.id)}.`)
    say(
      g,
      'Election Night',
      `${lastText}\n\nThe votes are in: you won with ${finalShare}% of the vote! ${pick(g, [`${camp.opponent} called to concede, sounding like they'd been crying.`, `Confetti fell. Someone popped champagne. ${camp.opponent} left through the back door.`, 'Your victory speech ran long, but nobody cared.'])} You are the new ${styled(g, o.id)}. The job pays ${money(salary)} a year.${quitText}`,
      '\u{1F389}',
      'good',
    )
    return
  }
  p.losses += 1
  count(g, 'electionsLost')
  addStat(g, 'happiness', -10)
  log(g, `I lost the election for ${title}.`, 'bad')
  const loseText = `${lastText}\n\nThe votes are in: you lost to ${camp.opponent} with ${finalShare}% of the vote. ${pick(g, ['Your concession speech was gracious. Mostly.', 'You blamed the weather, the media and your campaign manager, in that order.', 'Your supporters cried. Your campaign manager updated their résumé.'])}`
  if (current) {
    const d = pdata(current)
    const was = current.title
    closeHeld(g)
    if (d.office === camp.office || camp.incumbentRun) {
      leave(g, 'other')
      say(g, 'Election Night', `${loseText} Your time as ${was} is over.`, '\u{1F5F3}\u{FE0F}', 'bad')
      return
    }
  }
  say(g, 'Election Night', loseText, '\u{1F5F3}\u{FE0F}', 'bad')
}

// ---------------------------------------------------------------------------
// Run for office (Special Careers > Politician)

function runAction(g: GameState, o: OfficeDef): MenuAction {
  return {
    type: 'action',
    id: `pol.run.${o.id}`,
    label: `Run for ${officeTitle(g, o.id)}`,
    emoji: o.emoji,
    subtitle: (g) => `${officeTitle(g, o.id)} · ${money(salaryFor(g, o))}/yr · ${o.term}-year term · ${prereqText(g, o)}, age ${minAgeFor(g, o)}+`,
    disabledReason: (g) => runReason(g, o),
    confirm: (g) => (g.character.job ? `If you win, you'll quit your job as ${g.character.job.title}. Start a campaign?` : null),
    run: (g) => {
      const why = runReason(g, o)
      if (why) return tell(g, 'Not Eligible', why, '\u{1F6AB}')
      if (!useYearAction(g, 'pol.campaign', 1)) return tell(g, 'Campaign', 'You already ran a campaign this year. Election season is over.', '\u{1F5F3}\u{FE0F}')
      startCampaign(g, o.id, false)
    },
  }
}

function careerInfo(): MenuGroup {
  return {
    type: 'menu',
    id: 'pol.record',
    label: 'Political Record',
    emoji: '\u{1F4DC}',
    subtitle: (g) => {
      const p = viewPol(g)
      return `${p.wins} win${p.wins === 1 ? '' : 's'} · ${p.losses} loss${p.losses === 1 ? '' : 'es'}`
    },
    children: (g): MenuNode[] => {
      const p = viewPol(g)
      if (!p.held.length) return [{ type: 'info', id: 'pol.rec.none', text: "You haven't held any public office yet.", emoji: '\u{1F4DC}' }]
      const nodes: MenuNode[] = p.held.map((h, i) => ({
        type: 'info' as const,
        id: `pol.rec.${i}`,
        emoji: officeOf(h.office).emoji,
        text: `${h.title}, ${h.place} (age ${h.startAge}${h.endAge === null ? '-present' : `-${h.endAge}`})`,
      }))
      nodes.push({ type: 'info', id: 'pol.rec.laws', emoji: '\u{1F4DD}', text: `Bills signed: ${p.billsPassed} · Vetoes: ${p.vetoes}${p.impeached ? ` · Impeached: ${p.impeached}` : ''}` })
      return nodes
    },
  }
}

export const politicsCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'special.politics',
  label: 'Politician',
  emoji: '\u{1F5F3}\u{FE0F}',
  subtitle: 'Run for office',
  header: (g) =>
    `Work your way up from ${localTitle(g)} to ${leaderTitle(g)}. Smarts help in debates, looks help on TV, and fame and money win elections. Elections can only be contested once a year.`,
  children: (g): MenuNode[] => {
    const job = politicianJob(g)
    if (job) return [{ type: 'info', id: 'pol.already', text: `You are the ${job.title} (${job.company}). Govern from your job.`, emoji: '\u{1F3DB}\u{FE0F}' }, careerInfo()]
    return [...OFFICES.map((o) => runAction(g, o)), careerInfo()]
  },
}

// ---------------------------------------------------------------------------
// Governing

function hotIssues(g: GameState): string[] {
  return shuffle(g, ISSUES)
    .slice(0, 3)
    .map((i) => i.id)
}

function newBills(g: GameState, office: OfficeId): Bill[] {
  const pool = office === 'school' && g.character.countryId !== 'us' ? COUNCIL_BILLS : BILLS[office]
  return shuffle(g, pool)
    .slice(0, randInt(g, 2, 3))
    .map((b) => ({ name: localBillName(g, office, b.name), emoji: b.emoji, issue: b.issue, support: b.effect === 'payRaise' ? randInt(g, 5, 30) : randInt(g, 15, 88), effect: b.effect ?? '' }))
}

function informed(g: GameState, job: Job): boolean {
  return pdata(job).newsAge === g.character.age
}

const newspaperAction: MenuAction = {
  type: 'action',
  id: 'pol.news',
  label: 'Read the Newspaper',
  emoji: '\u{1F4F0}',
  subtitle: 'Find out what voters care about',
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    const d = pdata(job)
    if (!d.hot.length) d.hot = hotIssues(g)
    d.newsAge = g.character.age
    const topics = d.hot.map((h) => issueOf(h).label.toLowerCase())
    const a = d.approval
    const headline =
      a >= 75
        ? pick(g, [`"${job.title} Can Do No Wrong," Says Everyone`, `Approval Soars for ${g.character.lastName}`])
        : a >= 50
          ? pick(g, [`${job.title} ${g.character.lastName} Holds Steady`, `Local Voters Mostly Shrug at ${g.character.lastName}`])
          : a >= 30
            ? pick(g, [`Frustration Grows with ${g.character.lastName}`, `Is ${g.character.lastName} Asleep at the Wheel?`])
            : pick(g, [`Calls Mount for ${g.character.lastName} to Resign`, `${g.character.lastName}: Worst ${job.title} Ever?`])
    say(
      g,
      'The Newspaper',
      `Today's headline: ${headline}.\n\nThe public is most concerned about ${topics[0]}, ${topics[1]} and ${topics[2]}. Your approval rating is ${a}%.`,
      '\u{1F4F0}',
    )
  },
}

const SPEECH_SCRIPT = 'special.pol.speech'

defineScript(SPEECH_SCRIPT, (g, choice) => {
  const job = politicianJob(g)
  if (!job || choice === 'cancel') return
  if (!useYearAction(g, 'pol.speech', 3)) return tell(g, 'Speech', "You've given enough speeches this year. Your throat is hoarse and people are changing the channel.", '\u{1F399}\u{FE0F}')
  const d = pdata(job)
  if (!d.hot.length) d.hot = hotIssues(g)
  const issue = issueOf(choice)
  const hot = d.hot.includes(issue.id)
  const delta = hot ? randInt(g, 3, 8) + (g.character.stats.smarts >= 70 ? 1 : 0) : randInt(g, -3, 2)
  addApproval(job, delta)
  addFame(g, 1)
  log(g, `I gave a televised speech about ${issue.label.toLowerCase()}.`)
  say(
    g,
    'Broadcast Speech',
    hot
      ? `${pick(g, [`Your speech on ${issue.label.toLowerCase()} struck a nerve. People are talking about it everywhere.`, `You spoke passionately about ${issue.label.toLowerCase()} and the public ate it up.`, `Your address on ${issue.label.toLowerCase()} was quoted on every news channel.`])} Approval: ${d.approval}% (+${delta}).`
      : `${pick(g, [`Nobody seems to care about ${issue.label.toLowerCase()} right now. Viewers switched to a cooking show.`, `Your speech on ${issue.label.toLowerCase()} fell flat. Maybe read the newspaper first?`, `Pundits called your speech on ${issue.label.toLowerCase()} "tone-deaf".`])} Approval: ${d.approval}% (${delta >= 0 ? '+' : ''}${delta}).`,
    '\u{1F399}\u{FE0F}',
    hot ? 'good' : 'neutral',
  )
})

const speechAction: MenuAction = {
  type: 'action',
  id: 'pol.speech',
  label: 'Broadcast a Speech',
  emoji: '\u{1F399}\u{FE0F}',
  subtitle: 'Address the public on an issue',
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    const d = pdata(job)
    if (!d.hot.length) d.hot = hotIssues(g)
    const know = informed(g, job)
    scriptChoice(
      g,
      SPEECH_SCRIPT,
      'Broadcast a Speech',
      know ? 'You read the newspaper, so you know what people care about. What will you talk about?' : "What will your speech be about? (Read the newspaper to learn what's on voters' minds.)",
      [
        ...ISSUES.map((i) => ({ id: i.id, label: know && d.hot.includes(i.id) ? `${i.label} \u{1F525}` : i.label, emoji: i.emoji })),
        { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
      ],
      { emoji: '\u{1F399}\u{FE0F}' },
    )
  },
}

function rallyCost(job: Job): number {
  return Math.round((officeOf(pdata(job).office).budgets[1] * 0.1) / 100) * 100
}

const rallyAction: MenuAction = {
  type: 'action',
  id: 'pol.rally',
  label: 'Stage a Rally',
  emoji: '\u{1F4E3}',
  subtitle: (g) => {
    const job = politicianJob(g)
    return job ? `Costs ${money(rallyCost(job))}` : ''
  },
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    if (!useYearAction(g, 'pol.rally', 2)) return tell(g, 'Rally', "You've already held two rallies this year. The venue stopped returning your calls.", '\u{1F4E3}')
    const cost = rallyCost(job)
    if (!spend(g, cost)) {
      g.yearActions['pol.rally'] = Math.max(0, (g.yearActions['pol.rally'] ?? 1) - 1)
      return tell(g, 'Rally', `You can't afford the ${money(cost)} it costs to stage a rally.`, '\u{1F4B8}')
    }
    const roll = rand(g)
    if (roll < 0.15) {
      addApproval(job, -3)
      log(g, 'Protesters crashed my rally.', 'bad')
      return say(g, 'Rally', `${pick(g, ['Protesters drowned out your speech with kazoos.', 'Someone threw a tomato at you. They had good aim.', 'Your teleprompter died and you rambled for forty minutes.'])} Approval: ${pdata(job).approval}% (-3).`, '\u{1F345}', 'bad')
    }
    const delta = randInt(g, 2, 7)
    addApproval(job, delta)
    addFame(g, 1)
    addStat(g, 'happiness', 4)
    log(g, 'I held a political rally.', 'good')
    say(g, 'Rally', `${pick(g, ['Thousands of supporters chanted your name.', 'Your rally was electric. A marching band showed up uninvited and it worked.', 'You fired up the crowd and signed a cast for a kid with a broken arm.'])} Approval: ${pdata(job).approval}% (+${delta}).`, '\u{1F4E3}', 'good')
  },
}

/**
 * How a bill passes or dies from this seat: governors, mayors and presidents sign and veto;
 * councillors and members of parliament vote; a prime minister pushes bills through parliament.
 */
function lawWords(g: GameState, office: OfficeId) {
  const us = g.character.countryId === 'us'
  const votes = !us && (office === 'school' || (office === 'governor' && !regional(g)))
  if (votes) {
    return {
      ask: 'How will you vote?',
      pass: 'Vote for it', block: 'Vote against it',
      passTitle: 'Bill Passed', blockTitle: 'Bill Defeated',
      passed: (n: string) => `You voted for "${n}" and it passed.`,
      blocked: (n: string) => `You voted against "${n}" and it failed.`,
      logPass: (n: string) => `I voted for "${n}" and it passed.`,
      logBlock: (n: string) => `I voted down "${n}".`,
    }
  }
  if (office === 'leader' && parliamentary(g)) {
    return {
      ask: 'Will you push it through parliament or shelve it?',
      pass: 'Push it through parliament', block: 'Shelve it',
      passTitle: 'Bill Passed', blockTitle: 'Shelved',
      passed: (n: string) => `Your government pushed "${n}" through parliament.`,
      blocked: (n: string) => `You shelved "${n}".`,
      logPass: (n: string) => `My government passed "${n}".`,
      logBlock: (n: string) => `I shelved "${n}".`,
    }
  }
  return {
    ask: 'Will you sign it or veto it?',
    pass: 'Sign it into law', block: 'Veto it',
    passTitle: 'Bill Signed', blockTitle: 'Vetoed',
    passed: (n: string) => `You signed "${n}" into law.`,
    blocked: (n: string) => `You vetoed "${n}".`,
    logPass: (n: string) => `I signed "${n}" into law.`,
    logBlock: (n: string) => `I vetoed "${n}".`,
  }
}

const BILL_SCRIPT = 'special.pol.bill'

defineScript(BILL_SCRIPT, (g, choice, data) => {
  const job = politicianJob(g)
  if (!job || choice === 'later') return
  const d = pdata(job)
  const name = String((data as { name?: string } | undefined)?.name ?? '')
  const idx = d.bills.findIndex((b) => b.name === name)
  if (idx < 0) return
  const bill = d.bills[idx]
  d.bills.splice(idx, 1)
  const p = polProfile(g)
  const s = bill.support
  if (choice === 'pass') {
    p.billsPassed += 1
    count(g, 'billsPassed')
    let delta = Math.round((s - 50) / 6 + randInt(g, -2, 2))
    let extra = ''
    if (bill.effect === 'payRaise') {
      job.salary = Math.round((job.salary * 1.15) / 100) * 100
      extra = ` Your salary is now ${money(job.salary)}. Voters noticed.`
      delta -= 4
    } else if (bill.effect === 'holiday') {
      delta += 4
      extra = ' Everyone loves a day off. Even your enemies took it.'
    } else if (bill.effect === 'space') {
      setOwnFlag(g, 'marsFunding', true)
      extra = ' The space agencies are hiring.'
    }
    addApproval(job, delta)
    const w = lawWords(g, d.office)
    log(g, w.logPass(bill.name), delta >= 0 ? 'good' : 'bad')
    return say(
      g,
      w.passTitle,
      `${w.passed(bill.name)} ${s >= 60 ? pick(g, ['The public cheered.', 'It was wildly popular.']) : s >= 40 ? 'Reactions were mixed.' : pick(g, ['People were furious.', 'Angry letters piled up on your desk.'])}${extra} Approval: ${d.approval}% (${delta >= 0 ? '+' : ''}${delta}).`,
      bill.emoji,
      delta >= 0 ? 'good' : 'bad',
    )
  }
  p.vetoes += 1
  count(g, 'vetoes')
  const delta = Math.round((50 - s) / 8 + randInt(g, -2, 2))
  addApproval(job, delta)
  const w = lawWords(g, d.office)
  log(g, w.logBlock(bill.name))
  say(
    g,
    w.blockTitle,
    `${w.blocked(bill.name)} ${s >= 60 ? pick(g, ['Supporters of the bill marched outside your office.', 'The bill was popular, and now you are slightly less so.']) : pick(g, ['Most people were relieved.', 'Nobody wanted that bill anyway. Good call.'])} Approval: ${d.approval}% (${delta >= 0 ? '+' : ''}${delta}).`,
    '\u{1F6AB}',
    delta >= 0 ? 'good' : 'bad',
  )
})

function billsMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'pol.bills',
    label: 'Legislation',
    emoji: '\u{1F4DD}',
    subtitle: (g) => {
      const job = politicianJob(g)
      const n = job ? pdata(job).bills.length : 0
      return n ? `${n} bill${n === 1 ? '' : 's'} on your desk` : 'No bills on your desk'
    },
    children: (g): MenuNode[] => {
      const job = politicianJob(g)
      if (!job) return []
      const d = pdata(job)
      if (!d.bills.length) return [{ type: 'info', id: 'pol.bills.none', text: 'No bills are waiting on you. New ones arrive every year.', emoji: '\u{1F4DD}' }]
      return d.bills.map((b, i) => ({
        type: 'action' as const,
        id: `pol.bill.${i}`,
        label: b.name,
        emoji: b.emoji,
        subtitle: `Public support: ${b.support}%`,
        disabledReason: (gg: GameState) => blocked(gg, 0),
        run: (gg: GameState) =>
          scriptChoice(
            gg,
            BILL_SCRIPT,
            'Legislation',
            `A bill to "${b.name}" is on your desk. Public support is ${b.support}%. ${lawWords(gg, d.office).ask}`,
            [
              { id: 'pass', label: lawWords(gg, d.office).pass, emoji: '\u{270D}\u{FE0F}' },
              { id: 'veto', label: lawWords(gg, d.office).block, emoji: '\u{1F6AB}' },
              { id: 'later', label: 'Decide later', emoji: '\u{23F3}' },
            ],
            { emoji: b.emoji, data: { name: b.name } },
          ),
      }))
    },
  }
}

const fundraiseAction: MenuAction = {
  type: 'action',
  id: 'pol.fundraise',
  label: 'Host a Fundraiser',
  emoji: '\u{1F942}',
  subtitle: (g) => {
    const job = politicianJob(g)
    return job ? `War chest: ${money(pdata(job).warChest)}` : ''
  },
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    if (!useYearAction(g, 'pol.fundraise', 1)) return tell(g, 'Fundraiser', 'You already held a fundraiser this year. Donors are dodging your calls.', '\u{1F942}')
    const d = pdata(job)
    const o = officeOf(d.office)
    const raised = Math.round((o.budgets[1] * (0.2 + rand(g) * 0.6) * (0.5 + d.approval / 100) * partyOf(d.party).donors) / 100) * 100
    d.warChest += raised
    log(g, `I raised ${money(raised)} at a fundraiser.`, 'good')
    say(
      g,
      'Fundraiser',
      `${pick(g, ['You hosted a $500-a-plate dinner. The food was cold but the checks cleared.', 'You held a gala fundraiser and laughed at a lot of donor jokes.', 'You spent the evening shaking hands with very rich people who want very specific things.'])} You raised ${money(raised)} for your next campaign. War chest: ${money(d.warChest)}.`,
      '\u{1F942}',
      'good',
    )
  },
}

const HOLIDAY_SCRIPT = 'special.pol.order'

const ORDERS: { id: string; label: string; emoji: string }[] = [
  { id: 'parks', label: 'Declare a "National Nap Day"', emoji: '\u{1F634}' },
  { id: 'pets', label: 'Adopt an official pet for the residence', emoji: '\u{1F415}' },
  { id: 'pardon', label: 'Pardon a turkey', emoji: '\u{1F983}' },
  { id: 'tax', label: 'Order a tax audit of your rivals', emoji: '\u{1F575}\u{FE0F}' },
  { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
]

defineScript(HOLIDAY_SCRIPT, (g, choice) => {
  const job = politicianJob(g)
  if (!job || choice === 'cancel') return
  if (!useYearAction(g, 'pol.order', 1)) return tell(g, 'Executive Order', "You've already signed an executive order this year. The pen is tired.", '\u{1F58A}\u{FE0F}')
  let delta = 0
  let text = ''
  if (choice === 'parks') {
    delta = randInt(g, 1, 5)
    text = 'You declared National Nap Day. Productivity plummeted. Happiness soared.'
  } else if (choice === 'pets') {
    delta = randInt(g, 2, 4)
    text = `You adopted a scruffy rescue dog named ${pick(g, ['Senator Biscuit', 'Filibuster', 'Veto', 'Sir Barksalot'])}. It has a higher approval rating than you.`
  } else if (choice === 'pardon') {
    delta = randInt(g, 1, 3)
    text = 'You pardoned a turkey in a televised ceremony. It bit you. Ratings were huge.'
  } else {
    addHidden(g, 'karma', -6)
    if (chance(g, 0.35)) {
      delta = -randInt(g, 8, 14)
      text = 'The press found out you ordered audits of your political enemies. Outrage everywhere.'
      pdata(job).scandals += 1
    } else {
      delta = 0
      text = 'Your rivals are suddenly very busy with their accountants. Nobody connected it to you.'
    }
  }
  addApproval(job, delta)
  log(g, 'I signed an executive order.')
  say(g, 'Executive Order', `${text} Approval: ${pdata(job).approval}% (${delta >= 0 ? '+' : ''}${delta}).`, '\u{1F58A}\u{FE0F}', delta >= 0 ? 'good' : 'bad')
})

const orderAction: MenuAction = {
  type: 'action',
  id: 'pol.order',
  label: 'Executive Order',
  emoji: '\u{1F58A}\u{FE0F}',
  subtitle: 'Use the powers of your office',
  visible: (g) => {
    const job = politicianJob(g)
    return !!job && officeOf(pdata(job).office).rank >= 2
  },
  disabledReason: (g) => blocked(g, 0),
  run: (g) => scriptChoice(g, HOLIDAY_SCRIPT, 'Executive Order', 'What will your executive order be?', ORDERS, { emoji: '\u{1F58A}\u{FE0F}' }),
}

const resignAction: MenuAction = {
  type: 'action',
  id: 'pol.resign',
  label: 'Resign',
  emoji: '\u{1F6AA}',
  subtitle: 'Step down from office',
  confirm: (g) => `Resign as ${politicianJob(g)?.title ?? 'politician'}?`,
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    const title = job.title
    closeHeld(g)
    leave(g, 'quit')
    addFame(g, -3)
    log(g, `I resigned as ${title}.`)
    say(g, 'Resignation', `${pick(g, ['You resigned "to spend more time with family". Your family was not consulted.', 'You held a tearful press conference and resigned.', 'You resigned and immediately signed a book deal.'])} You are no longer ${title}.`, '\u{1F6AA}')
  },
}

export function politicsJobNodes(g: GameState): MenuNode[] {
  const job = politicianJob(g)
  if (!job) return []
  const d = pdata(job)
  const o = officeOf(d.office)
  return [
    {
      type: 'info',
      id: 'pol.status',
      emoji: o.emoji,
      text: `${styled(g, d.office)} · ${partyOf(d.party).name} · Approval ${d.approval}% · ${d.termOver ? 'Term over' : `${d.termLeft} year${d.termLeft === 1 ? '' : 's'} left in term ${d.terms}`}`,
    },
    newspaperAction,
    speechAction,
    rallyAction,
    billsMenu(),
    orderAction,
    fundraiseAction,
    abuseMenu(),
    careerInfo(),
    resignAction,
  ]
}

// ---------------------------------------------------------------------------
// Abuse of power: market-moving announcements and insider trading
//
// From Mayor up, office lets you move markets: ban a company, order an investigation, threaten
// to nationalize it, hand it a fat government contract, deregulate its industry, or endorse a
// coin. The price really moves (invest/shocks.ts): the Investments menu, index funds and every
// option or short on it feel it. Bet on the move first (puts or calls from the computer, coins,
// plain shares, or a crony's account) and you profit... until a journalist, the regulator or
// your own crony connects the dots. Heads of government move markets the most; a mayor barely
// nudges them. Where corruption is high regulators look away; where it is low they rarely do.
// Presidents (and leaders of captured courts) can't be charged while in office, but the case
// waits for them. Heat rises with every announcement and cools a little each year.

interface InsiderCase {
  id: string
  age: number
  year: number
  target: string
  symbol: string
  secId: string
  cause: ShockCause
  /** Dollars riding on the move when it was announced. */
  stake: number
  /** 'own' brokerage bets, a 'crony' account, or plain 'shares' / coins in Investments. */
  via: 'own' | 'crony' | 'shares'
  crony: string
  /** 0-1: how strong the case is once someone looks. */
  evidence: number
  /** open: nobody knows yet · pending: charges wait until you leave office · closed. */
  status: 'open' | 'pending' | 'closed'
  office: OfficeId
  title: string
  countryId: string
  /** Years it has gone unnoticed. */
  quiet: number
  /** Extra charges picked up along the way (obstruction...). */
  extra: string[]
  /** Estimated paper gain on plain shares and coins held through the announcement. */
  gain: number
}

interface AbuseData {
  /** 0-100: how closely the press and regulators are watching you. Cools every year. */
  heat: number
  /** Market-moving announcements made (markets learn to shrug). */
  moves: number
  cases: InsiderCase[]
  /** The friend who "runs a little fund" ('' until you need one). */
  crony: string
}

const ABUSE_SCRIPT = 'special.pol.abuse.announce'
const CRONY_DIR_SCRIPT = 'special.pol.abuse.cronyDir'
const CRONY_SIZE_SCRIPT = 'special.pol.abuse.cronySize'
const INSIDER_SCRIPT = 'special.pol.abuse.exposed'
const CRONY_CUT = 0.25
const MAX_CRONY_BETS = 2

function freshAbuse(): AbuseData {
  return { heat: 0, moves: 0, cases: [], crony: '' }
}

function repairAbuse(a: AbuseData): AbuseData {
  a.heat = Math.max(0, Math.min(100, Number.isFinite(a.heat) ? a.heat : 0))
  a.moves = Math.max(0, Number.isFinite(a.moves) ? Math.round(a.moves) : 0)
  if (typeof a.crony !== 'string') a.crony = ''
  if (!Array.isArray(a.cases)) a.cases = []
  a.cases = a.cases.filter((c) => c && typeof c.id === 'string' && typeof c.secId === 'string' && ['open', 'pending', 'closed'].includes(c.status) && Number.isFinite(c.age))
  for (const c of a.cases) {
    if (!Array.isArray(c.extra)) c.extra = []
    if (!Number.isFinite(c.evidence)) c.evidence = 0.5
    if (!Number.isFinite(c.quiet)) c.quiet = 0
    if (!Number.isFinite(c.stake)) c.stake = 0
    if (!Number.isFinite(c.gain)) c.gain = 0
  }
  // Keep every live case, and only the last few closed ones.
  const closed = a.cases.filter((c) => c.status === 'closed')
  if (closed.length > 8) {
    const drop = new Set(closed.slice(0, closed.length - 8).map((c) => c.id))
    a.cases = a.cases.filter((c) => !drop.has(c.id))
  }
  return a
}

/** Read-only view (menus). */
function abuseView(g: GameState): AbuseData {
  const p = peek<PolProfile>(g, 'politics')
  const raw = p?.abuse
  return raw && typeof raw === 'object' ? repairAbuse(JSON.parse(JSON.stringify(raw)) as AbuseData) : freshAbuse()
}

/** Mutable data (actions and hooks only). */
function abuseData(g: GameState): AbuseData {
  const p = polProfile(g)
  if (!p.abuse || typeof p.abuse !== 'object') p.abuse = freshAbuse()
  return repairAbuse(p.abuse)
}

function officeRank(job: Job | null): number {
  return job ? officeOf(pdata(job).office).rank : -1
}

/** Can't be charged while in office: presidents, and leaders whose courts answer to them. */
function immuneInOffice(g: GameState): boolean {
  const job = politicianJob(g)
  if (!job || pdata(job).office !== 'leader') return false
  return leaderTitle(g) === 'President' || marketOf(g.character.countryId).corruption >= 60
}

function heatLabel(h: number): string {
  return h >= 70 ? 'scorching' : h >= 45 ? 'hot' : h >= 20 ? 'warm' : 'cool'
}

function country(g: GameState): string {
  return countryLabel(getCountry(g.character.countryId))
}

/** The local paper that breaks a story (the same paper for the whole scandal, picked from its id). */
function newspaper(g: GameState, key: string): string {
  const names = ['Herald', 'Chronicle', 'Gazette', 'Tribune', 'Courier', 'Sentinel']
  let h = 0
  for (const ch of `${g.character.city}|${key}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `The ${g.character.city} ${names[h % names.length]}`
}

interface MoveDef {
  id: ShockCause
  label: string
  emoji: string
  bearish: boolean
  /** Which assets it applies to. */
  stock: boolean
  coin: boolean
  /** Lowest office rank that can do it (1 Mayor, 2 Governor / legislator, 3 head of government). */
  minRank: number
  /** Size of the move at full power (share of the price). The move is permanent (see invest/shocks.ts). */
  size: number
  /** Approval change range. */
  approval: [number, number]
}

const MOVES: MoveDef[] = [
  { id: 'ban', label: 'Announce a ban', emoji: '\u{1F6AB}', bearish: true, stock: true, coin: true, minRank: 1, size: 0.55, approval: [-3, 4] },
  { id: 'probe', label: 'Order an investigation', emoji: '\u{1F50E}', bearish: true, stock: true, coin: true, minRank: 1, size: 0.3, approval: [-1, 3] },
  { id: 'nationalize', label: 'Threaten to nationalize it', emoji: '\u{1F3DB}\u{FE0F}', bearish: true, stock: true, coin: false, minRank: 3, size: 0.65, approval: [-8, 6] },
  { id: 'contract', label: 'Award it a huge contract', emoji: '\u{1F4DC}', bearish: false, stock: true, coin: false, minRank: 1, size: 0.45, approval: [-4, 1] },
  { id: 'deregulate', label: 'Deregulate its industry', emoji: '\u{2702}\u{FE0F}', bearish: false, stock: true, coin: false, minRank: 2, size: 0.28, approval: [-3, 2] },
  { id: 'endorse', label: 'Publicly endorse it', emoji: '\u{1F3A4}', bearish: false, stock: false, coin: true, minRank: 2, size: 0.8, approval: [-6, 1] },
]

function moveOf(id: string): MoveDef | undefined {
  return MOVES.find((m) => m.id === id)
}

/** The moves this office can make about this kind of asset. */
function movesFor(rank: number, asset: 'stock' | 'coin'): MoveDef[] {
  return MOVES.filter((m) => rank >= m.minRank && (asset === 'coin' ? m.coin && rank >= 2 : m.stock))
}

/** How much a word from this office moves this market (0-1). */
function marketPower(g: GameState, rank: number, t: BetTarget): number {
  const office = rank >= 3 ? 1 : rank === 2 ? 0.45 : 0.18
  if (t.asset === 'coin') {
    // Crypto trades worldwide: only big economies move it much.
    const m = marketOf(g.character.countryId)
    const gdpM = Math.max(1, m.populationM * m.gdpPerCapita)
    const weight = Math.max(0.15, Math.min(1, (Math.log10(gdpM) - 4) / 3.2))
    return office * weight * (rank >= 3 ? 1 : 0.5)
  }
  // A small country trading on a neighbor's exchange is a small slice of these companies' business.
  return office * (exchangeInfo(g.character.countryId).home === g.character.countryId ? 1 : 0.5)
}

const NATIONAL_PROJECTS = ['rebuild every bridge in the country', 'supply the army with "tactical snacks"', 'build a high-speed rail line to nowhere in particular', 'digitize every government form (twice)', 'modernize the national power grid', 'paint every government building beige']
const REGIONAL_PROJECTS = ['repave every highway in {region}', 'build a prison nobody asked for', 'run the regional lottery', 'replace every streetlight in {region}']
const CITY_PROJECTS = ['fix every pothole in {city}', 'build a new stadium', "run the city's parking meters", 'collect the garbage in {city}']

function contractSize(g: GameState, rank: number): number {
  const w = Math.max(0.25, getCountry(g.character.countryId).wealth || 1)
  const base = rank >= 3 ? randInt(g, 3, 30) * 1_000_000_000 : rank === 2 ? randInt(g, 2, 20) * 100_000_000 : randInt(g, 5, 80) * 1_000_000
  return Math.round((base * w) / 1_000_000) * 1_000_000
}

/** What you said, in the words of your office. */
function announcementText(g: GameState, rank: number, move: MoveDef, t: BetTarget): string {
  const c = g.character
  const place = rank >= 3 ? country(g) : rank === 2 ? (regional(g) ? regionName(g) : country(g)) : c.city
  const legislator = rank === 2 && !regional(g)
  const coin = t.asset === 'coin'
  const fill = (s: string) => s.replace('{region}', regionName(g)).replace('{city}', c.city)
  switch (move.id) {
    case 'ban':
      if (coin) return rank >= 3 ? `You announced that ${t.name} will be banned in ${place}, effective "very soon."` : legislator ? `You tabled a bill to ban ${t.name} and called it "a pyramid scheme with a logo."` : `You announced that ${place} will ban ${t.name} "to protect our grandmothers."`
      if (legislator) return `You tabled a bill to ban ${t.name} from operating in ${country(g)}, citing "concerns" you declined to name.`
      return rank === 1 ? `You announced that ${t.name} is banned from doing business in ${place}.` : `You announced that ${t.name} will be banned from operating in ${place} "for reasons of public safety."`
    case 'probe':
      if (coin) return `You ordered a crackdown on ${t.name}, calling it "a scam for people who think they're too smart for scams."`
      if (rank === 1) return `You sent city inspectors to every ${t.name} office in ${place}, armed with clipboards and a grudge.`
      if (legislator) return `You used parliamentary privilege to accuse ${t.name} of fraud on the floor of ${legislatorHouse(g)}, in front of every camera in the building.`
      return `You ordered a sweeping government investigation into ${t.name}, citing "very serious concerns."`
    case 'nationalize':
      return `You told reporters that ${t.name} is "too important to be left to shareholders" and hinted at nationalizing it.`
    case 'contract': {
      const amount = money(contractSize(g, rank))
      const project = fill(pick(g, rank >= 3 ? NATIONAL_PROJECTS : rank === 2 ? REGIONAL_PROJECTS : CITY_PROJECTS))
      if (legislator) return `You steered a ${amount} government contract to ${t.name} to ${project}.`
      const level = rank >= 3 ? 'government' : rank === 2 ? (regional(g)?.unit === 'state' ? 'state' : 'regional') : 'city'
      return `You awarded ${t.name} a ${amount} ${level} contract to ${project}.`
    }
    case 'deregulate':
      return legislator ? `You pushed through an amendment scrapping the rules ${t.name}'s whole industry hates most.` : `You scrapped a mountain of regulations on ${t.sector.toLowerCase()} companies, starting with ${t.name}'s least favorite ones.`
    case 'endorse':
      if (rank >= 3) return `You declared ${t.name} "the currency of the future" and floated making it legal tender in ${place}.`
      if (legislator) return `You told ${legislatorHouse(g)} that ${t.name} is "the future of money," then changed your profile picture to one with laser eyes.`
      return `You announced that ${place} will accept ${t.name} for taxes and posted a selfie with laser eyes.`
  }
}

function legislatorHouse(g: GameState): string {
  return legislator(g).house
}

/** The player's positions that win if the price moves this way (insider positions). */
function insiderPositions(g: GameState, t: BetTarget, bearish: boolean): { betIds: string[]; own: number; crony: number; shares: number; index: number; indexUnits: number; cronyName: string } {
  const out = { betIds: [] as string[], own: 0, crony: 0, shares: 0, index: 0, indexUnits: 0, cronyName: '' }
  // Index options on the same exchange: a company's crash drags its index down with it.
  if (t.asset === 'stock') {
    for (const p of readMoney(g).positions) {
      if (p.side !== 'buy' || p.mode === 'paper' || p.exKey !== t.exKey || p.dir !== (bearish ? 'put' : 'call')) continue
      out.index += Math.max(0, p.premium)
      out.indexUnits += Math.max(0, p.units)
    }
  }
  for (const b of openBetsOn(g, t.secId)) {
    const wins = bearish ? b.kind === 'put' || b.kind === 'short' : b.kind === 'call' || b.kind === 'long'
    if (!wins || b.caseId) continue
    out.betIds.push(b.id)
    if (b.via === 'crony') {
      out.crony += b.premium
      out.cronyName = b.crony
    } else out.own += b.premium
  }
  if (!bearish) for (const a of investmentHoldings(g)) if (str(a.details.secId) === t.secId) out.shares += Math.max(0, a.value)
  return out
}

/** Make a market-moving announcement about a company or a coin. */
function announce(g: GameState, secId: string, moveId: string): void {
  const job = politicianJob(g)
  const rank = officeRank(job)
  const move = moveOf(moveId)
  if (!job || rank < 1 || !move || blocked(g, 0)) return
  const t = findTarget(g, secId)
  if (!t) return tell(g, 'Announcement', 'That company no longer trades. Your speechwriters are crushed.', '\u{1F4E2}')
  if (!movesFor(rank, t.asset).some((m) => m.id === move.id)) return tell(g, 'Announcement', `A ${job.title} can't do that. Even you have limits, apparently.`, '\u{1F6AB}')
  if (!useYearAction(g, 'pol.marketMove', 1)) return tell(g, 'Announcement', "You already moved the markets once this year. Your press secretary has locked the podium.", '\u{1F4E2}')
  const a = abuseData(g)
  const d = pdata(job)
  // Positions first: the shock reprices them.
  const pos = insiderPositions(g, t, move.bearish)
  const stake = pos.own + pos.crony + pos.shares + pos.index
  const indexBefore = indexShockFactor(g, t.exKey, g.year)
  // Markets take a popular leader more seriously, and learn to shrug at a serial announcer.
  const credibility = 0.75 + d.approval / 200
  const shrug = Math.pow(0.8, a.moves)
  const size = Math.min(0.85, move.size * marketPower(g, rank, t) * credibility * shrug * (0.8 + rand(g) * 0.4))
  const mult = move.bearish ? Math.max(0.15, 1 - size) : 1 + size
  addMarketShock(g, { asset: t.asset, secId: t.secId, exKey: t.exKey, slot: t.slot, name: t.name, symbol: t.symbol, cause: move.id, year: g.year, mult, fade: 0, countryId: g.character.countryId })
  revalueHoldings(g)
  // What the index options gain from the drag on the index (seized if investigators come).
  const indexGain = t.asset === 'stock' ? pos.indexUnits * Math.abs(indexShockFactor(g, t.exKey, g.year) / indexBefore - 1) : 0
  a.moves += 1
  a.heat = Math.min(100, a.heat + (stake > 0 ? (pos.own > 0 || pos.index > 0 ? 24 : 16) : 8))
  count(g, 'marketMoves')
  const delta = randInt(g, move.approval[0], move.approval[1]) - (a.moves >= 3 ? 2 : 0)
  addApproval(job, delta)
  addFame(g, 1)
  const said = announcementText(g, rank, move, t)
  const moved = `${t.name} (${t.symbol}) ${move.bearish ? 'plunged' : 'soared'} ${Math.round(Math.abs(mult - 1) * 100)}% within hours.`
  let tail = ''
  if (stake > 0) {
    const via: InsiderCase['via'] = pos.own > 0 || pos.index > 0 ? 'own' : pos.crony > 0 ? 'crony' : 'shares'
    const cs: InsiderCase = {
      id: `case${g.year}-${a.cases.length}`,
      age: g.character.age,
      year: g.year,
      target: t.name,
      symbol: t.symbol,
      secId: t.secId,
      cause: move.id,
      stake: Math.round(stake),
      via,
      crony: pos.cronyName,
      evidence: via === 'own' ? 0.75 : via === 'shares' ? 0.6 : 0.4,
      status: 'open',
      office: d.office,
      title: job.title,
      countryId: g.character.countryId,
      quiet: 0,
      extra: [],
      gain: Math.round(pos.shares * Math.max(0, mult - 1) + (Number.isFinite(indexGain) ? indexGain : 0)),
    }
    a.cases.push(cs)
    tagBets(g, pos.betIds, cs.id)
    addHidden(g, 'karma', -6)
    addHidden(g, 'notoriety', 2)
    count(g, 'insiderTrades')
    remember(g, `As ${job.title}, bet on ${t.name} before announcing news that moved its price.`)
    tail =
      via === 'shares'
        ? ` The ${t.symbol} you quietly bought beforehand is suddenly worth a lot more.`
        : via === 'crony'
          ? ` Somewhere, ${pos.cronyName} is smiling at a screen. Your bet pays out when the year ends.`
          : pos.own > 0
            ? ` The ${move.bearish ? 'puts' : 'calls'} in your own brokerage account are suddenly worth a fortune. They settle when the year ends.`
            : ` The ${exchangeInfo(g.character.countryId).ex.index} ${move.bearish ? 'puts' : 'calls'} in your brokerage account just got a lot more valuable. They settle when the year ends.`
  }
  log(g, `As ${job.title}, I ${move.bearish ? 'went after' : 'boosted'} ${t.name}, and its ${t.asset === 'coin' ? 'price' : 'stock'} ${move.bearish ? 'crashed' : 'jumped'}.`, 'event')
  say(g, 'Market Mover', `${said}\n\n${moved}${tail}\n\nApproval: ${d.approval}% (${delta >= 0 ? '+' : ''}${delta}).`, move.emoji, stake > 0 ? 'neutral' : delta >= 0 ? 'good' : 'neutral')
}

defineScript(ABUSE_SCRIPT, (g, choice, data) => {
  if (choice === 'cancel' || !data || typeof data !== 'object' || Array.isArray(data)) return
  announce(g, str(data.secId), choice)
})

function cronyName(g: GameState): string {
  const a = abuseData(g)
  if (!a.crony) {
    const gender = chance(g, 0.5) ? 'male' : 'female'
    a.crony = `${randomFirstName(g, g.character.countryId, gender)} ${randomLastName(g, g.character.countryId)}`
  }
  return a.crony
}

function cronyBlock(g: GameState): string | null {
  const b = blocked(g, 0)
  if (b) return b
  if (yearActionsUsed(g, 'pol.crony') >= 1) return 'You already tipped off your crony this year. Even they think you should lie low.'
  const open = readMoney(g).bets.filter((x) => x.via === 'crony').length
  if (open >= MAX_CRONY_BETS) return `Your crony is already holding ${open} of your bets. Wait for them to settle.`
  if (g.character.money < minBet(g)) return `You need at least ${money(minBet(g))} in cash to hand over.`
  return null
}

defineScript(CRONY_DIR_SCRIPT, (g, choice, data) => {
  if (choice === 'cancel' || !data || typeof data !== 'object' || Array.isArray(data) || cronyBlock(g)) return
  const job = politicianJob(g)
  const t = findTarget(g, str(data.secId))
  if (!job || officeRank(job) < 1 || !t) return
  const coin = t.asset === 'coin'
  const kind = choice === 'down' ? (coin ? 'short' : 'put') : choice === 'up' ? (coin ? 'long' : 'call') : ''
  if (!kind) return
  const name = cronyName(g)
  const hi = Math.max(minBet(g), Math.min(maxBet(g), Math.floor(Math.max(0, g.character.money))))
  scriptInput(g, {
    title: 'Hand Over the Cash',
    emoji: '\u{1F4BC}',
    text: `How much cash do you slip ${name} for ${coin ? (kind === 'short' ? `a 2x short on ${t.name}` : `a long bet on ${t.name}`) : `${kind}s on ${t.name}`}? ${name} keeps ${Math.round(CRONY_CUT * 100)}% of any profit. You can hand over ${money(minBet(g))} to ${money(hi)}.`,
    input: 'number',
    min: minBet(g),
    max: hi,
    defaultValue: String(Math.max(minBet(g), Math.round(hi / 10))),
    scriptId: CRONY_SIZE_SCRIPT,
    data: { secId: t.secId, kind },
  })
})

defineScript(CRONY_SIZE_SCRIPT, (g, value, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || cronyBlock(g)) return
  const job = politicianJob(g)
  if (!job || officeRank(job) < 1) return
  const kind = str(data.kind)
  if (!['call', 'put', 'short', 'long'].includes(kind)) return
  const n = Number(String(value).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return
  const stake = Math.round(Math.max(minBet(g), Math.min(maxBet(g), n, Math.max(0, g.character.money))))
  const name = cronyName(g)
  const bet = placeBet(g, { via: 'crony', secId: str(data.secId), kind: kind as 'call' | 'put' | 'short' | 'long', strike: 'atm', stake, crony: name, cut: CRONY_CUT })
  if (!bet) return
  useYearAction(g, 'pol.crony', 1)
  const a = abuseData(g)
  a.heat = Math.min(100, a.heat + 4)
  addHidden(g, 'karma', -2)
  log(g, `I slipped ${name} ${money(stake)} to bet on ${bet.name}.`, 'neutral')
  say(
    g,
    'A Quiet Word',
    `${pick(g, [`Over a round of golf, you told ${name} that ${bet.name} might be in for an "interesting" year.`, `You met ${name} in a parking garage, which is a perfectly normal place to meet.`, `You sent ${name} a text that just said "${bet.symbol}?" followed by a winking emoji. Then you deleted it.`])} ${name} took your ${money(stake)} in cash and bought ${bet.asset === 'coin' ? (bet.kind === 'short' ? 'a 2x short' : 'a long bet') : `${bet.kind}s`} on ${bet.symbol} in ${name.split(' ')[0]}'s own name. It settles when the year ends.`,
    '\u{1F91D}',
  )
})

function targetRows(g: GameState, idPrefix: string, run: (g: GameState, t: BetTarget) => void, coins: boolean): MenuNode[] {
  const nodes: MenuNode[] = [{ type: 'heading', id: `${idPrefix}.h.stocks`, label: `Companies on the ${exchangeInfo(g.character.countryId).ex.code}` }]
  for (const t of stockTargets(g)) nodes.push(targetAction(t, idPrefix, run))
  if (coins && !cryptoBanned(g.character.countryId)) {
    nodes.push({ type: 'heading', id: `${idPrefix}.h.coins`, label: 'Coins' })
    for (const t of coinTargets(g)) nodes.push(targetAction(t, idPrefix, run))
  }
  return nodes
}

function targetAction(t: BetTarget, idPrefix: string, run: (g: GameState, t: BetTarget) => void): MenuAction {
  return {
    type: 'action',
    id: `${idPrefix}.${t.secId}`,
    label: `${t.name} (${t.symbol})`,
    emoji: t.emoji,
    subtitle: `${priceLabel(t.price)} · ${t.sector}`,
    disabledReason: (g) => blocked(g, 0),
    run: (g) => run(g, t),
  }
}

function announceMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'pol.abuse.announce',
    label: 'Make a Market-Moving Announcement',
    emoji: '\u{1F4E2}',
    subtitle: 'Ban it, probe it, fund it or endorse it',
    disabledReason: (g) => blocked(g, 0) ?? (yearActionsUsed(g, 'pol.marketMove') >= 1 ? 'You already moved the markets once this year.' : null),
    header: (g) => {
      const rank = officeRank(politicianJob(g))
      const reach = rank >= 3 ? 'The whole country hangs on your words.' : rank === 2 ? 'Markets listen, a bit.' : 'Markets mostly ignore mayors, but not entirely.'
      return `Pick a company${rank >= 2 && !cryptoBanned(g.character.countryId) ? ' or a coin' : ''}, then say something about it. ${reach} Bet on it first and it's insider trading.`
    },
    children: (g) => {
      const rank = officeRank(politicianJob(g))
      return targetRows(g, 'pol.abuse.announce', (gg, t) => {
        const job = politicianJob(gg)
        const r = officeRank(job)
        if (!job || r < 1) return
        const moves = movesFor(r, t.asset)
        if (!moves.length) return tell(gg, 'Announcement', `A ${job.title} can't move the crypto market. You tried tweeting at it; it did not notice.`, '\u{1F937}')
        scriptChoice(gg, ABUSE_SCRIPT, `${t.name} (${t.symbol})`, `What will you announce about ${t.name}? The price will move the moment you say it.`, [...moves.map((m) => ({ id: m.id, label: m.label, emoji: m.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' }], { emoji: '\u{1F4E2}', data: { secId: t.secId } })
      }, rank >= 2)
    },
  }
}

function cronyMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'pol.abuse.crony',
    label: 'Tip Off a Crony',
    emoji: '\u{1F91D}',
    subtitle: (g) => {
      const name = abuseView(g).crony
      return name ? `${name} places the bet in their name` : 'A friend places the bet in their name'
    },
    disabledReason: cronyBlock,
    header: (g) => {
      const name = abuseView(g).crony || 'An old friend'
      return `${name} "runs a little fund." Tell them which way a company or coin is about to move and they'll bet your cash in their own name. Harder to trace than your own account; they keep ${Math.round(CRONY_CUT * 100)}% of any profit, and they're not great at keeping secrets.`
    },
    children: (g) =>
      targetRows(g, 'pol.abuse.crony', (gg, t) => {
        if (cronyBlock(gg)) return
        scriptChoice(gg, CRONY_DIR_SCRIPT, `${t.name} (${t.symbol})`, `Which way is ${t.name} about to move? (You'd know.)`, [
          { id: 'down', label: t.asset === 'coin' ? 'Down: short it' : 'Down: buy puts', emoji: '\u{1F4C9}' },
          { id: 'up', label: t.asset === 'coin' ? 'Up: go long' : 'Up: buy calls', emoji: '\u{1F4C8}' },
          { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
        ], { emoji: '\u{1F91D}', data: { secId: t.secId } })
      }, true),
  }
}

function abuseMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'pol.abuse',
    label: 'Abuse of Power',
    emoji: '\u{1F92B}',
    subtitle: (g) => `Move markets, quietly · heat: ${heatLabel(abuseView(g).heat)}`,
    visible: (g) => officeRank(politicianJob(g)) >= 1,
    disabledReason: (g) => blocked(g, 0),
    header: (g) => {
      const rank = officeRank(politicianJob(g))
      const imm = immuneInOffice(g) ? ' Prosecutors cannot charge you while you hold this office. They can wait.' : ''
      const reach = rank >= 3 ? 'When you speak, the whole market listens.' : rank === 2 ? 'When you speak, markets listen. Some of them.' : "When a mayor speaks, markets mostly keep scrolling. Mostly."
      return `${reach} Bet on the move before you make it and it's insider trading: illegal, lucrative, and the press loves it. ${uc(regulator(g.character.countryId))} watches how neatly the timing lines up.${imm}`
    },
    children: (g) => {
      const a = abuseView(g)
      const open = a.cases.filter((c) => c.status !== 'closed')
      const nodes: MenuNode[] = [
        {
          type: 'info',
          id: 'pol.abuse.status',
          emoji: a.heat >= 45 ? '\u{1F525}' : '\u{1F321}\u{FE0F}',
          text: `Heat: ${heatLabel(a.heat)} (${Math.round(a.heat)}/100) · Announcements: ${a.moves}${open.length ? ` · Trades that could come back to bite you: ${open.length}` : ''}`,
        },
        announceMenu(),
        cronyMenu(),
        { type: 'info', id: 'pol.abuse.tip', emoji: '\u{1F4BB}', text: 'You can also bet from your own brokerage account (Activities › Computer › Options Trading › Single Stocks & Coins), or simply buy the shares in Assets › Investments. Your own name is the easiest one to trace.' },
      ]
      return nodes
    },
  }
}

// --- Getting caught ------------------------------------------------------------

function caseSeverity(g: GameState, cs: InsiderCase): number {
  let sev = 3
  if (cs.stake >= local(g, 1_000_000)) sev += 1
  if (cs.stake >= local(g, 10_000_000)) sev += 1
  if (cs.office === 'mayor' || cs.office === 'school') sev -= 1
  return Math.max(2, Math.min(5, sev))
}

function caseCharges(cs: InsiderCase): string[] {
  const bearish = moveOf(cs.cause)?.bearish ?? true
  return [bearish ? 'Market Manipulation' : 'Abuse of Office', ...cs.extra]
}

function exposureChance(g: GameState, cs: InsiderCase, heat: number): number {
  const base = cs.via === 'own' ? 0.3 : cs.via === 'shares' ? 0.22 : 0.12
  let p = base * (0.5 + enforcement(cs.countryId)) * (1 + heat / 120)
  // Big trades stand out: a fortune moved the day before is hard to miss.
  p += Math.min(0.3, (cs.stake / Math.max(1, local(g, 20_000_000))) * 0.3)
  if (cs.office === 'leader') p *= 1.2
  if (cs.via === 'crony') p += 0.04 // cronies brag
  return Math.max(0.02, Math.min(0.85, p))
}

function viaText(cs: InsiderCase, g: GameState): string {
  if (cs.via === 'crony') return `your friend ${cs.crony || 'a close friend'}`
  if (cs.via === 'shares') return 'an account in your own name'
  return `a brokerage account in the name of ${g.character.firstName} ${g.character.lastName}`
}

function causeText(cs: InsiderCase): string {
  switch (cs.cause) {
    case 'ban':
      return `announced a ban on ${cs.target}`
    case 'probe':
      return `ordered an investigation into ${cs.target}`
    case 'nationalize':
      return `threatened to nationalize ${cs.target}`
    case 'contract':
      return `handed ${cs.target} a huge contract`
    case 'deregulate':
      return `deregulated ${cs.target}'s industry`
    case 'endorse':
      return `endorsed ${cs.target}`
  }
}

/** The press connects the dots: a popup with how you respond. */
function exposeCase(g: GameState, cs: InsiderCase): void {
  const job = politicianJob(g)
  const inOffice = !!job
  addHidden(g, 'notoriety', randInt(g, 8, 16))
  addFame(g, 3)
  const monarchy = getCountry(cs.countryId).monarchy ? ' Even the palace issued a statement expressing "deep concern."' : ''
  const text = `${newspaper(g, cs.id)} reports that ${viaText(cs, g)} made a killing betting on ${cs.target} (${cs.symbol}) just before you ${causeText(cs)}. The timing is "remarkable," says every expert on television.${monarchy}\n\nHow do you respond?`
  const choices = [
    { id: 'deny', label: 'Deny everything', emoji: '\u{1F645}' },
    { id: 'blame', label: cs.via === 'crony' ? `Throw ${cs.crony ? cs.crony.split(' ')[0] : 'your crony'} under the bus` : 'Blame your financial advisor', emoji: '\u{1F449}' },
  ]
  if (inOffice && officeRank(job) >= 2) choices.push({ id: 'lean', label: 'Lean on the regulator', emoji: '\u{1F574}\u{FE0F}' })
  if (inOffice) choices.push({ id: 'resign', label: 'Resign', emoji: '\u{1F6AA}' })
  else choices.push({ id: 'lawyer', label: 'Lawyer up and say nothing', emoji: '\u{1F4BC}' })
  log(g, `The press found out I bet on ${cs.target} before my announcement.`, 'bad')
  scriptChoice(g, INSIDER_SCRIPT, 'Insider Trading Scandal', text, choices, { emoji: '\u{1F4F0}', data: { caseId: cs.id } })
}

defineScript(INSIDER_SCRIPT, (g, choice, data) => {
  const c = g.character
  if (!c.alive || !data || typeof data !== 'object' || Array.isArray(data)) return
  const a = abuseData(g)
  const cs = a.cases.find((x) => x.id === str(data.caseId))
  if (!cs || cs.status === 'closed') return
  const job = politicianJob(g)
  const lines: string[] = []
  let leaned = false
  let drop = 0
  if (choice === 'deny') {
    if (chance(g, 0.3)) {
      drop = randInt(g, 2, 6)
      lines.push('You called it "a coincidence, and a very boring one." Somehow, that mostly worked.')
    } else {
      drop = randInt(g, 12, 22)
      lines.push(`You denied everything. Then ${newspaper(g, cs.id)} published the trade confirmations.`)
      cs.evidence = Math.min(0.95, cs.evidence + 0.05)
    }
  } else if (choice === 'blame') {
    addHidden(g, 'karma', -6)
    drop = randInt(g, 6, 12)
    if (cs.via === 'crony') {
      cs.evidence = Math.max(0.2, cs.evidence - 0.2)
      lines.push(`You said you barely know ${cs.crony || 'the man'}. ${cs.crony ? cs.crony.split(' ')[0] : 'Your crony'} was arrested on live TV, glaring into the camera.`)
    } else {
      cs.evidence = Math.max(0.3, cs.evidence - 0.1)
      lines.push('You blamed your financial advisor, who blamed an algorithm, which declined to comment.')
    }
  } else if (choice === 'lean' && job) {
    const p = Math.min(0.85, 0.12 + marketOf(cs.countryId).corruption / 120)
    if (chance(g, p)) {
      leaned = true
      drop = randInt(g, 3, 8)
      addHidden(g, 'karma', -5)
      lines.push(`You made a few calls. ${uc(regulator(cs.countryId))} announced it had "found no evidence of wrongdoing" and its chief got a lovely new office.`)
    } else {
      drop = randInt(g, 14, 24)
      cs.extra = [...new Set([...cs.extra, 'Obstruction of Justice'])]
      cs.evidence = Math.min(0.95, cs.evidence + 0.15)
      lines.push(`You leaned on ${regulator(cs.countryId)}. Its chief recorded the call and played it at a press conference.`)
    }
  } else if (choice === 'resign' && job) {
    const title = job.title
    closeHeld(g)
    leave(g, 'quit')
    addFame(g, -4)
    log(g, `I resigned as ${title} over an insider trading scandal.`, 'bad')
    lines.push(`You resigned as ${title} "to focus on clearing my name."`)
  } else {
    cs.evidence = Math.max(0.3, cs.evidence - 0.05)
    lines.push('You hired the most expensive lawyer in the country and said "no comment" 214 times.')
  }
  const still = politicianJob(g)
  if (still && drop > 0) {
    addApproval(still, -drop)
    lines.push(`Approval: ${pdata(still).approval}% (-${drop}).`)
    if (pdata(still).approval < 30) {
      addStat(g, 'happiness', -6)
      lines.push(pick(g, [`Thousands of protesters marched on ${pdata(still).office === 'mayor' ? 'City Hall' : 'the capital'} waving cardboard stock charts.`, 'Protesters camped outside your office chanting "Lock! Them! Up!"', 'Crowds filled the streets banging pots and pans. It was loud and, frankly, rhythmic.']))
    }
  }
  addStat(g, 'happiness', -randInt(g, 4, 9))
  // Does the regulator open a case?
  const investigate = !leaned && chance(g, Math.min(0.95, (0.25 + 0.65 * enforcement(cs.countryId)) * (0.6 + cs.evidence * 0.6)))
  if (!investigate) {
    cs.status = 'closed'
    if (!leaned) lines.push(`${uc(regulator(cs.countryId))} looked into it and decided it had "better things to do." Friends in high places.`)
    say(g, 'Insider Trading Scandal', lines.join('\n\n'), '\u{1F4F0}', 'bad')
    return
  }
  // The money is frozen and the profits clawed back.
  const frozen = freezeBets(g, cs.id)
  const profit = Math.max(0, caseProfit(g, cs.id) + cs.gain)
  const seized = Math.min(profit, Math.max(0, Math.floor(c.money)))
  if (seized > 0) addMoney(g, -seized)
  if (frozen > 0 || seized > 0) lines.push(`Investigators ${[frozen > 0 ? `froze ${money(frozen)} of open bets` : '', seized > 0 ? `seized ${money(seized)} of profits` : ''].filter(Boolean).join(' and ')}.`)
  if (politicianJob(g) && immuneInOffice(g)) {
    cs.status = 'pending'
    const title = politicianJob(g)!.title
    lines.push(`${uc(regulator(cs.countryId))} opened a case, but prosecutors ${title === 'President' ? "can't charge a sitting President" : `won't dare charge a sitting ${title}`}. It will be waiting for you the day you leave office.`)
    say(g, 'Insider Trading Scandal', lines.join('\n\n'), '\u{1F4F0}', 'bad')
    const sj = politicianJob(g)!
    if (pdata(sj).approval < 40 || chance(g, 0.5)) {
      const w = removalWords(g, pdata(sj).office)
      scriptChoice(g, IMPEACH_SCRIPT, w.title, `Over the insider trading scandal, ${w.vote} as ${sj.title}. What will you do?`, [
        { id: 'fight', label: 'Fight it', emoji: '\u{1F4AA}' },
        { id: 'resign', label: 'Resign', emoji: '\u{1F6AA}' },
      ], { emoji: '\u{1F528}' })
    }
    return
  }
  cs.status = 'closed'
  const inOffice = politicianJob(g)
  if (inOffice) {
    const title = inOffice.title
    closeHeld(g)
    leave(g, 'fired')
    addFame(g, -8)
    lines.push(`You were removed as ${title} pending trial.`)
    remember(g, `Removed as ${title} and charged with insider trading.`)
  }
  say(g, 'Insider Trading Scandal', lines.join('\n\n'), '\u{1F4F0}', 'bad')
  arrestPlayer(g, 'Insider Trading', caseSeverity(g, cs), { evidence: Math.max(0.3, Math.min(0.95, cs.evidence)), extraCharges: caseCharges(cs), context: `Agents from ${regulator(cs.countryId)} arrived with a warrant and a very large box for your files.` })
})

/** One line for the AI context about the player's market meddling ('' when there is none). */
export function abuseSummary(g: GameState): string {
  const a = abuseView(g)
  if (!a.moves && !a.cases.length) return ''
  const pending = a.cases.filter((c) => c.status === 'pending').length
  const open = a.cases.filter((c) => c.status === 'open').length
  const parts = [`${a.moves} market-moving announcement${a.moves === 1 ? '' : 's'} while in office`]
  if (a.cases.length) parts.push(`${a.cases.length} insider trade${a.cases.length === 1 ? '' : 's'} on them`)
  if (open) parts.push(`${open} not yet discovered`)
  if (pending) parts.push(`${pending} insider-trading case${pending === 1 ? '' : 's'} waiting until they leave office`)
  return `Abuse of power: ${parts.join(', ')}; press heat ${heatLabel(a.heat)}`
}

/**
 * Yearly: heat cools, open cases may surface, pending cases wait out your immunity, and old cases
 * expire. At most one popup a year from here. Runs in and out of office (charges follow you).
 */
function yearlyAbuse(g: GameState): void {
  const c = g.character
  const p = peek<PolProfile>(g, 'politics')
  if (!p?.abuse || c.prison) return
  const a = abuseData(g)
  const heat = a.heat
  a.heat = Math.max(0, a.heat - 10)
  let acted = false
  for (const cs of a.cases) {
    if (cs.status === 'closed') continue
    if (c.age - cs.age > 10) {
      cs.status = 'closed'
      log(g, `The statute of limitations ran out on my ${cs.symbol} trades.`, 'good')
      continue
    }
    if (acted) continue
    if (cs.status === 'open') {
      if (chance(g, exposureChance(g, cs, heat))) {
        acted = true
        exposeCase(g, cs)
      } else if (++cs.quiet >= 4) {
        cs.status = 'closed'
        log(g, `Nobody ever connected my ${cs.symbol} bet to my announcement. The trail went cold.`, 'good')
      }
      continue
    }
    // Pending: charges wait for immunity to end.
    if (immuneInOffice(g)) continue
    if (chance(g, marketOf(cs.countryId).corruption / 300)) {
      cs.status = 'closed'
      log(g, `The case file on my ${cs.symbol} trades was "lost in a flood." There was no flood.`, 'good')
      continue
    }
    if (chance(g, 0.3 + 0.5 * enforcement(cs.countryId))) {
      acted = true
      cs.status = 'closed'
      remember(g, `Charged with insider trading over ${cs.target} after leaving office.`)
      arrestPlayer(g, 'Insider Trading', caseSeverity(g, cs), { evidence: Math.max(0.3, Math.min(0.95, cs.evidence)), extraCharges: caseCharges(cs), context: `Now that you no longer hold office, prosecutors finally came for you over the ${cs.symbol} trades.` })
    }
  }
}

// ---------------------------------------------------------------------------
// Yearly scenarios

const FAVOR_SCRIPT = 'special.pol.favor'
const SCANDAL_SCRIPT = 'special.pol.scandal'
const IMPEACH_SCRIPT = 'special.pol.impeach'
const TERM_SCRIPT = 'special.pol.term'

defineScript(FAVOR_SCRIPT, (g, choice, data) => {
  const job = politicianJob(g)
  if (!job) return
  const amount = num((data as { amount?: number } | undefined)?.amount as Json, 10_000)
  const who = String((data as { who?: string } | undefined)?.who ?? 'A lobbyist')
  const d = pdata(job)
  if (choice === 'accept') {
    d.favors += 1
    addHidden(g, 'karma', -8)
    addMoney(g, amount)
    count(g, 'bribesTaken')
    log(g, `I accepted a political favor from ${who.toLowerCase()}.`, 'bad')
    say(g, 'Political Favor', `You quietly accepted ${money(amount)} from ${who.toLowerCase()}. ${pick(g, ['They promised nobody would ever know.', 'The envelope was surprisingly heavy.', 'They winked. You winked back. It was weird.'])}`, '\u{1F4B0}')
    return
  }
  if (choice === 'report') {
    addHidden(g, 'karma', 6)
    const delta = randInt(g, 3, 8)
    addApproval(job, delta)
    log(g, `I reported a bribery attempt by ${who.toLowerCase()}.`, 'good')
    say(g, 'Political Favor', `You reported the bribe to the authorities. The press called you "the last honest politician". Approval: ${d.approval}% (+${delta}).`, '\u{1F607}', 'good')
    return
  }
  addHidden(g, 'karma', 2)
  say(g, 'Political Favor', `You turned down the money. ${who} said you'd "regret this" and stormed out.`, '\u{1F645}')
})

defineScript(SCANDAL_SCRIPT, (g, choice, data) => {
  const job = politicianJob(g)
  if (!job) return
  const what = String((data as { what?: string } | undefined)?.what ?? 'a scandal')
  const d = pdata(job)
  d.scandals += 1
  let delta: number
  let text: string
  if (choice === 'apologize') {
    delta = -randInt(g, 1, 6)
    text = pick(g, ['Your heartfelt apology was surprisingly well received.', 'You apologized on live TV. A few people even believed you.'])
  } else if (choice === 'deny') {
    if (chance(g, 0.5)) {
      delta = randInt(g, -1, 2)
      text = 'You denied everything. The story died after a news cycle.'
    } else {
      delta = -randInt(g, 8, 15)
      text = 'You denied everything, then a reporter found the receipts. Literally.'
    }
  } else {
    addHidden(g, 'karma', -4)
    if (chance(g, 0.6)) {
      delta = -randInt(g, 0, 4)
      text = 'You blamed an intern. The intern was fired. You were not.'
    } else {
      delta = -randInt(g, 6, 12)
      text = 'You blamed your staff, and your staff leaked everything to the press.'
    }
  }
  addApproval(job, delta)
  log(g, `I was caught up in a scandal over ${what}.`, 'bad')
  say(g, 'Scandal', `${text} Approval: ${d.approval}% (${delta >= 0 ? '+' : ''}${delta}).`, '\u{1F4F8}', delta >= 0 ? 'neutral' : 'bad')
})

/** How a deeply unpopular official gets thrown out here. */
function removalWords(g: GameState, office: OfficeId): { title: string; vote: string; survived: string; removed: string } {
  if (office === 'leader' && parliamentary(g)) {
    return { title: 'No-Confidence Vote', vote: 'Parliament has called a vote of no confidence in you', survived: 'a vote of no confidence', removed: 'voted out in a no-confidence vote' }
  }
  if (office === 'governor' && !regional(g) && g.character.countryId !== 'us') {
    return { title: 'Deselection', vote: 'your own party has moved to deselect you', survived: 'a deselection vote', removed: 'deselected by your own party' }
  }
  if (office === 'mayor' || office === 'school') {
    return { title: 'Recall Election', vote: 'voters have forced a recall election', survived: 'a recall vote', removed: 'recalled by voters' }
  }
  return { title: 'Impeachment', vote: 'lawmakers have begun proceedings to remove you', survived: 'an impeachment vote', removed: 'impeached and removed' }
}

defineScript(IMPEACH_SCRIPT, (g, choice) => {
  const job = politicianJob(g)
  if (!job) return
  const title = job.title
  const p = polProfile(g)
  if (choice === 'resign') {
    closeHeld(g)
    leave(g, 'quit')
    addFame(g, -5)
    log(g, `I resigned as ${title} before I could be removed.`, 'bad')
    return say(g, 'Resigned', `You resigned in disgrace before the vote. ${pick(g, ['Your farewell speech was mostly excuses.', 'Reporters chased you to your car.'])}`, '\u{1F6AA}', 'bad')
  }
  const d = pdata(job)
  const survive = Math.min(0.85, 0.2 + d.approval / 40 + (g.character.stats.smarts - 50) / 200)
  if (chance(g, survive)) {
    addApproval(job, randInt(g, 3, 8))
    const w = removalWords(g, d.office)
    log(g, `I survived ${w.survived} as ${title}.`, 'good')
    return say(g, w.title, `You fought back and survived the vote by a hair. ${pick(g, ['Your allies held the line.', 'Two lawmakers missed the vote because of a flat tire. Lucky you.'])} Approval: ${d.approval}%.`, '\u{1F605}', 'good')
  }
  p.impeached += 1
  count(g, 'impeached')
  closeHeld(g)
  leave(g, 'fired')
  addFame(g, -8)
  addStat(g, 'happiness', -20)
  const w = removalWords(g, d.office)
  log(g, `I was ${w.removed} as ${title}.`, 'bad')
  remember(g, `${w.removed[0].toUpperCase()}${w.removed.slice(1)} as ${title}.`)
  say(g, 'Removed from Office', `The vote was overwhelming. You were ${w.removed} as ${title}. History will not be kind.`, '\u{1F528}', 'bad')
})

defineScript(TERM_SCRIPT, (g, choice) => {
  const job = politicianJob(g)
  if (!job) return
  const d = pdata(job)
  const o = officeOf(d.office)
  const title = job.title
  if (choice === 'reelect') {
    reelection(g, job)
    return
  }
  if (choice === 'higher') {
    const next = OFFICES[o.rank + 1]
    if (!next || runReason(g, next, true)) {
      reelection(g, job)
      return
    }
    startCampaign(g, next.id, true)
    return
  }
  closeHeld(g)
  if (o.id === 'leader') {
    const p = polProfile(g)
    p.formerLeader = true
    p.formerLeaderTitle = title
  }
  leave(g, 'retired')
  log(g, `I retired from politics after serving as ${title}.`, 'good')
  remember(g, `Retired from politics as ${title}.`)
  say(g, 'Retired', `You left office as ${title} with a ${d.approval}% approval rating. ${pick(g, ['Your portrait now hangs in a hallway nobody walks down.', 'You celebrated by sleeping in for the first time in years.', 'Publishers are already calling about your memoir.'])}`, '\u{1F3D6}\u{FE0F}', 'good')
})

function reelection(g: GameState, job: Job): void {
  const d = pdata(job)
  const o = officeOf(d.office)
  const c = g.character
  const opp = opponentName(g)
  const chest = d.warChest
  d.warChest = 0
  const poll = 30 + d.approval * 0.45 + Math.min(8, (chest / Math.max(1, o.budgets[2])) * 8) + (c.stats.smarts - 50) * 0.05 + Math.min(6, fameOf(g) * 0.08) - d.scandals * 2
  const share = Math.round(Math.max(5, Math.min(95, poll + randInt(g, -6, 6))))
  const title = job.title
  if (share > 50) {
    d.termLeft = o.term
    d.terms += 1
    d.termOver = false
    d.scandals = 0
    polProfile(g).wins += 1
    count(g, 'electionsWon')
    addStat(g, 'happiness', 10)
    addFame(g, 2)
    log(g, `I was re-elected ${title} with ${share}% of the vote.`, 'good')
    remember(g, `Re-elected ${title}.`)
    say(g, 'Re-elected!', `You beat ${opp} with ${share}% of the vote and won a ${ordinalWord(d.terms)} term as ${title}!${chest > 0 ? ` Your ${money(chest)} war chest helped.` : ''}`, '\u{1F389}', 'good')
    return
  }
  polProfile(g).losses += 1
  count(g, 'electionsLost')
  closeHeld(g)
  if (o.id === 'leader') {
    const p = polProfile(g)
    p.formerLeader = true
    p.formerLeaderTitle = title
  }
  leave(g, 'other')
  addStat(g, 'happiness', -12)
  log(g, `I lost my re-election bid for ${title}.`, 'bad')
  say(g, 'Defeated', `Voters threw you out. ${opp} won with ${100 - share}% of the vote. ${pick(g, ['You moved out of your office with a single sad box.', 'You gave a concession speech and then ate an entire cake.'])}`, '\u{1F5F3}\u{FE0F}', 'bad')
}

function ordinalWord(n: number): string {
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][n - 1] ?? `${n}th`
}

const FAVOR_GIVERS = ['A real estate developer', 'An oil company lobbyist', 'A tech billionaire', 'A casino owner', 'A pharmaceutical executive', 'A shady construction contractor', 'A mysterious man in sunglasses']
const SCANDALS = [
  'a leaked group chat',
  'an expensive taxpayer-funded vacation',
  'an old photo in a questionable costume',
  'a hot mic moment',
  'your nephew getting a cushy government contract',
  'a very expensive office chair',
  'skipping a disaster briefing to play golf',
  'an awkward dance video',
]

export function yearlyPolitics(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const p0 = peek<PolProfile>(g, 'politics')
  const job = politicianJob(g)
  // Former heads of government collect a pension.
  if (p0?.formerLeader && !job && !c.prison) {
    const pension = Math.round((200_000 * Math.max(0.3, getCountry(c.countryId).wealth || 1)) / 100) * 100
    earnIncome(g, pension)
    if (chance(g, 0.15)) addFame(g, 1)
  }
  // Insider trades can surface years later, in or out of office.
  yearlyAbuse(g)
  if (!c.alive) return
  if (!job || c.prison || !politicianJob(g)) return
  syncTenure(g, job)
  const d = pdata(job)
  const o = officeOf(d.office)
  earnIncome(g, job.salary)
  d.hot = hotIssues(g)
  d.bills = newBills(g, o.id)
  // Approval drifts toward 50 with noise.
  setApproval(job, d.approval + (50 - d.approval) * 0.12 + randInt(g, -6, 5))
  fameToward(g, o.fame, 3 + o.rank)
  addStat(g, 'happiness', d.approval >= 60 ? 2 : d.approval < 30 ? -4 : 0)

  // Accepted favors may come back to haunt you.
  if (d.favors > 0 && chance(g, Math.min(0.5, 0.08 * d.favors))) {
    const title = job.title
    closeHeld(g)
    leave(g, 'fired')
    addFame(g, -10)
    log(g, `I was arrested for corruption while serving as ${title}.`, 'bad')
    say(g, 'Corruption Probe', `Investigators traced the money from your "political favors". You were removed as ${title} and arrested for corruption.`, '\u{1F6A8}', 'bad')
    arrestPlayer(g, 'Corruption', 4, { evidence: 0.8 })
    return
  }

  // Head-of-government danger.
  if (o.id === 'leader' && chance(g, 0.02)) {
    if (chance(g, 0.08)) {
      killCharacter(g, 'Assassination')
      return
    }
    addStat(g, 'happiness', -10)
    addApproval(job, 6)
    log(g, 'I survived an assassination attempt.', 'bad')
    say(g, 'Assassination Attempt', 'Shots rang out at a public event, but your security team tackled you to safety. A wave of sympathy lifted your approval rating.', '\u{1F6E1}\u{FE0F}', 'bad')
  }

  d.termLeft = Math.max(0, d.termLeft - 1)
  if (d.termLeft === 0) {
    d.termOver = true
    const limitHit = o.termLimit > 0 && d.terms >= o.termLimit
    const next = OFFICES[o.rank + 1]
    const nextOk = !!next && !runReason(g, next, true)
    const choices = []
    if (!limitHit && c.age <= 85) choices.push({ id: 'reelect', label: 'Run for re-election', emoji: '\u{1F5F3}\u{FE0F}' })
    if (nextOk && next) choices.push({ id: 'higher', label: `Run for ${officeTitle(g, next.id)}`, emoji: next.emoji })
    choices.push({ id: 'retire', label: 'Retire from politics', emoji: '\u{1F3D6}\u{FE0F}' })
    scriptChoice(
      g,
      TERM_SCRIPT,
      'End of Term',
      `Your ${ordinalWord(d.terms)} term as ${job.title} is over${limitHit ? ' and you have reached the term limit' : ''}. Your approval rating is ${d.approval}%. What's next?`,
      choices,
      { emoji: o.emoji },
    )
    return
  }

  if (d.approval < 20 && o.rank >= 1 && chance(g, 0.75)) {
    scriptChoice(
      g,
      IMPEACH_SCRIPT,
      removalWords(g, o.id).title,
      `With an approval rating of just ${d.approval}%, ${removalWords(g, o.id).vote} as ${job.title}. What will you do?`,
      [
        { id: 'fight', label: 'Fight it', emoji: '\u{1F4AA}' },
        { id: 'resign', label: 'Resign', emoji: '\u{1F6AA}' },
      ],
      { emoji: '\u{1F528}' },
    )
    return
  }

  let modal = false
  if (chance(g, 0.12)) {
    modal = true
    const what = pick(g, SCANDALS)
    scriptChoice(
      g,
      SCANDAL_SCRIPT,
      'Scandal!',
      `The press has a story about ${what}. How will you respond?`,
      [
        { id: 'apologize', label: 'Apologize', emoji: '\u{1F64F}' },
        { id: 'deny', label: 'Deny everything', emoji: '\u{1F645}' },
        { id: 'blame', label: 'Blame your staff', emoji: '\u{1F449}' },
      ],
      { emoji: '\u{1F4F8}', data: { what } },
    )
  }

  if (!modal && chance(g, 0.22)) {
    const who = pick(g, FAVOR_GIVERS)
    const amount = Math.round((salaryFor(g, o) * (0.3 + rand(g) * 1.2)) / 1000) * 1000
    scriptChoice(
      g,
      FAVOR_SCRIPT,
      'Political Favor',
      `${who} offers you ${money(amount)} in cash if you push through a favorable decision for them. Nobody has to know...`,
      [
        { id: 'accept', label: 'Take the money', emoji: '\u{1F4B0}' },
        { id: 'decline', label: 'Decline', emoji: '\u{1F645}' },
        { id: 'report', label: 'Report the bribe', emoji: '\u{1F46E}' },
      ],
      { emoji: '\u{1F91D}', data: { who, amount } },
    )
  }
}
