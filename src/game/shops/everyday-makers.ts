// Real makers for the everyday stores' catalogs (shops/everyday-data.ts): which brands make a
// "Road Bike", a "Gas BBQ Grill" or a "Graphic Hoodie". A listing is named after one maker that
// traded in your country and year ("Trek Road Bike"); items with no well-known maker stay generic
// (a Persian rug is not a brand). Keys are `${store}:${itemKey}`.
import { brandById, type GadgetSpec } from './everyday-brands'

const BIKE_ALL = ['trek', 'specialized', 'giant-bicycles', 'cannondale', 'schwinn', 'huffy', 'raleigh', 'bianchi', 'merida', 'cube', 'scott-sports', 'canyon', 'btwin', 'hero-cycles', 'atlas-cycles', 'avon-cycles', 'flying-pigeon', 'phoenix-bicycles', 'caloi', 'monark', 'gazelle', 'batavus', 'polygon-bikes', 'wim-cycle', 'pashley']
const BIKE_BUDGET = ['huffy', 'schwinn', 'mongoose', 'btwin', 'hero-cycles', 'atlas-cycles', 'avon-cycles', 'flying-pigeon', 'phoenix-bicycles', 'caloi', 'monark', 'raleigh', 'giant-bicycles', 'polygon-bikes', 'wim-cycle']
const BIKE_PRO = ['trek', 'specialized', 'giant-bicycles', 'cannondale', 'bianchi', 'pinarello', 'canyon', 'cube', 'scott-sports', 'merida']
const BIKE_CITY = ['gazelle', 'batavus', 'raleigh', 'pashley', 'hero-cycles', 'atlas-cycles', 'flying-pigeon', 'phoenix-bicycles', 'bridgestone-cycle', 'panasonic-cycle', 'giant-bicycles', 'schwinn']
const BALLS_SOCCER = ['adidas', 'nike', 'puma', 'mitre', 'molten-balls']

const prefix = (ids: readonly string[]): GadgetSpec => ({ ids, mode: 'prefix' })

export const ITEM_MAKERS: Record<string, GadgetSpec> = {
  // Bikes
  'bike:balance': prefix(['trek', 'specialized', 'giant-bicycles', 'btwin']),
  'bike:training': prefix(BIKE_BUDGET),
  'bike:bmx': prefix(['mongoose', 'schwinn', 'huffy']),
  'bike:cruiser': prefix(['schwinn', 'huffy', 'raleigh', 'giant-bicycles']),
  'bike:city': prefix(BIKE_CITY),
  'bike:folding': prefix(['brompton', 'btwin']),
  'bike:hybrid': prefix(['trek', 'giant-bicycles', 'specialized', 'raleigh', 'cube', 'merida', 'btwin']),
  'bike:road': prefix(BIKE_PRO),
  'bike:carbon': prefix(['trek', 'specialized', 'cannondale', 'bianchi', 'pinarello', 'canyon', 'scott-sports']),
  'bike:hardtail': prefix(BIKE_ALL),
  'bike:fullsus': prefix(['trek', 'specialized', 'giant-bicycles', 'cannondale', 'canyon', 'cube', 'scott-sports', 'merida']),
  'bike:gravel': prefix(['canyon', 'trek', 'specialized', 'cannondale', 'giant-bicycles', 'cube', 'bianchi']),
  'bike:ebike': prefix(['gazelle', 'giant-bicycles', 'trek', 'specialized', 'cube', 'batavus', 'canyon']),
  'bike:emtb': prefix(['specialized', 'trek', 'giant-bicycles', 'cube', 'canyon', 'scott-sports', 'merida']),
  'bike:cargo': prefix(['gazelle', 'batavus', 'cube']),
  'bike:tandem': prefix(['trek', 'raleigh', 'schwinn', 'giant-bicycles']),
  'bike:dutch': prefix(['gazelle', 'batavus']),
  'bike:mamachari': prefix(['bridgestone-cycle', 'panasonic-cycle']),
  'bike:roadster': prefix(['raleigh', 'hero-cycles', 'atlas-cycles', 'flying-pigeon', 'phoenix-bicycles', 'pashley']),
  // Sporting goods
  'sports:treadmill': prefix(['nordictrack', 'life-fitness', 'bowflex']),
  'sports:rower': prefix(['concept2']),
  'sports:spinbike': prefix(['peloton', 'nordictrack', 'bowflex']),
  'sports:homegym': prefix(['bowflex', 'life-fitness', 'nordictrack']),
  'sports:dumbbells': prefix(['bowflex']),
  'sports:yoga': prefix(['manduka', 'lululemon']),
  'sports:bag': prefix(['everlast']),
  'sports:golf': prefix(['callaway-golf', 'taylormade', 'titleist']),
  'sports:skis': prefix(['rossignol', 'head-sports', 'atomic-skis', 'k2-sports', 'salomon']),
  'sports:snowboard': prefix(['burton', 'k2-sports']),
  'sports:tennis': prefix(['wilson-sporting-goods', 'babolat', 'head-sports', 'yonex']),
  'sports:badminton': prefix(['yonex']),
  'sports:rod': prefix(['shimano', 'daiwa']),
  'sports:camping': prefix(['coleman', 'the-north-face', 'decathlon-quechua']),
  'sports:baseball': prefix(['rawlings', 'louisville-slugger', 'mizuno', 'wilson-sporting-goods']),
  'sports:soccer': prefix(BALLS_SOCCER),
  'sports:hoop': prefix(['spalding', 'wilson-sporting-goods']),
  'sports:hockey': prefix(['bauer-hockey', 'ccm']),
  'sports:rugby': prefix(['gilbert-rugby']),
  'sports:inline': prefix(['rollerblade']),
  'sports:climb': prefix(['black-diamond', 'petzl']),
  // Furniture and home
  'furniture:sofa': prefix(['ikea', 'ashley-furniture', 'la-z-boy', 'ethan-allen', 'crate-and-barrel', 'west-elm', 'conforama', 'nitori']),
  'furniture:sectional': prefix(['ikea', 'ashley-furniture', 'west-elm', 'la-z-boy', 'crate-and-barrel']),
  'furniture:bed': prefix(['tempur-pedic', 'sealy', 'serta', 'simmons-beautyrest', 'sleep-number', 'casper', 'dunlopillo', 'kurlon', 'sleepwell', 'hastens']),
  'furniture:dining': prefix(['ikea', 'ashley-furniture', 'ethan-allen', 'maisons-du-monde', 'xxxlutz']),
  'furniture:bookshelf': prefix(['ikea', 'muji', 'nitori']),
  'furniture:smarthome': prefix(['google-nest', 'amazon-echo', 'philips']),
  'furniture:theater': prefix(['sony', 'samsung-electronics', 'lg-electronics', 'bose', 'sonos', 'panasonic']),
  'furniture:desk': prefix(['ikea', 'herman-miller', 'secretlab', 'steelcase']),
  'furniture:recliner': prefix(['la-z-boy', 'ashley-furniture']),
  'furniture:beanbag': prefix(['ikea']),
  // Clothing
  'clothing:thriftjeans': prefix(['levis', 'wrangler']),
  'clothing:hoodie': prefix(['champion', 'nike', 'adidas', 'puma', 'gap', 'uniqlo', 'hm']),
  'clothing:jeans': prefix(['levis', 'wrangler', 'gap', 'uniqlo', 'zara']),
  'clothing:sundress': prefix(['zara', 'hm', 'mango', 'uniqlo']),
  'clothing:chinos': prefix(['gap', 'uniqlo', 'ralph-lauren', 'lacoste']),
  'clothing:puffer': prefix(['the-north-face', 'columbia-sportswear', 'patagonia', 'uniqlo', 'moncler']),
  'clothing:sneakers': prefix(['converse', 'vans', 'nike', 'adidas', 'puma', 'new-balance', 'reebok']),
  'clothing:tracksuit': prefix(['adidas', 'puma', 'fila', 'kappa', 'nike', 'champion']),
  'clothing:swim': prefix(['speedo', 'arena-swim']),
  'clothing:overcoat': prefix(['zara', 'hm', 'uniqlo', 'burberry']),
  'clothing:blazer': prefix(['zara', 'hm', 'mango', 'ralph-lauren']),
  'clothing:boots': prefix(['timberland', 'dr-martens']),
  'clothing:runners': prefix(['nike', 'adidas', 'asics', 'hoka', 'new-balance', 'puma']),
  'clothing:raincoat': prefix(['columbia-sportswear', 'the-north-face', 'patagonia', 'uniqlo']),
  'clothing:flipflops': prefix(['havaianas', 'crocs']),
  'clothing:football': prefix(['adidas', 'nike', 'puma', 'umbro', 'kappa']),
  'clothing:djeans': prefix(['versace', 'dolce-gabbana', 'armani', 'saint-laurent', 'balenciaga']),
  'clothing:dhoodie': prefix(['gucci', 'balenciaga', 'dior', 'fendi', 'versace', 'givenchy']),
  'clothing:dsneakers': prefix(['golden-goose', 'gucci', 'balenciaga', 'dior', 'prada']),
  'clothing:dcoat': prefix(['burberry', 'max-mara', 'moncler', 'prada', 'armani', 'loro-piana']),
  'clothing:cashmere': prefix(['uniqlo', 'loro-piana', 'ralph-lauren']),
  'clothing:loafers': prefix(['gucci', 'prada', 'bata']),
  // Toys
  'toy:bricks': prefix(['lego']),
  'toy:castle': prefix(['lego']),
  'toy:dinos': prefix(['schleich']),
  'toy:train': prefix(['brio', 'hornby']),
  'toy:dollhouse': prefix(['barbie', 'sylvanian-families', 'playmobil']),
  'toy:rccar': prefix(['hot-wheels', 'tomy']),
  'toy:figure': prefix(['hasbro', 'bandai', 'mattel', 'playmobil']),
  'toy:boardgame': prefix(['monopoly', 'hasbro', 'ravensburger']),
  'toy:puzzle': prefix(['ravensburger']),
  'toy:blaster': prefix(['super-soaker', 'nerf']),
  'toy:art': prefix(['crayola', 'faber-castell']),
  'toy:cards': prefix(['pokemon-cards', 'magic-the-gathering', 'yu-gi-oh', 'topps', 'panini']),
  'toy:teddy': prefix(['steiff']),
  'toy:handheld': { category: 'console', segment: 'handheld', mode: 'model', suffix: 'Handheld Console' },
  'toy:console': { category: 'console', segment: 'home', mode: 'model', suffix: 'Console' },
  // Garden and hardware
  'garden:toolkit': prefix(['stanley-tools', 'black-and-decker', 'bosch-tools']),
  'garden:drill': prefix(['dewalt', 'makita', 'bosch-tools', 'black-and-decker', 'milwaukee-tool']),
  'garden:washer': prefix(['karcher', 'black-and-decker', 'bosch-tools']),
  'garden:grill': prefix(['weber-grills', 'traeger', 'coleman']),
  'garden:smoker': prefix(['traeger', 'weber-grills']),
  'garden:mower': prefix(['toro', 'honda-power', 'husqvarna', 'black-and-decker', 'lawn-boy']),
  'garden:rider': prefix(['john-deere', 'husqvarna', 'toro']),
  'garden:snowblower': prefix(['toro', 'ariens', 'honda-power']),
  // Pets
  'pet:dogfood': prefix(['purina', 'pedigree', 'royal-canin', 'hills-pet', 'iams']),
  'pet:catfood': prefix(['whiskas', 'purina', 'royal-canin', 'hills-pet', 'sheba', 'fancy-feast', 'friskies', 'meow-mix']),
  'pet:treats': prefix(['purina', 'pedigree', 'royal-canin']),
}

let FIRST_WORDS: Set<string> | null = null

/** First words of the makers named in the catalog ("Trek", "Giant"): names starting with one keep their capital letter mid-sentence. */
export function makerFirstWords(): Set<string> {
  if (!FIRST_WORDS) {
    FIRST_WORDS = new Set()
    for (const spec of Object.values(ITEM_MAKERS)) {
      for (const id of spec.ids ?? []) {
        const b = brandById(id)
        if (b) FIRST_WORDS.add(b.name.split(/\s+/)[0])
      }
    }
  }
  return FIRST_WORDS
}
