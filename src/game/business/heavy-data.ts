// The Heavy R&D catalogue: two or three breakthrough products per industry. A breakthrough is a kind of
// product of its own (never a variant or a next generation of a classic), with the first year a company
// could plausibly develop it. heavy-rd.ts decides what one costs, how long it takes and who follows.
// Pure data and two lookups: no state, no RNG.

export interface Breakthrough {
  /** Unique across every industry, at most 40 characters, and a kind of product of its own. */
  name: string
  /** The earliest year it can be developed. */
  first: number
  /** One plain sentence: what it is. */
  note: string
}

export const BREAKTHROUGHS: Record<string, Breakthrough[]> = {
  foodTruck: [
    { name: 'Live Location Routes', first: 2009, note: 'The truck posts each stop online, so a line forms before it parks.' },
    { name: 'Robotic Fry Station', first: 2018, note: 'A robot arm lifts the fryer baskets through the lunch rush.' },
    { name: 'Electric Kitchen Truck', first: 2019, note: 'A truck that cooks on batteries and shore power, with no generator running.' },
  ],
  restaurant: [
    { name: 'Conveyor Sushi Belt', first: 1958, note: 'Plates ride a belt past the tables and diners take what they like.' },
    { name: 'Tableside Ordering Screens', first: 2010, note: 'Guests order and pay from a screen at the table, and the kitchen gets the ticket at once.' },
    { name: 'Robot Server Fleet', first: 2020, note: 'Wheeled robots carry plates from the pass to the tables.' },
  ],
  cafe: [
    { name: 'Nitro Cold Brew Taps', first: 2013, note: 'Cold brew charged with nitrogen and poured from a tap like a stout.' },
    { name: 'Order-Ahead Pickup Shelf', first: 2014, note: 'Customers order and pay on a phone, then collect from a shelf with no queue.' },
    { name: 'Robotic Barista Kiosk', first: 2019, note: 'A glass kiosk where a robot arm brews the coffee and hands over the cup.' },
  ],
  bakery: [
    { name: 'Sliced and Wrapped Loaf', first: 1928, note: 'A machine slices the loaf and wraps it before it leaves the bakery.' },
    { name: 'Par-Baked Frozen Dough', first: 1960, note: 'Dough is part-baked and frozen, then finished in shop ovens when needed.' },
    { name: 'Robotic Bread Line', first: 2014, note: 'Robots move the trays and shape the dough on a line that runs overnight.' },
  ],
  bar: [
    { name: 'Digital Jukebox Network', first: 1998, note: 'A jukebox that pulls its songs from a central library over the network.' },
    { name: 'Self-Pour Tap Wall', first: 2011, note: 'Guests pour their own beer from a wall of taps and pay by the ounce.' },
    { name: 'Robotic Cocktail Bar', first: 2014, note: 'Two robot arms mix cocktails to order at a counter.' },
  ],
  brewery: [
    { name: 'Canned Beer Line', first: 1935, note: 'A line that fills and seams steel cans, so the beer travels and stores easily.' },
    { name: 'Dealcoholizing Plant', first: 1985, note: 'A vacuum still that takes the alcohol out of finished beer.' },
    { name: 'Self-Adjusting Brewhouse', first: 2020, note: 'Sensors and software tune each batch of mash and boil with no brewer at the controls.' },
  ],
  grocery: [
    { name: 'Self-Service Aisles', first: 1916, note: 'Customers pick goods from open shelves and pay at one counter.' },
    { name: 'Barcode Scanning Checkout', first: 1974, note: 'Each pack carries a printed code and the till reads it with a laser.' },
    { name: 'Cashierless Checkout', first: 2018, note: 'Cameras and shelf sensors track what a shopper takes and charge them on the way out.' },
  ],
  fashion: [
    { name: 'Nylon Collection', first: 1939, note: 'Garments cut from nylon, which dries fast and needs no ironing.' },
    { name: 'Spandex Stretch Line', first: 1962, note: 'Cloth woven with spandex that stretches and returns to shape.' },
    { name: 'Seamless 3D Knit Line', first: 2012, note: 'Sweaters and shoe uppers are knit in one piece by machine, with almost no offcuts.' },
  ],
  beauty: [
    { name: 'Liposome Skin Cream', first: 1986, note: 'A cream that carries its active ingredients in tiny fat capsules.' },
    { name: 'Forty-Shade Foundation Range', first: 2017, note: 'Foundation sold in forty shades, so most customers find a match in the store.' },
    { name: 'Skin-Scan Custom Serum', first: 2018, note: 'A phone scan of the skin sets the mix for a serum blended to order.' },
  ],
  salon: [
    { name: 'Hooded Dryer Row', first: 1925, note: 'A row of hooded dryers lets clients dry their hair while they sit and read.' },
    { name: 'Keratin Smoothing Treatment', first: 2005, note: 'A salon treatment that straightens frizzy hair for a few months.' },
    { name: 'Gel Nail Lamp Bar', first: 2010, note: 'Gel polish cured under a small lamp, so nails come out dry and hard.' },
  ],
  gym: [
    { name: 'Selectorized Machine Floor', first: 1970, note: 'Weight stacks with a pin let members change the load without plates.' },
    { name: 'Aerobics Hall', first: 1975, note: 'A sprung-floor room for classes led to music.' },
    { name: 'Streamed Class Library', first: 2013, note: 'Live and recorded classes streamed to members at home.' },
  ],
  autoShop: [
    { name: 'Computerized Wheel Alignment', first: 1985, note: 'Sensors on the wheels feed a computer that sets the angles.' },
    { name: 'OBD Diagnostic Bay', first: 1996, note: 'A bay with a scan tool that reads fault codes from the car’s computer.' },
    { name: 'ADAS Calibration Bay', first: 2018, note: 'Targets and software that realign a car’s cameras and radar after a repair.' },
  ],
  construction: [
    { name: 'Prestressed Concrete Beams', first: 1935, note: 'Beams cast with tensioned steel carry longer spans with less concrete.' },
    { name: 'Tower Crane Fleet', first: 1950, note: 'Tower cranes that climb with the building and reach any corner of the site.' },
    { name: '3D-Printed Houses', first: 2018, note: 'A gantry printer lays the walls in concrete, layer by layer.' },
  ],
  realEstate: [
    { name: 'Multiple Listing Service', first: 1970, note: 'Agents pool their listings so any of them can sell any home.' },
    { name: 'Online Listing Portal', first: 1996, note: 'Homes appear on a website with photos and prices, open to any buyer.' },
    { name: 'Instant Cash Offers', first: 2014, note: 'The agency buys the home itself at a posted price and resells it later.' },
  ],
  software: [
    { name: 'Spreadsheet Package', first: 1979, note: 'A program that recalculates a whole table when one number changes.' },
    { name: 'Hosted Subscription Platform', first: 1999, note: 'Customers log in to software run on the company’s servers and pay by the month.' },
    { name: 'Autonomous Agent Platform', first: 2025, note: 'Software agents that carry out tasks across a client’s systems on their own.' },
  ],
  gameStudio: [
    { name: 'Persistent Online World', first: 1997, note: 'One shared game world that stays up while thousands of players log in and out.' },
    { name: 'Live-Service Game', first: 2012, note: 'A game that never ships a final version and adds a new season every few months.' },
    { name: 'Cloud-Streamed Game Library', first: 2019, note: 'Games run on remote servers and stream to any screen.' },
  ],
  ecommerce: [
    { name: 'Saved-Card Checkout', first: 1999, note: 'A returning shopper buys with one click on a saved card and address.' },
    { name: 'Robotic Warehouse Floor', first: 2012, note: 'Robots bring the shelves to the packers instead of packers walking to the shelves.' },
    { name: 'Drone Delivery Hub', first: 2022, note: 'Small parcels leave a hub by drone and land at the customer’s door.' },
  ],
  marketing: [
    { name: 'Television Spot Campaigns', first: 1948, note: 'Short spots bought on local and network television.' },
    { name: 'Search Ad Desk', first: 2002, note: 'A team that bids on search keywords and bills clients for each click.' },
    { name: 'Programmatic Ad Exchange', first: 2010, note: 'Ads are bought and placed automatically, one viewer at a time, in milliseconds.' },
  ],
  clinic: [
    { name: 'Day Surgery Unit', first: 1970, note: 'Patients have a short operation and go home the same day.' },
    { name: 'MRI Scanner Suite', first: 1985, note: 'A magnet scans soft tissue in detail, with no radiation.' },
    { name: 'AI Scan Reading', first: 2019, note: 'Software reads scans first and flags the ones a doctor should look at.' },
  ],
  hotel: [
    { name: 'Central Booking System', first: 1965, note: 'Every hotel in the group books rooms through one central reservations office.' },
    { name: 'Keycard Door Locks', first: 1975, note: 'Plastic cards replace brass keys, and a lost card is simply recoded.' },
    { name: 'Phone-Key Check-In', first: 2014, note: 'Guests skip the desk and open their room door with a phone.' },
  ],
  logistics: [
    { name: 'Containerized Freight', first: 1956, note: 'Goods travel in sealed steel boxes that move between ship and truck unopened.' },
    { name: 'Satellite Fleet Tracking', first: 1995, note: 'Each truck reports where it is, so dispatch sees the whole fleet on one map.' },
    { name: 'Driverless Truck Lanes', first: 2025, note: 'Trucks drive the highway legs with no one at the wheel, and a driver meets them at each end.' },
  ],
  manufacturing: [
    { name: 'Moving Assembly Line', first: 1913, note: 'Work moves past fixed stations on a belt, and each worker does one task.' },
    { name: 'Numerical Control Cell', first: 1955, note: 'Machine tools run from punched tape instead of a machinist’s hands.' },
    { name: 'Metal 3D Printing Line', first: 2014, note: 'Parts are built up in powdered metal by laser instead of cut from a block.' },
  ],
  farm: [
    { name: 'Hybrid Seed Program', first: 1930, note: 'Seed bred from two inbred lines gives a bigger and more even crop.' },
    { name: 'Satellite-Guided Tractors', first: 1998, note: 'Tractors steer by satellite and keep each row straight to the inch.' },
    { name: 'Vertical Growing Hall', first: 2013, note: 'Crops grow in stacked trays under LED lights, indoors all year.' },
  ],
  energy: [
    { name: 'Nuclear Reactor Unit', first: 1957, note: 'A reactor heats the steam for the turbines, and fuel lasts months between reloads.' },
    { name: 'Combined-Cycle Gas Plant', first: 1985, note: 'Waste heat from a gas turbine makes steam for a second turbine.' },
    { name: 'Fusion Pilot Plant', first: 2035, note: 'A pilot plant that tries to make steam by fusing hydrogen.' },
  ],
  entertainment: [
    { name: 'Stadium Tour', first: 1965, note: 'One act sells tens of thousands of tickets for a single stadium night.' },
    { name: 'Hologram Headliner', first: 2012, note: 'A projected performer on stage, with a live band underneath.' },
    { name: 'Livestream Concert Series', first: 2020, note: 'Ticketed shows streamed from an empty hall to fans at home.' },
  ],
  semiconductor: [
    { name: 'Microprocessor Design', first: 1971, note: 'A whole processor etched on one chip.' },
    { name: 'EUV Lithography Line', first: 2019, note: 'Chips printed with extreme ultraviolet light to draw much finer circuits.' },
    { name: 'Gate-All-Around Process', first: 2025, note: 'Transistors whose gate wraps the channel on every side, for tighter control of current.' },
  ],
  aiLab: [
    { name: 'Large Language Model', first: 2019, note: 'A model trained on much of the web to continue any text it is given.' },
    { name: 'Reasoning Model', first: 2024, note: 'A model that works through a problem in steps before it answers.' },
    { name: 'Autonomous Research Agent', first: 2030, note: 'An agent that designs and runs its own experiments.' },
  ],
  robotics: [
    { name: 'Programmable Welding Robot', first: 1961, note: 'A robot arm that repeats a stored welding path on every car body.' },
    { name: 'Legged Inspection Robot', first: 2019, note: 'A four-legged robot that walks a plant floor and logs readings from the gauges.' },
    { name: 'Humanoid Warehouse Worker', first: 2026, note: 'A two-legged robot that moves totes in aisles built for people.' },
  ],
  biotech: [
    { name: 'Recombinant Insulin', first: 1982, note: 'Human insulin made by bacteria carrying the human gene.' },
    { name: 'Messenger RNA Vaccine', first: 2020, note: 'A vaccine that teaches cells to make one viral protein, built to order from a sequence.' },
    { name: 'Gene-Editing Therapy', first: 2023, note: 'A one-time treatment that edits a patient’s own cells to correct a fault.' },
  ],
  spaceTech: [
    { name: 'Reusable Booster', first: 2015, note: 'The first stage flies back and lands for another launch.' },
    { name: 'Lunar Cargo Lander', first: 2024, note: 'An uncrewed lander that carries customers’ cargo to the Moon’s surface.' },
    { name: 'Orbital Fuel Depot', first: 2030, note: 'A tank in orbit that refuels other spacecraft.' },
  ],
  electricVehicles: [
    { name: 'Skateboard Chassis Platform', first: 2012, note: 'The battery and motors sit in one flat base that carries any body.' },
    { name: 'Driverless Robotaxi', first: 2020, note: 'Cars that carry paying riders with no driver on board.' },
    { name: 'Solid-State Battery Car', first: 2027, note: 'A car with solid electrolyte cells for more range and faster charging.' },
  ],
  quantum: [
    { name: 'Quantum Annealer', first: 2011, note: 'A machine that finds low-energy answers to optimization problems.' },
    { name: 'Error-Corrected Logical Qubit', first: 2023, note: 'Many physical qubits act as one that holds its state longer.' },
    { name: 'Fault-Tolerant Quantum Computer', first: 2032, note: 'A machine that runs long programs while correcting its own errors.' },
  ],
  cybersecurity: [
    { name: 'Network Firewall', first: 1992, note: 'A gateway that blocks traffic by rule between a company and the outside.' },
    { name: 'Endpoint Detection Platform', first: 2013, note: 'Agents on every laptop report odd behavior to a central console.' },
    { name: 'Autonomous Threat Response', first: 2024, note: 'Software isolates an attacked machine within seconds, before an analyst is paged.' },
  ],
  investmentFirm: [
    { name: 'Index Fund Range', first: 1976, note: 'Funds that hold a whole market’s shares at a very low fee.' },
    { name: 'Exchange-Traded Fund Range', first: 1993, note: 'Index funds that trade on an exchange all day like a share.' },
    { name: 'Robo-Advisor Portfolios', first: 2008, note: 'Software builds and rebalances a portfolio from a few questions.' },
  ],
  bank: [
    { name: 'Credit Card Program', first: 1958, note: 'A card that lets customers borrow at shops and repay the bank each month.' },
    { name: 'Cash Machine Network', first: 1967, note: 'Customers withdraw cash from a machine on the street at any hour.' },
    { name: 'Mobile Check Deposit', first: 2009, note: 'Customers photograph a check with a phone and the bank credits it.' },
  ],
  onlineBank: [
    { name: 'Internet Banking Portal', first: 1995, note: 'Customers check balances and pay bills on a website.' },
    { name: 'Instant Digital Card', first: 2015, note: 'A card number issued in the app in seconds, before the plastic arrives.' },
    { name: 'Open Banking Gateway', first: 2018, note: 'Customers let approved apps read their accounts through a secure interface.' },
  ],
  casino: [
    { name: 'Progressive Jackpot Network', first: 1986, note: 'Slot machines across several casinos feed one growing jackpot.' },
    { name: 'Ticket-Voucher Slots', first: 1999, note: 'Slots print a paper ticket instead of dropping coins.' },
    { name: 'Mobile Sportsbook', first: 2018, note: 'Bettors place wagers on games from a phone.' },
  ],
  nightclub: [
    { name: 'Dance Floor Sound Rig', first: 1975, note: 'A big speaker system tuned for a dance floor, with a DJ mixing two records.' },
    { name: 'Laser Light Show', first: 1985, note: 'Lasers sweep the room in time with the music.' },
    { name: 'LED Video Wall Stage', first: 2006, note: 'A wall of LED panels behind the DJ plays visuals in time with the set.' },
  ],
  stripClub: [
    { name: 'VIP Lounge Wing', first: 1980, note: 'A separate wing with its own bar and table service for big spenders.' },
    { name: 'Online Table Booking', first: 2005, note: 'Guests reserve a table on a website before they arrive.' },
    { name: 'Cashless Entry Wristbands', first: 2012, note: 'A wristband opens the door and holds a tab, so no one carries cash.' },
  ],
  solar: [
    { name: 'Photovoltaic Power Plant', first: 1982, note: 'Rows of panels that feed the grid directly.' },
    { name: 'Floating Solar Array', first: 2013, note: 'Panels on floats over a reservoir, cooled by the water.' },
    { name: 'Perovskite Tandem Panels', first: 2027, note: 'Two cell layers stacked in one panel, so it captures more of the sunlight.' },
  ],
  battery: [
    { name: 'Lithium-Ion Cell Line', first: 1991, note: 'Cells that hold more charge per kilo than nickel batteries.' },
    { name: 'Sodium-Ion Cell', first: 2023, note: 'A cell built on sodium rather than lithium, which is cheaper and easier to source.' },
    { name: 'Solid-State Cell Line', first: 2028, note: 'Cells with a solid electrolyte that store more and can charge faster.' },
  ],
  water: [
    { name: 'Chlorination Plant', first: 1908, note: 'Chlorine is dosed into the supply at the treatment plant to kill disease.' },
    { name: 'Reverse Osmosis Plant', first: 1965, note: 'Salty water is pushed through fine membranes that hold the salt back.' },
    { name: 'Leak-Sensing Mains', first: 2012, note: 'Acoustic sensors on the pipes pinpoint leaks before they surface.' },
  ],
  recycling: [
    { name: 'Eddy Current Separator', first: 1980, note: 'A spinning magnet throws aluminum cans out of the mixed waste stream.' },
    { name: 'Optical Sorting Line', first: 1995, note: 'Sensors identify each piece by material and air jets sort it.' },
    { name: 'Chemical Recycling Plant', first: 2021, note: 'Plastic is broken down to its chemicals and made into new plastic.' },
  ],
  telecom: [
    { name: 'Direct Distance Dialing', first: 1951, note: 'Callers dial long-distance numbers themselves, with no operator.' },
    { name: 'Cell Tower Network', first: 1979, note: 'A grid of cell towers hands a moving call from one tower to the next.' },
    { name: 'Standalone 5G Network', first: 2019, note: 'A 5G network with its own core, instead of leaning on the 4G one.' },
  ],
  dataCenter: [
    { name: 'Colocation Hall', first: 1998, note: 'Customers bring their own servers and rent rack space and power.' },
    { name: 'Hyperscale Cloud Region', first: 2006, note: 'Several huge halls act as one region that customers rent by the hour.' },
    { name: 'Liquid-Cooled GPU Hall', first: 2022, note: 'Pipes of coolant run to the chips so racks of GPUs can sit close together.' },
  ],
  education: [
    { name: 'Televised Lessons', first: 1953, note: 'Classes broadcast by television to schools and homes.' },
    { name: 'Open Online Courses', first: 2012, note: 'University courses open to anyone online, with thousands enrolled at once.' },
    { name: 'AI Tutor Platform', first: 2023, note: 'Each student gets a software tutor that adapts the questions.' },
  ],
  petCare: [
    { name: 'Mobile Grooming Van', first: 1985, note: 'A fitted van that grooms the pet in the owner’s driveway.' },
    { name: 'Pet Hotel Suites', first: 1995, note: 'Dogs board in private rooms with a bed and a daily walk.' },
    { name: 'Pet Cam Daycare', first: 2012, note: 'Owners watch their pet at daycare on a live video feed.' },
  ],
  homeCare: [
    { name: 'Hot-Water Carpet Extraction', first: 1965, note: 'A van engine drives hot-water hoses into the house and sucks the dirt back out.' },
    { name: 'App-Booked Cleaners', first: 2012, note: 'Customers book and pay for a cleaner on a phone for the next day.' },
    { name: 'Smart Home Sensor Plans', first: 2016, note: 'Sensors flag leaks and worn parts, and a technician comes before they fail.' },
  ],
  packaging: [
    { name: 'Corrugated Shipping Boxes', first: 1900, note: 'Fluted paperboard boxes that are light and strong enough to ship goods.' },
    { name: 'Aseptic Carton Line', first: 1961, note: 'Milk and juice are filled in sterile cartons that keep for months without a fridge.' },
    { name: 'Compostable Film', first: 2010, note: 'Wrap made from plant starch that breaks down in a compost heap.' },
  ],
  furniture: [
    { name: 'Molded Plywood Chairs', first: 1946, note: 'Chairs shaped from bent plywood in a mold, light and cheap to make.' },
    { name: 'Flat-Pack Range', first: 1956, note: 'Furniture ships in flat boxes and the customer assembles it at home.' },
    { name: 'Sit-Stand Desk Range', first: 2012, note: 'Desks with a motor that lifts the top to standing height.' },
  ],
  travel: [
    { name: 'Charter Package Holidays', first: 1950, note: 'A flight and a hotel sold at one price on chartered planes.' },
    { name: 'Computer Booking System', first: 1976, note: 'Agents see seats and rooms on a terminal and book them instantly.' },
    { name: 'Online Booking Engine', first: 1996, note: 'Travelers search and book trips on the agency’s own website.' },
  ],
}

const NONE: readonly Breakthrough[] = Object.freeze([])

/** The breakthroughs an industry can develop, in catalogue order (empty for an unknown id). */
export function breakthroughsFor(industry: string): readonly Breakthrough[] {
  return Object.prototype.hasOwnProperty.call(BREAKTHROUGHS, industry) ? BREAKTHROUGHS[industry] : NONE
}

let byName: Map<string, Breakthrough> | null = null

/** A breakthrough by its exact name, across every industry (null for anything else). */
export function breakthroughByName(name: string): Breakthrough | null {
  if (!byName) {
    byName = new Map()
    for (const list of Object.values(BREAKTHROUGHS)) for (const b of list) byName.set(b.name, b)
  }
  return byName.get(name) ?? null
}
