// Real listed companies of the Americas (see stocks-data.ts for the conventions).
import type { Brand } from '../data/brands'
import { stock } from './stocks-data'

const US = (name: string, sector: string, listed: number, fame: number, blurb: string, x = {}, ex = 'NYSE') => stock('us', ex, name, sector, listed, fame, blurb, x)
const CA = (name: string, sector: string, listed: number, fame: number, blurb: string, x = {}) => stock('ca', 'TSX', name, sector, listed, fame, blurb, x)

export const STOCKS_AMERICAS: Brand[] = [
  // United States: banks and finance
  US('JPMorgan Chase', 'banks', 1900, 9, 'Banking and financial services', { aka: [[1900, 'Chase National Bank'], [1955, 'Chase Manhattan'], [2001, 'JPMorgan Chase']] }),
  US('Citigroup', 'banks', 1900, 8, 'Banking and financial services', { aka: [[1900, 'National City Bank'], [1955, 'First National City Bank'], [1976, 'Citicorp'], [1998, 'Citigroup']] }),
  US('Bank of America', 'banks', 1930, 9, 'Banking and financial services', { aka: [[1930, 'Bank of America'], [1983, 'BankAmerica'], [1998, 'Bank of America']] }),
  US('Goldman Sachs', 'banks', 1999, 8, 'Investment banking and asset management'),
  US('Lehman Brothers', 'banks', 1994, 6, 'Investment banking', { ended: 2007, bankrupt: true }),
    US('Merrill Lynch', 'banks', 1971, 6, 'Brokerage and wealth management', { ended: 2008 }),

  US('Visa', 'banks', 2008, 8, 'Card payments network', { label: 'Payments', dy: 0.008 }),

  US('Berkshire Hathaway', 'insurance', 1955, 9, 'Insurance and a conglomerate of businesses', { label: 'Conglomerate', dy: 0 }),
  US('UnitedHealth Group', 'insurance', 1984, 8, 'Health insurance and care services', { label: 'Health insurance' }),
  // technology
  US('IBM', 'tech', 1911, 9, 'Computers, software and consulting', { aka: [[1911, 'Computing-Tabulating-Recording Company'], [1924, 'International Business Machines'], [1990, 'IBM']], size: [[1911, 'mid'], [1940, 'large'], [1960, 'mega'], [1995, 'large']] }),

  US('Microsoft', 'tech', 1986, 10, 'Software, cloud services and games', { arc: [[1987, 1999, 0.07], [2000, 2012, -0.04], [2013, 2025, 0.05]], size: [[1986, 'mid'], [1992, 'large'], [1998, 'mega']], dy: 0.008 }, 'NASDAQ'),

  US('Apple', 'tech', 1980, 10, 'Phones, computers and services', { aka: [[1980, 'Apple Computer'], [2007, 'Apple']], arc: [[1991, 1997, -0.07], [1998, 2012, 0.12], [2013, 2025, 0.03]], size: [[1980, 'mid'], [2005, 'large'], [2011, 'mega']], dy: 0.005 }, 'NASDAQ'),

  US('Alphabet', 'tech', 2004, 10, 'Search, advertising, video and cloud services', { aka: [[2004, 'Google'], [2015, 'Alphabet']], arc: [[2005, 2012, 0.06]], size: [[2004, 'large'], [2010, 'mega']], dy: 0.002 }, 'NASDAQ'),
  US('Cisco', 'tech', 1990, 7, 'Networking equipment', { arc: [[1991, 1999, 0.1]], size: [[1990, 'mid'], [1996, 'large'], [1999, 'mega'], [2003, 'large']] }, 'NASDAQ'),
    US('Intel', 'semis', 1971, 8, 'Microprocessors and chips', { arc: [[1990, 1999, 0.08], [2000, 2010, -0.04], [2018, 2025, -0.08]], size: [[1971, 'mid'], [1990, 'large'], [1997, 'mega'], [2009, 'large']] }, 'NASDAQ'),

  US('Nvidia', 'semis', 1999, 9, 'Graphics chips and AI computing', { arc: [[2015, 2025, 0.12]], size: [[1999, 'mid'], [2007, 'large'], [2023, 'mega']], dy: 0.002 }, 'NASDAQ'),

  US('Amazon', 'ecommerce', 1997, 10, 'Online retail, cloud and logistics', { arc: [[2002, 2020, 0.07]], size: [[1997, 'mid'], [2005, 'large'], [2015, 'mega']], dy: 0 }, 'NASDAQ'),

  US('Meta Platforms', 'media', 2012, 9, 'Social networks and messaging', { aka: [[2012, 'Facebook'], [2021, 'Meta Platforms']], size: [[2012, 'large'], [2015, 'mega']], dy: 0.003 }, 'NASDAQ'),

  US('Netflix', 'entertainment', 2002, 7, 'Streaming video', { arc: [[2003, 2021, 0.08]], dy: 0 }, 'NASDAQ'),

  US('Tesla', 'ev', 2010, 9, 'Electric cars and batteries', { arc: [[2011, 2021, 0.1]], size: [[2010, 'mid'], [2017, 'large'], [2020, 'mega']], dy: 0 }, 'NASDAQ'),
  // telecom, media and entertainment
  US('AT&T', 'telecom', 1900, 9, 'Telephone and wireless services', { aka: [[1900, 'American Telephone & Telegraph'], [1984, 'AT&T']], size: [[1900, 'large'], [1920, 'mega'], [1984, 'large']] }),
  US('The Walt Disney Company', 'entertainment', 1940, 9, 'Films, television and theme parks', { aka: [[1940, 'Walt Disney Productions'], [1986, 'The Walt Disney Company']] }),
    // consumer
  US('The Coca-Cola Company', 'food', 1919, 9, 'Soft drinks'),
  US('PepsiCo', 'food', 1965, 8, 'Soft drinks and snacks', {}, 'NASDAQ'),
  US("McDonald's", 'food', 1965, 9, 'Fast-food restaurants'),
  US('Procter & Gamble', 'cosmetics', 1900, 9, 'Household and personal care products', { label: 'Consumer goods' }),
  // health
  US('Johnson & Johnson', 'pharma', 1944, 8, 'Medicines, medical devices and health products'),
  US('Pfizer', 'pharma', 1942, 8, 'Medicines and vaccines'),
  US('Merck', 'pharma', 1941, 7, 'Medicines and vaccines'),
  US('Eli Lilly', 'pharma', 1952, 7, 'Medicines'),
  // retail
  US('Walmart', 'supermarkets', 1970, 10, 'Discount stores and supercenters', { aka: [[1970, 'Wal-Mart Stores'], [2008, 'Walmart']], arc: [[1972, 1992, 0.08]], size: [[1970, 'mid'], [1990, 'large'], [2000, 'mega']] }),
  US('The Home Depot', 'supermarkets', 1981, 7, 'Home improvement retail', { label: 'Home improvement retail' }),
  US('Sears Holdings', 'supermarkets', 1906, 6, 'Department stores and mail-order catalog', { aka: [[1906, 'Sears, Roebuck and Co.'], [2005, 'Sears Holdings']], ended: 2017, bankrupt: true, label: 'Department stores' }),
  // cars
  US('Ford Motor Company', 'automakers', 1956, 8, 'Cars and trucks'),
  US('General Motors', 'automakers', 1916, 8, 'Cars and trucks', { ended: 2008, bankrupt: true, id: 'general-motors-1916' }),
  US('General Motors', 'automakers', 2010, 8, 'Cars and trucks', { id: 'general-motors-2010' }),
    // industry
  US('GE Aerospace', 'industrials', 1900, 9, 'Jet engines (formerly a broad industrial conglomerate)', { aka: [[1900, 'General Electric'], [2024, 'GE Aerospace']], arc: [[1985, 1999, 0.07], [2000, 2017, -0.05]], size: [[1900, 'large'], [1960, 'mega'], [2010, 'large'], [2018, 'mid'], [2024, 'large']] }),
  US('Boeing', 'space', 1934, 8, 'Commercial and military aircraft', { label: 'Aerospace' }),
  US('United States Steel', 'industrials', 1901, 6, 'Steelmaker', { aka: [[1901, 'United States Steel'], [1986, 'USX'], [2002, 'United States Steel']], ended: 2024, label: 'Steel' }),
    US('DuPont', 'industrials', 1915, 6, 'Chemicals and materials', { aka: [[1915, 'E. I. du Pont de Nemours and Company'], [1999, 'DuPont']], ended: 2016, label: 'Chemicals' }),
  US('Eastman Kodak', 'electronics', 1902, 6, 'Photographic film and cameras', { arc: [[1996, 2011, -0.09]], ended: 2011, bankrupt: true, label: 'Photography' }),
  US('RCA', 'electronics', 1919, 6, 'Radio, television and electronics', { ended: 1985 }),
  // energy
  US('ExxonMobil', 'oil', 1900, 10, 'Oil and gas', { aka: [[1900, 'Standard Oil of New Jersey'], [1972, 'Exxon'], [1999, 'ExxonMobil']], size: [[1900, 'large'], [1930, 'mega']] }),
  US('Mobil', 'oil', 1911, 7, 'Oil and gas', { aka: [[1911, 'Standard Oil of New York'], [1966, 'Socony Mobil'], [1976, 'Mobil']], ended: 1998 }),
  US('Chevron', 'oil', 1911, 8, 'Oil and gas', { aka: [[1911, 'Standard Oil of California'], [1984, 'Chevron']] }),
  US('Texaco', 'oil', 1902, 7, 'Oil and gas', { aka: [[1902, 'Texas Company'], [1959, 'Texaco']], ended: 2000 }),
  US('Gulf Oil', 'oil', 1907, 6, 'Oil and gas', { ended: 1983 }),
  US('Anaconda Copper', 'mining', 1900, 5, 'Copper mining', { ended: 1976 }),
  US('Kennecott Copper', 'mining', 1915, 5, 'Copper mining', { ended: 1980 }),
  // transport
  US('Pennsylvania Railroad', 'shipping', 1900, 6, 'Railroad', { ended: 1967, label: 'Railroad' }),
  US('New York Central Railroad', 'shipping', 1900, 5, 'Railroad', { ended: 1967, label: 'Railroad' }),
  US('Pan American World Airways', 'airlines', 1928, 6, 'International airline', { ended: 1990, bankrupt: true }),

  // Canada
  CA('Royal Bank of Canada', 'banks', 1900, 8, 'Banking and financial services'),
  CA('Toronto-Dominion Bank', 'banks', 1900, 8, 'Banking and financial services', { aka: [[1900, 'Bank of Toronto'], [1955, 'Toronto-Dominion Bank']] }),
  CA('Scotiabank', 'banks', 1900, 7, 'Banking and financial services', { aka: [[1900, 'Bank of Nova Scotia'], [2000, 'Scotiabank']] }),
  CA('Bank of Montreal', 'banks', 1900, 7, 'Banking and financial services'),
  CA('CIBC', 'banks', 1900, 6, 'Banking and financial services', { aka: [[1900, 'Canadian Bank of Commerce'], [1961, 'CIBC']] }),
  CA('Manulife', 'insurance', 1999, 7, 'Life insurance and wealth management'),
  CA('Sun Life Financial', 'insurance', 2000, 6, 'Life insurance and wealth management'),

  CA('Shopify', 'ecommerce', 2015, 8, 'Online store software', { size: [[2015, 'mid'], [2020, 'large']], dy: 0 }),
  CA('Enbridge', 'oil', 1950, 7, 'Oil and gas pipelines', { aka: [[1950, 'Interprovincial Pipe Line'], [1998, 'Enbridge']] }),
  CA('Suncor Energy', 'oil', 1979, 7, 'Oil sands and refining'),
  CA('Imperial Oil', 'oil', 1900, 7, 'Oil and gas'),
  CA('Barrick Gold', 'mining', 1983, 7, 'Gold mining'),
  CA('Nutrien', 'agri', 1989, 6, 'Fertilizers and farm supplies', { aka: [[1989, 'Potash Corporation of Saskatchewan'], [2018, 'Nutrien']] }),
  CA('Canadian Pacific Railway', 'shipping', 1900, 7, 'Freight railroad', { label: 'Railroad' }),
  CA('Canadian National Railway', 'shipping', 1995, 7, 'Freight railroad', { label: 'Railroad' }),
  CA('BCE', 'telecom', 1900, 7, 'Telephone and wireless services', { aka: [[1900, 'Bell Telephone Company of Canada'], [1983, 'BCE']] }),
  CA('Rogers Communications', 'telecom', 1979, 5, 'Wireless, cable and media'),
  CA('Bombardier', 'space', 1969, 6, 'Aircraft and trains', { label: 'Aerospace' }),
  CA('BlackBerry', 'tech', 1999, 6, 'Phones and security software', { aka: [[1999, 'Research In Motion'], [2013, 'BlackBerry']], arc: [[2008, 2012, -0.15]] }),
  CA('Loblaw', 'supermarkets', 1947, 6, 'Supermarkets and pharmacies'),

  // Mexico
  stock('mx', 'BMV', 'América Móvil', 'telecom', 2000, 8, 'Mobile and fixed telephone services'),
  stock('mx', 'BMV', 'Teléfonos de México', 'telecom', 1991, 6, 'Telephone services', { ended: 2011 }),
  stock('mx', 'BMV', 'Cemex', 'construction', 1976, 6, 'Cement and building materials'),
  stock('mx', 'BMV', 'Grupo Bimbo', 'food', 1980, 6, 'Bread and baked goods'),
  stock('mx', 'BMV', 'Grupo Televisa', 'media', 1991, 6, 'Television and media'),
  stock('mx', 'BMV', 'Banorte', 'banks', 1992, 5, 'Banking and financial services'),

  // Brazil
  stock('br', 'B3', 'Petrobras', 'oil', 1954, 9, 'Oil and gas'),
  stock('br', 'B3', 'Vale', 'mining', 1950, 9, 'Iron ore and nickel mining', { aka: [[1950, 'Companhia Vale do Rio Doce'], [2007, 'Vale']] }),
  stock('br', 'B3', 'Itaú Unibanco', 'banks', 1970, 8, 'Banking and financial services', { aka: [[1970, 'Itaú'], [2008, 'Itaú Unibanco']] }),
  stock('br', 'B3', 'Banco do Brasil', 'banks', 1900, 7, 'Banking and financial services'),
  stock('br', 'B3', 'Embraer', 'space', 2000, 7, 'Regional and business jets', { label: 'Aerospace' }),
  stock('br', 'B3', 'JBS', 'food', 2007, 6, 'Meat and food processing'),
  stock('br', 'B3', 'Natura', 'cosmetics', 2004, 6, 'Cosmetics and personal care'),
  stock('br', 'B3', 'Magazine Luiza', 'ecommerce', 2011, 5, 'Retail and online shopping'),
  stock('br', 'B3', 'WEG', 'industrials', 1971, 5, 'Electric motors and industrial equipment'),

  // Argentina, Colombia
  stock('ar', 'BYMA', 'YPF', 'oil', 1993, 5, 'Oil and gas'),
  stock('co', 'BVC', 'Ecopetrol', 'oil', 2007, 5, 'Oil and gas'),
]
