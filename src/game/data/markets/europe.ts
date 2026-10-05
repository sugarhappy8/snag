// Market profiles for Europe (see data/markets.ts for field meanings).
//
// Rounded mid-2020s figures: headline corporate tax, VAT and its local name, statutory minimum
// wage per full-time year in dollars (0 where wages are set by collective agreements), central
// bank policy rate, recent inflation, World Bank Doing Business-style ease (0-100), corruption
// (100 minus the TI CPI score) and the main exchange. Euro countries share the ECB rate.
import type { MarketProfile } from '../markets'

/** ECB deposit facility rate, used by every euro country (and euro-using microstates). */
const ECB_RATE = 0.02
const EURO = { currencyName: 'Euro', currencyCode: 'EUR' } as const

export const EUROPE_MARKETS: Record<string, MarketProfile> = {
  // Andorra: low taxes, ski slopes and tax-free shopping; no exchange of its own.
  ad: {
    countryId: 'ad', ...EURO, gdpPerCapita: 49_000, populationM: 0.08,
    corporateTax: 0.1, salesTax: 0.045, salesTaxName: 'IGI', minWage: 18_000,
    laborCost: 0.75, rentCost: 0.7, interestRate: ECB_RATE, inflation: 0.025,
    easeOfBusiness: 70, corruption: 30, startupDays: 30, startupFee: 3_000,
    exchange: null,
    demand: { hotel: 2, restaurant: 1.4, bar: 1.3, fashion: 1.3, realEstate: 1.4, manufacturing: 0.4, farm: 0.4, software: 0.6, gameStudio: 0.5, logistics: 0.6 },
    banned: [],
    priceMult: { car: 0.9, luxury: 0.85, alcohol: 0.6, food: 0.8, fuel: 1.5 },
    businessNote: 'Ten percent corporate tax and a stream of bargain-hunting skiers sound perfect, until you meet the residency rules, the foreign-investment permit and the one road in from Spain.',
    nameWords: ['Pirineu', 'Valira', 'Comapedrosa', 'Casamanya', 'Estany', 'Madriu', 'Coll', 'Vall'],
  },

  // Austria: alpine tourism, coffee houses, compulsory chamber membership, no statutory minimum wage.
  at: {
    countryId: 'at', ...EURO, gdpPerCapita: 58_000, populationM: 9.2,
    corporateTax: 0.23, salesTax: 0.2, salesTaxName: 'MwSt', minWage: 0,
    laborCost: 0.95, rentCost: 0.8, interestRate: ECB_RATE, inflation: 0.03,
    easeOfBusiness: 79, corruption: 33, startupDays: 21, startupFee: 1_800,
    exchange: { name: 'Vienna Stock Exchange', code: 'VSE', index: 'ATX', volatility: 0.2, drift: 0.07 },
    demand: { hotel: 1.6, cafe: 1.5, bakery: 1.3, restaurant: 1.2, manufacturing: 1.2, entertainment: 1.2, farm: 0.8 },
    banned: [],
    priceMult: { car: 1.2, electronics: 1.15, alcohol: 0.8, food: 0.85, fuel: 1.75 },
    businessNote: 'Every trade has its chamber, every chamber has its form, and the coffee house where you fill them in will happily let you stay until closing.',
    nameWords: ['Alpen', 'Donau', 'Tirol', 'Edelweiß', 'Kaiser', 'Salzach', 'Gipfel', 'Wachau', 'Steirer'],
  },

  // Belgium: beer, frites, the Port of Antwerp and some of Europe's highest labour costs.
  be: {
    countryId: 'be', ...EURO, gdpPerCapita: 56_000, populationM: 11.9,
    corporateTax: 0.25, salesTax: 0.21, salesTaxName: 'BTW/TVA', minWage: 29_000,
    laborCost: 1.1, rentCost: 0.75, interestRate: ECB_RATE, inflation: 0.03,
    easeOfBusiness: 75, corruption: 31, startupDays: 5, startupFee: 1_600,
    exchange: { name: 'Euronext Brussels', code: 'EBR', index: 'BEL 20', volatility: 0.17, drift: 0.06 },
    demand: { brewery: 1.8, bar: 1.3, bakery: 1.3, foodTruck: 1.2, restaurant: 1.2, logistics: 1.4, marketing: 1.2 },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.15, alcohol: 0.75, food: 0.85, fuel: 1.9 },
    businessNote: 'Labour costs are among the steepest in Europe and the paperwork comes in three languages, but a good frituur or brewery never runs short of customers.',
    nameWords: ['Schelde', 'Ardennes', 'Brabant', 'Meuse', 'Leie', 'Kempen', 'Zenne', 'Hainaut', 'Manneken'],
  },

  // Croatia: Adriatic tourism and café culture; joined the euro in 2023.
  hr: {
    countryId: 'hr', ...EURO, gdpPerCapita: 24_500, populationM: 3.9,
    corporateTax: 0.18, salesTax: 0.25, salesTaxName: 'PDV', minWage: 13_400,
    laborCost: 0.4, rentCost: 0.45, interestRate: ECB_RATE, inflation: 0.04,
    easeOfBusiness: 74, corruption: 53, startupDays: 7, startupFee: 700,
    exchange: { name: 'Zagreb Stock Exchange', code: 'ZSE', index: 'CROBEX', volatility: 0.15, drift: 0.05 },
    demand: { hotel: 2.2, restaurant: 1.5, cafe: 1.6, bar: 1.4, realEstate: 1.3, entertainment: 1.2, manufacturing: 0.6, software: 0.8 },
    banned: [],
    priceMult: { car: 1.15, electronics: 1.2, alcohol: 0.65, food: 0.65, fuel: 1.6 },
    businessNote: 'One good summer on the coast can pay for the whole year, provided the permits arrive before the tourists leave.',
    nameWords: ['Jadran', 'Velebit', 'Dalmacija', 'Sava', 'Drava', 'Kvarner', 'Istra', 'Lavanda', 'Plitvice'],
  },

  // Czech Republic: beer, car plants and game studios.
  cz: {
    countryId: 'cz', currencyName: 'Czech koruna', currencyCode: 'CZK', gdpPerCapita: 33_000, populationM: 10.9,
    corporateTax: 0.21, salesTax: 0.21, salesTaxName: 'DPH', minWage: 11_500,
    laborCost: 0.45, rentCost: 0.55, interestRate: 0.035, inflation: 0.025,
    easeOfBusiness: 76, corruption: 44, startupDays: 15, startupFee: 600,
    exchange: { name: 'Prague Stock Exchange', code: 'PSE', index: 'PX', volatility: 0.18, drift: 0.06 },
    demand: { brewery: 2, bar: 1.6, manufacturing: 1.5, autoShop: 1.2, gameStudio: 1.4, hotel: 1.3, logistics: 1.2 },
    banned: [],
    priceMult: { car: 1.05, electronics: 1.15, alcohol: 0.4, food: 0.6, fuel: 1.7 },
    businessNote: 'A trade licence is quick to get and the beer is cheaper than the water, but the bank will still want three stamped originals of everything.',
    nameWords: ['Vltava', 'Morava', 'Bohemia', 'Krkonoše', 'Šumava', 'Labe', 'Lev', 'Hrad', 'Sokol'],
  },

  // Denmark: easiest place in Europe to start up, priciest place to hire; huge car registration tax.
  dk: {
    countryId: 'dk', currencyName: 'Danish krone', currencyCode: 'DKK', gdpPerCapita: 71_000, populationM: 6,
    corporateTax: 0.22, salesTax: 0.25, salesTaxName: 'Moms', minWage: 0,
    laborCost: 1.15, rentCost: 0.95, interestRate: 0.016, inflation: 0.02,
    easeOfBusiness: 85, corruption: 10, startupDays: 3, startupFee: 150,
    exchange: { name: 'Nasdaq Copenhagen', code: 'CPH', index: 'OMX Copenhagen 25', volatility: 0.19, drift: 0.09 },
    demand: { bakery: 1.4, cafe: 1.2, software: 1.3, gameStudio: 1.2, energy: 1.4, logistics: 1.3, farm: 1.2, autoShop: 0.7 },
    banned: [],
    priceMult: { car: 1.6, electronics: 1.2, luxury: 1.1, food: 1, fuel: 2.1 },
    businessNote: 'Registering a company takes an afternoon online; paying a Danish salary plus 25% moms takes the rest of your life.',
    nameWords: ['Nord', 'Hygge', 'Øresund', 'Jylland', 'Fyn', 'Bølge', 'Dannebrog', 'Viking', 'Limfjord'],
  },

  // Estonia: e-residency, digital everything, profits taxed only when distributed.
  ee: {
    countryId: 'ee', ...EURO, gdpPerCapita: 31_000, populationM: 1.37,
    corporateTax: 0.22, salesTax: 0.24, salesTaxName: 'Käibemaks', minWage: 12_200,
    laborCost: 0.45, rentCost: 0.45, interestRate: ECB_RATE, inflation: 0.05,
    easeOfBusiness: 81, corruption: 24, startupDays: 1, startupFee: 300,
    exchange: { name: 'Nasdaq Tallinn', code: 'TLN', index: 'OMX Tallinn', volatility: 0.18, drift: 0.06 },
    demand: { software: 2, ecommerce: 1.5, gameStudio: 1.3, energy: 1.2, restaurant: 0.8, manufacturing: 0.8, farm: 0.7 },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.18, alcohol: 0.75, food: 0.7, fuel: 1.8 },
    businessNote: 'You can found a company online before your coffee cools, and profits you leave in the business are not taxed until you pay them out.',
    nameWords: ['Toompea', 'Saare', 'Peipsi', 'Tamm', 'Hansa', 'Laine', 'Virumaa', 'Emajõe', 'Rebane'],
  },

  // Finland: game studios, coffee, saunas; no statutory minimum wage.
  fi: {
    countryId: 'fi', ...EURO, gdpPerCapita: 54_000, populationM: 5.6,
    corporateTax: 0.2, salesTax: 0.255, salesTaxName: 'ALV', minWage: 0,
    laborCost: 0.9, rentCost: 0.75, interestRate: ECB_RATE, inflation: 0.02,
    easeOfBusiness: 80, corruption: 12, startupDays: 13, startupFee: 300,
    exchange: { name: 'Nasdaq Helsinki', code: 'HEL', index: 'OMX Helsinki 25', volatility: 0.2, drift: 0.06 },
    demand: { gameStudio: 2.2, software: 1.5, cafe: 1.3, manufacturing: 1.1, bar: 0.8, hotel: 0.8, farm: 0.6 },
    banned: [],
    priceMult: { car: 1.25, electronics: 1.2, luxury: 1.1, alcohol: 1.4, food: 0.85, fuel: 2 },
    businessNote: 'There is no legal minimum wage, only union agreements that work exactly like one, and the serious negotiations happen in the sauna.',
    nameWords: ['Revontuli', 'Sisu', 'Kuusi', 'Järvi', 'Lappi', 'Saimaa', 'Kaamos', 'Ilves', 'Hiisi'],
  },

  // France: bakeries, fashion, the most visited country on Earth, and a thick labour code.
  // Euronext Paris is also the fallback exchange for European countries without their own.
  fr: {
    countryId: 'fr', ...EURO, gdpPerCapita: 47_000, populationM: 68.6,
    corporateTax: 0.25, salesTax: 0.2, salesTaxName: 'TVA', minWage: 25_000,
    laborCost: 1, rentCost: 1, interestRate: ECB_RATE, inflation: 0.015,
    easeOfBusiness: 77, corruption: 33, startupDays: 4, startupFee: 500,
    exchange: { name: 'Euronext Paris', code: 'EPA', index: 'CAC 40', volatility: 0.18, drift: 0.07 },
    demand: { bakery: 2, restaurant: 1.5, cafe: 1.4, fashion: 1.8, beauty: 1.6, hotel: 1.5, farm: 1.2, entertainment: 1.2, brewery: 0.8 },
    banned: [],
    priceMult: { car: 1.15, electronics: 1.15, luxury: 0.9, alcohol: 0.9, food: 0.85, fuel: 2 },
    businessNote: 'The tax office is ruthlessly efficient, the labour code is thicker than a baguette is long, and the whole country closes for August.',
    nameWords: ['Seine', 'Loire', 'Provence', 'Lumière', 'Rivage', 'Gironde', 'Coquelicot', 'Montmartre', 'Fleur'],
  },

  // Germany: factories, car culture, bakeries on every corner and a ~30% combined business tax.
  de: {
    countryId: 'de', ...EURO, gdpPerCapita: 56_000, populationM: 83.5,
    corporateTax: 0.3, salesTax: 0.19, salesTaxName: 'MwSt', minWage: 31_000,
    laborCost: 1, rentCost: 0.9, interestRate: ECB_RATE, inflation: 0.022,
    easeOfBusiness: 80, corruption: 25, startupDays: 8, startupFee: 1_000,
    exchange: { name: 'Frankfurt Stock Exchange', code: 'FWB', index: 'DAX', volatility: 0.19, drift: 0.08 },
    demand: { manufacturing: 1.6, autoShop: 1.5, brewery: 1.6, bakery: 1.4, logistics: 1.4, energy: 1.2, software: 1.1, construction: 0.9 },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.15, alcohol: 0.6, food: 0.75, fuel: 2 },
    businessNote: 'Everything is possible with the right form, the right stamp and a Bürgeramt appointment six weeks from now.',
    nameWords: ['Rhein', 'Elbe', 'Schwarzwald', 'Adler', 'Eiche', 'Zugspitze', 'Hanse', 'Spree', 'Brocken'],
  },

  // Greece: islands, tourism season, shipping, olives and a famously creative tax code.
  gr: {
    countryId: 'gr', ...EURO, gdpPerCapita: 25_000, populationM: 10.4,
    corporateTax: 0.22, salesTax: 0.24, salesTaxName: 'FPA', minWage: 14_200,
    laborCost: 0.38, rentCost: 0.45, interestRate: ECB_RATE, inflation: 0.03,
    easeOfBusiness: 68, corruption: 51, startupDays: 12, startupFee: 1_100,
    exchange: { name: 'Athens Stock Exchange', code: 'ATHEX', index: 'ATHEX Composite', volatility: 0.25, drift: 0.05 },
    demand: { hotel: 2.3, restaurant: 1.5, cafe: 1.5, bar: 1.4, foodTruck: 1.2, farm: 1.3, logistics: 1.2, software: 0.7, manufacturing: 0.6, gameStudio: 0.6 },
    banned: [],
    priceMult: { car: 1.2, electronics: 1.2, alcohol: 0.75, food: 0.7, fuel: 2 },
    businessNote: 'Tourism pays the bills from May to October; the ever-changing tax rules keep the accountants busy all year round.',
    nameWords: ['Olympos', 'Aigaio', 'Delphi', 'Elia', 'Helios', 'Kyma', 'Pindos', 'Akropolis', 'Thalassa'],
  },

  // Hungary: Europe's lowest corporate tax, the world's highest VAT, car and battery plants.
  hu: {
    countryId: 'hu', currencyName: 'Hungarian forint', currencyCode: 'HUF', gdpPerCapita: 23_000, populationM: 9.6,
    corporateTax: 0.09, salesTax: 0.27, salesTaxName: 'ÁFA', minWage: 9_800,
    laborCost: 0.37, rentCost: 0.4, interestRate: 0.065, inflation: 0.045,
    easeOfBusiness: 73, corruption: 59, startupDays: 7, startupFee: 600,
    exchange: { name: 'Budapest Stock Exchange', code: 'BÉT', index: 'BUX', volatility: 0.22, drift: 0.09 },
    demand: { manufacturing: 1.5, autoShop: 1.1, bar: 1.3, hotel: 1.2, clinic: 1.4, farm: 1.1, software: 0.9 },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.25, luxury: 1.1, alcohol: 0.55, food: 0.6, fuel: 1.7 },
    businessNote: 'Corporate tax is the lowest in Europe at 9%, ÁFA is the highest on Earth at 27%, and the rules change faster than the forint.',
    nameWords: ['Duna', 'Tisza', 'Balaton', 'Puszta', 'Turul', 'Mátra', 'Tokaj', 'Paprika', 'Bakony'],
  },

  // Ireland: 12.5% corporate tax, tech giants' EU headquarters, pubs and a housing shortage.
  ie: {
    countryId: 'ie', ...EURO, gdpPerCapita: 108_000, populationM: 5.4,
    corporateTax: 0.125, salesTax: 0.23, salesTaxName: 'VAT', minWage: 31_500,
    laborCost: 0.95, rentCost: 1.1, interestRate: ECB_RATE, inflation: 0.02,
    easeOfBusiness: 80, corruption: 23, startupDays: 7, startupFee: 200,
    exchange: { name: 'Euronext Dublin', code: 'ISE', index: 'ISEQ 20', volatility: 0.2, drift: 0.07 },
    demand: { software: 1.8, ecommerce: 1.3, bar: 1.6, brewery: 1.3, realEstate: 1.6, construction: 1.5, farm: 1.3, hotel: 1.2, manufacturing: 1.2 },
    banned: [],
    priceMult: { car: 1.3, electronics: 1.15, alcohol: 1.2, food: 0.8, fuel: 1.95 },
    businessNote: 'A 12.5% corporate tax rate brought the tech giants to Dublin; the rents they pushed up are now everybody else\'s problem.',
    nameWords: ['Shannon', 'Liffey', 'Emerald', 'Clover', 'Celtic', 'Burren', 'Connemara', 'Wicklow', 'Claddagh'],
  },

  // Italy: food, fashion, tourism and bureaucracy; no statutory minimum wage.
  it: {
    countryId: 'it', ...EURO, gdpPerCapita: 41_000, populationM: 59,
    corporateTax: 0.24, salesTax: 0.22, salesTaxName: 'IVA', minWage: 0,
    laborCost: 0.7, rentCost: 0.75, interestRate: ECB_RATE, inflation: 0.015,
    easeOfBusiness: 73, corruption: 46, startupDays: 11, startupFee: 2_800,
    exchange: { name: 'Borsa Italiana', code: 'BIT', index: 'FTSE MIB', volatility: 0.21, drift: 0.06 },
    demand: { restaurant: 1.5, cafe: 1.6, bakery: 1.3, fashion: 2, beauty: 1.3, hotel: 1.5, farm: 1.2, manufacturing: 1.2, autoShop: 1.1, software: 0.8, gameStudio: 0.7 },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.15, luxury: 0.9, alcohol: 0.8, food: 0.8, fuel: 2 },
    businessNote: 'Opening a café takes a notary, three licences, a commercialista and a saint\'s patience; at least the espresso while you wait costs about a euro.',
    nameWords: ['Tevere', 'Vesuvio', 'Dolomiti', 'Toscana', 'Etna', 'Riviera', 'Sole', 'Arno', 'Stella'],
  },

  // Monaco: no personal income tax, billionaire customers, astronomical rent and no farmland.
  mc: {
    countryId: 'mc', ...EURO, gdpPerCapita: 240_000, populationM: 0.04,
    corporateTax: 0.25, salesTax: 0.2, salesTaxName: 'TVA', minWage: 26_000,
    laborCost: 1.1, rentCost: 3, interestRate: ECB_RATE, inflation: 0.015,
    easeOfBusiness: 65, corruption: 28, startupDays: 45, startupFee: 5_000,
    exchange: null,
    demand: { hotel: 2, restaurant: 1.6, bar: 1.4, entertainment: 2.2, fashion: 2, beauty: 1.8, realEstate: 2.5, construction: 1.3, autoShop: 1.4, manufacturing: 0.3, logistics: 0.4 },
    banned: ['farm'],
    priceMult: { car: 1.1, electronics: 1.15, alcohol: 1.6, food: 1.2, fuel: 2 },
    businessNote: 'No income tax and customers with superyachts, but every new business needs the government\'s blessing, the rent is astronomical, and the last farmland was built over long ago.',
    nameWords: ['Riviera', 'Azur', 'Rocher', 'Hercule', 'Larvotto', 'Corniche', 'Fontvieille', 'Prestige', 'Belle Époque'],
  },

  // Netherlands: Rotterdam port, greenhouse farming, bikes and a fast notary system.
  nl: {
    countryId: 'nl', ...EURO, gdpPerCapita: 68_000, populationM: 18,
    corporateTax: 0.258, salesTax: 0.21, salesTaxName: 'BTW', minWage: 30_500,
    laborCost: 1, rentCost: 0.95, interestRate: ECB_RATE, inflation: 0.03,
    easeOfBusiness: 76, corruption: 22, startupDays: 4, startupFee: 900,
    exchange: { name: 'Euronext Amsterdam', code: 'AMS', index: 'AEX', volatility: 0.18, drift: 0.08 },
    demand: { logistics: 1.8, farm: 1.5, ecommerce: 1.4, software: 1.3, gameStudio: 1.2, marketing: 1.2, energy: 1.1, autoShop: 0.7 },
    banned: [],
    priceMult: { car: 1.3, electronics: 1.15, alcohol: 0.9, food: 0.75, fuel: 2.2 },
    businessNote: 'Founding a BV is quick and the ports run like clockwork, but a shop front in Amsterdam is harder to find than a free spot in the bike rack.',
    nameWords: ['Tulp', 'Molen', 'Polder', 'Oranje', 'Gracht', 'Zeeland', 'Dijk', 'Wadden', 'Holland'],
  },

  // Norway: oil and gas, salmon farming, sky-high wages and alcohol taxes.
  no: {
    countryId: 'no', currencyName: 'Norwegian krone', currencyCode: 'NOK', gdpPerCapita: 90_000, populationM: 5.6,
    corporateTax: 0.22, salesTax: 0.25, salesTaxName: 'MVA', minWage: 0,
    laborCost: 1.3, rentCost: 1.1, interestRate: 0.04, inflation: 0.03,
    easeOfBusiness: 83, corruption: 19, startupDays: 4, startupFee: 600,
    exchange: { name: 'Oslo Børs', code: 'OSE', index: 'OBX', volatility: 0.21, drift: 0.08 },
    demand: { energy: 2.5, farm: 1.3, logistics: 1.3, hotel: 1.3, construction: 1.2, software: 1.1, restaurant: 0.9, bar: 0.7, brewery: 0.8 },
    banned: [],
    priceMult: { car: 1.3, electronics: 1.2, luxury: 1.15, alcohol: 1.8, food: 1.15, fuel: 2.2 },
    businessNote: 'Oil money keeps wages and prices sky-high, so a pint at your own bar will cost the customer more than the burger that came with it.',
    nameWords: ['Fjord', 'Nordlys', 'Troll', 'Fjell', 'Lofoten', 'Havbris', 'Fossen', 'Viking', 'Midnattsol'],
  },

  // Poland: Europe's warehouse, outsourcing hub and a big game-development scene.
  pl: {
    countryId: 'pl', currencyName: 'Polish złoty', currencyCode: 'PLN', gdpPerCapita: 26_000, populationM: 36.6,
    corporateTax: 0.19, salesTax: 0.23, salesTaxName: 'VAT', minWage: 15_000,
    laborCost: 0.4, rentCost: 0.45, interestRate: 0.045, inflation: 0.04,
    easeOfBusiness: 76, corruption: 47, startupDays: 12, startupFee: 300,
    exchange: { name: 'Warsaw Stock Exchange', code: 'GPW', index: 'WIG20', volatility: 0.23, drift: 0.07 },
    demand: { logistics: 1.6, manufacturing: 1.4, construction: 1.3, gameStudio: 1.6, software: 1.3, ecommerce: 1.3, farm: 1.3, autoShop: 1.2 },
    banned: [],
    priceMult: { car: 1, electronics: 1.2, alcohol: 0.5, food: 0.5, fuel: 1.6 },
    businessNote: 'You can register a company online in a day; finding an accountant who can explain your ZUS contributions takes considerably longer.',
    nameWords: ['Wisła', 'Tatry', 'Bałtyk', 'Orzeł', 'Mazowsze', 'Bursztyn', 'Odra', 'Podhale', 'Sokół'],
  },

  // Portugal: tourism, pastries, a Lisbon tech scene and the one-hour company.
  pt: {
    countryId: 'pt', ...EURO, gdpPerCapita: 30_000, populationM: 10.7,
    corporateTax: 0.21, salesTax: 0.23, salesTaxName: 'IVA', minWage: 14_000,
    laborCost: 0.42, rentCost: 0.55, interestRate: ECB_RATE, inflation: 0.024,
    easeOfBusiness: 77, corruption: 43, startupDays: 2, startupFee: 400,
    exchange: { name: 'Euronext Lisbon', code: 'ELI', index: 'PSI', volatility: 0.19, drift: 0.05 },
    demand: { hotel: 1.9, restaurant: 1.4, cafe: 1.5, bakery: 1.5, realEstate: 1.5, software: 1.2, farm: 1.1, manufacturing: 0.8 },
    banned: [],
    priceMult: { car: 1.3, electronics: 1.2, alcohol: 0.55, food: 0.6, fuel: 1.9 },
    businessNote: 'Empresa na Hora will register your company over a long lunch; the licence for the café terrace takes slightly longer than an hour.',
    nameWords: ['Tejo', 'Douro', 'Atlântico', 'Lusitânia', 'Azulejo', 'Alfama', 'Algarve', 'Caravela', 'Saudade'],
  },

  // Romania: IT outsourcing, farmland, car plants and frequently rewritten tax rules.
  ro: {
    countryId: 'ro', currencyName: 'Romanian leu', currencyCode: 'RON', gdpPerCapita: 20_000, populationM: 19,
    corporateTax: 0.16, salesTax: 0.21, salesTaxName: 'TVA', minWage: 10_900,
    laborCost: 0.33, rentCost: 0.35, interestRate: 0.065, inflation: 0.08,
    easeOfBusiness: 73, corruption: 54, startupDays: 15, startupFee: 300,
    exchange: { name: 'Bucharest Stock Exchange', code: 'BVB', index: 'BET', volatility: 0.2, drift: 0.09 },
    demand: { software: 1.5, farm: 1.4, construction: 1.3, manufacturing: 1.2, autoShop: 1.2, ecommerce: 1.1, energy: 1.1, hotel: 0.9 },
    banned: [],
    priceMult: { electronics: 1.15, alcohol: 0.45, food: 0.5, fuel: 1.6 },
    businessNote: 'Start-up costs are low and the programmers are excellent, but the tax rules change so often that accountants read the Official Gazette like a thriller.',
    nameWords: ['Carpați', 'Dunărea', 'Transilvania', 'Bucegi', 'Olt', 'Mureș', 'Zimbru', 'Delta', 'Doina'],
  },

  // Russia: energy giant under sanctions; foreign brands gone, imports pricey, loans expensive.
  ru: {
    countryId: 'ru', currencyName: 'Russian ruble', currencyCode: 'RUB', gdpPerCapita: 14_000, populationM: 144,
    corporateTax: 0.25, salesTax: 0.22, salesTaxName: 'NDS', minWage: 3_300,
    laborCost: 0.33, rentCost: 0.4, interestRate: 0.16, inflation: 0.08,
    easeOfBusiness: 65, corruption: 78, startupDays: 10, startupFee: 300,
    exchange: { name: 'Moscow Exchange', code: 'MOEX', index: 'MOEX Russia', volatility: 0.35, drift: 0.1 },
    demand: { energy: 2.8, construction: 1.3, autoShop: 1.3, logistics: 1.3, ecommerce: 1.4, manufacturing: 1.2, farm: 1.2, fashion: 0.8, gameStudio: 0.8, hotel: 0.8 },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.25, luxury: 1.5, alcohol: 0.5, food: 0.45, fuel: 0.8 },
    businessNote: 'The foreign brands have left and their shelf space is up for grabs, but a 16% key rate makes loans painful and an inspector\'s visit can cost even more.',
    nameWords: ['Volga', 'Ural', 'Baikal', 'Neva', 'Taiga', 'Altai', 'Sever', 'Sokol', 'Kama'],
  },

  // Serbia: IT and game studios, raspberries, kafana culture and a construction boom.
  rs: {
    countryId: 'rs', currencyName: 'Serbian dinar', currencyCode: 'RSD', gdpPerCapita: 13_500, populationM: 6.6,
    corporateTax: 0.15, salesTax: 0.2, salesTaxName: 'PDV', minWage: 6_100,
    laborCost: 0.27, rentCost: 0.3, interestRate: 0.0575, inflation: 0.04,
    easeOfBusiness: 76, corruption: 65, startupDays: 7, startupFee: 200,
    exchange: { name: 'Belgrade Stock Exchange', code: 'BELEX', index: 'BELEX15', volatility: 0.18, drift: 0.05 },
    demand: { software: 1.4, gameStudio: 1.3, farm: 1.4, bakery: 1.3, cafe: 1.4, bar: 1.3, construction: 1.4, manufacturing: 1.1, hotel: 0.8 },
    banned: [],
    priceMult: { car: 1.05, electronics: 1.25, luxury: 1.15, alcohol: 0.4, food: 0.5, fuel: 1.75 },
    businessNote: 'Registering a d.o.o. is quick and cheap, but deals are still sealed over coffee in a kafana and the bank still asks for a company stamp nobody legally needs.',
    nameWords: ['Sava', 'Dunav', 'Morava', 'Šumadija', 'Kopaonik', 'Avala', 'Zlatibor', 'Javor', 'Tara'],
  },

  // Slovakia: more cars built per person than anywhere; no meaningful stock market.
  sk: {
    countryId: 'sk', ...EURO, gdpPerCapita: 27_000, populationM: 5.4,
    corporateTax: 0.21, salesTax: 0.23, salesTaxName: 'DPH', minWage: 11_300,
    laborCost: 0.42, rentCost: 0.4, interestRate: ECB_RATE, inflation: 0.04,
    easeOfBusiness: 76, corruption: 51, startupDays: 21, startupFee: 500,
    exchange: null,
    demand: { manufacturing: 1.8, autoShop: 1.2, logistics: 1.2, brewery: 1.1, software: 0.9, gameStudio: 0.8, hotel: 0.9 },
    banned: [],
    priceMult: { car: 1.05, electronics: 1.18, alcohol: 0.5, food: 0.6, fuel: 1.7 },
    businessNote: 'Slovakia builds more cars per person than anywhere on Earth, yet registering a company still takes longer than building one.',
    nameWords: ['Tatry', 'Váh', 'Dunaj', 'Fatra', 'Hron', 'Orava', 'Javor', 'Spiš', 'Sokol'],
  },

  // Spain: tourism, more bars per person than almost anywhere, olive oil and solar power.
  es: {
    countryId: 'es', ...EURO, gdpPerCapita: 36_000, populationM: 49,
    corporateTax: 0.25, salesTax: 0.21, salesTaxName: 'IVA', minWage: 19_000,
    laborCost: 0.6, rentCost: 0.65, interestRate: ECB_RATE, inflation: 0.027,
    easeOfBusiness: 78, corruption: 44, startupDays: 13, startupFee: 1_000,
    exchange: { name: 'Bolsa de Madrid', code: 'BME', index: 'IBEX 35', volatility: 0.2, drift: 0.06 },
    demand: { hotel: 2, bar: 1.8, restaurant: 1.5, cafe: 1.2, farm: 1.3, energy: 1.3, realEstate: 1.3, entertainment: 1.2, manufacturing: 0.9 },
    banned: [],
    priceMult: { car: 1.05, electronics: 1.15, alcohol: 0.6, food: 0.65, fuel: 1.6 },
    businessNote: 'Spain has more bars per person than almost anywhere, and every single one needed a licence, a gestor and a long summer of waiting for both.',
    nameWords: ['Sol', 'Sierra', 'Ebro', 'Guadalquivir', 'Castilla', 'Olivo', 'Brisa', 'Duero', 'Alhambra'],
  },

  // Sweden: tech and game studios, fika, state alcohol monopoly, union-set wages.
  se: {
    countryId: 'se', currencyName: 'Swedish krona', currencyCode: 'SEK', gdpPerCapita: 58_000, populationM: 10.6,
    corporateTax: 0.206, salesTax: 0.25, salesTaxName: 'Moms', minWage: 0,
    laborCost: 0.95, rentCost: 0.9, interestRate: 0.0175, inflation: 0.02,
    easeOfBusiness: 82, corruption: 20, startupDays: 7, startupFee: 250,
    exchange: { name: 'Nasdaq Stockholm', code: 'STO', index: 'OMX Stockholm 30', volatility: 0.19, drift: 0.09 },
    demand: { software: 1.6, gameStudio: 1.8, ecommerce: 1.4, cafe: 1.4, bakery: 1.2, fashion: 1.2, energy: 1.2, manufacturing: 1.1, bar: 0.7 },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.2, luxury: 1.1, alcohol: 1.4, food: 0.8, fuel: 1.9 },
    businessNote: 'Registering is painless online, but the state sells the strong alcohol, the unions set the wages, and the afternoon fika is not up for negotiation.',
    nameWords: ['Nord', 'Fjäll', 'Älv', 'Skog', 'Ek', 'Lagom', 'Mälaren', 'Vänern', 'Kanel'],
  },

  // Switzerland: low taxes, strong franc, private clinics and the priciest groceries in Europe.
  ch: {
    countryId: 'ch', currencyName: 'Swiss franc', currencyCode: 'CHF', gdpPerCapita: 105_000, populationM: 9,
    corporateTax: 0.15, salesTax: 0.081, salesTaxName: 'MWST', minWage: 0,
    laborCost: 1.45, rentCost: 1.4, interestRate: 0, inflation: 0.005,
    easeOfBusiness: 77, corruption: 19, startupDays: 10, startupFee: 3_000,
    exchange: { name: 'SIX Swiss Exchange', code: 'SIX', index: 'SMI', volatility: 0.15, drift: 0.06 },
    demand: { clinic: 1.5, hotel: 1.4, manufacturing: 1.3, realEstate: 1.3, fashion: 1.3, software: 1.2, restaurant: 0.9, farm: 0.8 },
    banned: [],
    priceMult: { alcohol: 1.1, food: 1.4, fuel: 2.15 },
    businessNote: 'The franc is rock-solid and the taxes are gentle, but the rent, the wages and twenty-six different cantonal rulebooks are not.',
    nameWords: ['Matterhorn', 'Jura', 'Gotthard', 'Rhône', 'Aare', 'Säntis', 'Eiger', 'Léman', 'Ticino'],
  },

  // Ukraine: wartime economy; farmland, rebuilding, a resilient IT sector, equities frozen.
  ua: {
    countryId: 'ua', currencyName: 'Ukrainian hryvnia', currencyCode: 'UAH', gdpPerCapita: 5_700, populationM: 35,
    corporateTax: 0.18, salesTax: 0.2, salesTaxName: 'PDV', minWage: 2_300,
    laborCost: 0.17, rentCost: 0.18, interestRate: 0.155, inflation: 0.12,
    easeOfBusiness: 58, corruption: 65, startupDays: 3, startupFee: 150,
    exchange: null,
    demand: { construction: 1.6, logistics: 1.4, farm: 1.6, software: 1.4, gameStudio: 1.2, energy: 1.3, ecommerce: 1.2, clinic: 1.2, realEstate: 0.8, hotel: 0.4, entertainment: 0.6 },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.15, luxury: 1.2, alcohol: 0.35, food: 0.4, fuel: 1.4 },
    businessNote: 'The Diia app will register your business from your phone in minutes; the generator for the next power cut is a separate line in the business plan.',
    nameWords: ['Dnipro', 'Karpaty', 'Kalyna', 'Soniashnyk', 'Stepova', 'Polissia', 'Desna', 'Svitanok', 'Prostir'],
  },

  // United Kingdom: London finance and adland, pubs, fast registration and business rates.
  gb: {
    countryId: 'gb', currencyName: 'Pound sterling', currencyCode: 'GBP', gdpPerCapita: 54_000, populationM: 69,
    corporateTax: 0.25, salesTax: 0.2, salesTaxName: 'VAT', minWage: 31_500,
    laborCost: 0.85, rentCost: 1.15, interestRate: 0.04, inflation: 0.035,
    easeOfBusiness: 84, corruption: 29, startupDays: 2, startupFee: 100,
    exchange: { name: 'London Stock Exchange', code: 'LSE', index: 'FTSE 100', volatility: 0.16, drift: 0.06 },
    demand: { bar: 1.4, cafe: 1.2, software: 1.4, gameStudio: 1.4, marketing: 1.4, ecommerce: 1.3, fashion: 1.2, realEstate: 1.3, farm: 0.8, manufacturing: 0.8 },
    banned: [],
    priceMult: { car: 1.1, electronics: 1.1, alcohol: 1, food: 0.75, fuel: 1.85 },
    businessNote: 'Companies House will register you within a day for fifty quid; the rent, the business rates and the drizzle will test your resolve for considerably longer.',
    nameWords: ['Thames', 'Albion', 'Pennine', 'Highland', 'Severn', 'Mersey', 'Royal Oak', 'Cotswold', 'Clyde'],
  },
}
