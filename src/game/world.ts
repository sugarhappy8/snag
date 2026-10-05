// Countries, cities and name pools.
//
// The nation list mirrors the 102 nations a life can be born into or emigrate
// to in the real game (Afghanistan to Zimbabwe), each with real cities, a name
// pool that sounds right for the place, and the laws and customs other modules
// read (driving/drinking ages, free university, healthcare, death penalty,
// royalty, conscription). All data here is static and plain JSON-friendly.
import { pick, rand, weightedPick } from './rng'
import type { GameState, Gender } from './types'

export type NameRegion =
  | 'anglo'
  | 'british'
  | 'irish'
  | 'caribbean'
  | 'hispanic'
  | 'spanish'
  | 'portuguese'
  | 'french'
  | 'haitian'
  | 'german'
  | 'dutch'
  | 'belgian'
  | 'italian'
  | 'nordic'
  | 'finnish'
  | 'estonian'
  | 'slavic'
  | 'ukrainian'
  | 'polish'
  | 'west_slavic'
  | 'south_slavic'
  | 'hungarian'
  | 'romanian'
  | 'greek'
  | 'turkish'
  | 'georgian'
  | 'arabic'
  | 'gulf_arabic'
  | 'egyptian'
  | 'maghrebi'
  | 'persian'
  | 'afghan'
  | 'hebrew'
  | 'south_asian'
  | 'pakistani'
  | 'bengali'
  | 'nepali'
  | 'chinese'
  | 'cantonese'
  | 'taiwanese'
  | 'japanese'
  | 'korean'
  | 'mongolian'
  | 'kazakh'
  | 'southeast_asian'
  | 'vietnamese'
  | 'thai'
  | 'indonesian'
  | 'malay'
  | 'singaporean'
  | 'filipino'
  | 'west_african'
  | 'east_african'
  | 'ethiopian'
  | 'somali'
  | 'congolese'
  | 'angolan'
  | 'southern_african'
  | 'zimbabwean'
  | 'melanesian'
  | 'polynesian'

export interface NamePool {
  male: string[]
  female: string[]
  last: string[]
}

export type Continent = 'North America' | 'South America' | 'Europe' | 'Africa' | 'Middle East' | 'Asia' | 'Oceania'

export const CONTINENTS: Continent[] = ['North America', 'South America', 'Europe', 'Africa', 'Middle East', 'Asia', 'Oceania']

export interface Country {
  /** Lowercase ISO 3166-1 alpha-2 code. */
  id: string
  name: string
  demonym: string
  flag: string
  continent: Continent
  /** Symbol shown next to money in this country ('$', '€' or '£'). */
  currency: string
  cities: string[]
  names: NameRegion
  /** Multiplier on salaries/prices relative to the US (1). */
  wealth: number
  drivingAge: number
  drinkingAge: number
  freeUniversity: boolean
  universalHealthcare: boolean
  deathPenalty: boolean
  /** Has a reigning royal family that characters can be born or marry into. */
  monarchy: boolean
  /** Mandatory military service for 18 year olds. */
  conscription: boolean
  /** Typical avatar skin tones (indexes 1-5), weighted by repetition. */
  skinTones: number[]
  /** Average newborn weight in kilograms. */
  birthWeightKg: number
  /** Relative chance of being born here in a random life. */
  weight: number
  /** Religions a newborn may be raised in, weighted by repetition ('None' = not religious). */
  religions: string[]
}

// ---------------------------------------------------------------------------
// Builders

/** Regional-indicator flag emoji for an ISO alpha-2 code ('us' -> 🇺🇸). */
export function flagEmoji(id: string): string {
  const code = id.toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return '\u{1F3F3}\u{FE0F}'
  return String.fromCodePoint(0x1f1e6 + code.charCodeAt(0) - 65, 0x1f1e6 + code.charCodeAt(1) - 65)
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Expand approximate percentages into a repetition-weighted list (1 entry per ~2%, reduced). */
function faiths(shares: Record<string, number>): string[] {
  const counts = Object.entries(shares).map(([name, pct]) => [name, Math.max(1, Math.round(pct / 2))] as const)
  const div = counts.reduce((d, [, n]) => gcd(d, n), 0) || 1
  const out: string[] = []
  for (const [name, n] of counts) for (let i = 0; i < n / div; i++) out.push(name)
  return out
}

type CountrySpec = Omit<Country, 'flag' | 'religions'> & { religions: Record<string, number> }

function nation(spec: CountrySpec): Country {
  return { ...spec, flag: flagEmoji(spec.id), religions: faiths(spec.religions) }
}

// ---------------------------------------------------------------------------
// Nations. The United States stays first: it is the default/fallback country.

export const COUNTRIES: Country[] = [
  nation({
    id: 'us', name: 'United States', demonym: 'American', continent: 'North America', currency: '$',
    cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Miami', 'Tucson', 'San Francisco', 'Seattle', 'Boston', 'Atlanta', 'Dallas', 'Denver', 'Las Vegas', 'Nashville', 'Detroit'],
    names: 'anglo', wealth: 1, drivingAge: 16, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 1, 2, 2, 3, 4, 5, 5], birthWeightKg: 3.3, weight: 14,
    religions: { Christianity: 63, None: 29, Judaism: 2, Islam: 1, Buddhism: 1, Hinduism: 1 },
  }),

  // ----- North America & the Caribbean -----
  nation({
    id: 'aw', name: 'Aruba', demonym: 'Aruban', continent: 'North America', currency: '$',
    cities: ['Oranjestad', 'San Nicolaas', 'Noord', 'Santa Cruz', 'Paradera', 'Savaneta', 'Tanki Leendert', 'Palm Beach', 'Pos Chiquito'],
    names: 'dutch', wealth: 0.6, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 2, 3, 3, 4], birthWeightKg: 3.2, weight: 0.5,
    religions: { Christianity: 88, None: 8 },
  }),
  nation({
    id: 'bs', name: 'Bahamas', demonym: 'Bahamian', continent: 'North America', currency: '$',
    cities: ['Nassau', 'Freeport', 'West End', 'Marsh Harbour', 'Spanish Wells', 'George Town', 'Andros Town', 'Alice Town', 'Dunmore Town', 'Matthew Town'],
    names: 'caribbean', wealth: 0.6, drivingAge: 17, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [1, 3, 4, 5, 5, 5], birthWeightKg: 3.2, weight: 0.5,
    religions: { Christianity: 93, None: 4 },
  }),
  nation({
    id: 'bz', name: 'Belize', demonym: 'Belizean', continent: 'North America', currency: '$',
    cities: ['Belize City', 'Belmopan', 'San Ignacio', 'Orange Walk Town', 'Dangriga', 'Corozal Town', 'San Pedro', 'Punta Gorda', 'Benque Viejo del Carmen', 'Placencia'],
    names: 'caribbean', wealth: 0.28, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [3, 3, 4, 4, 5], birthWeightKg: 3.2, weight: 0.5,
    religions: { Christianity: 85, None: 15 },
  }),
  nation({
    id: 'ca', name: 'Canada', demonym: 'Canadian', continent: 'North America', currency: '$',
    cities: ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Quebec City', 'Halifax', 'Regina', 'Saskatoon', 'Victoria', 'Hamilton', 'Kelowna'],
    names: 'anglo', wealth: 0.9, drivingAge: 16, drinkingAge: 19,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 1, 2, 2, 3, 4, 5], birthWeightKg: 3.4, weight: 4,
    religions: { Christianity: 53, None: 35, Islam: 5, Hinduism: 2, Sikhism: 2, Buddhism: 1, Judaism: 1 },
  }),
  nation({
    id: 'cr', name: 'Costa Rica', demonym: 'Costa Rican', continent: 'North America', currency: '$',
    cities: ['San José', 'Alajuela', 'Cartago', 'Heredia', 'Liberia', 'Puntarenas', 'Limón', 'San Isidro de El General', 'Quepos', 'Tamarindo'],
    names: 'hispanic', wealth: 0.42, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 2, 2, 3, 3], birthWeightKg: 3.2, weight: 1,
    religions: { Christianity: 80, None: 18 },
  }),
  nation({
    id: 'cu', name: 'Cuba', demonym: 'Cuban', continent: 'North America', currency: '$',
    cities: ['Havana', 'Santiago de Cuba', 'Camagüey', 'Holguín', 'Santa Clara', 'Guantánamo', 'Bayamo', 'Cienfuegos', 'Pinar del Río', 'Matanzas', 'Trinidad', 'Varadero'],
    names: 'hispanic', wealth: 0.2, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: true,
    skinTones: [1, 2, 2, 3, 4, 5], birthWeightKg: 3.3, weight: 1,
    religions: { Christianity: 60, None: 25, Santería: 15 },
  }),
  nation({
    id: 'do', name: 'Dominican Republic', demonym: 'Dominican', continent: 'North America', currency: '$',
    cities: ['Santo Domingo', 'Santiago de los Caballeros', 'Puerto Plata', 'Punta Cana', 'La Romana', 'San Pedro de Macorís', 'San Francisco de Macorís', 'La Vega', 'Higüey', 'Barahona', 'Samaná'],
    names: 'hispanic', wealth: 0.35, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4, 4, 5], birthWeightKg: 3.2, weight: 1,
    religions: { Christianity: 85, None: 13 },
  }),
  nation({
    id: 'sv', name: 'El Salvador', demonym: 'Salvadoran', continent: 'North America', currency: '$',
    cities: ['San Salvador', 'San Miguel', 'Santa Ana', 'Soyapango', 'Mejicanos', 'Santa Tecla', 'Apopa', 'Delgado', 'Sonsonate', 'Usulután', 'La Libertad'],
    names: 'hispanic', wealth: 0.22, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 1,
    religions: { Christianity: 85, None: 14 },
  }),
  nation({
    id: 'gt', name: 'Guatemala', demonym: 'Guatemalan', continent: 'North America', currency: '$',
    cities: ['Guatemala City', 'Mixco', 'Villa Nueva', 'Quetzaltenango', 'Antigua Guatemala', 'Escuintla', 'Cobán', 'Petapa', 'Huehuetenango', 'Puerto Barrios', 'Flores'],
    names: 'hispanic', wealth: 0.22, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.0, weight: 1,
    religions: { Christianity: 87, None: 12 },
  }),
  nation({
    id: 'ht', name: 'Haiti', demonym: 'Haitian', continent: 'North America', currency: '$',
    cities: ['Port-au-Prince', 'Carrefour', 'Delmas', 'Cap-Haïtien', 'Pétion-Ville', 'Gonaïves', 'Les Cayes', 'Jacmel', 'Saint-Marc', 'Port-de-Paix', 'Jérémie'],
    names: 'haitian', wealth: 0.15, drivingAge: 18, drinkingAge: 16,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [4, 5, 5, 5], birthWeightKg: 2.9, weight: 1,
    religions: { Christianity: 80, Vodou: 10, None: 10 },
  }),
  nation({
    id: 'jm', name: 'Jamaica', demonym: 'Jamaican', continent: 'North America', currency: '$',
    cities: ['Kingston', 'Montego Bay', 'Spanish Town', 'Portmore', 'Mandeville', 'May Pen', 'Ocho Rios', 'Negril', 'Port Antonio', 'Savanna-la-Mar', 'Falmouth'],
    names: 'caribbean', wealth: 0.28, drivingAge: 17, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [3, 4, 5, 5, 5], birthWeightKg: 3.1, weight: 1,
    religions: { Christianity: 69, None: 21, Rastafari: 2 },
  }),
  nation({
    id: 'mx', name: 'Mexico', demonym: 'Mexican', continent: 'North America', currency: '$',
    cities: ['Mexico City', 'Guadalajara', 'Monterrey', 'Cancún', 'Tijuana', 'Juárez', 'Mazatlán', 'Puerto Vallarta', 'Cabo San Lucas', 'Nogales', 'Puebla', 'Mérida', 'Oaxaca', 'León', 'Acapulco'],
    names: 'hispanic', wealth: 0.4, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 2, 3, 3, 3, 4], birthWeightKg: 3.2, weight: 3,
    religions: { Christianity: 88, None: 10 },
  }),
  nation({
    id: 'ni', name: 'Nicaragua', demonym: 'Nicaraguan', continent: 'North America', currency: '$',
    cities: ['Managua', 'León', 'Masaya', 'Granada', 'Matagalpa', 'Chinandega', 'Estelí', 'Jinotega', 'Bluefields', 'San Juan del Sur', 'Rivas'],
    names: 'hispanic', wealth: 0.2, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 1,
    religions: { Christianity: 83, None: 15 },
  }),
  nation({
    id: 'pa', name: 'Panama', demonym: 'Panamanian', continent: 'North America', currency: '$',
    cities: ['Panama City', 'Colón', 'David', 'San Miguelito', 'La Chorrera', 'Santiago de Veraguas', 'Chitré', 'Bocas del Toro', 'Arraiján', 'Boquete', 'Penonomé'],
    names: 'hispanic', wealth: 0.5, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4, 5], birthWeightKg: 3.1, weight: 1,
    religions: { Christianity: 90, None: 8 },
  }),
  nation({
    id: 'pr', name: 'Puerto Rico', demonym: 'Puerto Rican', continent: 'North America', currency: '$',
    cities: ['San Juan', 'Ponce', 'Bayamón', 'Carolina', 'Caguas', 'Mayagüez', 'Guaynabo', 'Arecibo', 'Humacao', 'Fajardo', 'Aguadilla', 'Vieques'],
    names: 'hispanic', wealth: 0.65, drivingAge: 16, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 2, 2, 3, 4], birthWeightKg: 3.1, weight: 1,
    religions: { Christianity: 90, None: 8 },
  }),

  // ----- South America -----
  nation({
    id: 'ar', name: 'Argentina', demonym: 'Argentine', continent: 'South America', currency: '$',
    cities: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata', 'Mar del Plata', 'San Miguel de Tucumán', 'Salta', 'Santa Fe', 'Bariloche', 'Ushuaia', 'Neuquén'],
    names: 'hispanic', wealth: 0.4, drivingAge: 17, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 2, 2, 3], birthWeightKg: 3.3, weight: 2,
    religions: { Christianity: 75, None: 19, Islam: 1, Judaism: 1 },
  }),
  nation({
    id: 'bo', name: 'Bolivia', demonym: 'Bolivian', continent: 'South America', currency: '$',
    cities: ['La Paz', 'Sucre', 'Santa Cruz de la Sierra', 'Cochabamba', 'El Alto', 'Oruro', 'Potosí', 'Tarija', 'Trinidad', 'Uyuni'],
    names: 'hispanic', wealth: 0.2, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 1,
    religions: { Christianity: 90, None: 8 },
  }),
  nation({
    id: 'br', name: 'Brazil', demonym: 'Brazilian', continent: 'South America', currency: '$',
    cities: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza', 'Belo Horizonte', 'Manaus', 'Curitiba', 'Recife', 'Porto Alegre', 'Goiânia', 'Santos', 'Florianópolis', 'Natal'],
    names: 'portuguese', wealth: 0.35, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 2, 2, 3, 3, 4, 5], birthWeightKg: 3.2, weight: 3,
    religions: { Christianity: 86, None: 10, Spiritism: 2 },
  }),
  nation({
    id: 'cl', name: 'Chile', demonym: 'Chilean', continent: 'South America', currency: '$',
    cities: ['Santiago', 'Valdivia', 'Valparaíso', 'Viña del Mar', 'Concepción', 'Antofagasta', 'La Serena', 'Temuco', 'Puerto Montt', 'Punta Arenas', 'Iquique', 'Arica'],
    names: 'hispanic', wealth: 0.5, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 2, 2, 3], birthWeightKg: 3.4, weight: 1,
    religions: { Christianity: 70, None: 28 },
  }),
  nation({
    id: 'co', name: 'Colombia', demonym: 'Colombian', continent: 'South America', currency: '$',
    cities: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Santa Marta', 'Pereira', 'Manizales', 'Cúcuta', 'Ibagué', 'Pasto'],
    names: 'hispanic', wealth: 0.3, drivingAge: 16, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 2, 2, 3, 3, 4, 5], birthWeightKg: 3.1, weight: 2,
    religions: { Christianity: 87, None: 12 },
  }),
  nation({
    id: 'ec', name: 'Ecuador', demonym: 'Ecuadorian', continent: 'South America', currency: '$',
    cities: ['Quito', 'Guayaquil', 'Cuenca', 'Santo Domingo', 'Machala', 'Manta', 'Portoviejo', 'Ambato', 'Loja', 'Riobamba', 'Esmeraldas'],
    names: 'hispanic', wealth: 0.3, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 1,
    religions: { Christianity: 90, None: 8 },
  }),
  nation({
    id: 'gy', name: 'Guyana', demonym: 'Guyanese', continent: 'South America', currency: '$',
    cities: ['Georgetown', 'Linden', 'New Amsterdam', 'Anna Regina', 'Bartica', 'Corriverton', 'Rosignol', 'Mahaica', 'Lethem', 'Mabaruma', 'Parika'],
    names: 'caribbean', wealth: 0.4, drivingAge: 17, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [3, 4, 4, 5, 5], birthWeightKg: 3.0, weight: 0.5,
    religions: { Christianity: 64, Hinduism: 25, Islam: 7, None: 3 },
  }),
  nation({
    id: 'py', name: 'Paraguay', demonym: 'Paraguayan', continent: 'South America', currency: '$',
    cities: ['Asunción', 'Ciudad del Este', 'San Ignacio', 'San Pedro', 'Encarnación', 'Luque', 'San Lorenzo', 'Capiatá', 'Lambaré', 'Fernando de la Mora', 'Pedro Juan Caballero', 'Concepción'],
    names: 'hispanic', wealth: 0.28, drivingAge: 18, drinkingAge: 20,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 2, 3, 3], birthWeightKg: 3.3, weight: 1,
    religions: { Christianity: 96, None: 3 },
  }),
  nation({
    id: 'pe', name: 'Peru', demonym: 'Peruvian', continent: 'South America', currency: '$',
    cities: ['Lima', 'Cusco', 'Machu Picchu', 'Arequipa', 'Trujillo', 'Chiclayo', 'Piura', 'Iquitos', 'Huancayo', 'Puno', 'Callao', 'Tacna'],
    names: 'hispanic', wealth: 0.3, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 1.5,
    religions: { Christianity: 90, None: 7 },
  }),
  nation({
    id: 'uy', name: 'Uruguay', demonym: 'Uruguayan', continent: 'South America', currency: '$',
    cities: ['Montevideo', 'Punta del Este', 'Salto', 'Paysandú', 'Las Piedras', 'Rivera', 'Maldonado', 'Tacuarembó', 'Melo', 'Colonia del Sacramento', 'Mercedes'],
    names: 'hispanic', wealth: 0.5, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 2, 2, 3], birthWeightKg: 3.3, weight: 1,
    religions: { Christianity: 55, None: 42, Judaism: 1 },
  }),
  nation({
    id: 've', name: 'Venezuela', demonym: 'Venezuelan', continent: 'South America', currency: '$',
    cities: ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto', 'Maracay', 'Ciudad Guayana', 'Barcelona', 'Maturín', 'Mérida', 'San Cristóbal', 'Puerto La Cruz', 'Cumaná'],
    names: 'hispanic', wealth: 0.18, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [2, 2, 3, 3, 4, 5], birthWeightKg: 3.1, weight: 1.5,
    religions: { Christianity: 88, None: 10 },
  }),

  // ----- Europe -----
  nation({
    id: 'ad', name: 'Andorra', demonym: 'Andorran', continent: 'Europe', currency: '€',
    cities: ['Andorra la Vella', 'Encamp', 'La Massana', 'Escaldes-Engordany', 'Sant Julià de Lòria', 'Canillo', 'Ordino', 'Pas de la Casa', 'Soldeu', 'Arinsal'],
    names: 'spanish', wealth: 0.85, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 2], birthWeightKg: 3.3, weight: 0.5,
    religions: { Christianity: 88, None: 10 },
  }),
  nation({
    id: 'at', name: 'Austria', demonym: 'Austrian', continent: 'Europe', currency: '€',
    cities: ['Vienna', 'Salzburg', 'Graz', 'Linz', 'Innsbruck', 'Klagenfurt', 'Villach', 'Wels', 'St. Pölten', 'Dornbirn', 'Bregenz', 'Hallstatt'],
    names: 'german', wealth: 0.9, drivingAge: 18, drinkingAge: 16,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 1, 1, 2, 2, 3], birthWeightKg: 3.3, weight: 1,
    religions: { Christianity: 64, None: 22, Islam: 8 },
  }),
  nation({
    id: 'be', name: 'Belgium', demonym: 'Belgian', continent: 'Europe', currency: '€',
    cities: ['Brussels', 'Antwerp', 'Ghent', 'Bruges', 'Ostend', 'Charleroi', 'Liège', 'Leuven', 'Namur', 'Mons', 'Mechelen', 'Aalst'],
    names: 'belgian', wealth: 0.9, drivingAge: 18, drinkingAge: 16,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: true, conscription: false,
    skinTones: [1, 1, 1, 1, 2, 2, 3, 4, 5], birthWeightKg: 3.4, weight: 1,
    religions: { Christianity: 58, None: 32, Islam: 7 },
  }),
  nation({
    id: 'hr', name: 'Croatia', demonym: 'Croatian', continent: 'Europe', currency: '€',
    cities: ['Zagreb', 'Split', 'Dubrovnik', 'Rijeka', 'Osijek', 'Zadar', 'Pula', 'Slavonski Brod', 'Karlovac', 'Varaždin', 'Šibenik'],
    names: 'south_slavic', wealth: 0.55, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 1, 2], birthWeightKg: 3.4, weight: 1,
    religions: { Christianity: 91, None: 6, Islam: 1 },
  }),
  nation({
    id: 'cz', name: 'Czech Republic', demonym: 'Czech', continent: 'Europe', currency: '$',
    cities: ['Prague', 'Brno', 'Ostrava', 'Plzeň', 'Liberec', 'Olomouc', 'České Budějovice', 'Hradec Králové', 'Pardubice', 'Zlín', 'Karlovy Vary'],
    names: 'west_slavic', wealth: 0.6, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 2], birthWeightKg: 3.3, weight: 1,
    religions: { None: 70, Christianity: 28 },
  }),
  nation({
    id: 'dk', name: 'Denmark', demonym: 'Danish', continent: 'Europe', currency: '$',
    cities: ['Copenhagen', 'Aarhus', 'Odense', 'Aalborg', 'Esbjerg', 'Randers', 'Kolding', 'Horsens', 'Vejle', 'Roskilde', 'Herning', 'Helsingør'],
    names: 'nordic', wealth: 1, drivingAge: 18, drinkingAge: 16,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: true, conscription: true,
    skinTones: [1, 1, 1, 1, 1, 2, 3], birthWeightKg: 3.5, weight: 1,
    religions: { Christianity: 74, None: 20, Islam: 5 },
  }),
  nation({
    id: 'ee', name: 'Estonia', demonym: 'Estonian', continent: 'Europe', currency: '€',
    cities: ['Tallinn', 'Tartu', 'Narva', 'Pärnu', 'Kohtla-Järve', 'Viljandi', 'Maardu', 'Rakvere', 'Kuressaare', 'Sillamäe', 'Võru', 'Haapsalu'],
    names: 'estonian', wealth: 0.6, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 1, 1, 2], birthWeightKg: 3.5, weight: 0.5,
    religions: { None: 58, Christianity: 40 },
  }),
  nation({
    id: 'fi', name: 'Finland', demonym: 'Finnish', continent: 'Europe', currency: '€',
    cities: ['Helsinki', 'Espoo', 'Tampere', 'Vantaa', 'Oulu', 'Turku', 'Jyväskylä', 'Lahti', 'Kuopio', 'Pori', 'Rovaniemi', 'Vaasa'],
    names: 'finnish', wealth: 0.85, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 1, 1, 2], birthWeightKg: 3.5, weight: 1,
    religions: { Christianity: 65, None: 33, Islam: 1 },
  }),
  nation({
    id: 'fr', name: 'France', demonym: 'French', continent: 'Europe', currency: '€',
    cities: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Bordeaux', 'Nancy', 'Perpignan', 'Strasbourg', 'Lille', 'Montpellier', 'Rennes', 'Grenoble'],
    names: 'french', wealth: 0.85, drivingAge: 17, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 2, 2, 3, 4, 5], birthWeightKg: 3.3, weight: 3,
    religions: { Christianity: 47, None: 40, Islam: 9, Judaism: 1, Buddhism: 1 },
  }),
  nation({
    id: 'de', name: 'Germany', demonym: 'German', continent: 'Europe', currency: '€',
    cities: ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Dortmund', 'Leipzig', 'Bremen', 'Dresden', 'Hanover', 'Nuremberg'],
    names: 'german', wealth: 0.9, drivingAge: 18, drinkingAge: 16,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 1, 2, 2, 3, 4], birthWeightKg: 3.4, weight: 3,
    religions: { Christianity: 50, None: 42, Islam: 6 },
  }),
  nation({
    id: 'gr', name: 'Greece', demonym: 'Greek', continent: 'Europe', currency: '€',
    cities: ['Athens', 'Thessaloniki', 'Patras', 'Heraklion', 'Larissa', 'Volos', 'Ioannina', 'Chania', 'Rhodes', 'Santorini', 'Kalamata', 'Corfu'],
    names: 'greek', wealth: 0.55, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 2, 2, 3], birthWeightKg: 3.2, weight: 1,
    religions: { Christianity: 88, None: 10, Islam: 2 },
  }),
  nation({
    id: 'hu', name: 'Hungary', demonym: 'Hungarian', continent: 'Europe', currency: '$',
    cities: ['Budapest', 'Debrecen', 'Szeged', 'Miskolc', 'Pécs', 'Győr', 'Nyíregyháza', 'Kecskemét', 'Székesfehérvár', 'Szombathely', 'Eger', 'Sopron'],
    names: 'hungarian', wealth: 0.55, drivingAge: 17, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 2, 3], birthWeightKg: 3.3, weight: 1,
    religions: { Christianity: 60, None: 38 },
  }),
  nation({
    id: 'ie', name: 'Ireland', demonym: 'Irish', continent: 'Europe', currency: '€',
    cities: ['Dublin', 'Cork', 'Shannon', 'Limerick', 'Galway', 'Waterford', 'Drogheda', 'Dundalk', 'Kilkenny', 'Sligo', 'Athlone', 'Killarney'],
    names: 'irish', wealth: 1, drivingAge: 17, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 1, 1, 2, 3, 4], birthWeightKg: 3.5, weight: 2,
    religions: { Christianity: 78, None: 15, Islam: 2 },
  }),
  nation({
    id: 'it', name: 'Italy', demonym: 'Italian', continent: 'Europe', currency: '€',
    cities: ['Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence', 'Venice', 'Verona', 'Pisa', 'Catania', 'Cagliari', 'Bari'],
    names: 'italian', wealth: 0.75, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 2, 2, 3], birthWeightKg: 3.3, weight: 2,
    religions: { Christianity: 78, None: 18, Islam: 3 },
  }),
  nation({
    id: 'mc', name: 'Monaco', demonym: 'Monégasque', continent: 'Europe', currency: '€',
    cities: ['Monaco', 'Monte Carlo', 'La Condamine', 'Fontvieille', 'Monaco-Ville', 'Larvotto', 'Moneghetti', 'Saint Roman', 'La Rousse', 'Les Révoires', 'Saint Michel'],
    names: 'french', wealth: 1.3, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 2], birthWeightKg: 3.3, weight: 0.5,
    religions: { Christianity: 86, None: 10, Judaism: 2 },
  }),
  nation({
    id: 'nl', name: 'Netherlands', demonym: 'Dutch', continent: 'Europe', currency: '€',
    cities: ['Amsterdam', 'Rotterdam', 'The Hague', 'Eindhoven', 'Utrecht', 'Groningen', 'Tilburg', 'Almere', 'Breda', 'Nijmegen', 'Haarlem', 'Maastricht', 'Leiden'],
    names: 'dutch', wealth: 0.95, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: true, conscription: false,
    skinTones: [1, 1, 1, 1, 2, 2, 3, 4, 5], birthWeightKg: 3.5, weight: 2,
    religions: { None: 55, Christianity: 37, Islam: 5 },
  }),
  nation({
    id: 'no', name: 'Norway', demonym: 'Norwegian', continent: 'Europe', currency: '$',
    cities: ['Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Drammen', 'Fredrikstad', 'Kristiansand', 'Tromsø', 'Sandnes', 'Ålesund', 'Bodø', 'Lillehammer'],
    names: 'nordic', wealth: 1.1, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: true, conscription: true,
    skinTones: [1, 1, 1, 1, 1, 2, 3], birthWeightKg: 3.5, weight: 1,
    religions: { Christianity: 70, None: 25, Islam: 3 },
  }),
  nation({
    id: 'pl', name: 'Poland', demonym: 'Polish', continent: 'Europe', currency: '$',
    cities: ['Warsaw', 'Kraków', 'Poznań', 'Łódź', 'Wrocław', 'Gdańsk', 'Szczecin', 'Lublin', 'Katowice', 'Białystok', 'Bydgoszcz', 'Gdynia', 'Zakopane'],
    names: 'polish', wealth: 0.55, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 1, 2], birthWeightKg: 3.4, weight: 2,
    religions: { Christianity: 87, None: 11 },
  }),
  nation({
    id: 'pt', name: 'Portugal', demonym: 'Portuguese', continent: 'Europe', currency: '€',
    cities: ['Lisbon', 'Porto', 'Braga', 'Coimbra', 'Funchal', 'Faro', 'Aveiro', 'Setúbal', 'Évora', 'Guimarães', 'Viseu', 'Lagos', 'Sintra'],
    names: 'portuguese', wealth: 0.6, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 2, 2, 3, 4], birthWeightKg: 3.2, weight: 1,
    religions: { Christianity: 84, None: 14 },
  }),
  nation({
    id: 'ro', name: 'Romania', demonym: 'Romanian', continent: 'Europe', currency: '$',
    cities: ['Bucharest', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Craiova', 'Brașov', 'Galați', 'Ploiești', 'Oradea', 'Sibiu', 'Sighișoara'],
    names: 'romanian', wealth: 0.5, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 2, 2], birthWeightKg: 3.2, weight: 1,
    religions: { Christianity: 97, None: 2 },
  }),
  nation({
    id: 'ru', name: 'Russia', demonym: 'Russian', continent: 'Europe', currency: '$',
    cities: ['Moscow', 'St. Petersburg', 'Novosibirsk', 'Yekaterinburg', 'Kazan', 'Nizhny Novgorod', 'Chelyabinsk', 'Samara', 'Omsk', 'Rostov-on-Don', 'Ufa', 'Krasnoyarsk', 'Vladivostok', 'Sochi', 'Murmansk'],
    names: 'slavic', wealth: 0.5, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 1, 1, 2, 2], birthWeightKg: 3.4, weight: 2,
    religions: { Christianity: 63, None: 25, Islam: 10, Buddhism: 1 },
  }),
  nation({
    id: 'rs', name: 'Serbia', demonym: 'Serbian', continent: 'Europe', currency: '$',
    cities: ['Belgrade', 'Novi Sad', 'Niš', 'Kragujevac', 'Subotica', 'Zrenjanin', 'Pančevo', 'Čačak', 'Kraljevo', 'Novi Pazar', 'Smederevo', 'Leskovac'],
    names: 'south_slavic', wealth: 0.4, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 2], birthWeightKg: 3.4, weight: 1,
    religions: { Christianity: 92, Islam: 4, None: 3 },
  }),
  nation({
    id: 'sk', name: 'Slovakia', demonym: 'Slovak', continent: 'Europe', currency: '€',
    cities: ['Bratislava', 'Košice', 'Prešov', 'Žilina', 'Nitra', 'Banská Bystrica', 'Trnava', 'Trenčín', 'Martin', 'Poprad', 'Piešťany'],
    names: 'west_slavic', wealth: 0.55, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 2, 3], birthWeightKg: 3.3, weight: 1,
    religions: { Christianity: 69, None: 24 },
  }),
  nation({
    id: 'es', name: 'Spain', demonym: 'Spanish', continent: 'Europe', currency: '€',
    cities: ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga', 'Bilbao', 'Granada', 'Palma', 'Pamplona', 'San Sebastián', 'Valladolid', 'A Coruña', 'Pontevedra', 'Rota'],
    names: 'spanish', wealth: 0.7, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: true, conscription: false,
    skinTones: [1, 1, 2, 2, 3, 4], birthWeightKg: 3.2, weight: 2,
    religions: { Christianity: 58, None: 38, Islam: 3 },
  }),
  nation({
    id: 'se', name: 'Sweden', demonym: 'Swedish', continent: 'Europe', currency: '$',
    cities: ['Stockholm', 'Gothenburg', 'Malmö', 'Halmstad', 'Uppsala', 'Västerås', 'Örebro', 'Linköping', 'Helsingborg', 'Jönköping', 'Norrköping', 'Lund', 'Umeå', 'Kiruna'],
    names: 'nordic', wealth: 0.9, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: true, conscription: true,
    skinTones: [1, 1, 1, 1, 2, 2, 3, 4], birthWeightKg: 3.5, weight: 2,
    religions: { Christianity: 55, None: 37, Islam: 7 },
  }),
  nation({
    id: 'ch', name: 'Switzerland', demonym: 'Swiss', continent: 'Europe', currency: '$',
    cities: ['Zurich', 'Geneva', 'Basel', 'Bern', 'Lausanne', 'Lucerne', 'Lugano', 'St. Gallen', 'Winterthur', 'Biel', 'Zug', 'Interlaken', 'Davos'],
    names: 'german', wealth: 1.15, drivingAge: 18, drinkingAge: 16,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 1, 1, 2, 3], birthWeightKg: 3.3, weight: 1,
    religions: { Christianity: 58, None: 33, Islam: 6 },
  }),
  nation({
    id: 'ua', name: 'Ukraine', demonym: 'Ukrainian', continent: 'Europe', currency: '$',
    cities: ['Kyiv', 'Kharkiv', 'Odesa', 'Dnipro', 'Donetsk', 'Lviv', 'Zaporizhzhia', 'Kryvyi Rih', 'Mykolaiv', 'Vinnytsia', 'Poltava', 'Chernihiv', 'Uzhhorod'],
    names: 'ukrainian', wealth: 0.25, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 1, 1, 2], birthWeightKg: 3.3, weight: 1.5,
    religions: { Christianity: 85, None: 13 },
  }),
  nation({
    id: 'gb', name: 'United Kingdom', demonym: 'British', continent: 'Europe', currency: '£',
    cities: ['London', 'Manchester', 'Birmingham', 'Liverpool', 'Leeds', 'Glasgow', 'Edinburgh', 'Bristol', 'Cardiff', 'Belfast', 'Newcastle', 'Sheffield', 'Nottingham', 'Brighton', 'Oxford'],
    names: 'british', wealth: 0.9, drivingAge: 17, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: true, conscription: false,
    skinTones: [1, 1, 1, 1, 1, 2, 3, 4, 5], birthWeightKg: 3.4, weight: 5,
    religions: { Christianity: 46, None: 37, Islam: 7, Hinduism: 2, Sikhism: 1, Judaism: 1, Buddhism: 1 },
  }),

  // ----- Africa -----
  nation({
    id: 'dz', name: 'Algeria', demonym: 'Algerian', continent: 'Africa', currency: '$',
    cities: ['Algiers', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Batna', 'Sétif', 'Tlemcen', 'Béjaïa', 'Biskra', 'Tizi Ouzou', 'Ghardaïa'],
    names: 'maghrebi', wealth: 0.3, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: true,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.3, weight: 1.5,
    religions: { Islam: 97, None: 2, Christianity: 1 },
  }),
  nation({
    id: 'ao', name: 'Angola', demonym: 'Angolan', continent: 'Africa', currency: '$',
    cities: ['Luanda', 'Benguela', 'Lubango', 'Huambo', 'Lobito', 'Cabinda', 'Malanje', 'Namibe', 'Saurimo', 'Kuito', 'Uíge', 'Soyo'],
    names: 'angolan', wealth: 0.2, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [4, 5, 5, 5], birthWeightKg: 3.0, weight: 1,
    religions: { Christianity: 90, None: 10 },
  }),
  nation({
    id: 'dj', name: 'Djibouti', demonym: 'Djiboutian', continent: 'Africa', currency: '$',
    cities: ['Djibouti City', 'Ali Sabieh', 'Tadjourah', 'Obock', 'Dikhil', 'Arta', 'Holhol', 'Dorra', 'Balho', 'Loyada', 'Randa', 'As Eyla'],
    names: 'somali', wealth: 0.2, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [4, 4, 5, 5], birthWeightKg: 3.0, weight: 0.5,
    religions: { Islam: 94, Christianity: 6 },
  }),
  nation({
    id: 'cd', name: 'DR Congo', demonym: 'Congolese', continent: 'Africa', currency: '$',
    cities: ['Kinshasa', 'Lubumbashi', 'Mbuji-Mayi', 'Kisangani', 'Kananga', 'Bukavu', 'Goma', 'Kolwezi', 'Likasi', 'Tshikapa', 'Matadi', 'Mbandaka', 'Kikwit'],
    names: 'congolese', wealth: 0.13, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [4, 5, 5, 5], birthWeightKg: 3.0, weight: 1.5,
    religions: { Christianity: 92, Islam: 2, None: 3 },
  }),
  nation({
    id: 'eg', name: 'Egypt', demonym: 'Egyptian', continent: 'Africa', currency: '$',
    cities: ['Cairo', 'Alexandria', 'Giza', 'Luxor', 'Aswan', 'Port Said', 'Suez', 'Sharm El Sheikh', 'Hurghada', 'Mansoura', 'Tanta', 'Ismailia', 'Faiyum'],
    names: 'egyptian', wealth: 0.25, drivingAge: 18, drinkingAge: 21,
    freeUniversity: true, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: true,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 2,
    religions: { Islam: 90, Christianity: 10 },
  }),
  nation({
    id: 'et', name: 'Ethiopia', demonym: 'Ethiopian', continent: 'Africa', currency: '$',
    cities: ['Addis Ababa', 'Dire Dawa', 'Mekelle', 'Gondar', 'Bahir Dar', 'Hawassa', 'Adama', 'Jimma', 'Dessie', 'Harar', 'Jijiga', 'Lalibela', 'Axum'],
    names: 'ethiopian', wealth: 0.14, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [4, 4, 5, 5], birthWeightKg: 2.9, weight: 2,
    religions: { Christianity: 67, Islam: 31 },
  }),
  nation({
    id: 'ke', name: 'Kenya', demonym: 'Kenyan', continent: 'Africa', currency: '$',
    cities: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi', 'Kitale', 'Garissa', 'Nyeri', 'Machakos', 'Lamu', 'Naivasha'],
    names: 'east_african', wealth: 0.2, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [4, 5, 5, 5], birthWeightKg: 3.1, weight: 1.5,
    religions: { Christianity: 85, Islam: 11, None: 2 },
  }),
  nation({
    id: 'ma', name: 'Morocco', demonym: 'Moroccan', continent: 'Africa', currency: '$',
    cities: ['Casablanca', 'Marrakesh', 'Fez', 'Tangier', 'Rabat', 'Agadir', 'Meknes', 'Oujda', 'Kenitra', 'Tetouan', 'Essaouira', 'Chefchaouen'],
    names: 'maghrebi', wealth: 0.22, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: false, deathPenalty: true, monarchy: true, conscription: true,
    skinTones: [2, 2, 3, 3, 4], birthWeightKg: 3.2, weight: 1.5,
    religions: { Islam: 98, Judaism: 1 },
  }),
  nation({
    id: 'ng', name: 'Nigeria', demonym: 'Nigerian', continent: 'Africa', currency: '$',
    cities: ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt', 'Benin City', 'Kaduna', 'Enugu', 'Jos', 'Abeokuta', 'Onitsha', 'Calabar', 'Owerri', 'Maiduguri'],
    names: 'west_african', wealth: 0.2, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [4, 5, 5, 5], birthWeightKg: 3.1, weight: 2.5,
    religions: { Islam: 50, Christianity: 48 },
  }),
  nation({
    id: 'za', name: 'South Africa', demonym: 'South African', continent: 'Africa', currency: '$',
    cities: ['Johannesburg', 'Cape Town', 'Durban', 'Soweto', 'Pretoria', 'Gqeberha', 'Bloemfontein', 'East London', 'Polokwane', 'Mbombela', 'Kimberley', 'Pietermaritzburg', 'Stellenbosch'],
    names: 'southern_african', wealth: 0.3, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 2, 3, 4, 4, 5, 5, 5], birthWeightKg: 3.0, weight: 2,
    religions: { Christianity: 80, None: 15, Islam: 2, Hinduism: 1 },
  }),
  nation({
    id: 'tn', name: 'Tunisia', demonym: 'Tunisian', continent: 'Africa', currency: '$',
    cities: ['Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte', 'Gabès', 'Ariana', 'Gafsa', 'Monastir', 'Nabeul', 'Hammamet', 'Djerba'],
    names: 'maghrebi', wealth: 0.25, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: true,
    skinTones: [2, 2, 3, 3], birthWeightKg: 3.2, weight: 1,
    religions: { Islam: 98, None: 2 },
  }),
  nation({
    id: 'ug', name: 'Uganda', demonym: 'Ugandan', continent: 'Africa', currency: '$',
    cities: ['Kampala', 'Gulu', 'Lira', 'Entebbe', 'Jinja', 'Mbarara', 'Mbale', 'Masaka', 'Arua', 'Fort Portal', 'Kasese', 'Soroti'],
    names: 'east_african', wealth: 0.15, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [4, 5, 5, 5], birthWeightKg: 3.0, weight: 1,
    religions: { Christianity: 84, Islam: 14 },
  }),
  nation({
    id: 'zw', name: 'Zimbabwe', demonym: 'Zimbabwean', continent: 'Africa', currency: '$',
    cities: ['Harare', 'Bulawayo', 'Chitungwiza', 'Mutare', 'Gweru', 'Kwekwe', 'Kadoma', 'Masvingo', 'Victoria Falls', 'Marondera', 'Chinhoyi', 'Bindura'],
    names: 'zimbabwean', wealth: 0.15, drivingAge: 16, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [4, 5, 5, 5], birthWeightKg: 3.0, weight: 1,
    religions: { Christianity: 85, None: 11, Islam: 1 },
  }),

  // ----- Middle East -----
  nation({
    id: 'ge', name: 'Georgia', demonym: 'Georgian', continent: 'Middle East', currency: '$',
    cities: ['Tbilisi', 'Batumi', 'Kutaisi', 'Rustavi', 'Zugdidi', 'Gori', 'Poti', 'Telavi', 'Mtskheta', 'Borjomi', 'Sighnaghi', 'Kobuleti'],
    names: 'georgian', wealth: 0.35, drivingAge: 17, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 2, 2], birthWeightKg: 3.3, weight: 1,
    religions: { Christianity: 86, Islam: 11, None: 2 },
  }),
  nation({
    id: 'ir', name: 'Iran', demonym: 'Iranian', continent: 'Middle East', currency: '$',
    cities: ['Tehran', 'Mashhad', 'Isfahan', 'Karaj', 'Shiraz', 'Tabriz', 'Qom', 'Ahvaz', 'Kermanshah', 'Rasht', 'Yazd', 'Kerman', 'Hamadan'],
    names: 'persian', wealth: 0.3, drivingAge: 18, drinkingAge: 21,
    freeUniversity: true, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: true,
    skinTones: [1, 2, 2, 3, 3], birthWeightKg: 3.2, weight: 2,
    religions: { Islam: 95, None: 3, Christianity: 1 },
  }),
  nation({
    id: 'iq', name: 'Iraq', demonym: 'Iraqi', continent: 'Middle East', currency: '$',
    cities: ['Baghdad', 'Erbil', 'Fallujah', 'Mosul', 'Tikrit', 'Basra', 'Kirkuk', 'Najaf', 'Karbala', 'Sulaymaniyah', 'Duhok', 'Ramadi', 'Nasiriyah'],
    names: 'arabic', wealth: 0.22, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 1.5,
    religions: { Islam: 97, Christianity: 1, None: 1 },
  }),
  nation({
    id: 'il', name: 'Israel', demonym: 'Israeli', continent: 'Middle East', currency: '$',
    cities: ['Jerusalem', 'Tel Aviv', 'Haifa', 'Rishon LeZion', 'Petah Tikva', 'Ashdod', 'Netanya', 'Beersheba', 'Holon', 'Ramat Gan', 'Eilat', 'Nazareth', 'Herzliya'],
    names: 'hebrew', wealth: 0.85, drivingAge: 17, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 1, 2, 2, 3, 4], birthWeightKg: 3.2, weight: 1.5,
    religions: { Judaism: 74, Islam: 18, None: 5, Christianity: 2 },
  }),
  nation({
    id: 'jo', name: 'Jordan', demonym: 'Jordanian', continent: 'Middle East', currency: '$',
    cities: ['Amman', 'Zarqa', 'Irbid', 'Aqaba', 'Salt', 'Madaba', 'Jerash', 'Mafraq', 'Karak', 'Russeifa', 'Ajloun', 'Tafilah'],
    names: 'arabic', wealth: 0.25, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: true, conscription: true,
    skinTones: [2, 2, 3, 3], birthWeightKg: 3.1, weight: 1,
    religions: { Islam: 95, Christianity: 4 },
  }),
  nation({
    id: 'kw', name: 'Kuwait', demonym: 'Kuwaiti', continent: 'Middle East', currency: '$',
    cities: ['Kuwait City', 'Al Ahmadi', 'Hawalli', 'Salmiya', 'Al Jahra', 'Farwaniya', 'Fahaheel', 'Mangaf', 'Sabah Al Salem', 'Mubarak Al-Kabeer', 'Al Wafrah', 'Jabriya'],
    names: 'gulf_arabic', wealth: 0.9, drivingAge: 18, drinkingAge: 21,
    freeUniversity: true, universalHealthcare: true, deathPenalty: true, monarchy: true, conscription: true,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 0.5,
    religions: { Islam: 90, Christianity: 6, Hinduism: 3 },
  }),
  nation({
    id: 'lb', name: 'Lebanon', demonym: 'Lebanese', continent: 'Middle East', currency: '$',
    cities: ['Beirut', 'Tripoli', 'Sidon', 'Tyre', 'Jounieh', 'Zahlé', 'Byblos', 'Baalbek', 'Nabatieh', 'Aley', 'Batroun', 'Broummana'],
    names: 'arabic', wealth: 0.28, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [1, 2, 2, 3], birthWeightKg: 3.2, weight: 1,
    religions: { Islam: 60, Christianity: 34, None: 2 },
  }),
  nation({
    id: 'qa', name: 'Qatar', demonym: 'Qatari', continent: 'Middle East', currency: '$',
    cities: ['Doha', 'Al Rayyan', 'Al Wakrah', 'Al Khor', 'Lusail', 'Umm Salal', 'Mesaieed', 'Dukhan', 'Al Shamal', 'Al Daayen', 'Al Ruwais', 'Al Shahaniya'],
    names: 'gulf_arabic', wealth: 1.1, drivingAge: 18, drinkingAge: 21,
    freeUniversity: true, universalHealthcare: true, deathPenalty: true, monarchy: true, conscription: true,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 0.5,
    religions: { Islam: 88, Christianity: 8, Hinduism: 4 },
  }),
  nation({
    id: 'sa', name: 'Saudi Arabia', demonym: 'Saudi', continent: 'Middle East', currency: '$',
    cities: ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Khobar', 'Dhahran', 'Taif', 'Tabuk', 'Abha', 'Buraidah', 'Hail', 'Jizan', 'AlUla'],
    names: 'gulf_arabic', wealth: 0.7, drivingAge: 18, drinkingAge: 21,
    freeUniversity: true, universalHealthcare: true, deathPenalty: true, monarchy: true, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 1.5,
    religions: { Islam: 98, Christianity: 2 },
  }),
  nation({
    id: 'sy', name: 'Syria', demonym: 'Syrian', continent: 'Middle East', currency: '$',
    cities: ['Damascus', 'Aleppo', 'Homs', 'Latakia', 'Hama', 'Tartus', 'Deir ez-Zor', 'Raqqa', 'Idlib', 'Daraa', 'Al-Hasakah', 'Qamishli', 'Palmyra'],
    names: 'arabic', wealth: 0.15, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [1, 2, 2, 3], birthWeightKg: 3.1, weight: 1,
    religions: { Islam: 88, Christianity: 10 },
  }),
  nation({
    id: 'tr', name: 'Turkey', demonym: 'Turkish', continent: 'Middle East', currency: '$',
    cities: ['Istanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep', 'Kayseri', 'Trabzon', 'Eskişehir', 'Bodrum', 'Diyarbakır'],
    names: 'turkish', wealth: 0.45, drivingAge: 18, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 2, 2, 3], birthWeightKg: 3.2, weight: 2,
    religions: { Islam: 92, None: 6, Christianity: 1 },
  }),
  nation({
    id: 'ae', name: 'United Arab Emirates', demonym: 'Emirati', continent: 'Middle East', currency: '$',
    cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Khor Fakkan', 'Kalba', 'Dibba', 'Ruwais'],
    names: 'gulf_arabic', wealth: 0.95, drivingAge: 18, drinkingAge: 21,
    freeUniversity: true, universalHealthcare: true, deathPenalty: true, monarchy: true, conscription: true,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 1,
    religions: { Islam: 85, Christianity: 8, Hinduism: 5, Buddhism: 2 },
  }),

  // ----- Asia -----
  nation({
    id: 'af', name: 'Afghanistan', demonym: 'Afghan', continent: 'Asia', currency: '$',
    cities: ['Kabul', 'Kandahar', 'Jalalabad', 'Herat', 'Mazar-i-Sharif', 'Kunduz', 'Ghazni', 'Lashkar Gah', 'Bamyan', 'Khost', 'Taloqan', 'Pul-e-Khumri', 'Faizabad'],
    names: 'afghan', wealth: 0.12, drivingAge: 18, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [2, 2, 3, 3], birthWeightKg: 2.9, weight: 1,
    religions: { Islam: 100 },
  }),
  nation({
    id: 'bd', name: 'Bangladesh', demonym: 'Bangladeshi', continent: 'Asia', currency: '$',
    cities: ['Dhaka', 'Chittagong', 'Gazipur', 'Khulna', 'Narayanganj', 'Sylhet', 'Rajshahi', 'Comilla', 'Barisal', 'Rangpur', 'Mymensingh', 'Bogra', 'Jessore'],
    names: 'bengali', wealth: 0.2, drivingAge: 18, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [3, 4, 4, 5], birthWeightKg: 2.8, weight: 2,
    religions: { Islam: 91, Hinduism: 8, Buddhism: 1 },
  }),
  nation({
    id: 'cn', name: 'China', demonym: 'Chinese', continent: 'Asia', currency: '$',
    cities: ['Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Wuhan', 'Chengdu', 'Chongqing', 'Tianjin', 'Hangzhou', 'Nanjing', 'Suzhou', 'Harbin', 'Qingdao', 'Kunming', 'Xiamen'],
    names: 'chinese', wealth: 0.4, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [1, 1, 2], birthWeightKg: 3.3, weight: 3,
    religions: { None: 52, 'Folk Religion': 20, Buddhism: 18, Christianity: 5, Taoism: 2, Islam: 2 },
  }),
  nation({
    id: 'hk', name: 'Hong Kong', demonym: 'Hongkonger', continent: 'Asia', currency: '$',
    cities: ['Hong Kong', 'Kowloon', 'Tsuen Wan', 'Sha Tin', 'Tuen Mun', 'Yuen Long', 'Tai Po', 'Tseung Kwan O', 'Mong Kok', 'Causeway Bay', 'Lantau', 'Sai Kung'],
    names: 'cantonese', wealth: 0.9, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 2], birthWeightKg: 3.1, weight: 1,
    religions: { None: 55, Buddhism: 15, Taoism: 13, Christianity: 12 },
  }),
  nation({
    id: 'in', name: 'India', demonym: 'Indian', continent: 'Asia', currency: '$',
    cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Jaipur', 'Srinagar', 'Pune', 'Ahmedabad', 'Lucknow', 'Surat', 'Kochi', 'Varanasi', 'Chandigarh'],
    names: 'south_asian', wealth: 0.25, drivingAge: 18, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [3, 3, 4, 4, 5], birthWeightKg: 2.8, weight: 4,
    religions: { Hinduism: 79, Islam: 14, Christianity: 2, Sikhism: 2, Buddhism: 1, Jainism: 1 },
  }),
  nation({
    id: 'id', name: 'Indonesia', demonym: 'Indonesian', continent: 'Asia', currency: '$',
    cities: ['Jakarta', 'Denpasar', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Yogyakarta', 'Malang', 'Batam', 'Manado', 'Balikpapan'],
    names: 'indonesian', wealth: 0.28, drivingAge: 17, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 3.1, weight: 2,
    religions: { Islam: 87, Christianity: 10, Hinduism: 2, Buddhism: 1 },
  }),
  nation({
    id: 'jp', name: 'Japan', demonym: 'Japanese', continent: 'Asia', currency: '$',
    cities: ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Sapporo', 'Kobe', 'Kyoto', 'Fukuoka', 'Hiroshima', 'Sendai', 'Kawasaki', 'Nara', 'Naha', 'Kanazawa'],
    names: 'japanese', wealth: 0.85, drivingAge: 18, drinkingAge: 20,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: true, conscription: false,
    skinTones: [1, 1, 2], birthWeightKg: 3.0, weight: 3,
    religions: { None: 52, Buddhism: 24, Shinto: 22, Christianity: 2 },
  }),
  nation({
    id: 'kz', name: 'Kazakhstan', demonym: 'Kazakh', continent: 'Asia', currency: '$',
    cities: ['Almaty', 'Astana', 'Shymkent', 'Karaganda', 'Aktobe', 'Taraz', 'Pavlodar', 'Oskemen', 'Semey', 'Atyrau', 'Kostanay', 'Aktau'],
    names: 'kazakh', wealth: 0.4, drivingAge: 18, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 2, 2, 3], birthWeightKg: 3.3, weight: 1,
    religions: { Islam: 69, Christianity: 17, None: 12 },
  }),
  nation({
    id: 'my', name: 'Malaysia', demonym: 'Malaysian', continent: 'Asia', currency: '$',
    cities: ['Kuala Lumpur', 'George Town', 'Johor Bahru', 'Ipoh', 'Kuching', 'Kota Kinabalu', 'Shah Alam', 'Malacca City', 'Petaling Jaya', 'Kuantan', 'Kota Bharu', 'Alor Setar', 'Putrajaya'],
    names: 'malay', wealth: 0.5, drivingAge: 17, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: true, conscription: false,
    skinTones: [2, 2, 3, 3, 4], birthWeightKg: 3.1, weight: 1.5,
    religions: { Islam: 64, Buddhism: 19, Christianity: 9, Hinduism: 6 },
  }),
  nation({
    id: 'mn', name: 'Mongolia', demonym: 'Mongolian', continent: 'Asia', currency: '$',
    cities: ['Ulaanbaatar', 'Erdenet', 'Darkhan', 'Choibalsan', 'Mörön', 'Khovd', 'Ölgii', 'Bayankhongor', 'Arvaikheer', 'Sükhbaatar', 'Dalanzadgad', 'Kharkhorin'],
    names: 'mongolian', wealth: 0.25, drivingAge: 18, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: true,
    skinTones: [1, 2, 2, 3], birthWeightKg: 3.4, weight: 1,
    religions: { Buddhism: 52, None: 39, Islam: 3, Shamanism: 3, Christianity: 1 },
  }),
  nation({
    id: 'np', name: 'Nepal', demonym: 'Nepali', continent: 'Asia', currency: '$',
    cities: ['Kathmandu', 'Pokhara', 'Lalitpur', 'Bharatpur', 'Biratnagar', 'Birgunj', 'Dharan', 'Bhaktapur', 'Butwal', 'Hetauda', 'Janakpur', 'Nepalgunj', 'Lumbini'],
    names: 'nepali', wealth: 0.15, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 2.9, weight: 1,
    religions: { Hinduism: 81, Buddhism: 9, Islam: 5, Christianity: 2 },
  }),
  nation({
    id: 'pk', name: 'Pakistan', demonym: 'Pakistani', continent: 'Asia', currency: '$',
    cities: ['Karachi', 'Lahore', 'Islamabad', 'Peshawar', 'Abbottabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Hyderabad', 'Quetta', 'Gujranwala', 'Sialkot', 'Sukkur'],
    names: 'pakistani', wealth: 0.18, drivingAge: 18, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: false, deathPenalty: true, monarchy: false, conscription: false,
    skinTones: [2, 3, 3, 4], birthWeightKg: 2.8, weight: 2.5,
    religions: { Islam: 96, Hinduism: 2, Christianity: 2 },
  }),
  nation({
    id: 'ph', name: 'Philippines', demonym: 'Filipino', continent: 'Asia', currency: '$',
    cities: ['Manila', 'Quezon City', 'Cebu City', 'Davao City', 'Makati', 'Taguig', 'Pasig', 'Caloocan', 'Zamboanga City', 'Baguio', 'Iloilo City', 'Cagayan de Oro', 'Bacolod'],
    names: 'filipino', wealth: 0.25, drivingAge: 17, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [2, 2, 3, 3, 4], birthWeightKg: 3.0, weight: 3,
    religions: { Christianity: 90, Islam: 6, None: 2 },
  }),
  nation({
    id: 'sg', name: 'Singapore', demonym: 'Singaporean', continent: 'Asia', currency: '$',
    cities: ['Singapore', 'Jurong East', 'Woodlands', 'Tampines', 'Ang Mo Kio', 'Bedok', 'Toa Payoh', 'Punggol', 'Sengkang', 'Bukit Timah', 'Clementi', 'Yishun', 'Orchard'],
    names: 'singaporean', wealth: 1.1, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: true,
    skinTones: [1, 1, 2, 2, 3, 4], birthWeightKg: 3.1, weight: 1,
    religions: { Buddhism: 31, None: 20, Christianity: 19, Islam: 16, Taoism: 9, Hinduism: 5 },
  }),
  nation({
    id: 'kr', name: 'South Korea', demonym: 'South Korean', continent: 'Asia', currency: '$',
    cities: ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Gangnam', 'Daejeon', 'Gwangju', 'Ulsan', 'Suwon', 'Changwon', 'Jeonju', 'Jeju City', 'Gyeongju'],
    names: 'korean', wealth: 0.8, drivingAge: 18, drinkingAge: 19,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: true,
    skinTones: [1, 1, 2], birthWeightKg: 3.2, weight: 2,
    religions: { None: 51, Christianity: 31, Buddhism: 17 },
  }),
  nation({
    id: 'tw', name: 'Taiwan', demonym: 'Taiwanese', continent: 'Asia', currency: '$',
    cities: ['Taipei', 'New Taipei', 'Kaohsiung', 'Taichung', 'Tainan', 'Taoyuan', 'Hsinchu', 'Keelung', 'Chiayi', 'Hualien', 'Taitung', 'Yilan'],
    names: 'taiwanese', wealth: 0.75, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: true,
    skinTones: [1, 1, 2], birthWeightKg: 3.1, weight: 1,
    religions: { Buddhism: 35, Taoism: 30, None: 20, Christianity: 5 },
  }),
  nation({
    id: 'th', name: 'Thailand', demonym: 'Thai', continent: 'Asia', currency: '$',
    cities: ['Bangkok', 'Phuket', 'Chiang Mai', 'Pattaya', 'Nonthaburi', 'Hat Yai', 'Nakhon Ratchasima', 'Udon Thani', 'Khon Kaen', 'Chiang Rai', 'Ayutthaya', 'Krabi', 'Hua Hin'],
    names: 'thai', wealth: 0.35, drivingAge: 18, drinkingAge: 20,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: true, conscription: true,
    skinTones: [2, 2, 3, 3], birthWeightKg: 3.0, weight: 2,
    religions: { Buddhism: 93, Islam: 5, Christianity: 1 },
  }),
  nation({
    id: 'vn', name: 'Vietnam', demonym: 'Vietnamese', continent: 'Asia', currency: '$',
    cities: ['Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Haiphong', 'Can Tho', 'Bien Hoa', 'Hue', 'Nha Trang', 'Hoi An', 'Vung Tau', 'Da Lat', 'Quy Nhon'],
    names: 'vietnamese', wealth: 0.25, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: true, monarchy: false, conscription: true,
    skinTones: [1, 2, 2, 3], birthWeightKg: 3.1, weight: 2,
    religions: { None: 60, Buddhism: 18, 'Folk Religion': 12, Christianity: 8 },
  }),

  // ----- Oceania -----
  nation({
    id: 'au', name: 'Australia', demonym: 'Australian', continent: 'Oceania', currency: '$',
    cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra', 'Newcastle', 'Hobart', 'Townsville', 'Wollongong', 'Darwin', 'Cairns', 'Geelong'],
    names: 'british', wealth: 0.95, drivingAge: 17, drinkingAge: 18,
    freeUniversity: true, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 1, 2, 2, 3, 4, 5], birthWeightKg: 3.4, weight: 4,
    religions: { Christianity: 44, None: 39, Islam: 3, Hinduism: 3, Buddhism: 2 },
  }),
  nation({
    id: 'nz', name: 'New Zealand', demonym: 'New Zealander', continent: 'Oceania', currency: '$',
    cities: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga', 'Dunedin', 'Napier', 'Palmerston North', 'Nelson', 'Rotorua', 'Queenstown', 'New Plymouth', 'Invercargill'],
    names: 'british', wealth: 0.8, drivingAge: 16, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: true, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [1, 1, 1, 2, 2, 3, 3, 4], birthWeightKg: 3.4, weight: 2,
    religions: { None: 51, Christianity: 37, Hinduism: 3, Islam: 1, Buddhism: 1 },
  }),
  nation({
    id: 'pg', name: 'Papua New Guinea', demonym: 'Papua New Guinean', continent: 'Oceania', currency: '$',
    cities: ['Port Moresby', 'Lae', 'Wewak', 'Mount Hagen', 'Madang', 'Goroka', 'Kokopo', 'Popondetta', 'Arawa', 'Kimbe', 'Alotau', 'Kavieng'],
    names: 'melanesian', wealth: 0.15, drivingAge: 18, drinkingAge: 18,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [4, 5, 5, 5], birthWeightKg: 3.0, weight: 1,
    religions: { Christianity: 95, 'Folk Religion': 3 },
  }),
  nation({
    id: 'ws', name: 'Samoa', demonym: 'Samoan', continent: 'Oceania', currency: '$',
    cities: ['Apia', 'Vaitele', 'Faleula', 'Siusega', 'Malie', 'Fasitoo-Uta', 'Leauvaa', 'Salelologa', 'Afega', 'Vailele', 'Lufilufi', 'Asau'],
    names: 'polynesian', wealth: 0.22, drivingAge: 18, drinkingAge: 21,
    freeUniversity: false, universalHealthcare: false, deathPenalty: false, monarchy: false, conscription: false,
    skinTones: [3, 3, 4, 4], birthWeightKg: 3.5, weight: 0.5,
    religions: { Christianity: 98, None: 1 },
  }),
]

// ---------------------------------------------------------------------------
// Name pools

const VIETNAMESE: NamePool = {
  male: ['Minh', 'Anh', 'Huy', 'Khoa', 'Đức', 'Long', 'Nam', 'Phúc', 'Quang', 'Thành', 'Tuấn', 'Hùng', 'Dũng', 'Hải', 'Hiếu', 'Khang', 'Bảo', 'Đạt', 'Kiên', 'Lộc', 'Nhật', 'Phong', 'Quân', 'Sơn', 'Thắng', 'Trung', 'Vinh', 'Vũ', 'Tài', 'Hoàng'],
  female: ['Linh', 'Mai', 'Lan', 'Hương', 'Ngọc', 'Trang', 'Thảo', 'Hà', 'Hoa', 'Phương', 'Thủy', 'Hằng', 'Nhung', 'Vy', 'Trâm', 'Yến', 'Hạnh', 'Nhi', 'Quỳnh', 'Thư', 'Uyên', 'An', 'My', 'Châu', 'Diệp', 'Giang', 'Khánh', 'Loan', 'Tâm', 'Xuân'],
  last: ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Lâm', 'Trương', 'Mai', 'Đào', 'Cao', 'Tô', 'Trịnh', 'Lưu', 'Tạ', 'Hà', 'Châu', 'Quách', 'Thái'],
}

export const NAME_POOLS: Record<NameRegion, NamePool> = {
  anglo: {
    male: ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Steven', 'Andrew', 'Joshua', 'Ethan', 'Noah', 'Liam', 'Mason', 'Logan', 'Lucas', 'Oliver', 'Jack', 'Henry', 'Owen', 'Wyatt', 'Caleb', 'Ryan', 'Nathan', 'Tyler', 'Brandon', 'Kevin', 'Justin', 'Austin', 'Dylan', 'Hunter', 'Connor', 'Elijah'],
    female: ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Emily', 'Emma', 'Olivia', 'Ava', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia', 'Harper', 'Abigail', 'Madison', 'Chloe', 'Grace', 'Lily', 'Hannah', 'Ashley', 'Brittany', 'Samantha', 'Rachel', 'Megan', 'Lauren', 'Taylor', 'Hailey', 'Zoe', 'Natalie', 'Ella', 'Avery', 'Scarlett', 'Victoria'],
    last: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Martin', 'Jackson', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Hill', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards'],
  },
  british: {
    male: ['Oliver', 'George', 'Harry', 'Jack', 'Charlie', 'Thomas', 'Oscar', 'William', 'James', 'Alfie', 'Freddie', 'Archie', 'Theo', 'Henry', 'Leo', 'Arthur', 'Joshua', 'Edward', 'Samuel', 'Daniel', 'Callum', 'Liam', 'Lewis', 'Jamie', 'Ben', 'Rhys', 'Owen', 'Toby', 'Reuben', 'Finley'],
    female: ['Olivia', 'Amelia', 'Isla', 'Ava', 'Lily', 'Freya', 'Poppy', 'Sophie', 'Evie', 'Grace', 'Emily', 'Isabella', 'Ella', 'Florence', 'Charlotte', 'Jessica', 'Holly', 'Megan', 'Chloe', 'Ruby', 'Harriet', 'Imogen', 'Rosie', 'Daisy', 'Phoebe', 'Eleanor', 'Lucy', 'Katie', 'Bethany', 'Millie'],
    last: ['Smith', 'Jones', 'Williams', 'Taylor', 'Brown', 'Davies', 'Evans', 'Wilson', 'Thomas', 'Roberts', 'Johnson', 'Wright', 'Walker', 'Robinson', 'Thompson', 'White', 'Hughes', 'Edwards', 'Green', 'Hall', 'Wood', 'Harris', 'Lewis', 'Martin', 'Jackson', 'Clarke', 'Turner', 'Hill', 'Scott', 'Cooper', 'Morris', 'Ward', 'Moore', 'King', 'Watson', 'Baker', 'Harrison', 'Morgan', 'Patel', 'Campbell'],
  },
  irish: {
    male: ['Jack', 'Seán', 'Conor', 'Darragh', 'Cian', 'Oisín', 'Tadhg', 'Fionn', 'Ruairí', 'Liam', 'Patrick', 'Michael', 'Ciarán', 'Eoin', 'Niall', 'Diarmuid', 'Colm', 'Dónal', 'Pádraig', 'Cathal', 'Shane', 'Declan', 'Kevin', 'Aidan', 'Rory', 'Cillian', 'Finn', 'Senan', 'Daithí', 'Brendan'],
    female: ['Saoirse', 'Aoife', 'Niamh', 'Ciara', 'Siobhán', 'Róisín', 'Caoimhe', 'Clodagh', 'Orla', 'Sinéad', 'Gráinne', 'Áine', 'Éabha', 'Fiadh', 'Méabh', 'Emer', 'Sorcha', 'Deirdre', 'Mairéad', 'Bríd', 'Eimear', 'Aisling', 'Clíona', 'Nuala', 'Muireann', 'Ailbhe', 'Síle', 'Úna', 'Grace', 'Emma'],
    last: ['Murphy', 'Kelly', "O'Sullivan", 'Walsh', "O'Brien", 'Byrne', 'Ryan', "O'Connor", "O'Neill", "O'Reilly", 'Doyle', 'McCarthy', 'Gallagher', 'Doherty', 'Kennedy', 'Lynch', 'Murray', 'Quinn', 'Moore', 'McLoughlin', 'Carroll', 'Connolly', 'Daly', 'Dunne', 'Brennan', 'Burke', 'Collins', 'Fitzgerald', 'Kavanagh', 'Nolan'],
  },
  caribbean: {
    male: ['Andre', 'Damian', 'Omar', 'Ricardo', 'Kemar', 'Jermaine', 'Shane', 'Dwayne', 'Andrew', 'Marlon', 'Kirk', 'Rohan', 'Garfield', 'Delroy', 'Winston', 'Leroy', 'Devon', 'Tyrone', 'Jamal', 'Javon', 'Romario', 'Akeem', 'Shamar', 'Tajay', 'Kevon', 'Rajiv', 'Neville', 'Clive', 'Courtney', 'Everton'],
    female: ['Shanice', 'Kimoya', 'Tanisha', 'Keisha', 'Shelly-Ann', 'Simone', 'Natalie', 'Kerry-Ann', 'Monique', 'Tamara', 'Sasha', 'Alicia', 'Jody-Ann', 'Shantae', 'Chevelle', 'Yanique', 'Tashana', 'Dionne', 'Marcia', 'Beverley', 'Sherine', 'Donna', 'Stacy-Ann', 'Tiffany', 'Kadeisha', 'Annika', 'Paulette', 'Nadine', 'Petal', 'Nickeisha'],
    last: ['Brown', 'Williams', 'Campbell', 'Smith', 'Thompson', 'Johnson', 'Clarke', 'Reid', 'Grant', 'McKenzie', 'Gordon', 'Morgan', 'Robinson', 'Stewart', 'Francis', 'Wright', 'Henry', 'Walker', 'Bailey', 'Edwards', 'Gayle', 'Fraser', 'Ferguson', 'Knowles', 'Rolle', 'Pinder', 'Persaud', 'Ramsaran', 'Young', 'Powell'],
  },
  hispanic: {
    male: ['José', 'Juan', 'Luis', 'Carlos', 'Jorge', 'Miguel', 'Alejandro', 'Diego', 'Santiago', 'Mateo', 'Javier', 'Fernando', 'Ricardo', 'Andrés', 'Pablo', 'Rafael', 'Emilio', 'Sebastián', 'Gabriel', 'Antonio', 'Francisco', 'Manuel', 'Eduardo', 'Óscar', 'Héctor', 'Raúl', 'Joaquín', 'Felipe', 'Tomás', 'Julián'],
    female: ['María', 'Guadalupe', 'Sofía', 'Valentina', 'Camila', 'Isabella', 'Lucía', 'Ximena', 'Daniela', 'Fernanda', 'Gabriela', 'Ana', 'Paola', 'Andrea', 'Carmen', 'Rosa', 'Elena', 'Mariana', 'Renata', 'Regina', 'Valeria', 'Catalina', 'Alejandra', 'Natalia', 'Martina', 'Luciana', 'Victoria', 'Adriana', 'Verónica', 'Paula'],
    last: ['García', 'Hernández', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Morales', 'Vázquez', 'Reyes', 'Jiménez', 'Torres', 'Díaz', 'Gutiérrez', 'Ruiz', 'Mendoza', 'Aguilar', 'Ortiz', 'Castillo', 'Romero', 'Herrera', 'Medina', 'Vargas', 'Castro', 'Rojas'],
  },
  spanish: {
    male: ['Hugo', 'Martín', 'Lucas', 'Mateo', 'Leo', 'Daniel', 'Alejandro', 'Pablo', 'Manuel', 'Álvaro', 'Adrián', 'David', 'Mario', 'Diego', 'Javier', 'Sergio', 'Marcos', 'Jorge', 'Iker', 'Unai', 'Jordi', 'Pau', 'Marc', 'Raúl', 'Rubén', 'Íñigo', 'Gonzalo', 'Nicolás', 'Víctor', 'Carlos'],
    female: ['Lucía', 'Sofía', 'Martina', 'María', 'Julia', 'Paula', 'Valeria', 'Emma', 'Daniela', 'Carla', 'Alba', 'Noa', 'Olivia', 'Sara', 'Carmen', 'Laura', 'Marta', 'Elena', 'Irene', 'Nerea', 'Ainhoa', 'Claudia', 'Cristina', 'Montserrat', 'Pilar', 'Rocío', 'Inés', 'Aitana', 'Lola', 'Núria'],
    last: ['García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Serrano', 'Blanco', 'Molina', 'Ortega', 'Delgado', 'Castro', 'Rubio', 'Iglesias', 'Sanz', 'Ferrer', 'Puig', 'Vidal'],
  },
  portuguese: {
    male: ['João', 'Pedro', 'Lucas', 'Gabriel', 'Rafael', 'Miguel', 'Arthur', 'Davi', 'Bernardo', 'Heitor', 'Matheus', 'Guilherme', 'Gustavo', 'Felipe', 'Thiago', 'Bruno', 'Rodrigo', 'Diogo', 'Tiago', 'Afonso', 'Duarte', 'Francisco', 'Tomás', 'Rui', 'Vítor', 'Henrique', 'Leonardo', 'Caio', 'Enzo', 'Paulo'],
    female: ['Ana', 'Beatriz', 'Mariana', 'Júlia', 'Larissa', 'Alice', 'Sofia', 'Laura', 'Helena', 'Valentina', 'Manuela', 'Isabela', 'Leonor', 'Matilde', 'Inês', 'Carolina', 'Margarida', 'Gabriela', 'Fernanda', 'Camila', 'Letícia', 'Amanda', 'Bianca', 'Luana', 'Rafaela', 'Joana', 'Rita', 'Francisca', 'Lívia', 'Yasmin'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Ferreira', 'Almeida', 'Carvalho', 'Lima', 'Gomes', 'Ribeiro', 'Martins', 'Araújo', 'Barbosa', 'Rocha', 'Alves', 'Fernandes', 'Lopes', 'Sousa', 'Mendes', 'Nascimento', 'Cardoso', 'Teixeira', 'Moreira', 'Correia', 'Pinto', 'Cavalcanti', 'Monteiro'],
  },
  french: {
    male: ['Lucas', 'Hugo', 'Louis', 'Gabriel', 'Arthur', 'Jules', 'Léo', 'Raphaël', 'Adam', 'Nathan', 'Thomas', 'Mathis', 'Antoine', 'Pierre', 'Julien', 'Nicolas', 'Maxime', 'Baptiste', 'Théo', 'Clément', 'Paul', 'Étienne', 'Guillaume', 'Romain', 'Alexandre', 'Benoît', 'Mathéo', 'Victor', 'Noé', 'Sacha'],
    female: ['Emma', 'Jade', 'Louise', 'Alice', 'Chloé', 'Lina', 'Léa', 'Manon', 'Camille', 'Inès', 'Sarah', 'Juliette', 'Margaux', 'Clara', 'Zoé', 'Élise', 'Amélie', 'Céline', 'Pauline', 'Mathilde', 'Anaïs', 'Margot', 'Lucie', 'Océane', 'Charlotte', 'Élodie', 'Rose', 'Anna', 'Romane', 'Aurélie'],
    last: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Girard', 'Bonnet', 'Dupont', 'Lambert', 'Fontaine', 'Rousseau', 'Blanc', 'Guérin', 'Faure', 'Mercier'],
  },
  haitian: {
    male: ['Jean', 'Pierre', 'Joseph', 'Louis', 'Jacques', 'Wilson', 'Frantz', 'Jean-Claude', 'Emmanuel', 'Ricardo', 'Stevenson', 'Wilner', 'Fritz', 'Claude', 'Patrick', 'Dieudonné', 'Kervens', 'Ronald', 'Evens', 'Jameson', 'Woodley', 'Peterson', 'Ernst', 'Carl-Henry', 'Marc', 'Lesly', 'Johnny', 'Wisly', 'Mackenson', 'Frednel'],
    female: ['Marie', 'Rose', 'Nadège', 'Mirlande', 'Guerline', 'Fabienne', 'Lovely', 'Darline', 'Nathalie', 'Sabine', 'Esther', 'Jessica', 'Myrlande', 'Rose-Marie', 'Marie-Claude', 'Wideline', 'Judeline', 'Roseline', 'Stéphanie', 'Yolande', 'Gina', 'Fedeline', 'Djenane', 'Carline', 'Michaëlle', 'Islande', 'Linda', 'Ketly', 'Farah', 'Edwige'],
    last: ['Jean-Baptiste', 'Pierre', 'Joseph', 'Jean', 'Louis', 'Charles', 'Paul', 'Désir', 'Augustin', 'Célestin', 'Dorvil', 'Étienne', 'François', 'Baptiste', 'Toussaint', 'Michel', 'Lafortune', 'Dorsainvil', 'Exantus', 'Jean-Louis', 'Estimé', 'Saint-Fleur', 'Bien-Aimé', 'Moïse', 'Alexis', 'Lamothe', 'Destin', 'Philogène', 'Noël', 'Fils-Aimé'],
  },
  german: {
    male: ['Lukas', 'Leon', 'Finn', 'Jonas', 'Paul', 'Elias', 'Noah', 'Felix', 'Maximilian', 'Luca', 'Ben', 'Emil', 'Henry', 'Theo', 'Jakob', 'Moritz', 'Tim', 'Niklas', 'Jan', 'Tobias', 'Florian', 'Sebastian', 'Stefan', 'Michael', 'Thomas', 'Andreas', 'Markus', 'Jürgen', 'Klaus', 'Dieter', 'Wolfgang'],
    female: ['Mia', 'Hannah', 'Lena', 'Lea', 'Anna', 'Emilia', 'Emma', 'Sophia', 'Marie', 'Clara', 'Leonie', 'Johanna', 'Laura', 'Lina', 'Ella', 'Lara', 'Charlotte', 'Ida', 'Sarah', 'Julia', 'Katharina', 'Sabine', 'Petra', 'Ursula', 'Monika', 'Birgit', 'Heike', 'Greta', 'Frieda', 'Maja'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Schmitz', 'Krause', 'Meier', 'Lehmann', 'Huber', 'Gruber', 'Keller'],
  },
  dutch: {
    male: ['Daan', 'Sem', 'Lucas', 'Levi', 'Finn', 'Milan', 'Noah', 'Luuk', 'Bram', 'Thijs', 'Jesse', 'Ruben', 'Lars', 'Sven', 'Jeroen', 'Pieter', 'Jan', 'Bas', 'Joost', 'Maarten', 'Stijn', 'Niels', 'Wouter', 'Tim', 'Koen', 'Gijs', 'Hendrik', 'Willem', 'Teun', 'Mees'],
    female: ['Emma', 'Julia', 'Tess', 'Sophie', 'Zoë', 'Mila', 'Sara', 'Fenna', 'Anna', 'Eva', 'Lotte', 'Lisa', 'Femke', 'Sanne', 'Anouk', 'Iris', 'Fleur', 'Noor', 'Isa', 'Roos', 'Lieke', 'Marieke', 'Inge', 'Saskia', 'Ilse', 'Annemarie', 'Esther', 'Maud', 'Evi', 'Nina'],
    last: ['de Jong', 'Jansen', 'de Vries', 'van den Berg', 'Bakker', 'van Dijk', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen', 'Dekker', 'Brouwer', 'de Wit', 'Dijkstra', 'Smits', 'de Graaf', 'van der Meer', 'van der Linden', 'Kok', 'Jacobs', 'de Haan', 'Vermeulen', 'van den Heuvel'],
  },
  belgian: {
    male: ['Lucas', 'Louis', 'Noah', 'Arthur', 'Jules', 'Adam', 'Victor', 'Liam', 'Wout', 'Arne', 'Lars', 'Thibault', 'Maxime', 'Senne', 'Kobe', 'Robbe', 'Jonas', 'Thomas', 'Pieter', 'Bart', 'Koen', 'Dirk', 'Jef', 'Guillaume', 'Nicolas', 'Olivier', 'Benoît', 'Seppe', 'Tibo', 'Jens'],
    female: ['Olivia', 'Louise', 'Emma', 'Elena', 'Mila', 'Lina', 'Juliette', 'Marie', 'Noor', 'Lotte', 'Fien', 'Nora', 'Anna', 'Ella', 'Liv', 'Hanne', 'Sofie', 'Lien', 'Ellen', 'Elke', 'Griet', 'Inge', 'An', 'Kaat', 'Charlotte', 'Camille', 'Chloé', 'Manon', 'Amélie', 'Justine'],
    last: ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Dupont', 'Martin', 'Vermeulen', 'Pauwels', 'Hermans', 'Aerts', 'Van de Velde', 'Michiels', 'Dumont', 'Leclercq', 'Simon', 'Laurent', 'De Clercq', 'Van Damme', 'Smets', 'Verstraete', 'Coppens', 'Renard'],
  },
  italian: {
    male: ['Leonardo', 'Francesco', 'Alessandro', 'Lorenzo', 'Mattia', 'Andrea', 'Gabriele', 'Riccardo', 'Tommaso', 'Edoardo', 'Matteo', 'Giuseppe', 'Antonio', 'Giovanni', 'Marco', 'Luca', 'Davide', 'Federico', 'Simone', 'Stefano', 'Paolo', 'Roberto', 'Salvatore', 'Vincenzo', 'Pietro', 'Alberto', 'Giorgio', 'Fabio', 'Massimo', 'Emanuele'],
    female: ['Sofia', 'Giulia', 'Aurora', 'Alice', 'Ginevra', 'Emma', 'Giorgia', 'Beatrice', 'Greta', 'Martina', 'Chiara', 'Francesca', 'Sara', 'Anna', 'Elena', 'Federica', 'Valentina', 'Alessia', 'Ilaria', 'Silvia', 'Laura', 'Paola', 'Rosa', 'Lucia', 'Maria', 'Gianna', 'Bianca', 'Carlotta', 'Elisa', 'Camilla'],
    last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile'],
  },
  nordic: {
    male: ['William', 'Oscar', 'Lucas', 'Elias', 'Erik', 'Liam', 'Noah', 'Hugo', 'Oliver', 'Axel', 'Emil', 'Filip', 'Isak', 'Magnus', 'Lars', 'Anders', 'Nils', 'Johan', 'Henrik', 'Mikkel', 'Rasmus', 'Sander', 'Jonas', 'Sven', 'Olav', 'Gustav', 'Viktor', 'Ludvig', 'Kasper', 'Frederik'],
    female: ['Alice', 'Maja', 'Elsa', 'Astrid', 'Freja', 'Ebba', 'Wilma', 'Saga', 'Agnes', 'Ingrid', 'Nora', 'Emma', 'Sofie', 'Ida', 'Ella', 'Linnea', 'Karin', 'Sigrid', 'Signe', 'Thea', 'Frida', 'Liv', 'Hedda', 'Klara', 'Mathilde', 'Anna', 'Kristin', 'Johanne', 'Selma', 'Tuva'],
    last: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Hansen', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson', 'Pettersson', 'Jensen', 'Nielsen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Johansen', 'Olsen', 'Berg', 'Haugen', 'Lindqvist', 'Lindberg', 'Bakke', 'Dahl', 'Halvorsen', 'Lund'],
  },
  finnish: {
    male: ['Juha', 'Mikko', 'Matti', 'Timo', 'Jari', 'Antti', 'Pekka', 'Kari', 'Heikki', 'Ville', 'Janne', 'Jukka', 'Tuomas', 'Lauri', 'Eino', 'Väinö', 'Onni', 'Aatu', 'Leevi', 'Eetu', 'Niilo', 'Olavi', 'Toivo', 'Aleksi', 'Sakari', 'Joonas', 'Teemu', 'Petri', 'Markku', 'Elias'],
    female: ['Aino', 'Helmi', 'Eevi', 'Venla', 'Aada', 'Sofia', 'Emilia', 'Pihla', 'Ella', 'Siiri', 'Kerttu', 'Linnea', 'Saara', 'Anni', 'Laura', 'Minna', 'Tiina', 'Sari', 'Päivi', 'Johanna', 'Riikka', 'Satu', 'Hanna', 'Elina', 'Kaisa', 'Hilla', 'Iida', 'Noora', 'Veera', 'Marjatta'],
    last: ['Korhonen', 'Virtanen', 'Mäkinen', 'Nieminen', 'Mäkelä', 'Hämäläinen', 'Laine', 'Heikkinen', 'Koskinen', 'Järvinen', 'Lehtonen', 'Lehtinen', 'Saarinen', 'Salminen', 'Heinonen', 'Niemi', 'Heikkilä', 'Kinnunen', 'Salonen', 'Turunen', 'Salo', 'Laitinen', 'Tuominen', 'Rantanen', 'Karjalainen', 'Jokinen', 'Mattila', 'Savolainen', 'Lahtinen', 'Ahonen'],
  },
  estonian: {
    male: ['Rasmus', 'Robin', 'Martin', 'Markus', 'Oliver', 'Sebastian', 'Karl', 'Mihkel', 'Andres', 'Jaan', 'Toomas', 'Tõnu', 'Priit', 'Indrek', 'Siim', 'Rainer', 'Kristjan', 'Margus', 'Meelis', 'Tarmo', 'Urmas', 'Hendrik', 'Henri', 'Mattias', 'Joosep', 'Lauri', 'Ott', 'Kaspar', 'Rein', 'Mart'],
    female: ['Sofia', 'Maria', 'Mia', 'Eliise', 'Emma', 'Lisandra', 'Laura', 'Liisa', 'Kadri', 'Kristiina', 'Triin', 'Kati', 'Merle', 'Tiina', 'Anu', 'Piret', 'Maarja', 'Kertu', 'Grete', 'Helena', 'Hanna', 'Mari', 'Kaisa', 'Eva', 'Elisabeth', 'Sandra', 'Anneli', 'Marju', 'Reet', 'Liis'],
    last: ['Tamm', 'Saar', 'Sepp', 'Mägi', 'Kask', 'Kukk', 'Rebane', 'Ilves', 'Pärn', 'Koppel', 'Kuusk', 'Karu', 'Lepik', 'Oja', 'Raudsepp', 'Vaher', 'Kõiv', 'Kallas', 'Lepp', 'Luik', 'Kivi', 'Mets', 'Teder', 'Põder', 'Org', 'Laur', 'Kaasik', 'Jõgi', 'Sarapuu', 'Tamme'],
  },
  slavic: {
    male: ['Aleksandr', 'Dmitri', 'Ivan', 'Mikhail', 'Sergei', 'Andrei', 'Alexei', 'Nikolai', 'Vladimir', 'Maxim', 'Artyom', 'Pavel', 'Yuri', 'Oleg', 'Igor', 'Konstantin', 'Viktor', 'Roman', 'Denis', 'Kirill', 'Anton', 'Boris', 'Yegor', 'Matvei', 'Timofei', 'Gleb', 'Fyodor', 'Stanislav', 'Vadim', 'Arseny'],
    female: ['Anastasia', 'Maria', 'Daria', 'Sofia', 'Anna', 'Ekaterina', 'Olga', 'Tatiana', 'Natalia', 'Elena', 'Irina', 'Svetlana', 'Yulia', 'Alina', 'Polina', 'Ksenia', 'Viktoria', 'Valentina', 'Lyudmila', 'Galina', 'Vera', 'Nadezhda', 'Alisa', 'Varvara', 'Kristina', 'Marina', 'Veronika', 'Yelizaveta', 'Arina', 'Oksana'],
    last: ['Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Vasiliev', 'Petrov', 'Sokolov', 'Mikhailov', 'Novikov', 'Fedorov', 'Morozov', 'Volkov', 'Alekseev', 'Lebedev', 'Semenov', 'Egorov', 'Pavlov', 'Kozlov', 'Stepanov', 'Nikolaev', 'Orlov', 'Andreev', 'Makarov', 'Nikitin', 'Zakharov', 'Zaitsev', 'Soloviev', 'Borisov', 'Yakovlev', 'Grigoriev'],
  },
  ukrainian: {
    male: ['Oleksandr', 'Andriy', 'Dmytro', 'Serhiy', 'Mykola', 'Volodymyr', 'Oleksiy', 'Ivan', 'Yuriy', 'Vasyl', 'Taras', 'Bohdan', 'Mykhailo', 'Petro', 'Pavlo', 'Vitaliy', 'Roman', 'Maksym', 'Artem', 'Denys', 'Yaroslav', 'Ihor', 'Oleh', 'Stepan', 'Danylo', 'Ostap', 'Nazar', 'Vadym', 'Yevhen', 'Anatoliy'],
    female: ['Olena', 'Oksana', 'Nataliya', 'Tetiana', 'Iryna', 'Yuliya', 'Svitlana', 'Anastasiya', 'Kateryna', 'Mariya', 'Olha', 'Halyna', 'Liudmyla', 'Viktoriya', 'Daryna', 'Sofiya', 'Anna', 'Khrystyna', 'Solomiya', 'Zlata', 'Valentyna', 'Nadiya', 'Lesya', 'Larysa', 'Inna', 'Alina', 'Vira', 'Ulyana', 'Mariana', 'Yaryna'],
    last: ['Melnyk', 'Shevchenko', 'Boyko', 'Kovalenko', 'Bondarenko', 'Tkachenko', 'Kovalchuk', 'Kravchenko', 'Oliynyk', 'Shevchuk', 'Koval', 'Polishchuk', 'Bondar', 'Tkachuk', 'Moroz', 'Marchenko', 'Lysenko', 'Rudenko', 'Savchenko', 'Petrenko', 'Kravchuk', 'Klymenko', 'Pavlenko', 'Savchuk', 'Kuzmenko', 'Ponomarenko', 'Vasylenko', 'Levchenko', 'Kharchenko', 'Hrytsenko'],
  },
  polish: {
    male: ['Jakub', 'Jan', 'Antoni', 'Szymon', 'Franciszek', 'Filip', 'Aleksander', 'Mikołaj', 'Wojciech', 'Kacper', 'Adam', 'Piotr', 'Krzysztof', 'Andrzej', 'Tomasz', 'Paweł', 'Michał', 'Marcin', 'Łukasz', 'Grzegorz', 'Mateusz', 'Marek', 'Dawid', 'Bartosz', 'Kamil', 'Stanisław', 'Tadeusz', 'Zbigniew', 'Ignacy', 'Wiktor'],
    female: ['Zuzanna', 'Julia', 'Zofia', 'Hanna', 'Maja', 'Lena', 'Alicja', 'Oliwia', 'Laura', 'Maria', 'Anna', 'Katarzyna', 'Małgorzata', 'Agnieszka', 'Barbara', 'Ewa', 'Krystyna', 'Magdalena', 'Joanna', 'Aleksandra', 'Monika', 'Natalia', 'Karolina', 'Marta', 'Dorota', 'Agata', 'Weronika', 'Wiktoria', 'Jadwiga', 'Halina'],
    last: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur', 'Kwiatkowski', 'Wojciechowski', 'Krawczyk', 'Kaczmarek', 'Piotrowski', 'Grabowski', 'Zając', 'Pawłowski', 'Michalski', 'Król', 'Wieczorek', 'Jabłoński', 'Wróbel', 'Nowakowski', 'Majewski', 'Olszewski'],
  },
  west_slavic: {
    male: ['Jakub', 'Jan', 'Tomáš', 'Petr', 'Martin', 'Lukáš', 'Ondřej', 'Matěj', 'Vojtěch', 'Adam', 'Filip', 'David', 'Josef', 'Jiří', 'Pavel', 'Michal', 'Marek', 'Miroslav', 'Václav', 'Karel', 'Zdeněk', 'Milan', 'Jaroslav', 'Peter', 'Juraj', 'Ján', 'Matúš', 'Šimon', 'Dominik', 'Radek'],
    female: ['Eliška', 'Tereza', 'Anna', 'Adéla', 'Natálie', 'Karolína', 'Kristýna', 'Barbora', 'Lucie', 'Kateřina', 'Markéta', 'Petra', 'Jana', 'Hana', 'Lenka', 'Veronika', 'Klára', 'Zuzana', 'Martina', 'Monika', 'Ivana', 'Simona', 'Michaela', 'Jitka', 'Alžběta', 'Viktória', 'Lucia', 'Ema', 'Sofia', 'Nina'],
    last: ['Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec', 'Marek', 'Pospíšil', 'Pokorný', 'Hájek', 'Král', 'Jelínek', 'Růžička', 'Beneš', 'Fiala', 'Sedláček', 'Horváth', 'Kováč', 'Varga', 'Tóth', 'Nagy', 'Baláž', 'Szabó', 'Molnár', 'Lukáč', 'Kollár'],
  },
  south_slavic: {
    male: ['Luka', 'Marko', 'Nikola', 'Stefan', 'Filip', 'Lazar', 'Petar', 'Ivan', 'Jovan', 'Aleksandar', 'Dragan', 'Milan', 'Nenad', 'Zoran', 'Goran', 'Dejan', 'Miloš', 'Vuk', 'Uroš', 'Ante', 'Josip', 'Matej', 'Tomislav', 'Mateo', 'Dario', 'Krešimir', 'Branimir', 'Mihajlo', 'Dušan', 'Vladimir'],
    female: ['Ana', 'Milica', 'Jelena', 'Marija', 'Ivana', 'Mila', 'Sara', 'Petra', 'Lana', 'Ema', 'Lucija', 'Dunja', 'Teodora', 'Katarina', 'Nina', 'Jovana', 'Snežana', 'Dragana', 'Mirjana', 'Vesna', 'Gordana', 'Tamara', 'Maja', 'Nikolina', 'Iva', 'Mia', 'Tijana', 'Andrea', 'Martina', 'Ljiljana'],
    last: ['Jovanović', 'Petrović', 'Nikolić', 'Marković', 'Đorđević', 'Stojanović', 'Ilić', 'Stanković', 'Pavlović', 'Milošević', 'Popović', 'Kovačević', 'Horvat', 'Kovačić', 'Babić', 'Marić', 'Novak', 'Jurić', 'Knežević', 'Vuković', 'Perić', 'Tomić', 'Pavić', 'Božić', 'Blažević', 'Grgić', 'Matić', 'Radić', 'Lukić', 'Đukić'],
  },
  hungarian: {
    male: ['Bence', 'Máté', 'Levente', 'Dominik', 'Ádám', 'Dávid', 'Balázs', 'Márk', 'Zsolt', 'László', 'István', 'József', 'János', 'Zoltán', 'Sándor', 'Gábor', 'Péter', 'Attila', 'Tamás', 'Ferenc', 'Csaba', 'Gergely', 'Bálint', 'Botond', 'Marcell', 'Olivér', 'Noel', 'Milán', 'Zalán', 'Áron'],
    female: ['Hanna', 'Anna', 'Jázmin', 'Léna', 'Zoé', 'Luca', 'Zsófia', 'Boglárka', 'Lili', 'Emma', 'Réka', 'Eszter', 'Katalin', 'Erzsébet', 'Ilona', 'Mária', 'Éva', 'Zsuzsanna', 'Krisztina', 'Andrea', 'Judit', 'Ágnes', 'Nóra', 'Petra', 'Viktória', 'Dóra', 'Fanni', 'Kitti', 'Orsolya', 'Gréta'],
    last: ['Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Varga', 'Kiss', 'Molnár', 'Németh', 'Farkas', 'Balogh', 'Papp', 'Takács', 'Juhász', 'Lakatos', 'Mészáros', 'Oláh', 'Simon', 'Rácz', 'Fekete', 'Szilágyi', 'Török', 'Fehér', 'Balázs', 'Gál', 'Kis', 'Szűcs', 'Kocsis', 'Orsós', 'Pintér'],
  },
  romanian: {
    male: ['Andrei', 'Alexandru', 'Ion', 'Mihai', 'Gheorghe', 'Constantin', 'Ștefan', 'David', 'Luca', 'Matei', 'Gabriel', 'Cristian', 'Florin', 'Marius', 'Adrian', 'Vasile', 'Ionuț', 'Bogdan', 'Daniel', 'Sorin', 'Radu', 'Răzvan', 'Dragoș', 'Cosmin', 'Mircea', 'Vlad', 'Tudor', 'Darius', 'Sebastian', 'Octavian'],
    female: ['Maria', 'Elena', 'Ioana', 'Andreea', 'Ana', 'Mihaela', 'Alexandra', 'Gabriela', 'Cristina', 'Daniela', 'Alina', 'Irina', 'Roxana', 'Raluca', 'Diana', 'Simona', 'Florentina', 'Georgiana', 'Larisa', 'Bianca', 'Sofia', 'Daria', 'Antonia', 'Teodora', 'Ilinca', 'Corina', 'Lavinia', 'Adina', 'Oana', 'Carmen'],
    last: ['Popa', 'Popescu', 'Pop', 'Radu', 'Dumitru', 'Stan', 'Stoica', 'Gheorghe', 'Matei', 'Ciobanu', 'Ionescu', 'Rusu', 'Constantin', 'Mihai', 'Munteanu', 'Dinu', 'Lazăr', 'Moldovan', 'Florea', 'Ilie', 'Vasile', 'Marin', 'Tudor', 'Barbu', 'Nistor', 'Dobre', 'Ene', 'Neagu', 'Toma', 'Cristea'],
  },
  greek: {
    male: ['Georgios', 'Dimitrios', 'Konstantinos', 'Nikolaos', 'Ioannis', 'Panagiotis', 'Christos', 'Vasileios', 'Athanasios', 'Michail', 'Evangelos', 'Spyridon', 'Alexandros', 'Theodoros', 'Antonios', 'Stavros', 'Emmanouil', 'Petros', 'Andreas', 'Kyriakos', 'Stylianos', 'Pavlos', 'Apostolos', 'Thanos', 'Yannis', 'Nikos', 'Kostas', 'Giorgos', 'Achilleas', 'Leonidas'],
    female: ['Maria', 'Eleni', 'Katerina', 'Sofia', 'Anna', 'Vasiliki', 'Georgia', 'Dimitra', 'Ioanna', 'Konstantina', 'Athina', 'Christina', 'Panagiota', 'Evangelia', 'Despoina', 'Fotini', 'Paraskevi', 'Angeliki', 'Theodora', 'Eirini', 'Zoi', 'Anastasia', 'Chrysa', 'Stella', 'Kalliopi', 'Myrto', 'Danai', 'Ariadni', 'Penelope', 'Niki'],
    last: ['Papadopoulos', 'Pappas', 'Georgiou', 'Nikolaidis', 'Oikonomou', 'Papadakis', 'Vlachos', 'Angelopoulos', 'Dimitriou', 'Konstantinidis', 'Karagiannis', 'Papanikolaou', 'Makris', 'Ioannou', 'Christodoulou', 'Alexiou', 'Antoniou', 'Athanasiou', 'Karalis', 'Georgiadis', 'Papageorgiou', 'Theodorou', 'Michailidis', 'Vasileiou', 'Panagiotopoulos', 'Lambrou', 'Stavrou', 'Kyriakou', 'Petridis', 'Mavros'],
  },
  turkish: {
    male: ['Mehmet', 'Mustafa', 'Ahmet', 'Ali', 'Emir', 'Yusuf', 'Eymen', 'Ömer', 'Hüseyin', 'Hasan', 'İbrahim', 'İsmail', 'Osman', 'Murat', 'Emre', 'Burak', 'Can', 'Kerem', 'Mert', 'Arda', 'Kaan', 'Berk', 'Serkan', 'Hakan', 'Selim', 'Tolga', 'Oğuz', 'Yiğit', 'Deniz', 'Barış'],
    female: ['Zeynep', 'Elif', 'Ayşe', 'Fatma', 'Defne', 'Emine', 'Hatice', 'Merve', 'Esra', 'Büşra', 'Özlem', 'Derya', 'Selin', 'Ece', 'Ebru', 'Gizem', 'Cansu', 'Nur', 'Asel', 'Azra', 'Eylül', 'Melis', 'Sevgi', 'Şule', 'Hülya', 'Leyla', 'Aylin', 'Yasemin', 'Burcu', 'Duygu'],
    last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Erdem', 'Korkmaz', 'Güneş', 'Aksoy', 'Avcı', 'Tekin', 'Özer', 'Bulut', 'Çakır'],
  },
  georgian: {
    male: ['Giorgi', 'Davit', 'Levan', 'Nikoloz', 'Luka', 'Irakli', 'Aleksandre', 'Zurab', 'Tornike', 'Lasha', 'Shota', 'Vakhtang', 'Merab', 'Gela', 'Nodar', 'Tamaz', 'Mamuka', 'Otar', 'Revaz', 'Beka', 'Saba', 'Gaga', 'Dachi', 'Ilia', 'Sandro', 'Mikheil', 'Archil', 'Temur', 'Vazha', 'Goga'],
    female: ['Nino', 'Mariam', 'Tamar', 'Ana', 'Elene', 'Natia', 'Salome', 'Eka', 'Ketevan', 'Maia', 'Nana', 'Tea', 'Lika', 'Sopio', 'Mzia', 'Manana', 'Tamta', 'Nutsa', 'Khatia', 'Lela', 'Teona', 'Ia', 'Medea', 'Tinatin', 'Rusudan', 'Eliso', 'Natela', 'Gvantsa', 'Nato', 'Keti'],
    last: ['Beridze', 'Kapanadze', 'Gelashvili', 'Maisuradze', 'Giorgadze', 'Lomidze', 'Tsiklauri', 'Bolkvadze', 'Kvaratskhelia', 'Nozadze', 'Abuladze', 'Khutsishvili', 'Shengelia', 'Mikeladze', 'Japaridze', 'Chkheidze', 'Gogoladze', 'Kiknadze', 'Tsereteli', 'Jorbenadze', 'Gvelesiani', 'Chikovani', 'Lobzhanidze', 'Dolidze', 'Kobakhidze', 'Mchedlishvili', 'Natsvlishvili', 'Gogichaishvili', 'Abashidze', 'Kakhiani'],
  },
  arabic: {
    male: ['Mohammed', 'Ahmed', 'Omar', 'Ali', 'Youssef', 'Hassan', 'Hussein', 'Khaled', 'Mahmoud', 'Ibrahim', 'Karim', 'Samir', 'Tarek', 'Walid', 'Bilal', 'Rami', 'Ziad', 'Fadi', 'Nabil', 'Jamal', 'Hamza', 'Mustafa', 'Adnan', 'Majid', 'Rashid', 'Sami', 'Bassam', 'Nizar', 'Elias', 'Firas'],
    female: ['Fatima', 'Aisha', 'Mariam', 'Layla', 'Noor', 'Zainab', 'Rania', 'Lina', 'Dana', 'Hala', 'Rana', 'Yasmin', 'Sara', 'Zeina', 'Hiba', 'Reem', 'Salma', 'Huda', 'Amira', 'Farah', 'Lama', 'Maya', 'Jana', 'Samira', 'Nadia', 'Ghada', 'Rasha', 'Dalia', 'Mona', 'Rima'],
    last: ['Al-Sayed', 'Haddad', 'Khalil', 'Hassan', 'Mansour', 'Khoury', 'Saleh', 'Nasser', 'Hamdan', 'Ibrahim', 'Abboud', 'Saad', 'Aziz', 'Karam', 'Najjar', 'Shami', 'Darwish', 'Hijazi', 'Masri', 'Halabi', 'Al-Jabouri', 'Al-Obaidi', 'Al-Tamimi', 'Al-Rubaie', 'Jaber', 'Sabbagh', 'Qasim', 'Haidar', 'Yassin', 'Farah'],
  },
  gulf_arabic: {
    male: ['Mohammed', 'Abdullah', 'Fahad', 'Faisal', 'Khalid', 'Saud', 'Sultan', 'Turki', 'Nasser', 'Saad', 'Abdulaziz', 'Abdulrahman', 'Hamad', 'Hamdan', 'Rashid', 'Saif', 'Majed', 'Mansour', 'Nawaf', 'Bandar', 'Mishal', 'Ahmed', 'Omar', 'Yousef', 'Salem', 'Khalifa', 'Zayed', 'Tamim', 'Jassim', 'Mubarak'],
    female: ['Fatima', 'Noura', 'Maryam', 'Sara', 'Aisha', 'Hessa', 'Latifa', 'Shaikha', 'Mouza', 'Al Anoud', 'Reem', 'Haya', 'Jawaher', 'Lulwa', 'Amal', 'Hind', 'Dana', 'Shamma', 'Alia', 'Asma', 'Lamya', 'Wadha', 'Ghaya', 'Afra', 'Nouf', 'Abeer', 'Deema', 'Raghad', 'Lujain', 'Hana'],
    last: ['Al-Qahtani', 'Al-Otaibi', 'Al-Ghamdi', 'Al-Zahrani', 'Al-Harbi', 'Al-Mutairi', 'Al-Dosari', 'Al-Shehri', 'Al-Anazi', 'Al-Shammari', 'Al-Subaie', 'Al-Ajmi', 'Al-Rashidi', 'Al-Enezi', 'Al-Marri', 'Al-Kuwari', 'Al-Mansoori', 'Al-Dhaheri', 'Al-Ketbi', 'Al-Suwaidi', 'Al-Hammadi', 'Al-Falasi', 'Al-Mazrouei', 'Al-Nuaimi', 'Al-Hajri', 'Al-Kaabi', 'Al-Sulaiti', 'Al-Mohannadi', 'Al-Saleh', 'Al-Fadhli'],
  },
  egyptian: {
    male: ['Mohamed', 'Ahmed', 'Mahmoud', 'Mostafa', 'Omar', 'Youssef', 'Ali', 'Hassan', 'Ibrahim', 'Khaled', 'Amr', 'Tamer', 'Sherif', 'Hossam', 'Karim', 'Hany', 'Ayman', 'Wael', 'Tarek', 'Islam', 'Abdelrahman', 'Ziad', 'Seif', 'Adham', 'Mina', 'Bishoy', 'Girgis', 'Ramy', 'Hazem', 'Osama'],
    female: ['Fatma', 'Mariam', 'Nour', 'Salma', 'Habiba', 'Malak', 'Farida', 'Jana', 'Hana', 'Rana', 'Yasmin', 'Aya', 'Esraa', 'Shaimaa', 'Heba', 'Dina', 'Mona', 'Nadia', 'Samar', 'Reem', 'Mai', 'Sara', 'Nada', 'Amira', 'Doaa', 'Marina', 'Mirna', 'Engy', 'Laila', 'Soha'],
    last: ['Mohamed', 'Ahmed', 'Hassan', 'Ali', 'Mahmoud', 'Ibrahim', 'El-Sayed', 'Abdel-Rahman', 'Mostafa', 'Abdallah', 'Fawzy', 'Mansour', 'Salem', 'Sobhy', 'Ezzat', 'Gamal', 'Hegazy', 'El-Masry', 'Farouk', 'Shawky', 'Naguib', 'Soliman', 'Fahmy', 'Ghaly', 'Hanna', 'Boutros', 'Morsy', 'Saleh', 'Tawfik', 'Zaki'],
  },
  maghrebi: {
    male: ['Mohamed', 'Youssef', 'Amine', 'Yacine', 'Karim', 'Mehdi', 'Rachid', 'Sofiane', 'Bilal', 'Ayoub', 'Hamza', 'Adam', 'Anas', 'Omar', 'Hicham', 'Nabil', 'Samir', 'Khalid', 'Abdelkader', 'Said', 'Mustapha', 'Rayan', 'Ilyes', 'Walid', 'Nassim', 'Riyad', 'Zakaria', 'Othmane', 'Hamid', 'Brahim'],
    female: ['Fatima', 'Amina', 'Yasmine', 'Meriem', 'Khadija', 'Salma', 'Imane', 'Sara', 'Lina', 'Nour', 'Asmaa', 'Hajar', 'Malak', 'Rim', 'Inès', 'Aya', 'Zineb', 'Souad', 'Nadia', 'Samira', 'Houda', 'Leila', 'Siham', 'Wafa', 'Chaima', 'Ikram', 'Hiba', 'Amal', 'Kenza', 'Dounia'],
    last: ['Benali', 'Bouzid', 'Belkacem', 'Haddad', 'Mansouri', 'Saidi', 'Brahimi', 'Boudiaf', 'Benaissa', 'Hamdi', 'Bensalem', 'Cherif', 'Mebarki', 'Amrani', 'Alaoui', 'Idrissi', 'El Fassi', 'Bennani', 'Tazi', 'Berrada', 'Chraibi', 'Ouali', 'Ben Ammar', 'Trabelsi', 'Jebali', 'Gharbi', 'Ben Youssef', 'Mejri', 'Ayari', 'Rahmani'],
  },
  persian: {
    male: ['Ali', 'Reza', 'Amir', 'Hossein', 'Dariush', 'Mohammad', 'Mehdi', 'Hamid', 'Saeed', 'Majid', 'Behrouz', 'Kourosh', 'Arash', 'Babak', 'Farhad', 'Kamran', 'Navid', 'Omid', 'Parviz', 'Ramin', 'Siavash', 'Sina', 'Arman', 'Hooman', 'Shahram', 'Peyman', 'Mehran', 'Pouya', 'Kian', 'Ehsan'],
    female: ['Fatemeh', 'Zahra', 'Maryam', 'Shirin', 'Parisa', 'Leila', 'Nasrin', 'Mahsa', 'Niloufar', 'Yasaman', 'Ladan', 'Golnaz', 'Roya', 'Sara', 'Mina', 'Azadeh', 'Shahrzad', 'Elham', 'Neda', 'Sepideh', 'Bahar', 'Setareh', 'Mahnaz', 'Farah', 'Soraya', 'Taraneh', 'Pegah', 'Hasti', 'Ava', 'Arezoo'],
    last: ['Hosseini', 'Mohammadi', 'Rezaei', 'Ahmadi', 'Karimi', 'Moradi', 'Jafari', 'Rahimi', 'Mousavi', 'Hashemi', 'Ghasemi', 'Sadeghi', 'Kazemi', 'Ebrahimi', 'Rostami', 'Najafi', 'Abbasi', 'Heidari', 'Akbari', 'Shirazi', 'Tehrani', 'Esfahani', 'Farahani', 'Mirzaei', 'Nouri', 'Bagheri', 'Soltani', 'Kamali', 'Zand', 'Salehi'],
  },
  afghan: {
    male: ['Ahmad', 'Mohammad', 'Abdul', 'Mahmood', 'Hamid', 'Rahim', 'Karim', 'Farid', 'Wahid', 'Nasir', 'Zalmai', 'Baryalai', 'Sharif', 'Jawad', 'Mirwais', 'Ajmal', 'Habib', 'Rahmatullah', 'Hekmat', 'Omid', 'Shafiq', 'Bilal', 'Mustafa', 'Hamza', 'Yama', 'Wais', 'Najib', 'Fawad', 'Samiullah', 'Asadullah'],
    female: ['Fatima', 'Zahra', 'Maryam', 'Laila', 'Malalai', 'Parwana', 'Zarghuna', 'Freshta', 'Mursal', 'Shabnam', 'Nilofar', 'Homa', 'Mina', 'Sahar', 'Rahima', 'Farzana', 'Nazanin', 'Gulalai', 'Zainab', 'Hasina', 'Sima', 'Arezo', 'Tamana', 'Mahbooba', 'Shukria', 'Fawzia', 'Roya', 'Spogmai', 'Palwasha', 'Nargis'],
    last: ['Ahmadzai', 'Popal', 'Durrani', 'Wardak', 'Stanikzai', 'Hotak', 'Barakzai', 'Sultani', 'Rahimi', 'Noori', 'Hakimi', 'Safi', 'Mohammadi', 'Haidari', 'Sadat', 'Yousufzai', 'Amiri', 'Rasuli', 'Azizi', 'Jalali', 'Habibi', 'Zazai', 'Mangal', 'Kakar', 'Niazi', 'Achakzai', 'Samadi', 'Faizi', 'Qaderi', 'Alokozai'],
  },
  hebrew: {
    male: ['Noam', 'David', 'Ariel', 'Yosef', 'Eitan', 'Ori', 'Itai', 'Yonatan', 'Daniel', 'Omer', 'Amit', 'Guy', 'Lior', 'Uri', 'Avi', 'Moshe', 'Yaakov', 'Avraham', 'Shlomo', 'Yehuda', 'Eliyahu', 'Tomer', 'Idan', 'Nadav', 'Amir', 'Ron', 'Gal', 'Asaf', 'Yuval', 'Eyal'],
    female: ['Noa', 'Tamar', 'Maya', 'Yael', 'Shira', 'Michal', 'Adi', 'Avigail', 'Hila', 'Talia', 'Rivka', 'Sarah', 'Rachel', 'Leah', 'Esther', 'Miriam', 'Hadas', 'Keren', 'Liat', 'Shani', 'Noga', 'Roni', 'Neta', 'Efrat', 'Orly', 'Dana', 'Ayelet', 'Galit', 'Inbar', 'Ella'],
    last: ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Friedman', 'Biton', 'Dahan', 'Avraham', 'Katz', 'Azoulay', 'Malka', 'Hadad', 'Gabay', 'Ben-David', 'Amar', 'Ohayon', 'Shapiro', 'Goldberg', 'Rosenberg', 'Weiss', 'Klein', 'Ashkenazi', 'Ben-Ami', 'Shalom', 'Golan', 'Barak', 'Segal', 'Shamir', 'Elbaz', 'Vaknin'],
  },
  south_asian: {
    male: ['Aarav', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Rahul', 'Amit', 'Vikram', 'Raj', 'Sanjay', 'Anil', 'Deepak', 'Kabir', 'Aditya', 'Nikhil', 'Pranav', 'Siddharth', 'Arnav', 'Dhruv', 'Harsh', 'Manish', 'Suresh', 'Varun', 'Yash', 'Abhishek', 'Gaurav', 'Harpreet'],
    female: ['Saanvi', 'Aanya', 'Aadhya', 'Ananya', 'Diya', 'Priya', 'Pooja', 'Neha', 'Anjali', 'Kavya', 'Isha', 'Riya', 'Sneha', 'Meera', 'Lakshmi', 'Divya', 'Shreya', 'Nisha', 'Aditi', 'Tara', 'Pallavi', 'Swati', 'Sunita', 'Kiran', 'Rekha', 'Jyoti', 'Simran', 'Nandini', 'Ishita', 'Gauri'],
    last: ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Iyer', 'Nair', 'Joshi', 'Mehta', 'Rao', 'Das', 'Chopra', 'Malhotra', 'Bose', 'Kapoor', 'Verma', 'Agarwal', 'Pillai', 'Mishra', 'Banerjee', 'Mukherjee', 'Chatterjee', 'Desai', 'Shah', 'Menon', 'Pandey', 'Yadav', 'Saxena', 'Kulkarni'],
  },
  pakistani: {
    male: ['Muhammad', 'Ahmed', 'Ali', 'Hassan', 'Hussain', 'Usman', 'Bilal', 'Hamza', 'Imran', 'Faisal', 'Asad', 'Kamran', 'Zain', 'Fahad', 'Saad', 'Shahid', 'Tariq', 'Waqar', 'Adnan', 'Junaid', 'Haris', 'Talha', 'Rizwan', 'Shoaib', 'Umar', 'Abdullah', 'Danish', 'Arslan', 'Noman', 'Babar'],
    female: ['Ayesha', 'Fatima', 'Maryam', 'Zainab', 'Hira', 'Sana', 'Amna', 'Mahnoor', 'Iqra', 'Rabia', 'Saba', 'Nida', 'Sadia', 'Bushra', 'Khadija', 'Aiman', 'Mehwish', 'Zara', 'Anum', 'Sidra', 'Areeba', 'Komal', 'Hina', 'Laiba', 'Noor', 'Shazia', 'Samina', 'Rukhsana', 'Nazia', 'Uzma'],
    last: ['Khan', 'Ahmed', 'Ali', 'Malik', 'Butt', 'Hussain', 'Iqbal', 'Qureshi', 'Sheikh', 'Chaudhry', 'Mirza', 'Siddiqui', 'Raza', 'Shah', 'Awan', 'Abbasi', 'Bhatti', 'Rana', 'Javed', 'Aslam', 'Akhtar', 'Mughal', 'Rehman', 'Hashmi', 'Jatoi', 'Baloch', 'Khattak', 'Afridi', 'Gill', 'Zaidi'],
  },
  bengali: {
    male: ['Mohammad', 'Abdul', 'Rahim', 'Karim', 'Rafiq', 'Shafiq', 'Kamal', 'Jamal', 'Habib', 'Arif', 'Tanvir', 'Sabbir', 'Shakib', 'Mahmud', 'Rakib', 'Nayeem', 'Fahim', 'Imran', 'Sohel', 'Rubel', 'Masud', 'Rashed', 'Tamim', 'Mushfiq', 'Ayaan', 'Arian', 'Rifat', 'Siam', 'Tahsin', 'Anik'],
    female: ['Fatema', 'Ayesha', 'Nusrat', 'Sumaiya', 'Tasnim', 'Jannatul', 'Farzana', 'Sharmin', 'Taslima', 'Shirin', 'Rokeya', 'Nasrin', 'Sadia', 'Tania', 'Mitu', 'Rumana', 'Shathi', 'Lamia', 'Anika', 'Raisa', 'Mim', 'Sabrina', 'Moushumi', 'Rupa', 'Shapla', 'Bristi', 'Tahmina', 'Shila', 'Purnima', 'Joya'],
    last: ['Rahman', 'Hossain', 'Islam', 'Ahmed', 'Khan', 'Chowdhury', 'Uddin', 'Alam', 'Miah', 'Sarkar', 'Haque', 'Karim', 'Sheikh', 'Mahmud', 'Talukder', 'Mondal', 'Biswas', 'Das', 'Saha', 'Roy', 'Barua', 'Bhuiyan', 'Hasan', 'Kabir', 'Majumder', 'Siddique', 'Paul', 'Dey', 'Ghosh', 'Mridha'],
  },
  nepali: {
    male: ['Ram', 'Hari', 'Krishna', 'Bikash', 'Suman', 'Rajesh', 'Prakash', 'Dipak', 'Sanjay', 'Ramesh', 'Bishal', 'Sagar', 'Anil', 'Sunil', 'Binod', 'Kiran', 'Nabin', 'Santosh', 'Arjun', 'Aayush', 'Prabin', 'Sujan', 'Bibek', 'Roshan', 'Dinesh', 'Gopal', 'Bimal', 'Pasang', 'Tenzing', 'Mingma'],
    female: ['Sita', 'Gita', 'Laxmi', 'Sarita', 'Sunita', 'Anita', 'Puja', 'Rita', 'Kabita', 'Sabina', 'Asmita', 'Srijana', 'Bimala', 'Kamala', 'Manisha', 'Pratima', 'Sushma', 'Nirmala', 'Sabita', 'Aakriti', 'Aastha', 'Prakriti', 'Samjhana', 'Bandana', 'Dolma', 'Pema', 'Sangita', 'Rojina', 'Anjali', 'Usha'],
    last: ['Shrestha', 'Thapa', 'Gurung', 'Tamang', 'Rai', 'Magar', 'Adhikari', 'Karki', 'Sharma', 'Poudel', 'Khadka', 'Bhattarai', 'Basnet', 'Limbu', 'Sherpa', 'Lama', 'Maharjan', 'Shahi', 'Bista', 'Pandey', 'Koirala', 'Dahal', 'Ghimire', 'Joshi', 'Pokharel', 'Thakuri', 'Chaudhary', 'Neupane', 'Acharya', 'Bhandari'],
  },
  chinese: {
    male: ['Wei', 'Hao', 'Jun', 'Ming', 'Yong', 'Haoran', 'Yuxuan', 'Zihao', 'Haoyu', 'Yichen', 'Junjie', 'Jianguo', 'Zhiwei', 'Xiaoming', 'Lei', 'Tao', 'Qiang', 'Bo', 'Peng', 'Chao', 'Jie', 'Gang', 'Hui', 'Kai', 'Long', 'Zhihao', 'Yifan', 'Mingze', 'Wenbo', 'Jiahao'],
    female: ['Mei', 'Li', 'Xiu', 'Ying', 'Fang', 'Xinyi', 'Yutong', 'Zihan', 'Jing', 'Na', 'Min', 'Yan', 'Xiaoyan', 'Hong', 'Lan', 'Juan', 'Ting', 'Qian', 'Shu', 'Yue', 'Xue', 'Yuxin', 'Ruoxi', 'Shiyu', 'Mengyao', 'Jiayi', 'Xiaoling', 'Wenjing', 'Huimin', 'Lili'],
    last: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Gao', 'Lin', 'Luo', 'Zheng', 'Liang', 'Xie', 'Song', 'Tang', 'Han', 'Feng', 'Deng', 'Cao', 'Peng'],
  },
  cantonese: {
    male: ['Ka-ho', 'Chi-wai', 'Wing-kit', 'Man-kit', 'Siu-ming', 'Chun-kit', 'Kwok-wai', 'Ho-yin', 'Tsz-hin', 'Hok-lam', 'Chi-keung', 'Wai-man', 'Ka-lok', 'Pak-hei', 'Yat-long', 'Jason', 'Kelvin', 'Raymond', 'Calvin', 'Alan', 'Eric', 'Ken', 'Wilson', 'Edmund', 'Gordon', 'Vincent', 'Terence', 'Derek', 'Anson', 'Marco'],
    female: ['Ka-yan', 'Wing-yi', 'Hoi-ling', 'Mei-ling', 'Siu-wai', 'Pui-shan', 'Tsz-ching', 'Hiu-tung', 'Wai-ying', 'Man-yee', 'Sze-wing', 'Yuen-ting', 'Ching-man', 'Lok-yi', 'Cheuk-yiu', 'Michelle', 'Karen', 'Winnie', 'Cherry', 'Vivian', 'Fiona', 'Gigi', 'Joyce', 'Mandy', 'Candy', 'Kelly', 'Natalie', 'Rachel', 'Tiffany', 'Queenie'],
    last: ['Chan', 'Wong', 'Leung', 'Cheung', 'Lau', 'Lee', 'Ho', 'Ng', 'Lam', 'Chow', 'Tsang', 'Mak', 'Yip', 'Kwok', 'Tang', 'Cheng', 'Fung', 'Lai', 'Tse', 'Chu', 'Yeung', 'Ma', 'Hui', 'Tam', 'Kwan', 'Siu', 'Lo', 'Choi', 'Au', 'Yuen'],
  },
  taiwanese: {
    male: ['Chia-hao', 'Chih-ming', 'Chun-chieh', 'Wei-lun', 'Kuan-yu', 'Po-han', 'Cheng-en', 'Yu-hsiang', 'Chien-hung', 'Tsung-han', 'Chih-hao', 'Cheng-han', 'Yao-ting', 'Bo-wei', 'Shih-chieh', 'Kuan-ting', 'Chih-wei', 'Chia-wei', 'Yu-cheng', 'Hsin-hung', 'Ming-hsuan', 'Tzu-yang', 'Chun-hung', 'Wen-hsiung', 'Kai-wen', 'Chen-yu', 'Hung-wei', 'Sheng-hao', 'Cheng-yu', 'Jen-hao'],
    female: ['Shu-fen', 'Mei-ling', 'Ya-ting', 'Yi-ting', 'Hsin-yi', 'Pei-shan', 'Yu-ting', 'Chia-hui', 'Shu-hui', 'Hui-chun', 'Yi-chen', 'Pin-yu', 'Yu-han', 'Tzu-han', 'Wan-ting', 'Hsiao-wen', 'Chia-yi', 'Ching-wen', 'Yu-chen', 'Li-hua', 'Mei-hua', 'Ya-wen', 'Shih-han', 'Yi-hsuan', 'Hui-ling', 'Pei-yu', 'Szu-ying', 'Chiao-yun', 'Wen-ting', 'Hsin-ju'],
    last: ['Chen', 'Lin', 'Huang', 'Chang', 'Li', 'Wang', 'Wu', 'Liu', 'Tsai', 'Yang', 'Hsu', 'Cheng', 'Hsieh', 'Hung', 'Kuo', 'Chiu', 'Tseng', 'Liao', 'Lai', 'Chou', 'Yeh', 'Su', 'Chuang', 'Lu', 'Chiang', 'Ho', 'Hsiao', 'Lo', 'Kao', 'Pan'],
  },
  japanese: {
    male: ['Haruto', 'Sota', 'Yuto', 'Hinata', 'Riku', 'Ren', 'Takumi', 'Kaito', 'Hiroshi', 'Kenji', 'Takeshi', 'Daiki', 'Sho', 'Yuki', 'Kenta', 'Ryo', 'Shota', 'Kazuki', 'Naoki', 'Tatsuya', 'Sora', 'Haruki', 'Itsuki', 'Minato', 'Yamato', 'Kenichi', 'Satoshi', 'Masato', 'Koji', 'Akira'],
    female: ['Yui', 'Hina', 'Sakura', 'Mei', 'Aoi', 'Yuna', 'Rin', 'Haruka', 'Akari', 'Emi', 'Yuko', 'Naomi', 'Ayumi', 'Keiko', 'Mio', 'Saki', 'Nanami', 'Misaki', 'Kana', 'Hana', 'Yuka', 'Ayaka', 'Miyu', 'Rina', 'Chika', 'Natsuki', 'Tomoko', 'Megumi', 'Kaori', 'Asuka'],
    last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Mori', 'Abe', 'Ikeda', 'Hashimoto', 'Yamashita', 'Ishikawa', 'Nakajima', 'Maeda', 'Fujita', 'Ogawa', 'Okada'],
  },
  korean: {
    male: ['Min-jun', 'Seo-jun', 'Ji-ho', 'Do-yun', 'Ha-jun', 'Joon-ho', 'Ji-hoon', 'Hyun-woo', 'Sung-min', 'Dong-hyun', 'Jae-won', 'Tae-yang', 'Woo-jin', 'Si-woo', 'Ye-jun', 'Eun-woo', 'Jun-seo', 'Young-ho', 'Sang-woo', 'Kyung-soo', 'Jin-young', 'Seung-hyun', 'Jung-ho', 'Chul-soo', 'Byung-hun', 'Tae-hyun', 'Yoon-ho', 'Jae-hyun', 'Min-ho', 'Hyun-jun'],
    female: ['Seo-yeon', 'Ji-woo', 'Ha-eun', 'Min-seo', 'Su-a', 'Seo-yun', 'Ji-yoo', 'Ye-eun', 'Chae-won', 'Ji-min', 'Soo-jin', 'Hye-jin', 'Eun-ji', 'Yoo-na', 'Da-eun', 'Na-yeon', 'Ji-eun', 'Min-ji', 'Yu-jin', 'So-yeon', 'Hye-won', 'Mi-young', 'Eun-young', 'Jung-eun', 'Ji-hye', 'Seul-gi', 'Ha-yoon', 'Bo-ra', 'Su-bin', 'Young-hee'],
    last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin', 'Kwon', 'Hwang', 'Ahn', 'Song', 'Yoo', 'Hong', 'Jeon', 'Ko', 'Moon', 'Yang', 'Son', 'Bae', 'Baek', 'Heo', 'Nam', 'Noh'],
  },
  mongolian: {
    male: ['Bat-Erdene', 'Batbayar', 'Ganbaatar', 'Erdene', 'Temuujin', 'Bold', 'Bilguun', 'Tuvshin', 'Munkh-Erdene', 'Enkhbat', 'Gantulga', 'Otgonbayar', 'Sukhbaatar', 'Dorj', 'Baatar', 'Chinzorig', 'Khongor', 'Naranbaatar', 'Tsogt', 'Altangerel', 'Ankhbayar', 'Battulga', 'Ganzorig', 'Jargal', 'Temuulen', 'Ochir', 'Byambaa', 'Amarbayasgalan', 'Khuder', 'Uuganbayar'],
    female: ['Oyunchimeg', 'Enkhjargal', 'Sarangerel', 'Altantsetseg', 'Bolormaa', 'Narantsetseg', 'Tsetsegmaa', 'Oyuun', 'Anu', 'Khulan', 'Nomin', 'Solongo', 'Saruul', 'Gerelmaa', 'Delgermaa', 'Erdenechimeg', 'Uyanga', 'Munkhzul', 'Bayarmaa', 'Tuya', 'Undrakh', 'Anujin', 'Enkhtuya', 'Sarnai', 'Odval', 'Tsolmon', 'Khongorzul', 'Misheel', 'Ariunaa', 'Nandin'],
    last: ['Batbold', 'Ganbold', 'Dorjsuren', 'Tsedendamba', 'Enkhbayar', 'Purevdorj', 'Bayarsaikhan', 'Gombo', 'Sukhbat', 'Chuluun', 'Lkhagva', 'Davaa', 'Tumur', 'Erdenebat', 'Tserendorj', 'Sodnom', 'Batjargal', 'Jambal', 'Ganbat', 'Nyamdorj', 'Altankhuyag', 'Dashdorj', 'Munkhbat', 'Narmandakh', 'Zorig', 'Togtokh', 'Boldbaatar', 'Shagdar', 'Ochirbat', 'Damdin'],
  },
  kazakh: {
    male: ['Nursultan', 'Arman', 'Yerlan', 'Daniyar', 'Aidos', 'Askar', 'Bauyrzhan', 'Yerzhan', 'Nurlan', 'Serik', 'Timur', 'Alikhan', 'Alibek', 'Dias', 'Rustem', 'Marat', 'Kairat', 'Zhandos', 'Azamat', 'Erbol', 'Sanzhar', 'Yerassyl', 'Abylai', 'Madi', 'Temirlan', 'Nurbol', 'Dauren', 'Galym', 'Bekzat', 'Aibek'],
    female: ['Aigerim', 'Dana', 'Aruzhan', 'Ayana', 'Madina', 'Dinara', 'Zhanna', 'Gulnara', 'Aliya', 'Saule', 'Asel', 'Kamila', 'Akmaral', 'Zarina', 'Ainur', 'Aisulu', 'Assem', 'Gulzhan', 'Karlygash', 'Zhuldyz', 'Meruert', 'Tomiris', 'Nazerke', 'Balnur', 'Aizhan', 'Aknur', 'Inkar', 'Raushan', 'Sabina', 'Alua'],
    last: ['Akhmetov', 'Omarov', 'Abenov', 'Suleimenov', 'Nurlanov', 'Bekov', 'Iskakov', 'Zhakupov', 'Kassymov', 'Seitkali', 'Sadykov', 'Mukhametov', 'Baimukhamedov', 'Ermekov', 'Zhunusov', 'Abdrakhmanov', 'Bekmukhambetov', 'Kenzhebekov', 'Utepov', 'Karimov', 'Nurpeisov', 'Sarsenbayev', 'Tulegenov', 'Zhumabekov', 'Amanov', 'Baiseitov', 'Kudaibergenov', 'Mamyrov', 'Yessenov', 'Sultanbekov'],
  },
  // Kept for compatibility with older saves/modules; Vietnam is the region's naming anchor.
  southeast_asian: { male: [...VIETNAMESE.male], female: [...VIETNAMESE.female], last: [...VIETNAMESE.last] },
  vietnamese: VIETNAMESE,
  thai: {
    male: ['Somchai', 'Somsak', 'Anan', 'Chaiwat', 'Thanawat', 'Kittisak', 'Nattapong', 'Prasert', 'Wichai', 'Sombat', 'Suriya', 'Arthit', 'Pongsakorn', 'Teerapat', 'Siriwat', 'Kritsada', 'Anucha', 'Natthawut', 'Thanakorn', 'Worawut', 'Chatchai', 'Sakda', 'Ekkachai', 'Narongrit', 'Prawit', 'Krit', 'Pakorn', 'Wasan', 'Tanakrit', 'Apichart'],
    female: ['Nok', 'Malee', 'Siriporn', 'Sunisa', 'Kanya', 'Pimchanok', 'Nattaya', 'Wanida', 'Supaporn', 'Kanokwan', 'Ratana', 'Suda', 'Achara', 'Busaba', 'Chayanin', 'Duangjai', 'Jintana', 'Kamolwan', 'Lalita', 'Nanthida', 'Orathai', 'Pornthip', 'Saowalak', 'Thida', 'Usa', 'Waraporn', 'Yupin', 'Arunee', 'Benjamas', 'Chalisa'],
    last: ['Saetang', 'Saelim', 'Srisuk', 'Wongsa', 'Chaiyaporn', 'Sukprasert', 'Thongchai', 'Rattanakorn', 'Phromma', 'Boonmee', 'Charoenpol', 'Kaewmanee', 'Siriwong', 'Sangthong', 'Somboon', 'Jaidee', 'Thongdee', 'Intharasuk', 'Panyasiri', 'Kongsuk', 'Sukjai', 'Rungruang', 'Wattana', 'Pongpanich', 'Chantarasak', 'Nakprasert', 'Sombatsiri', 'Suwannarat', 'Kittikun', 'Pattanaporn'],
  },
  indonesian: {
    male: ['Budi', 'Arif', 'Agus', 'Andi', 'Bambang', 'Dedi', 'Eko', 'Fajar', 'Hendra', 'Iwan', 'Joko', 'Rizky', 'Yusuf', 'Ahmad', 'Muhammad', 'Rudi', 'Wahyu', 'Dimas', 'Bayu', 'Aditya', 'Reza', 'Putra', 'Surya', 'Taufik', 'Hadi', 'Irfan', 'Gilang', 'Teguh', 'Slamet', 'Yoga'],
    female: ['Siti', 'Dewi', 'Sri', 'Ayu', 'Putri', 'Rina', 'Wulan', 'Indah', 'Lestari', 'Nur', 'Fitri', 'Ratna', 'Kartika', 'Intan', 'Maya', 'Sari', 'Dian', 'Wati', 'Nadia', 'Anisa', 'Citra', 'Mega', 'Novita', 'Rahma', 'Yuni', 'Eka', 'Desi', 'Tari', 'Nabila', 'Aulia'],
    last: ['Santoso', 'Wijaya', 'Saputra', 'Hidayat', 'Pratama', 'Setiawan', 'Kusuma', 'Gunawan', 'Susanto', 'Nugroho', 'Sutanto', 'Wibowo', 'Halim', 'Purnomo', 'Siregar', 'Nasution', 'Harahap', 'Simanjuntak', 'Sinaga', 'Lubis', 'Hutapea', 'Tanjung', 'Rahman', 'Syahputra', 'Utomo', 'Hartono', 'Kurniawan', 'Sulistyo', 'Permana', 'Firmansyah'],
  },
  malay: {
    male: ['Muhammad', 'Ahmad', 'Amir', 'Hafiz', 'Faiz', 'Aiman', 'Danial', 'Haziq', 'Irfan', 'Syafiq', 'Amirul', 'Hakim', 'Izzat', 'Firdaus', 'Azlan', 'Razak', 'Ismail', 'Zulkifli', 'Hariz', 'Iskandar', 'Khairul', 'Nazri', 'Fauzi', 'Rizal', 'Shahrul', 'Arif', 'Adam', 'Aqil', 'Luqman', 'Imran'],
    female: ['Siti', 'Nurul', 'Aisyah', 'Farah', 'Aina', 'Alya', 'Balqis', 'Damia', 'Hana', 'Iman', 'Intan', 'Liyana', 'Maisarah', 'Nabila', 'Nadia', 'Qistina', 'Sofea', 'Syafiqah', 'Wani', 'Zara', 'Amira', 'Atiqah', 'Izzah', 'Hidayah', 'Fatin', 'Ain', 'Nurin', 'Puteri', 'Sarah', 'Yasmin'],
    last: ['Abdullah', 'Ismail', 'Rahman', 'Ibrahim', 'Hassan', 'Ahmad', 'Yusof', 'Osman', 'Hamid', 'Aziz', 'Razak', 'Salleh', 'Hashim', 'Mohamad', 'Othman', 'Bakar', 'Kassim', 'Jamal', 'Zakaria', 'Rashid', 'Mahmud', 'Hussin', 'Sulaiman', 'Nordin', 'Mansor', 'Daud', 'Ariffin', 'Halim', 'Latif', 'Shafie'],
  },
  singaporean: {
    male: ['Wei Ming', 'Jun Jie', 'Zhi Hao', 'Kai Xiang', 'Wei Jie', 'Yong Sheng', 'Jun Wei', 'Jia Wei', 'Zhen Yu', 'Darren', 'Benjamin', 'Bryan', 'Marcus', 'Ryan', 'Ethan', 'Jayden', 'Javier', 'Shawn', 'Nicholas', 'Gabriel', 'Aaron', 'Isaac', 'Joshua', 'Desmond', 'Kelvin', 'Haziq', 'Hafiz', 'Arjun', 'Pravin', 'Rajesh'],
    female: ['Hui Min', 'Xin Yi', 'Jia Hui', 'Mei Ling', 'Shu Ting', 'Li Ting', 'Jia Ying', 'Wen Qi', 'Hui Ying', 'Yu Xuan', 'Rachel', 'Michelle', 'Sharon', 'Cheryl', 'Joanne', 'Charmaine', 'Felicia', 'Jasmine', 'Valerie', 'Natalie', 'Gwendolyn', 'Clarissa', 'Chloe', 'Megan', 'Nur Aisyah', 'Siti', 'Farhana', 'Priya', 'Kavitha', 'Divya'],
    last: ['Tan', 'Lim', 'Lee', 'Ng', 'Ong', 'Wong', 'Goh', 'Chua', 'Chan', 'Koh', 'Teo', 'Ang', 'Yeo', 'Tay', 'Ho', 'Low', 'Toh', 'Sim', 'Chong', 'Chia', 'Seah', 'Foo', 'Lau', 'Quek', 'Loh', 'Phua', 'Kumar', 'Pillai', 'Rahman', 'Ismail'],
  },
  filipino: {
    male: ['Jose', 'Mark', 'John Paul', 'Christian', 'Angelo', 'Juan', 'Miguel', 'Carlo', 'Paolo', 'Rafael', 'Gabriel', 'Jerome', 'Jericho', 'Joshua', 'Kenneth', 'Michael', 'Rodel', 'Ramon', 'Ronaldo', 'Romeo', 'Emmanuel', 'Jun', 'Nathaniel', 'Arnel', 'Edgardo', 'Reynaldo', 'Danilo', 'Ernesto', 'Jayson', 'Kyle'],
    female: ['Maria', 'Angel', 'Princess', 'Mary Grace', 'Kristine', 'Jasmine', 'Joy', 'Michelle', 'Rose', 'Andrea', 'Camille', 'Nicole', 'Patricia', 'Bea', 'Kathryn', 'Liza', 'Marites', 'Lorna', 'Marivic', 'Rowena', 'Analyn', 'Jocelyn', 'Rhea', 'Gemma', 'Charmaine', 'Sheila', 'Mae', 'Erlinda', 'Lourdes', 'Corazon'],
    last: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Ocampo', 'Mendoza', 'Torres', 'Tomas', 'Andrada', 'Castillo', 'Flores', 'Villanueva', 'Ramos', 'Castro', 'Rivera', 'Aquino', 'Navarro', 'Salazar', 'Mercado', 'Aguilar', 'Dela Cruz', 'De Guzman', 'Pascual', 'Lopez', 'Manalo', 'Dizon', 'Soriano', 'Gonzales', 'Panganiban'],
  },
  west_african: {
    male: ['Chinedu', 'Emeka', 'Oluwaseun', 'Tunde', 'Ade', 'Babatunde', 'Chukwuemeka', 'Ifeanyi', 'Obinna', 'Olumide', 'Segun', 'Femi', 'Kunle', 'Musa', 'Ibrahim', 'Abubakar', 'Usman', 'Sani', 'Yusuf', 'Nnamdi', 'Chidi', 'Kelechi', 'Uche', 'Tobi', 'Damilare', 'Ayodele', 'Godwin', 'Emmanuel', 'Daniel', 'Victor'],
    female: ['Ngozi', 'Amara', 'Adaeze', 'Folake', 'Chiamaka', 'Chioma', 'Nneka', 'Ifeoma', 'Funmilayo', 'Yetunde', 'Titilayo', 'Bisola', 'Kemi', 'Tolu', 'Aisha', 'Hadiza', 'Fatima', 'Zainab', 'Halima', 'Blessing', 'Precious', 'Esther', 'Grace', 'Ebere', 'Oluchi', 'Temitope', 'Damilola', 'Adaora', 'Ifunanya', 'Eniola'],
    last: ['Okafor', 'Adeyemi', 'Okonkwo', 'Eze', 'Nwosu', 'Okeke', 'Obi', 'Adebayo', 'Ogunleye', 'Balogun', 'Olawale', 'Bello', 'Abubakar', 'Mohammed', 'Ibrahim', 'Danjuma', 'Aliyu', 'Usman', 'Okoro', 'Nwachukwu', 'Uzoma', 'Chukwu', 'Afolabi', 'Ogunbiyi', 'Akinola', 'Ojo', 'Adeleke', 'Ekwueme', 'Anyanwu', 'Oyelaran'],
  },
  east_african: {
    male: ['Baraka', 'Juma', 'Otieno', 'Kipchoge', 'Brian', 'Kevin', 'Dennis', 'Collins', 'Victor', 'Emmanuel', 'Ian', 'Kibet', 'Kiprop', 'Omondi', 'Ochieng', 'Kamau', 'Njoroge', 'Kiptoo', 'Mugisha', 'Okello', 'Musa', 'Hassan', 'Joseph', 'Samuel', 'Moses', 'Isaac', 'Wekesa', 'Mutua', 'Kato', 'Opio'],
    female: ['Amani', 'Wanjiru', 'Aisha', 'Makena', 'Achieng', 'Akinyi', 'Atieno', 'Wanjiku', 'Njeri', 'Wambui', 'Nyambura', 'Mumbua', 'Faith', 'Mercy', 'Grace', 'Joy', 'Sharon', 'Esther', 'Neema', 'Zawadi', 'Imani', 'Nafula', 'Nakato', 'Namubiru', 'Nansubuga', 'Auma', 'Chebet', 'Jepkosgei', 'Cherono', 'Halima'],
    last: ['Mwangi', 'Otieno', 'Kamau', 'Odhiambo', 'Ochieng', 'Kariuki', 'Njoroge', 'Wafula', 'Mutua', 'Kiprotich', 'Cheruiyot', 'Kipchumba', 'Onyango', 'Owino', 'Wanjala', 'Kimani', 'Macharia', 'Ndungu', 'Omondi', 'Barasa', 'Okello', 'Mugisha', 'Ssempala', 'Byaruhanga', 'Tumusiime', 'Nsubuga', 'Kato', 'Lubega', 'Mukasa', 'Ouma'],
  },
  ethiopian: {
    male: ['Abebe', 'Tesfaye', 'Bekele', 'Haile', 'Girma', 'Getachew', 'Alemu', 'Tadesse', 'Kebede', 'Mulugeta', 'Dawit', 'Yonas', 'Samuel', 'Solomon', 'Biniam', 'Henok', 'Natnael', 'Abel', 'Yohannes', 'Mekonnen', 'Tewodros', 'Fikru', 'Mesfin', 'Ermias', 'Kidus', 'Eyob', 'Bereket', 'Abiy', 'Lemma', 'Tsegaye'],
    female: ['Hiwot', 'Selam', 'Meron', 'Tigist', 'Bethlehem', 'Mahlet', 'Liya', 'Saba', 'Hana', 'Rahel', 'Meseret', 'Tsion', 'Eden', 'Ruth', 'Senait', 'Almaz', 'Genet', 'Aster', 'Birtukan', 'Feven', 'Helen', 'Kidist', 'Lidya', 'Mekdes', 'Selamawit', 'Tirunesh', 'Yordanos', 'Zewditu', 'Etenesh', 'Makeda'],
    last: ['Tesfaye', 'Bekele', 'Haile', 'Girma', 'Getachew', 'Alemu', 'Tadesse', 'Kebede', 'Mengistu', 'Abebe', 'Wolde', 'Gebre', 'Hailu', 'Desta', 'Assefa', 'Ayele', 'Negash', 'Teshome', 'Worku', 'Lemma', 'Mekonnen', 'Tefera', 'Demissie', 'Gebremedhin', 'Asfaw', 'Berhane', 'Mulatu', 'Yilma', 'Woldemariam', 'Zewde'],
  },
  somali: {
    male: ['Abdi', 'Ahmed', 'Omar', 'Hassan', 'Ismail', 'Mohamed', 'Abdirahman', 'Abdullahi', 'Ali', 'Farah', 'Yusuf', 'Ibrahim', 'Mahad', 'Liban', 'Guled', 'Hamse', 'Kadar', 'Ayanle', 'Daher', 'Moussa', 'Houssein', 'Robleh', 'Idriss', 'Elmi', 'Aden', 'Djama', 'Dirir', 'Osman', 'Said', 'Warsame'],
    female: ['Amina', 'Fadumo', 'Hodan', 'Hawa', 'Halima', 'Khadra', 'Ifrah', 'Deka', 'Sahra', 'Asha', 'Nimco', 'Faiza', 'Hibo', 'Ubah', 'Ayan', 'Sagal', 'Ladan', 'Ilhan', 'Hamdi', 'Muna', 'Ruqia', 'Samira', 'Zahra', 'Hinda', 'Kaltoum', 'Fatouma', 'Mouna', 'Nasteho', 'Roda', 'Idil'],
    last: ['Farah', 'Guelleh', 'Aden', 'Abdillahi', 'Hassan', 'Warsame', 'Dirie', 'Robleh', 'Houssein', 'Ali', 'Ahmed', 'Omar', 'Ismail', 'Elmi', 'Djama', 'Osman', 'Daher', 'Moussa', 'Bouh', 'Kamil', 'Youssouf', 'Barkat', 'Waberi', 'Abdi', 'Ibrahim', 'Said', 'Gouled', 'Hersi', 'Mohamed', 'Egueh'],
  },
  congolese: {
    male: ['Jean', 'Patrick', 'Joseph', 'Pierre', 'Christian', 'Héritier', 'Gloire', 'Dieudonné', 'Fiston', 'Junior', 'Trésor', 'Glody', 'Exaucé', 'Cédric', 'Arnold', 'Blaise', 'Fabrice', 'Jonathan', 'Serge', 'Jean-Pierre', 'Papy', 'Eric', 'Olivier', 'Félix', 'Moïse', 'Emmanuel', 'Didier', 'Godé', 'Prince', 'Bienvenu'],
    female: ['Grace', 'Merveille', 'Bénédicte', 'Divine', 'Gloria', 'Chancelle', 'Esther', 'Rachel', 'Ruth', 'Sarah', 'Marie', 'Nadine', 'Francine', 'Chantal', 'Clarisse', 'Josée', 'Pascaline', 'Exaucée', 'Dorcas', 'Ornella', 'Nathalie', 'Mamie', 'Rebecca', 'Joëlle', 'Fifi', 'Gracia', 'Christelle', 'Laetitia', 'Sandrine', 'Anne'],
    last: ['Mbuyi', 'Kabongo', 'Ilunga', 'Mukendi', 'Kasongo', 'Ngoy', 'Lukusa', 'Mutombo', 'Kalala', 'Banza', 'Mwamba', 'Kanku', 'Tshibangu', 'Kalonji', 'Mbala', 'Nzuzi', 'Lumbala', 'Makiese', 'Matondo', 'Nsimba', 'Lusamba', 'Kayembe', 'Mpiana', 'Kitenge', 'Mulumba', 'Tshimanga', 'Bokele', 'Mbemba', 'Lokonga', 'Kapinga'],
  },
  angolan: {
    male: ['João', 'Manuel', 'António', 'José', 'Domingos', 'Francisco', 'Pedro', 'Paulo', 'Mário', 'Agostinho', 'Adão', 'Nelson', 'Edson', 'Hélder', 'Osvaldo', 'Mateus', 'Kiluanji', 'Ngola', 'Kiala', 'Lukeny', 'Isaías', 'Felisberto', 'Cláudio', 'Teodoro', 'Bento', 'Márcio', 'Délcio', 'Joaquim', 'Fernando', 'Luís'],
    female: ['Maria', 'Ana', 'Teresa', 'Isabel', 'Joana', 'Rosa', 'Luísa', 'Esperança', 'Fátima', 'Graça', 'Domingas', 'Madalena', 'Conceição', 'Lurdes', 'Celeste', 'Albertina', 'Josefa', 'Cecília', 'Nzinga', 'Ngueve', 'Tchissola', 'Yola', 'Ermelinda', 'Filomena', 'Marta', 'Rita', 'Benvinda', 'Paula', 'Isménia', 'Djamila'],
    last: ['dos Santos', 'da Silva', 'Fernandes', 'Lourenço', 'Domingos', 'Neto', 'Mendes', 'Kiala', 'Mbala', 'Gonçalves', 'Sebastião', 'João', 'Manuel', 'Pedro', 'António', 'Francisco', 'Baptista', 'Cardoso', 'Pinto', 'Kassoma', 'Sapalo', 'Caetano', 'Bumba', 'Cassule', 'Ngonga', 'Mateus', 'Kapitango', 'Kiluange', 'Tavares', 'Quintas'],
  },
  southern_african: {
    male: ['Thabo', 'Sipho', 'Bongani', 'Lwazi', 'Mandla', 'Sibusiso', 'Themba', 'Kagiso', 'Tshepo', 'Siyabonga', 'Andile', 'Xolani', 'Musa', 'Jabulani', 'Vusi', 'Thulani', 'Lethabo', 'Bheki', 'Sizwe', 'Tumelo', 'Katlego', 'Thato', 'Kabelo', 'Mthunzi', 'Johan', 'Pieter', 'Ruan', 'Craig', 'Liam', 'Ethan'],
    female: ['Nomvula', 'Thandiwe', 'Lerato', 'Zanele', 'Naledi', 'Ayanda', 'Nandi', 'Palesa', 'Busisiwe', 'Nokuthula', 'Precious', 'Khanyisile', 'Lindiwe', 'Mbali', 'Nosipho', 'Refilwe', 'Thandeka', 'Zinhle', 'Boitumelo', 'Dineo', 'Kgomotso', 'Nomsa', 'Sindisiwe', 'Amahle', 'Lesedi', 'Anele', 'Ntombi', 'Annelie', 'Chantelle', 'Candice'],
    last: ['Nkosi', 'Dlamini', 'Ndlovu', 'Khumalo', 'Mokoena', 'Mthembu', 'Zulu', 'Ngcobo', 'Buthelezi', 'Mahlangu', 'Shabalala', 'Sithole', 'Mkhize', 'Cele', 'Molefe', 'Mabaso', 'Radebe', 'Tshabalala', 'Ntuli', 'Hlongwane', 'Mofokeng', 'Nel', 'Botha', 'van der Merwe', 'Pretorius', 'Venter', 'Naidoo', 'Pillay', 'Smith', 'Jacobs'],
  },
  zimbabwean: {
    male: ['Tendai', 'Tatenda', 'Farai', 'Tafadzwa', 'Kudakwashe', 'Tinashe', 'Tapiwa', 'Takudzwa', 'Simbarashe', 'Tawanda', 'Blessing', 'Nigel', 'Tonderai', 'Munyaradzi', 'Kudzai', 'Panashe', 'Anesu', 'Tanaka', 'Tichaona', 'Mufaro', 'Takunda', 'Kundai', 'Shingai', 'Tafara', 'Tinotenda', 'Godknows', 'Lovemore', 'Trust', 'Brighton', 'Innocent'],
    female: ['Chipo', 'Nyasha', 'Rutendo', 'Rumbidzai', 'Tsitsi', 'Vimbai', 'Fadzai', 'Ruvimbo', 'Chiedza', 'Tariro', 'Ropafadzo', 'Nokutenda', 'Tanyaradzwa', 'Kudzaishe', 'Primrose', 'Precious', 'Memory', 'Charity', 'Patience', 'Fungai', 'Nyarai', 'Rudo', 'Shamiso', 'Tadiwa', 'Sibongile', 'Nomalanga', 'Ratidzo', 'Mazvita', 'Anotida', 'Netsai'],
    last: ['Moyo', 'Ncube', 'Sibanda', 'Dube', 'Mpofu', 'Nyathi', 'Ndlovu', 'Banda', 'Phiri', 'Chikwanha', 'Mutasa', 'Mapfumo', 'Gumbo', 'Hove', 'Marufu', 'Makoni', 'Chari', 'Shumba', 'Zhou', 'Mhlanga', 'Muzenda', 'Chigumba', 'Matanda', 'Nyoni', 'Masuku', 'Mlambo', 'Chirwa', 'Kaseke', 'Murwira', 'Mutizwa'],
  },
  melanesian: {
    male: ['John', 'Peter', 'Michael', 'Joseph', 'James', 'Paul', 'David', 'Thomas', 'Samuel', 'Moses', 'Joshua', 'Steven', 'Daniel', 'Philip', 'Patrick', 'Gabriel', 'Simon', 'Andrew', 'Timothy', 'Kila', 'Bomai', 'Kaupa', 'Namah', 'Ruka', 'Kenny', 'Junior', 'Elias', 'Benjamin', 'Dominic', 'Lucas'],
    female: ['Mary', 'Grace', 'Ruth', 'Elizabeth', 'Margaret', 'Anna', 'Rose', 'Esther', 'Rebecca', 'Joyce', 'Agnes', 'Martha', 'Naomi', 'Dorothy', 'Susan', 'Helen', 'Christine', 'Janet', 'Lucy', 'Josephine', 'Priscilla', 'Miriam', 'Sarah', 'Nancy', 'Lydia', 'Delilah', 'Monica', 'Theresa', 'Florence', 'Hilda'],
    last: ['Kila', 'Namaliu', 'Somare', 'Marape', 'Wingti', 'Pato', 'Kumul', 'Tau', 'Kaupa', 'Wari', 'Polye', 'Agarobe', 'Waine', 'Temu', 'Kapi', 'Aopi', 'Pundari', 'Kambu', 'Basil', 'Morauta', 'Puka', 'Toti', 'Yansom', 'Maru', 'Ipatas', 'Kua', 'Lus', 'Napi', 'Kombe', 'Gelu'],
  },
  polynesian: {
    male: ['Sione', 'Iosefa', 'Tavita', 'Ioane', 'Peni', 'Mikaele', 'Pita', 'Aleki', 'Sefo', 'Falani', 'Elisaia', 'Simi', 'Paulo', 'Tomasi', 'Malaki', 'Tanielu', 'Sanele', 'Ropati', 'Filipo', 'Saia', 'Lafaele', 'Manu', 'Tasi', 'Fetu', 'Afa', 'Iakopo', 'Petelo', 'Iosua', 'Samuelu', 'Tupe'],
    female: ['Mele', 'Sina', 'Malia', 'Losa', 'Ana', 'Lusia', 'Seini', 'Sefa', 'Talia', 'Moana', 'Luisa', 'Salote', 'Iulia', 'Mareta', 'Lagi', 'Ese', 'Lupe', 'Teuila', 'Alofa', 'Manaia', 'Ruta', 'Mata', 'Sieni', 'Eseta', 'Vaimoana', 'Losana', 'Silia', 'Fiafia', 'Tina', 'Leona'],
    last: ['Faleolo', 'Tuilagi', 'Leota', 'Sapolu', 'Fuimaono', 'Tauiliili', 'Seiuli', 'Fonoti', 'Pouono', 'Tuiasosopo', 'Aumua', 'Faumuina', 'Masoe', 'Aiono', 'Lefiti', 'Tuiloma', 'Peniamina', 'Toleafoa', 'Afamasaga', 'Lealofi', 'Taliaoa', 'Ioane', 'Leavasa', 'Soliai', 'Tuimavave', 'Alapati', 'Vaai', 'Talataina', 'Paepae', 'Schwenke'],
  },
}

// ---------------------------------------------------------------------------
// Per-country name pools
//
// Several countries share a regional pool above. Where neighbors really name their kids
// differently (Brazil vs Portugal, Buenos Aires vs Mexico City vs Havana, Oslo vs Stockholm,
// Nairobi vs Kampala, Beirut vs Baghdad, Riyadh vs Dubai, Algiers vs Casablanca), these
// compact pools are used first. A country without one falls back to its regional pool.

const RIOPLATENSE: NamePool = {
  male: ['Santiago', 'Mateo', 'Benjamín', 'Joaquín', 'Thiago', 'Bautista', 'Felipe', 'Tomás', 'Valentino', 'Facundo', 'Nicolás', 'Agustín', 'Lautaro', 'Matías', 'Franco', 'Gonzalo', 'Martín', 'Ignacio', 'Federico', 'Diego', 'Sebastián', 'Juan Cruz'],
  female: ['Sofía', 'Martina', 'Valentina', 'Catalina', 'Emilia', 'Isabella', 'Olivia', 'Mía', 'Camila', 'Lucía', 'Julieta', 'Agustina', 'Florencia', 'Micaela', 'Milagros', 'Paula', 'Rocío', 'Antonella', 'Delfina', 'Constanza', 'Belén', 'Guadalupe'],
  last: ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'García', 'Sánchez', 'Romero', 'Sosa', 'Álvarez', 'Torres', 'Ruiz', 'Benítez', 'Acosta', 'Medina', 'Herrera', 'Suárez', 'Rossi', 'Ferrari', 'Russo', 'Bianchi', 'Romano', 'Gallo', 'Ricci', 'Greco', 'Marino', 'Lombardi', 'Fontana', 'Moretti'],
}

const CARIBBEAN_SPANISH_LAST = ['Rodríguez', 'Pérez', 'González', 'Hernández', 'López', 'Martínez', 'García', 'Díaz', 'Sánchez', 'Ramírez', 'Rivera', 'Torres', 'Ortiz', 'Reyes', 'Cruz', 'Morales', 'Colón', 'Vázquez', 'Medina', 'Peña', 'Batista', 'Castillo', 'Fernández', 'Álvarez', 'Herrera', 'Cabrera', 'Guzmán', 'Polanco', 'Figueroa', 'Matos', 'Quiñones', 'Santana']

const ARABIC_LAST = NAME_POOLS.arabic.last

export const COUNTRY_NAME_POOLS: Record<string, NamePool> = {
  // Brazil and Portugal: same language, different baby-name charts.
  br: {
    male: ['Miguel', 'Arthur', 'Gael', 'Heitor', 'Theo', 'Davi', 'Gabriel', 'Bernardo', 'Samuel', 'João Pedro', 'Pedro', 'Lucas', 'Matheus', 'Guilherme', 'Enzo', 'Rafael', 'Gustavo', 'Felipe', 'Caio', 'Vinícius', 'Thiago', 'Bruno', 'Leonardo', 'Kauã', 'Luiz', 'Paulo', 'Wesley', 'Anderson'],
    female: ['Helena', 'Alice', 'Laura', 'Maria Alice', 'Valentina', 'Heloísa', 'Manuela', 'Júlia', 'Sophia', 'Isabella', 'Maria Clara', 'Lívia', 'Beatriz', 'Ana Clara', 'Larissa', 'Letícia', 'Camila', 'Fernanda', 'Amanda', 'Bianca', 'Luana', 'Yasmin', 'Gabriela', 'Bruna', 'Daniela', 'Jéssica'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Alves', 'Carvalho', 'Araújo', 'Ribeiro', 'Gomes', 'Barbosa', 'Rocha', 'Cavalcanti', 'Moura', 'Melo', 'Barros', 'Freitas', 'Cardoso', 'Dias', 'Batista', 'Teixeira', 'Vieira', 'Monteiro', 'Andrade'],
  },
  pt: {
    male: ['João', 'Francisco', 'Afonso', 'Duarte', 'Tomás', 'Rodrigo', 'Martim', 'Santiago', 'Gonçalo', 'Diogo', 'Tiago', 'Miguel', 'Pedro', 'Rui', 'Nuno', 'Bernardo', 'Vasco', 'Simão', 'Lourenço', 'Guilherme', 'António', 'Manuel', 'José', 'Ricardo'],
    female: ['Maria', 'Leonor', 'Matilde', 'Beatriz', 'Carolina', 'Mariana', 'Inês', 'Margarida', 'Ana', 'Francisca', 'Joana', 'Rita', 'Sofia', 'Catarina', 'Teresa', 'Benedita', 'Constança', 'Madalena', 'Filipa', 'Marta', 'Raquel', 'Patrícia'],
    last: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Jesus', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira', 'Moreira', 'Correia', 'Mendes', 'Nunes', 'Soares', 'Vieira', 'Monteiro', 'Cardoso', 'Rocha'],
  },
  // The River Plate: Spanish and Italian surnames side by side.
  ar: RIOPLATENSE,
  uy: { ...RIOPLATENSE, last: [...RIOPLATENSE.last, 'Silva', 'Pereira', 'Olivera', 'Núñez', 'Cabrera', 'Techera'] },
  mx: {
    male: ['Santiago', 'Mateo', 'Sebastián', 'Leonardo', 'Emiliano', 'Diego', 'Miguel Ángel', 'Daniel', 'José Luis', 'Juan Pablo', 'Luis Fernando', 'Jesús', 'Francisco', 'Alejandro', 'Ricardo', 'Eduardo', 'Fernando', 'Iker', 'Rodrigo', 'Javier', 'Carlos', 'Jorge', 'Héctor', 'Arturo'],
    female: ['Sofía', 'María José', 'Valentina', 'Ximena', 'Regina', 'Camila', 'Renata', 'Guadalupe', 'Fernanda', 'Daniela', 'Mariana', 'Itzel', 'Andrea', 'Montserrat', 'Alejandra', 'Paola', 'Brenda', 'Karla', 'Diana', 'Natalia', 'Victoria', 'Valeria', 'Rosa', 'Verónica'],
    last: ['Hernández', 'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Morales', 'Vázquez', 'Reyes', 'Jiménez', 'Torres', 'Díaz', 'Gutiérrez', 'Ruiz', 'Mendoza', 'Aguilar', 'Ortiz', 'Moreno', 'Castillo', 'Romero', 'Álvarez', 'Chávez', 'Rivera', 'Juárez', 'Domínguez', 'Salazar', 'Guzmán'],
  },
  cu: {
    male: ['Yoel', 'Yasiel', 'Yunior', 'Osmany', 'Yoandry', 'Reinier', 'Alexei', 'Dayron', 'Lázaro', 'Raúl', 'Ernesto', 'Alejandro', 'Carlos', 'Jorge', 'Yusniel', 'Ariel', 'Orlando', 'Rolando', 'Pedro', 'Manuel'],
    female: ['Yanelis', 'Yamilé', 'Dayana', 'Yudith', 'Mayelín', 'Yaimara', 'Arianna', 'Lisandra', 'Odalys', 'Marisleydis', 'Yuliet', 'Daimí', 'Mileydis', 'Elena', 'Camila', 'Yanet', 'Ileana', 'Niurka', 'Beatriz', 'Liset'],
    last: CARIBBEAN_SPANISH_LAST,
  },
  do: {
    male: ['José', 'Juan Carlos', 'Ramón', 'Rafael', 'Franklin', 'Starlin', 'Wilkin', 'Manuel', 'Luis Miguel', 'Pedro', 'Frank', 'Yunior', 'Edwin', 'Víctor', 'Ángel', 'Johan', 'Ezequiel', 'Jeison', 'Moisés', 'Darío'],
    female: ['María', 'Yokasta', 'Yudelka', 'Yanely', 'Rosanna', 'Carolina', 'Altagracia', 'Yesenia', 'Miguelina', 'Nicole', 'Esmeralda', 'Paola', 'Wanda', 'Ana Mercedes', 'Juana', 'Yaritza', 'Dayana', 'Mildred', 'Leidy', 'Arisleyda'],
    last: CARIBBEAN_SPANISH_LAST,
  },
  pr: {
    male: ['José', 'Luis', 'Carlos', 'Ángel', 'Jorge', 'Juan', 'Xavier', 'Jan Carlos', 'Jayden', 'Kevin', 'Edwin', 'Héctor', 'Gabriel', 'Adrián', 'Yadiel', 'Javier', 'Ricardo', 'Alexis', 'Sebastián', 'Jean Paul'],
    female: ['María', 'Yaritza', 'Keishla', 'Nilda', 'Gloria', 'Carmen', 'Zoraida', 'Wanda', 'Ivelisse', 'Mariela', 'Nayeli', 'Kiara', 'Génesis', 'Yamilet', 'Coral', 'Brenda', 'Lourdes', 'Ana', 'Gisselle', 'Yesenia'],
    last: [...CARIBBEAN_SPANISH_LAST, 'Santiago', 'Rosario', 'Acevedo', 'Maldonado'],
  },
  // Andorra: Catalan first and last names (Meritxell is the patron saint).
  ad: {
    male: ['Jordi', 'Pau', 'Marc', 'Joan', 'Arnau', 'Pol', 'Oriol', 'Albert', 'Xavier', 'Jaume', 'Gerard', 'Martí', 'Biel', 'Èric', 'Àlex', 'Josep', 'Ramon', 'David', 'Sergi', 'Toni'],
    female: ['Núria', 'Montserrat', 'Laia', 'Júlia', 'Anna', 'Mireia', 'Marta', 'Clara', 'Aina', 'Martina', 'Berta', 'Carla', 'Mercè', 'Meritxell', 'Roser', 'Gemma', 'Laura', 'Ariadna', 'Sílvia', 'Neus'],
    last: ['Martí', 'Rossell', 'Cerqueda', 'Naudi', 'Riba', 'Font', 'Casal', 'Marsal', 'Pallarès', 'Duró', 'Moles', 'Areny', 'Pujal', 'Ribó', 'Pons', 'Puig', 'Vila', 'Serra', 'Mas', 'Coma', 'Bonell', 'Camp', 'Fernández', 'García', 'Lopes'],
  },
  // Aruba: Papiamento island names, Dutch and Spanish roots.
  aw: {
    male: ['Jair', 'Ryan', 'Giovanni', 'Gregory', 'Rudy', 'Edwin', 'Jurgen', 'Ruben', 'Ricardo', 'Daniel', 'Luis', 'Juan', 'Rignald', 'Dwight', 'Glenn', 'Mike', 'Kevin', 'Jeffrey', 'Raymond', 'Shurendy'],
    female: ['Ingrid', 'Jacqueline', 'Melissa', 'Shirley', 'Evelyn', 'Michelle', 'Monique', 'Natasha', 'Nathaly', 'Yolanda', 'Rosalinda', 'Vanessa', 'Desiree', 'Gisella', 'Kimberly', 'Daisy', 'Sharon', 'Maria', 'Jennifer', 'Esther'],
    last: ['Croes', 'Arends', 'Kock', 'Tromp', 'Werleman', 'Geerman', 'Maduro', 'Wever', 'Oduber', 'Thijsen', 'Lacle', 'Dirksz', 'Henriquez', 'Eman', 'Ponson', 'Figaroa', 'Boekhoudt', 'Lampe', 'Rasmijn', 'Kelly', 'Vrolijk', 'de Cuba'],
  },
  au: {
    male: ['Oliver', 'Noah', 'Jack', 'William', 'Leo', 'Lucas', 'Thomas', 'Henry', 'Charlie', 'James', 'Hudson', 'Lachlan', 'Harrison', 'Cooper', 'Mitchell', 'Riley', 'Bailey', 'Jayden', 'Liam', 'Ethan', 'Josh', 'Hamish', 'Angus', 'Darcy'],
    female: ['Charlotte', 'Olivia', 'Amelia', 'Isla', 'Mia', 'Ava', 'Grace', 'Chloe', 'Matilda', 'Ruby', 'Zoe', 'Sienna', 'Jessica', 'Emily', 'Sophie', 'Georgia', 'Hannah', 'Lily', 'Tahlia', 'Isabella', 'Brooke', 'Kayla'],
    last: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Johnson', 'White', 'Martin', 'Anderson', 'Thompson', 'Nguyen', 'Thomas', 'Walker', 'Harris', 'Lee', 'Ryan', 'Robinson', 'Kelly', 'King', 'Campbell', 'Mitchell', "O'Brien", 'Murphy', 'Clarke', 'Young', 'Hall', 'Wright', 'Edwards', 'Collins'],
  },
  // New Zealand: Kiwi and Māori names.
  nz: {
    male: ['Oliver', 'Jack', 'Noah', 'Leo', 'George', 'Charlie', 'Lucas', 'William', 'Thomas', 'James', 'Hunter', 'Mason', 'Liam', 'Nikau', 'Ari', 'Tama', 'Wiremu', 'Rawiri', 'Hemi', 'Manaia', 'Tāne', 'Kauri'],
    female: ['Isla', 'Charlotte', 'Olivia', 'Amelia', 'Mia', 'Ava', 'Lily', 'Sophie', 'Harper', 'Ruby', 'Grace', 'Aria', 'Mila', 'Aroha', 'Anahera', 'Mere', 'Kaia', 'Hine', 'Ngaio', 'Maia', 'Kahurangi', 'Mereana'],
    last: ['Smith', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Jones', 'Singh', 'Thompson', 'Walker', 'Anderson', 'Campbell', 'Harris', 'Martin', 'Kelly', 'Robinson', 'Clark', 'Ngata', 'Parata', 'Tamihana', 'Te Rangi', 'Pōmare', 'Tipene', 'Rewiti', 'Paewai', 'Kingi', 'Wihongi'],
  },
  at: {
    male: ['Lukas', 'Tobias', 'David', 'Maximilian', 'Elias', 'Jakob', 'Felix', 'Paul', 'Florian', 'Fabian', 'Simon', 'Sebastian', 'Stefan', 'Johannes', 'Matthias', 'Alexander', 'Leon', 'Moritz', 'Valentin', 'Raphael', 'Gerhard', 'Franz', 'Josef', 'Markus'],
    female: ['Anna', 'Hannah', 'Lena', 'Sophie', 'Marie', 'Laura', 'Lea', 'Emilia', 'Valentina', 'Katharina', 'Magdalena', 'Johanna', 'Theresa', 'Julia', 'Sarah', 'Elena', 'Lisa', 'Viktoria', 'Christina', 'Barbara', 'Elisabeth', 'Sabine'],
    last: ['Gruber', 'Huber', 'Bauer', 'Wagner', 'Müller', 'Pichler', 'Steiner', 'Moser', 'Mayer', 'Hofer', 'Leitner', 'Berger', 'Fuchs', 'Eder', 'Fischer', 'Schmid', 'Winkler', 'Weber', 'Schwarz', 'Maier', 'Reiter', 'Mayr', 'Wimmer', 'Egger', 'Brunner', 'Lang', 'Baumgartner', 'Auer'],
  },
  // Switzerland: German, French and Italian Switzerland in one pool.
  ch: {
    male: ['Noah', 'Liam', 'Luca', 'Matteo', 'Leon', 'Elias', 'Gabriel', 'Nico', 'Samuel', 'Lukas', 'Jonas', 'Andrin', 'Reto', 'Urs', 'Beat', 'Thomas', 'Daniel', 'Marco', 'Nicolas', 'Julien', 'Loïc', 'Mathis', 'Lorenzo'],
    female: ['Mia', 'Emma', 'Lina', 'Mila', 'Elena', 'Lara', 'Lea', 'Sofia', 'Laura', 'Anna', 'Nina', 'Seraina', 'Ursula', 'Ruth', 'Chloé', 'Léa', 'Camille', 'Giulia', 'Alessia', 'Martina', 'Corinne', 'Céline'],
    last: ['Müller', 'Meier', 'Schmid', 'Keller', 'Weber', 'Huber', 'Meyer', 'Schneider', 'Steiner', 'Fischer', 'Gerber', 'Brunner', 'Baumann', 'Frei', 'Zimmermann', 'Moser', 'Widmer', 'Wyss', 'Graf', 'Roth', 'Favre', 'Rochat', 'Bonvin', 'Rossi', 'Bernasconi', 'Fontana', 'Gasser', 'Lüthi'],
  },
  dk: {
    male: ['William', 'Noah', 'Oscar', 'Lucas', 'Carl', 'Victor', 'Malthe', 'Alfred', 'Emil', 'Aksel', 'Valdemar', 'Magnus', 'Frederik', 'Mikkel', 'Rasmus', 'Kasper', 'Mads', 'Søren', 'Jens', 'Anders', 'Christian', 'Henrik', 'Morten', 'Niels'],
    female: ['Ida', 'Emma', 'Alma', 'Clara', 'Freja', 'Agnes', 'Karla', 'Ella', 'Olivia', 'Josefine', 'Sofie', 'Mathilde', 'Laura', 'Signe', 'Cecilie', 'Mette', 'Anne', 'Camilla', 'Line', 'Maja', 'Astrid', 'Karen'],
    last: ['Nielsen', 'Jensen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Jørgensen', 'Petersen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen', 'Christiansen', 'Poulsen', 'Johansen', 'Møller', 'Mortensen', 'Knudsen', 'Jakobsen', 'Mikkelsen', 'Frederiksen', 'Lund', 'Holm', 'Eriksen', 'Kjær', 'Dam'],
  },
  no: {
    male: ['Jakob', 'Emil', 'Noah', 'Oliver', 'Filip', 'William', 'Lucas', 'Liam', 'Henrik', 'Aksel', 'Ola', 'Kristian', 'Sindre', 'Eirik', 'Magnus', 'Håkon', 'Even', 'Sander', 'Martin', 'Lars', 'Knut', 'Bjørn', 'Tor', 'Olav'],
    female: ['Nora', 'Emma', 'Ella', 'Maja', 'Olivia', 'Sofie', 'Ingrid', 'Leah', 'Frida', 'Astrid', 'Sara', 'Tiril', 'Ingeborg', 'Silje', 'Kari', 'Hanne', 'Ragnhild', 'Solveig', 'Marit', 'Hedda', 'Tuva', 'Thea', 'Synnøve'],
    last: ['Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Pedersen', 'Nilsen', 'Kristiansen', 'Jensen', 'Karlsen', 'Johnsen', 'Pettersen', 'Eriksen', 'Berg', 'Haugen', 'Hagen', 'Johannessen', 'Andreassen', 'Jacobsen', 'Dahl', 'Halvorsen', 'Lund', 'Solberg', 'Strand', 'Bakken', 'Moen', 'Lie', 'Aas', 'Nygård'],
  },
  se: {
    male: ['William', 'Liam', 'Noah', 'Hugo', 'Lucas', 'Oliver', 'Elias', 'Alexander', 'Adam', 'Charlie', 'Isak', 'Ludvig', 'Axel', 'Nils', 'Erik', 'Johan', 'Anders', 'Lars', 'Karl', 'Per', 'Mats', 'Gustav', 'Viktor', 'Oskar'],
    female: ['Alice', 'Maja', 'Vera', 'Elsa', 'Astrid', 'Selma', 'Ella', 'Alma', 'Wilma', 'Saga', 'Ebba', 'Agnes', 'Linnea', 'Klara', 'Ingrid', 'Karin', 'Anna', 'Eva', 'Kristina', 'Birgitta', 'Malin', 'Sofia', 'Lena', 'Frida'],
    last: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson', 'Pettersson', 'Jonsson', 'Jansson', 'Hansson', 'Bengtsson', 'Jönsson', 'Lindberg', 'Jakobsson', 'Magnusson', 'Lindström', 'Olofsson', 'Lindqvist', 'Lindgren', 'Berg', 'Axelsson', 'Bergström', 'Lundberg', 'Lind', 'Lundgren', 'Mattsson'],
  },
  hr: {
    male: ['Luka', 'Ivan', 'David', 'Jakov', 'Petar', 'Marko', 'Josip', 'Matej', 'Mateo', 'Ante', 'Tomislav', 'Krešimir', 'Dario', 'Filip', 'Fran', 'Leon', 'Roko', 'Toma', 'Stjepan', 'Zvonimir', 'Hrvoje', 'Damir'],
    female: ['Mia', 'Lucija', 'Ema', 'Nika', 'Sara', 'Petra', 'Ana', 'Marta', 'Lana', 'Iva', 'Ivana', 'Marija', 'Katarina', 'Nikolina', 'Martina', 'Mirela', 'Gordana', 'Vesna', 'Lea', 'Rita', 'Dora', 'Klara'],
    last: ['Horvat', 'Kovačević', 'Babić', 'Marić', 'Jurić', 'Novak', 'Kovačić', 'Knežević', 'Vuković', 'Marković', 'Petrović', 'Matić', 'Tomić', 'Pavlović', 'Perić', 'Božić', 'Blažević', 'Grgić', 'Pavić', 'Radić', 'Šarić', 'Lovrić', 'Vidović', 'Jukić', 'Galić', 'Brkić', 'Mandić', 'Barišić', 'Šimić'],
  },
  rs: {
    male: ['Stefan', 'Luka', 'Lazar', 'Nikola', 'Marko', 'Filip', 'Aleksa', 'Vuk', 'Uroš', 'Miloš', 'Đorđe', 'Mihajlo', 'Dušan', 'Nemanja', 'Petar', 'Jovan', 'Dragan', 'Zoran', 'Goran', 'Dejan', 'Nenad', 'Milan', 'Vladimir', 'Bojan'],
    female: ['Milica', 'Jelena', 'Ana', 'Marija', 'Teodora', 'Sara', 'Jovana', 'Dunja', 'Tijana', 'Katarina', 'Anđela', 'Nevena', 'Sofija', 'Mina', 'Snežana', 'Dragana', 'Mirjana', 'Gordana', 'Ljiljana', 'Biljana', 'Vesna', 'Ivana'],
    last: ['Jovanović', 'Petrović', 'Nikolić', 'Marković', 'Đorđević', 'Stojanović', 'Ilić', 'Stanković', 'Pavlović', 'Milošević', 'Popović', 'Živković', 'Janković', 'Todorović', 'Kostić', 'Ristić', 'Lazić', 'Mitrović', 'Obradović', 'Savić', 'Vasić', 'Simić', 'Milenković', 'Stevanović', 'Radovanović', 'Lukić', 'Marinković'],
  },
  cz: {
    male: ['Jakub', 'Jan', 'Tomáš', 'Petr', 'Martin', 'Lukáš', 'Ondřej', 'Matěj', 'Vojtěch', 'Adam', 'Filip', 'David', 'Josef', 'Jiří', 'Pavel', 'Michal', 'Václav', 'Karel', 'Zdeněk', 'Jaroslav', 'Miroslav', 'Antonín'],
    female: ['Eliška', 'Tereza', 'Anna', 'Adéla', 'Natálie', 'Karolína', 'Kristýna', 'Barbora', 'Lucie', 'Kateřina', 'Markéta', 'Petra', 'Jana', 'Hana', 'Lenka', 'Veronika', 'Klára', 'Zuzana', 'Jitka', 'Alžběta', 'Věra', 'Marie'],
    last: ['Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec', 'Marek', 'Pospíšil', 'Pokorný', 'Hájek', 'Král', 'Jelínek', 'Růžička', 'Beneš', 'Fiala', 'Sedláček', 'Doležal', 'Zeman', 'Kolář', 'Navrátil', 'Čermák', 'Urban', 'Vaněk', 'Blažek', 'Kříž'],
  },
  sk: {
    male: ['Ján', 'Peter', 'Jozef', 'Martin', 'Michal', 'Tomáš', 'Matúš', 'Jakub', 'Samuel', 'Lukáš', 'Marek', 'Juraj', 'Milan', 'Dominik', 'Šimon', 'Adam', 'Filip', 'Pavol', 'Štefan', 'Miroslav'],
    female: ['Sofia', 'Ema', 'Viktória', 'Natália', 'Nina', 'Lucia', 'Zuzana', 'Katarína', 'Mária', 'Eva', 'Jana', 'Martina', 'Veronika', 'Simona', 'Michaela', 'Petra', 'Monika', 'Lenka', 'Alžbeta', 'Kristína'],
    last: ['Horváth', 'Kováč', 'Varga', 'Tóth', 'Nagy', 'Baláž', 'Szabó', 'Molnár', 'Balog', 'Lukáč', 'Novák', 'Kollár', 'Németh', 'Oravec', 'Polák', 'Hudák', 'Gajdoš', 'Krajčí', 'Šimko', 'Hrivnák', 'Bartoš', 'Kráľ'],
  },
  ke: {
    male: ['Brian', 'Kevin', 'Dennis', 'Collins', 'Victor', 'Ian', 'Emmanuel', 'Otieno', 'Ochieng', 'Omondi', 'Kamau', 'Njoroge', 'Kipchoge', 'Kibet', 'Kiprop', 'Kiptoo', 'Mwangi', 'Wekesa', 'Mutua', 'Baraka', 'Juma', 'Wafula', 'Kimani', 'Mohamed'],
    female: ['Wanjiru', 'Wanjiku', 'Njeri', 'Wambui', 'Nyambura', 'Achieng', 'Akinyi', 'Atieno', 'Auma', 'Chebet', 'Jepkosgei', 'Cherono', 'Mumbua', 'Makena', 'Faith', 'Mercy', 'Sharon', 'Esther', 'Neema', 'Zawadi', 'Nafula', 'Halima'],
    last: ['Mwangi', 'Otieno', 'Kamau', 'Odhiambo', 'Ochieng', 'Kariuki', 'Njoroge', 'Wafula', 'Mutua', 'Kiprotich', 'Cheruiyot', 'Kipchumba', 'Onyango', 'Owino', 'Wanjala', 'Kimani', 'Macharia', 'Ndungu', 'Omondi', 'Barasa', 'Maina', 'Kiplagat', 'Rotich', 'Mutiso', 'Musyoka', 'Wambua', 'Korir', 'Keter', 'Njenga', 'Gitau'],
  },
  ug: {
    male: ['Mugisha', 'Okello', 'Kato', 'Opio', 'Ssemakula', 'Ssali', 'Mukasa', 'Kizza', 'Tumusiime', 'Byaruhanga', 'Musoke', 'Ochen', 'Odongo', 'Wasswa', 'Kigozi', 'Joseph', 'Moses', 'Isaac', 'Samuel', 'Ronald', 'Brian', 'Emmanuel', 'Godfrey', 'Patrick'],
    female: ['Nakato', 'Babirye', 'Namubiru', 'Nansubuga', 'Nalwoga', 'Nabukenya', 'Akello', 'Atim', 'Auma', 'Kyomuhendo', 'Ainembabazi', 'Kemigisha', 'Nakimuli', 'Achola', 'Grace', 'Esther', 'Prossy', 'Sylvia', 'Harriet', 'Juliet', 'Brenda', 'Doreen'],
    last: ['Okello', 'Mugisha', 'Ssempala', 'Byaruhanga', 'Tumusiime', 'Nsubuga', 'Kato', 'Lubega', 'Mukasa', 'Ssemwogerere', 'Musoke', 'Kiggundu', 'Kasozi', 'Wasswa', 'Opio', 'Odongo', 'Akena', 'Otim', 'Nuwagaba', 'Kabuye', 'Kizito', 'Atwine', 'Asiimwe', 'Byamukama', 'Ssekandi', 'Mutebi'],
  },
  // The Levant and Iraq: Christian and Muslim names in Beirut, Aleppo dialect names, Iraqi tribes.
  lb: {
    male: ['Elie', 'Georges', 'Charbel', 'Joseph', 'Rami', 'Ziad', 'Fadi', 'Karim', 'Hadi', 'Ali', 'Hassan', 'Mohammad', 'Omar', 'Wassim', 'Nadim', 'Tarek', 'Marwan', 'Walid', 'Antoine', 'Pierre', 'Jad', 'Rabih', 'Samir', 'Ralph'],
    female: ['Maya', 'Rita', 'Nour', 'Lara', 'Joelle', 'Christelle', 'Nadine', 'Rania', 'Hiba', 'Lina', 'Zeina', 'Rima', 'Mira', 'Yara', 'Carla', 'Tala', 'Sara', 'Layal', 'Nathalie', 'Fatima', 'Zahraa', 'Ghina'],
    last: ['Khoury', 'Haddad', 'Saab', 'Hayek', 'Nasr', 'Frem', 'Karam', 'Daher', 'Salameh', 'Rizk', 'Mansour', 'Khalil', 'Hamdan', 'Moussa', 'Fakhoury', 'Abi Nader', 'Azar', 'Bitar', 'Abou Jaoude', 'Atallah', 'Chidiac', 'Fares', 'Makdessi', 'Sfeir', 'Tannous', 'Zein', 'Hamadeh', 'Khalife', 'Najjar'],
  },
  sy: {
    male: ['Mohammad', 'Ahmad', 'Omar', 'Abdulrahman', 'Khaled', 'Mahmoud', 'Hussam', 'Bassel', 'Ammar', 'Majd', 'Ghaith', 'Rami', 'Fares', 'Yazan', 'Tamer', 'Wael', 'Mazen', 'Nizar', 'Firas', 'Hazem', 'Samer', 'Louay'],
    female: ['Fatima', 'Rahaf', 'Hala', 'Lama', 'Ghina', 'Rasha', 'Raghad', 'Bayan', 'Dima', 'Reem', 'Sham', 'Nour', 'Amal', 'Hanan', 'Sawsan', 'Lubna', 'Rana', 'Mais', 'Yara', 'Joud', 'Aya', 'Ruba'],
    last: ['Halabi', 'Shami', 'Hamwi', 'Homsi', 'Kurdi', 'Darwish', 'Haddad', 'Khatib', 'Sabbagh', 'Attar', 'Jabri', 'Kayyali', 'Mardini', 'Qabbani', 'Zaher', 'Idlibi', 'Al-Ali', 'Hamdan', 'Ibrahim', 'Mustafa', 'Sheikh', 'Aziz', 'Najjar', 'Tarabishi', 'Saleh'],
  },
  iq: {
    male: ['Mohammed', 'Ali', 'Hussein', 'Hassan', 'Ahmed', 'Mustafa', 'Abbas', 'Haider', 'Mahdi', 'Karrar', 'Murtadha', 'Sajjad', 'Ammar', 'Omar', 'Zaid', 'Yasir', 'Qasim', 'Saif', 'Kadhim', 'Jasim', 'Falah', 'Laith'],
    female: ['Zainab', 'Fatima', 'Maryam', 'Noor', 'Zahraa', 'Ruqaya', 'Shahad', 'Rusul', 'Huda', 'Sara', 'Ban', 'Dina', 'Hiba', 'Tabarak', 'Aya', 'Rana', 'Iman', 'Sana', 'Mayada', 'Layla', 'Israa', 'Asmaa'],
    last: ['Al-Jabouri', 'Al-Obaidi', 'Al-Tamimi', 'Al-Rubaie', 'Al-Dulaimi', 'Al-Saadi', 'Al-Musawi', 'Al-Hashimi', 'Al-Khafaji', 'Al-Zubaidi', 'Al-Shammari', 'Al-Ani', 'Al-Bayati', 'Al-Hilli', 'Al-Baghdadi', 'Al-Kaabi', 'Al-Janabi', 'Al-Saedi', 'Al-Lami', 'Al-Azzawi', 'Al-Rawi'],
  },
  jo: {
    male: ['Mohammad', 'Ahmad', 'Omar', 'Yazan', 'Zaid', 'Hamza', 'Abdullah', 'Khaled', 'Laith', 'Odai', 'Tamer', 'Fadi', 'Mahmoud', 'Ibrahim', 'Mohannad', 'Rakan', 'Ayman', 'Bashar', 'Suhaib', 'Anas', 'Hashem'],
    female: ['Sara', 'Lana', 'Dana', 'Rawan', 'Rahaf', 'Haya', 'Tala', 'Leen', 'Jana', 'Ruba', 'Shatha', 'Reem', 'Lubna', 'Aseel', 'Bayan', 'Noor', 'Hala', 'Dima', 'Abeer', 'Areej', 'Maram', 'Yara'],
    last: ['Al-Majali', 'Al-Zoubi', 'Haddad', 'Al-Khatib', 'Al-Masri', 'Al-Nsour', 'Al-Fayez', 'Obeidat', 'Batayneh', 'Khasawneh', 'Hijazi', 'Rawashdeh', 'Tarawneh', 'Al-Momani', 'Qudah', 'Shdeifat', 'Bani Hani', 'Al-Smadi', 'Hamdan', 'Saleh', 'Nasser', 'Halasa', 'Twal', ...ARABIC_LAST.slice(0, 4)],
  },
  // The Gulf: each emirate and kingdom has its own families.
  sa: {
    male: ['Mohammed', 'Abdullah', 'Fahad', 'Faisal', 'Khalid', 'Saud', 'Sultan', 'Turki', 'Nasser', 'Abdulaziz', 'Abdulrahman', 'Bandar', 'Nawaf', 'Mishal', 'Majed', 'Saad', 'Yazeed', 'Rayan', 'Hamad', 'Ahmed', 'Omar', 'Rakan'],
    female: ['Noura', 'Sara', 'Reem', 'Lama', 'Haya', 'Jawaher', 'Nouf', 'Abeer', 'Deema', 'Raghad', 'Lujain', 'Shahad', 'Ghada', 'Asma', 'Amal', 'Hind', 'Al Anoud', 'Maha', 'Wejdan', 'Hessa', 'Joud', 'Ruba'],
    last: ['Al-Qahtani', 'Al-Otaibi', 'Al-Ghamdi', 'Al-Zahrani', 'Al-Harbi', 'Al-Mutairi', 'Al-Dosari', 'Al-Shehri', 'Al-Anazi', 'Al-Shammari', 'Al-Subaie', 'Al-Rashidi', 'Al-Enezi', 'Al-Juhani', 'Al-Malki', 'Al-Yami', 'Al-Amri', 'Al-Asmari', 'Al-Saleh', 'Al-Hazmi'],
  },
  ae: {
    male: ['Mohammed', 'Rashid', 'Hamdan', 'Saif', 'Khalifa', 'Zayed', 'Sultan', 'Hamad', 'Mansour', 'Ahmed', 'Obaid', 'Saeed', 'Majid', 'Juma', 'Khalid', 'Abdulla', 'Humaid', 'Ali', 'Omar', 'Theyab', 'Mubarak'],
    female: ['Fatima', 'Mariam', 'Shamma', 'Mouza', 'Hessa', 'Latifa', 'Shaikha', 'Alia', 'Maitha', 'Ghaya', 'Afra', 'Wadha', 'Amna', 'Hind', 'Salama', 'Aisha', 'Noora', 'Reem', 'Meera', 'Hamda'],
    last: ['Al Mansoori', 'Al Dhaheri', 'Al Ketbi', 'Al Suwaidi', 'Al Hammadi', 'Al Falasi', 'Al Mazrouei', 'Al Nuaimi', 'Al Kaabi', 'Al Shamsi', 'Al Zaabi', 'Al Marzouqi', 'Al Muhairi', 'Al Romaithi', 'Al Qubaisi', 'Al Hosani', 'Al Ameri', 'Al Blooshi', 'Al Matrooshi', 'Al Awadhi'],
  },
  kw: {
    male: ['Abdullah', 'Mohammad', 'Fahad', 'Ahmad', 'Khaled', 'Yousef', 'Bader', 'Nawaf', 'Mishari', 'Talal', 'Saad', 'Hamad', 'Jaber', 'Abdulaziz', 'Faisal', 'Bandar', 'Mubarak', 'Ali', 'Hasan', 'Salem'],
    female: ['Fatma', 'Dana', 'Noura', 'Shaikha', 'Hessa', 'Lulwa', 'Dalal', 'Sara', 'Fajer', 'Rawan', 'Haya', 'Abrar', 'Mariam', 'Ghadeer', 'Shahad', 'Latifa', 'Bodour', 'Nouf', 'Aseel', 'Manal'],
    last: ['Al-Ajmi', 'Al-Mutairi', 'Al-Enezi', 'Al-Rashidi', 'Al-Azmi', 'Al-Kandari', 'Al-Awadhi', 'Al-Shammari', 'Al-Hajri', 'Al-Fadhli', 'Al-Otaibi', 'Al-Dosari', 'Al-Kharafi', 'Al-Ghanim', 'Al-Saqer', 'Behbehani', 'Al-Bahar', 'Al-Roumi', 'Al-Mulla', 'Al-Qattan'],
  },
  qa: {
    male: ['Mohammed', 'Hamad', 'Jassim', 'Khalifa', 'Tamim', 'Abdulla', 'Ali', 'Ahmed', 'Khalid', 'Nasser', 'Saad', 'Fahad', 'Mubarak', 'Salem', 'Rashid', 'Saoud', 'Hassan', 'Mansoor', 'Ghanim', 'Faisal'],
    female: ['Al Anoud', 'Maryam', 'Noora', 'Fatima', 'Hessa', 'Latifa', 'Moza', 'Sheikha', 'Aisha', 'Lulwa', 'Amna', 'Dana', 'Reem', 'Haya', 'Asma', 'Jawaher', 'Nouf', 'Ghalia', 'Maha', 'Sara'],
    last: ['Al-Kuwari', 'Al-Marri', 'Al-Sulaiti', 'Al-Mohannadi', 'Al-Hajri', 'Al-Naimi', 'Al-Kubaisi', 'Al-Ansari', 'Al-Emadi', 'Al-Mannai', 'Al-Khulaifi', 'Al-Attiyah', 'Al-Misnad', 'Al-Jaber', 'Al-Baker', 'Al-Mahmoud', 'Al-Obaidly', 'Al-Malki', 'Al-Sada'],
  },
  // The Maghreb: Algerian, Moroccan and Tunisian families.
  dz: {
    male: ['Mohamed', 'Amine', 'Yacine', 'Karim', 'Mehdi', 'Rachid', 'Sofiane', 'Bilal', 'Abdelkader', 'Riyad', 'Nassim', 'Walid', 'Ilyes', 'Islam', 'Abderrahmane', 'Fares', 'Djamel', 'Mourad', 'Lyes', 'Hocine', 'Kamel', 'Smail'],
    female: ['Amina', 'Meriem', 'Yasmine', 'Sarah', 'Lina', 'Imane', 'Nour el Houda', 'Rania', 'Khadidja', 'Djamila', 'Nadia', 'Samia', 'Souad', 'Houria', 'Feriel', 'Lynda', 'Kahina', 'Wissam', 'Assia', 'Dounia', 'Chaima', 'Aya'],
    last: ['Benali', 'Bouzid', 'Belkacem', 'Saidi', 'Brahimi', 'Boudiaf', 'Benaissa', 'Hamidi', 'Mebarki', 'Bensalem', 'Cherif', 'Haddad', 'Mansouri', 'Rahmani', 'Boukhari', 'Zerrouki', 'Khelifi', 'Djebbar', 'Ait Ahmed', 'Amrouche', 'Belaid', 'Hadjadj', 'Mokrani', 'Ouali', 'Slimani', 'Ziani'],
  },
  ma: {
    male: ['Mohamed', 'Youssef', 'Hamza', 'Ayoub', 'Anas', 'Othmane', 'Adam', 'Amine', 'Mehdi', 'Hicham', 'Khalid', 'Said', 'Mustapha', 'Rachid', 'Abdelilah', 'Zakaria', 'Ismail', 'Soufiane', 'Hassan', 'Driss', 'Ilyas', 'Badr'],
    female: ['Fatima Zahra', 'Khadija', 'Salma', 'Hajar', 'Imane', 'Zineb', 'Kenza', 'Malak', 'Aya', 'Hiba', 'Ghizlane', 'Siham', 'Nadia', 'Latifa', 'Meryem', 'Chaimae', 'Ikram', 'Oumaima', 'Soukaina', 'Asmae', 'Najat', 'Loubna'],
    last: ['Alaoui', 'Idrissi', 'El Fassi', 'Bennani', 'Tazi', 'Berrada', 'Chraibi', 'Amrani', 'Benjelloun', 'Lahlou', 'Sqalli', 'Bennis', 'Belkadi', 'El Mansouri', 'Ouazzani', 'Kettani', 'Saadi', 'Bouazza', 'Lamrani', 'Zaki', 'Hajji', 'Naciri', 'Ait Brahim', 'Ouahbi'],
  },
  tn: {
    male: ['Mohamed', 'Ahmed', 'Youssef', 'Aziz', 'Amine', 'Skander', 'Rayen', 'Yassine', 'Hamza', 'Wassim', 'Mehdi', 'Oussama', 'Anis', 'Bilel', 'Karim', 'Sami', 'Slim', 'Hatem', 'Mourad', 'Hichem', 'Fethi', 'Ali'],
    female: ['Mariem', 'Yasmine', 'Ines', 'Rim', 'Amira', 'Nour', 'Eya', 'Chaima', 'Sarra', 'Asma', 'Salma', 'Rania', 'Hela', 'Olfa', 'Leila', 'Sonia', 'Najla', 'Wafa', 'Imen', 'Khaoula', 'Sirine', 'Emna'],
    last: ['Trabelsi', 'Jebali', 'Gharbi', 'Ben Youssef', 'Mejri', 'Ayari', 'Ben Ammar', 'Hamdi', 'Chaabane', 'Dridi', 'Hammami', 'Jlassi', 'Khelifi', 'Mabrouk', 'Riahi', 'Saidi', 'Sassi', 'Zouari', 'Ben Salah', 'Ben Hassine', 'Masmoudi', 'Bouslama', 'Baccouche', 'Karoui', 'Chebbi', 'Mrad', 'Ferchichi'],
  },
}

/** Québécois names for babies born in Montreal and Quebec City (Canada is otherwise the anglo pool). */
const QUEBEC: NamePool = {
  male: ['Félix', 'William', 'Liam', 'Thomas', 'Noah', 'Jacob', 'Léo', 'Nathan', 'Samuel', 'Logan', 'Olivier', 'Gabriel', 'Alexis', 'Mathis', 'Raphaël', 'Charles', 'Émile', 'Zachary', 'Jean-François', 'Marc-André', 'Sébastien', 'Mathieu', 'Simon', 'Luc', 'Gilles', 'Réjean'],
  female: ['Olivia', 'Emma', 'Charlotte', 'Alice', 'Florence', 'Léa', 'Livia', 'Rosalie', 'Juliette', 'Zoé', 'Béatrice', 'Camille', 'Laurence', 'Gabrielle', 'Marie-Ève', 'Catherine', 'Mélanie', 'Isabelle', 'Geneviève', 'Nathalie', 'Chantal', 'Sylvie', 'Josée', 'Ginette'],
  last: ['Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'Gagné', 'Ouellet', 'Pelletier', 'Bélanger', 'Lévesque', 'Bergeron', 'Leblanc', 'Paquette', 'Girard', 'Simard', 'Boucher', 'Caron', 'Beaulieu', 'Cloutier', 'Dubé', 'Poirier', 'Fournier', 'Lapointe', 'Leclerc', 'Lefebvre', 'Poulin'],
}

/** How francophone each Quebec city is (chance a local has a Québécois name). */
const QUEBEC_CITIES: Record<string, number> = { 'Quebec City': 0.9, Montreal: 0.65, Laval: 0.7, Gatineau: 0.75, Sherbrooke: 0.85, 'Trois-Rivières': 0.9 }

// ---------------------------------------------------------------------------
// Lookups

const BY_ID: Record<string, Country> = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]))

export function getCountry(id: string): Country {
  return BY_ID[id] ?? COUNTRIES[0]
}

export function randomCountry(g: GameState): Country {
  return weightedPick(g, COUNTRIES, (c) => c.weight)
}

export function randomCity(g: GameState, country: Country): string {
  return pick(g, country.cities)
}

/** The name pool a country uses: its own pool if it has one, else its region's. */
export function namePoolOf(countryId: string): NamePool {
  return COUNTRY_NAME_POOLS[countryId] ?? NAME_POOLS[getCountry(countryId).names] ?? NAME_POOLS.anglo
}

/**
 * Pool for someone from this country. `city` (default: the player's city when they live in
 * that country) picks a regional pool where one city really differs, e.g. Québécois names in
 * Montreal and Quebec City.
 */
function poolFor(g: GameState, countryId: string, city?: string): NamePool {
  const where = city ?? (g.character?.countryId === countryId ? g.character.city : undefined)
  const quebec = countryId === 'ca' && where ? QUEBEC_CITIES[where] : undefined
  if (quebec !== undefined && rand(g) < quebec) return QUEBEC
  return namePoolOf(countryId)
}

export function randomFirstName(g: GameState, countryId: string, gender: Gender, city?: string): string {
  const pool = poolFor(g, countryId, city)
  return pick(g, gender === 'male' ? pool.male : pool.female)
}

export function randomLastName(g: GameState, countryId: string, city?: string): string {
  return pick(g, poolFor(g, countryId, city).last)
}

export function randomSkinTone(g: GameState, country: Country): number {
  return pick(g, country.skinTones)
}

/** Countries on one continent, alphabetical. */
export function countriesIn(continent: Continent): Country[] {
  return COUNTRIES.filter((c) => c.continent === continent).sort((a, b) => a.name.localeCompare(b.name))
}

const NEEDS_ARTICLE = /^(United |Czech Republic|Dominican Republic|DR Congo|Netherlands|Philippines|Bahamas)/

/** Country name as it reads mid-sentence: "the United States", "France". */
export function countryLabel(country: Country): string {
  return NEEDS_ARTICLE.test(country.name) ? `the ${country.name}` : country.name
}

// ---------------------------------------------------------------------------
// Courts

/** Common-law countries where a jury of ordinary citizens decides criminal trials. */
const JURY_TRIALS = new Set(['us', 'ca', 'gb', 'ie', 'au', 'nz', 'jm', 'bs', 'bz', 'gy', 'pr'])
/** Juries only for the gravest crimes (cour d'assises, Brazil's tribunal do júri for killings...). */
const JURY_FOR_SERIOUS = new Set(['fr', 'be', 'at', 'es', 'br', 'ru', 'dk', 'ar'])
/** Lay judges sit next to professional judges (Schöffen, saiban-in, nämndemän...). */
const LAY_JUDGE_TRIALS = new Set(['de', 'se', 'fi', 'no', 'it', 'jp', 'kr', 'pl', 'cz', 'hr'])

export type TrialBy = 'jury' | 'lay' | 'judge'

/**
 * Who decides a criminal case here: a jury, a panel of judges with lay judges, or a judge alone.
 * `severity` (1-5) matters where juries only hear the gravest cases (4+).
 */
export function trialBy(countryId: string, severity = 3): TrialBy {
  if (JURY_TRIALS.has(countryId)) return 'jury'
  if (JURY_FOR_SERIOUS.has(countryId)) return severity >= 4 ? 'jury' : LAY_JUDGE_TRIALS.has(countryId) ? 'lay' : 'judge'
  if (LAY_JUDGE_TRIALS.has(countryId)) return 'lay'
  return 'judge'
}

/** Where ordinary citizens can be summoned to judge a trial (as jurors or lay judges). */
export function citizensJudge(countryId: string): TrialBy | null {
  if (JURY_TRIALS.has(countryId) || JURY_FOR_SERIOUS.has(countryId)) return 'jury'
  if (LAY_JUDGE_TRIALS.has(countryId)) return 'lay'
  return null
}
