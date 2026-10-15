// The Workshop's idea catalog: practical, clever and silly inventions, each with an era window,
// a difficulty (1-5) and the appeal people expect (1-5). A second list is the history race:
// real inventions under generic names, open to geniuses for 25 years before the real date. A third
// list, the future race, gives modern lives a race too: clearly fictional breakthroughs whose
// deadline (when a rival gets there) is rolled per family, so no real date is ever claimed.
// Rules for this file: no real person is ever named, and no name or blurb may use a word the
// anachronism lint (events/era.ts) flags before its technology exists. Names avoid such words
// entirely; menus still filter every idea through `anachronistic` as a safety net.
import type { TechId } from '../history/timeline'

export type Category = 'gadget' | 'home' | 'toy' | 'health' | 'transport' | 'energy' | 'computing' | 'food' | 'fashion' | 'weird'
export type Level = 1 | 2 | 3 | 4 | 5

export interface IdeaDef {
  id: string
  name: string
  emoji: string
  blurb: string
  cat: Category
  /** Difficulty 1-5: build cost, how hard a good prototype is, and the price it sells for. */
  d: Level
  /** The appeal people expect (★1-5). The real appeal can differ by one star (talent hints show it). */
  a: Level
  /** First year the idea can strike. */
  from: number
  /** Last year it can strike (an era-bound idea). */
  to?: number
  /** Technology the idea needs where the player lives. */
  tech?: TechId
  /** History race: the year this was really invented. Open 25 years before, closed after. */
  real?: number
  /** Future race: a fictional breakthrough; its deadline is rolled per family (market.raceYear). */
  future?: true
}

export interface CategoryDef {
  label: string
  emoji: string
  /** Price and unit multipliers on the difficulty baselines. */
  price: number
  units: number
  /** Years to reach peak sales, years at the top, and the yearly fade after that. */
  rise: number
  plateau: number
  decay: number
  /** Industries of a company that can make it (Make it in my company). */
  industries: RegExp
  /** Real companies (brand registry ids) that may bid for the rights. */
  buyers: string[]
  /** Fictional company name endings. */
  suffix: string
}

export const CATEGORIES: Record<Category, CategoryDef> = {
  gadget: { label: 'Gadget', emoji: '\u{1F527}', price: 1, units: 1, rise: 2, plateau: 2, decay: 0.84, industries: /^(manufacturing|robotics|semiconductor|ecommerce|telecom|software|drones)$/, buyers: ['sony', 'panasonic', 'philips', 'sharp', 'toshiba', 'hitachi', 'stanley-tools', 'black-and-decker'], suffix: 'Gadgets' },
  home: { label: 'Home', emoji: '\u{1F3E0}', price: 1, units: 1, rise: 2, plateau: 3, decay: 0.86, industries: /^(manufacturing|furniture|construction|ecommerce|grocery|packaging|recycling|homeCare|petCare)$/, buyers: ['whirlpool', 'electrolux', 'hoover', 'kenwood-chef', 'kitchenaid', 'tefal', 'moulinex', 'tupperware', 'pyrex', 'miele'], suffix: 'Housewares' },
  toy: { label: 'Toy', emoji: '\u{1F9F8}', price: 0.7, units: 1.4, rise: 1, plateau: 1, decay: 0.72, industries: /^(manufacturing|entertainment|gameStudio|ecommerce|education)$/, buyers: ['lego', 'mattel', 'hasbro', 'fisher-price', 'playmobil', 'ravensburger', 'bandai', 'tomy', 'meccano', 'steiff', 'brio'], suffix: 'Toys' },
  health: { label: 'Health', emoji: '\u{1FA7A}', price: 1.3, units: 0.9, rise: 3, plateau: 3, decay: 0.88, industries: /^(clinic|biotech|neurotech|beauty|gym|homeCare|salon)$/, buyers: [], suffix: 'Health' },
  transport: { label: 'Transport', emoji: '\u{1F697}', price: 2.6, units: 0.38, rise: 3, plateau: 3, decay: 0.87, industries: /^(autoShop|electricVehicles|logistics|spaceTech|travel|manufacturing|drones)$/, buyers: ['ford', 'toyota', 'volkswagen', 'honda', 'nissan', 'schwinn', 'raleigh', 'giant-bicycles', 'trek'], suffix: 'Motors' },
  energy: { label: 'Energy', emoji: '\u{26A1}', price: 2, units: 0.5, rise: 3, plateau: 3, decay: 0.88, industries: /^(energy|solar|battery|water|recycling|manufacturing|fusion|carbonCapture)$/, buyers: [], suffix: 'Power' },
  computing: { label: 'Computing', emoji: '\u{1F4BB}', price: 1.5, units: 0.8, rise: 2, plateau: 2, decay: 0.8, industries: /^(software|semiconductor|aiLab|quantum|cybersecurity|dataCenter|telecom|gameStudio|robotics)$/, buyers: ['ibm-pc', 'hp', 'sony', 'panasonic', 'samsung-electronics', 'philips', 'toshiba'], suffix: 'Labs' },
  food: { label: 'Food', emoji: '\u{1F354}', price: 0.15, units: 6, rise: 2, plateau: 2, decay: 0.82, industries: /^(farm|restaurant|cafe|bakery|grocery|foodTruck|brewery|bar)$/, buyers: ['kelloggs', 'quaker', 'hersheys', 'mars', 'nestle', 'cadbury', 'heinz', 'campbells', 'kraft-heinz', 'post-cereals'], suffix: 'Foods' },
  fashion: { label: 'Fashion', emoji: '\u{1F455}', price: 0.8, units: 1.2, rise: 1, plateau: 2, decay: 0.78, industries: /^(fashion|beauty|salon|ecommerce)$/, buyers: ['levis', 'champion', 'fila', 'umbro', 'mizuno', 'columbia-sportswear', 'converse', 'new-balance'], suffix: 'Apparel' },
  weird: { label: 'Weird', emoji: '\u{1F92A}', price: 0.8, units: 1, rise: 1, plateau: 1, decay: 0.7, industries: /^(manufacturing|entertainment|marketing|ecommerce|petCare)$/, buyers: [], suffix: 'Novelties' },
}

function idea(id: string, emoji: string, name: string, blurb: string, cat: Category, d: Level, a: Level, from: number, to?: number, tech?: TechId): IdeaDef {
  return { id, emoji, name, blurb, cat, d, a, from, ...(to !== undefined ? { to } : {}), ...(tech ? { tech } : {}) }
}

/** Everyday ideas. */
export const IDEAS: readonly IdeaDef[] = [
  // Gadgets
  idea('umbrella-hat', '\u{1F3A9}', 'Umbrella Hat', 'Hands-free rain cover. Dignity sold separately.', 'gadget', 1, 2, 1900),
  idea('runaway-alarm', '\u{23F0}', 'Runaway Alarm Clock', 'Rolls off the nightstand and hides until you get up.', 'gadget', 2, 3, 1955),
  idea('key-whistle', '\u{1F511}', 'Whistle Key Finder', 'Whistle and your keys beep back from under the couch.', 'gadget', 2, 4, 1975),
  idea('pizza-scissors', '\u{1F355}', 'Pizza Scissors', 'Cut a slice and serve it with one tool.', 'gadget', 1, 3, 1950),
  idea('heated-gloves', '\u{1F9E4}', 'Battery-Heated Gloves', 'Warm fingers on the coldest walk to school.', 'gadget', 2, 3, 1950),
  idea('talking-scale', '\u{2696}\u{FE0F}', 'Talking Bathroom Scale', 'Announces your weight. Loudly. To the whole house.', 'gadget', 3, 1, 1980),
  idea('fingerprint-lock', '\u{1F510}', 'Fingerprint Door Lock', 'Your thumb is the key. Hard to lose, hopefully.', 'gadget', 3, 4, 1995),
  idea('pet-tracker', '\u{1F415}', 'Lost-Pet Tracking Collar', "Find the dog before the dog finds the neighbor's trash.", 'gadget', 3, 4, 2005),
  idea('pocket-ladder', '\u{1FA9C}', 'Folding Pocket Ladder', 'Fits in a coat. Reaches the top shelf.', 'gadget', 2, 2, 1900),
  idea('self-sharpening-pencil', '\u{270F}\u{FE0F}', 'Self-Sharpening Pencil', 'Never hunt for a sharpener again.', 'gadget', 2, 3, 1900),
  idea('glow-keyhole', '\u{1F5DD}\u{FE0F}', 'Glow-in-the-Dark Keyhole', 'Find the lock at night on the first try.', 'gadget', 1, 3, 1950),
  idea('pocket-magnifier', '\u{1F50D}', 'Pocket Magnifier With a Lamp', 'Read the tiny print. Feel like a detective.', 'gadget', 1, 2, 1930),
  idea('weather-clock', '\u{1F326}\u{FE0F}', 'Weather-Forecasting Clock', 'Tells the time and whether to bring a coat.', 'gadget', 3, 2, 1900),
  idea('auto-umbrella', '\u{2602}\u{FE0F}', 'Self-Opening Umbrella', 'Press a button: instant shelter.', 'gadget', 2, 3, 1925),
  idea('pocket-tool', '\u{1F6E0}\u{FE0F}', 'Thirty-in-One Pocket Tool', 'Pliers, saw, spoon and a tiny ruler.', 'gadget', 2, 4, 1900),
  idea('tangle-proof-cord', '\u{1F50C}', 'Tangle-Proof Cord', 'A cable that refuses to knot. Science!', 'gadget', 2, 3, 1930),
  idea('opener-ring', '\u{1F48D}', 'Bottle-Opener Ring', 'Fashion and function. Mostly function.', 'gadget', 1, 2, 1950),
  idea('sock-detector', '\u{1F9E6}', 'Lost Sock Detector', 'Beeps when it gets near the missing sock.', 'gadget', 3, 1, 1985),
  // Home
  idea('sock-robot', '\u{1F916}', 'Sock-Pairing Robot', 'Reunites every sock with its soulmate.', 'home', 4, 3, 1985),
  idea('no-spill-bowl', '\u{1F436}', 'No-Spill Dog Bowl', 'Sloppy drinkers, meet your match.', 'home', 1, 3, 1900),
  idea('folding-board', '\u{1F455}', 'Laundry-Folding Board', 'Fold a shirt in two seconds flat.', 'home', 2, 4, 1960),
  idea('self-making-bed', '\u{1F6CF}\u{FE0F}', 'Bed That Makes Itself', 'The blankets snap straight when you get up.', 'home', 4, 3, 1990),
  idea('onion-chopper', '\u{1F9C5}', 'Tear-Free Onion Chopper', 'Chop onions without crying. About onions, anyway.', 'home', 2, 4, 1930),
  idea('seat-lowerer', '\u{1F6BD}', 'Toilet Seat Auto-Lowerer', 'Ends a household argument forever.', 'home', 2, 4, 1950),
  idea('snack-alarm', '\u{1F6A8}', 'Midnight Snack Alarm', 'The fridge sounds a siren after eleven at night.', 'home', 2, 2, 1960),
  idea('robot-mower', '\u{1F331}', 'Robot Lawn Mower', 'Mows the lawn while you nap.', 'home', 4, 4, 1995),
  idea('heated-seat', '\u{1F525}', 'Heated Toilet Seat', 'Winter mornings, solved.', 'home', 2, 3, 1965),
  idea('window-robot', '\u{1FA9F}', 'Window-Washing Robot', "Crawls up the glass so you don't have to.", 'home', 4, 3, 2005),
  idea('paint-can', '\u{1F3A8}', 'Spill-Proof Paint Can', 'Knock it over. Nothing happens.', 'home', 1, 3, 1930),
  idea('squeak-hinge', '\u{1F6AA}', 'Squeak-Proof Door Hinge', 'Sneak to the kitchen in total silence.', 'home', 1, 2, 1900),
  idea('ice-mat', '\u{1F9CA}', 'Ice-Free Doorstep Mat', 'A warm mat that melts the morning ice.', 'home', 3, 3, 1970),
  idea('one-plate-dishwasher', '\u{1F37D}\u{FE0F}', 'Dishwasher for One Plate', 'Tiny kitchen, tiny dishwasher.', 'home', 3, 2, 1960),
  idea('stair-vacuum', '\u{1F9F9}', 'Stair-Climbing Vacuum', 'It climbs. It cleans. It never complains.', 'home', 4, 3, 1995),
  idea('fly-fan', '\u{1FAB0}', 'Fly-Swatting Fan', 'Keeps you cool and the flies nervous.', 'home', 2, 2, 1930),
  idea('self-watering-pot', '\u{1FAB4}', 'Self-Watering Flower Pot', 'For plant owners who forget plants exist.', 'home', 1, 4, 1920),
  idea('crumb-plate', '\u{1F35E}', 'Crumb-Catching Plate', 'A plate with a built-in crumb drawer.', 'home', 1, 2, 1920),
  // Toys
  idea('rocket-pogo', '\u{1F998}', 'Rocket Pogo Stick', 'Twice the bounce. Helmet strongly advised.', 'toy', 2, 3, 1920),
  idea('bubble-hat', '\u{1FAE7}', 'Bubble Machine Hat', 'Walk around in your own cloud of bubbles.', 'toy', 2, 3, 1950),
  idea('glow-kite', '\u{1FA81}', 'Glow-in-the-Dark Kite', 'Fly it at sunset and keep flying.', 'toy', 1, 3, 1950),
  idea('unpoppable-balloon', '\u{1F388}', 'Unpoppable Balloon', 'Sit on it. Still a balloon.', 'toy', 2, 3, 1935),
  idea('talking-bear', '\u{1F9F8}', 'Talking Teddy Bear', 'Tells bedtime stories. Never gets tired.', 'toy', 3, 4, 1960),
  idea('windup-beetle', '\u{1F41E}', 'Wind-Up Racing Beetle', 'Wind it up and watch it race across the floor.', 'toy', 1, 2, 1900),
  idea('indoor-snow', '\u{2744}\u{FE0F}', 'Indoor Snowball Kit', 'Snowball fights in July. Parent approved.', 'toy', 2, 3, 1975),
  idea('robot-kit', '\u{1F916}', 'Build-a-Robot Kit', 'Snap together a robot that waves hello.', 'toy', 3, 4, 1980),
  idea('glitter-slime', '\u{1F7E2}', 'Glitter Slime', 'Gooey, sparkly and impossible to clean up.', 'toy', 1, 3, 1976),
  idea('bouncy-castle', '\u{1F3F0}', 'Inflatable Bouncy Castle', 'A castle you can jump on.', 'toy', 2, 4, 1960),
  idea('balloon-launcher', '\u{1F4A6}', 'Water Balloon Launcher', 'Summer warfare, upgraded.', 'toy', 1, 3, 1960),
  idea('singing-top', '\u{1F3B5}', 'Singing Spinning Top', 'Spins and hums a little tune.', 'toy', 1, 2, 1900),
  idea('no-lose-game', '\u{1F3B2}', 'Board Game Nobody Loses', 'Everyone wins. Nobody plays it twice.', 'toy', 1, 1, 1920),
  idea('magnet-tiles', '\u{1F9F2}', 'Magnetic Building Tiles', 'Click together castles in seconds.', 'toy', 2, 4, 1990),
  idea('puppet-theater', '\u{1F3AD}', 'Pocket Puppet Theater', 'A whole stage that folds into your pocket.', 'toy', 1, 2, 1900),
  idea('plane-launcher', '\u{1F4C4}', 'Paper Plane Launcher', 'Launches paper planes across the gym.', 'toy', 1, 3, 1930),
  idea('dino-egg', '\u{1F996}', 'Hatching Dinosaur Egg', 'Put it in water. Wait. Dinosaur!', 'toy', 1, 3, 1990),
  idea('marble-run', '\u{1F535}', 'Endless Marble Run', 'Marbles race forever. Cats watch, hypnotized.', 'toy', 2, 3, 1950),
  // Health
  idea('pill-box', '\u{1F48A}', 'Beeping Pill Box', 'Reminds you to take your medicine on time.', 'health', 2, 4, 1970),
  idea('posture-buzzer', '\u{1FA91}', 'Posture Buzzer', 'A gentle buzz whenever you slouch.', 'health', 2, 3, 1985),
  idea('snore-pillow', '\u{1F634}', 'Snore-Stopping Pillow', 'Nudges you onto your side. Quiet nights for all.', 'health', 3, 4, 1980),
  idea('brush-timer', '\u{1FAA5}', 'Glowing Toothbrush Timer', "Glows until you've brushed long enough.", 'health', 1, 3, 1980),
  idea('anti-fog', '\u{1F453}', 'Anti-Fog Glasses Coating', 'No more foggy lenses from hot soup.', 'health', 2, 4, 1960),
  idea('sneeze-scarf', '\u{1F927}', 'Sneeze-Catching Scarf', 'Polite, warm and slightly gross.', 'health', 1, 1, 1900),
  idea('cold-pack', '\u{1F9CA}', 'Instant Cold Pack', 'Squeeze it and it turns icy cold.', 'health', 2, 4, 1955),
  idea('easy-cap', '\u{1F48A}', 'Easy-Open Medicine Cap', 'Child-proof and grandparent-friendly.', 'health', 1, 3, 1970),
  idea('song-faucet', '\u{1F6B0}', 'Hand-Washing Song Faucet', 'Plays a song for exactly as long as you should scrub.', 'health', 2, 3, 1990),
  idea('folding-crutch', '\u{1FA7C}', 'Folding Crutches', 'Fold them up when you sit down.', 'health', 2, 3, 1920),
  idea('hearing-glasses', '\u{1F442}', 'Hearing-Aid Glasses', 'See better and hear better in one frame.', 'health', 4, 3, 1960),
  idea('step-counter', '\u{1F45F}', 'Wrist Step Counter', 'Counts every step you take. Judges none.', 'health', 3, 4, 1985),
  idea('sugar-patch', '\u{1FA78}', 'Painless Blood Sugar Patch', 'Checks blood sugar without a single needle.', 'health', 5, 5, 2010),
  idea('sleep-band', '\u{1F319}', 'Sleep-Tracking Headband', 'Tells you exactly how badly you slept.', 'health', 4, 3, 2010),
  idea('sunburn-sticker', '\u{2600}\u{FE0F}', 'Sunburn Warning Sticker', 'Changes color before you turn red.', 'health', 2, 4, 1985),
  idea('massage-roller', '\u{1F486}', 'Pocket Massage Roller', 'A tiny massage for tired shoulders.', 'health', 1, 3, 1950),
  // Transport
  idea('folding-bike', '\u{1F6B2}', 'Folding Bicycle', 'Ride to the station, then carry it on the train.', 'transport', 3, 3, 1900),
  idea('square-wheels', '\u{1F6D2}', 'Cart With Square Wheels', 'Bumpy. So bumpy. Why.', 'transport', 1, 1, 1900),
  idea('horse-poncho', '\u{1F434}', 'Horse Rain Poncho', 'Keeps your horse dry and fashionable.', 'transport', 1, 2, 1900, 1950),
  idea('bike-umbrella', '\u{2602}\u{FE0F}', 'Bicycle Umbrella Mount', 'Ride through the rain, mostly dry.', 'transport', 1, 2, 1920),
  idea('cup-holder', '\u{1F964}', 'Car Cup Holder', 'A spot for your drink. Revolutionary.', 'transport', 1, 4, 1950),
  idea('parking-periscope', '\u{1F52D}', 'Parking Periscope', 'Peek over traffic for an empty spot.', 'transport', 2, 2, 1950),
  idea('motor-shoes', '\u{1F45F}', 'Motorized Roller Shoes', 'Strap on, lean forward, zoom.', 'transport', 3, 3, 1985),
  idea('self-inflating-tire', '\u{1F6DE}', 'Self-Inflating Tire', 'Never check the tire pressure again.', 'transport', 4, 4, 1960),
  idea('bike-mirror', '\u{1FA9E}', 'Bicycle Rear-View Mirror', "See who's behind you. It's a bus.", 'transport', 1, 3, 1930),
  idea('collision-buzzer', '\u{1F697}', 'Collision Warning Buzzer', 'Beeps before you bump.', 'transport', 4, 4, 1995),
  idea('amphibious-bike', '\u{1F6A4}', 'Amphibious Bicycle', 'Ride into the lake. Keep riding.', 'transport', 3, 2, 1920),
  idea('flying-car', '\u{1F681}', 'Flying Car Prototype', 'Drives on roads, hops over traffic jams.', 'transport', 5, 3, 1990),
  idea('jetpack', '\u{1F392}', 'Personal Jetpack', 'Commute over the rooftops. Loudly.', 'transport', 5, 3, 1965),
  idea('snowmelt-windshield', '\u{2744}\u{FE0F}', 'Snow-Melting Windshield', 'Scraping ice is now a thing of the past.', 'transport', 3, 3, 1970),
  idea('kick-scooter', '\u{1F6F4}', 'Kick Scooter With Brakes', 'Stops before the curb does it for you.', 'transport', 2, 3, 1920),
  idea('wheel-tray', '\u{1F35F}', 'Steering Wheel Snack Tray', 'Lunch on the go. Eyes on the road, please.', 'transport', 1, 2, 1950),
  // Energy
  idea('pedal-lamp', '\u{1F4A1}', 'Pedal-Powered Lamp', 'Exercise and read at the same time.', 'energy', 2, 3, 1920),
  idea('solar-backpack', '\u{1F392}', 'Solar Backpack', 'Collects sunshine on the walk to class.', 'energy', 3, 3, 1995),
  idea('crank-flashlight', '\u{1F526}', 'Hand-Crank Flashlight', 'Never needs batteries. Just elbow grease.', 'energy', 2, 4, 1920),
  idea('rooftop-turbine', '\u{1F300}', 'Rooftop Mini Turbine', 'Catches the breeze over your house.', 'energy', 4, 3, 1980),
  idea('window-film', '\u{1FA9F}', 'Heat-Saving Window Film', 'Keeps winter outside where it belongs.', 'energy', 3, 3, 1975),
  idea('solar-heater', '\u{2600}\u{FE0F}', 'Solar Water Heater Kit', 'Hot showers powered by the sun.', 'energy', 3, 4, 1950),
  idea('dance-floor', '\u{1F57A}', 'Power-Making Dance Floor', 'Dance hard enough to light the room.', 'energy', 4, 3, 2005),
  idea('walking-battery', '\u{1F50B}', 'Walking-Powered Battery', 'Charges from every step you take.', 'energy', 4, 4, 2005),
  idea('hamster-generator', '\u{1F439}', 'Hamster-Wheel Generator', 'Powers one tiny bulb. The hamster wants a raise.', 'energy', 2, 1, 1920),
  idea('learning-thermostat', '\u{1F321}\u{FE0F}', 'Learning Thermostat', "Learns when you're home and saves heat.", 'energy', 3, 4, 1995),
  idea('solar-cooker', '\u{1F373}', 'Solar Cooker Box', 'Cooks lunch with nothing but sunlight.', 'energy', 2, 3, 1950),
  idea('heat-kettle', '\u{2668}\u{FE0F}', 'Waste-Heat Kettle', 'Boils water with heat from the stove pipe.', 'energy', 3, 2, 1920),
  idea('wave-buoy', '\u{1F30A}', 'Wave-Power Buoy', 'Bobs on the sea and makes electricity.', 'energy', 5, 3, 1985),
  // Computing
  idea('adding-machine', '\u{1F9EE}', 'Pocket Adding Machine', 'Sums the grocery bill before the cashier does.', 'computing', 3, 3, 1900, 1975),
  idea('card-sorter', '\u{1F5C2}\u{FE0F}', 'Punch-Card Recipe Sorter', 'Finds the cookie recipe in seconds.', 'computing', 3, 2, 1930, 1980),
  idea('solar-calculator', '\u{1F522}', 'Solar Pocket Calculator', 'Math, powered by the sun.', 'computing', 3, 4, 1975),
  idea('spelling-typewriter', '\u{2328}\u{FE0F}', 'Spell-Checking Typewriter', "Beeps before you misspell 'necessary'.", 'computing', 4, 3, 1975, 2000),
  idea('split-keyboard', '\u{2328}\u{FE0F}', 'Split Ergonomic Keyboard', "Typing that doesn't hurt your wrists.", 'computing', 2, 3, 1985),
  idea('typing-glove', '\u{1F9E4}', 'Typing Glove', 'Type by tapping your fingers on any table.', 'computing', 3, 2, 1990),
  idea('password-keychain', '\u{1F511}', 'Password-Keeping Keychain', "Remembers every password so you don't have to.", 'computing', 3, 3, 2000),
  idea('voice-switch', '\u{1F5E3}\u{FE0F}', 'Voice-Controlled Light Switch', "Say 'lights' and it obeys.", 'computing', 4, 4, 2012),
  idea('cable-untangler', '\u{1F50C}', 'Desk Cable Untangler', 'Tames the snake nest behind your desk.', 'computing', 2, 3, 1990),
  idea('disk-labeler', '\u{1F4BE}', 'Floppy Disk Label Printer', 'Never mix up your floppies again.', 'computing', 2, 2, 1980, 1998),
  idea('big-keyboard', '\u{2328}\u{FE0F}', 'Big-Button Keyboard', 'Huge keys for grandparents and sleepy mornings.', 'computing', 2, 3, 1990),
  idea('hologram-display', '\u{1F308}', 'Holographic Display', 'Pictures that float in mid-air.', 'computing', 5, 4, 2015),
  idea('brain-headset', '\u{1F9E0}', 'Brain-Wave Headset', 'Control things by thinking. Mostly about snacks.', 'computing', 5, 3, 2010),
  idea('translator-earpiece', '\u{1F5E3}\u{FE0F}', 'Translator Earpiece', 'Hear any language in your own.', 'computing', 5, 5, 2015),
  idea('heads-up-glasses', '\u{1F576}\u{FE0F}', 'Heads-Up Glasses', 'Directions float in front of your eyes.', 'computing', 5, 3, 2012),
  idea('chess-machine', '\u{265F}\u{FE0F}', 'Chess-Playing Machine', 'A box of gears and tubes that beats your uncle.', 'computing', 4, 3, 1950),
  idea('mood-lamp', '\u{1F4A1}', 'Mood-Sensing Lamp', 'Changes color to match your mood.', 'computing', 3, 3, 2005),
  // Food
  idea('toast-rack', '\u{1F35E}', 'Self-Buttering Toast Rack', 'Hot toast, buttered on arrival.', 'food', 2, 2, 1920),
  idea('square-eggs', '\u{1F95A}', 'Square Egg Mold', "Eggs that don't roll off the plate.", 'food', 1, 1, 1900),
  idea('cocoa-spoon', '\u{1F36B}', 'Hot Chocolate Spoon', 'Stir it into hot milk: instant cocoa.', 'food', 1, 3, 1950),
  idea('drip-cone', '\u{1F366}', 'Drip-Proof Ice Cream Cone', 'Catches every melting drop.', 'food', 2, 4, 1920),
  idea('edible-spoon', '\u{1F944}', 'Edible Spoon', 'Finish your soup, then eat the spoon.', 'food', 1, 3, 1970),
  idea('veggie-gummies', '\u{1F43B}', 'Vegetable Gummy Bears', 'Sneaky broccoli in a gummy disguise.', 'food', 1, 3, 1985),
  idea('self-heating-can', '\u{1F96B}', 'Self-Heating Soup Can', 'Pull the tab, wait a minute: hot soup.', 'food', 3, 4, 1950),
  idea('popcorn-bowl', '\u{1F37F}', 'Popcorn Seasoning Bowl', 'Shakes the salt evenly onto every kernel.', 'food', 1, 3, 1950),
  idea('cereal-bowl', '\u{1F963}', 'No-Soggy Cereal Bowl', "Keeps milk and cereal apart until you're ready.", 'food', 1, 3, 1950),
  idea('crust-cutter', '\u{1F96A}', 'Sandwich Crust Cutter', 'Crustless sandwiches for picky eaters.', 'food', 1, 3, 1950),
  idea('flavor-gum', '\u{1F36C}', 'Flavor-Changing Gum', 'Starts as strawberry, ends as mint.', 'food', 3, 4, 1960),
  idea('ice-cream-maker', '\u{1F368}', 'Mini Ice Cream Churn', 'Churn your own ice cream on the kitchen table.', 'food', 2, 3, 1930),
  idea('chili-meter', '\u{1F336}\u{FE0F}', 'Spiciness Meter', 'Measures the heat before your tongue does.', 'food', 2, 2, 1980),
  idea('pancake-printer', '\u{1F95E}', 'Pancake Printer', 'Draws pancakes in any shape you like.', 'food', 4, 3, 2010),
  idea('lab-burger', '\u{1F354}', 'Lab-Grown Burger', 'Real meat. No cows involved.', 'food', 5, 4, 2013),
  idea('nut-milk-maker', '\u{1F95C}', 'Nut Milk Maker', 'Turns almonds into milk in a minute.', 'food', 2, 3, 1990),
  idea('spaghetti-fork', '\u{1F35D}', 'Spaghetti-Twirling Fork', 'Twirls the pasta for you.', 'food', 1, 3, 1950),
  // Fashion
  idea('reversible-coat', '\u{1F9E5}', 'Reversible Raincoat', 'Two coats in one. Same rain.', 'fashion', 1, 3, 1920),
  idea('wheel-shoes', '\u{1F45F}', 'Shoes With Hidden Wheels', 'Walk, then roll.', 'fashion', 2, 4, 1990),
  idea('color-shirt', '\u{1F455}', 'Color-Changing T-Shirt', 'Changes color when you get warm.', 'fashion', 3, 4, 1985),
  idea('self-tying-laces', '\u{1F45E}', 'Self-Tying Shoelaces', 'Step in. The laces do the rest.', 'fashion', 4, 4, 2005),
  idea('glow-sneakers', '\u{2728}', 'Glow-in-the-Dark Sneakers', 'Light up the dance floor with every step.', 'fashion', 2, 3, 1985),
  idea('pocket-tie', '\u{1F454}', 'Tie With a Secret Pocket', 'Stores a snack. Or notes for the big speech.', 'fashion', 1, 2, 1900),
  idea('holeproof-socks', '\u{1F9E6}', 'Socks That Never Wear Out', 'Your toes will never poke through again.', 'fashion', 3, 3, 1960),
  idea('wrinkle-free', '\u{1F9F5}', 'Wrinkle-Proof Suit Fabric', 'Sleep in it. Still sharp.', 'fashion', 3, 3, 1950),
  idea('solar-jacket', '\u{1F9E5}', 'Solar Charging Jacket', 'Charges gadgets while you walk.', 'fashion', 3, 2, 2010),
  idea('fan-hat', '\u{1F9E2}', 'Hat With a Built-In Fan', 'A personal breeze on hot days.', 'fashion', 1, 3, 1950),
  idea('heated-insoles', '\u{1F525}', 'Heated Shoe Insoles', 'Toasty toes all winter long.', 'fashion', 2, 3, 1970),
  idea('mood-ring', '\u{1F48D}', 'Mood-Sensing Ring', 'Changes color with your mood. Allegedly.', 'fashion', 1, 3, 1960),
  idea('pocket-poncho', '\u{1F327}\u{FE0F}', 'Pocket-Sized Rain Poncho', 'Folds into a pouch the size of a cookie.', 'fashion', 1, 3, 1950),
  // Weird
  idea('pet-rock', '\u{1FAA8}', 'Deluxe Pet Rock', 'No feeding, no walking, no regrets.', 'weird', 1, 2, 1900),
  idea('cat-hammock', '\u{1F408}', 'Window Cat Hammock', "Your cat's new favorite throne.", 'weird', 1, 3, 1950),
  idea('dog-translator', '\u{1F415}', 'Dog Translator Collar', "Finally learn what the barking is about. (Squirrels.)", 'weird', 4, 4, 2005),
  idea('banana-case', '\u{1F34C}', 'Banana Protector Case', 'No more squished bananas in the backpack.', 'weird', 1, 2, 1960),
  idea('fortune-machine', '\u{1F52E}', 'Automatic Fortune Teller', 'Insert a coin, receive a vague prophecy.', 'weird', 2, 2, 1900),
  idea('ghost-detector', '\u{1F47B}', 'Ghost Detector', 'Beeps near ghosts. Also near the fridge.', 'weird', 2, 2, 1950),
  idea('beard-bib', '\u{1F9D4}', 'Beard Bib', 'Catches the trimmings so the sink stays clean.', 'weird', 1, 2, 1960),
  idea('rain-cloud', '\u{2601}\u{FE0F}', 'Personal Rain Cloud Mister', 'A tiny cloud that sprays you on hot days.', 'weird', 3, 2, 1980),
  idea('hiccup-machine', '\u{1F635}', 'Hiccup Cure Machine', 'Scares your hiccups away. Mostly scares you.', 'weird', 2, 2, 1920),
  idea('glow-paper', '\u{1F9FB}', 'Glow-in-the-Dark Toilet Paper', 'Midnight bathroom trips, illuminated.', 'weird', 1, 2, 1960),
  idea('bite-fork', '\u{1F374}', 'Bite-Counting Fork', 'Buzzes if you eat too fast.', 'weird', 3, 1, 2005),
  idea('mustache-spoon', '\u{1F944}', 'Mustache-Guard Spoon', 'Soup goes in. Mustache stays dry.', 'weird', 1, 2, 1900, 1950),
  idea('face-toaster', '\u{1F35E}', 'Face-Printing Toaster', 'Toasts your own face onto the bread.', 'weird', 3, 3, 1995),
  idea('invisible-ink', '\u{1F58A}\u{FE0F}', 'Invisible Ink Pen', 'Secret notes, revealed by a little lamp.', 'weird', 1, 3, 1900),
  idea('ejector-bed', '\u{1F6CF}\u{FE0F}', 'Ejector Alarm Bed', 'Tilts you onto the floor at seven sharp.', 'weird', 3, 2, 1950),
  idea('plant-meter', '\u{1F33F}', 'Plant Mood Meter', 'Tells you when your fern is sulking.', 'weird', 3, 2, 2000),
  idea('leftover-labeler', '\u{1F3F7}\u{FE0F}', 'Leftover Disguise Labels', "Labels your lunch so roommates think it's broccoli.", 'weird', 1, 2, 1960),
]

function hist(id: string, emoji: string, name: string, blurb: string, cat: Category, d: Level, real: number): IdeaDef {
  return { id, emoji, name, blurb, cat, d, a: 5, from: real - 25, to: real, real }
}

/**
 * The history race: real inventions under generic names (never the name of a real person).
 * Open to Inventor-talent holders (or skill 80+) from 25 years before the real date until that
 * year. Launching one first is a "You beat history" moment.
 */
export const HISTORY: readonly IdeaDef[] = [
  hist('hist-teabag', '\u{1F375}', 'Tea in a Little Bag', 'Brew one cup at a time. No strainer, no mess.', 'food', 1, 1908),
  hist('hist-crossword', '\u{1F4F0}', 'Criss-Cross Word Puzzle', 'A grid of clues that makes the newspaper addictive.', 'toy', 1, 1913),
  hist('hist-zipper', '\u{1F910}', 'Hookless Slide Fastener', 'A row of tiny teeth that zips shut. Buttons, beware.', 'fashion', 2, 1913),
  hist('hist-traffic-signal', '\u{1F6A6}', 'Electric Traffic Signal', 'Red means stop, green means go. Chaos solved.', 'transport', 3, 1914),
  hist('hist-toaster', '\u{1F35E}', 'Pop-Up Toaster', "Toast jumps out when it's done. No more burnt bread.", 'home', 3, 1919),
  hist('hist-bandage', '\u{1FA79}', 'Stick-On Bandage Strip', 'A tiny bandage with its own sticky edges.', 'health', 1, 1920),
  hist('hist-picture-box', '\u{1F4FA}', 'Far-Seeing Picture Box', 'Sends moving pictures through the air into every living room.', 'gadget', 5, 1927),
  hist('hist-bubble-gum', '\u{1FAE7}', 'Bubble-Blowing Gum', 'Chewing gum stretchy enough to blow bubbles.', 'food', 1, 1928),
  hist('hist-bread-slicer', '\u{1F956}', 'Bread-Slicing Machine', 'Every loaf sliced perfectly. The best thing since... well.', 'food', 3, 1928),
  hist('hist-electric-guitar', '\u{1F3B8}', 'Electric Amplified Guitar', 'A guitar loud enough to fill a dance hall.', 'gadget', 3, 1931),
  hist('hist-road-studs', '\u{1F6E3}\u{FE0F}', 'Road Reflector Studs', 'Little glass eyes in the road that shine in headlights.', 'transport', 2, 1934),
  hist('hist-parking-meter', '\u{1F17F}\u{FE0F}', 'Coin-Operated Parking Meter', 'Pay for your parking spot by the hour.', 'transport', 3, 1935),
  hist('hist-shopping-cart', '\u{1F6D2}', 'Folding Shopping Cart', "A basket on wheels for the whole week's groceries.", 'home', 2, 1937),
  hist('hist-ballpoint', '\u{1F58A}\u{FE0F}', 'Rolling-Ball Ink Pen', 'Ink that rolls out of a tiny ball. No smudges.', 'gadget', 2, 1938),
  hist('hist-cookie', '\u{1F36A}', 'Chocolate-Chunk Cookie', 'Chop a chocolate bar into the dough. Trust me.', 'food', 1, 1938),
  hist('hist-radar-oven', '\u{1F372}', 'Radar Cooking Box', 'Heats food with invisible waves in seconds.', 'home', 4, 1947),
  hist('hist-crystal-switch', '\u{1F50C}', 'Crystal Signal Switch', 'A tiny crystal switch that amplifies signals. Every machine will want one.', 'computing', 5, 1947),
  hist('hist-instant-camera', '\u{1F4F7}', 'Instant Photo Camera', 'Snap a picture and hold the print a minute later.', 'gadget', 4, 1948),
  hist('hist-hook-loop', '\u{1F9F7}', 'Hook-and-Loop Fastener', 'Tiny hooks grab tiny loops. Rrrrrip!', 'fashion', 2, 1955),
  hist('hist-flying-disc', '\u{1F94F}', 'Flying Disc', 'A spinning plate that glides across the park.', 'toy', 1, 1957),
  hist('hist-hoop', '\u{1F7E0}', 'Hip-Swinging Hoop', 'Spin a big hoop around your waist for hours.', 'toy', 1, 1958),
  hist('hist-safety-belt', '\u{1F697}', 'Three-Point Safety Belt', 'Across the lap and over the shoulder. Saves lives.', 'transport', 3, 1959),
  hist('hist-light-beam', '\u{1F526}', 'Concentrated Light Beam', 'A pencil-thin beam of pure light. Uses: yes.', 'computing', 5, 1960),
  hist('hist-smoke-alarm', '\u{1F6A8}', 'Home Smoke Alarm', 'Shrieks at the first whiff of smoke.', 'home', 3, 1965),
  hist('hist-pocket-telephone', '\u{1F4DE}', 'Pocket Telephone', 'A telephone with no cord that fits in your hand.', 'computing', 5, 1973),
  hist('hist-color-cube', '\u{1F9E9}', 'Twisty Color Cube', 'Six colored faces. Solve it if you can.', 'toy', 2, 1974),
  hist('hist-filmless-camera', '\u{1F4F8}', 'Filmless Camera', 'Takes photos without any film at all.', 'gadget', 4, 1975),
  hist('hist-thinking-machine', '\u{1F5A5}\u{FE0F}', 'Home Thinking Machine', 'An electronic brain small enough for a desk at home.', 'computing', 5, 1977),
  hist('hist-pocket-music', '\u{1F3A7}', 'Pocket Music Player', 'Your favorite songs on a belt clip, with tiny headphones.', 'gadget', 4, 1979),
  hist('hist-sticky-notes', '\u{1F5D2}\u{FE0F}', 'Re-Stickable Note Paper', 'Notes that stick, peel off and stick again.', 'home', 1, 1980),
  hist('hist-page-viewer', '\u{1F310}', 'Hyperlink Page Viewer', 'Click a word, jump to a page anywhere in the world.', 'computing', 4, 1990),
  hist('hist-song-library', '\u{1F3B6}', 'Thousand-Song Pocket Player', 'A thousand songs in a box smaller than a deck of cards.', 'gadget', 4, 1998),
  hist('hist-touch-telephone', '\u{1F4F1}', 'Touch-Glass Pocket Telephone', 'A pocket telephone that is one big touch screen.', 'computing', 5, 2007),
  hist('hist-touch-slate', '\u{1F4F2}', 'Touch-Glass Slate', 'A thin sheet of glass you read, draw and play on.', 'computing', 5, 2010),
]

function future(id: string, emoji: string, name: string, blurb: string, cat: Category, d: Level, from: number): IdeaDef {
  return { id, emoji, name, blurb, cat, d, a: 5, from, future: true }
}

/**
 * The future race: fictional breakthroughs nobody has made yet. Open to the same inventors as the
 * history race from `from`; a rival gets there in a year rolled per family (10-40 years later).
 */
export const FUTURE: readonly IdeaDef[] = [
  future('fut-fusion-cell', '\u{269B}\u{FE0F}', 'Pocket Fusion Cell', 'A fusion power cell the size of a coin. Never charge anything again.', 'energy', 5, 2020),
  future('fut-superwire', '\u{1F9F2}', 'Room-Temperature Superwire', 'Power lines that lose nothing, and no freezer needed.', 'energy', 5, 2018),
  future('fut-dream-recorder', '\u{1F319}', 'Dream Recorder', "Plays back last night's dreams over breakfast. Mostly about teeth.", 'computing', 5, 2022),
  future('fut-pocket-quantum', '\u{1F52E}', 'Pocket Quantum Brain', 'Solves in a second what takes a warehouse of machines a century.', 'computing', 5, 2025),
  future('fut-organ-printer', '\u{1FAC0}', 'Desktop Organ Printer', 'Prints a new kidney from your own cells. Waiting lists, gone.', 'health', 5, 2020),
  future('fut-cold-cure', '\u{1F927}', 'One-Pill Cold Cure', 'One pill and the sniffles are gone by lunch.', 'health', 4, 2016),
  future('fut-tooth-gel', '\u{1F9B7}', 'Tooth-Regrowing Gel', 'Lost a tooth? Rub it in and grow a new one.', 'health', 5, 2022),
  future('fut-plastic-bin', '\u{267B}\u{FE0F}', 'Plastic-Eating Compost Bin', 'Tiny microbes turn old plastic into garden soil overnight.', 'home', 4, 2016),
  future('fut-robot-chef', '\u{1F9D1}\u{200D}\u{1F373}', 'Robot Chef That Cleans Up', 'Cooks a three-course dinner, then washes every dish.', 'home', 5, 2018),
  future('fut-float-board', '\u{1F6F9}', 'Floating Skateboard', 'Hovers a hand above any street. No wheels, no excuses.', 'transport', 5, 2018),
  future('fut-air-umbrella', '\u{2614}', 'Force-Field Umbrella', 'A silent dome of air keeps the rain off. No pole.', 'gadget', 5, 2020),
  future('fut-free-chocolate', '\u{1F36B}', 'Calorie-Free Chocolate', 'Tastes exactly like chocolate. Zero calories. Science!', 'food', 4, 2017),
  future('fut-clean-clothes', '\u{1F455}', 'Never-Wash Clothes', 'Shirts that shrug off every stain and never need a wash.', 'fashion', 4, 2016),
]

export const ALL_IDEAS: readonly IdeaDef[] = [...IDEAS, ...HISTORY, ...FUTURE]
const BY_ID = new Map(ALL_IDEAS.map((i) => [i.id, i]))

export function catalogIdea(id: string): IdeaDef | undefined {
  return BY_ID.get(id)
}

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && Object.hasOwn(CATEGORIES, v)
}

/** True for a race idea: the history race (a real year) or the future race (a rolled year). */
export function isHistory(def: Pick<IdeaDef, 'real' | 'future'>): boolean {
  return typeof def.real === 'number' || def.future === true
}

export const DIFFICULTY_LABEL = ['', 'Easy', 'Fiddly', 'Tricky', 'Hard', 'Epic'] as const

export function stars(n: number): string {
  const k = Math.max(0, Math.min(5, Math.round(n)))
  return '\u{2605}'.repeat(k) + '\u{2606}'.repeat(5 - k)
}
