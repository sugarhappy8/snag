// Market profiles for North and South America (see data/markets.ts for field meanings).
//
// Rounded mid-2020s figures: headline corporate tax, consumption tax and its local name, the
// statutory minimum wage per full-time year in dollars (including mandatory 13th/14th-month pay
// where the law requires it), central bank policy rate (dollarized economies get a typical
// lending benchmark instead), recent inflation, a World Bank Doing Business-style ease score,
// corruption as 100 minus the Transparency International CPI score, and the real exchanges.
// laborCost stays within about ±35% of world.ts `wealth`, since salaries are US pay x wealth.
// Small islands and markets without a meaningful exchange use null (investments fall back to
// NYSE for North America and B3 for South America).
import type { MarketProfile } from '../markets'

export const AMERICAS_MARKETS: Record<string, MarketProfile> = {
  // ----- North America & the Caribbean -----

  // United States: the baseline every other market is priced against. Corporate tax is the 21%
  // federal rate; sales tax is the average state + local rate.
  us: {
    countryId: 'us', currencyName: 'US dollar', currencyCode: 'USD',
    gdpPerCapita: 85_000, populationM: 335,
    corporateTax: 0.21, salesTax: 0.07, salesTaxName: 'Sales tax', minWage: 15_080,
    laborCost: 1, rentCost: 1, interestRate: 0.04, inflation: 0.03,
    easeOfBusiness: 84, corruption: 35, startupDays: 4, startupFee: 600,
    exchange: { name: 'New York Stock Exchange', code: 'NYSE', index: 'S&P 500', volatility: 0.18, drift: 0.08 },
    demand: { software: 1.6, gameStudio: 1.5, entertainment: 1.5, ecommerce: 1.4, marketing: 1.3, autoShop: 1.3, foodTruck: 1.3, gym: 1.3 },
    banned: [],
    priceMult: {},
    businessNote: "Forming an LLC takes an afternoon; working out which of the country's thousands of local sales-tax rates applies to each customer takes the rest of your career.",
    nameWords: ['Liberty', 'Hudson', 'Prairie', 'Redwood', 'Mesa', 'Bayou', 'Appalachian', 'Lone Star', 'Cascade', 'Great Lakes'],
  },

  // Aruba: a tourism economy pegged to the dollar; everything is imported, turnover tax instead of VAT.
  aw: {
    countryId: 'aw', currencyName: 'Aruban florin', currencyCode: 'AWG',
    gdpPerCapita: 34_000, populationM: 0.11,
    corporateTax: 0.25, salesTax: 0.07, salesTaxName: 'Turnover tax (BBO)', minWage: 12_500,
    laborCost: 0.6, rentCost: 0.7, interestRate: 0.03, inflation: 0.03,
    easeOfBusiness: 62, corruption: 35, startupDays: 30, startupFee: 2_000,
    exchange: null,
    demand: { hotel: 2.6, restaurant: 1.7, bar: 1.6, entertainment: 1.4, logistics: 0.7, software: 0.6, gameStudio: 0.5, manufacturing: 0.4, farm: 0.3 },
    banned: [],
    priceMult: { car: 1.3, electronics: 1.2, alcohol: 1.2, food: 1.4, fuel: 1.3 },
    businessNote: 'Every customer flies in and every crate ships in, so your business plan is mostly a cruise schedule and a prayer to the trade winds.',
    nameWords: ['Dushi', 'Bon Bini', 'Arikok', 'Hooiberg', 'Kunuku', 'Boca', 'Watapana', 'Oranje'],
  },

  // Bahamas: no income or corporate tax; the state lives on VAT, licence fees and import duties.
  bs: {
    countryId: 'bs', currencyName: 'Bahamian dollar', currencyCode: 'BSD',
    gdpPerCapita: 36_000, populationM: 0.41,
    corporateTax: 0, salesTax: 0.1, salesTaxName: 'VAT', minWage: 13_500,
    laborCost: 0.6, rentCost: 0.85, interestRate: 0.04, inflation: 0.025,
    easeOfBusiness: 60, corruption: 36, startupDays: 22, startupFee: 1_500,
    exchange: { name: 'Bahamas International Securities Exchange', code: 'BISX', index: 'BISX All Share Index', volatility: 0.12, drift: 0.05 },
    demand: { hotel: 2.6, restaurant: 1.6, realEstate: 1.5, bar: 1.5, entertainment: 1.4, software: 0.6, gameStudio: 0.5, farm: 0.4, manufacturing: 0.4 },
    banned: [],
    priceMult: { car: 1.6, electronics: 1.3, alcohol: 1.5, food: 1.5, fuel: 1.8 },
    businessNote: "There's no income or corporate tax, so the government collects its share at the dock instead, where the customs duty on a crate can outweigh the crate.",
    nameWords: ['Nassau', 'Exuma', 'Abaco', 'Andros', 'Conch', 'Junkanoo', 'Pink Sand', 'Eleuthera', 'Lucayan'],
  },

  // Belize: reef and rainforest tourism, sugar and citrus; business tax is charged on gross receipts.
  bz: {
    countryId: 'bz', currencyName: 'Belize dollar', currencyCode: 'BZD',
    gdpPerCapita: 7_600, populationM: 0.41,
    corporateTax: 0.25, salesTax: 0.125, salesTaxName: 'GST', minWage: 5_200,
    laborCost: 0.3, rentCost: 0.35, interestRate: 0.05, inflation: 0.03,
    easeOfBusiness: 55, corruption: 60, startupDays: 48, startupFee: 1_000,
    exchange: null,
    demand: { hotel: 2, farm: 1.5, restaurant: 1.4, bar: 1.3, construction: 1.2, ecommerce: 0.6, manufacturing: 0.6, software: 0.5, gameStudio: 0.4 },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.3, luxury: 1.2, fuel: 1.85 },
    businessNote: 'Belize taxes gross receipts rather than profit, so you pay even in the years you lose money, which Belmopan considers a feature.',
    nameWords: ['Caye', 'Jaguar', 'Toucan', 'Macal', 'Cockscomb', 'Blue Hole', 'Sapodilla', 'Barrier Reef'],
  },

  // Canada: oil sands, real estate and game studios; 26.5% is the combined federal + Ontario rate.
  ca: {
    countryId: 'ca', currencyName: 'Canadian dollar', currencyCode: 'CAD',
    gdpPerCapita: 53_000, populationM: 41,
    corporateTax: 0.265, salesTax: 0.13, salesTaxName: 'GST/HST', minWage: 26_000,
    laborCost: 0.88, rentCost: 0.85, interestRate: 0.0275, inflation: 0.025,
    easeOfBusiness: 80, corruption: 25, startupDays: 2, startupFee: 350,
    exchange: { name: 'Toronto Stock Exchange', code: 'TSX', index: 'S&P/TSX Composite', volatility: 0.15, drift: 0.07 },
    demand: { energy: 1.8, gameStudio: 1.5, realEstate: 1.4, construction: 1.3, software: 1.3, cafe: 1.3, brewery: 1.2, farm: 1.2 },
    banned: [],
    priceMult: { electronics: 1.1, luxury: 1.1, alcohol: 1.5, food: 1.15, fuel: 1.2 },
    businessNote: 'Incorporation takes an afternoon online; working out whether a sale owes GST, HST, PST or QST takes the rest of the winter.',
    nameWords: ['Maple', 'Northern', 'Laurentian', 'Boreal', 'Muskoka', 'Fraser', 'Huron', 'Aurora', 'Rideau', 'Timber'],
  },

  // Costa Rica: ecotourism, coffee and medical-device free zones; the state runs power and fuel.
  cr: {
    countryId: 'cr', currencyName: 'Costa Rican colón', currencyCode: 'CRC',
    gdpPerCapita: 17_000, populationM: 5.2,
    corporateTax: 0.3, salesTax: 0.13, salesTaxName: 'IVA', minWage: 9_400,
    laborCost: 0.5, rentCost: 0.5, interestRate: 0.04, inflation: 0.01,
    easeOfBusiness: 69, corruption: 42, startupDays: 10, startupFee: 900,
    exchange: null,
    demand: { hotel: 2, cafe: 1.6, farm: 1.4, clinic: 1.4, restaurant: 1.3, manufacturing: 1.3, software: 1.2, energy: 0.5 },
    banned: [],
    priceMult: { car: 1.5, electronics: 1.25, luxury: 1.25, alcohol: 1.2, food: 1.1, fuel: 1.6 },
    businessNote: 'Pura vida ends at the municipal permit office, where every form needs a notary, a stamp and another visit next week.',
    nameWords: ['Pura Vida', 'Arenal', 'Tico', 'Guanacaste', 'Guaria', 'Irazú', 'Tortuga', 'Monteverde', 'Cafetal'],
  },

  // Cuba: private small firms (MIPYMEs) legal only since 2021; healthcare and power stay state-only.
  // No policy rate or stock exchange; prices reflect shortages and dollar-only stores.
  cu: {
    countryId: 'cu', currencyName: 'Cuban peso', currencyCode: 'CUP',
    gdpPerCapita: 6_000, populationM: 10,
    corporateTax: 0.35, salesTax: 0.1, salesTaxName: 'Sales tax', minWage: 300,
    laborCost: 0.15, rentCost: 0.3, interestRate: 0.06, inflation: 0.3,
    easeOfBusiness: 20, corruption: 59, startupDays: 45, startupFee: 400,
    exchange: null,
    demand: {
      autoShop: 1.7, hotel: 1.6, restaurant: 1.5, grocery: 1.5, bar: 1.3, realEstate: 0.5,
      manufacturing: 0.5, ecommerce: 0.4, software: 0.3, gameStudio: 0.3,
    },
    banned: ['clinic', 'energy'],
    priceMult: { car: 3.5, electronics: 1.8, luxury: 1.5, alcohol: 0.7, food: 1.3, fuel: 1.2 },
    businessNote: "Private MIPYMEs have been legal since 2021, but clinics and power plants stay state-only, and half your inventory arrives in somebody's suitcase from Panama.",
    nameWords: ['Habana', 'Malecón', 'Caribe', 'Sierra Maestra', 'Viñales', 'Guajiro', 'Ceiba', 'Tinajón'],
  },

  // Dominican Republic: Punta Cana resorts, tax-free export zones, cigars and cocoa; frequent blackouts.
  do: {
    countryId: 'do', currencyName: 'Dominican peso', currencyCode: 'DOP',
    gdpPerCapita: 11_300, populationM: 11.4,
    corporateTax: 0.27, salesTax: 0.18, salesTaxName: 'ITBIS', minWage: 4_600,
    laborCost: 0.33, rentCost: 0.4, interestRate: 0.055, inflation: 0.035,
    easeOfBusiness: 60, corruption: 64, startupDays: 16, startupFee: 800,
    exchange: null,
    demand: {
      hotel: 2.2, bar: 1.5, restaurant: 1.4, construction: 1.4, realEstate: 1.4, farm: 1.3,
      manufacturing: 1.2, entertainment: 1.2, software: 0.6, gameStudio: 0.5,
    },
    banned: [],
    priceMult: { car: 1.5, electronics: 1.3, luxury: 1.2, alcohol: 1.1, food: 0.85, fuel: 1.5 },
    businessNote: 'Free-zone factories pay no tax, the all-inclusive resorts keep their guests on site, and everyone else pays 18% ITBIS plus the diesel for the blackout generator.',
    nameWords: ['Quisqueya', 'Cibao', 'Merengue', 'Ozama', 'Samaná', 'Larimar', 'Yaque', 'Duarte', 'Bávaro'],
  },

  // El Salvador: dollarized (Bitcoin was legal tender 2021-2025); maquilas and a post-crackdown
  // construction and surf-tourism boom. Interest rate is a typical dollar lending benchmark.
  sv: {
    countryId: 'sv', currencyName: 'US dollar', currencyCode: 'USD',
    gdpPerCapita: 5_500, populationM: 6.3,
    corporateTax: 0.3, salesTax: 0.13, salesTaxName: 'IVA', minWage: 5_100,
    laborCost: 0.24, rentCost: 0.3, interestRate: 0.05, inflation: 0.015,
    easeOfBusiness: 65, corruption: 70, startupDays: 16, startupFee: 700,
    exchange: null,
    demand: { manufacturing: 1.4, construction: 1.3, hotel: 1.3, cafe: 1.3, realEstate: 1.2, ecommerce: 0.6, software: 0.5, gameStudio: 0.4 },
    banned: [],
    priceMult: { car: 1.15, electronics: 1.15, luxury: 1.1, alcohol: 0.9, food: 0.8, fuel: 1.25 },
    businessNote: 'Bitcoin was legal tender for a while, but the landlord, the tax office and the pupusa supplier all still want plain US dollars.',
    nameWords: ['Cuscatlán', 'Izalco', 'Lempa', 'Pupusa', 'Ilopango', 'Torogoz', 'Volcán', 'Surf City'],
  },

  // Guatemala: coffee, cardamom and textiles; Antigua and Tikal tourism; slow municipal permits.
  gt: {
    countryId: 'gt', currencyName: 'Guatemalan quetzal', currencyCode: 'GTQ',
    gdpPerCapita: 6_200, populationM: 18,
    corporateTax: 0.25, salesTax: 0.12, salesTaxName: 'IVA', minWage: 6_700,
    laborCost: 0.22, rentCost: 0.3, interestRate: 0.045, inflation: 0.03,
    easeOfBusiness: 63, corruption: 75, startupDays: 15, startupFee: 500,
    exchange: null,
    demand: { farm: 1.5, cafe: 1.3, hotel: 1.3, manufacturing: 1.2, ecommerce: 0.6, software: 0.5, gameStudio: 0.4 },
    banned: [],
    priceMult: { car: 1.15, electronics: 1.15, luxury: 1.15, alcohol: 0.8, food: 0.7, fuel: 1.25 },
    businessNote: 'The Registro Mercantil takes two weeks; a municipal building permit takes about as long as a new coffee bush takes to bear fruit.',
    nameWords: ['Quetzal', 'Atitlán', 'Tikal', 'Maya', 'Petén', 'Pacaya', 'Antigua', 'Xela'],
  },

  // Haiti: the region's hardest market: insecurity has emptied the hotels, fuel and food are
  // imported, and every business budgets for a generator.
  ht: {
    countryId: 'ht', currencyName: 'Haitian gourde', currencyCode: 'HTG',
    gdpPerCapita: 1_900, populationM: 11.8,
    corporateTax: 0.3, salesTax: 0.1, salesTaxName: 'TCA', minWage: 1_200,
    laborCost: 0.12, rentCost: 0.25, interestRate: 0.12, inflation: 0.27,
    easeOfBusiness: 40, corruption: 84, startupDays: 97, startupFee: 1_500,
    exchange: null,
    demand: {
      energy: 1.5, farm: 1.3, grocery: 1.3, bakery: 1.2, entertainment: 0.6, logistics: 0.6,
      manufacturing: 0.6, hotel: 0.4, ecommerce: 0.4, software: 0.3, gameStudio: 0.3,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.3, luxury: 1.3, alcohol: 0.8, fuel: 1.4 },
    businessNote: 'Expect three months of registration paperwork, a generator as your second-biggest expense, and a supply chain that depends on which road is open this week.',
    nameWords: ['Ayiti', 'Citadelle', 'Kreyòl', 'Lakay', 'Artibonite', 'Kenscoff', 'Lambi', 'Konbit'],
  },

  // Jamaica: one of the fastest places on earth to register a company; tourism, music and
  // a lively stock exchange, but some of the region's priciest electricity.
  jm: {
    countryId: 'jm', currencyName: 'Jamaican dollar', currencyCode: 'JMD',
    gdpPerCapita: 7_200, populationM: 2.8,
    corporateTax: 0.25, salesTax: 0.15, salesTaxName: 'GCT', minWage: 5_300,
    laborCost: 0.3, rentCost: 0.4, interestRate: 0.06, inflation: 0.05,
    easeOfBusiness: 70, corruption: 56, startupDays: 3, startupFee: 300,
    exchange: { name: 'Jamaica Stock Exchange', code: 'JSE', index: 'JSE Main Index', volatility: 0.25, drift: 0.08 },
    demand: {
      hotel: 2, entertainment: 1.6, bar: 1.4, restaurant: 1.3, farm: 1.2, construction: 1.2,
      logistics: 1.2, software: 0.6, gameStudio: 0.5,
    },
    banned: [],
    priceMult: { car: 1.6, electronics: 1.3, luxury: 1.2, food: 1.1, fuel: 1.45 },
    businessNote: 'Registering online takes about three days, which leaves plenty of time to discover that your electricity bill is bigger than your rent.',
    nameWords: ['Yaad', 'Irie', 'Blue Mountain', 'Montego', 'Cockpit', 'Liguanea', 'Rio Cobre', 'Doctor Bird', 'Ackee'],
  },

  // Mexico: nearshoring factories, street food and beach resorts; strict electronic invoicing.
  mx: {
    countryId: 'mx', currencyName: 'Mexican peso', currencyCode: 'MXN',
    gdpPerCapita: 14_000, populationM: 131,
    corporateTax: 0.3, salesTax: 0.16, salesTaxName: 'IVA', minWage: 6_000,
    laborCost: 0.38, rentCost: 0.45, interestRate: 0.075, inflation: 0.04,
    easeOfBusiness: 72, corruption: 74, startupDays: 8, startupFee: 900,
    exchange: { name: 'Bolsa Mexicana de Valores', code: 'BMV', index: 'S&P/BMV IPC', volatility: 0.22, drift: 0.08 },
    demand: {
      manufacturing: 1.6, foodTruck: 1.6, hotel: 1.5, logistics: 1.4, restaurant: 1.3, brewery: 1.3,
      autoShop: 1.3, farm: 1.2, construction: 1.2,
    },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.2, luxury: 1.15, alcohol: 0.6, food: 0.7, fuel: 1.45 },
    businessNote: 'You can open a company online in a day, then meet the SAT, a tax authority so thorough it wants an electronic invoice for every taco you sell.',
    nameWords: ['Anáhuac', 'Sierra Madre', 'Jalisco', 'Del Valle', 'Bajío', 'Popocatépetl', 'Nopal', 'Reforma', 'Xochi', 'Golfo'],
  },

  // Nicaragua: coffee, beef and textile free zones; tourism never recovered from 2018.
  ni: {
    countryId: 'ni', currencyName: 'Nicaraguan córdoba', currencyCode: 'NIO',
    gdpPerCapita: 2_800, populationM: 7,
    corporateTax: 0.3, salesTax: 0.15, salesTaxName: 'IVA', minWage: 3_000,
    laborCost: 0.17, rentCost: 0.25, interestRate: 0.065, inflation: 0.04,
    easeOfBusiness: 54, corruption: 86, startupDays: 14, startupFee: 700,
    exchange: null,
    demand: {
      farm: 1.5, cafe: 1.2, manufacturing: 1.2, hotel: 0.8, realEstate: 0.7, marketing: 0.7,
      ecommerce: 0.5, software: 0.4, gameStudio: 0.3,
    },
    banned: [],
    priceMult: { car: 1.2, electronics: 1.2, luxury: 1.2, alcohol: 0.6, food: 0.6, fuel: 1.5 },
    businessNote: 'Registration is quick; staying registered means keeping the tax office, the town hall and whichever inspector visits this month equally happy.',
    nameWords: ['Pinolero', 'Momotombo', 'Xolotlán', 'Ometepe', 'Cocibolca', 'Maderas', 'Güegüense', 'Mombacho'],
  },

  // Panama: the canal, the Colón Free Zone and a banking centre; uses the US dollar alongside the
  // balboa, so the interest rate is a typical dollar lending benchmark.
  pa: {
    countryId: 'pa', currencyName: 'Panamanian balboa', currencyCode: 'PAB',
    gdpPerCapita: 19_000, populationM: 4.5,
    corporateTax: 0.25, salesTax: 0.07, salesTaxName: 'ITBMS', minWage: 7_800,
    laborCost: 0.48, rentCost: 0.6, interestRate: 0.05, inflation: 0.01,
    easeOfBusiness: 67, corruption: 67, startupDays: 6, startupFee: 1_200,
    exchange: { name: 'Bolsa Latinoamericana de Valores', code: 'LATINEX', index: 'BVPSI', volatility: 0.12, drift: 0.05 },
    demand: { logistics: 2.2, realEstate: 1.5, construction: 1.4, hotel: 1.4, restaurant: 1.2, marketing: 1.2, farm: 0.8, manufacturing: 0.7 },
    banned: [],
    priceMult: { car: 1.1, alcohol: 0.7, fuel: 1.2 },
    businessNote: 'Ships from half the world pass your door and every company needs a lawyer as its resident agent, so the boom industries are logistics and notarizing.',
    nameWords: ['Istmo', 'Canal', 'Balboa', 'Chagres', 'Darién', 'Gatún', 'Taboga', 'Pollera', 'Coclé'],
  },

  // Puerto Rico: US territory with pharma plants and Act 60 tax breaks; shipping costs from the
  // Jones Act and a fragile grid. 37.5% is the top normal + surtax rate; trades on US exchanges.
  pr: {
    countryId: 'pr', currencyName: 'US dollar', currencyCode: 'USD',
    gdpPerCapita: 38_000, populationM: 3.2,
    corporateTax: 0.375, salesTax: 0.115, salesTaxName: 'IVU', minWage: 21_800,
    laborCost: 0.6, rentCost: 0.6, interestRate: 0.04, inflation: 0.03,
    easeOfBusiness: 70, corruption: 40, startupDays: 6, startupFee: 500,
    exchange: null,
    demand: { hotel: 1.6, bar: 1.5, energy: 1.5, manufacturing: 1.4, restaurant: 1.3, entertainment: 1.3, construction: 1.2, farm: 0.5 },
    banned: [],
    priceMult: { car: 1.25, electronics: 1.1, food: 1.2, fuel: 1.1 },
    businessNote: 'Act 60 promises a 4% tax rate if you export services, the Jones Act adds a surcharge to everything you import, and the grid throws in blackouts for free.',
    nameWords: ['Borinquen', 'Coquí', 'El Yunque', 'Isla', 'Taíno', 'Morro', 'Flamboyán', 'Culebra', 'Boricua'],
  },

  // ----- South America -----

  // Argentina: farms, Vaca Muerta shale and a strong software scene; inflation has cooled from
  // triple digits but prices still move monthly. Merval figures are in dollar terms.
  ar: {
    countryId: 'ar', currencyName: 'Argentine peso', currencyCode: 'ARS',
    gdpPerCapita: 14_000, populationM: 46,
    corporateTax: 0.35, salesTax: 0.21, salesTaxName: 'IVA', minWage: 2_900,
    laborCost: 0.36, rentCost: 0.4, interestRate: 0.3, inflation: 0.4,
    easeOfBusiness: 59, corruption: 63, startupDays: 12, startupFee: 500,
    exchange: { name: 'Bolsas y Mercados Argentinos', code: 'BYMA', index: 'S&P Merval', volatility: 0.5, drift: 0.12 },
    demand: { farm: 1.6, energy: 1.4, software: 1.3, restaurant: 1.3, cafe: 1.3, bakery: 1.3, manufacturing: 0.8, realEstate: 0.8 },
    banned: [],
    priceMult: { car: 1.7, electronics: 1.5, luxury: 1.5, alcohol: 0.7, fuel: 1.25 },
    businessNote: 'Prices are written in pencil, rent is quoted in dollars, and your contador juggles IVA, Ganancias, Ingresos Brutos and a tax on every bank transfer.',
    nameWords: ['Pampa', 'Del Plata', 'Gaucho', 'Paraná', 'Aconcagua', 'Iguazú', 'Ombú', 'Malbec', 'Tango', 'Pampero'],
  },

  // Bolivia: gas, lithium and quinoa; landlocked, short of dollars, long on paperwork.
  bo: {
    countryId: 'bo', currencyName: 'Bolivian boliviano', currencyCode: 'BOB',
    gdpPerCapita: 3_800, populationM: 12.4,
    corporateTax: 0.25, salesTax: 0.13, salesTaxName: 'IVA', minWage: 4_000,
    laborCost: 0.2, rentCost: 0.22, interestRate: 0.04, inflation: 0.15,
    easeOfBusiness: 52, corruption: 72, startupDays: 40, startupFee: 900,
    exchange: null,
    demand: { energy: 1.5, farm: 1.4, hotel: 1.2, logistics: 0.8, manufacturing: 0.6, ecommerce: 0.5, software: 0.4, gameStudio: 0.3 },
    banned: [],
    priceMult: { car: 1.3, electronics: 1.4, luxury: 1.3, alcohol: 0.7, food: 0.55, fuel: 0.7 },
    businessNote: 'Registration takes forty days, importing anything means hunting for scarce dollars, and in La Paz even the delivery van gets altitude sickness.',
    nameWords: ['Illimani', 'Titicaca', 'Altiplano', 'Potosí', 'Pachamama', 'Uyuni', 'Kantuta', 'Chuquiago'],
  },

  // Brazil: an agribusiness giant and a top beauty and fitness market; Selic at 15%, heavy import
  // taxes and famously complex tax compliance. 34% = IRPJ 25% + CSLL 9%.
  br: {
    countryId: 'br', currencyName: 'Brazilian real', currencyCode: 'BRL',
    gdpPerCapita: 10_300, populationM: 212,
    corporateTax: 0.34, salesTax: 0.18, salesTaxName: 'ICMS', minWage: 3_700,
    laborCost: 0.42, rentCost: 0.4, interestRate: 0.15, inflation: 0.05,
    easeOfBusiness: 59, corruption: 66, startupDays: 10, startupFee: 500,
    exchange: { name: 'B3 (Brasil, Bolsa, Balcão)', code: 'B3', index: 'Ibovespa', volatility: 0.3, drift: 0.09 },
    demand: { farm: 1.8, beauty: 1.6, gym: 1.5, salon: 1.4, bar: 1.3, energy: 1.3, ecommerce: 1.3, entertainment: 1.2 },
    banned: [],
    priceMult: { car: 1.6, electronics: 1.6, luxury: 1.6, alcohol: 0.6, food: 0.7, fuel: 1.35 },
    businessNote: 'Brazilian firms spend well over a thousand hours a year on tax paperwork, so your first hire is a contador and your second is another contador.',
    nameWords: ['Amazônia', 'Tupi', 'Ipanema', 'Cerrado', 'Paulista', 'Guanabara', 'Ipê', 'Sabiá', 'Carioca', 'Jatobá'],
  },

  // Chile: copper, lithium, fruit and Atacama solar; open, orderly and fast to incorporate.
  cl: {
    countryId: 'cl', currencyName: 'Chilean peso', currencyCode: 'CLP',
    gdpPerCapita: 16_700, populationM: 19.8,
    corporateTax: 0.27, salesTax: 0.19, salesTaxName: 'IVA', minWage: 6_700,
    laborCost: 0.48, rentCost: 0.5, interestRate: 0.0475, inflation: 0.045,
    easeOfBusiness: 73, corruption: 37, startupDays: 4, startupFee: 150,
    exchange: { name: 'Bolsa de Santiago', code: 'BCS', index: 'S&P IPSA', volatility: 0.22, drift: 0.07 },
    demand: { energy: 1.6, farm: 1.4, bakery: 1.3, logistics: 1.2, ecommerce: 1.2, construction: 1.2 },
    banned: [],
    priceMult: { electronics: 1.15, luxury: 1.1, alcohol: 0.8, food: 0.85, fuel: 1.55 },
    businessNote: 'You can open a company online in a single day, then learn that every Chilean customer wants to pay in cuotas, even for a sandwich.',
    nameWords: ['Andes', 'Atacama', 'Mapocho', 'Araucaria', 'Cordillera', 'Copihue', 'Huemul', 'Maipo', 'Austral'],
  },

  // Colombia: coffee, flowers, oil, fashion in Medellín and medical tourism; frequent tax reforms.
  co: {
    countryId: 'co', currencyName: 'Colombian peso', currencyCode: 'COP',
    gdpPerCapita: 7_300, populationM: 53,
    corporateTax: 0.35, salesTax: 0.19, salesTaxName: 'IVA', minWage: 5_200,
    laborCost: 0.3, rentCost: 0.35, interestRate: 0.0925, inflation: 0.05,
    easeOfBusiness: 70, corruption: 61, startupDays: 10, startupFee: 700,
    exchange: { name: 'Bolsa de Valores de Colombia', code: 'BVC', index: 'MSCI COLCAP', volatility: 0.25, drift: 0.06 },
    demand: { cafe: 1.8, farm: 1.4, beauty: 1.4, energy: 1.3, fashion: 1.3, clinic: 1.3, hotel: 1.3, software: 1.2 },
    banned: [],
    priceMult: { car: 1.5, electronics: 1.25, luxury: 1.2, alcohol: 0.7, food: 0.6, fuel: 1.25 },
    businessNote: "The Cámara de Comercio registers you in a week, then every invoice goes electronic and a new tax reform arrives before you've mastered the last one.",
    nameWords: ['Cafetero', 'Magdalena', 'Esmeralda', 'Paisa', 'Orquídea', 'Cauca', 'Guadua', 'Macondo', 'Tayrona'],
  },

  // Ecuador: dollarized since 2000; bananas, shrimp, cocoa and oil; 2024's long power cuts.
  // Interest rate is a typical dollar lending benchmark.
  ec: {
    countryId: 'ec', currencyName: 'US dollar', currencyCode: 'USD',
    gdpPerCapita: 6_900, populationM: 18,
    corporateTax: 0.25, salesTax: 0.15, salesTaxName: 'IVA', minWage: 6_600,
    laborCost: 0.3, rentCost: 0.3, interestRate: 0.08, inflation: 0.02,
    easeOfBusiness: 58, corruption: 68, startupDays: 20, startupFee: 600,
    exchange: null,
    demand: { farm: 1.6, energy: 1.3, hotel: 1.3, logistics: 1.2, ecommerce: 0.7, software: 0.6, gameStudio: 0.4 },
    banned: [],
    priceMult: { car: 1.7, electronics: 1.3, luxury: 1.3, food: 0.75, fuel: 0.85 },
    businessNote: 'Dollarization keeps prices calm, but the 2024 power cuts taught every shopkeeper that a generator is a business plan, not an accessory.',
    nameWords: ['Chimborazo', 'Cotopaxi', 'Galápagos', 'Guayas', 'Equinoccio', 'Tungurahua', 'Cacao Fino', 'Mitad del Mundo'],
  },

  // Guyana: the world's fastest-growing economy thanks to offshore oil (GDP per head has
  // tripled), while everyday wages are still catching up.
  gy: {
    countryId: 'gy', currencyName: 'Guyanese dollar', currencyCode: 'GYD',
    gdpPerCapita: 29_000, populationM: 0.83,
    corporateTax: 0.25, salesTax: 0.14, salesTaxName: 'VAT', minWage: 3_500,
    laborCost: 0.35, rentCost: 0.55, interestRate: 0.05, inflation: 0.03,
    easeOfBusiness: 55, corruption: 61, startupDays: 18, startupFee: 300,
    exchange: null,
    demand: {
      energy: 2.5, construction: 2, realEstate: 1.8, hotel: 1.5, logistics: 1.5, restaurant: 1.3,
      farm: 1.2, manufacturing: 0.7, software: 0.6, gameStudio: 0.4,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.2, luxury: 1.2, alcohol: 0.7, food: 0.9, fuel: 1.25 },
    businessNote: "The oil money has arrived, so your rent, your contractor and your contractor's contractor have all tripled their Georgetown prices.",
    nameWords: ['Demerara', 'Essequibo', 'Berbice', 'Kaieteur', 'Rupununi', 'Mazaruni', 'Canje', 'Stabroek'],
  },

  // Paraguay: soy, beef and cheap Itaipú hydropower; low flat taxes and duty-light shopping in
  // Ciudad del Este.
  py: {
    countryId: 'py', currencyName: 'Paraguayan guaraní', currencyCode: 'PYG',
    gdpPerCapita: 6_300, populationM: 6.9,
    corporateTax: 0.1, salesTax: 0.1, salesTaxName: 'IVA', minWage: 4_700,
    laborCost: 0.25, rentCost: 0.28, interestRate: 0.06, inflation: 0.04,
    easeOfBusiness: 59, corruption: 76, startupDays: 20, startupFee: 700,
    exchange: null,
    demand: { farm: 2, energy: 1.5, logistics: 1.3, manufacturing: 1.2, autoShop: 1.2, hotel: 0.7, software: 0.5, gameStudio: 0.4 },
    banned: [],
    priceMult: { electronics: 0.95, luxury: 0.9, alcohol: 0.6, food: 0.65, fuel: 1.15 },
    businessNote: 'A 10% corporate tax and 10% IVA make accountants weep with joy, and half your customers in Ciudad del Este pay in Brazilian reais anyway.',
    nameWords: ['Guaraní', 'Chaco', 'Ñandutí', 'Tereré', 'Ypacaraí', 'Lapacho', 'Mbaracayú', 'Tekoporã', 'Pilcomayo'],
  },

  // Peru: world-famous cuisine, Machu Picchu and agro-exports; a mostly informal economy.
  pe: {
    countryId: 'pe', currencyName: 'Peruvian sol', currencyCode: 'PEN',
    gdpPerCapita: 8_300, populationM: 34,
    corporateTax: 0.295, salesTax: 0.18, salesTaxName: 'IGV', minWage: 4_400,
    laborCost: 0.28, rentCost: 0.35, interestRate: 0.0425, inflation: 0.02,
    easeOfBusiness: 69, corruption: 69, startupDays: 26, startupFee: 400,
    exchange: { name: 'Bolsa de Valores de Lima', code: 'BVL', index: 'S&P/BVL Peru General', volatility: 0.25, drift: 0.08 },
    demand: { restaurant: 1.7, hotel: 1.4, farm: 1.4, fashion: 1.2, construction: 1.2, ecommerce: 0.8, software: 0.7, gameStudio: 0.5 },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.15, luxury: 1.15, alcohol: 0.7, food: 0.65, fuel: 1.35 },
    businessNote: 'Most of the economy runs informally, so your toughest competitor is the stall next door that charges no IGV and has never heard of a permit.',
    nameWords: ['Inti', 'Inca', 'Rímac', 'Huascarán', 'Cóndor', 'Nazca', 'Vicuña', 'Misti', 'Chavín'],
  },

  // Uruguay: the continent's cleanest institutions, beef, software exports and Punta del Este;
  // also its priciest petrol and groceries.
  uy: {
    countryId: 'uy', currencyName: 'Uruguayan peso', currencyCode: 'UYU',
    gdpPerCapita: 23_000, populationM: 3.4,
    corporateTax: 0.25, salesTax: 0.22, salesTaxName: 'IVA', minWage: 7_200,
    laborCost: 0.5, rentCost: 0.55, interestRate: 0.09, inflation: 0.05,
    easeOfBusiness: 62, corruption: 24, startupDays: 7, startupFee: 700,
    exchange: null,
    demand: { farm: 1.8, software: 1.4, hotel: 1.3, realEstate: 1.2, energy: 1.2, cafe: 0.8, manufacturing: 0.7 },
    banned: [],
    priceMult: { car: 1.6, electronics: 1.3, luxury: 1.25, food: 1.1, fuel: 2.2 },
    businessNote: 'Uruguay is calm, clean and refreshingly honest, and it charges for the privilege: 22% IVA, the priciest petrol on the continent and a mate at every meeting.',
    nameWords: ['Oriental', 'Charrúa', 'Rambla', 'Celeste', 'Ceibo', 'Cerro', 'Candombe', 'Yí', 'Cuchilla'],
  },

  // Venezuela: oil country with near-free subsidized petrol, chronic inflation and an informal
  // dollar economy. Minimum wage includes the mandatory food and "economic war" bonuses.
  ve: {
    countryId: 've', currencyName: 'Venezuelan bolívar', currencyCode: 'VES',
    gdpPerCapita: 3_700, populationM: 28,
    corporateTax: 0.34, salesTax: 0.16, salesTaxName: 'IVA', minWage: 1_600,
    laborCost: 0.14, rentCost: 0.25, interestRate: 0.6, inflation: 1.5,
    easeOfBusiness: 30, corruption: 90, startupDays: 230, startupFee: 1_500,
    exchange: { name: 'Bolsa de Valores de Caracas', code: 'BVCC', index: 'IBC', volatility: 0.6, drift: 0.08 },
    demand: {
      energy: 1.5, grocery: 1.4, autoShop: 1.4, restaurant: 1.2, construction: 0.6, realEstate: 0.6,
      hotel: 0.5, ecommerce: 0.5, manufacturing: 0.4, software: 0.4, gameStudio: 0.3,
    },
    banned: [],
    priceMult: { car: 1.8, electronics: 1.5, luxury: 1.4, alcohol: 0.9, food: 1.1, fuel: 0.25 },
    businessNote: 'Registration takes the better part of a year, prices are quoted in dollars and paid in bolívars, and the exchange rate moves before the receipt finishes printing.',
    nameWords: ['Ávila', 'Orinoco', 'Araguaney', 'Roraima', 'Catatumbo', 'Llanero', 'Turpial', 'Canaima', 'Morichal'],
  },
}
