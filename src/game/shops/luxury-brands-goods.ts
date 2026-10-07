// Product lines of the things you wear and carry: watches, handbags and leather goods, clothes,
// eyewear, jewelry, pens and fine goods, designer sneakers and luxury electronics. Every line is
// a real product family of a real brand with the year it first went on sale (and the year it was
// retired, where it was). `usd` is a rough price today in constant 2026 dollars for a typical
// example; the shops scale it for the year, the country and the configuration. Approximate on
// purpose: the game labels these prices as approximate.
import { lineMaker, type LuxLine } from './luxury-brands-types'

const w = lineMaker('watch')
const h = lineMaker('handbag')
const f = lineMaker('fashion')
const e = lineMaker('eyewear')
const l = lineMaker('luggage')
const j = lineMaker('jewelry')
const p = lineMaker('pen')
const fi = lineMaker('fine')
const s = lineMaker('sneakers')
const t = lineMaker('tech')

const METALS: [string, number][] = [
  ['Steel', 1],
  ['Two-tone', 1.4],
  ['Yellow gold', 3.6],
]
const CASES: [string, number][] = [
  ['Steel', 1],
  ['Rose gold', 2.2],
]

export const WATCH_LINES: LuxLine[] = [
  // Affordable premium
  w('swatch', 'original', 'Swatch', 1983, 120, { cls: 'budget-watch', blurb: 'Plastic, colorful and everywhere in the eighties.' }),
  w('seiko', '5-sports', 'Seiko 5 Sports', 1963, 300, { cls: 'budget-watch' }),
  w('seiko', 'prospex-diver', 'Prospex Diver', 1965, 650, { cls: 'budget-watch', blurb: 'The line that began with the first Seiko diver in 1965.' }),
  w('citizen', 'eco-drive', 'Eco-Drive', 1995, 350, { cls: 'budget-watch', blurb: 'Powered by any light.' }),
  w('bulova', 'accutron', 'Accutron', 1960, 800, { cls: 'budget-watch', blurb: 'Tuning-fork timekeeping from 1960.' }),
  w('tissot', 'prx', 'PRX', 1978, 450, { cls: 'budget-watch' }),
  w('hamilton', 'ventura', 'Ventura', 1957, 1100, { cls: 'watch', blurb: 'The first battery-powered electric wristwatch.' }),
  w('longines', 'conquest', 'Conquest', 1954, 1800),
  w('longines', 'hydroconquest', 'HydroConquest', 2007, 1500),
  w('tag-heuer', 'carrera', 'Carrera', 1963, 3500),
  w('tag-heuer', 'monaco', 'Monaco', 1969, 7000, { blurb: 'A square chronograph with an automatic movement.' }),
  w('tag-heuer', 'aquaracer', 'Aquaracer', 2004, 3000),
  w('tudor', 'black-bay', 'Black Bay', 2012, 4200),
  w('grand-seiko', 'heritage', 'Heritage Collection', 1960, 5800, { blurb: 'Hand-finished Japanese precision.' }),
  w('grand-seiko', 'spring-drive', 'Spring Drive', 2004, 9500),
  // Luxury
  w('omega', 'seamaster', 'Seamaster', 1948, 5800, { variants: [['Steel', 1], ['Steel and gold', 1.5]] }),
  w('omega', 'speedmaster', 'Speedmaster', 1957, 7000, { blurb: 'The chronograph that went to the Moon.', variants: [['Steel', 1], ['Moonwatch Sapphire', 1.25]] }),
  w('omega', 'constellation', 'Constellation', 1952, 6500),
  w('omega', 'de-ville', 'De Ville', 1960, 4500),
  w('omega', 'planet-ocean', 'Planet Ocean', 2005, 6500),
  w('breitling', 'navitimer', 'Navitimer', 1952, 9000, { blurb: 'The pilot’s slide-rule chronograph.' }),
  w('breitling', 'superocean', 'Superocean', 1957, 5500),
  w('breitling', 'chronomat', 'Chronomat', 1984, 6500),
  w('iwc', 'pilot', 'Pilot’s Watch', 1936, 6500),
  w('iwc', 'portugieser', 'Portugieser', 1939, 13000),
  w('iwc', 'portofino', 'Portofino', 1984, 6500),
  w('jaeger-lecoultre', 'reverso', 'Reverso', 1931, 8000, { blurb: 'The case flips over to protect the dial.', variants: [['Steel', 1], ['Rose gold', 2.1]] }),
  w('panerai', 'luminor', 'Luminor', 1993, 8500, { blurb: 'A big, glowing Italian diver.' }),
  w('panerai', 'radiomir', 'Radiomir', 1993, 9000),
  w('hublot', 'big-bang', 'Big Bang', 2005, 17000, { variants: [['Steel', 1], ['Ceramic', 1.3], ['Gold', 2.8]] }),
  w('zenith', 'el-primero', 'El Primero', 1969, 9000, { blurb: 'One of the first automatic chronograph movements.' }),
  w('blancpain', 'fifty-fathoms', 'Fifty Fathoms', 1953, 16000),
  w('breguet', 'tradition', 'Tradition', 2005, 18000),
  w('cartier', 'tank', 'Tank', 1919, 4900, { variants: [['Steel', 1], ['Yellow gold', 3.2]], blurb: 'Rectangular, calm and unmistakable since 1917.' }),
  w('cartier', 'santos', 'Santos', 1911, 7800, { variants: [['Steel', 1], ['Two-tone', 1.5]] }),
  w('cartier', 'ballon-bleu', 'Ballon Bleu', 2007, 6800),
  w('cartier', 'panthere', 'Panthère', 1983, 4600),
  w('piaget', 'altiplano', 'Altiplano', 1957, 18000, { blurb: 'Among the thinnest watches in the world.' }),
  w('chopard', 'happy-diamonds', 'Happy Diamonds', 1976, 9000, { blurb: 'Diamonds that move freely between two crystals.' }),
  w('vacheron-constantin', 'overseas', 'Overseas', 1996, 32000, { scarce: 2018 }),
  w('vacheron-constantin', 'patrimony', 'Patrimony', 2004, 25000),
  w('a-lange-sohne', 'lange-1', 'Lange 1', 1994, 45000, { blurb: 'The off-center dial that relaunched Glashütte.' }),
  w('a-lange-sohne', 'saxonia', 'Saxonia', 1994, 26000),
  // The Rolex catalog
  w('rolex', 'oyster', 'Oyster', 1926, 6000, { cls: 'icon-watch', blurb: 'The first waterproof wristwatch case.' }),
  w('rolex', 'datejust', 'Datejust', 1945, 9500, { cls: 'icon-watch', variants: METALS }),
  w('rolex', 'day-date', 'Day-Date', 1956, 38000, { cls: 'icon-watch', blurb: 'Only ever in precious metal.' }),
  w('rolex', 'submariner', 'Submariner', 1953, 10500, { cls: 'icon-watch', scarce: 2008, variants: METALS, blurb: 'The diver every other diver is compared with.' }),
  w('rolex', 'gmt-master', 'GMT-Master II', 1954, 11000, { cls: 'icon-watch', scarce: 2010, variants: METALS }),
  w('rolex', 'daytona', 'Cosmograph Daytona', 1963, 16000, { cls: 'icon-watch', scarce: 2000, variants: METALS }),
  w('rolex', 'explorer', 'Explorer', 1953, 8500, { cls: 'icon-watch' }),
  w('rolex', 'sea-dweller', 'Sea-Dweller', 1967, 14500, { cls: 'icon-watch' }),
  w('rolex', 'air-king', 'Air-King', 1945, 7500, { cls: 'icon-watch' }),
  // Ultra
  w('audemars-piguet', 'royal-oak', 'Royal Oak', 1972, 32000, { cls: 'icon-watch', scarce: 2012, variants: CASES, blurb: 'The luxury steel sports watch that started a genre.' }),
  w('audemars-piguet', 'royal-oak-offshore', 'Royal Oak Offshore', 1993, 36000, { cls: 'icon-watch' }),
  w('patek-philippe', 'calatrava', 'Calatrava', 1932, 32000, { cls: 'icon-watch', variants: [['Rose gold', 1], ['Platinum', 2]] }),
  w('patek-philippe', 'nautilus', 'Nautilus', 1976, 52000, { cls: 'icon-watch', scarce: 2010, variants: CASES }),
  w('patek-philippe', 'aquanaut', 'Aquanaut', 1997, 38000, { cls: 'icon-watch', scarce: 2012 }),
  w('patek-philippe', 'perpetual-calendar', 'Perpetual Calendar', 1941, 95000, { cls: 'icon-watch', blurb: 'It will not need adjusting until the year 2100.' }),
  w('richard-mille', 'rm-011', 'RM 011', 2007, 210000, { cls: 'icon-watch', scarce: 2012, blurb: 'A racing-car engine for the wrist.' }),
]

export const BAG_LINES: LuxLine[] = [
  h('longchamp', 'le-pliage', 'Le Pliage', 1993, 190, { cls: 'fashion' }),
  h('coach', 'tabby', 'Tabby', 2017, 450, { cls: 'fashion' }),
  h('coach', 'swagger', 'Coach Classic', 1941, 400, { cls: 'fashion', blurb: 'Leather bags in the New York workshop tradition.' }),
  h('mulberry', 'bayswater', 'Bayswater', 2003, 1600),
  h('goyard', 'saint-louis', 'Saint Louis Tote', 1892, 1700, { blurb: 'Hand-painted chevrons on coated canvas.' }),
  h('louis-vuitton', 'speedy', 'Speedy', 1930, 1900, { blurb: 'The monogram doctor’s-bag shape.', variants: [['25', 0.95], ['30', 1], ['35', 1.1]] }),
  h('louis-vuitton', 'keepall', 'Keepall', 1930, 2300, { blurb: 'The soft travel bag.' }),
  h('louis-vuitton', 'noe', 'Noé', 1932, 2200, { blurb: 'Designed to carry champagne bottles.' }),
  h('louis-vuitton', 'alma', 'Alma', 1992, 2000),
  h('louis-vuitton', 'neverfull', 'Neverfull', 2007, 2100),
  h('louis-vuitton', 'capucines', 'Capucines', 2013, 6500, { cls: 'icon-bag' }),
  h('louis-vuitton', 'wardrobe-trunk', 'Wardrobe Trunk', 1875, 24000, { cls: 'icon-bag', blurb: 'A closet that travels by steamship.' }),
  h('goyard', 'trunk', 'Goyard Trunk', 1900, 12000, { cls: 'icon-bag' }),
  h('gucci', 'bamboo', 'Bamboo Handle', 1947, 3500),
  h('gucci', 'horsebit-1955', 'Horsebit 1955', 1955, 2800),
  h('gucci', 'jackie-1961', 'Jackie 1961', 1961, 3200),
  h('gucci', 'dionysus', 'Dionysus', 2015, 3000),
  h('gucci', 'marmont', 'GG Marmont', 2016, 2500),
  h('prada', 'nylon-backpack', 'Nylon Backpack', 1984, 1700, { blurb: 'Industrial nylon turned into a luxury statement.' }),
  h('prada', 'galleria', 'Galleria', 2007, 3800),
  h('prada', 're-edition', 'Re-Edition 2005', 2018, 1500),
  h('dior', 'lady-dior', 'Lady Dior', 1995, 6500, { cls: 'icon-bag', variants: [['Mini', 0.8], ['Medium', 1], ['Large', 1.15]] }),
  h('dior', 'saddle', 'Saddle', 1999, 4600),
  h('dior', 'book-tote', 'Book Tote', 2018, 3300),
  h('fendi', 'baguette', 'Baguette', 1997, 3800),
  h('fendi', 'peekaboo', 'Peekaboo', 2009, 5500),
  h('saint-laurent', 'loulou', 'Loulou', 2017, 3000),
  h('bottega-veneta', 'cassette', 'Cassette', 2019, 3800),
  h('bottega-veneta', 'jodie', 'Jodie', 2019, 3600),
  h('celine', 'luggage', 'Luggage Tote', 2010, 3600),
  h('celine', 'triomphe', 'Triomphe', 2018, 3300),
  h('loewe', 'puzzle', 'Puzzle', 2014, 3300),
  h('balenciaga', 'city', 'City', 2001, 2700),
  h('chanel', '2-55', '2.55 Flap', 1955, 8800, { cls: 'icon-bag', blurb: 'Quilted, with the chain strap that frees the hands.' }),
  h('chanel', 'classic-flap', 'Classic Flap', 1983, 10800, { cls: 'icon-bag', scarce: 2019, variants: [['Medium', 1], ['Jumbo', 1.1]] }),
  h('chanel', 'boy', 'Boy', 2011, 6500),
  h('chanel', '19', 'Chanel 19', 2019, 6000),
  h('hermes', 'evelyne', 'Evelyne', 1978, 3500, { cls: 'icon-bag' }),
  h('hermes', 'kelly', 'Kelly', 1956, 11500, { cls: 'icon-bag', scarce: 1995, variants: [['28', 0.95], ['32', 1], ['Exotic leather', 4.5]] }),
  h('hermes', 'constance', 'Constance', 1959, 10500, { cls: 'icon-bag', scarce: 2005 }),
  h('hermes', 'birkin', 'Birkin', 1984, 12500, { cls: 'icon-bag', scarce: 1995, variants: [['25', 0.95], ['30', 1], ['35', 1.05], ['Exotic leather', 5]], blurb: 'The bag with a waiting list.' }),
  l('rimowa', 'topas', 'Topas Aluminium Suitcase', 1950, 1700, { cls: 'bag', blurb: 'Grooved aluminium that gets better with scratches.' }),
  l('tumi', 'alpha', 'Alpha Briefcase', 1975, 650, { cls: 'bag' }),
]

export const FASHION_LINES: LuxLine[] = [
  f('lacoste', 'polo', 'L.12.12 Polo', 1933, 120),
  f('ralph-lauren', 'polo', 'Polo Shirt', 1972, 140),
  f('hermes', 'carre', 'Silk Carré', 1937, 470, { blurb: 'A scarf with its own hand-rolled edges.' }),
  f('burberry', 'trench', 'Trench Coat', 1914, 2500, { blurb: 'Built for the First World War trenches.' }),
  f('gucci', 'loafer', 'Horsebit Loafer', 1953, 1050),
  f('moncler', 'down-jacket', 'Down Jacket', 1952, 1500),
  f('armani', 'power-suit', 'Tailored Suit', 1975, 3500, { blurb: 'The soft-shouldered suit of the boardroom.' }),
  f('zegna', 'suit', 'Tailored Suit', 1910, 2600),
  f('loro-piana', 'cashmere', 'Cashmere Sweater', 1924, 1600),
  f('max-mara', '101801', '101801 Coat', 1981, 2500, { blurb: 'A camel-hair coat that does not go out of style.' }),
  f('dior', 'bar-jacket', 'Bar Jacket', 1947, 4800, { blurb: 'The cinched waist of the New Look.' }),
  f('chanel', 'tweed-suit', 'Tweed Suit', 1954, 7500),
  f('saint-laurent', 'le-smoking', 'Le Smoking Tuxedo', 1966, 5500),
  f('valentino', 'red-gown', 'Valentino Red Gown', 1959, 9000, { blurb: 'A red that became a trademark.' }),
  f('versace', 'silk-shirt', 'Printed Silk Shirt', 1978, 1100),
  f('maison-margiela', 'tabi', 'Tabi Boots', 1988, 1200),
  f('alexander-mcqueen', 'tailoring', 'Tailored Jacket', 1992, 2900),
]

export const EYEWEAR_LINES: LuxLine[] = [
  e('ray-ban', 'aviator', 'Aviator', 1937, 180, { blurb: 'Made for pilots, worn by everyone.' }),
  e('ray-ban', 'wayfarer', 'Wayfarer', 1952, 170),
  e('persol', '714', '714 Folding', 1957, 390),
  e('oakley', 'frogskins', 'Frogskins', 1985, 140),
]

export const JEWELRY_LINES: LuxLine[] = [
  j('swarovski', 'crystal-necklace', 'Crystal Necklace', 1895, 150),
  j('pandora', 'moments', 'Moments Charm Bracelet', 2000, 160),
  j('david-yurman', 'cable', 'Cable Bracelet', 1983, 750),
  j('georg-jensen', 'silver-bangle', 'Silver Bangle', 1904, 600),
  j('cartier', 'trinity', 'Trinity Ring', 1924, 1900, { blurb: 'Three bands of gold, three colors.' }),
  j('cartier', 'love-bracelet', 'Love Bracelet', 1969, 8000, { blurb: 'It locks on with a screwdriver.' }),
  j('cartier', 'juste-un-clou', 'Juste un Clou', 1970, 8500),
  j('cartier', 'panthere-ring', 'Panthère Ring', 1914, 7500),
  j('tiffany-co', 'tiffany-setting', 'Tiffany Setting Ring', 1886, 6500, { variants: [['0.5 ct', 0.5], ['1 ct', 1], ['2 ct', 3.4]], blurb: 'Six prongs lifting the diamond toward the light.' }),
  j('van-cleef-arpels', 'alhambra', 'Alhambra Necklace', 1968, 4900, { blurb: 'Four-leaf clover motifs in gold.' }),
  j('bulgari', 'b-zero1', 'B.zero1 Ring', 1999, 4500),
  j('bulgari', 'serpenti', 'Serpenti Bracelet', 1948, 15000),
  j('boucheron', 'quatre', 'Quatre Ring', 2004, 3200),
  j('mikimoto', 'pearl-strand', 'Cultured Pearl Strand', 1893, 8500),
  j('harry-winston', 'solitaire', 'Diamond Solitaire', 1932, 55000),
  j('graff', 'solitaire', 'Graff Diamond Solitaire', 1960, 120000),
  j('harry-winston', 'necklace', 'Diamond Necklace', 1932, 400000, { blurb: 'The kind of necklace that has its own security guard.' }),
]

export const PEN_LINES: LuxLine[] = [
  p('lamy', '2000', 'Lamy 2000', 1966, 200),
  p('cross', 'century', 'Century', 1946, 100),
  p('parker', 'duofold', 'Duofold', 1921, 550, { blurb: 'The bright red pen with the 25-year nib guarantee.' }),
  p('parker', '51', 'Parker 51', 1941, 450),
  p('pelikan', 'souveran', 'Souverän M800', 1987, 650),
  p('montblanc', 'meisterstuck', 'Meisterstück 149', 1924, 1000, { blurb: 'A white star on a black pen.' }),
  fi('wedgwood', 'jasperware', 'Jasperware Vase', 1775, 900),
  fi('meissen', 'blue-onion', 'Blue Onion Dinner Service', 1739, 3500),
  fi('baccarat', 'harcourt', 'Harcourt Glasses', 1841, 1200),
  fi('christofle', 'flatware', 'Silver Flatware Set', 1830, 4500),
  fi('lalique', 'bacchantes', 'Bacchantes Vase', 1927, 6000, { cls: 'fine', blurb: 'Frosted crystal dancers.' }),
]

export const SNEAKER_LINES: LuxLine[] = [
  s('converse', 'all-star', 'Chuck Taylor All Star', 1917, 70),
  s('adidas', 'samba', 'Samba', 1950, 100),
  s('adidas', 'gazelle', 'Gazelle', 1966, 100),
  s('adidas', 'superstar', 'Superstar', 1969, 100),
  s('puma', 'suede', 'Suede', 1968, 90),
  s('vans', 'old-skool', 'Old Skool', 1977, 70),
  s('nike', 'air-force-1', 'Air Force 1', 1982, 120),
  s('reebok', 'classic-leather', 'Classic Leather', 1983, 90),
  s('new-balance', '990', '990', 1982, 185),
  s('nike', 'dunk', 'Dunk', 1985, 120, { cls: 'sneaker' }),
  s('nike', 'air-jordan-1', 'Air Jordan 1 Retro High OG', 1985, 180, { cls: 'grail-sneaker', scarce: 2000, blurb: 'The colorway you have to line up for.' }),
  s('nike', 'air-max-1', 'Air Max 1', 1987, 150),
  s('reebok', 'pump', 'The Pump', 1989, 190),
  s('asics', 'gel-kayano', 'Gel-Kayano', 1993, 160),
  s('golden-goose', 'super-star', 'Super-Star', 2000, 530, { tier: 'boutique' }),
  s('gucci', 'ace', 'Ace', 2016, 750, { tier: 'boutique' }),
  s('balenciaga', 'triple-s', 'Triple S', 2017, 1100, { tier: 'boutique' }),
  s('louis-vuitton', 'trainer', 'Trainer', 2018, 1400, { tier: 'boutique' }),
]

export const TECH_LINES: LuxLine[] = [
  t('leica', 'i', 'Leica I', 1925, 3500, { cls: 'fine', blurb: 'The small camera that changed photography.' }),
  t('leica', 'm3', 'M3', 1954, 6000, { cls: 'fine' }),
  t('leica', 'm6', 'M6', 1984, 5000, { cls: 'fine' }),
  t('leica', 'q', 'Q', 2015, 5000, { tech: 'internet' }),
  t('leica', 'm10', 'M10', 2017, 8000, { tech: 'internet' }),
  t('hasselblad', '500c', '500C', 1957, 6000, { cls: 'fine' }),
  t('hasselblad', 'x1d', 'X1D', 2016, 9000, { tech: 'internet' }),
  t('mcintosh', 'mc275', 'MC275 Amplifier', 1961, 8000, { cls: 'fine', tech: 'radio' }),
  t('bang-olufsen', 'beolab-5', 'BeoLab 5 Loudspeakers', 2002, 17000),
  t('bang-olufsen', 'beovision-avant', 'BeoVision Avant', 2007, 12000, { tech: 'tv' }),
  t('vertu', 'signature', 'Signature', 2002, 18000, { until: 2017, tech: 'mobilePhone', blurb: 'A luxury phone in a titanium case with a sapphire screen.' }),
  t('vertu', 'signature-touch', 'Signature Touch', 2013, 9000, { until: 2017, tech: 'smartphone' }),
]

/** Everything you wear, carry or put on a shelf. */
export const GOODS_LINES: LuxLine[] = [...WATCH_LINES, ...BAG_LINES, ...FASHION_LINES, ...EYEWEAR_LINES, ...JEWELRY_LINES, ...PEN_LINES, ...SNEAKER_LINES, ...TECH_LINES]

