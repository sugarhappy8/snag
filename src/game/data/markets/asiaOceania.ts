// Market profiles for Asia and Oceania (see data/markets.ts for field meanings).
//
// Rounded mid-2020s figures: headline corporate tax, consumption tax, the statutory minimum wage
// as a full-time year in dollars, central bank policy rate, recent inflation, a Doing Business
// style ease score, 100 minus the Transparency International CPI score, and real exchanges.
// laborCost stays within about ±35% of world.ts `wealth`, since salaries are US pay x wealth.
import type { MarketProfile } from '../markets'

export const ASIA_OCEANIA_MARKETS: Record<string, MarketProfile> = {
  // ----- Asia -----

  // Afghanistan: alcohol and beauty salons banned; no exchange, banks run on Islamic finance
  // (no policy rate, so interestRate is a typical financing profit rate).
  af: {
    countryId: 'af', currencyName: 'Afghan afghani', currencyCode: 'AFN',
    gdpPerCapita: 410, populationM: 42,
    corporateTax: 0.2, salesTax: 0.1, salesTaxName: 'Business receipts tax', minWage: 0,
    laborCost: 0.09, rentCost: 0.1, interestRate: 0.08, inflation: 0.02,
    easeOfBusiness: 30, corruption: 83, startupDays: 10, startupFee: 200,
    exchange: null,
    demand: {
      farm: 1.8, bakery: 1.4, grocery: 1.3, logistics: 1.2, beauty: 0.5,
      ecommerce: 0.5, hotel: 0.4, software: 0.4, gameStudio: 0.3, entertainment: 0.3,
      semiconductor: 0.3, aiLab: 0.3, robotics: 0.3, biotech: 0.3, spaceTech: 0.3, electricVehicles: 0.3, quantum: 0.3, cybersecurity: 0.3,
    },
    banned: ['bar', 'brewery', 'salon'],
    priceMult: { electronics: 1.2, luxury: 1.5, alcohol: 3, food: 0.35, fuel: 1.1 },
    businessNote:
      'Alcohol is illegal, beauty salons were ordered shut in 2023 and new rules can arrive by decree overnight, so keep your paperwork tidy and your plans flexible.',
    nameWords: ['Kabul', 'Hindu Kush', 'Amu Darya', 'Herat', 'Lapis', 'Pamir', 'Bamyan', 'Saffron', 'Panjshir'],
  },

  // Bangladesh: the world's #2 garment exporter; car import duties are brutal.
  bd: {
    countryId: 'bd', currencyName: 'Bangladeshi taka', currencyCode: 'BDT',
    gdpPerCapita: 2_600, populationM: 173,
    corporateTax: 0.275, salesTax: 0.15, salesTaxName: 'VAT', minWage: 1_250,
    laborCost: 0.14, rentCost: 0.25, interestRate: 0.1, inflation: 0.09,
    easeOfBusiness: 45, corruption: 77, startupDays: 20, startupFee: 300,
    exchange: { name: 'Dhaka Stock Exchange', code: 'DSE', index: 'DSEX', volatility: 0.25, drift: 0.06 },
    demand: {
      manufacturing: 1.8, fashion: 1.5, farm: 1.4, logistics: 1.3, construction: 1.3,
      hotel: 0.7, gameStudio: 0.4, bar: 0.3, brewery: 0.3,
      semiconductor: 0.5, aiLab: 0.6, robotics: 0.5, biotech: 0.6, spaceTech: 0.3, electricVehicles: 0.5, quantum: 0.3, cybersecurity: 0.6,
    },
    banned: [],
    priceMult: { car: 2.2, electronics: 1.3, luxury: 1.4, alcohol: 2, food: 0.35, fuel: 1.15 },
    businessNote:
      'Every container out of Chittagong seems to be full of T-shirts, and every trade licence out of Dhaka seems to need one more signature and three more hours in traffic.',
    nameWords: ['Padma', 'Meghna', 'Sundarban', 'Bengal', 'Hilsa', 'Shapla', 'Shonar', 'Karnaphuli', 'Dhaka'],
  },

  // China: the world's factory and biggest e-commerce market; property slump, near-zero inflation.
  cn: {
    countryId: 'cn', currencyName: 'Chinese yuan', currencyCode: 'CNY',
    gdpPerCapita: 13_300, populationM: 1_409,
    corporateTax: 0.25, salesTax: 0.13, salesTaxName: 'VAT', minWage: 3_700,
    laborCost: 0.32, rentCost: 0.5, interestRate: 0.015, inflation: 0.005,
    easeOfBusiness: 78, corruption: 57, startupDays: 9, startupFee: 250,
    exchange: { name: 'Shanghai Stock Exchange', code: 'SSE', index: 'SSE Composite', volatility: 0.24, drift: 0.05 },
    demand: {
      manufacturing: 2, ecommerce: 1.8, logistics: 1.6, software: 1.4, energy: 1.3,
      gameStudio: 1.3, cafe: 1.2, construction: 0.8, realEstate: 0.6,
      semiconductor: 1.8, aiLab: 1.9, robotics: 2, biotech: 1.4, spaceTech: 1.7, electricVehicles: 2.6, quantum: 1.4, cybersecurity: 1,
    },
    banned: [],
    priceMult: { car: 0.85, luxury: 1.25, alcohol: 0.6, food: 0.6, fuel: 1.2 },
    businessNote:
      'Your company chop matters more than your signature, and by the time your idea launches, three rivals in Hangzhou have shipped it with free delivery.',
    nameWords: ['Huaxia', 'Jade', 'Taishan', 'Yangtze', 'Silk Road', 'Fenghuang', 'Xinghe', 'Ruyi', 'Panda', 'Jinxiu'],
  },

  // Hong Kong: low profits tax, no sales tax, some of the priciest rents on Earth.
  hk: {
    countryId: 'hk', currencyName: 'Hong Kong dollar', currencyCode: 'HKD',
    gdpPerCapita: 53_000, populationM: 7.5,
    corporateTax: 0.165, salesTax: 0, salesTaxName: 'Sales tax', minWage: 11_200,
    laborCost: 0.85, rentCost: 2.5, interestRate: 0.045, inflation: 0.02,
    easeOfBusiness: 85, corruption: 26, startupDays: 2, startupFee: 500,
    exchange: { name: 'Hong Kong Stock Exchange', code: 'HKEX', index: 'Hang Seng Index', volatility: 0.24, drift: 0.05 },
    demand: {
      logistics: 1.5, restaurant: 1.4, fashion: 1.3, beauty: 1.3, marketing: 1.2,
      hotel: 1.2, manufacturing: 0.5, energy: 0.5, farm: 0.3,
      aiLab: 1.2, biotech: 1.3, cybersecurity: 1.1, quantum: 0.8, semiconductor: 0.7, robotics: 0.9, spaceTech: 0.4, electricVehicles: 0.8,
    },
    banned: [],
    priceMult: { car: 1.6, electronics: 0.95, luxury: 0.9, alcohol: 0.9, food: 1.15, fuel: 3.5 },
    businessNote:
      "Profits tax is low and there's no sales tax at all, which is how landlords justify charging a small country's GDP for a shop the size of a parking space.",
    nameWords: ['Victoria', 'Harbour', 'Kowloon', 'Pearl', 'Lantau', 'Bauhinia', 'Lion Rock', 'Fragrant', 'Peak'],
  },

  // India: IT services giant, Bollywood and cricket; GST since 2017, steep duties on imported cars.
  in: {
    countryId: 'in', currencyName: 'Indian rupee', currencyCode: 'INR',
    gdpPerCapita: 2_700, populationM: 1_450,
    corporateTax: 0.25, salesTax: 0.18, salesTaxName: 'GST', minWage: 1_500,
    laborCost: 0.18, rentCost: 0.3, interestRate: 0.055, inflation: 0.04,
    easeOfBusiness: 71, corruption: 62, startupDays: 12, startupFee: 250,
    exchange: { name: 'Bombay Stock Exchange', code: 'BSE', index: 'BSE Sensex', volatility: 0.18, drift: 0.11 },
    demand: {
      software: 1.8, ecommerce: 1.5, construction: 1.5, farm: 1.5, entertainment: 1.4,
      logistics: 1.3, clinic: 1.3, cafe: 0.8, bar: 0.7, brewery: 0.6,
      spaceTech: 1.5, aiLab: 1.2, cybersecurity: 1.3, semiconductor: 0.9, biotech: 1.1, electricVehicles: 1.1, robotics: 0.7, quantum: 0.6,
    },
    banned: [],
    priceMult: { car: 1.5, electronics: 1.2, luxury: 1.35, food: 0.3, fuel: 1.35 },
    businessNote:
      'Registration is online now, but the GST portal, the municipal trade licence and the fire NOC each still want their own visit, their own stamp and photocopies in triplicate.',
    nameWords: ['Ganga', 'Kaveri', 'Shakti', 'Sagar', 'Indus', 'Deccan', 'Surya', 'Ashoka', 'Kesari', 'Narmada'],
  },

  // Indonesia: 17,000 islands, Bali tourism, coal and nickel; VAT (PPN) is 11% on everyday goods.
  id: {
    countryId: 'id', currencyName: 'Indonesian rupiah', currencyCode: 'IDR',
    gdpPerCapita: 4_900, populationM: 282,
    corporateTax: 0.22, salesTax: 0.11, salesTaxName: 'VAT (PPN)', minWage: 3_000,
    laborCost: 0.2, rentCost: 0.35, interestRate: 0.05, inflation: 0.02,
    easeOfBusiness: 70, corruption: 63, startupDays: 10, startupFee: 600,
    exchange: { name: 'Indonesia Stock Exchange', code: 'IDX', index: 'IDX Composite', volatility: 0.2, drift: 0.08 },
    demand: {
      hotel: 1.5, cafe: 1.4, ecommerce: 1.4, farm: 1.4, energy: 1.4,
      logistics: 1.3, manufacturing: 1.2, bar: 0.5, brewery: 0.4,
      electricVehicles: 1.1, aiLab: 0.7, biotech: 0.6, robotics: 0.5, cybersecurity: 0.7, semiconductor: 0.4, spaceTech: 0.4, quantum: 0.3,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.25, luxury: 1.3, alcohol: 1.6, food: 0.45, fuel: 0.7 },
    businessNote:
      'The OSS portal hands you a business ID in a day; the notary, the regional permits and the Jakarta traffic between them handle the rest of the month.',
    nameWords: ['Nusantara', 'Merapi', 'Rinjani', 'Toba', 'Komodo', 'Melati', 'Jaya', 'Sejahtera', 'Mahakam', 'Bali'],
  },

  // Japan: games, anime and a tourism boom; weak yen makes gadgets and luxury cheap for visitors.
  jp: {
    countryId: 'jp', currencyName: 'Japanese yen', currencyCode: 'JPY',
    gdpPerCapita: 32_500, populationM: 124,
    corporateTax: 0.3, salesTax: 0.1, salesTaxName: 'Consumption tax', minWage: 15_500,
    laborCost: 0.75, rentCost: 1.2, interestRate: 0.005, inflation: 0.03,
    easeOfBusiness: 78, corruption: 29, startupDays: 11, startupFee: 1_400,
    exchange: { name: 'Tokyo Stock Exchange', code: 'TSE', index: 'Nikkei 225', volatility: 0.2, drift: 0.05 },
    demand: {
      gameStudio: 1.8, entertainment: 1.4, hotel: 1.4, clinic: 1.3, restaurant: 1.2,
      cafe: 1.2, manufacturing: 1.2, realEstate: 0.8, farm: 0.6,
      semiconductor: 1.8, robotics: 2.4, spaceTech: 1.4, aiLab: 1.1, biotech: 1.3, quantum: 1.2, electricVehicles: 0.9, cybersecurity: 1,
    },
    banned: [],
    priceMult: { car: 0.85, luxury: 0.85, alcohol: 0.9, food: 0.85, fuel: 1.3 },
    businessNote:
      'Registration takes a week and a registered hanko seal, clients expect your business card with both hands, and somewhere a fax machine is still waiting for your purchase order.',
    nameWords: ['Sakura', 'Fuji', 'Nippon', 'Kaze', 'Hoshi', 'Tsubasa', 'Momiji', 'Hikari', 'Kumo', 'Shinkai'],
  },

  // Kazakhstan: oil, uranium and grain; fast online registration, VAT raised to 16% in 2026.
  kz: {
    countryId: 'kz', currencyName: 'Kazakhstani tenge', currencyCode: 'KZT',
    gdpPerCapita: 14_000, populationM: 20.3,
    corporateTax: 0.2, salesTax: 0.16, salesTaxName: 'VAT', minWage: 2_000,
    laborCost: 0.3, rentCost: 0.35, interestRate: 0.165, inflation: 0.1,
    easeOfBusiness: 80, corruption: 60, startupDays: 5, startupFee: 150,
    exchange: { name: 'Kazakhstan Stock Exchange', code: 'KASE', index: 'KASE Index', volatility: 0.28, drift: 0.1 },
    demand: {
      energy: 2.2, construction: 1.3, logistics: 1.3, farm: 1.2, autoShop: 1.2,
      hotel: 0.8, gameStudio: 0.5,
      spaceTech: 1.2, aiLab: 0.5, biotech: 0.4, semiconductor: 0.3, robotics: 0.4, electricVehicles: 0.4, quantum: 0.3, cybersecurity: 0.5,
    },
    banned: [],
    priceMult: { car: 1.15, electronics: 1.25, luxury: 1.2, alcohol: 0.7, food: 0.45, fuel: 0.55 },
    businessNote:
      "eGov registers your company in an afternoon; the inspections, the tenge's mood swings and heating a shop through an Astana winter take rather longer.",
    nameWords: ['Steppe', 'Tengri', 'Alatau', 'Burkit', 'Saryarka', 'Ulytau', 'Tulpar', 'Shanyrak', 'Balkhash'],
  },

  // Malaysia: oil and gas, electronics factories, palm oil; subsidised petrol, pricey beer.
  my: {
    countryId: 'my', currencyName: 'Malaysian ringgit', currencyCode: 'MYR',
    gdpPerCapita: 12_500, populationM: 34,
    corporateTax: 0.24, salesTax: 0.08, salesTaxName: 'SST', minWage: 4_500,
    laborCost: 0.38, rentCost: 0.35, interestRate: 0.0275, inflation: 0.02,
    easeOfBusiness: 82, corruption: 50, startupDays: 6, startupFee: 500,
    exchange: { name: 'Bursa Malaysia', code: 'KLSE', index: 'FTSE Bursa Malaysia KLCI', volatility: 0.14, drift: 0.05 },
    demand: {
      energy: 1.6, manufacturing: 1.5, farm: 1.3, restaurant: 1.3, logistics: 1.3,
      ecommerce: 1.2, hotel: 1.2, bar: 0.6, brewery: 0.3,
      semiconductor: 1.6, electricVehicles: 0.8, aiLab: 0.8, robotics: 0.8, biotech: 0.6, spaceTech: 0.4, quantum: 0.4, cybersecurity: 0.8,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.1, alcohol: 1.6, food: 0.5, fuel: 0.52 },
    businessNote:
      'SSM registers your Sdn Bhd in days; the council licence, the halal certificate and the business meetings at the mamak stall take a little longer.',
    nameWords: ['Harimau', 'Kinabalu', 'Melaka', 'Seri', 'Bunga Raya', 'Gemilang', 'Pelangi', 'Rajawali', 'Borneo'],
  },

  // Mongolia: copper and coal mining, cashmere and herding; tiny but real stock exchange.
  mn: {
    countryId: 'mn', currencyName: 'Mongolian tögrög', currencyCode: 'MNT',
    gdpPerCapita: 6_000, populationM: 3.5,
    corporateTax: 0.25, salesTax: 0.1, salesTaxName: 'VAT', minWage: 2_700,
    laborCost: 0.2, rentCost: 0.25, interestRate: 0.12, inflation: 0.08,
    easeOfBusiness: 68, corruption: 67, startupDays: 8, startupFee: 150,
    exchange: { name: 'Mongolian Stock Exchange', code: 'MSE', index: 'MSE Top 20', volatility: 0.35, drift: 0.08 },
    demand: {
      energy: 1.8, farm: 1.5, fashion: 1.2, logistics: 1.2, construction: 1.2,
      hotel: 0.8, software: 0.6, ecommerce: 0.6, gameStudio: 0.4,
      semiconductor: 0.3, aiLab: 0.3, robotics: 0.3, biotech: 0.3, spaceTech: 0.3, electricVehicles: 0.3, quantum: 0.3, cybersecurity: 0.3,
    },
    banned: [],
    priceMult: { electronics: 1.25, luxury: 1.3, alcohol: 0.7, food: 0.55 },
    businessNote:
      'Registration is quick and the mining money is real, but your supply chain runs through a single border crossing and your heating bill through an eight-month winter.',
    nameWords: ['Altai', 'Tenger', 'Khangai', 'Orkhon', 'Altan', 'Tumen', 'Selenge', 'Bogd', 'Khan'],
  },

  // Nepal: trekking tourism, hydropower and remittances; import duties make cars wildly expensive.
  np: {
    countryId: 'np', currencyName: 'Nepalese rupee', currencyCode: 'NPR',
    gdpPerCapita: 1_400, populationM: 29.7,
    corporateTax: 0.25, salesTax: 0.13, salesTaxName: 'VAT', minWage: 1_700,
    laborCost: 0.11, rentCost: 0.15, interestRate: 0.05, inflation: 0.045,
    easeOfBusiness: 63, corruption: 66, startupDays: 16, startupFee: 250,
    exchange: { name: 'Nepal Stock Exchange', code: 'NEPSE', index: 'NEPSE Index', volatility: 0.35, drift: 0.09 },
    demand: {
      hotel: 1.6, farm: 1.5, energy: 1.3, restaurant: 1.2, construction: 1.2,
      manufacturing: 0.6, ecommerce: 0.6, software: 0.5, gameStudio: 0.3,
      semiconductor: 0.3, aiLab: 0.3, robotics: 0.3, biotech: 0.3, spaceTech: 0.3, electricVehicles: 0.3, quantum: 0.3, cybersecurity: 0.3,
    },
    banned: [],
    priceMult: { car: 2.5, electronics: 1.3, luxury: 1.4, food: 0.35, fuel: 1.35 },
    businessNote:
      'The Company Registrar is online now, but trekking season, monsoon landslides and the one highway to India still write your quarterly results.',
    nameWords: ['Everest', 'Annapurna', 'Himal', 'Gorkha', 'Sagarmatha', 'Lumbini', 'Bagmati', 'Gurans', 'Machhapuchhre'],
  },

  // Pakistan: textiles and farming; alcohol has been prohibited for Muslims since 1977,
  // so bars and breweries are off the table; the PTA tax makes imported phones very pricey.
  pk: {
    countryId: 'pk', currencyName: 'Pakistani rupee', currencyCode: 'PKR',
    gdpPerCapita: 1_600, populationM: 245,
    corporateTax: 0.29, salesTax: 0.18, salesTaxName: 'GST', minWage: 1_700,
    laborCost: 0.13, rentCost: 0.15, interestRate: 0.11, inflation: 0.08,
    easeOfBusiness: 61, corruption: 73, startupDays: 10, startupFee: 250,
    exchange: { name: 'Pakistan Stock Exchange', code: 'PSX', index: 'KSE-100', volatility: 0.32, drift: 0.12 },
    demand: {
      farm: 1.5, fashion: 1.4, manufacturing: 1.3, construction: 1.3, restaurant: 1.2,
      hotel: 0.6, gameStudio: 0.5,
      aiLab: 0.6, cybersecurity: 0.6, semiconductor: 0.3, robotics: 0.4, biotech: 0.5, spaceTech: 0.4, electricVehicles: 0.4, quantum: 0.3,
    },
    banned: ['bar', 'brewery'],
    priceMult: { car: 1.3, electronics: 1.8, luxury: 1.5, alcohol: 2.5, food: 0.3 },
    businessNote:
      "SECP incorporates you online in days; load-shedding, the FBR's latest withholding tax and the cricket calendar manage the rest of your schedule.",
    nameWords: ['Indus', 'Karakoram', 'Khyber', 'Ravi', 'Chenab', 'Margalla', 'Shalimar', 'Hunza', 'Sohni'],
  },

  // Philippines: BPO and call centres, remittances, sari-sari stores and karaoke.
  ph: {
    countryId: 'ph', currencyName: 'Philippine peso', currencyCode: 'PHP',
    gdpPerCapita: 4_000, populationM: 115,
    corporateTax: 0.25, salesTax: 0.12, salesTaxName: 'VAT', minWage: 3_200,
    laborCost: 0.19, rentCost: 0.3, interestRate: 0.05, inflation: 0.025,
    easeOfBusiness: 63, corruption: 67, startupDays: 30, startupFee: 500,
    exchange: { name: 'Philippine Stock Exchange', code: 'PSE', index: 'PSEi', volatility: 0.2, drift: 0.06 },
    demand: {
      bakery: 1.3, grocery: 1.3, entertainment: 1.3, hotel: 1.3, marketing: 1.3,
      restaurant: 1.2, logistics: 1.2, manufacturing: 0.8, gameStudio: 0.6,
      semiconductor: 0.9, cybersecurity: 0.7, aiLab: 0.7, robotics: 0.4, biotech: 0.4, spaceTech: 0.3, electricVehicles: 0.5, quantum: 0.3,
    },
    banned: [],
    priceMult: { car: 1.2, electronics: 1.25, luxury: 1.15, alcohol: 0.45, food: 0.55, fuel: 1.2 },
    businessNote:
      'Registering means the SEC, the barangay, City Hall and the BIR, each with its own queue, its own stamp and its own need for a photocopy of the last stamp.',
    nameWords: ['Mabuhay', 'Bayanihan', 'Maharlika', 'Sampaguita', 'Mayon', 'Luzon', 'Visayas', 'Bituin', 'Tala'],
  },

  // Singapore: one-day registration, low tax, no minimum wage (sector wage ladders instead);
  // the COE makes a car cost several times the US price. MAS steers the currency, not a rate.
  sg: {
    countryId: 'sg', currencyName: 'Singapore dollar', currencyCode: 'SGD',
    gdpPerCapita: 90_000, populationM: 6,
    corporateTax: 0.17, salesTax: 0.09, salesTaxName: 'GST', minWage: 0,
    laborCost: 1, rentCost: 1.8, interestRate: 0.025, inflation: 0.02,
    easeOfBusiness: 86, corruption: 16, startupDays: 1, startupFee: 300,
    exchange: { name: 'Singapore Exchange', code: 'SGX', index: 'Straits Times Index', volatility: 0.15, drift: 0.05 },
    demand: {
      logistics: 1.6, software: 1.5, clinic: 1.3, restaurant: 1.3, marketing: 1.3,
      ecommerce: 1.3, autoShop: 0.6, farm: 0.3,
      semiconductor: 1.6, biotech: 1.3, aiLab: 1.3, cybersecurity: 1.3, quantum: 1.1, robotics: 1.1, spaceTech: 0.8, electricVehicles: 0.6,
    },
    banned: [],
    priceMult: { car: 2.8, electronics: 1.15, alcohol: 2, food: 1.1, fuel: 2.5 },
    businessNote:
      'ACRA registers your company before your kopi gets cold; affording the shophouse rent and a COE for the delivery van is the hard part.',
    nameWords: ['Merlion', 'Lion City', 'Marina', 'Orchid', 'Kallang', 'Sentosa', 'Straits', 'Singa', 'Bukit'],
  },

  // South Korea: K-beauty, K-pop, esports and more cafés per street than seems possible.
  kr: {
    countryId: 'kr', currencyName: 'South Korean won', currencyCode: 'KRW',
    gdpPerCapita: 36_000, populationM: 51.7,
    corporateTax: 0.24, salesTax: 0.1, salesTaxName: 'VAT', minWage: 18_000,
    laborCost: 0.75, rentCost: 1, interestRate: 0.025, inflation: 0.02,
    easeOfBusiness: 84, corruption: 36, startupDays: 4, startupFee: 400,
    exchange: { name: 'Korea Exchange', code: 'KRX', index: 'KOSPI', volatility: 0.22, drift: 0.06 },
    demand: {
      beauty: 1.8, gameStudio: 1.7, cafe: 1.6, entertainment: 1.6, software: 1.3,
      manufacturing: 1.3, ecommerce: 1.3, energy: 0.7, farm: 0.6,
      semiconductor: 2.6, electricVehicles: 1.6, robotics: 1.8, aiLab: 1.3, spaceTech: 0.8, biotech: 1.2, quantum: 0.9, cybersecurity: 1.1,
    },
    banned: [],
    priceMult: { electronics: 1.15, luxury: 1.1, alcohol: 0.8, food: 1.15, fuel: 1.35 },
    businessNote:
      'The paperwork is fast and fully online; the hard part is opening a café on a street that already has eleven of them and a fried chicken place on every floor.',
    nameWords: ['Hanbit', 'Mugunghwa', 'Arirang', 'Hangang', 'Baekdu', 'Seorak', 'Haneul', 'Saebyeok', 'Gaon'],
  },

  // Taiwan: semiconductors, bubble tea and night markets; VAT is only 5%.
  tw: {
    countryId: 'tw', currencyName: 'New Taiwan dollar', currencyCode: 'TWD',
    gdpPerCapita: 33_500, populationM: 23.4,
    corporateTax: 0.2, salesTax: 0.05, salesTaxName: 'VAT', minWage: 11_000,
    laborCost: 0.6, rentCost: 0.7, interestRate: 0.02, inflation: 0.02,
    easeOfBusiness: 81, corruption: 33, startupDays: 10, startupFee: 500,
    exchange: { name: 'Taiwan Stock Exchange', code: 'TWSE', index: 'TAIEX', volatility: 0.22, drift: 0.08 },
    demand: {
      manufacturing: 1.7, cafe: 1.4, foodTruck: 1.4, restaurant: 1.3, software: 1.2,
      ecommerce: 1.2, farm: 0.7, energy: 0.6,
      semiconductor: 3, aiLab: 1.3, robotics: 1.2, electricVehicles: 0.7, spaceTech: 0.5, biotech: 1, quantum: 0.9, cybersecurity: 1,
    },
    banned: [],
    priceMult: { car: 1.3, electronics: 1.15, alcohol: 0.8, food: 0.85 },
    businessNote:
      'Registration is efficient and chip money is everywhere, but your real competition is the night-market stall selling the same thing for a third of the price until 2 a.m.',
    nameWords: ['Yushan', 'Alishan', 'Taroko', 'Sun Moon', 'Plum Blossom', 'Tamsui', 'Penghu', 'Black Bear', 'Ilha'],
  },

  // Thailand: tourism, street food, medical tourism and car plants; heavy car excise.
  th: {
    countryId: 'th', currencyName: 'Thai baht', currencyCode: 'THB',
    gdpPerCapita: 7_300, populationM: 71.7,
    corporateTax: 0.2, salesTax: 0.07, salesTaxName: 'VAT', minWage: 3_400,
    laborCost: 0.26, rentCost: 0.35, interestRate: 0.015, inflation: 0.01,
    easeOfBusiness: 80, corruption: 66, startupDays: 6, startupFee: 300,
    exchange: { name: 'Stock Exchange of Thailand', code: 'SET', index: 'SET Index', volatility: 0.2, drift: 0.05 },
    demand: {
      hotel: 2, foodTruck: 1.5, bar: 1.4, restaurant: 1.4, clinic: 1.4,
      salon: 1.3, manufacturing: 1.3, farm: 1.2, gameStudio: 0.7,
      electricVehicles: 1.1, semiconductor: 0.7, robotics: 0.8, aiLab: 0.6, biotech: 0.6, spaceTech: 0.4, quantum: 0.3, cybersecurity: 0.6,
    },
    banned: [],
    priceMult: { car: 1.5, electronics: 1.1, luxury: 1.2, alcohol: 1.1, food: 0.6, fuel: 1.25 },
    businessNote:
      'Registration takes a few days, foreign partners can own at most 49%, and the monsoon decides how many tourists find your beach bar.',
    nameWords: ['Siam', 'Chao Phraya', 'Lanna', 'Naga', 'Erawan', 'Mekong', 'Ayutthaya', 'Rattana', 'Andaman'],
  },

  // Vietnam: export factories, coffee everywhere and famously cheap draft beer. VAT is 10% but
  // has been cut to 8% on most goods since 2022.
  vn: {
    countryId: 'vn', currencyName: 'Vietnamese dong', currencyCode: 'VND',
    gdpPerCapita: 4_700, populationM: 101,
    corporateTax: 0.2, salesTax: 0.08, salesTaxName: 'VAT', minWage: 2_300,
    laborCost: 0.18, rentCost: 0.3, interestRate: 0.045, inflation: 0.035,
    easeOfBusiness: 70, corruption: 60, startupDays: 10, startupFee: 300,
    exchange: { name: 'Ho Chi Minh City Stock Exchange', code: 'HOSE', index: 'VN-Index', volatility: 0.28, drift: 0.09 },
    demand: {
      manufacturing: 1.8, cafe: 1.7, foodTruck: 1.5, logistics: 1.3, construction: 1.3,
      hotel: 1.3, farm: 1.3, bar: 1.2,
      semiconductor: 1, electricVehicles: 1.1, aiLab: 0.7, robotics: 0.6, biotech: 0.5, spaceTech: 0.3, quantum: 0.3, cybersecurity: 0.6,
    },
    banned: [],
    priceMult: { car: 1.6, electronics: 1.15, luxury: 1.2, alcohol: 0.4, food: 0.5 },
    businessNote:
      'Your business licence arrives in days and a motorbike can deliver anything in minutes, but every street corner already has a café full of tiny plastic stools.',
    nameWords: ['Mekong', 'Saigon', 'Ha Long', 'Sen Vang', 'Hoa Binh', 'Truong Son', 'Song Hong', 'Lac Hong', 'Thang Long'],
  },

  // ----- Oceania -----

  // Australia: mining and LNG, property obsession, high award wages and serious coffee.
  au: {
    countryId: 'au', currencyName: 'Australian dollar', currencyCode: 'AUD',
    gdpPerCapita: 64_500, populationM: 27.2,
    corporateTax: 0.3, salesTax: 0.1, salesTaxName: 'GST', minWage: 32_000,
    laborCost: 1.05, rentCost: 1, interestRate: 0.036, inflation: 0.03,
    easeOfBusiness: 81, corruption: 23, startupDays: 2, startupFee: 500,
    exchange: { name: 'Australian Securities Exchange', code: 'ASX', index: 'S&P/ASX 200', volatility: 0.15, drift: 0.08 },
    demand: {
      energy: 1.8, realEstate: 1.5, cafe: 1.5, construction: 1.4, farm: 1.3,
      brewery: 1.3, gym: 1.2, hotel: 1.2, manufacturing: 0.7,
      spaceTech: 1, quantum: 1.3, biotech: 1.3, cybersecurity: 1, aiLab: 1, robotics: 1.1, semiconductor: 0.6, electricVehicles: 0.8,
    },
    banned: [],
    priceMult: { car: 1.15, electronics: 1.15, luxury: 1.15, alcohol: 1.5, fuel: 1.35 },
    businessNote:
      'ASIC registers you online in an afternoon; quarterly BAS statements, award wages and a barista who judges your flat white will keep you humble.',
    nameWords: ['Southern Cross', 'Outback', 'Wattle', 'Coral', 'Murray', 'Banksia', 'Bondi', 'Wombat', 'Jacaranda', 'Red Centre'],
  },

  // New Zealand: #1 on the old Doing Business ranking; dairy, tourism and expensive petrol.
  nz: {
    countryId: 'nz', currencyName: 'New Zealand dollar', currencyCode: 'NZD',
    gdpPerCapita: 48_500, populationM: 5.3,
    corporateTax: 0.28, salesTax: 0.15, salesTaxName: 'GST', minWage: 28_800,
    laborCost: 0.85, rentCost: 0.75, interestRate: 0.03, inflation: 0.025,
    easeOfBusiness: 87, corruption: 17, startupDays: 1, startupFee: 150,
    exchange: { name: 'New Zealand Exchange', code: 'NZX', index: 'S&P/NZX 50', volatility: 0.13, drift: 0.07 },
    demand: {
      farm: 2, hotel: 1.4, cafe: 1.4, brewery: 1.3, construction: 1.2,
      entertainment: 1.2, energy: 0.8, manufacturing: 0.7,
      spaceTech: 1.3, aiLab: 0.8, biotech: 0.9, cybersecurity: 0.8, robotics: 0.7, electricVehicles: 0.9, quantum: 0.6, semiconductor: 0.3,
    },
    banned: [],
    priceMult: { electronics: 1.2, luxury: 1.15, alcohol: 1.3, fuel: 1.8 },
    businessNote:
      "You can incorporate online before your flat white cools; then come two-monthly GST returns, staff who've moved to Australia and more sheep than customers.",
    nameWords: ['Kiwi', 'Aotearoa', 'Kōwhai', 'Tasman', 'Fern', 'Pōhutukawa', 'Kauri', 'Southern Alps', 'Mānuka'],
  },

  // Papua New Guinea: LNG, gold and copper, coffee; few roads, so everything is flown in.
  // PNGX is tiny, so investments trade on the ASX.
  pg: {
    countryId: 'pg', currencyName: 'Papua New Guinean kina', currencyCode: 'PGK',
    gdpPerCapita: 3_200, populationM: 10.3,
    corporateTax: 0.3, salesTax: 0.1, salesTaxName: 'GST', minWage: 1_900,
    laborCost: 0.12, rentCost: 0.6, interestRate: 0.04, inflation: 0.04,
    easeOfBusiness: 60, corruption: 68, startupDays: 40, startupFee: 400,
    exchange: null,
    demand: {
      energy: 2, logistics: 1.4, farm: 1.4, construction: 1.2, hotel: 0.6,
      marketing: 0.6, ecommerce: 0.4, software: 0.3, gameStudio: 0.3,
      semiconductor: 0.3, aiLab: 0.3, robotics: 0.3, biotech: 0.3, spaceTech: 0.3, electricVehicles: 0.3, quantum: 0.3, cybersecurity: 0.3,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.4, luxury: 1.4, alcohol: 1.3, food: 0.85, fuel: 1.4 },
    businessNote:
      "There's no road from Port Moresby to Lae, so your supply chain flies, sails or waits, and every plot of land seems to come with several families who own it.",
    nameWords: ['Kumul', 'Sepik', 'Fly River', 'Wahgi', 'Kokoda', 'Highlands', 'Paradise', 'Kundu', 'Bilum'],
  },

  // Samoa: tourism, remittances and coconuts; most land is customary and cannot be sold.
  // Not scored by the CPI, so corruption is an estimate; investments trade on the ASX.
  ws: {
    countryId: 'ws', currencyName: 'Samoan tālā', currencyCode: 'WST',
    gdpPerCapita: 4_500, populationM: 0.22,
    corporateTax: 0.27, salesTax: 0.15, salesTaxName: 'VAGST', minWage: 3_000,
    laborCost: 0.16, rentCost: 0.3, interestRate: 0.01, inflation: 0.04,
    easeOfBusiness: 62, corruption: 45, startupDays: 9, startupFee: 250,
    exchange: null,
    demand: {
      hotel: 1.8, farm: 1.5, restaurant: 1.2, realEstate: 0.6, manufacturing: 0.5,
      energy: 0.5, ecommerce: 0.4, software: 0.3, gameStudio: 0.3,
      semiconductor: 0.3, aiLab: 0.3, robotics: 0.3, biotech: 0.3, spaceTech: 0.3, electricVehicles: 0.3, quantum: 0.3, cybersecurity: 0.3,
    },
    banned: [],
    priceMult: { car: 1.4, electronics: 1.35, luxury: 1.4, alcohol: 1.2, food: 0.8, fuel: 1.6 },
    businessNote:
      "Sunday is for church and to'ona'i, most land belongs to families and can't be sold, and your stock arrives when the container ship says so.",
    nameWords: ['Upolu', "Savai'i", 'Manaia', 'Lagi', 'Moana', 'Fetu', 'Siapo', 'Matafaga', 'Niu'],
  },
}
