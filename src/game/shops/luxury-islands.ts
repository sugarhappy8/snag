// Luxury Lifestyle › Island Realtor: private islands in seas near the player's country, bought
// as 'house' assets (details.typeLabel 'Private Island') so the regular house actions (move in,
// party, rent out, amenities, renovate, sell, upkeep) keep working. Also island getaways, island
// parties, renaming and the yearly island events (storms, treasure, noisy neighbors...).
import { lend } from '../cash'
import { conditionLabel, MORTGAGE_PLANS, mortgageDecision, nicePrice, seeded, yearKey, type MortgagePlan } from '../assets'
import { addHidden, addMoney, addStat, count, formatMoney, log, notice, remember, scriptChoice, scriptInput, shortMoney, spend, useYearAction } from '../core'
import { creditLabel, creditScore } from '../finance'
import { chance, pick, randInt, weightedPick } from '../rng'
import { pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import type { Asset, ChoiceOption, GameState, MenuAction, MenuGroup, MenuNode, Mortgage } from '../types'
import { getCountry, type Continent } from '../world'
import {
  befriendCeleb,
  cantAfford,
  cleanName,
  field,
  isListingBought,
  luxuryAssets,
  luxuryBlock,
  luxuryMult,
  luxuryReason,
  localized,
  markListingBought,
  meetCeleb,
  num,
  obj,
  rollCeleb,
  str,
  strList,
  toJson,
  type PopupBudget,
  takePopup,
} from './luxury-common'

// ---------------------------------------------------------------------------
// Regions

type Climate = 'tropical' | 'mediterranean' | 'cold' | 'desert'

interface NameStyle {
  pattern: string
  words: string[]
}

interface IslandRegion {
  id: string
  /** 'the Exumas' */
  label: string
  /** 'Bahamas' */
  where: string
  climate: Climate
  /** What wrecks things here: hurricane, typhoon, cyclone, mistral... */
  storm: string
  priceMult: number
  continents: Continent[]
  /** Countries that get this region more often (or exclusively, with localOnly). */
  countries?: string[]
  localOnly?: boolean
  names: NameStyle[]
}

const EN_CARIB = ['Pelican Grudge', 'Sunburn', 'Rum Runner', 'Tax Shelter', 'Coconut Lawsuit', 'Skinny Dip', 'Flip-Flop', 'Mild Regret', 'Hammock', 'Iguana Drama', 'No Signal', 'Lost Luggage', 'Barnacle', 'Sandy Pants', 'Tan Line', 'Overdraft', 'Conch', 'Piña Colada', 'Mosquito', 'Sea Grape']
const ES_WORDS = ['Mañana', 'Siesta', 'Dinero', 'Tranquila', 'Cerveza', 'Chancla', 'Carísima', 'Pereza', 'Chisme', 'Bonita', 'Mosquito', 'Ojalá']

const REGIONS: IslandRegion[] = [
  // The Americas: the Caribbean, plus a few local favorites.
  { id: 'exumas', label: 'the Exumas', where: 'Bahamas', climate: 'tropical', storm: 'hurricane', priceMult: 1.25, continents: ['North America', 'South America'], countries: ['us', 'bs', 'ca'], names: [{ pattern: '{X} Cay', words: EN_CARIB }, { pattern: 'Little {X} Cay', words: EN_CARIB }] },
  { id: 'grenadines', label: 'the Grenadines', where: 'St. Vincent', climate: 'tropical', storm: 'hurricane', priceMult: 1.15, continents: ['North America', 'South America'], names: [{ pattern: 'Petit {X}', words: ['Rhum', 'Soleil', 'Paresse', 'Cocotier', 'Bisou', 'Fromage'] }, { pattern: '{X} Cay', words: EN_CARIB }] },
  { id: 'belize', label: 'the Belize Barrier Reef', where: 'Belize', climate: 'tropical', storm: 'hurricane', priceMult: 0.85, continents: ['North America'], countries: ['bz', 'gt', 'mx', 'sv', 'ni'], names: [{ pattern: '{X} Caye', words: EN_CARIB }] },
  { id: 'sanBlas', label: 'the San Blas Islands', where: 'Panama', climate: 'tropical', storm: 'tropical storm', priceMult: 0.75, continents: ['North America', 'South America'], countries: ['pa', 'cr', 'co'], names: [{ pattern: 'Isla {X}', words: ES_WORDS }] },
  { id: 'bvi', label: 'the Virgin Islands', where: 'BVI', climate: 'tropical', storm: 'hurricane', priceMult: 1.35, continents: ['North America'], countries: ['us', 'pr', 'do', 'jm', 'ht', 'aw', 'cu'], names: [{ pattern: '{X} Island', words: EN_CARIB }, { pattern: '{X} Cay', words: EN_CARIB }] },
  { id: 'losRoques', label: 'Los Roques', where: 'Venezuela', climate: 'tropical', storm: 'tropical storm', priceMult: 0.6, continents: ['South America'], countries: ['ve', 'co', 'gy', 'ec'], names: [{ pattern: 'Cayo {X}', words: ES_WORDS }] },
  { id: 'floridaKeys', label: 'the Florida Keys', where: 'Florida', climate: 'tropical', storm: 'hurricane', priceMult: 1.1, continents: ['North America'], countries: ['us'], localOnly: true, names: [{ pattern: '{X} Key', words: ['Margarita', 'Flamingo Lawn', 'Hurricane Party', 'Sunscreen', 'Retiree', 'Gator', 'Spring Break', 'Key Lime', 'Pink Flamingo'] }] },
  { id: 'maine', label: 'the Maine coast', where: 'USA', climate: 'cold', storm: "nor'easter", priceMult: 0.5, continents: ['North America'], countries: ['us', 'ca'], localOnly: true, names: [{ pattern: '{X} Island', words: ['Lobster Trap', 'Foghorn', 'Chowder', 'Wicked Cold', 'Moose', 'Lighthouse Keeper', 'Clam Bake'] }] },
  { id: 'thousandIslands', label: 'the Thousand Islands', where: 'Ontario', climate: 'cold', storm: 'ice storm', priceMult: 0.45, continents: ['North America'], countries: ['ca', 'us'], localOnly: true, names: [{ pattern: '{X} Island', words: ['Poutine', 'Sorry', 'Maple Syrup', 'Loonie', 'Double-Double', 'Moose Crossing', 'Toque'] }] },
  { id: 'cortez', label: 'the Sea of Cortez', where: 'Baja California', climate: 'desert', storm: 'hurricane', priceMult: 0.7, continents: ['North America'], countries: ['mx'], localOnly: true, names: [{ pattern: 'Isla {X}', words: ES_WORDS }] },
  { id: 'angra', label: 'Angra dos Reis', where: 'Brazil', climate: 'tropical', storm: 'tropical storm', priceMult: 0.8, continents: ['South America'], countries: ['br', 'uy', 'py'], names: [{ pattern: 'Ilha {X}', words: ['Saudade', 'Caipirinha', 'Feijoada', 'Jeitinho', 'Preguiça', 'Carnaval', 'Fofoca', 'Cafuné'] }] },
  { id: 'patagonia', label: 'the Patagonian fjords', where: 'Chile', climate: 'cold', storm: 'Patagonian gale', priceMult: 0.35, continents: ['South America'], countries: ['cl', 'ar', 'bo', 'pe', 'uy'], localOnly: true, names: [{ pattern: 'Isla {X}', words: ['Pingüino', 'Viento Loco', 'Mate Amargo', 'Frío Total', 'Asado', 'Lejana', 'Sin Señal'] }] },
  // Europe: the Mediterranean, Greek and Croatian isles, plus two chilly local options.
  { id: 'cyclades', label: 'the Cyclades', where: 'Greece', climate: 'mediterranean', storm: 'meltemi gale', priceMult: 1.4, continents: ['Europe'], countries: ['gr', 'il', 'lb', 'tr'], names: [{ pattern: '{X}onisi', words: ['Tzatzik', 'Ouz', 'Mousak', 'Kalamar', 'Souvlak', 'Frapp', 'Baklav'] }, { pattern: 'Nisída {X}', words: ['Opa', 'Siga Siga', 'Feta Accompli', 'Zeus Was Here', 'Ouzo Again'] }] },
  { id: 'ionian', label: 'the Ionian Islands', where: 'Greece', climate: 'mediterranean', storm: 'Medicane', priceMult: 1.3, continents: ['Europe'], countries: ['gr', 'it', 'al'], names: [{ pattern: 'Nisída {X}', words: ['Opa', 'Siga Siga', 'Kefi', 'Meraki', 'Kalimera', 'Zeus Was Here'] }] },
  { id: 'dalmatia', label: 'the Dalmatian Coast', where: 'Croatia', climate: 'mediterranean', storm: 'bura windstorm', priceMult: 1.0, continents: ['Europe'], countries: ['hr', 'rs', 'hu', 'at', 'sk', 'cz'], names: [{ pattern: 'Otok {X}', words: ['Ćevapi', 'Rakija', 'Pivo', 'Fjaka', 'Mali Skupi', 'Jugo', 'Turistić'] }] },
  { id: 'kornati', label: 'the Kornati Islands', where: 'Croatia', climate: 'mediterranean', storm: 'bura windstorm', priceMult: 0.85, continents: ['Europe'], countries: ['hr', 'si'], names: [{ pattern: 'Otok {X}', words: ['Fjaka', 'Kamen', 'Koza', 'Pršut', 'Bura', 'Mali Skupi'] }] },
  { id: 'balearics', label: 'the Balearic Islands', where: 'Spain', climate: 'mediterranean', storm: 'freak storm', priceMult: 1.3, continents: ['Europe'], countries: ['es', 'pt', 'ad', 'ma', 'dz', 'tn'], names: [{ pattern: 'Illa {X}', words: ['Siesta', 'Sangria', 'Ensaïmada', 'Calma', 'Sobrassada'] }, { pattern: 'Isla {X}', words: ES_WORDS }] },
  { id: 'aeolian', label: 'the Aeolian Islands', where: 'Italy', climate: 'mediterranean', storm: 'scirocco storm', priceMult: 1.2, continents: ['Europe'], countries: ['it', 'mc', 'ch', 'at', 'tn'], names: [{ pattern: 'Isola {X}', words: ['Spaghettina', 'Bella Figura', 'Dolce Far Niente', 'Nonna', 'Tiramisù', 'Mamma Mia', 'Espresso Doppio', 'Pisolino'] }] },
  { id: 'azur', label: "the Côte d'Azur", where: 'France', climate: 'mediterranean', storm: 'mistral', priceMult: 1.5, continents: ['Europe'], countries: ['fr', 'mc', 'be', 'ch', 'lu'], names: [{ pattern: 'Île {X}', words: ['de la Sieste', 'du Croissant', 'aux Impôts', 'de la Paresse', 'du Fromage', 'Bisou', 'du Champagne'] }] },
  { id: 'hebrides', label: 'the Outer Hebrides', where: 'Scotland', climate: 'cold', storm: 'Atlantic gale', priceMult: 0.3, continents: ['Europe'], countries: ['gb', 'ie'], localOnly: true, names: [{ pattern: 'Isle of {X}', words: ['Drizzle', 'Midge', 'Sheepish', 'Wee Rock', 'Damp', 'Sideways Rain', 'Bagpipe', 'Haggis'] }] },
  { id: 'stockholm', label: 'the Stockholm Archipelago', where: 'Sweden', climate: 'cold', storm: 'Baltic storm', priceMult: 0.6, continents: ['Europe'], countries: ['se', 'no', 'dk', 'fi', 'ee', 'de', 'nl', 'pl'], localOnly: true, names: [{ pattern: '{X}holmen', words: ['Fika', 'Flatpack', 'Smörgås', 'Lagom', 'Kanelbulle', 'Älg', 'Mysig'] }] },
  // Middle East: the Red Sea and the Gulf (and the Turkish coast).
  { id: 'redSea', label: 'the Red Sea coast', where: 'Saudi Arabia', climate: 'desert', storm: 'sandstorm', priceMult: 1.1, continents: ['Middle East'], countries: ['sa', 'eg', 'jo', 'il', 'dj'], names: [{ pattern: 'Jazirat {X}', words: ['Al-Wifi', 'Al-Bling', 'Shawarma', 'Falcon', 'Mirage', 'Al-Selfie', 'Oasis Plus'] }] },
  { id: 'farasan', label: 'the Farasan Islands', where: 'Saudi Arabia', climate: 'desert', storm: 'sandstorm', priceMult: 0.8, continents: ['Middle East'], countries: ['sa', 'ye'], names: [{ pattern: 'Jazirat {X}', words: ['Mirage', 'Gazelle', 'Coral', 'Al-Quiet', 'Dates'] }] },
  { id: 'gulf', label: 'the Arabian Gulf', where: 'Abu Dhabi', climate: 'desert', storm: 'shamal sandstorm', priceMult: 1.45, continents: ['Middle East'], countries: ['ae', 'qa', 'kw', 'bh', 'om', 'ir', 'iq'], names: [{ pattern: '{X} Island', words: ['Infinity Pool', 'Gold Leaf', 'Air-Conditioned', 'Supercar', 'Palm Frond', 'Falcon'] }, { pattern: 'Jazirat {X}', words: ['Al-Bling', 'Al-Wifi', 'Mirage'] }] },
  { id: 'musandam', label: 'the Musandam fjords', where: 'Oman', climate: 'desert', storm: 'shamal sandstorm', priceMult: 0.9, continents: ['Middle East'], countries: ['om', 'ae'], names: [{ pattern: 'Jazirat {X}', words: ['Dolphin', 'Khanjar', 'Frankincense', 'Al-Quiet', 'Dhow'] }] },
  { id: 'aegeanTr', label: 'the Turkish Aegean', where: 'Turkey', climate: 'mediterranean', storm: 'Aegean storm', priceMult: 1.0, continents: ['Middle East'], countries: ['tr', 'ge'], names: [{ pattern: '{X} Adası', words: ['Baklava', 'Kebap', 'Nazar', 'Çay', 'Simit', 'Lokum', 'Keyif'] }] },
  // Africa: the Indian Ocean and East Africa (and the Canaries for the north-west).
  { id: 'seychelles', label: 'the Seychelles Outer Islands', where: 'Seychelles', climate: 'tropical', storm: 'cyclone', priceMult: 1.2, continents: ['Africa'], countries: ['za', 'ke', 'ug', 'et'], names: [{ pattern: 'Île {X}', words: ['Coco Loco', 'Paresseuse', 'de la Sieste', 'Tortue Grincheuse', 'Bisou', 'Vanille'] }] },
  { id: 'zanzibar', label: 'the Zanzibar Archipelago', where: 'Tanzania', climate: 'tropical', storm: 'monsoon storm', priceMult: 0.8, continents: ['Africa'], countries: ['ke', 'ug', 'et', 'cd'], names: [{ pattern: 'Kisiwa cha {X}', words: ['Pole Pole', 'Karafuu', 'Jua Kali', 'Usingizi', 'Mvinyo', 'Nazi'] }] },
  { id: 'quirimbas', label: 'the Quirimbas Archipelago', where: 'Mozambique', climate: 'tropical', storm: 'cyclone', priceMult: 0.6, continents: ['Africa'], countries: ['za', 'zw', 'ao'], names: [{ pattern: 'Ilha {X}', words: ['Preguiça', 'Saudade', 'Peri-Peri', 'Calma', 'Matapa'] }] },
  { id: 'lamu', label: 'the Lamu Archipelago', where: 'Kenya', climate: 'tropical', storm: 'monsoon storm', priceMult: 0.65, continents: ['Africa'], countries: ['ke', 'et', 'ug', 'dj'], names: [{ pattern: 'Kisiwa cha {X}', words: ['Pole Pole', 'Dhow', 'Usingizi', 'Nazi', 'Jua Kali'] }] },
  { id: 'nosyBe', label: 'the Nosy Be islands', where: 'Madagascar', climate: 'tropical', storm: 'cyclone', priceMult: 0.55, continents: ['Africa'], names: [{ pattern: 'Nosy {X}', words: ['Neighbors', 'Parker', 'Lemur', 'Vanilla', 'Mora Mora', 'Baobab'] }] },
  { id: 'canaries', label: 'the Canary Islands', where: 'Spain', climate: 'desert', storm: 'calima dust storm', priceMult: 0.95, continents: ['Africa'], countries: ['ma', 'dz', 'tn', 'es'], localOnly: true, names: [{ pattern: 'Isla {X}', words: ES_WORDS }] },
  // Asia: Indian Ocean atolls and Southeast Asian isles (and Japan's inland sea).
  { id: 'maldives', label: 'the Maldives', where: 'Maldives', climate: 'tropical', storm: 'monsoon storm', priceMult: 1.3, continents: ['Asia'], countries: ['in', 'pk', 'bd', 'np', 'af', 'kz', 'mn', 'ae', 'qa', 'sa'], names: [{ pattern: '{X}fushi', words: ['Selfie', 'Influencer', 'Honeymoon', 'Overwater', 'Snorkel', 'Hashtag'] }, { pattern: 'Kuda {X} Huraa', words: ['Selfie', 'Wi-Fi', 'Sunset', 'Honeymoon'] }] },
  { id: 'andaman', label: 'the Andaman Sea', where: 'Thailand', climate: 'tropical', storm: 'monsoon storm', priceMult: 0.75, continents: ['Asia'], countries: ['th', 'my', 'vn', 'cn'], names: [{ pattern: 'Koh {X}', words: ['Tax Haven', 'Pad Thai', 'Sabai Sabai', 'Tuk Tuk', 'Mai Pen Rai', 'Som Tam', 'Full Moon'] }] },
  { id: 'palawan', label: 'Palawan', where: 'the Philippines', climate: 'tropical', storm: 'typhoon', priceMult: 0.6, continents: ['Asia'], countries: ['ph', 'tw', 'hk'], names: [{ pattern: 'Isla {X}', words: ['Karaoke', 'Adobo', 'Halo-Halo', 'Bahala Na', 'Sinigang', 'Pasalubong'] }] },
  { id: 'rajaAmpat', label: 'Raja Ampat', where: 'Indonesia', climate: 'tropical', storm: 'tropical storm', priceMult: 0.55, continents: ['Asia', 'Oceania'], countries: ['id', 'pg', 'sg'], names: [{ pattern: 'Pulau {X}', words: ['Selfie', 'Sambal', 'Rendang', 'Santai', 'Jam Karet', 'Kopi'] }] },
  { id: 'langkawi', label: 'Langkawi', where: 'Malaysia', climate: 'tropical', storm: 'monsoon storm', priceMult: 0.65, continents: ['Asia'], countries: ['my', 'sg', 'th'], names: [{ pattern: 'Pulau {X}', words: ['Santai', 'Durian', 'Teh Tarik', 'Laksa', 'Lepak'] }] },
  { id: 'seto', label: 'the Seto Inland Sea', where: 'Japan', climate: 'mediterranean', storm: 'typhoon', priceMult: 0.9, continents: ['Asia'], countries: ['jp', 'kr', 'tw', 'cn', 'hk'], localOnly: true, names: [{ pattern: '{X}-jima', words: ['Karaoke', 'Onsen', 'Wasabi', 'Bento', 'Omakase', 'Salaryman', 'Kawaii'] }] },
  // Oceania: the Pacific.
  { id: 'mamanuca', label: 'the Mamanuca Islands', where: 'Fiji', climate: 'tropical', storm: 'cyclone', priceMult: 1.0, continents: ['Oceania'], names: [{ pattern: '{X} Levu', words: ['Bula', 'Kava', 'Vinaka', 'Coconut', 'Sevusevu'] }, { pattern: '{X} Lailai', words: ['Bula', 'Kava', 'Vinaka'] }] },
  { id: 'tuamotu', label: 'the Tuamotus', where: 'French Polynesia', climate: 'tropical', storm: 'cyclone', priceMult: 1.1, continents: ['Oceania'], names: [{ pattern: 'Motu {X}', words: ['Overpriced', 'Coconut Wireless', 'Long Lunch', 'Hammock', 'Manta', 'Tiaré'] }] },
  { id: 'vavau', label: "Vava'u", where: 'Tonga', climate: 'tropical', storm: 'cyclone', priceMult: 0.55, continents: ['Oceania'], countries: ['ws', 'nz'], names: [{ pattern: 'Motu {X}', words: ['Malo', 'Ofa', 'Humpback', 'Kava', 'Island Time'] }] },
  { id: 'whitsundays', label: 'the Whitsundays', where: 'Australia', climate: 'tropical', storm: 'cyclone', priceMult: 0.95, continents: ['Oceania'], countries: ['au'], localOnly: true, names: [{ pattern: '{X} Island', words: ['Drop Bear', 'Fair Dinkum', 'Sunburnt', 'Thong', 'Snag', 'No Worries', 'Stinger', 'Arvo'] }] },
  { id: 'hauraki', label: 'the Hauraki Gulf', where: 'New Zealand', climate: 'mediterranean', storm: 'subtropical storm', priceMult: 0.8, continents: ['Oceania'], countries: ['nz'], localOnly: true, names: [{ pattern: 'Motu {X}', words: ['Jandal', 'Pavlova', 'Sweet As', 'Chilly Bin', 'Hokey Pokey', 'Bach'] }] },
]

/** The island regions a realtor in this country offers, with weights (home seas first). */
export function regionsFor(countryId: string): { region: IslandRegion; weight: number }[] {
  const continent = getCountry(countryId).continent
  const out: { region: IslandRegion; weight: number }[] = []
  for (const r of REGIONS) {
    const local = r.countries?.includes(countryId) ?? false
    if (local) out.push({ region: r, weight: 3 })
    else if (!r.localOnly && r.continents.includes(continent)) out.push({ region: r, weight: 1 })
  }
  if (out.length > 0) return out
  return REGIONS.filter((r) => !r.localOnly).map((region) => ({ region, weight: 1 }))
}

function regionById(id: string): IslandRegion | undefined {
  return REGIONS.find((r) => r.id === id)
}

// ---------------------------------------------------------------------------
// Features

interface IslandFeature {
  id: string
  label: string
  emoji: string
  mult: number
  weight: number
  /** Change to the yearly upkeep rate. */
  upkeep?: number
  climates?: Climate[]
  regions?: string[]
  minAcres?: number
  /** One line for an island getaway. */
  getaway: string
}

export const ISLAND_FEATURES: IslandFeature[] = [
  { id: 'airstrip', label: 'Private airstrip', emoji: '\u{2708}\u{FE0F}', mult: 1.12, weight: 0.6, minAcres: 60, getaway: 'You taxied up and down your own runway on a golf cart, making engine noises.' },
  { id: 'marina', label: 'Deepwater marina', emoji: '\u{2693}', mult: 1.08, weight: 0.7, getaway: 'You strolled your marina, judging other people’s boats.' },
  { id: 'helipad', label: 'Helipad', emoji: '\u{1F681}', mult: 1.04, weight: 0.7, getaway: 'You had breakfast on the helipad because you could.' },
  { id: 'beach', label: 'Private beach', emoji: '\u{1F3D6}\u{FE0F}', mult: 1.05, weight: 1.2, climates: ['tropical', 'mediterranean', 'desert'], getaway: 'You napped on your private beach until you were the same color as the sand.' },
  { id: 'reef', label: 'Coral reef', emoji: '\u{1F420}', mult: 1.06, weight: 0.8, climates: ['tropical', 'desert'], getaway: 'You snorkeled the reef with a sea turtle who seemed unimpressed by your net worth.' },
  { id: 'rainforest', label: 'Rainforest', emoji: '\u{1F334}', mult: 1.03, weight: 0.6, climates: ['tropical'], minAcres: 40, getaway: 'You hiked the rainforest and got personally insulted by a parrot.' },
  { id: 'turtles', label: 'Turtle nesting beach', emoji: '\u{1F422}', mult: 1.02, weight: 0.5, climates: ['tropical'], getaway: 'You tiptoed past the turtle nests like a very rich ninja.' },
  { id: 'vineyard', label: 'Hillside vineyard', emoji: '\u{1F347}', mult: 1.06, weight: 0.6, climates: ['mediterranean'], getaway: 'You drank wine from your own vineyard. It tasted like money and sunshine.' },
  { id: 'volcano', label: 'Dormant volcano (probably)', emoji: '\u{1F30B}', mult: 0.95, weight: 0.35, regions: ['grenadines', 'aeolian', 'cyclades', 'mamanuca', 'tuamotu', 'vavau', 'rajaAmpat', 'canaries', 'seto', 'nosyBe', 'hauraki'], getaway: 'You hiked up the volcano. It rumbled once. You hiked down faster.' },
  { id: 'spring', label: 'Freshwater spring', emoji: '\u{1F4A7}', mult: 1.05, weight: 0.5, upkeep: -0.003, getaway: 'You drank straight from your spring and declared it the best water on Earth.' },
  { id: 'solar', label: 'Solar microgrid', emoji: '\u{2600}\u{FE0F}', mult: 1.03, weight: 0.5, upkeep: -0.004, getaway: 'You admired your solar panels and felt smug about your carbon footprint, ignoring the jet.' },
  { id: 'lighthouse', label: 'Old lighthouse', emoji: '\u{1F5FC}', mult: 1.02, weight: 0.45, getaway: 'You climbed the lighthouse and yelled your own name at the sea.' },
  { id: 'ruins', label: 'Mysterious ruins', emoji: '\u{1F5FF}', mult: 1.04, weight: 0.35, getaway: 'You explored the ruins and found a carving that looked suspiciously like a selfie.' },
  { id: 'cave', label: "Smugglers' cave", emoji: '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}', mult: 1.03, weight: 0.45, getaway: "You poked around the smugglers' cave. Bats, a rusty lantern and one very old flip-flop." },
  { id: 'shipwreck', label: 'Shipwreck offshore', emoji: '\u{1F6A2}', mult: 1.02, weight: 0.4, getaway: 'You dove the shipwreck and found a porthole, three crabs and a deep sense of mortality.' },
  { id: 'resort', label: 'Abandoned resort', emoji: '\u{1F3DA}\u{FE0F}', mult: 0.92, weight: 0.3, getaway: 'You wandered the abandoned resort. The swim-up bar still has a sign that says BACK IN 5 MIN.' },
  { id: 'goats', label: 'Feral goats', emoji: '\u{1F410}', mult: 0.98, weight: 0.45, getaway: 'The feral goats ate your sandals again. They are the real owners here.' },
  { id: 'puffins', label: 'Puffin colony', emoji: '\u{1F427}', mult: 1.01, weight: 0.8, climates: ['cold'], getaway: 'You watched the puffins and decided they are the only creatures you truly respect.' },
  { id: 'sauna', label: 'Waterfront sauna', emoji: '\u{1F9D6}', mult: 1.02, weight: 0.8, climates: ['cold'], getaway: 'You sat in the sauna, jumped in the freezing sea and screamed in a very healthy way.' },
  { id: 'falcons', label: 'Falcon aviary', emoji: '\u{1F985}', mult: 1.03, weight: 0.6, climates: ['desert'], getaway: 'You flew your falcon. It came back. You felt like a king.' },
  { id: 'lair', label: 'Hollowed-out volcano lair', emoji: '\u{1F9B9}', mult: 1.25, weight: 0.06, minAcres: 250, getaway: 'You sat in your lair in a swivel chair, stroking an imaginary cat and laughing at nothing.' },
]

function featureById(id: string): IslandFeature | undefined {
  return ISLAND_FEATURES.find((f) => f.id === id)
}

function featureAllowed(f: IslandFeature, region: IslandRegion, acres: number): boolean {
  if (f.climates && !f.climates.includes(region.climate)) return false
  if (f.regions && !f.regions.includes(region.id)) return false
  if (f.minAcres && acres < f.minAcres) return false
  return true
}

// ---------------------------------------------------------------------------
// Listings

export interface IslandListing {
  id: string
  name: string
  regionId: string
  /** 'the Exumas, Bahamas' */
  place: string
  acres: number
  beds: number
  baths: number
  sqft: number
  age: number
  condition: number
  haunted: number
  features: string[]
  price: number
  upkeep: number
  upkeepRate: number
}

export const ISLAND_MIN_PRICE = 5_000_000
export const ISLAND_MAX_PRICE = 300_000_000

function condFactor(cond: number): number {
  return 0.55 + 0.45 * (Math.max(0, Math.min(100, cond)) / 100)
}

function hauntFactor(h: number): number {
  return 1 - 0.3 * (Math.max(0, Math.min(100, h)) / 100)
}

/** This year's private islands for sale (seeded: stable all year, never touches g.rng). */
export function islandListings(g: GameState): IslandListing[] {
  const r = seeded(yearKey(g, 'luxury:islands'))
  const pool = regionsFor(g.character.countryId)
  const out: IslandListing[] = []
  const names = new Set<string>()
  for (let i = 0; i < 6; i++) {
    const region = r.weighted(pool, (x) => x.weight).region
    const acres = Math.max(2, Math.round(Math.exp(r.float(Math.log(2), Math.log(3_000)))))
    const style = r.pick(region.names)
    // Jokey modern names (Selfie, Wifi, Hashtag) only once those words exist.
    const modern = style.words.filter((w) => g.year >= 2008 || !/selfie|wi-?fi|hashtag/i.test(w))
    const words = modern.length ? modern : style.words
    let name = style.pattern.replace('{X}', r.pick(words))
    for (let k = 0; k < 4 && names.has(name); k++) name = style.pattern.replace('{X}', r.pick(words))
    if (names.has(name)) name = `${name} ${['II', 'Minor', 'Major', 'North'][i % 4]}`
    names.add(name)
    const allowed = ISLAND_FEATURES.filter((f) => featureAllowed(f, region, acres))
    const n = acres < 20 ? r.int(1, 2) : acres < 300 ? r.int(2, 3) : r.int(3, 4)
    const features: string[] = []
    for (let k = 0; k < n && allowed.length > 0; k++) {
      const f = r.weighted(
        allowed.filter((x) => !features.includes(x.id)),
        (x) => x.weight,
      )
      if (f && !features.includes(f.id)) features.push(f.id)
    }
    const derelict = features.includes('resort')
    const condition = derelict ? r.int(12, 45) : r.int(40, 100)
    const haunted = r.chance(features.includes('lighthouse') || features.includes('cave') ? 0.2 : 0.07) ? r.int(15, 90) : 0
    const beds = acres < 20 ? r.int(1, 4) : acres < 200 ? r.int(3, 9) : r.int(6, 20)
    const featureMult = features.reduce((m, id) => m * (featureById(id)?.mult ?? 1), 1)
    const base = (3_500_000 + Math.pow(acres, 0.75) * 450_000) * region.priceMult * featureMult
    const raw = base * (0.8 + 0.2 * (condition / 100)) * hauntFactor(haunted) * r.float(0.85, 1.2)
    const price = nicePrice(Math.min(ISLAND_MAX_PRICE, Math.max(ISLAND_MIN_PRICE, raw)))
    const upkeepRate = Math.max(0.012, Math.round((0.02 + r.float(0, 0.015) + features.reduce((s, id) => s + (featureById(id)?.upkeep ?? 0), 0)) * 10_000) / 10_000)
    const listing: IslandListing = {
      id: `${g.year}:isle-${i}`,
      name,
      regionId: region.id,
      place: `${region.label}, ${region.where}`,
      acres,
      beds,
      baths: Math.max(1, Math.round(beds * r.float(0.8, 1.2))),
      sqft: Math.round((beds * r.int(700, 1_500)) / 10) * 10,
      age: r.int(0, 70),
      condition,
      haunted,
      features,
      price,
      upkeep: nicePrice(price * upkeepRate),
      upkeepRate,
    }
    if (!isListingBought(g, listing.id)) out.push(listing)
  }
  return out.sort((a, b) => a.price - b.price)
}

function acresLabel(acres: number): string {
  return `${acres.toLocaleString('en-US')}-Acre`
}

export function islandAssetName(acres: number): string {
  return `${acresLabel(acres)} Private Island`
}

function featureList(ids: string[]): string {
  const labels = ids.map((id) => featureById(id)).filter((f): f is IslandFeature => !!f)
  return labels.length ? labels.map((f) => `${f.emoji} ${f.label}`).join(', ') : 'Nothing but sand and potential'
}

/** Mortgage plans island lenders accept (private banks want at least 20% down). */
export const ISLAND_PLANS: MortgagePlan[] = MORTGAGE_PLANS.filter((p) => p.down >= 0.2)

// ---------------------------------------------------------------------------
// Buying

/** Buy a private island with cash (plan null) or a private-bank mortgage. */
export function buyIsland(g: GameState, l: IslandListing, plan: MortgagePlan | null): Asset | null {
  const c = g.character
  const reason = luxuryReason(g)
  if (reason) {
    notice(g, 'Island Realtor', reason, { emoji: '\u{1F3DD}\u{FE0F}' })
    return null
  }
  if (isListingBought(g, l.id)) {
    notice(g, 'Sold!', 'A tech billionaire bought that island ten minutes before you called. He has already renamed it after himself.', { emoji: '\u{1F3F7}\u{FE0F}' })
    return null
  }
  let mortgage: Mortgage | undefined
  if (!plan) {
    if (!spend(g, l.price, 'property.buy')) {
      cantAfford(g, l.price, l.name)
      return null
    }
  } else {
    const d = mortgageDecision(g, l.price, plan)
    if (!d.ok) {
      notice(g, 'Loan Denied', d.reason, { emoji: '\u{1F3E6}', tone: 'bad' })
      return null
    }
    spend(g, d.down, 'property.buy')
    lend(g, d.principal, 'pool:sellers') // the lender creates the loan; the sellers' pool gets the whole price
    mortgage = { lender: pick(g, ['Lagoon Private Bank', 'Atoll Trust & Co.', 'Old Harbour Private Bank', 'Meridian Wealth Lending']), balance: d.principal, yearlyPayment: d.payment, yearsLeft: plan.years, rate: d.rate }
  }
  const region = regionById(l.regionId)
  const asset: Asset = {
    id: `a${(g.nextId += 1)}`,
    kind: 'house',
    name: islandAssetName(l.acres),
    emoji: '\u{1F3DD}\u{FE0F}',
    purchasePrice: l.price,
    value: l.price,
    condition: l.condition,
    purchasedAge: c.age,
    mortgage,
    upkeep: l.upkeep,
    details: {
      luxury: 'island',
      type: 'island',
      typeLabel: 'Private Island',
      islandName: l.name,
      address: l.name,
      city: l.place,
      regionId: l.regionId,
      storm: region?.storm ?? 'storm',
      acres: l.acres,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft,
      built: g.year - l.age,
      haunted: l.haunted,
      features: l.features,
      amenities: [],
      insured: false,
      invested: 0,
      upkeepRate: l.upkeepRate,
    },
  }
  asset.details.marketValue = Math.round(l.price / (condFactor(l.condition) * hauntFactor(l.haunted)))
  g.assets.push(asset)
  markListingBought(g, l.id)
  count(g, 'housesBought')
  count(g, 'islandsBought')
  count(g, 'purchases')
  addStat(g, 'happiness', randInt(g, 10, 18))
  if (l.price >= 50_000_000) addHidden(g, 'fame', randInt(g, 1, 3))
  remember(g, `Bought ${l.name}, a ${l.acres.toLocaleString('en-US')}-acre private island in ${l.place}, for ${formatMoney(l.price)}.`)
  log(g, `I bought my own private island, ${l.name}, in ${l.place} for ${formatMoney(l.price)}${mortgage ? ' with a loan from a private bank' : ''}.`, 'good')
  const paid = mortgage
    ? `You put ${formatMoney(l.price - mortgage.balance)} down and ${mortgage.lender} lent you ${formatMoney(mortgage.balance)} at ${(mortgage.rate * 100).toFixed(2)}% (${formatMoney(mortgage.yearlyPayment)} a year for ${mortgage.yearsLeft} years).`
    : `You wired ${formatMoney(l.price)} in one go. Your banker sent a fruit basket the size of a canoe.`
  const extras = [
    l.features.includes('volcano') ? 'The realtor swore the volcano is "basically retired."' : '',
    l.features.includes('goats') ? 'The goats came with the deed. They are not negotiable.' : '',
    l.haunted > 0 ? 'On your first night, a lantern moved along the beach with nobody holding it.' : '',
  ].filter(Boolean)
  notice(
    g,
    'Island Owner!',
    `You are now the proud owner of ${l.name}, ${l.acres.toLocaleString('en-US')} acres in ${l.place}. ${paid} ${extras.join(' ')} Move in from the Assets tab whenever you're ready to commute by seaplane.`.replace(/\s+/g, ' ').trim(),
    { emoji: '\u{1F3DD}\u{FE0F}', tone: 'good' },
  )
  return asset
}

const BUY_ISLAND = defineScript('luxury.island.buy', (g, choice, data) => {
  const l = obj(field(data, 'listing')) as unknown as IslandListing | null
  if (!l || typeof l.id !== 'string' || choice === 'cancel') return
  if (choice === 'cash') {
    buyIsland(g, l, null)
    return
  }
  const plan = ISLAND_PLANS.find((p) => p.id === choice)
  if (plan) buyIsland(g, l, plan)
})

function islandListingAction(l: IslandListing): MenuAction {
  return {
    type: 'action',
    id: `lux-isle-${l.id}`,
    label: l.name,
    emoji: '\u{1F3DD}\u{FE0F}',
    subtitle: `${shortMoney(l.price)} · ${l.acres.toLocaleString('en-US')} acres · ${l.place}${l.haunted ? ' · \u{1F47B}' : ''}`,
    disabledReason: luxuryReason,
    run: (g) => {
      const lines = [
        `\u{1F4CD} ${l.place}`,
        `\u{1F4D0} ${l.acres.toLocaleString('en-US')} acres · main villa: ${l.beds} bed, ${l.baths} bath, ${l.sqft.toLocaleString('en-US')} sq ft`,
        `\u{2728} ${featureList(l.features)}`,
        `\u{1F527} Condition: ${conditionLabel(l.condition)} (${l.condition}%)`,
        `\u{1F4B0} Asking price: ${formatMoney(l.price)}`,
        `\u{1F9FE} Upkeep (staff, generators, boats, desalination): about ${formatMoney(l.upkeep)}/year`,
      ]
      if (l.haunted) lines.push(`\u{1F47B} The realtor mumbled something about "a former owner who never left" (hauntedness ${l.haunted}%).`)
      const score = creditScore(g)
      lines.push(`Your credit score: ${score} (${creditLabel(score)})`)
      const choices: ChoiceOption[] = [{ id: 'cash', label: `Pay cash (${formatMoney(l.price)})`, emoji: '\u{1F4B5}' }]
      for (const plan of ISLAND_PLANS) {
        const d = mortgageDecision(g, l.price, plan)
        choices.push({ id: plan.id, label: `Private bank loan: ${Math.round(plan.down * 100)}% down (${shortMoney(d.down)}), ${plan.years} yrs at ${(d.rate * 100).toFixed(2)}%`, emoji: '\u{1F3E6}' })
      }
      choices.push({ id: 'cancel', label: 'Keep browsing', emoji: '\u{2716}\u{FE0F}' })
      scriptChoice(g, BUY_ISLAND, `\u{1F3DD}\u{FE0F} ${l.name}`, lines.join('\n'), choices, { emoji: '\u{1F3DD}\u{FE0F}', data: { listing: toJson(l) } })
    },
  }
}

const REALTOR_NAMES = ['Coral & Cash Island Realty', 'Atoll Estates', 'Lagoon Sotheby-ish', 'Castaway Luxury Realty', 'Isle Be Rich Realtors']

export const islandRealtorMenu: MenuGroup = {
  type: 'menu',
  id: 'luxuryIslands',
  label: 'Island Realtor',
  emoji: '\u{1F3DD}\u{FE0F}',
  subtitle: () => `Private islands from ${shortMoney(5_000_000)} to ${shortMoney(300_000_000)}`,
  disabledReason: luxuryReason,
  header: (g) => {
    const realtor = REALTOR_NAMES[Math.abs(g.year * 7 + g.character.age) % REALTOR_NAMES.length]
    const seas = [...new Set(regionsFor(g.character.countryId).filter((x) => x.weight > 1).map((x) => x.region.label))].slice(0, 3)
    const near = seas.length ? ` Specialists in ${seas.join(', ')}.` : ''
    return `${realtor}: "Every island comes with sand, a sunset and a deed."${near} You have ${formatMoney(g.character.money)}. Islands trade worldwide in US dollars.`
  },
  children: (g) => {
    const list = islandListings(g)
    if (list.length === 0) return [{ type: 'info', id: 'lux-isle-none', text: 'Every island on the books sold this year. The realtor is out shopping for more ocean.', emoji: '\u{1FAA7}' }]
    return list.map(islandListingAction)
  },
}

// ---------------------------------------------------------------------------
// Owned islands

function islandName(a: Asset): string {
  return str(a.details.islandName, str(a.details.address, 'your island'))
}

function features(a: Asset): string[] {
  return strList(a.details.features)
}

function refreshValue(a: Asset): void {
  const mv = num(a.details.marketValue, a.value)
  a.value = Math.max(1_000, Math.round(mv * condFactor(a.condition) * hauntFactor(num(a.details.haunted))))
  a.upkeep = nicePrice(a.value * num(a.details.upkeepRate, 0.02))
}

function isHome(g: GameState, a: Asset): boolean {
  return g.character.residence.status === 'owned' && g.character.residence.assetId === a.id
}

function arrival(g: GameState, a: Asset): string {
  const f = features(a)
  const jets = luxuryAssets(g, 'jet')
  const yachts = luxuryAssets(g, 'megayacht')
  if (jets.some((j) => str(j.details.jetClass) === 'amphib')) return 'Your amphibious jet splashed down in the lagoon.'
  if (jets.length && f.includes('airstrip')) return 'Your jet touched down on your own airstrip.'
  if (yachts.length && f.includes('marina')) return `You sailed in on ${str(yachts[0].details.yachtName, 'your yacht')}.`
  if (f.includes('helipad')) return 'A chartered helicopter dropped you on your helipad.'
  return 'A chartered seaplane dropped you off at your dock.'
}

function getawayAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-getaway-${a.id}`,
    label: 'Island Getaway',
    emoji: '\u{1F334}',
    subtitle: 'A week of doing absolutely nothing, expensively',
    disabledReason: (g) => {
      const b = luxuryBlock(g)
      if (b) return b
      const cur = g.assets.find((x) => x.id === a.id)
      if (cur?.rentedOutFor) return 'Your tenants are living there. Awkward.'
      return null
    },
    run: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return
      if (!useYearAction(g, `luxury.getaway.${cur.id}`, 1)) {
        notice(g, 'Island Getaway', `You already spent a week on ${islandName(cur)} this year. Even paradise needs a break from you.`, { emoji: '\u{1F334}' })
        return
      }
      const lines = features(cur)
        .map((id) => featureById(id)?.getaway)
        .filter((x): x is string => !!x)
      const picked = lines.length ? [pick(g, lines)] : ['You walked the whole coastline in an afternoon and named every palm tree.']
      addStat(g, 'happiness', randInt(g, 6, 12))
      addStat(g, 'health', randInt(g, 2, 5))
      let tail = ''
      if (num(cur.details.haunted) > 0 && chance(g, 0.4)) {
        addStat(g, 'happiness', -2)
        tail = ' At night a ghostly voice asked whether you had seen its parrot.'
      } else if (cur.condition < 35) {
        tail = ' The villa is falling apart, though. A shutter fell off while you were reading.'
      }
      log(g, `I spent a week on my private island, ${islandName(cur)}.`, 'good')
      notice(g, 'Island Getaway', `${arrival(g, cur)} ${picked[0]}${tail}`, { emoji: '\u{1F3DD}\u{FE0F}', tone: 'good' })
    },
  }
}

function islandPartyCost(g: GameState): number {
  return localized(180_000, luxuryMult(g))
}

function islandPartyAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-isleparty-${a.id}`,
    label: 'Throw an Island Bash',
    emoji: '\u{1F389}',
    subtitle: (g) => `About ${formatMoney(islandPartyCost(g))} for boats, DJs and lobster`,
    disabledReason: (g) => {
      const b = luxuryBlock(g)
      if (b) return b
      return g.assets.find((x) => x.id === a.id)?.rentedOutFor ? 'Your tenants would not appreciate 300 guests.' : null
    },
    confirm: (g) => `Fly in 300 of your closest strangers for a party on your island? It'll cost about ${formatMoney(islandPartyCost(g))}.`,
    run: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return
      if (!useYearAction(g, `luxury.islandParty.${cur.id}`, 1)) {
        notice(g, 'Island Bash', 'The DJ is still recovering from the last one. One island bash a year.', { emoji: '\u{1F971}' })
        return
      }
      const cost = islandPartyCost(g)
      if (!spend(g, cost, 'leisure')) {
        g.yearActions[`luxury.islandParty.${cur.id}`] = 0
        cantAfford(g, cost, 'an island bash')
        return
      }
      const name = islandName(cur)
      const roll = randInt(g, 1, 100)
      if (roll <= 15) {
        addStat(g, 'happiness', -4)
        addHidden(g, 'notoriety', randInt(g, 2, 5))
        addHidden(g, 'fame', randInt(g, 1, 3))
        log(g, `My party on ${name} made the tabloids for the wrong reasons.`, 'bad')
        notice(g, 'Party Disaster', pickSite(g, [`The last water taxi left at midnight and stranded 80 guests on ${name}. Someone started a "Lord of the Flies" livestream. It trended.`, `The fireworks barge drifted into the guest marina. Nobody was hurt, but three speedboats are now modern art.`, `A guest tried to ride one of the goats into the lagoon. The video has six million views and you are tagged in all of them.`], 0x577d4988), { emoji: '\u{1F525}', tone: 'bad' })
        return
      }
      addStat(g, 'happiness', randInt(g, 6, 12))
      addHidden(g, 'fame', randInt(g, 2, 5))
      log(g, `I threw a legendary party on my island, ${name}.`, 'good')
      const text = pickSite(g, [`Your party on ${name} was the talk of every yacht for a hundred miles. A DJ played on the beach until sunrise.`, `Seaplanes kept landing all night. Someone proposed on your dock. Someone else got rejected on your dock.`, `Your island bash had a lobster tower, a fire dancer and a pop-up tattoo parlor. You regret one of those.`], 0x963d7fbc)
      if (roll >= 70) {
        meetCeleb(g, rollCeleb(g, undefined, chance(g, 0.5)), `a party on ${name}`, `${text}`)
        return
      }
      notice(g, 'Island Bash', text, { emoji: '\u{1F389}', tone: 'good' })
    },
  }
}

const RENAME_ISLAND = defineScript('luxury.island.rename', (g, value, data) => {
  const id = field<string>(data, 'assetId')
  const a = id ? g.assets.find((x) => x.id === id) : undefined
  if (!a) return
  const old = islandName(a)
  const name = cleanName(value, old)
  if (name === old) return
  a.details.islandName = name
  a.details.address = name
  log(g, `I renamed my island from ${old} to ${name}.`)
  notice(g, 'New Name', `It's official: ${old} is now ${name}. The maps will catch up eventually. The goats don't care.`, { emoji: '\u{1FAA7}' })
})

function renameIslandAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-islerename-${a.id}`,
    label: 'Rename Your Island',
    emoji: '\u{270F}\u{FE0F}',
    disabledReason: luxuryBlock,
    run: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return
      if (!useYearAction(g, `luxury.rename.${cur.id}`, 1)) {
        notice(g, 'Rename', 'The map makers asked you to stop. One new name a year.', { emoji: '\u{1F5FA}\u{FE0F}' })
        return
      }
      scriptInput(g, { title: 'Rename Your Island', emoji: '\u{1F3DD}\u{FE0F}', text: `What should ${islandName(cur)} be called from now on?`, input: 'text', placeholder: 'e.g. Isla Mía', defaultValue: islandName(cur), scriptId: RENAME_ISLAND, data: { assetId: cur.id } })
    },
  }
}

function islandInfo(g: GameState, a: Asset): MenuNode[] {
  const d = a.details
  const rows = [
    `\u{1F4CD} ${islandName(a)} · ${str(d.city, 'somewhere tropical')}`,
    `\u{1F4D0} ${num(d.acres).toLocaleString('en-US')} acres · villa: ${num(d.beds)} bed, ${num(d.baths)} bath, ${num(d.sqft).toLocaleString('en-US')} sq ft`,
    `\u{2728} ${featureList(features(a))}`,
    `\u{1F4B0} Value: ${formatMoney(a.value)} (paid ${formatMoney(a.purchasePrice)})`,
    `\u{1F527} Condition: ${a.condition}% (${conditionLabel(a.condition)}) · upkeep ${formatMoney(a.upkeep)}/year`,
  ]
  if (isHome(g, a)) rows.push('\u{1F3E0} You live here.')
  if (a.rentedOutFor) rows.push(`\u{1F511} Rented out for ${formatMoney(a.rentedOutFor)}/year`)
  if (num(d.haunted) > 0) rows.push(`\u{1F47B} Hauntedness: ${num(d.haunted)}%`)
  if (d.insured !== true) rows.push(`\u{26A0}\u{FE0F} Not insured against ${str(d.storm, 'storms')}s. Insure it from the Assets tab.`)
  return rows.map((text, i): MenuNode => ({ type: 'info', id: `lux-isleinfo-${a.id}-${i}`, text }))
}

/** The island's screen inside Luxury Lifestyle › Your Estates & Fleet. */
export function islandHoldingNode(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `lux-holding-${a.id}`,
    label: str(a.details.islandName, a.name),
    emoji: '\u{1F3DD}\u{FE0F}',
    subtitle: (g) => {
      const cur = g.assets.find((x) => x.id === a.id) ?? a
      return `${shortMoney(cur.value)} · ${num(cur.details.acres).toLocaleString('en-US')} acres · ${str(cur.details.city)}`
    },
    header: () => 'Sell, renovate, insure, rent it out or move in from the Assets tab.',
    children: (g) => {
      const cur = g.assets.find((x) => x.id === a.id)
      if (!cur) return [{ type: 'info', id: 'lux-isle-gone', text: "You don't own this island anymore." }]
      return [...islandInfo(g, cur), { type: 'heading', id: `lux-isleact-${cur.id}`, label: 'Island Life' }, getawayAction(cur), islandPartyAction(cur), renameIslandAction(cur)]
    },
  }
}

// ---------------------------------------------------------------------------
// Yearly island events

const NEIGHBOR = defineScript('luxury.island.neighbor', (g, choice, data) => {
  const celeb = field<string>(data, 'celeb') ?? 'Your celebrity neighbor'
  const job = field<string>(data, 'job') ?? 'celebrity'
  if (choice === 'join') {
    addStat(g, 'happiness', randInt(g, 4, 8))
    addHidden(g, 'fame', randInt(g, 1, 3))
    const spec = rollCeleb(g, job)
    const [first, ...rest] = celeb.split(' ')
    befriendCeleb(g, { ...spec, firstName: first || spec.firstName, lastName: rest.join(' ') || spec.lastName }, 'their island next door')
    log(g, `I partied with my celebrity island neighbor ${celeb}.`, 'good')
    notice(g, 'Good Neighbors', `You took a jet ski over and joined the party. ${celeb} turned out to be hilarious, and now you have a famous friend who lives a short swim away.`, { emoji: '\u{1F973}', tone: 'good' })
  } else if (choice === 'complain') {
    if (chance(g, 0.55)) {
      notice(g, 'Peace and Quiet', `You sent a strongly worded letter by boat. ${celeb}'s assistant apologized and the speakers now face the open ocean.`, { emoji: '\u{1F4DC}' })
    } else {
      addStat(g, 'happiness', -4)
      addHidden(g, 'fame', 1)
      log(g, `I started a feud with my celebrity island neighbor ${celeb}.`, 'bad')
      notice(g, 'Island Feud', `${celeb} read your complaint out loud on a podcast. Now the internet calls you "the island grinch."`, { emoji: '\u{1F624}', tone: 'bad' })
    }
  } else {
    addHidden(g, 'craziness', 2)
    if (chance(g, 0.5)) {
      addStat(g, 'happiness', 6)
      notice(g, 'Petty Victory', `You blasted bagpipe music at ${celeb}'s island all night. The party ended at 2 AM. Worth every penny of the speaker rental.`, { emoji: '\u{1F3B6}', tone: 'good' })
    } else {
      addHidden(g, 'notoriety', 2)
      notice(g, 'Escalation', `You blasted bagpipe music back. ${celeb} answered with a mariachi band on a barge. Neither of you slept. Both of you lost.`, { emoji: '\u{1F3BA}', tone: 'bad' })
    }
  }
})

const CASTAWAY = defineScript('luxury.island.castaway', (g, choice, data) => {
  const name = field<string>(data, 'name') ?? 'The castaway'
  const island = field<string>(data, 'island') ?? 'your island'
  if (choice === 'rescue') {
    addHidden(g, 'karma', randInt(g, 4, 8))
    log(g, `I rescued a castaway who washed up on ${island}.`, 'good')
    notice(g, 'Rescued', `You gave ${name} a hot meal and a ride home. ${name} had been drifting for nine days and talking to a coconut named Gerald. You kept Gerald.`, { emoji: '\u{1F965}', tone: 'good' })
  } else if (choice === 'hire') {
    addHidden(g, 'karma', randInt(g, 2, 5))
    addStat(g, 'happiness', 2)
    log(g, `I hired the castaway ${name} as the groundskeeper on ${island}.`, 'good')
    notice(g, 'New Groundskeeper', `${name} accepted on the spot. Turns out a man who survived nine days on a raft is excellent at fixing generators.`, { emoji: '\u{1F9F0}', tone: 'good' })
  } else {
    addHidden(g, 'karma', -randInt(g, 6, 10))
    log(g, `I left a castaway stranded on my island.`, 'bad')
    notice(g, 'Cold Shoulder', `You told ${name} this is private property. ${name} built a raft out of your patio furniture and left. You deserved that.`, { emoji: '\u{1FA91}', tone: 'bad' })
  }
})

const INFLUENCERS = defineScript('luxury.island.influencers', (g, choice, data) => {
  const island = field<string>(data, 'island') ?? 'your island'
  if (choice === 'chase') {
    notice(g, 'Trespassers', `Your groundskeeper chased them off with a leaf blower. The video of it got more views than any of their posts.`, { emoji: '\u{1F32C}\u{FE0F}' })
  } else if (choice === 'charge') {
    const fee = nicePrice(randInt(g, 5_000, 40_000))
    addMoney(g, fee, 'royalty')
    log(g, `I charged influencers ${formatMoney(fee)} to shoot on ${island}.`, 'good')
    notice(g, 'Location Fee', `You charged them ${formatMoney(fee)} for a "location license." They paid it without blinking and tagged ${island} 400 times.`, { emoji: '\u{1F4B5}', tone: 'good' })
  } else {
    addHidden(g, 'fame', randInt(g, 1, 3))
    addStat(g, 'happiness', 3)
    notice(g, 'Photobomb', `You strolled into their shoot in a silk robe holding a coconut. You're now a meme called "island landlord energy."`, { emoji: '\u{1F933}', tone: 'good' })
  }
})

interface Candidate {
  weight: number
  fire: () => void
}

/** Roll this year's island events (storms, treasure, neighbors...) as candidates for the one popup. */
export function islandEventCandidates(g: GameState): Candidate[] {
  const out: Candidate[] = []
  for (const a of luxuryAssets(g, 'island')) {
    const f = features(a)
    const name = islandName(a)
    const region = regionById(str(a.details.regionId))
    const storm = str(a.details.storm, region?.storm ?? 'storm')
    const stormChance = region?.climate === 'tropical' ? 0.07 : 0.04
    if (chance(g, stormChance)) {
      out.push({
        weight: 3,
        fire: () => {
          const dmg = randInt(g, 10, 35)
          if (a.details.insured === true) {
            const ded = nicePrice(Math.min(a.value * 0.01, 250_000))
            addMoney(g, -Math.min(ded, Math.max(0, g.character.money)), 'premium')
            log(g, `A ${storm} hit my island, ${name}. Insurance paid for the repairs.`, 'bad')
            notice(g, `${storm.charAt(0).toUpperCase()}${storm.slice(1)}!`, `A ${storm} tore across ${name}, flattening palms and tossing your dock into the lagoon. Your insurer paid for repairs, minus a ${formatMoney(ded)} deductible.`, { emoji: '\u{1F300}', tone: 'bad' })
          } else {
            a.condition = Math.max(0, a.condition - dmg)
            refreshValue(a)
            addStat(g, 'happiness', -6)
            log(g, `A ${storm} wrecked part of my island, ${name}.`, 'bad')
            notice(g, `${storm.charAt(0).toUpperCase()}${storm.slice(1)}!`, `A ${storm} slammed into ${name}. Without insurance the damage is all yours: condition down ${dmg}%, and it's now worth about ${shortMoney(a.value)}. Renovate from the Assets tab.`, { emoji: '\u{1F300}', tone: 'bad' })
          }
        },
      })
    }
    const treasure = 0.025 + (f.includes('cave') ? 0.05 : 0) + (f.includes('shipwreck') ? 0.04 : 0)
    if (chance(g, treasure)) {
      out.push({
        weight: 2,
        fire: () => {
          const found = nicePrice(randInt(g, 40_000, 1_500_000))
          addMoney(g, found, 'luck')
          addStat(g, 'happiness', 8)
          count(g, 'treasureFound')
          remember(g, `Found treasure worth ${formatMoney(found)} on my island, ${name}.`)
          log(g, `I found buried treasure on my island worth ${formatMoney(found)}!`, 'good')
          notice(g, 'Treasure!', `${f.includes('cave') ? "Behind a loose rock in the smugglers' cave" : f.includes('shipwreck') ? 'Inside the shipwreck off your coast' : 'Under a palm tree that fell in a storm'} you found a rotting chest of gold coins and one confused crab. An appraiser valued it at ${formatMoney(found)}.`, { emoji: '\u{1FA99}', tone: 'good' })
        },
      })
    }
    if (chance(g, 0.04)) {
      const celeb = rollCeleb(g)
      out.push({
        weight: 2,
        fire: () => {
          scriptChoice(g, NEIGHBOR, 'Noisy Neighbor', `${celeb.firstName} ${celeb.lastName}, the ${celeb.occupation.toLowerCase()}, bought the island next to ${name} and throws a party every single night. The bass is rattling your windows.`, [
            { id: 'join', label: 'Join the party', emoji: '\u{1F973}' },
            { id: 'complain', label: 'File a complaint', emoji: '\u{1F4DC}' },
            { id: 'retaliate', label: 'Blast bagpipes back', emoji: '\u{1F3B6}' },
          ], { emoji: '\u{1F50A}', data: { celeb: `${celeb.firstName} ${celeb.lastName}`, job: celeb.occupation } })
        },
      })
    }
    if (f.includes('volcano') && chance(g, 0.03)) {
      out.push({
        weight: 2,
        fire: () => {
          const dmg = randInt(g, 5, 20)
          a.condition = Math.max(0, a.condition - dmg)
          refreshValue(a)
          addStat(g, 'happiness', -5)
          log(g, `The "dormant" volcano on ${name} woke up.`, 'bad')
          notice(g, 'Volcano!', `The "basically retired" volcano on ${name} coughed up ash for three days. Your staff evacuated by boat, the villa is covered in grey snow, and the realtor has stopped returning your calls. Condition down ${dmg}%.`, { emoji: '\u{1F30B}', tone: 'bad' })
        },
      })
    }
    if (chance(g, 0.02)) {
      const castaway = pick(g, ['Wilbur', 'Dmitri', 'Sione', 'Rosa', 'Kwame', 'Ingrid', 'Pedro', 'Aiko'])
      out.push({
        weight: 1,
        fire: () => {
          scriptChoice(g, CASTAWAY, 'Castaway!', `A sunburned castaway named ${castaway} washed up on ${name}, clinging to a cooler. What do you do?`, [
            { id: 'rescue', label: 'Rescue them', emoji: '\u{1F6DF}' },
            { id: 'hire', label: 'Offer them a job', emoji: '\u{1F9F0}' },
            { id: 'ignore', label: 'Private property. Bye.', emoji: '\u{1F6AB}' },
          ], { emoji: '\u{1F3DD}\u{FE0F}', data: { name: castaway, island: name } })
        },
      })
    }
    if (chance(g, 0.03)) {
      out.push({
        weight: 1,
        fire: () => {
          scriptChoice(g, INFLUENCERS, 'Trespassers', `A boatload of influencers landed on ${name} to shoot "a hidden paradise nobody knows about." It's your paradise. Everybody knows about it.`, [
            { id: 'chase', label: 'Chase them off', emoji: '\u{1F32C}\u{FE0F}' },
            { id: 'charge', label: 'Charge a location fee', emoji: '\u{1F4B5}' },
            { id: 'pose', label: 'Photobomb them', emoji: '\u{1F933}' },
          ], { emoji: '\u{1F4F8}', data: { island: name } })
        },
      })
    }
    if (f.includes('turtles') && chance(g, 0.05)) {
      out.push({
        weight: 1,
        fire: () => {
          addHidden(g, 'karma', 3)
          addStat(g, 'happiness', 4)
          log(g, `Hundreds of baby sea turtles hatched on my island.`, 'good')
          notice(g, 'Hatchlings', `Hundreds of baby sea turtles hatched on ${name} and scrambled into the sea. You cried. Your security guard cried. A conservation group named one of them after you.`, { emoji: '\u{1F422}', tone: 'good' })
        },
      })
    }
  }
  return out
}

/** Show at most one island event (if the popup budget allows). */
export function yearlyIslands(g: GameState, budget: PopupBudget, extra: Candidate[] = []): void {
  const candidates = [...islandEventCandidates(g), ...extra]
  if (candidates.length === 0 || !takePopup(budget)) return
  weightedPick(g, candidates, (x) => x.weight).fire()
}

export type { Candidate as LuxuryEventCandidate }
