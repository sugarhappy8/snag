// The Heavy R&D catalogue: five breakthrough products per industry. A breakthrough is a kind of
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
    { name: 'Solar Roof Kitchen', first: 2012, note: 'Panels on the roof run the fridges and lights all day without a generator.' },
    { name: 'Cashless Tap-to-Pay Window', first: 2014, note: 'Customers tap a card or phone at the window and the line moves twice as fast.' },
    { name: 'Robotic Fry Station', first: 2018, note: 'A robot arm lifts the fryer baskets through the lunch rush.' },
    { name: 'Electric Kitchen Truck', first: 2019, note: 'A truck that cooks on batteries and shore power, with no generator running.' },
  ],
  restaurant: [
    { name: 'Conveyor Sushi Belt', first: 1958, note: 'Plates ride a belt past the tables and diners take what they like.' },
    { name: 'Open Kitchen Theater', first: 1975, note: 'The kitchen is moved into the dining room so guests watch every plate being made.' },
    { name: 'Sous-Vide Kitchen Line', first: 2005, note: 'Food is sealed in bags and cooked in water baths, so every steak comes out the same.' },
    { name: 'Tableside Ordering Screens', first: 2010, note: 'Guests order and pay from a screen at the table, and the kitchen gets the ticket at once.' },
    { name: 'Robot Server Fleet', first: 2020, note: 'Wheeled robots carry plates from the pass to the tables.' },
  ],
  cafe: [
    { name: 'Espresso Bar Counter', first: 1950, note: 'A lever espresso machine on the counter pulls a shot in thirty seconds.' },
    { name: 'Single-Origin Pour-Over Bar', first: 2008, note: 'Each cup is brewed by hand from beans traced to one farm.' },
    { name: 'Nitro Cold Brew Taps', first: 2013, note: 'Cold brew charged with nitrogen and poured from a tap like a stout.' },
    { name: 'Order-Ahead Pickup Shelf', first: 2014, note: 'Customers order and pay on a phone, then collect from a shelf with no queue.' },
    { name: 'Robotic Barista Kiosk', first: 2019, note: 'A glass kiosk where a robot arm brews the coffee and hands over the cup.' },
  ],
  bakery: [
    { name: 'Steam-Injection Deck Ovens', first: 1880, note: 'Ovens that spray steam at the start of the bake for a crackling crust.' },
    { name: 'Sliced and Wrapped Loaf', first: 1928, note: 'A machine slices the loaf and wraps it before it leaves the bakery.' },
    { name: 'Par-Baked Frozen Dough', first: 1960, note: 'Dough is part-baked and frozen, then finished in shop ovens when needed.' },
    { name: 'Gluten-Free Dedicated Bakehouse', first: 2008, note: 'A separate bakehouse where no wheat flour ever enters.' },
    { name: 'Robotic Bread Line', first: 2014, note: 'Robots move the trays and shape the dough on a line that runs overnight.' },
  ],
  bar: [
    { name: 'Soda Gun System', first: 1960, note: 'One hose at the bar pours every mixer from a rack of syrups in the cellar.' },
    { name: 'Digital Jukebox Network', first: 1998, note: 'A jukebox that pulls its songs from a central library over the network.' },
    { name: 'Clear Ice Program', first: 2010, note: 'Big crystal-clear ice blocks are cut by hand so drinks dilute slowly.' },
    { name: 'Self-Pour Tap Wall', first: 2011, note: 'Guests pour their own beer from a wall of taps and pay by the ounce.' },
    { name: 'Robotic Cocktail Bar', first: 2014, note: 'Two robot arms mix cocktails to order at a counter.' },
  ],
  brewery: [
    { name: 'Canned Beer Line', first: 1935, note: 'A line that fills and seams steel cans, so the beer travels and stores easily.' },
    { name: 'Stainless Conical Fermenters', first: 1965, note: 'Steel tanks that ferment, settle and dump the yeast without moving the beer.' },
    { name: 'Hop Extract Process', first: 1970, note: 'Hop oils are pulled out as an extract so a beer gets its aroma with less waste.' },
    { name: 'Dealcoholizing Plant', first: 1985, note: 'A vacuum still that takes the alcohol out of finished beer.' },
    { name: 'Self-Adjusting Brewhouse', first: 2020, note: 'Sensors and software tune each batch of mash and boil with no brewer at the controls.' },
  ],
  grocery: [
    { name: 'Self-Service Aisles', first: 1916, note: 'Customers pick goods from open shelves and pay at one counter.' },
    { name: 'Refrigerated Display Cases', first: 1930, note: 'Open chilled cases let shoppers pick meat and milk themselves.' },
    { name: 'Barcode Scanning Checkout', first: 1974, note: 'Each pack carries a printed code and the till reads it with a laser.' },
    { name: 'Electronic Shelf Labels', first: 1995, note: 'Prices on every shelf update from one computer in seconds.' },
    { name: 'Cashierless Checkout', first: 2018, note: 'Cameras and shelf sensors track what a shopper takes and charge them on the way out.' },
  ],
  fashion: [
    { name: 'Ready-to-Wear Sizing System', first: 1920, note: 'Clothes cut to standard sizes and sold off the rack instead of made to order.' },
    { name: 'Nylon Collection', first: 1939, note: 'Garments cut from nylon, which dries fast and needs no ironing.' },
    { name: 'Spandex Stretch Line', first: 1962, note: 'Cloth woven with spandex that stretches and returns to shape.' },
    { name: 'Recycled Polyester Line', first: 1995, note: 'Garments woven from fibers spun out of old plastic bottles.' },
    { name: 'Seamless 3D Knit Line', first: 2012, note: 'Sweaters and shoe uppers are knit in one piece by machine, with almost no offcuts.' },
  ],
  beauty: [
    { name: 'Waterproof Mascara', first: 1938, note: 'A mascara that holds through rain, tears and swimming.' },
    { name: 'Retinol Night Cream', first: 1984, note: 'A cream with vitamin A that smooths fine lines over a few months.' },
    { name: 'Liposome Skin Cream', first: 1986, note: 'A cream that carries its active ingredients in tiny fat capsules.' },
    { name: 'Forty-Shade Foundation Range', first: 2017, note: 'Foundation sold in forty shades, so most customers find a match in the store.' },
    { name: 'Skin-Scan Custom Serum', first: 2018, note: 'A phone scan of the skin sets the mix for a serum blended to order.' },
  ],
  salon: [
    { name: 'Permanent Wave Machine', first: 1909, note: 'A heated machine that sets lasting curls into straight hair.' },
    { name: 'Hooded Dryer Row', first: 1925, note: 'A row of hooded dryers lets clients dry their hair while they sit and read.' },
    { name: 'Keratin Smoothing Treatment', first: 2005, note: 'A salon treatment that straightens frizzy hair for a few months.' },
    { name: 'Gel Nail Lamp Bar', first: 2010, note: 'Gel polish cured under a small lamp, so nails come out dry and hard.' },
    { name: 'Virtual Try-On Mirror', first: 2016, note: 'A mirror camera shows a client a new color or cut before anything is snipped.' },
  ],
  gym: [
    { name: 'Selectorized Machine Floor', first: 1970, note: 'Weight stacks with a pin let members change the load without plates.' },
    { name: 'Aerobics Hall', first: 1975, note: 'A sprung-floor room for classes led to music.' },
    { name: 'Climbing Wall Hall', first: 1990, note: 'Indoor walls with colored holds, so members climb all year.' },
    { name: 'Streamed Class Library', first: 2013, note: 'Live and recorded classes streamed to members at home.' },
    { name: 'Smart Strength Machines', first: 2018, note: 'Machines that set the weight with a motor and count every rep.' },
  ],
  autoShop: [
    { name: 'Hydraulic Car Lift', first: 1925, note: 'Lifts the whole car overhead so mechanics stand underneath it.' },
    { name: 'Computerized Wheel Alignment', first: 1985, note: 'Sensors on the wheels feed a computer that sets the angles.' },
    { name: 'OBD Diagnostic Bay', first: 1996, note: 'A bay with a scan tool that reads fault codes from the car’s computer.' },
    { name: 'EV Battery Repair Bay', first: 2015, note: 'A bay that swaps and repairs single modules inside an electric car battery.' },
    { name: 'ADAS Calibration Bay', first: 2018, note: 'Targets and software that realign a car’s cameras and radar after a repair.' },
  ],
  construction: [
    { name: 'Steel-Frame Skyscraper System', first: 1900, note: 'A riveted steel skeleton that carries the walls, so buildings rise forty floors.' },
    { name: 'Prestressed Concrete Beams', first: 1935, note: 'Beams cast with tensioned steel carry longer spans with less concrete.' },
    { name: 'Tower Crane Fleet', first: 1950, note: 'Tower cranes that climb with the building and reach any corner of the site.' },
    { name: 'Cross-Laminated Timber Frames', first: 2009, note: 'Panels of glued timber layers strong enough to build an office block.' },
    { name: '3D-Printed Houses', first: 2018, note: 'A gantry printer lays the walls in concrete, layer by layer.' },
  ],
  realEstate: [
    { name: 'Model Home Showcase', first: 1950, note: 'A fully furnished home on the site lets buyers walk through before they buy.' },
    { name: 'Multiple Listing Service', first: 1970, note: 'Agents pool their listings so any of them can sell any home.' },
    { name: 'Online Listing Portal', first: 1996, note: 'Homes appear on a website with photos and prices, open to any buyer.' },
    { name: 'Instant Cash Offers', first: 2014, note: 'The agency buys the home itself at a posted price and resells it later.' },
    { name: '3D Walkthrough Listings', first: 2014, note: 'Buyers walk through a home on a screen before they ever visit.' },
  ],
  software: [
    { name: 'Spreadsheet Package', first: 1979, note: 'A program that recalculates a whole table when one number changes.' },
    { name: 'Relational Database Engine', first: 1979, note: 'A database that answers questions written in a simple query language.' },
    { name: 'Hosted Subscription Platform', first: 1999, note: 'Customers log in to software run on the company’s servers and pay by the month.' },
    { name: 'Open-Source Cloud Toolkit', first: 2014, note: 'Free tools that run software on any cloud, with paid support on top.' },
    { name: 'Autonomous Agent Platform', first: 2025, note: 'Software agents that carry out tasks across a client’s systems on their own.' },
  ],
  gameStudio: [
    { name: '3D Graphics Engine', first: 1993, note: 'A reusable engine that draws full 3D worlds on a home computer.' },
    { name: 'Persistent Online World', first: 1997, note: 'One shared game world that stays up while thousands of players log in and out.' },
    { name: 'Live-Service Game', first: 2012, note: 'A game that never ships a final version and adds a new season every few months.' },
    { name: 'Motion-Tracked VR Game', first: 2016, note: 'A game played in a headset that follows every turn of the head.' },
    { name: 'Cloud-Streamed Game Library', first: 2019, note: 'Games run on remote servers and stream to any screen.' },
  ],
  ecommerce: [
    { name: 'Saved-Card Checkout', first: 1999, note: 'A returning shopper buys with one click on a saved card and address.' },
    { name: 'Recommendation Engine', first: 2000, note: 'The store suggests products based on what similar shoppers bought.' },
    { name: 'Robotic Warehouse Floor', first: 2012, note: 'Robots bring the shelves to the packers instead of packers walking to the shelves.' },
    { name: 'One-Hour Dark Store Network', first: 2020, note: 'Small closed warehouses in town deliver orders within the hour.' },
    { name: 'Drone Delivery Hub', first: 2022, note: 'Small parcels leave a hub by drone and land at the customer’s door.' },
  ],
  marketing: [
    { name: 'Radio Jingle Studio', first: 1926, note: 'Catchy sung slogans written and recorded for radio ads.' },
    { name: 'Television Spot Campaigns', first: 1948, note: 'Short spots bought on local and network television.' },
    { name: 'Search Ad Desk', first: 2002, note: 'A team that bids on search keywords and bills clients for each click.' },
    { name: 'Programmatic Ad Exchange', first: 2010, note: 'Ads are bought and placed automatically, one viewer at a time, in milliseconds.' },
    { name: 'Influencer Marketplace', first: 2015, note: 'Brands book creators for sponsored posts through one platform.' },
  ],
  clinic: [
    { name: 'Ultrasound Imaging Suite', first: 1965, note: 'Sound waves show organs and babies on a screen with no radiation.' },
    { name: 'Day Surgery Unit', first: 1970, note: 'Patients have a short operation and go home the same day.' },
    { name: 'MRI Scanner Suite', first: 1985, note: 'A magnet scans soft tissue in detail, with no radiation.' },
    { name: 'Robotic Surgery Theater', first: 2000, note: 'Surgeons operate through small cuts with robot arms they steer from a console.' },
    { name: 'AI Scan Reading', first: 2019, note: 'Software reads scans first and flags the ones a doctor should look at.' },
  ],
  hotel: [
    { name: 'Air-Conditioned Rooms', first: 1925, note: 'Every guest room cooled by a central plant on hot nights.' },
    { name: 'Central Booking System', first: 1965, note: 'Every hotel in the group books rooms through one central reservations office.' },
    { name: 'Keycard Door Locks', first: 1975, note: 'Plastic cards replace brass keys, and a lost card is simply recoded.' },
    { name: 'Phone-Key Check-In', first: 2014, note: 'Guests skip the desk and open their room door with a phone.' },
    { name: 'Robot Room Delivery', first: 2015, note: 'A small robot carries towels and snacks up to the guest rooms.' },
  ],
  logistics: [
    { name: 'Pallet Racking Warehouse', first: 1940, note: 'Goods on standard pallets stack high on steel racks and move by forklift.' },
    { name: 'Containerized Freight', first: 1956, note: 'Goods travel in sealed steel boxes that move between ship and truck unopened.' },
    { name: 'Satellite Fleet Tracking', first: 1995, note: 'Each truck reports where it is, so dispatch sees the whole fleet on one map.' },
    { name: 'Electric Truck Fleet', first: 2020, note: 'Battery trucks run city routes and charge overnight at the depot.' },
    { name: 'Driverless Truck Lanes', first: 2025, note: 'Trucks drive the highway legs with no one at the wheel, and a driver meets them at each end.' },
  ],
  manufacturing: [
    { name: 'Moving Assembly Line', first: 1913, note: 'Work moves past fixed stations on a belt, and each worker does one task.' },
    { name: 'Numerical Control Cell', first: 1955, note: 'Machine tools run from punched tape instead of a machinist’s hands.' },
    { name: 'Industrial Robot Cell', first: 1961, note: 'Robot arms weld and paint in a cell fenced off from the workers.' },
    { name: 'Metal 3D Printing Line', first: 2014, note: 'Parts are built up in powdered metal by laser instead of cut from a block.' },
    { name: 'Digital Twin Factory', first: 2017, note: 'A computer copy of the factory tests every change before the line moves.' },
  ],
  farm: [
    { name: 'Hybrid Seed Program', first: 1930, note: 'Seed bred from two inbred lines gives a bigger and more even crop.' },
    { name: 'Center-Pivot Irrigation', first: 1952, note: 'A long sprinkler arm rolls in a circle and waters a whole field.' },
    { name: 'Satellite-Guided Tractors', first: 1998, note: 'Tractors steer by satellite and keep each row straight to the inch.' },
    { name: 'Vertical Growing Hall', first: 2013, note: 'Crops grow in stacked trays under LED lights, indoors all year.' },
    { name: 'Gene-Edited Crop Line', first: 2020, note: 'Crops edited to resist drought and disease without foreign genes.' },
  ],
  energy: [
    { name: 'Nuclear Reactor Unit', first: 1957, note: 'A reactor heats the steam for the turbines, and fuel lasts months between reloads.' },
    { name: 'Wind Turbine Farm', first: 1980, note: 'Rows of tall turbines turn the wind into grid power.' },
    { name: 'Combined-Cycle Gas Plant', first: 1985, note: 'Waste heat from a gas turbine makes steam for a second turbine.' },
    { name: 'Grid-Scale Battery Plant', first: 2015, note: 'A field of battery containers stores power at noon and sells it at night.' },
    { name: 'Fusion Pilot Plant', first: 2035, note: 'A pilot plant that tries to make steam by fusing hydrogen.' },
  ],
  entertainment: [
    { name: 'Drive-In Cinema', first: 1933, note: 'A huge outdoor screen where the audience watches from their cars.' },
    { name: 'Stadium Tour', first: 1965, note: 'One act sells tens of thousands of tickets for a single stadium night.' },
    { name: 'Hologram Headliner', first: 2012, note: 'A projected performer on stage, with a live band underneath.' },
    { name: 'Immersive Projection Venue', first: 2017, note: 'Every wall and floor of a hall is covered in moving projected art.' },
    { name: 'Livestream Concert Series', first: 2020, note: 'Ticketed shows streamed from an empty hall to fans at home.' },
  ],
  semiconductor: [
    { name: 'Microprocessor Design', first: 1971, note: 'A whole processor etched on one chip.' },
    { name: 'EUV Lithography Line', first: 2019, note: 'Chips printed with extreme ultraviolet light to draw much finer circuits.' },
    { name: 'Chiplet Interconnect Standard', first: 2020, note: 'Small chips from different factories join in one package like building blocks.' },
    { name: 'Backside Power Delivery', first: 2024, note: 'Power runs underneath the transistors, leaving the top for signals.' },
    { name: 'Gate-All-Around Process', first: 2025, note: 'Transistors whose gate wraps the channel on every side, for tighter control of current.' },
  ],
  aiLab: [
    { name: 'Speech Recognition Engine', first: 2010, note: 'Software that writes down what people say with few mistakes.' },
    { name: 'Large Language Model', first: 2019, note: 'A model trained on much of the web to continue any text it is given.' },
    { name: 'Reasoning Model', first: 2024, note: 'A model that works through a problem in steps before it answers.' },
    { name: 'Embodied Robot Brain', first: 2028, note: 'One model that drives many kinds of robot from cameras and touch.' },
    { name: 'Autonomous Research Agent', first: 2030, note: 'An agent that designs and runs its own experiments.' },
  ],
  robotics: [
    { name: 'Programmable Welding Robot', first: 1961, note: 'A robot arm that repeats a stored welding path on every car body.' },
    { name: 'Collaborative Robot Arm', first: 2008, note: 'A light arm that works beside people and stops when it touches someone.' },
    { name: 'Legged Inspection Robot', first: 2019, note: 'A four-legged robot that walks a plant floor and logs readings from the gauges.' },
    { name: 'Humanoid Warehouse Worker', first: 2026, note: 'A two-legged robot that moves totes in aisles built for people.' },
    { name: 'Robotic Hand With Touch', first: 2030, note: 'A hand with skin sensors that grips an egg or a hammer correctly.' },
  ],
  biotech: [
    { name: 'Recombinant Insulin', first: 1982, note: 'Human insulin made by bacteria carrying the human gene.' },
    { name: 'Monoclonal Antibody', first: 1986, note: 'A lab-made antibody that hunts one target in the body.' },
    { name: 'CAR-T Cell Therapy', first: 2017, note: 'A patient’s own immune cells are reprogrammed to kill their cancer.' },
    { name: 'Messenger RNA Vaccine', first: 2020, note: 'A vaccine that teaches cells to make one viral protein, built to order from a sequence.' },
    { name: 'Gene-Editing Therapy', first: 2023, note: 'A one-time treatment that edits a patient’s own cells to correct a fault.' },
  ],
  spaceTech: [
    { name: 'Small Satellite Bus', first: 2000, note: 'A standard satellite frame that customers fill with their own instruments.' },
    { name: 'Reusable Booster', first: 2015, note: 'The first stage flies back and lands for another launch.' },
    { name: 'Lunar Cargo Lander', first: 2024, note: 'An uncrewed lander that carries customers’ cargo to the Moon’s surface.' },
    { name: 'Orbital Manufacturing Module', first: 2028, note: 'A capsule that makes crystals and fibers in zero gravity and lands them.' },
    { name: 'Orbital Fuel Depot', first: 2030, note: 'A tank in orbit that refuels other spacecraft.' },
  ],
  electricVehicles: [
    { name: 'Skateboard Chassis Platform', first: 2012, note: 'The battery and motors sit in one flat base that carries any body.' },
    { name: 'Bidirectional Charging Car', first: 2012, note: 'A car that powers a house during a blackout.' },
    { name: 'Battery Swap Station', first: 2014, note: 'A robot swaps an empty battery for a full one in five minutes.' },
    { name: 'Driverless Robotaxi', first: 2020, note: 'Cars that carry paying riders with no driver on board.' },
    { name: 'Solid-State Battery Car', first: 2027, note: 'A car with solid electrolyte cells for more range and faster charging.' },
  ],
  quantum: [
    { name: 'Quantum Annealer', first: 2011, note: 'A machine that finds low-energy answers to optimization problems.' },
    { name: 'Trapped-Ion Processor', first: 2016, note: 'Qubits held in electric fields and steered by lasers.' },
    { name: 'Error-Corrected Logical Qubit', first: 2023, note: 'Many physical qubits act as one that holds its state longer.' },
    { name: 'Quantum Network Link', first: 2028, note: 'Two machines in different cities share entangled qubits.' },
    { name: 'Fault-Tolerant Quantum Computer', first: 2032, note: 'A machine that runs long programs while correcting its own errors.' },
  ],
  cybersecurity: [
    { name: 'Antivirus Scanner', first: 1987, note: 'Software that spots known viruses on a disk and removes them.' },
    { name: 'Network Firewall', first: 1992, note: 'A gateway that blocks traffic by rule between a company and the outside.' },
    { name: 'Endpoint Detection Platform', first: 2013, note: 'Agents on every laptop report odd behavior to a central console.' },
    { name: 'Zero-Trust Access Gateway', first: 2017, note: 'Every login is checked every time, wherever the worker is.' },
    { name: 'Autonomous Threat Response', first: 2024, note: 'Software isolates an attacked machine within seconds, before an analyst is paged.' },
  ],
  investmentFirm: [
    { name: 'Money Market Fund', first: 1971, note: 'A fund that holds short loans and pays more than a savings account.' },
    { name: 'Index Fund Range', first: 1976, note: 'Funds that hold a whole market’s shares at a very low fee.' },
    { name: 'Exchange-Traded Fund Range', first: 1993, note: 'Index funds that trade on an exchange all day like a share.' },
    { name: 'Robo-Advisor Portfolios', first: 2008, note: 'Software builds and rebalances a portfolio from a few questions.' },
    { name: 'Direct Indexing Accounts', first: 2018, note: 'Each client owns the shares of an index directly, which saves them tax.' },
  ],
  bank: [
    { name: 'Drive-Through Teller Lane', first: 1950, note: 'Customers bank from their car through a window.' },
    { name: 'Credit Card Program', first: 1958, note: 'A card that lets customers borrow at shops and repay the bank each month.' },
    { name: 'Cash Machine Network', first: 1967, note: 'Customers withdraw cash from a machine on the street at any hour.' },
    { name: 'Mobile Check Deposit', first: 2009, note: 'Customers photograph a check with a phone and the bank credits it.' },
    { name: 'Instant Payments Rail', first: 2017, note: 'Money moves between banks in seconds, any hour of any day.' },
  ],
  onlineBank: [
    { name: 'Internet Banking Portal', first: 1995, note: 'Customers check balances and pay bills on a website.' },
    { name: 'Instant Digital Card', first: 2015, note: 'A card number issued in the app in seconds, before the plastic arrives.' },
    { name: 'Savings Round-Ups', first: 2016, note: 'Each card purchase rounds up and the change goes into savings.' },
    { name: 'Open Banking Gateway', first: 2018, note: 'Customers let approved apps read their accounts through a secure interface.' },
    { name: 'Early Paycheck Deposit', first: 2018, note: 'Wages land two days early because the bank pays as soon as it is told.' },
  ],
  casino: [
    { name: 'Video Poker Machines', first: 1979, note: 'Machines that deal a hand of poker on a screen.' },
    { name: 'Progressive Jackpot Network', first: 1986, note: 'Slot machines across several casinos feed one growing jackpot.' },
    { name: 'Ticket-Voucher Slots', first: 1999, note: 'Slots print a paper ticket instead of dropping coins.' },
    { name: 'Skill-Based Gaming Floor', first: 2016, note: 'Machines where the player’s skill, not only luck, decides the payout.' },
    { name: 'Mobile Sportsbook', first: 2018, note: 'Bettors place wagers on games from a phone.' },
  ],
  nightclub: [
    { name: 'Dance Floor Sound Rig', first: 1975, note: 'A big speaker system tuned for a dance floor, with a DJ mixing two records.' },
    { name: 'Laser Light Show', first: 1985, note: 'Lasers sweep the room in time with the music.' },
    { name: 'Silent Disco Headsets', first: 2005, note: 'Dancers wear wireless headphones and pick one of three DJs.' },
    { name: 'LED Video Wall Stage', first: 2006, note: 'A wall of LED panels behind the DJ plays visuals in time with the set.' },
    { name: 'Spatial Sound Room', first: 2019, note: 'Dozens of speakers place every sound in the room around the dancers.' },
  ],
  stripClub: [
    { name: 'VIP Lounge Wing', first: 1980, note: 'A separate wing with its own bar and table service for big spenders.' },
    { name: 'Themed Stage Productions', first: 1995, note: 'Shows with a story, costumes and lighting cues instead of one song each.' },
    { name: 'Online Table Booking', first: 2005, note: 'Guests reserve a table on a website before they arrive.' },
    { name: 'Cashless Entry Wristbands', first: 2012, note: 'A wristband opens the door and holds a tab, so no one carries cash.' },
    { name: 'Member Loyalty App', first: 2015, note: 'Regulars book tables and earn perks on their phone.' },
  ],
  solar: [
    { name: 'Photovoltaic Power Plant', first: 1982, note: 'Rows of panels that feed the grid directly.' },
    { name: 'Single-Axis Tracker Rows', first: 2005, note: 'Panels tilt through the day to follow the Sun.' },
    { name: 'Floating Solar Array', first: 2013, note: 'Panels on floats over a reservoir, cooled by the water.' },
    { name: 'Agrivoltaic Fields', first: 2018, note: 'Panels raised high so crops and sheep share the land underneath.' },
    { name: 'Perovskite Tandem Panels', first: 2027, note: 'Two cell layers stacked in one panel, so it captures more of the sunlight.' },
  ],
  battery: [
    { name: 'Lithium-Ion Cell Line', first: 1991, note: 'Cells that hold more charge per kilo than nickel batteries.' },
    { name: 'Lithium Iron Phosphate Line', first: 2005, note: 'Cells built with iron phosphate that last longer and rarely catch fire.' },
    { name: 'Sodium-Ion Cell', first: 2023, note: 'A cell built on sodium rather than lithium, which is cheaper and easier to source.' },
    { name: 'Silicon Anode Cell', first: 2025, note: 'Cells with silicon in the anode that hold far more charge.' },
    { name: 'Solid-State Cell Line', first: 2028, note: 'Cells with a solid electrolyte that store more and can charge faster.' },
  ],
  water: [
    { name: 'Chlorination Plant', first: 1908, note: 'Chlorine is dosed into the supply at the treatment plant to kill disease.' },
    { name: 'UV Disinfection Plant', first: 1955, note: 'Ultraviolet lamps kill germs in the water without chemicals.' },
    { name: 'Reverse Osmosis Plant', first: 1965, note: 'Salty water is pushed through fine membranes that hold the salt back.' },
    { name: 'Leak-Sensing Mains', first: 2012, note: 'Acoustic sensors on the pipes pinpoint leaks before they surface.' },
    { name: 'Atmospheric Water Generators', first: 2018, note: 'Machines that pull drinking water out of humid air.' },
  ],
  recycling: [
    { name: 'Eddy Current Separator', first: 1980, note: 'A spinning magnet throws aluminum cans out of the mixed waste stream.' },
    { name: 'Optical Sorting Line', first: 1995, note: 'Sensors identify each piece by material and air jets sort it.' },
    { name: 'Single-Stream Sorting Plant', first: 1995, note: 'Households put every recyclable in one bin and the plant sorts it.' },
    { name: 'Battery Material Recovery', first: 2019, note: 'Old batteries are broken down and their lithium and nickel sold again.' },
    { name: 'Chemical Recycling Plant', first: 2021, note: 'Plastic is broken down to its chemicals and made into new plastic.' },
  ],
  telecom: [
    { name: 'Direct Distance Dialing', first: 1951, note: 'Callers dial long-distance numbers themselves, with no operator.' },
    { name: 'Cell Tower Network', first: 1979, note: 'A grid of cell towers hands a moving call from one tower to the next.' },
    { name: 'Undersea Fiber Cable', first: 1988, note: 'A glass cable on the ocean floor carries calls and data between continents.' },
    { name: 'Standalone 5G Network', first: 2019, note: 'A 5G network with its own core, instead of leaning on the 4G one.' },
    { name: 'Satellite-to-Phone Service', first: 2024, note: 'Ordinary phones send texts through satellites where there is no tower.' },
  ],
  dataCenter: [
    { name: 'Colocation Hall', first: 1998, note: 'Customers bring their own servers and rent rack space and power.' },
    { name: 'Hyperscale Cloud Region', first: 2006, note: 'Several huge halls act as one region that customers rent by the hour.' },
    { name: 'Free-Air Cooling Hall', first: 2008, note: 'Outside air cools the servers most of the year, with no chillers running.' },
    { name: 'Immersion-Cooled Server Racks', first: 2019, note: 'Servers sit in tanks of liquid that carries the heat away.' },
    { name: 'Liquid-Cooled GPU Hall', first: 2022, note: 'Pipes of coolant run to the chips so racks of GPUs can sit close together.' },
  ],
  education: [
    { name: 'Correspondence Degree', first: 1910, note: 'Lessons and exams by post, so students learn from home.' },
    { name: 'Televised Lessons', first: 1953, note: 'Classes broadcast by television to schools and homes.' },
    { name: 'Open Online Courses', first: 2012, note: 'University courses open to anyone online, with thousands enrolled at once.' },
    { name: 'VR Lab Classroom', first: 2018, note: 'Students run science experiments in a headset with no lab needed.' },
    { name: 'AI Tutor Platform', first: 2023, note: 'Each student gets a software tutor that adapts the questions.' },
  ],
  petCare: [
    { name: 'Pet Insurance Plans', first: 1982, note: 'Owners pay a monthly fee and vet bills are covered.' },
    { name: 'Mobile Grooming Van', first: 1985, note: 'A fitted van that grooms the pet in the owner’s driveway.' },
    { name: 'Pet Hotel Suites', first: 1995, note: 'Dogs board in private rooms with a bed and a daily walk.' },
    { name: 'Pet Cam Daycare', first: 2012, note: 'Owners watch their pet at daycare on a live video feed.' },
    { name: 'Fresh-Cooked Pet Meals', first: 2015, note: 'Meals cooked for each pet and delivered chilled to the door.' },
  ],
  homeCare: [
    { name: 'Home Security Patrols', first: 1950, note: 'Guards check on homes at night while owners are away.' },
    { name: 'Hot-Water Carpet Extraction', first: 1965, note: 'A van engine drives hot-water hoses into the house and sucks the dirt back out.' },
    { name: 'Heat Pump Install Crews', first: 2010, note: 'Teams swap old boilers for heat pumps in a single day.' },
    { name: 'App-Booked Cleaners', first: 2012, note: 'Customers book and pay for a cleaner on a phone for the next day.' },
    { name: 'Smart Home Sensor Plans', first: 2016, note: 'Sensors flag leaks and worn parts, and a technician comes before they fail.' },
  ],
  packaging: [
    { name: 'Corrugated Shipping Boxes', first: 1900, note: 'Fluted paperboard boxes that are light and strong enough to ship goods.' },
    { name: 'Plastic Bottle Blow Molding', first: 1958, note: 'Machines blow light plastic bottles that do not break when dropped.' },
    { name: 'Aseptic Carton Line', first: 1961, note: 'Milk and juice are filled in sterile cartons that keep for months without a fridge.' },
    { name: 'Compostable Film', first: 2010, note: 'Wrap made from plant starch that breaks down in a compost heap.' },
    { name: 'Molded Pulp Trays', first: 2015, note: 'Trays pressed from wet paper pulp that replace foam.' },
  ],
  furniture: [
    { name: 'Tubular Steel Chairs', first: 1926, note: 'Chairs bent from steel tube, light and nearly unbreakable.' },
    { name: 'Molded Plywood Chairs', first: 1946, note: 'Chairs shaped from bent plywood in a mold, light and cheap to make.' },
    { name: 'Flat-Pack Range', first: 1956, note: 'Furniture ships in flat boxes and the customer assembles it at home.' },
    { name: 'Memory Foam Mattresses', first: 1991, note: 'Mattresses that soften with body heat and mold to the sleeper.' },
    { name: 'Sit-Stand Desk Range', first: 2012, note: 'Desks with a motor that lifts the top to standing height.' },
  ],
  travel: [
    { name: 'Cruise Holiday Packages', first: 1900, note: 'A floating hotel visits several ports in one trip.' },
    { name: 'Charter Package Holidays', first: 1950, note: 'A flight and a hotel sold at one price on chartered planes.' },
    { name: 'Computer Booking System', first: 1976, note: 'Agents see seats and rooms on a terminal and book them instantly.' },
    { name: 'Online Booking Engine', first: 1996, note: 'Travelers search and book trips on the agency’s own website.' },
    { name: 'Mobile Trip Itinerary', first: 2010, note: 'Tickets, hotels and maps for a whole trip in one phone app.' },
  ],
  fusion: [
    { name: 'High-Temperature Superconducting Tokamak', first: 2021, note: 'A compact reactor whose magnets use tape that superconducts at higher heat.' },
    { name: 'Laser Inertial Fusion Driver', first: 2022, note: 'Lasers crush a fuel pellet so hard that it fuses.' },
    { name: 'Fusion Grid Power Plant', first: 2032, note: 'A plant that sells fusion electricity to the grid every hour of the day.' },
    { name: 'Aneutronic Fuel Cycle', first: 2036, note: 'A fuel mix that releases almost no neutrons and leaves the walls clean.' },
    { name: 'Fusion Ship Engine', first: 2040, note: 'A small reactor that drives a cargo ship across oceans without fuel stops.' },
  ],
  neurotech: [
    { name: 'Cochlear Implant', first: 1978, note: 'An implant that lets deaf people hear through the nerve of the inner ear.' },
    { name: 'Deep Brain Stimulator', first: 1997, note: 'Electrodes that calm the tremor of Parkinson’s disease.' },
    { name: 'Thought-to-Text Implant', first: 2023, note: 'Patients who cannot speak type sentences by thinking them.' },
    { name: 'Vision Restoration Implant', first: 2030, note: 'An implant in the visual cortex that gives blind people simple sight.' },
    { name: 'Memory Prosthesis', first: 2040, note: 'An implant that helps damaged memory circuits store new memories.' },
  ],
  drones: [
    { name: 'Quadcopter Flight Controller', first: 2010, note: 'A small board that keeps four rotors level without a skilled pilot.' },
    { name: 'Drone Swarm Show System', first: 2016, note: 'Hundreds of lit drones fly in formation to paint pictures in the sky.' },
    { name: 'Fixed-Wing Delivery Drone', first: 2016, note: 'A winged drone that flies medicine a hundred kilometers and drops it by parachute.' },
    { name: 'Electric Air Taxi', first: 2025, note: 'A four-seat aircraft that lifts off from a rooftop and flies on batteries.' },
    { name: 'Autonomous Cargo Aircraft', first: 2030, note: 'A pilotless plane that carries freight between small airports.' },
  ],
  carbonCapture: [
    { name: 'Basalt Mineralization Wells', first: 2014, note: 'Captured gas is pumped into basalt and turns to rock.' },
    { name: 'Direct Air Capture Unit', first: 2017, note: 'Fans push air through a filter that grabs carbon dioxide.' },
    { name: 'Bioenergy With Carbon Capture', first: 2019, note: 'A power plant burns crops and buries the carbon it releases.' },
    { name: 'Ocean Alkalinity Enhancement', first: 2025, note: 'Crushed minerals added to seawater let the ocean absorb more carbon.' },
    { name: 'Megaton Removal Hub', first: 2035, note: 'A region of capture plants and wells that removes a million tonnes a year.' },
  ],
  devices: [
    { name: 'Pen-Input Pocket Computer', first: 1993, note: 'A handheld computer you write on with a pen, for notes and addresses.' },
    { name: 'Pocket Music Player', first: 2001, note: 'A pocket player that holds hundreds of songs, with no tape or disc to carry.' },
    { name: 'Touch Slate Computer', first: 2010, note: 'A flat computer with a touch screen and no keyboard, for reading and browsing.' },
    { name: 'Foldable Display Phone', first: 2019, note: 'A phone with a screen that folds open to twice its size.' },
    { name: 'Spatial Headset Computer', first: 2024, note: 'A headset that sets screens and apps in the room around you.' },
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
