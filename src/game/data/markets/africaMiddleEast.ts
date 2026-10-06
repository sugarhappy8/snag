// Market profiles for Africa and the Middle East (see data/markets.ts for field meanings).
//
// Rounded mid-2020s figures: headline corporate tax, consumption tax and its local name, the
// statutory minimum wage as a full-time year in dollars (0 where there is no general one), central
// bank policy rate, recent inflation, a Doing Business style ease score, 100 minus the Transparency
// International CPI score, and the real main exchange. laborCost stays within about ±35% of
// world.ts `wealth`, since the game pays salaries as US pay x wealth.
//
// Exchange drift is a long-run yearly return as felt in dollars: in Turkey, Iran or Zimbabwe the
// index soars in local currency, but devaluation eats most of it, so the wildness lives in
// `volatility` rather than in the drift.
//
// Gulf note: Saudi Arabia, Kuwait and Qatar tax foreign-owned company profits (20%, 15%, 10%) but
// firms owned by their own citizens pay zakat or small levies instead, so corporateTax holds what
// a local owner pays. The UAE's 9% applies to everyone.
import type { MarketProfile } from '../markets'

export const AFRICA_MIDDLE_EAST_MARKETS: Record<string, MarketProfile> = {
  // ----- Africa -----

  // Algeria: hydrocarbons and state paperwork; import curbs make cars scarce, fuel is subsidized.
  dz: {
    countryId: 'dz', currencyName: 'Algerian dinar', currencyCode: 'DZD',
    gdpPerCapita: 5_600, populationM: 46.8,
    corporateTax: 0.26, salesTax: 0.19, salesTaxName: 'TVA', minWage: 2_200,
    laborCost: 0.25, rentCost: 0.25, interestRate: 0.03, inflation: 0.05,
    easeOfBusiness: 49, corruption: 66, startupDays: 18, startupFee: 500,
    exchange: null,
    demand: {
      energy: 2.2, cafe: 1.6, bakery: 1.4, construction: 1.4, farm: 1.2,
      hotel: 0.6, software: 0.5, ecommerce: 0.5, bar: 0.4, gameStudio: 0.4,
    },
    banned: [],
    priceMult: { car: 1.8, electronics: 1.3, luxury: 1.4, alcohol: 0.7, food: 0.4, fuel: 0.4 },
    businessNote:
      'In Algeria the notary, the trade registry and the tax office each want their own stamp, and an import licence can take longer than the business plan it was for.',
    nameWords: ['Djazair', 'Atlas', 'Hoggar', 'Tassili', 'Numidia', 'Chelif', 'Sahara', 'Casbah', 'Oasis'],
  },

  // Angola: oil money, pricey Luanda offices, a wobbly kwanza and fuel subsidies being phased out.
  ao: {
    countryId: 'ao', currencyName: 'Angolan kwanza', currencyCode: 'AOA',
    gdpPerCapita: 2_300, populationM: 37.9,
    corporateTax: 0.25, salesTax: 0.14, salesTaxName: 'IVA', minWage: 1_100,
    laborCost: 0.18, rentCost: 0.4, interestRate: 0.19, inflation: 0.22,
    easeOfBusiness: 41, corruption: 68, startupDays: 36, startupFee: 600,
    exchange: null,
    demand: {
      energy: 2.5, construction: 1.3, logistics: 1.2, farm: 1.2, entertainment: 1.2,
      hotel: 0.7, software: 0.5, ecommerce: 0.5, gameStudio: 0.4,
      semiconductor: 0.3,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.3, luxury: 1.4, alcohol: 0.6, food: 0.7, fuel: 0.4 },
    businessNote:
      'Luanda can charge Paris prices for an office while the kwanza swings with every oil headline, so smart owners invoice fast and keep the generator fueled.',
    nameWords: ['Cuanza', 'Kalandula', 'Benguela', 'Namibe', 'Mussulo', 'Palanca', 'Kianda', 'Imbondeiro', 'Tundavala'],
  },

  // Djibouti: a port and logistics hub on the Ethiopia corridor; franc pegged to the dollar.
  dj: {
    countryId: 'dj', currencyName: 'Djiboutian franc', currencyCode: 'DJF',
    gdpPerCapita: 3_800, populationM: 1.2,
    corporateTax: 0.25, salesTax: 0.1, salesTaxName: 'TVA', minWage: 0,
    laborCost: 0.22, rentCost: 0.4, interestRate: 0.05, inflation: 0.02,
    easeOfBusiness: 60, corruption: 69, startupDays: 14, startupFee: 400,
    exchange: null,
    demand: {
      logistics: 2.5, hotel: 1.2, construction: 1.3, restaurant: 1.1,
      manufacturing: 0.5, software: 0.5, ecommerce: 0.4, gameStudio: 0.3, farm: 0.3,
      semiconductor: 0.3,
    },
    banned: [],
    priceMult: { car: 1.2, electronics: 1.2, luxury: 1.2, alcohol: 1.3, food: 0.8, fuel: 1.5 },
    businessNote:
      "Djibouti lives on its port, where most of Ethiopia's trade rolls past your door, along with summer afternoons hot enough to bake the invoices.",
    nameWords: ['Assal', 'Tadjoura', 'Goda', 'Moucha', 'Abbe', 'Ghoubet', 'Arta', 'Horn'],
  },

  // DR Congo: vast, young and mineral-rich; terrible roads, scarce power, informal "fees".
  cd: {
    countryId: 'cd', currencyName: 'Congolese franc', currencyCode: 'CDF',
    gdpPerCapita: 650, populationM: 109,
    corporateTax: 0.3, salesTax: 0.16, salesTaxName: 'TVA', minWage: 1_500,
    laborCost: 0.1, rentCost: 0.35, interestRate: 0.2, inflation: 0.12,
    easeOfBusiness: 36, corruption: 79, startupDays: 7, startupFee: 400,
    exchange: null,
    demand: {
      energy: 1.8, entertainment: 1.4, logistics: 1.4, farm: 1.3, construction: 1.3, clinic: 1.3,
      hotel: 0.6, software: 0.4, ecommerce: 0.4, gameStudio: 0.3,
    },
    banned: [],
    priceMult: { car: 1.3, electronics: 1.3, luxury: 1.3, alcohol: 0.6, food: 0.7, fuel: 1.45 },
    businessNote:
      'In the DRC you pay the official fees, the unofficial fees and a fee to find out which is which, but a country of 100 million needs everything if your trucks survive the roads.',
    nameWords: ['Kivu', 'Okapi', 'Lualaba', 'Kasai', 'Ubangi', 'Ituri', 'Mbote', 'Inga', 'Boyoma'],
  },

  // Egypt: tourism, megaprojects and a pound that keeps getting devalued; fuel still subsidized.
  eg: {
    countryId: 'eg', currencyName: 'Egyptian pound', currencyCode: 'EGP',
    gdpPerCapita: 3_400, populationM: 107,
    corporateTax: 0.225, salesTax: 0.14, salesTaxName: 'VAT', minWage: 1_700,
    laborCost: 0.18, rentCost: 0.2, interestRate: 0.22, inflation: 0.2,
    easeOfBusiness: 60, corruption: 70, startupDays: 12, startupFee: 600,
    exchange: { name: 'Egyptian Exchange', code: 'EGX', index: 'EGX 30', volatility: 0.32, drift: 0.1 },
    demand: {
      hotel: 2, construction: 1.6, cafe: 1.5, realEstate: 1.5, restaurant: 1.3,
      manufacturing: 1.2, farm: 1.2, gameStudio: 0.6, bar: 0.5, brewery: 0.4,
    },
    banned: [],
    priceMult: { car: 1.7, electronics: 1.35, luxury: 1.5, alcohol: 0.7, food: 0.35, fuel: 0.45 },
    businessNote:
      'Cairo can register your company in days, then spend a year deciding whether your shop sign needs a permit, so price everything in pencil because the pound keeps changing its mind.',
    nameWords: ['Nile', 'Pharaoh', 'Lotus', 'Giza', 'Sinai', 'Delta', 'Nefer', 'Horus', 'Papyrus', 'Misr'],
  },

  // Ethiopia: the home of coffee, fast growth, a newly floated birr and a ban on imported petrol cars.
  et: {
    countryId: 'et', currencyName: 'Ethiopian birr', currencyCode: 'ETB',
    gdpPerCapita: 1_100, populationM: 129,
    corporateTax: 0.3, salesTax: 0.15, salesTaxName: 'VAT', minWage: 0,
    laborCost: 0.1, rentCost: 0.25, interestRate: 0.15, inflation: 0.15,
    easeOfBusiness: 48, corruption: 63, startupDays: 32, startupFee: 400,
    exchange: null,
    demand: {
      cafe: 2, farm: 1.8, energy: 1.4, construction: 1.4, manufacturing: 1.3,
      logistics: 0.8, software: 0.5, ecommerce: 0.4, gameStudio: 0.3,
      semiconductor: 0.3,
    },
    banned: [],
    priceMult: { car: 2.5, electronics: 1.4, luxury: 1.4, alcohol: 0.35, food: 0.5 },
    businessNote:
      'Addis Ababa is building at full speed, the coffee is the original and the birr floats now, so imported anything gets pricier while you finish your macchiato.',
    nameWords: ['Abay', 'Simien', 'Axum', 'Sheba', 'Kaffa', 'Tana', 'Selam', 'Genet', 'Entoto'],
  },

  // Kenya: "Silicon Savannah", mobile money everywhere, safaris, tea and flowers.
  ke: {
    countryId: 'ke', currencyName: 'Kenyan shilling', currencyCode: 'KES',
    gdpPerCapita: 2_200, populationM: 56,
    corporateTax: 0.3, salesTax: 0.16, salesTaxName: 'VAT', minWage: 1_500,
    laborCost: 0.18, rentCost: 0.3, interestRate: 0.095, inflation: 0.045,
    easeOfBusiness: 73, corruption: 68, startupDays: 23, startupFee: 400,
    exchange: { name: 'Nairobi Securities Exchange', code: 'NSE', index: 'NSE 20 Share Index', volatility: 0.22, drift: 0.07 },
    demand: {
      software: 1.5, hotel: 1.5, farm: 1.5, ecommerce: 1.4, logistics: 1.3,
      energy: 1.2, gameStudio: 0.7,
      aiLab: 0.7, cybersecurity: 0.8, spaceTech: 0.4,
    },
    banned: [],
    priceMult: { car: 1.5, electronics: 1.2, luxury: 1.25, alcohol: 0.6, food: 0.55, fuel: 1.6 },
    businessNote:
      'Kenyan customers pay by phone in three seconds, while the county business permit still takes a queue, two forms and an official who has stepped out for lunch.',
    nameWords: ['Simba', 'Jambo', 'Tsavo', 'Mara', 'Rift', 'Baobab', 'Pwani', 'Nyota', 'Kilima'],
  },

  // Morocco: tourism, Tangier's car plants and port, café culture, heavily taxed alcohol.
  ma: {
    countryId: 'ma', currencyName: 'Moroccan dirham', currencyCode: 'MAD',
    gdpPerCapita: 4_000, populationM: 37.5,
    corporateTax: 0.2, salesTax: 0.2, salesTaxName: 'TVA', minWage: 4_100,
    laborCost: 0.22, rentCost: 0.3, interestRate: 0.0225, inflation: 0.02,
    easeOfBusiness: 73, corruption: 63, startupDays: 9, startupFee: 300,
    exchange: { name: 'Casablanca Stock Exchange', code: 'BVC', index: 'MASI', volatility: 0.15, drift: 0.07 },
    demand: {
      hotel: 1.9, cafe: 1.5, manufacturing: 1.5, logistics: 1.4, restaurant: 1.3,
      construction: 1.3, farm: 1.3, bar: 0.6, brewery: 0.5,
      electricVehicles: 1.1,
    },
    banned: [],
    priceMult: { car: 1.2, electronics: 1.15, luxury: 1.2, alcohol: 1.1, food: 0.45, fuel: 1.65 },
    businessNote:
      "Morocco's paperwork is reasonable and the tourists are plentiful, but every deal comes with mint tea and a negotiation that outlasts the tea.",
    nameWords: ['Atlas', 'Riad', 'Argan', 'Medina', 'Zellige', 'Rif', 'Souk', 'Maghreb', 'Sebou'],
  },

  // Nigeria: Africa's biggest market, Nollywood and Afrobeats, oil, and DIY electricity.
  ng: {
    countryId: 'ng', currencyName: 'Nigerian naira', currencyCode: 'NGN',
    gdpPerCapita: 1_000, populationM: 230,
    corporateTax: 0.3, salesTax: 0.075, salesTaxName: 'VAT', minWage: 550,
    laborCost: 0.15, rentCost: 0.35, interestRate: 0.27, inflation: 0.25,
    easeOfBusiness: 57, corruption: 74, startupDays: 10, startupFee: 350,
    exchange: { name: 'Nigerian Exchange', code: 'NGX', index: 'NGX All-Share Index', volatility: 0.35, drift: 0.1 },
    demand: {
      energy: 2.2, entertainment: 2, fashion: 1.5, beauty: 1.4, software: 1.4,
      ecommerce: 1.4, farm: 1.3, construction: 1.3, hotel: 0.8,
      aiLab: 0.7,
    },
    banned: [],
    priceMult: { car: 1.6, electronics: 1.25, luxury: 1.4, alcohol: 0.5, food: 0.5, fuel: 0.7 },
    businessNote:
      "Lagos rewards hustle: the market is enormous, the traffic is legendary and every business is secretly an energy company, because you'll be running your own generator.",
    nameWords: ['Naija', 'Eko', 'Zuma', 'Niger', 'Benue', 'Olumo', 'Obudu', 'Jollof', 'Unity'],
  },

  // South Africa: the continent's deepest stock market, wine and craft beer, and backup power.
  za: {
    countryId: 'za', currencyName: 'South African rand', currencyCode: 'ZAR',
    gdpPerCapita: 6_300, populationM: 63,
    corporateTax: 0.27, salesTax: 0.15, salesTaxName: 'VAT', minWage: 3_700,
    laborCost: 0.32, rentCost: 0.3, interestRate: 0.07, inflation: 0.035,
    easeOfBusiness: 67, corruption: 59, startupDays: 30, startupFee: 250,
    exchange: { name: 'Johannesburg Stock Exchange', code: 'JSE', index: 'JSE All Share Index', volatility: 0.2, drift: 0.09 },
    demand: {
      energy: 1.7, hotel: 1.4, brewery: 1.4, farm: 1.3, autoShop: 1.3,
      bar: 1.2, manufacturing: 1.2,
      spaceTech: 0.8, biotech: 0.8, aiLab: 0.8,
    },
    banned: [],
    priceMult: { car: 1.15, electronics: 1.15, luxury: 1.2, alcohol: 0.6, food: 0.5, fuel: 1.35 },
    businessNote:
      'South Africa has world-class banks, fierce competition and a power grid with a schedule, so every business plan needs a chapter on inverters.',
    nameWords: ['Protea', 'Ubuntu', 'Karoo', 'Drakensberg', 'Limpopo', 'Highveld', 'Mzansi', 'Lekker', 'Kalahari'],
  },

  // Tunisia: beach tourism, olive oil, offshore factories working for Europe.
  tn: {
    countryId: 'tn', currencyName: 'Tunisian dinar', currencyCode: 'TND',
    gdpPerCapita: 4_300, populationM: 12.3,
    corporateTax: 0.15, salesTax: 0.19, salesTaxName: 'TVA', minWage: 2_000,
    laborCost: 0.2, rentCost: 0.2, interestRate: 0.075, inflation: 0.06,
    easeOfBusiness: 69, corruption: 61, startupDays: 9, startupFee: 300,
    exchange: { name: 'Tunis Stock Exchange', code: 'BVMT', index: 'TUNINDEX', volatility: 0.14, drift: 0.06 },
    demand: {
      hotel: 1.8, cafe: 1.6, farm: 1.3, manufacturing: 1.3, bakery: 1.3,
      software: 1.2, bar: 0.7, brewery: 0.6, gameStudio: 0.6,
      aiLab: 0.7,
    },
    banned: [],
    priceMult: { car: 1.6, electronics: 1.4, luxury: 1.4, alcohol: 0.8, food: 0.4 },
    businessNote:
      'Tunisian paperwork comes in Arabic, French and patience, but the coast fills with tourists every summer and the olive oil practically sells itself.',
    nameWords: ['Carthage', 'Jasmine', 'Djerba', 'Medjerda', 'Sahel', 'Dougga', 'Ifriqiya', 'Hannibal'],
  },

  // Uganda: coffee and bananas, gorilla tourism, oil fields coming online; no working minimum wage.
  ug: {
    countryId: 'ug', currencyName: 'Ugandan shilling', currencyCode: 'UGX',
    gdpPerCapita: 1_100, populationM: 47,
    corporateTax: 0.3, salesTax: 0.18, salesTaxName: 'VAT', minWage: 0,
    laborCost: 0.11, rentCost: 0.25, interestRate: 0.0975, inflation: 0.035,
    easeOfBusiness: 60, corruption: 75, startupDays: 24, startupFee: 350,
    exchange: { name: 'Uganda Securities Exchange', code: 'USE', index: 'USE All Share Index', volatility: 0.25, drift: 0.06 },
    demand: {
      farm: 2, energy: 1.4, hotel: 1.2, construction: 1.2, logistics: 1.1,
      software: 0.5, ecommerce: 0.5, gameStudio: 0.3,
      semiconductor: 0.3, quantum: 0.3,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.25, luxury: 1.3, alcohol: 0.5, food: 0.45, fuel: 1.6 },
    businessNote:
      'Kampala is young, hungry and always on the move, mostly by boda boda, and the registry is online now, though someone will still ask you to bring the papers in person.',
    nameWords: ['Pearl', 'Nile', 'Rwenzori', 'Elgon', 'Kazinga', 'Bwindi', 'Murchison', 'Matoke'],
  },

  // Zimbabwe: dollarized in practice, ZiG on paper; tobacco, Victoria Falls, frequent power cuts.
  zw: {
    countryId: 'zw', currencyName: 'Zimbabwe Gold (ZiG)', currencyCode: 'ZWG',
    gdpPerCapita: 2_300, populationM: 16.6,
    corporateTax: 0.25, salesTax: 0.155, salesTaxName: 'VAT', minWage: 0,
    laborCost: 0.14, rentCost: 0.25, interestRate: 0.35, inflation: 0.5,
    easeOfBusiness: 55, corruption: 79, startupDays: 27, startupFee: 600,
    exchange: { name: 'Zimbabwe Stock Exchange', code: 'ZSE', index: 'ZSE All Share Index', volatility: 0.55, drift: 0.12 },
    demand: {
      farm: 1.6, energy: 1.4, hotel: 1.3, grocery: 1.3, logistics: 1.2,
      manufacturing: 0.6, software: 0.5, ecommerce: 0.5, gameStudio: 0.3,
      semiconductor: 0.3,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.3, luxury: 1.3, alcohol: 0.6, food: 0.75, fuel: 1.75 },
    businessNote:
      'Zimbabwe runs on US dollars, ZiG and whatever the till has change for, so smart owners price in dollars because the local currency keeps reinventing itself.',
    nameWords: ['Zambezi', 'Mosi', 'Kariba', 'Matopos', 'Nyanga', 'Msasa', 'Hwange', 'Chimanimani', 'Shumba'],
  },

  // ----- Middle East -----

  // Georgia: one-day registration, profit taxed only when distributed, tourism and wine.
  ge: {
    countryId: 'ge', currencyName: 'Georgian lari', currencyCode: 'GEL',
    gdpPerCapita: 9_100, populationM: 3.7,
    corporateTax: 0.15, salesTax: 0.18, salesTaxName: 'VAT', minWage: 90,
    laborCost: 0.3, rentCost: 0.3, interestRate: 0.08, inflation: 0.03,
    easeOfBusiness: 84, corruption: 47, startupDays: 1, startupFee: 100,
    exchange: null,
    demand: {
      hotel: 1.9, restaurant: 1.5, realEstate: 1.4, construction: 1.4, farm: 1.3,
      bar: 1.3, software: 1.2, logistics: 1.2,
      aiLab: 0.6, cybersecurity: 0.7,
    },
    banned: [],
    priceMult: { car: 0.85, electronics: 1.1, luxury: 1.1, alcohol: 0.5, food: 0.5, fuel: 1.3 },
    businessNote:
      'Georgia registers a company in a day and only taxes profit when you pay it out, and the legal minimum wage of 20 lari a month has not moved since 1999.',
    nameWords: ['Iveria', 'Colchis', 'Kazbegi', 'Rioni', 'Svaneti', 'Tamar', 'Saperavi', 'Mtkvari', 'Kartli'],
  },

  // Iran: sanctions, a sliding rial, nearly free petrol, and alcohol banned outright.
  ir: {
    countryId: 'ir', currencyName: 'Iranian rial', currencyCode: 'IRR',
    gdpPerCapita: 4_600, populationM: 90,
    corporateTax: 0.25, salesTax: 0.1, salesTaxName: 'VAT', minWage: 1_500,
    laborCost: 0.21, rentCost: 0.25, interestRate: 0.23, inflation: 0.4,
    easeOfBusiness: 58, corruption: 77, startupDays: 60, startupFee: 300,
    exchange: { name: 'Tehran Stock Exchange', code: 'TSE', index: 'TEDPIX', volatility: 0.45, drift: 0.12 },
    demand: {
      energy: 2, autoShop: 1.5, manufacturing: 1.4, ecommerce: 1.3, cafe: 1.3,
      software: 1.2, construction: 1.2, hotel: 0.5,
      spaceTech: 0.8, semiconductor: 0.5,
    },
    banned: ['bar', 'brewery'],
    priceMult: { car: 2.5, electronics: 1.8, luxury: 1.7, alcohol: 3.5, food: 0.35, fuel: 0.04 },
    businessNote:
      'Bars and breweries are off the table, sanctions keep foreign brands out and local ones busy, and every office has someone whose real job is fixing the VPN.',
    nameWords: ['Alborz', 'Zagros', 'Damavand', 'Simorgh', 'Golestan', 'Caspian', 'Kavir', 'Pars', 'Sepehr'],
  },

  // Iraq: oil pays for almost everything, a huge public payroll, pilgrim hotels in Najaf and Karbala.
  iq: {
    countryId: 'iq', currencyName: 'Iraqi dinar', currencyCode: 'IQD',
    gdpPerCapita: 5_600, populationM: 46,
    corporateTax: 0.15, salesTax: 0, salesTaxName: 'Sales tax', minWage: 3_200,
    laborCost: 0.24, rentCost: 0.35, interestRate: 0.055, inflation: 0.035,
    easeOfBusiness: 45, corruption: 74, startupDays: 26, startupFee: 1_500,
    exchange: { name: 'Iraq Stock Exchange', code: 'ISX', index: 'ISX 60', volatility: 0.32, drift: 0.06 },
    demand: {
      energy: 2.6, construction: 1.6, hotel: 1.3, autoShop: 1.3, farm: 0.8,
      manufacturing: 0.6, software: 0.5, gameStudio: 0.4, bar: 0.4, brewery: 0.3,
    },
    banned: [],
    priceMult: { electronics: 1.1, luxury: 1.15, alcohol: 1.2, food: 0.55, fuel: 0.75 },
    businessNote:
      "Oil money keeps Iraq's cash flowing and its public payroll enormous, but a single permit can need stamps from three ministries and a great deal of tea.",
    nameWords: ['Tigris', 'Euphrates', 'Babylon', 'Sumer', 'Akkad', 'Ashur', 'Dijla', 'Furat', 'Ur'],
  },

  // Israel: the "Startup Nation", high prices, an 83% purchase tax on cars, VAT up to 18% in 2025.
  il: {
    countryId: 'il', currencyName: 'Israeli new shekel', currencyCode: 'ILS',
    gdpPerCapita: 54_000, populationM: 10,
    corporateTax: 0.23, salesTax: 0.18, salesTaxName: 'VAT', minWage: 20_800,
    laborCost: 0.95, rentCost: 1.1, interestRate: 0.045, inflation: 0.03,
    easeOfBusiness: 77, corruption: 36, startupDays: 12, startupFee: 1_500,
    exchange: { name: 'Tel Aviv Stock Exchange', code: 'TASE', index: 'TA-35', volatility: 0.18, drift: 0.08 },
    demand: {
      software: 2.5, gameStudio: 1.5, ecommerce: 1.4, realEstate: 1.4, marketing: 1.3,
      cafe: 1.3, construction: 1.3, clinic: 1.2, farm: 0.8,
      cybersecurity: 2.8,
    },
    banned: [],
    priceMult: { car: 1.5, electronics: 1.25, luxury: 1.2, alcohol: 1.2, food: 1.3, fuel: 2.3 },
    businessNote:
      'Israel has more startups per person than almost anywhere, so everyone at the café is pitching and every pitch already has an exit strategy.',
    nameWords: ['Carmel', 'Negev', 'Galil', 'Kinneret', 'Arava', 'Hermon', 'Shaked', 'Ofek', 'Tamar'],
  },

  // Jordan: Petra and the Dead Sea, a medical-tourism hub, dinar pegged to the dollar.
  jo: {
    countryId: 'jo', currencyName: 'Jordanian dinar', currencyCode: 'JOD',
    gdpPerCapita: 4_600, populationM: 11.5,
    corporateTax: 0.2, salesTax: 0.16, salesTaxName: 'General sales tax', minWage: 4_900,
    laborCost: 0.27, rentCost: 0.3, interestRate: 0.065, inflation: 0.02,
    easeOfBusiness: 69, corruption: 51, startupDays: 13, startupFee: 900,
    exchange: { name: 'Amman Stock Exchange', code: 'ASE', index: 'ASE General Index', volatility: 0.14, drift: 0.05 },
    demand: {
      clinic: 1.5, hotel: 1.4, restaurant: 1.2, software: 1.2, logistics: 1.1,
      bar: 0.6, brewery: 0.6, energy: 0.6, farm: 0.6,
      cybersecurity: 0.9,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.3, luxury: 1.25, alcohol: 1.3, food: 0.65, fuel: 1.5 },
    businessNote:
      'Amman is a calm business hub in a busy neighborhood, with a dinar pegged to the dollar, low inflation and a 16% general sales tax on very nearly everything.',
    nameWords: ['Petra', 'Nabatea', 'Aqaba', 'Jerash', 'Moab', 'Wadi Rum', 'Ajloun', 'Mujib'],
  },

  // Kuwait: oil wealth, no VAT, levies instead of income tax for Kuwaiti owners, alcohol banned.
  kw: {
    countryId: 'kw', currencyName: 'Kuwaiti dinar', currencyCode: 'KWD',
    gdpPerCapita: 32_000, populationM: 4.9,
    corporateTax: 0.02, salesTax: 0, salesTaxName: 'VAT', minWage: 2_900,
    laborCost: 0.75, rentCost: 0.7, interestRate: 0.04, inflation: 0.03,
    easeOfBusiness: 67, corruption: 54, startupDays: 17, startupFee: 1_000,
    exchange: { name: 'Boursa Kuwait', code: 'BK', index: 'Premier Market Index', volatility: 0.16, drift: 0.06 },
    demand: {
      energy: 2.5, cafe: 1.6, restaurant: 1.4, beauty: 1.4, autoShop: 1.4,
      fashion: 1.3, realEstate: 1.3, hotel: 0.7, manufacturing: 0.6, farm: 0.3,
    },
    banned: ['bar', 'brewery'],
    priceMult: { car: 0.9, electronics: 0.95, luxury: 0.95, alcohol: 4, food: 0.8, fuel: 0.33 },
    businessNote:
      "Alcohol is banned outright, Kuwaiti-owned firms pay small levies instead of income tax, and the world's priciest currency buys a commercial licence that still collects signatures like a petition.",
    nameWords: ['Failaka', 'Dhow', 'Pearl', 'Kout', 'Sadu', 'Najma', 'Mubarakiya', 'Wafra', 'Jahra'],
  },

  // Lebanon: banking collapse, cash dollars, private generators, a famous food and nightlife scene.
  lb: {
    countryId: 'lb', currencyName: 'Lebanese pound', currencyCode: 'LBP',
    gdpPerCapita: 3_800, populationM: 5.8,
    corporateTax: 0.17, salesTax: 0.11, salesTaxName: 'VAT', minWage: 3_700,
    laborCost: 0.2, rentCost: 0.3, interestRate: 0.2, inflation: 0.3,
    easeOfBusiness: 54, corruption: 78, startupDays: 15, startupFee: 2_500,
    exchange: { name: 'Beirut Stock Exchange', code: 'BSE', index: 'BLOM Stock Index', volatility: 0.4, drift: 0.03 },
    demand: {
      restaurant: 1.6, energy: 1.6, bar: 1.5, beauty: 1.4, fashion: 1.4,
      clinic: 1.2, ecommerce: 0.8, construction: 0.6, realEstate: 0.6,
      biotech: 0.7,
    },
    banned: [],
    priceMult: { car: 1.2, electronics: 1.1, luxury: 1.15, alcohol: 0.9, food: 0.75, fuel: 1.1 },
    businessNote:
      "Lebanon's banks froze everyone's savings, so business runs on fresh dollars, private generators and an unshakeable belief that next season will be the comeback.",
    nameWords: ['Cedar', 'Phoenicia', 'Byblos', 'Litani', 'Bekaa', 'Qadisha', 'Sannine', 'Baalbek', 'Tyre'],
  },

  // Qatar: LNG riches, no VAT, no income tax on Qatari-owned firms, alcohol only via licensed hotels.
  qa: {
    countryId: 'qa', currencyName: 'Qatari riyal', currencyCode: 'QAR',
    gdpPerCapita: 76_000, populationM: 3.1,
    corporateTax: 0, salesTax: 0, salesTaxName: 'VAT', minWage: 5_900,
    laborCost: 0.85, rentCost: 0.8, interestRate: 0.045, inflation: 0.02,
    easeOfBusiness: 69, corruption: 41, startupDays: 9, startupFee: 3_500,
    exchange: { name: 'Qatar Stock Exchange', code: 'QSE', index: 'QE Index', volatility: 0.17, drift: 0.06 },
    demand: {
      energy: 2.6, construction: 1.4, hotel: 1.3, restaurant: 1.3, realEstate: 1.3,
      cafe: 1.3, logistics: 1.2, manufacturing: 0.6, farm: 0.3,
      aiLab: 1.2,
    },
    banned: ['bar', 'brewery'],
    priceMult: { car: 0.9, electronics: 0.95, luxury: 0.95, alcohol: 2.5, food: 0.9, fuel: 0.65 },
    businessNote:
      'Qatari-owned firms pay no income tax and nobody pays VAT, but alcohol stays inside licensed hotels and a single state importer, and the air-conditioning bill runs ten months a year.',
    nameWords: ['Pearl', 'Dhow', 'Zubarah', 'Al Bidda', 'Majlis', 'Corniche', 'Lusail', 'Falcon', 'Dana'],
  },

  // Saudi Arabia: Vision 2030 giga-projects, entertainment opening up, zakat for Saudi owners.
  sa: {
    countryId: 'sa', currencyName: 'Saudi riyal', currencyCode: 'SAR',
    gdpPerCapita: 34_000, populationM: 35,
    corporateTax: 0.025, salesTax: 0.15, salesTaxName: 'VAT', minWage: 0,
    laborCost: 0.62, rentCost: 0.65, interestRate: 0.05, inflation: 0.02,
    easeOfBusiness: 72, corruption: 41, startupDays: 3, startupFee: 1_500,
    exchange: { name: 'Saudi Exchange (Tadawul)', code: 'TADAWUL', index: 'TASI', volatility: 0.2, drift: 0.07 },
    demand: {
      energy: 2.6, construction: 1.8, entertainment: 1.6, cafe: 1.5, hotel: 1.4,
      gym: 1.3, restaurant: 1.3, realEstate: 1.3, gameStudio: 1.2, farm: 0.4,
    },
    banned: ['bar', 'brewery'],
    priceMult: { alcohol: 4, food: 0.7, fuel: 0.73 },
    businessNote:
      'Vision 2030 brought cinemas, concerts and giga-projects but not bars, Saudi-owned firms pay 2.5% zakat instead of income tax, and Nitaqat quotas color-code your hiring plan.',
    nameWords: ['Najd', 'Hijaz', 'Tuwaiq', 'Asir', 'Nafud', 'Sarawat', 'Rimal', 'Wadi', 'Falcon'],
  },

  // Syria: rebuilding after the war; a volatile pound, power cuts, a tiny reopened exchange.
  sy: {
    countryId: 'sy', currencyName: 'Syrian pound', currencyCode: 'SYP',
    gdpPerCapita: 900, populationM: 24,
    corporateTax: 0.25, salesTax: 0.05, salesTaxName: 'Consumption tax', minWage: 800,
    laborCost: 0.11, rentCost: 0.12, interestRate: 0.1, inflation: 0.5,
    easeOfBusiness: 42, corruption: 88, startupDays: 20, startupFee: 500,
    exchange: { name: 'Damascus Securities Exchange', code: 'DSE', index: 'DWX', volatility: 0.55, drift: 0.06 },
    demand: {
      construction: 1.8, bakery: 1.4, energy: 1.4, farm: 1.2, logistics: 0.7,
      manufacturing: 0.7, hotel: 0.4, software: 0.4, ecommerce: 0.3, gameStudio: 0.3,
    },
    banned: [],
    priceMult: { car: 2, electronics: 1.5, luxury: 1.5, alcohol: 0.6, food: 0.4, fuel: 1.2 },
    businessNote:
      'Syria is rebuilding after years of war, so every wall needs a contractor, the pound changes value between breakfast and lunch, and the power cuts keep a better schedule than the suppliers.',
    nameWords: ['Jasmine', 'Orontes', 'Barada', 'Ugarit', 'Qasioun', 'Levant', 'Sham', 'Ebla'],
  },

  // Turkey: tourism, textiles and factories, a mobile-games hub, steep car and phone taxes.
  tr: {
    countryId: 'tr', currencyName: 'Turkish lira', currencyCode: 'TRY',
    gdpPerCapita: 15_500, populationM: 86,
    corporateTax: 0.25, salesTax: 0.2, salesTaxName: 'KDV', minWage: 8_000,
    laborCost: 0.4, rentCost: 0.4, interestRate: 0.4, inflation: 0.4,
    easeOfBusiness: 77, corruption: 66, startupDays: 7, startupFee: 1_000,
    exchange: { name: 'Borsa Istanbul', code: 'BIST', index: 'BIST 100', volatility: 0.4, drift: 0.12 },
    demand: {
      hotel: 1.8, manufacturing: 1.5, gameStudio: 1.5, fashion: 1.4, construction: 1.4,
      cafe: 1.4, logistics: 1.3, bakery: 1.3, realEstate: 1.3,
      electricVehicles: 1.3,
    },
    banned: [],
    priceMult: { car: 1.9, electronics: 1.8, luxury: 1.3, alcohol: 1.2, food: 0.55, fuel: 1.45 },
    businessNote:
      'Turkey offers a huge market, booming tourism and inflation so brisk that restaurants reprint their menus more often than they wipe the tables.',
    nameWords: ['Anadolu', 'Boğaziçi', 'Ege', 'Toros', 'Kapadokya', 'Lale', 'Marmara', 'Karadeniz', 'Kartal'],
  },

  // United Arab Emirates: Dubai's trade, tourism and property; 9% corporate tax, 5% VAT.
  ae: {
    countryId: 'ae', currencyName: 'UAE dirham', currencyCode: 'AED',
    gdpPerCapita: 50_000, populationM: 10.7,
    corporateTax: 0.09, salesTax: 0.05, salesTaxName: 'VAT', minWage: 0,
    laborCost: 0.8, rentCost: 1, interestRate: 0.045, inflation: 0.02,
    easeOfBusiness: 81, corruption: 32, startupDays: 4, startupFee: 5_000,
    exchange: { name: 'Dubai Financial Market', code: 'DFM', index: 'DFM General Index', volatility: 0.22, drift: 0.08 },
    demand: {
      hotel: 1.8, realEstate: 1.8, energy: 1.8, logistics: 1.6, construction: 1.5,
      restaurant: 1.4, fashion: 1.3, beauty: 1.3, ecommerce: 1.3, farm: 0.3,
    },
    banned: [],
    priceMult: { car: 0.9, electronics: 0.95, luxury: 0.9, alcohol: 1.6, food: 0.85, fuel: 0.83 },
    businessNote:
      'Dubai can license your company in a day and there is no personal income tax, but a trade licence costs more than some cars and your office rent is priced by the view.',
    nameWords: ['Falcon', 'Creek', 'Dune', 'Liwa', 'Ghaf', 'Hajar', 'Hatta', 'Majlis', 'Marina', 'Dhow'],
  },
}
