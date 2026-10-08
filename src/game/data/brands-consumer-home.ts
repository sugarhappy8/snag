// Real brands: home-market chains for countries the other consumer files cover thinly (Australia,
// Canada, New Zealand, Mexico, France, Britain, China, Thailand, Singapore, South Korea, Italy), so a
// life there meets its own market's supermarkets, burger counters and cafes first. Same row format as
// the other brands-consumer-*.ts files; footprints are home-market only unless stated. Nothing
// negative is written about any of them. A chain that really closed has `ended` (Hudson's Bay, 2025).
import type { Brand } from './brands'
import { C } from './brands-consumer-kit'

export const HOME_BRANDS: Brand[] = [
  // Australia
  C('hungry-jacks', "Hungry Jack's", 'fast-food', 1971, 'au', 'mass', 7, "Australian burger chain (Burger King's name in Australia)", { seg: 'burger', home: true }),
  C('red-rooster', 'Red Rooster', 'fast-food', 1972, 'au', 'mass', 5, 'Australian roast chicken chain', { seg: 'chicken', home: true }),
  C('oporto', 'Oporto', 'fast-food', 1986, 'au', 'mass', 4, 'Australian chicken and burger chain', { seg: 'chicken', home: true }),
  C('boost-juice', 'Boost Juice', 'coffee', 2000, 'au', 'mass', 5, 'Australian juice and smoothie bar chain', { seg: 'juice', home: true }),
  C('coles', 'Coles', 'supermarket', 1914, 'au', 'mass', 9, 'Australian supermarket chain', { home: true }),
  C('woolworths-au', 'Woolworths', 'supermarket', 1924, 'au', 'mass', 9, 'Australian supermarket chain', { home: true }),
  C('big-w', 'Big W', 'department-store', 1964, 'au', 'budget', 6, 'Australian discount department store chain', { seg: 'discount', home: true }),
  C('myer', 'Myer', 'department-store', 1900, 'au', 'mass', 6, 'Australian department store chain', { home: true }),
  C('david-jones', 'David Jones', 'department-store', 1838, 'au', 'premium', 5, 'Australian department store chain', { home: true }),
  C('jb-hi-fi', 'JB Hi-Fi', 'electronics-retail', 1974, 'au', 'mass', 6, 'Australian electronics and music retailer', { home: true }),
  C('harvey-norman', 'Harvey Norman', 'electronics-retail', 1982, 'au', 'mass', 6, 'Australian electrical and furniture retailer', { home: true }),
  C('chemist-warehouse', 'Chemist Warehouse', 'pharmacy', 1999, 'au', 'budget', 6, 'Australian discount pharmacy chain', { home: true }),
  C('foxtel', 'Foxtel', 'streaming', 1995, 'au', 'mass', 5, 'Australian pay-TV provider', { seg: 'tv', home: true }),
  C('stan', 'Stan', 'streaming', 2015, 'au', 'mass', 5, 'Australian video streaming service', { seg: 'video', home: true }),
  // Canada
  C('harveys', "Harvey's", 'fast-food', 1959, 'ca', 'mass', 4, 'Canadian burger chain', { seg: 'burger', home: true }),
  C('pizza-pizza', 'Pizza Pizza', 'fast-food', 1967, 'ca', 'mass', 5, 'Canadian pizza chain', { seg: 'pizza', home: true }),
  C('mary-browns', "Mary Brown's Chicken", 'fast-food', 1969, 'ca', 'mass', 4, 'Canadian fried chicken chain', { seg: 'chicken', home: true }),
  C('swiss-chalet', 'Swiss Chalet', 'restaurant', 1954, 'ca', 'mass', 5, 'Canadian rotisserie chicken restaurant chain', { home: true }),
  C('second-cup', 'Second Cup', 'coffee', 1975, 'ca', 'mass', 4, 'Canadian coffeehouse chain', { seg: 'coffeehouse', home: true }),
  C('loblaws', 'Loblaws', 'supermarket', 1919, 'ca', 'mass', 8, 'Canadian supermarket chain', { home: true }),
  C('sobeys', 'Sobeys', 'supermarket', 1907, 'ca', 'mass', 7, 'Canadian supermarket chain', { home: true }),
  C('save-on-foods', 'Save-On-Foods', 'supermarket', 1915, 'ca', 'mass', 5, 'Canadian supermarket chain from British Columbia', { home: true }),
  C('hudsons-bay', "Hudson's Bay", 'department-store', 1670, 'ca', 'mass', 7, 'Canadian department store chain, closed in 2025', { home: true, ended: 2025 }),
  C('cbc', 'CBC', 'streaming', 1936, 'ca', 'mass', 6, 'Canadian public broadcaster', { seg: 'tv', home: true, data: { drama: true } }),
  C('crave', 'Crave', 'streaming', 2014, 'ca', 'mass', 5, 'Canadian video streaming service', { seg: 'video', home: true }),
  // New Zealand
  C('burgerfuel', 'BurgerFuel', 'fast-food', 1995, 'nz', 'mass', 4, 'New Zealand gourmet burger chain', { seg: 'burger', home: true }),
  C('hell-pizza', 'Hell Pizza', 'fast-food', 1996, 'nz', 'mass', 4, 'New Zealand pizza chain', { seg: 'pizza', home: true }),
  C('new-world', 'New World', 'supermarket', 1963, 'nz', 'mass', 7, 'New Zealand supermarket chain', { home: true }),
  C('paknsave', "PAK'nSAVE", 'supermarket', 1985, 'nz', 'budget', 7, 'New Zealand discount supermarket chain', { home: true }),
  C('the-warehouse', 'The Warehouse', 'department-store', 1982, 'nz', 'budget', 7, 'New Zealand discount department store chain', { seg: 'discount', home: true }),
  // Mexico
  C('telmex', 'Telmex', 'telecom', 1947, 'mx', 'mass', 8, 'Mexican telephone company', { home: true }),
  C('bimbo', 'Bimbo', 'snack', 1945, 'mx', 'mass', 8, 'Mexican bakery and snack brand', { home: true }),
  C('sabritas', 'Sabritas', 'snack', 1943, 'mx', 'mass', 6, 'Mexican potato chip brand', { home: true }),
  C('jarritos', 'Jarritos', 'soft-drink', 1950, 'mx', 'mass', 6, 'Mexican fruit soda', { home: true }),
  // France
  C('paul', 'Paul', 'coffee', 1889, 'fr', 'mass', 6, 'French bakery and cafe chain', { seg: 'bakery', home: true }),
  C('brioche-doree', 'Brioche Dorée', 'coffee', 1976, 'fr', 'mass', 4, 'French bakery and cafe chain', { seg: 'bakery', home: true }),
  C('flunch', 'Flunch', 'fast-food', 1971, 'fr', 'budget', 4, 'French self-service restaurant chain', { seg: 'cafeteria', home: true }),
  C('buffalo-grill', 'Buffalo Grill', 'restaurant', 1980, 'fr', 'mass', 4, 'French steakhouse chain', { home: true }),
  C('hippopotamus', 'Hippopotamus', 'restaurant', 1968, 'fr', 'mass', 4, 'French steakhouse chain', { home: true }),
  // Britain
  C('itsu', 'itsu', 'fast-food', 1997, 'gb', 'mass', 4, 'British Asian-inspired fast food chain', { seg: 'asian', home: true }),
  C('prezzo', 'Prezzo', 'restaurant', 1996, 'gb', 'mass', 4, 'British Italian restaurant chain', { home: true }),
  C('poundland', 'Poundland', 'department-store', 1990, 'gb', 'budget', 6, 'British discount variety store chain', { seg: 'discount', home: true }),
  C('b-and-m', 'B&M', 'department-store', 1978, 'gb', 'budget', 5, 'British discount variety store chain', { seg: 'discount', home: true }),
  C('ocado', 'Ocado', 'supermarket', 2000, 'gb', 'mass', 5, 'British online supermarket', { seg: 'online', home: true }),
  // China
  C('hema', 'Hema', 'supermarket', 2015, 'cn', 'premium', 5, 'Chinese fresh grocery chain (Freshippo)', { home: true }),
  // Thailand
  C('the-pizza-company', 'The Pizza Company', 'fast-food', 1984, 'th', 'mass', 5, 'Thai pizza chain', { seg: 'pizza', home: true }),
  C('black-canyon', 'Black Canyon Coffee', 'coffee', 1993, 'th', 'mass', 4, 'Thai coffee shop chain', { seg: 'coffeehouse', home: true }),
  C('after-you', 'After You', 'coffee', 2007, 'th', 'mass', 4, 'Thai dessert cafe chain', { seg: 'dessert', home: true }),
  // Singapore
  C('old-chang-kee', 'Old Chang Kee', 'fast-food', 1956, 'sg', 'budget', 4, 'Singaporean curry puff snack chain', { seg: 'snack', home: true }),
  C('toast-box', 'Toast Box', 'coffee', 2005, 'sg', 'mass', 4, 'Singaporean kopitiam cafe chain', { seg: 'kopitiam', home: true }),
  C('killiney-kopitiam', 'Killiney Kopitiam', 'coffee', 1919, 'sg', 'mass', 4, 'Singaporean kopitiam cafe chain', { seg: 'kopitiam', home: true }),
  // South Korea
  C('samsung-life', 'Samsung Life', 'insurer', 1957, 'kr', 'mass', 7, 'Korean life insurer', { home: true }),
  C('kyobo-life', 'Kyobo Life', 'insurer', 1958, 'kr', 'mass', 6, 'Korean life insurer', { home: true }),
  C('hanwha-life', 'Hanwha Life', 'insurer', 1946, 'kr', 'mass', 6, 'Korean life insurer', { home: true }),
  C('samsung-fire', 'Samsung Fire & Marine', 'insurer', 1952, 'kr', 'mass', 6, 'Korean general insurer', { home: true }),
  // Italy
  C('autogrill', 'Autogrill', 'fast-food', 1977, 'it', 'mass', 5, 'Italian motorway rest stop and travel food chain', { seg: 'cafeteria', home: true }),
  C('lavazza', 'Lavazza', 'coffee', 1895, 'it', 'mass', 6, 'Italian coffee roaster and cafes', { seg: 'roaster', home: true }),
  C('illy', 'illy', 'coffee', 1933, 'it', 'premium', 5, 'Italian coffee roaster and cafes', { seg: 'roaster', home: true }),
]
