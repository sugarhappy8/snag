// The industries you can start a business in (43 operating sectors + 12 deep-tech). Every number is a US baseline for ONE
// outlet (a truck, a restaurant, an office, a plant) in a typical city; economy.ts scales it
// to each market with data/markets.ts (labor cost, rents, local prices, taxes, demand).
//
// Rough US first-year picture per outlet (before the owner's salary and corporate tax):
// food truck ~$80K profit on ~$290K sales, restaurant ~$250K on $1.3M, software ~$150K
// that scales well, energy ~$4M on a $35M plant. Tuned for gameplay, grounded in reality.
import type { Industry, PriceCategory } from '../data/markets'
import { FINANCE_INDUSTRIES } from './finance-firm-data'
import { VENUE_INDUSTRIES } from './venues-data'

export type StaffFocus = 'quality' | 'sales' | 'finance' | 'ops'

export interface RoleDef {
  title: string
  focus: StaffFocus
  /** US yearly salary for a solid hire. */
  pay: number
}

export interface IndustryDef {
  /** Missing on legacy sectors means the classic product/service engine. */
  model?: 'finance'
  id: Industry
  label: string
  emoji: string
  /** Plural unit, e.g. 'meals'. */
  unit: string
  /** Singular unit, e.g. 'meal'. */
  unitOne: string
  /** One outlet, e.g. 'truck', 'restaurant', 'office'. */
  site: string
  sitePlural: string
  blurb: string
  /** US consumer price per unit (tax included where it applies). */
  price: number
  /** US variable cost per unit (ingredients, parts, hosting, fuel...). */
  unitCost: number
  /** Share of the unit cost that tracks local wages/prices (the rest is globally priced). */
  localShare: number
  /** Inputs priced like this shop category (local duties/taxes on food, alcohol, fuel...). */
  costCat?: PriceCategory
  /** Selling price tracks this shop category locally. */
  priceCat?: PriceCategory
  /** 0-1: how global the selling price is (0 = purely local service, 1 = same price worldwide). */
  tradable: number
  /** Units one outlet sells in a year in a typical US city at the going price. */
  demand: number
  /** How fast sales fall when you charge above the going rate. */
  elasticity: number
  /** 0-1: how much sales volume depends on local incomes. */
  incomeSens: number
  /** Startup capital for the first outlet in the US (equipment, fit-out, opening stock). */
  capital: number
  /** Share of the capital that scales with local costs (fit-out, labor) vs imported kit. */
  capitalLocal: number
  /** Employees per outlet at normal volume. */
  staff: number
  /** US yearly wage per employee. */
  wage: number
  /** How staff needs grow with volume (1 = linear, 0.5 = scales well). */
  staffScale: number
  /** Yearly rent per outlet in the US. */
  rent: number
  /** Maintenance and depreciation, fraction of equipment per year. */
  maint: number
  /** Max production per outlet as a multiple of its base demand. */
  capMult: number
  /** Valuation multiple of yearly profit. */
  multiple: number
  /** 0-1: how far products and brand can grow demand. */
  growth: number
  /** Outlets the market supports per million people before you saturate it. */
  perMillion: number
  /** Share of the standard consumption tax that applies (0 = exempt or B2B). */
  taxShare: number
  /** Fraction of unsold stock that spoils or expires by next year (1 = services). */
  perishable: number
  food?: boolean
  needs?: 'drinking' | 'driver' | 'medical'
  roles: RoleDef[]
  products: string[]
  /** Default yearly marketing budget as a share of revenue. */
  marketingShare: number
  /** Default company name endings. */
  suffixes: string[]
}

const r = (title: string, focus: StaffFocus, pay: number): RoleDef => ({ title, focus, pay })

const BASE_INDUSTRIES = {
  foodTruck: {
    id: 'foodTruck', label: 'Food Truck', emoji: '\u{1F69A}', unit: 'meals', unitOne: 'meal', site: 'truck', sitePlural: 'trucks',
    blurb: 'Street food on wheels. Cheap to start, hard on the back.',
    price: 12, unitCost: 4.2, localShare: 0.5, costCat: 'food', tradable: 0, demand: 24_000, elasticity: 1.6, incomeSens: 0.3,
    capital: 55_000, capitalLocal: 0.35, staff: 2, wage: 30_000, staffScale: 0.9, rent: 15_000, maint: 0.1, capMult: 1.6,
    multiple: 2.5, growth: 0.4, perMillion: 15, taxShare: 1, perishable: 0.95, food: true, needs: 'driver', marketingShare: 0.03,
    roles: [r('Head Cook', 'quality', 38_000), r('Social Media Whiz', 'sales', 34_000), r('Bookkeeper', 'finance', 40_000)],
    products: ['Birria Tacos', 'Loaded Fries', 'Korean BBQ Bowl', 'Vegan Burger', 'Breakfast Burrito', 'Late-Night Menu', 'Festival Catering', 'Smash Burgers', 'Gourmet Grilled Cheese', 'Bubble Tea Window'],
    suffixes: ['Street Eats', 'Grill on Wheels', 'Kitchen Cruiser', 'Food Truck'],
  },
  restaurant: {
    id: 'restaurant', label: 'Restaurant', emoji: '\u{1F37D}\u{FE0F}', unit: 'meals', unitOne: 'meal', site: 'restaurant', sitePlural: 'restaurants',
    blurb: 'Sit-down dining. Thin margins, long hours, loyal regulars.',
    price: 30, unitCost: 9.5, localShare: 0.55, costCat: 'food', tradable: 0, demand: 42_000, elasticity: 1.5, incomeSens: 0.5,
    capital: 450_000, capitalLocal: 0.6, staff: 11, wage: 31_000, staffScale: 0.85, rent: 96_000, maint: 0.07, capMult: 1.6,
    multiple: 4, growth: 0.5, perMillion: 8, taxShare: 1, perishable: 0.95, food: true, marketingShare: 0.03,
    roles: [r('Head Chef', 'quality', 62_000), r('Sous Chef', 'quality', 48_000), r('Front-of-House Manager', 'sales', 52_000), r('Sommelier', 'sales', 50_000), r('Bookkeeper', 'finance', 45_000), r('General Manager', 'ops', 70_000)],
    products: ['Tasting Menu', 'Weekend Brunch', 'Delivery Service', 'Plant-Based Menu', 'Happy Hour', 'Catering Arm', 'Signature Dessert', 'Chef’s Cookbook', 'Kids’ Menu', 'Prix-Fixe Lunch', 'Natural Wine List'],
    suffixes: ['Kitchen', 'Bistro', 'Grill', 'Table', 'Eatery'],
  },
  cafe: {
    id: 'cafe', label: 'Café', emoji: '\u{2615}', unit: 'cups', unitOne: 'cup', site: 'café', sitePlural: 'cafés',
    blurb: 'Coffee, pastries and laptops that never leave.',
    price: 5.5, unitCost: 1.6, localShare: 0.5, costCat: 'food', tradable: 0.1, demand: 95_000, elasticity: 1.4, incomeSens: 0.6,
    capital: 180_000, capitalLocal: 0.55, staff: 5, wage: 29_000, staffScale: 0.85, rent: 48_000, maint: 0.08, capMult: 1.6,
    multiple: 4, growth: 0.5, perMillion: 14, taxShare: 1, perishable: 0.9, food: true, marketingShare: 0.03,
    roles: [r('Head Barista', 'quality', 36_000), r('Pastry Chef', 'quality', 40_000), r('Shift Manager', 'ops', 42_000), r('Social Media Whiz', 'sales', 38_000), r('Bookkeeper', 'finance', 42_000)],
    products: ['Seasonal Spiced Latte', 'Cold Brew on Tap', 'Oat Milk Everything', 'Coffee Subscription', 'House-Roasted Beans', 'Matcha Bar', 'Breakfast Sandwiches', 'Avocado Toast', 'Flat White', 'Cake Counter'],
    suffixes: ['Coffee', 'Café', 'Roasters', 'Espresso Bar', 'Coffee House'],
  },
  bakery: {
    id: 'bakery', label: 'Bakery', emoji: '\u{1F950}', unit: 'baked goods', unitOne: 'baked good', site: 'bakery', sitePlural: 'bakeries',
    blurb: 'Up at 4 AM so everyone else can have warm bread.',
    price: 5, unitCost: 1.4, localShare: 0.5, costCat: 'food', tradable: 0, demand: 110_000, elasticity: 1.4, incomeSens: 0.3,
    capital: 200_000, capitalLocal: 0.5, staff: 5, wage: 31_000, staffScale: 0.85, rent: 42_000, maint: 0.08, capMult: 1.6,
    multiple: 4, growth: 0.4, perMillion: 10, taxShare: 1, perishable: 0.98, food: true, marketingShare: 0.03,
    roles: [r('Head Baker', 'quality', 42_000), r('Pastry Chef', 'quality', 44_000), r('Counter Manager', 'sales', 36_000), r('Bookkeeper', 'finance', 42_000)],
    products: ['Sourdough Line', 'Wedding Cakes', 'Gluten-Free Range', 'Cronut Knockoffs', 'Wholesale to Cafés', 'Holiday Specials', 'Croissant Line', 'Custom Birthday Cakes', 'Bagel Bakery'],
    suffixes: ['Bakery', 'Bakehouse', 'Bread Co.', 'Patisserie'],
  },
  bar: {
    id: 'bar', label: 'Bar', emoji: '\u{1F378}', unit: 'drinks', unitOne: 'drink', site: 'bar', sitePlural: 'bars',
    blurb: 'Pour drinks, listen to problems, mop the floor at 3 AM.',
    price: 9, unitCost: 2.4, localShare: 0.3, costCat: 'alcohol', tradable: 0, demand: 70_000, elasticity: 1.3, incomeSens: 0.5,
    capital: 350_000, capitalLocal: 0.6, staff: 7, wage: 29_000, staffScale: 0.85, rent: 72_000, maint: 0.07, capMult: 1.6,
    multiple: 4, growth: 0.35, perMillion: 8, taxShare: 1, perishable: 0.15, food: true, needs: 'drinking', marketingShare: 0.03,
    roles: [r('Head Bartender', 'quality', 40_000), r('Mixologist', 'quality', 44_000), r('Bar Manager', 'ops', 50_000), r('Events Promoter', 'sales', 40_000), r('Bookkeeper', 'finance', 42_000)],
    products: ['Craft Cocktail Menu', 'Trivia Night', 'Live Music Weekends', 'Rooftop Terrace', 'Bottomless Brunch', 'Karaoke Room', 'Craft Beer Taps', 'Sports Screenings', 'Mocktail Menu'],
    suffixes: ['Tavern', 'Taproom', 'Lounge', 'Pub', 'Bar'],
  },
  brewery: {
    id: 'brewery', label: 'Brewery', emoji: '\u{1F37A}', unit: 'barrels', unitOne: 'barrel', site: 'brewery', sitePlural: 'breweries',
    blurb: 'Craft beer with names nobody can pronounce.',
    price: 330, unitCost: 115, localShare: 0.35, costCat: 'alcohol', priceCat: 'alcohol', tradable: 0.3, demand: 3_400, elasticity: 1.2, incomeSens: 0.5,
    capital: 1_200_000, capitalLocal: 0.4, staff: 8, wage: 44_000, staffScale: 0.7, rent: 84_000, maint: 0.06, capMult: 1.8,
    multiple: 7, growth: 0.6, perMillion: 3, taxShare: 0, perishable: 0.3, needs: 'drinking', marketingShare: 0.03,
    roles: [r('Brewmaster', 'quality', 72_000), r('Quality Control Lead', 'quality', 55_000), r('Sales Rep', 'sales', 58_000), r('Operations Manager', 'ops', 68_000), r('Controller', 'finance', 70_000)],
    products: ['Hazy IPA', 'Barrel-Aged Stout', 'Hard Seltzer', 'Alcohol-Free Lager', 'Taproom Tours', 'Canned Six-Packs', 'Seasonal Sour', 'Lager Six-Pack Line', 'Fruit Beer Range', 'Session IPA'],
    suffixes: ['Brewing Co.', 'Brewery', 'Ales', 'Beer Works'],
  },
  grocery: {
    id: 'grocery', label: 'Grocery Store', emoji: '\u{1F6D2}', unit: 'shopping baskets', unitOne: 'shopping basket', site: 'store', sitePlural: 'stores',
    blurb: 'Everybody eats. Margins thinner than the plastic bags.',
    price: 49, unitCost: 34.5, localShare: 0.15, costCat: 'food', tradable: 0, demand: 68_000, elasticity: 2.2, incomeSens: 0.2,
    capital: 900_000, capitalLocal: 0.55, staff: 16, wage: 29_000, staffScale: 0.8, rent: 150_000, maint: 0.06, capMult: 1.6,
    multiple: 6, growth: 0.3, perMillion: 10, taxShare: 0.4, perishable: 0.6, food: true, marketingShare: 0.015,
    roles: [r('Store Manager', 'ops', 60_000), r('Produce Manager', 'quality', 42_000), r('Butcher', 'quality', 45_000), r('Merchandiser', 'sales', 40_000), r('Bookkeeper', 'finance', 44_000)],
    products: ['Store Brand Line', 'Online Delivery', 'Organic Aisle', 'Hot Food Counter', 'Loyalty Card', 'Bulk Bins', 'Ready Meals Aisle', 'In-Store Bakery', 'Click-and-Collect'],
    suffixes: ['Market', 'Grocers', 'Fresh Mart', 'Foods', 'Supermarket'],
  },
  fashion: {
    id: 'fashion', label: 'Fashion Brand', emoji: '\u{1F457}', unit: 'garments', unitOne: 'garment', site: 'boutique', sitePlural: 'boutiques',
    blurb: 'Clothes, hype and a very opinionated creative director.',
    price: 65, unitCost: 22, localShare: 0.3, tradable: 0.6, demand: 19_000, elasticity: 1.1, incomeSens: 0.8,
    capital: 300_000, capitalLocal: 0.5, staff: 8, wage: 38_000, staffScale: 0.75, rent: 120_000, maint: 0.1, capMult: 2,
    multiple: 8, growth: 0.8, perMillion: 4, taxShare: 1, perishable: 0.25, marketingShare: 0.06,
    roles: [r('Creative Director', 'quality', 85_000), r('Pattern Maker', 'quality', 52_000), r('Brand Manager', 'sales', 70_000), r('Store Manager', 'ops', 50_000), r('Controller', 'finance', 68_000)],
    products: ['Streetwear Capsule', 'Sustainable Denim', 'Sneaker Collab', 'Kidswear Line', 'Athleisure Range', 'Runway Collection', 'Limited Drop', 'Denim Line', 'Swimwear Range', 'Plus-Size Range'],
    suffixes: ['Apparel', 'Clothing Co.', 'Atelier', 'Threads', 'Studio'],
  },
  beauty: {
    id: 'beauty', label: 'Beauty Brand', emoji: '\u{1F484}', unit: 'products', unitOne: 'product', site: 'store', sitePlural: 'stores',
    blurb: 'Skincare, cosmetics and serums with very scientific names.',
    price: 28, unitCost: 7.5, localShare: 0.3, tradable: 0.6, demand: 48_000, elasticity: 1, incomeSens: 0.7,
    capital: 1_000_000, capitalLocal: 0.4, staff: 9, wage: 42_000, staffScale: 0.7, rent: 96_000, maint: 0.06, capMult: 2,
    multiple: 10, growth: 0.8, perMillion: 3, taxShare: 1, perishable: 0.1, marketingShare: 0.06,
    roles: [r('Cosmetic Chemist', 'quality', 82_000), r('Product Developer', 'quality', 70_000), r('Influencer Manager', 'sales', 60_000), r('Retail Manager', 'ops', 55_000), r('Controller', 'finance', 70_000)],
    products: ['Vitamin C Serum', 'Clean Beauty Line', 'Men’s Grooming Kit', 'Sunscreen That Isn’t Greasy', 'Lip Kit Collab', 'Fragrance Launch', 'Hair Growth Oil', 'Nail Polish Range', 'Sheet Mask Line', 'Tinted Moisturizer'],
    suffixes: ['Beauty', 'Cosmetics', 'Skincare', 'Glow', 'Labs'],
  },
  salon: {
    id: 'salon', label: 'Salon', emoji: '\u{1F487}', unit: 'appointments', unitOne: 'appointment', site: 'salon', sitePlural: 'salons',
    blurb: 'Haircuts, nails and gossip, by appointment only.',
    price: 55, unitCost: 8, localShare: 0.4, tradable: 0, demand: 9_500, elasticity: 1.3, incomeSens: 0.5,
    capital: 120_000, capitalLocal: 0.6, staff: 6, wage: 33_000, staffScale: 0.9, rent: 54_000, maint: 0.08, capMult: 1.5,
    multiple: 3.5, growth: 0.35, perMillion: 20, taxShare: 1, perishable: 1, marketingShare: 0.03,
    roles: [r('Master Stylist', 'quality', 48_000), r('Colorist', 'quality', 44_000), r('Nail Technician', 'quality', 34_000), r('Front Desk Manager', 'sales', 32_000), r('Bookkeeper', 'finance', 40_000)],
    products: ['Balayage Specials', 'Men’s Grooming Bar', 'Bridal Packages', 'Lash Extensions', 'Scalp Spa', 'House Hair Products', 'Blow-Dry Bar', 'Highlights & Color', 'Kids’ Cuts'],
    suffixes: ['Salon', 'Hair Studio', 'Nails & Spa', 'Barbershop'],
  },
  gym: {
    id: 'gym', label: 'Gym', emoji: '\u{1F3CB}\u{FE0F}', unit: 'memberships', unitOne: 'membership', site: 'gym', sitePlural: 'gyms',
    blurb: 'Sell New Year’s resolutions by the month.',
    price: 600, unitCost: 110, localShare: 0.5, tradable: 0, demand: 1_100, elasticity: 1.4, incomeSens: 0.8,
    capital: 450_000, capitalLocal: 0.45, staff: 6, wage: 32_000, staffScale: 0.6, rent: 120_000, maint: 0.1, capMult: 1.8,
    multiple: 6, growth: 0.45, perMillion: 6, taxShare: 1, perishable: 1, marketingShare: 0.04,
    roles: [r('Head Trainer', 'quality', 45_000), r('Class Instructor', 'quality', 38_000), r('Membership Sales Lead', 'sales', 42_000), r('Club Manager', 'ops', 55_000), r('Bookkeeper', 'finance', 42_000)],
    products: ['24/7 Access', 'Spin Studio', 'Boxing Classes', 'Personal Training Packages', 'Sauna & Recovery Zone', 'Fitness App', 'Yoga Classes', 'Pilates Reformer Studio', 'HIIT Classes'],
    suffixes: ['Fitness', 'Gym', 'Athletic Club', 'Strength'],
  },
  autoShop: {
    id: 'autoShop', label: 'Auto Repair Shop', emoji: '\u{1F527}', unit: 'repair jobs', unitOne: 'repair job', site: 'garage', sitePlural: 'garages',
    blurb: '"It’s probably the transmission." It’s always the transmission.',
    price: 480, unitCost: 210, localShare: 0.3, tradable: 0.2, demand: 2_200, elasticity: 1.2, incomeSens: 0.6,
    capital: 280_000, capitalLocal: 0.45, staff: 6, wage: 47_000, staffScale: 0.9, rent: 66_000, maint: 0.08, capMult: 1.6,
    multiple: 4, growth: 0.3, perMillion: 10, taxShare: 1, perishable: 1, marketingShare: 0.03,
    roles: [r('Master Mechanic', 'quality', 68_000), r('Diagnostics Tech', 'quality', 58_000), r('Service Advisor', 'sales', 50_000), r('Shop Foreman', 'ops', 62_000), r('Bookkeeper', 'finance', 44_000)],
    products: ['EV Servicing', 'Detailing Bay', 'Tire Center', 'Fleet Contracts', 'Classic Car Restoration', 'Mobile Mechanics', 'Hybrid Servicing', 'Windshield Repair', 'Car Wash Tunnel'],
    suffixes: ['Auto Repair', 'Motors', 'Garage', 'Auto Works'],
  },
  construction: {
    id: 'construction', label: 'Construction', emoji: '\u{1F3D7}\u{FE0F}', unit: 'projects', unitOne: 'project', site: 'crew', sitePlural: 'crews',
    blurb: 'Build things, blow deadlines, invoice anyway.',
    price: 42_000, unitCost: 27_000, localShare: 0.6, tradable: 0, demand: 55, elasticity: 1.5, incomeSens: 0.5,
    capital: 650_000, capitalLocal: 0.4, staff: 10, wage: 52_000, staffScale: 0.9, rent: 42_000, maint: 0.1, capMult: 1.7,
    multiple: 5, growth: 0.5, perMillion: 6, taxShare: 0, perishable: 1, marketingShare: 0.01,
    roles: [r('Site Foreman', 'quality', 75_000), r('Project Manager', 'ops', 85_000), r('Estimator', 'sales', 70_000), r('Safety Officer', 'quality', 62_000), r('Controller', 'finance', 78_000)],
    products: ['Home Renovations', 'Commercial Fit-Outs', 'Green Building', 'Government Contracts', 'Prefab Homes', 'Road Works', 'Kitchen & Bath Remodels', 'Solar Roof Installs', 'Warehouse Builds'],
    suffixes: ['Construction', 'Builders', 'Contracting', 'Build Group'],
  },
  realEstate: {
    id: 'realEstate', label: 'Real Estate Agency', emoji: '\u{1F3E1}', unit: 'home sales', unitOne: 'home sale', site: 'office', sitePlural: 'offices',
    blurb: 'Commission on every "cozy" (small) and "charming" (old) home.',
    price: 11_000, unitCost: 6_200, localShare: 0.8, tradable: 0, demand: 120, elasticity: 1, incomeSens: 0.7,
    capital: 150_000, capitalLocal: 0.7, staff: 6, wage: 48_000, staffScale: 0.85, rent: 72_000, maint: 0.08, capMult: 1.8,
    multiple: 5, growth: 0.5, perMillion: 5, taxShare: 0, perishable: 1, marketingShare: 0.05,
    roles: [r('Top Producer', 'sales', 90_000), r('Listing Agent', 'sales', 70_000), r('Office Manager', 'ops', 52_000), r('Transaction Coordinator', 'quality', 48_000), r('Bookkeeper', 'finance', 45_000)],
    products: ['Luxury Division', 'Property Management', 'Commercial Leasing', 'Virtual Tours', 'Relocation Services', 'Mortgage Desk', 'New-Build Sales', 'Holiday Lets', 'Land Development'],
    suffixes: ['Realty', 'Properties', 'Real Estate', 'Homes'],
  },
  software: {
    id: 'software', label: 'Software Company', emoji: '\u{1F4BB}', unit: 'subscriptions', unitOne: 'subscription', site: 'office', sitePlural: 'offices',
    blurb: 'Write code once, sell it forever. In theory.',
    price: 1_200, unitCost: 140, localShare: 0.2, tradable: 0.85, demand: 1_900, elasticity: 1.2, incomeSens: 0.6,
    capital: 400_000, capitalLocal: 0.6, staff: 14, wage: 105_000, staffScale: 0.55, rent: 150_000, maint: 0.15, capMult: 8,
    multiple: 15, growth: 1, perMillion: 1.5, taxShare: 0, perishable: 1, marketingShare: 0.08,
    roles: [r('Lead Engineer', 'quality', 170_000), r('Product Manager', 'quality', 150_000), r('Head of Sales', 'sales', 160_000), r('Head of Growth', 'sales', 140_000), r('CFO', 'finance', 180_000), r('COO', 'ops', 175_000)],
    products: ['AI Assistant Feature', 'Mobile App', 'Enterprise Tier', 'API Platform', 'Analytics Dashboard', 'Security Suite', 'Marketplace Integrations', 'Customer Support Desk', 'Single Sign-On', 'Data Migration Service'],
    suffixes: ['Software', 'Labs', 'Technologies', 'Systems', 'AI'],
  },
  gameStudio: {
    id: 'gameStudio', label: 'Video Game Studio', emoji: '\u{1F3AE}', unit: 'game copies', unitOne: 'game copy', site: 'studio', sitePlural: 'studios',
    blurb: 'Make the game you always wanted. Ship it three years late.',
    // Studios earn from game releases (business/gamestudio.ts), not from price and production.
    // Startup: workstations, dev kits, licences and a small office for a founding team.
    price: 30, unitCost: 9, localShare: 0.1, tradable: 0.9, demand: 110_000, elasticity: 1.3, incomeSens: 0.7,
    capital: 220_000, capitalLocal: 0.6, staff: 2, wage: 85_000, staffScale: 0.5, rent: 60_000, maint: 0.08, capMult: 8,
    multiple: 10, growth: 1, perMillion: 1, taxShare: 1, perishable: 0.5, marketingShare: 0.08,
    roles: [r('Creative Director', 'quality', 150_000), r('Lead Programmer', 'quality', 140_000), r('Art Director', 'quality', 120_000), r('Community Manager', 'sales', 75_000), r('Producer', 'ops', 110_000), r('CFO', 'finance', 150_000)],
    products: ['Open-World Sequel', 'Cozy Farming Game', 'Battle Royale Mode', 'Mobile Port', 'Story DLC', 'VR Spin-Off', 'Remastered Classic', 'Multiplayer Expansion', 'Kart Racer', 'Educational Game'],
    suffixes: ['Games', 'Interactive', 'Studios', 'Entertainment'],
  },
  ecommerce: {
    id: 'ecommerce', label: 'E-Commerce Store', emoji: '\u{1F4E6}', unit: 'orders', unitOne: 'order', site: 'warehouse', sitePlural: 'warehouses',
    blurb: 'Sell online, ship fast, pray the returns are rare.',
    price: 48, unitCost: 30, localShare: 0.3, tradable: 0.3, demand: 52_000, elasticity: 1.6, incomeSens: 0.7,
    capital: 120_000, capitalLocal: 0.5, staff: 8, wage: 44_000, staffScale: 0.6, rent: 96_000, maint: 0.12, capMult: 5,
    multiple: 9, growth: 0.9, perMillion: 2, taxShare: 1, perishable: 0.2, marketingShare: 0.08,
    roles: [r('Head of Merchandising', 'quality', 75_000), r('Performance Marketer', 'sales', 85_000), r('Warehouse Manager', 'ops', 58_000), r('Customer Service Lead', 'quality', 48_000), r('Controller', 'finance', 75_000)],
    products: ['Same-Day Delivery', 'Private Label', 'Subscription Boxes', 'Marketplace for Sellers', 'Live-Stream Shopping', 'Buy Now, Pay Later', 'Gift Cards', 'Returns Portal', 'Refurbished Electronics'],
    suffixes: ['Online', 'Shop', 'Direct', 'Express', 'Store'],
  },
  marketing: {
    id: 'marketing', label: 'Marketing Agency', emoji: '\u{1F4E3}', unit: 'client accounts', unitOne: 'client account', site: 'office', sitePlural: 'offices',
    blurb: 'Make other people’s products go viral. Bill hourly.',
    price: 62_000, unitCost: 9_000, localShare: 0.6, tradable: 0.15, demand: 24, elasticity: 1.1, incomeSens: 0.6,
    capital: 100_000, capitalLocal: 0.7, staff: 14, wage: 66_000, staffScale: 0.8, rent: 96_000, maint: 0.12, capMult: 2,
    multiple: 6, growth: 0.6, perMillion: 3, taxShare: 0, perishable: 1, marketingShare: 0.02,
    roles: [r('Creative Director', 'quality', 120_000), r('Account Director', 'sales', 110_000), r('Head of Strategy', 'quality', 115_000), r('Operations Manager', 'ops', 85_000), r('Finance Director', 'finance', 105_000)],
    products: ['Influencer Network', 'Data & Analytics Unit', 'Video Production', 'Crisis PR Desk', 'Short-Video Studio', 'B2B Lead Generation', 'Email Campaigns', 'Brand Strategy Workshops', 'Out-of-Home Displays'],
    suffixes: ['Media', 'Marketing', 'Creative', 'Agency', 'Collective'],
  },
  clinic: {
    id: 'clinic', label: 'Medical Clinic', emoji: '\u{1FA7A}', unit: 'patient visits', unitOne: 'patient visit', site: 'clinic', sitePlural: 'clinics',
    blurb: 'Private healthcare. Needs doctors, licences and nerves of steel.',
    price: 190, unitCost: 42, localShare: 0.6, tradable: 0, demand: 12_500, elasticity: 0.8, incomeSens: 0.6,
    capital: 1_300_000, capitalLocal: 0.45, staff: 12, wage: 92_000, staffScale: 0.85, rent: 120_000, maint: 0.07, capMult: 1.6,
    multiple: 9, growth: 0.4, perMillion: 6, taxShare: 0, perishable: 1, needs: 'medical', marketingShare: 0.02,
    roles: [r('Chief Physician', 'quality', 260_000), r('Head Nurse', 'quality', 95_000), r('Practice Manager', 'ops', 80_000), r('Patient Relations Lead', 'sales', 55_000), r('Billing Manager', 'finance', 70_000)],
    products: ['Urgent Care Wing', 'Telehealth', 'Dermatology Practice', 'Physiotherapy', 'Executive Health Checks', 'Diagnostic Imaging', 'Sports Medicine', 'Allergy Clinic', 'Sleep Lab'],
    suffixes: ['Medical Center', 'Clinic', 'Health', 'Family Practice'],
  },
  hotel: {
    id: 'hotel', label: 'Hotel', emoji: '\u{1F3E8}', unit: 'room nights', unitOne: 'room night', site: 'hotel', sitePlural: 'hotels',
    blurb: 'Fluffy towels, tiny shampoos and one-star reviews about the Wi-Fi.',
    price: 165, unitCost: 46, localShare: 0.6, tradable: 0.4, demand: 17_000, elasticity: 1.3, incomeSens: 0.4,
    capital: 6_500_000, capitalLocal: 0.6, staff: 26, wage: 31_000, staffScale: 0.8, rent: 240_000, maint: 0.04, capMult: 1.3,
    multiple: 11, growth: 0.5, perMillion: 4, taxShare: 1, perishable: 1, food: true, marketingShare: 0.04,
    roles: [r('Hotel General Manager', 'ops', 110_000), r('Executive Chef', 'quality', 75_000), r('Head of Housekeeping', 'quality', 48_000), r('Revenue Manager', 'sales', 80_000), r('Controller', 'finance', 85_000)],
    products: ['Rooftop Bar', 'Day Spa', 'Wedding Venue', 'Conference Center', 'Loyalty Program', 'Boutique Suites', 'Long-Stay Suites', 'Pet-Friendly Rooms', 'Afternoon Tea Lounge'],
    suffixes: ['Hotel', 'Inn', 'Resort', 'Suites', 'Grand Hotel'],
  },
  logistics: {
    id: 'logistics', label: 'Logistics Company', emoji: '\u{1F69B}', unit: 'shipments', unitOne: 'shipment', site: 'depot', sitePlural: 'depots',
    blurb: 'Move other people’s stuff from A to B, mostly on time.',
    price: 360, unitCost: 175, localShare: 0.3, costCat: 'fuel', tradable: 0.1, demand: 6_200, elasticity: 1.5, incomeSens: 0.4,
    capital: 1_100_000, capitalLocal: 0.3, staff: 13, wage: 52_000, staffScale: 0.85, rent: 90_000, maint: 0.1, capMult: 1.7,
    multiple: 7, growth: 0.5, perMillion: 3, taxShare: 0, perishable: 1, needs: 'driver', marketingShare: 0.01,
    roles: [r('Fleet Manager', 'ops', 72_000), r('Dispatch Lead', 'ops', 58_000), r('Safety Manager', 'quality', 65_000), r('Key Account Manager', 'sales', 75_000), r('Controller', 'finance', 78_000)],
    products: ['Cold-Chain Freight', 'Last-Mile Delivery', 'Cross-Border Trucking', 'Warehousing', 'Electric Vans', 'Express Courier', 'Freight Forwarding', 'Hazardous Goods Haulage', 'Returns Handling'],
    suffixes: ['Logistics', 'Freight', 'Transport', 'Express', 'Haulage'],
  },
  manufacturing: {
    id: 'manufacturing', label: 'Manufacturing', emoji: '\u{1F3ED}', unit: 'units', unitOne: 'unit', site: 'factory', sitePlural: 'factories',
    blurb: 'Make things in bulk. Hard hats mandatory.',
    price: 125, unitCost: 68, localShare: 0.4, tradable: 0.8, demand: 38_000, elasticity: 1.6, incomeSens: 0.3,
    capital: 3_500_000, capitalLocal: 0.35, staff: 28, wage: 46_000, staffScale: 0.75, rent: 240_000, maint: 0.06, capMult: 2,
    multiple: 8, growth: 0.7, perMillion: 2, taxShare: 0, perishable: 0.05, marketingShare: 0.02,
    roles: [r('Plant Manager', 'ops', 110_000), r('Quality Engineer', 'quality', 90_000), r('Process Engineer', 'quality', 95_000), r('Sales Director', 'sales', 120_000), r('Controller', 'finance', 100_000)],
    products: ['Smart Home Gadget', 'Industrial Robot Arm', 'Eco Packaging', 'Kitchen Appliance Line', 'E-Bike Frames', 'Medical Devices', 'Solar Panel Mounts', 'Power Tool Line', 'LED Lighting Line', 'Garden Equipment'],
    suffixes: ['Industries', 'Manufacturing', 'Works', 'Products', 'Engineering'],
  },
  farm: {
    id: 'farm', label: 'Farm', emoji: '\u{1F69C}', unit: 'tons of produce', unitOne: 'ton of produce', site: 'farm', sitePlural: 'farms',
    blurb: 'Up with the rooster, at the mercy of the weather.',
    price: 520, unitCost: 230, localShare: 0.5, costCat: 'fuel', priceCat: 'food', tradable: 0.6, demand: 2_100, elasticity: 1.8, incomeSens: 0.1,
    capital: 1_600_000, capitalLocal: 0.5, staff: 6, wage: 31_000, staffScale: 0.8, rent: 72_000, maint: 0.05, capMult: 1.5,
    multiple: 7, growth: 0.35, perMillion: 10, taxShare: 0, perishable: 0.7, marketingShare: 0.01,
    roles: [r('Farm Manager', 'ops', 58_000), r('Agronomist', 'quality', 65_000), r('Head Herdsman', 'quality', 45_000), r('Produce Buyer Liaison', 'sales', 52_000), r('Bookkeeper', 'finance', 44_000)],
    products: ['Organic Certification', 'Farm Shop', 'Greenhouse Tomatoes', 'Free-Range Eggs', 'Agritourism Weekends', 'Direct-to-Restaurant Deals', 'Pick-Your-Own Fields', 'Honey & Beeswax', 'Microgreens'],
    suffixes: ['Farms', 'Harvest', 'Agro', 'Orchards', 'Ranch'],
  },
  energy: {
    id: 'energy', label: 'Energy Company', emoji: '\u{26A1}', unit: 'MWh', unitOne: 'MWh', site: 'power plant', sitePlural: 'power plants',
    blurb: 'Keep the lights on. Capital-hungry, steady and heavily regulated.',
    price: 72, unitCost: 14, localShare: 0.4, priceCat: 'fuel', tradable: 0.5, demand: 120_000, elasticity: 2, incomeSens: 0.2,
    capital: 35_000_000, capitalLocal: 0.35, staff: 16, wage: 88_000, staffScale: 0.5, rent: 300_000, maint: 0.04, capMult: 1.3,
    multiple: 11, growth: 0.4, perMillion: 0.5, taxShare: 0, perishable: 1, marketingShare: 0.005,
    roles: [r('Chief Engineer', 'quality', 160_000), r('Grid Operations Lead', 'ops', 140_000), r('Regulatory Affairs Director', 'finance', 150_000), r('Energy Trader', 'sales', 170_000), r('CFO', 'finance', 190_000)],
    products: ['Battery Storage', 'Offshore Wind Farm', 'Rooftop Solar for Homes', 'Green Hydrogen Pilot', 'Smart Meters', 'EV Charging Network', 'Peaker Plant', 'Heat Network', 'Biogas Digesters'],
    suffixes: ['Energy', 'Power', 'Solar', 'Renewables', 'Utilities'],
  },
  entertainment: {
    id: 'entertainment', label: 'Entertainment Company', emoji: '\u{1F3AA}', unit: 'tickets', unitOne: 'ticket', site: 'venue', sitePlural: 'venues',
    blurb: 'Concerts, comedy nights and festivals. Glamorous until it rains.',
    price: 42, unitCost: 13, localShare: 0.5, tradable: 0.2, demand: 40_000, elasticity: 1.3, incomeSens: 0.8,
    capital: 600_000, capitalLocal: 0.5, staff: 12, wage: 40_000, staffScale: 0.75, rent: 150_000, maint: 0.1, capMult: 1.8,
    multiple: 7, growth: 0.7, perMillion: 4, taxShare: 1, perishable: 1, marketingShare: 0.06,
    roles: [r('Talent Booker', 'quality', 80_000), r('Production Manager', 'ops', 70_000), r('Head of Ticketing', 'sales', 65_000), r('Promoter', 'sales', 60_000), r('Controller', 'finance', 75_000)],
    products: ['Summer Music Festival', 'Comedy Club Nights', 'Esports Tournament', 'Immersive Art Show', 'Drag Brunch', 'Podcast Live Tour', 'Escape Rooms', 'Theater Productions', 'Magic & Variety Nights'],
    suffixes: ['Entertainment', 'Events', 'Live', 'Productions'],
  },
  // --- Deep tech (business/deeptech*.ts adds R&D, funding rounds and breakthroughs on top) ---
  // One site is a lab, design center or test stand: cheap enough for a founder to open. Fabs,
  // gigafactories, GPU clusters and satellites are big R&D capital projects on top (deeptech-data).
  // Demand and capacity per site are for a company at full commercial readiness; the deep-tech
  // ladder (prototype → production → scale) multiplies them, so a garage lab sells nothing yet.
  semiconductor: {
    id: 'semiconductor', label: 'Semiconductor Company', emoji: '\u{1F4BE}', unit: 'chips', unitOne: 'chip', site: 'design center', sitePlural: 'design centers',
    blurb: 'Etch billions of transistors onto sand. Start with a design team; maybe end with the most complicated factories on Earth.',
    price: 40, unitCost: 18, localShare: 0.15, tradable: 1, demand: 500_000, elasticity: 1.3, incomeSens: 0.2,
    capital: 600_000, capitalLocal: 0.3, staff: 30, wage: 150_000, staffScale: 0.6, rent: 300_000, maint: 0.12, capMult: 1,
    multiple: 18, growth: 1, perMillion: 0.05, taxShare: 0, perishable: 0.15, marketingShare: 0.01,
    roles: [r('Chief Process Engineer', 'quality', 260_000), r('Chip Architect', 'quality', 280_000), r('Head of Foundry Sales', 'sales', 240_000), r('Fab Operations Director', 'ops', 230_000), r('CFO', 'finance', 260_000)],
    products: ['Low-Power IoT Chip', 'Smartphone SoC', 'Automotive Chip Line', 'Memory Line', 'Chiplet Platform', 'Developer Board', 'Power Semiconductors', 'Image Sensor Line', 'Networking Chip Line'],
    suffixes: ['Semiconductor', 'Silicon', 'Micro', 'Chips', 'Devices'],
  },
  aiLab: {
    id: 'aiLab', label: 'AI Company', emoji: '\u{1F916}', unit: 'API subscriptions', unitOne: 'API subscription', site: 'lab', sitePlural: 'labs',
    blurb: 'Train models on mountains of GPUs. Burn cash, chase the frontier, try not to get sued.',
    price: 3_000, unitCost: 1_000, localShare: 0.1, tradable: 1, demand: 4_000, elasticity: 1.2, incomeSens: 0.5,
    capital: 250_000, capitalLocal: 0.3, staff: 20, wage: 200_000, staffScale: 0.45, rent: 300_000, maint: 0.25, capMult: 1,
    multiple: 30, growth: 1, perMillion: 0.3, taxShare: 0, perishable: 1, marketingShare: 0.05,
    roles: [r('Chief Scientist', 'quality', 450_000), r('Head of Research', 'quality', 380_000), r('Head of Enterprise Sales', 'sales', 300_000), r('Infrastructure Lead', 'ops', 320_000), r('CFO', 'finance', 300_000)],
    products: ['Chat Assistant App', 'Coding Assistant', 'Image Generator', 'Voice Mode', 'Enterprise Copilot', 'Developer Playground', 'Translation API', 'Video Generator', 'Agent Builder'],
    suffixes: ['AI', 'Labs', 'Intelligence', 'Minds', 'Neural'],
  },
  robotics: {
    id: 'robotics', label: 'Robotics Company', emoji: '\u{1F9BE}', unit: 'robots', unitOne: 'robot', site: 'robotics lab', sitePlural: 'robotics labs',
    blurb: 'Build machines that walk, weld and fold laundry. Mostly they fall over, at first.',
    price: 70_000, unitCost: 40_000, localShare: 0.3, tradable: 0.9, demand: 250, elasticity: 1.4, incomeSens: 0.4,
    capital: 400_000, capitalLocal: 0.35, staff: 25, wage: 130_000, staffScale: 0.6, rent: 250_000, maint: 0.1, capMult: 1,
    multiple: 16, growth: 1, perMillion: 0.4, taxShare: 0, perishable: 0.05, marketingShare: 0.03,
    roles: [r('Head of Robotics', 'quality', 250_000), r('Controls Engineer', 'quality', 180_000), r('Head of Sales', 'sales', 200_000), r('Manufacturing Lead', 'ops', 170_000), r('CFO', 'finance', 220_000)],
    products: ['Warehouse Picker', 'Robot-as-a-Service Plan', 'Surgical Assist Arm', 'Sidewalk Delivery Bot', 'Farm Harvester Bot', 'Home Helper', 'Cleaning Robot', 'Inspection Crawler', 'Kitchen Robot'],
    suffixes: ['Robotics', 'Dynamics', 'Automation', 'Machines', 'Mechatronics'],
  },
  biotech: {
    id: 'biotech', label: 'Biotech Company', emoji: '\u{1F9EC}', unit: 'treatment courses', unitOne: 'treatment course', site: 'lab', sitePlural: 'labs',
    blurb: 'Find a cure, survive the clinical trials, get it approved. Most drugs fail; the winners pay for everything.',
    price: 40_000, unitCost: 4_000, localShare: 0.2, tradable: 0.9, demand: 3_000, elasticity: 0.6, incomeSens: 0.3,
    capital: 800_000, capitalLocal: 0.35, staff: 22, wage: 140_000, staffScale: 0.5, rent: 350_000, maint: 0.12, capMult: 1,
    multiple: 20, growth: 1, perMillion: 0.3, taxShare: 0, perishable: 0.3, marketingShare: 0.06,
    roles: [r('Chief Medical Officer', 'quality', 320_000), r('Head of Discovery', 'quality', 280_000), r('Head of Commercial', 'sales', 260_000), r('Head of Clinical Operations', 'ops', 240_000), r('CFO', 'finance', 260_000)],
    products: ['Patient Support Program', 'Physician Education Tour', 'Pediatric Formulation', 'Once-Weekly Version', 'Combination Therapy', 'Home Infusion Service', 'Companion Diagnostic', 'Prefilled Pen Version', 'Rare Disease Registry'],
    suffixes: ['Bio', 'Therapeutics', 'Genomics', 'Biosciences', 'Pharma'],
  },
  spaceTech: {
    id: 'spaceTech', label: 'Space Company', emoji: '\u{1F680}', unit: 'launches', unitOne: 'launch', site: 'launch site', sitePlural: 'launch sites',
    blurb: 'Rockets, satellites and the occasional spectacular explosion. Start with an engine on a test stand.',
    price: 60_000_000, unitCost: 38_000_000, localShare: 0.25, tradable: 1, demand: 3, elasticity: 1.5, incomeSens: 0.2,
    capital: 1_500_000, capitalLocal: 0.4, staff: 60, wage: 140_000, staffScale: 0.6, rent: 400_000, maint: 0.08, capMult: 1,
    multiple: 20, growth: 1, perMillion: 0.02, taxShare: 0, perishable: 1, marketingShare: 0.005,
    roles: [r('Chief Engineer', 'quality', 300_000), r('Propulsion Lead', 'quality', 250_000), r('Head of Launch Sales', 'sales', 260_000), r('Launch Director', 'ops', 240_000), r('CFO', 'finance', 270_000)],
    products: ['Rideshare Missions', 'Dedicated Launch Package', 'Satellite Insurance Bundle', 'Launch Livestream Sponsorship', 'Payload Integration Service', 'Polar Orbit Service', 'Earth Imaging Service', 'Ground Station Network', 'Satellite Servicing'],
    suffixes: ['Aerospace', 'Space', 'Orbital', 'Rocketworks', 'Launch'],
  },
  electricVehicles: {
    id: 'electricVehicles', label: 'Electric Vehicle Maker', emoji: '\u{1F699}', unit: 'cars', unitOne: 'car', site: 'R&D center', sitePlural: 'R&D centers',
    blurb: 'Build the car of the future. Survive production hell first.',
    price: 45_000, unitCost: 37_000, localShare: 0.35, priceCat: 'car', tradable: 0.8, demand: 2_500, elasticity: 1.6, incomeSens: 0.7,
    capital: 1_200_000, capitalLocal: 0.35, staff: 40, wage: 95_000, staffScale: 0.6, rent: 400_000, maint: 0.08, capMult: 1,
    multiple: 15, growth: 1, perMillion: 0.05, taxShare: 1, perishable: 0.05, marketingShare: 0.02,
    roles: [r('Chief Engineer', 'quality', 260_000), r('Battery Lead', 'quality', 230_000), r('Head of Sales', 'sales', 220_000), r('Production Chief', 'ops', 210_000), r('CFO', 'finance', 240_000)],
    products: ['Performance Edition', 'Electric Pickup', 'Long-Range Battery Pack', 'Premium Connectivity', 'Fleet Leasing', 'Home Charger Bundle', 'Compact Hatchback', 'Over-the-Air Upgrades', 'Battery Warranty Plan'],
    suffixes: ['Motors', 'Autoworks', 'Automotive', 'Electric', 'Mobility'],
  },
  quantum: {
    id: 'quantum', label: 'Quantum Computing Company', emoji: '\u{269B}\u{FE0F}', unit: 'compute contracts', unitOne: 'compute contract', site: 'lab', sitePlural: 'labs',
    blurb: 'Coax qubits into cooperating at near absolute zero. A long runway, a lot of hype, maybe everything.',
    price: 500_000, unitCost: 80_000, localShare: 0.2, tradable: 1, demand: 30, elasticity: 1, incomeSens: 0.3,
    capital: 1_200_000, capitalLocal: 0.3, staff: 15, wage: 180_000, staffScale: 0.5, rent: 250_000, maint: 0.15, capMult: 1,
    multiple: 25, growth: 1, perMillion: 0.05, taxShare: 0, perishable: 1, marketingShare: 0.02,
    roles: [r('Chief Physicist', 'quality', 330_000), r('Cryogenics Lead', 'quality', 220_000), r('Head of Partnerships', 'sales', 250_000), r('Lab Director', 'ops', 220_000), r('CFO', 'finance', 250_000)],
    products: ['Quantum Chemistry Toolkit', 'Optimization Service', 'University Access Program', 'Quantum Training Course', 'Hybrid Cloud Plan', 'Quantum-Safe Audit', 'Quantum Finance Toolkit', 'On-Premises Quantum System'],
    suffixes: ['Quantum', 'Qubit', 'Entanglement', 'Q Systems'],
  },
  cybersecurity: {
    id: 'cybersecurity', label: 'Cybersecurity Company', emoji: '\u{1F6E1}\u{FE0F}', unit: 'enterprise contracts', unitOne: 'enterprise contract', site: 'office', sitePlural: 'offices',
    blurb: 'Stop the hackers before they stop your clients. Paranoia as a service.',
    price: 60_000, unitCost: 12_000, localShare: 0.3, tradable: 0.8, demand: 160, elasticity: 1.1, incomeSens: 0.5,
    capital: 150_000, capitalLocal: 0.6, staff: 30, wage: 140_000, staffScale: 0.55, rent: 200_000, maint: 0.12, capMult: 1,
    multiple: 14, growth: 1, perMillion: 0.8, taxShare: 0, perishable: 1, marketingShare: 0.15,
    roles: [r('Chief Security Researcher', 'quality', 250_000), r('Red Team Lead', 'quality', 200_000), r('Head of Sales', 'sales', 210_000), r('SOC Director', 'ops', 190_000), r('CFO', 'finance', 220_000)],
    products: ['Threat Intelligence Feed', 'Phishing Simulator', 'Managed Detection Plan', 'Compliance Toolkit', 'Small Business Edition', 'Incident Response Retainer', 'Penetration Testing', 'Security Awareness Training'],
    suffixes: ['Security', 'Cyber', 'Defense', 'Shield', 'Sentinel'],
  },
  fusion: {
    id: 'fusion', label: 'Fusion Energy Company', emoji: '\u{1F31F}', unit: 'GWh', unitOne: 'GWh', site: 'fusion lab', sitePlural: 'fusion labs',
    blurb: 'Build a star in a box and sell its power. Fusion has been thirty years away for seventy years.',
    price: 110_000, unitCost: 40_000, localShare: 0.2, tradable: 0.6, demand: 900, elasticity: 0.9, incomeSens: 0.2,
    capital: 2_000_000, capitalLocal: 0.3, staff: 45, wage: 150_000, staffScale: 0.55, rent: 350_000, maint: 0.1, capMult: 1,
    multiple: 22, growth: 1, perMillion: 0.02, taxShare: 0, perishable: 1, marketingShare: 0.005,
    roles: [r('Chief Plasma Physicist', 'quality', 320_000), r('Magnet Engineering Lead', 'quality', 240_000), r('Head of Utility Partnerships', 'sales', 250_000), r('Plant Operations Director', 'ops', 230_000), r('CFO', 'finance', 260_000)],
    products: ['Neutron Source Rental', 'Superconducting Magnet Line', 'Plasma Diagnostics Kit', 'Fusion Power Contract', 'Industrial Heat Supply', 'Isotope Production Service', 'Fusion Materials Testing'],
    suffixes: ['Fusion', 'Plasma', 'Energy', 'Power', 'Stellar'],
  },
  neurotech: {
    id: 'neurotech', label: 'Neurotech Company', emoji: '\u{1F9E0}', unit: 'implant procedures', unitOne: 'implant procedure', site: 'neuro lab', sitePlural: 'neuro labs',
    blurb: 'Wire computers to the human brain. First you help a paralyzed patient move a cursor, then maybe everything else.',
    price: 90_000, unitCost: 25_000, localShare: 0.25, tradable: 0.8, demand: 1_200, elasticity: 0.8, incomeSens: 0.4,
    capital: 700_000, capitalLocal: 0.35, staff: 25, wage: 150_000, staffScale: 0.55, rent: 300_000, maint: 0.12, capMult: 1,
    multiple: 22, growth: 1, perMillion: 0.2, taxShare: 0, perishable: 0.2, marketingShare: 0.04,
    roles: [r('Chief Neuroscientist', 'quality', 320_000), r('Head of Neurosurgery', 'quality', 360_000), r('Head of Clinical Sales', 'sales', 240_000), r('Head of Device Manufacturing', 'ops', 210_000), r('CFO', 'finance', 250_000)],
    products: ['Neural Signal Toolkit', 'Seizure Warning Implant', 'Speech Restoration App', 'Neurofeedback Headset', 'Clinic Training Program', 'Implant Care Plan', 'Sleep Tracking Headband'],
    suffixes: ['Neuro', 'Neural', 'Synapse', 'Cortex', 'Mind'],
  },
  drones: {
    id: 'drones', label: 'Drone & Air Taxi Company', emoji: '\u{1F681}', unit: 'aircraft', unitOne: 'aircraft', site: 'flight test center', sitePlural: 'flight test centers',
    blurb: 'Start with camera drones, then deliveries, then flying taxis. Gravity and the aviation regulator both get a vote.',
    price: 30_000, unitCost: 19_000, localShare: 0.3, tradable: 0.9, demand: 1_800, elasticity: 1.4, incomeSens: 0.5,
    capital: 450_000, capitalLocal: 0.35, staff: 28, wage: 120_000, staffScale: 0.6, rent: 250_000, maint: 0.1, capMult: 1,
    multiple: 15, growth: 1, perMillion: 0.4, taxShare: 0, perishable: 0.05, marketingShare: 0.03,
    roles: [r('Chief Aerospace Engineer', 'quality', 260_000), r('Flight Software Lead', 'quality', 220_000), r('Head of Fleet Sales', 'sales', 210_000), r('Head of Flight Operations', 'ops', 190_000), r('CFO', 'finance', 230_000)],
    products: ['Aerial Survey Kit', 'Unmanned Crop Sprayer', 'Drone Light Shows', 'Aerial Inspection Service', 'Medical Supply Drops', 'Drone Pilot School', 'Drone Insurance Plan'],
    suffixes: ['Aero', 'Air', 'Skyworks', 'Aviation', 'Flight'],
  },
  carbonCapture: {
    id: 'carbonCapture', label: 'Carbon Removal Company', emoji: '\u{1F343}', unit: 'tonnes of CO2 removed', unitOne: 'tonne of CO2 removed', site: 'pilot plant', sitePlural: 'pilot plants',
    blurb: 'Pull carbon dioxide out of the sky and bury it for good. Every tonne costs money; somebody has to pay for it.',
    price: 450, unitCost: 280, localShare: 0.3, tradable: 1, demand: 60_000, elasticity: 1.1, incomeSens: 0.3,
    capital: 900_000, capitalLocal: 0.4, staff: 22, wage: 120_000, staffScale: 0.55, rent: 200_000, maint: 0.1, capMult: 1,
    multiple: 16, growth: 1, perMillion: 0.1, taxShare: 0, perishable: 1, marketingShare: 0.02,
    roles: [r('Chief Process Chemist', 'quality', 250_000), r('Head of Geology', 'quality', 210_000), r('Head of Credit Sales', 'sales', 220_000), r('Plant Director', 'ops', 200_000), r('CFO', 'finance', 230_000)],
    products: ['Removal Credit Subscription', 'Carbon Accounting Service', 'Low-Carbon Concrete Additive', 'CO2 for Greenhouses', 'Rock Weathering Plots', 'Biochar Line', 'Carbon Footprint Audit'],
    suffixes: ['Carbon', 'Climate', 'Air', 'Removal', 'Earthworks'],
  },
} satisfies Partial<Record<Industry, IndustryDef>>

/** Related operations share a cost model, with distinct pricing, scale and product markets. */
const SECTOR_UNITS: Record<string, [string, string, string, string]> = {
  solar: ['MWh', 'MWh', 'solar farm', 'solar farms'], battery: ['battery packs', 'battery pack', 'factory', 'factories'],
  water: ['water contracts', 'water contract', 'treatment plant', 'treatment plants'], recycling: ['recovered lots', 'recovered lot', 'recovery plant', 'recovery plants'],
  telecom: ['subscriptions', 'subscription', 'network office', 'network offices'], dataCenter: ['hosting contracts', 'hosting contract', 'data center', 'data centers'],
  education: ['enrollments', 'enrollment', 'learning center', 'learning centers'], petCare: ['appointments', 'appointment', 'care center', 'care centers'],
  homeCare: ['service visits', 'service visit', 'service office', 'service offices'], packaging: ['bulk orders', 'bulk order', 'factory', 'factories'],
  furniture: ['furniture orders', 'furniture order', 'workshop', 'workshops'], travel: ['bookings', 'booking', 'agency', 'agencies'],
}
function sector(base: keyof typeof BASE_INDUSTRIES, id: Industry, label: string, emoji: string, blurb: string, products: string[], scale: number, margin: number): IndustryDef {
  const b: IndustryDef = BASE_INDUSTRIES[base]
  const [unit, unitOne, site, sitePlural] = SECTOR_UNITS[id]
  return { ...b, id, label, emoji, blurb, products, suffixes: [label, 'Group', 'Partners'],
    unit, unitOne, site, sitePlural,
    roles: [r('Operations Director', 'ops', b.wage * 2), r('Quality Lead', 'quality', b.wage * 1.8), r('Sales Director', 'sales', b.wage * 1.9), r('Finance Director', 'finance', b.wage * 2)],
    capital: Math.round(b.capital * scale), price: b.price * scale, unitCost: b.unitCost * scale * margin,
    wage: Math.round(b.wage * Math.sqrt(scale)), rent: Math.round(b.rent * scale), needs: undefined }
}

export const INDUSTRIES: Record<Industry, IndustryDef> = {
  ...BASE_INDUSTRIES,
  ...FINANCE_INDUSTRIES,
  ...VENUE_INDUSTRIES,
  solar: sector('energy', 'solar', 'Solar Energy', '☀️', 'Build solar farms and sell clean power. Capital-heavy with low running costs.', ['Rooftop Arrays', 'Utility Solar', 'Community Microgrids', 'Solar Irrigation', 'Solar Carports', 'Solar Plus Storage', 'Solar Maintenance Contracts'], .7, .7),
  battery: sector('manufacturing', 'battery', 'Battery Manufacturing', '🔋', 'Storage packs for vehicles, homes and grids.', ['Home Storage', 'Fleet Battery Packs', 'Grid Storage', 'Battery Recycling', 'Power Tool Packs', 'E-Bike Batteries', 'Backup Power Units'], 1.6, .9),
  water: sector('energy', 'water', 'Water Utilities', '💧', 'Treatment, desalination and reliable water supply.', ['Desalination', 'Industrial Water', 'Smart Metering', 'Reuse Systems', 'Bottled Water Plant', 'Rainwater Harvesting', 'Leak Detection Service'], .45, .8),
  recycling: sector('manufacturing', 'recycling', 'Recycling', '♻️', 'Recover valuable materials from the waste stream.', ['Metal Recovery', 'Plastic Sorting', 'E-Waste Processing', 'Compost', 'Textile Recycling', 'Construction Waste Recovery', 'Glass Recycling'], .55, .65),
  telecom: sector('software', 'telecom', 'Telecommunications', '📡', 'Connectivity subscriptions for households and businesses.', ['Fiber Broadband', 'Business Networks', 'Rural Coverage', 'Satellite Backup', 'Mobile Plans', 'Home Phone Lines', 'Enterprise Wi-Fi'], 1.5, 1.2),
  dataCenter: sector('software', 'dataCenter', 'Data Centers', '🖥️', 'Sell reliable compute and storage to a growing digital economy.', ['Cloud Hosting', 'AI Compute', 'Sovereign Cloud', 'Disaster Recovery', 'Edge Computing Sites', 'Managed Backup', 'Private Cloud Racks'], 2.2, 1.35),
  education: sector('gym', 'education', 'Education & Training', '🎓', 'Learning centers selling courses and practical skills.', ['Language Courses', 'Coding Bootcamps', 'Exam Preparation', 'Corporate Training', 'Tutoring Service', 'Online Degrees', 'Driving Lessons'], .85, .9),
  petCare: sector('salon', 'petCare', 'Pet Care', '🐾', 'Grooming, boarding and everyday care for pets.', ['Grooming', 'Daycare', 'Boarding', 'Training Classes', 'Vet Clinic Partnership', 'Dog Walking Rounds', 'Pet Photography'], .8, 1.05),
  homeCare: sector('salon', 'homeCare', 'Home Services', '🏠', 'Reliable cleaning and household maintenance teams.', ['Deep Cleaning', 'Maintenance Plans', 'Move-Out Service', 'Garden Care', 'Pest Control', 'Pool Servicing', 'Elder Home Help'], 1.1, .85),
  packaging: sector('manufacturing', 'packaging', 'Packaging', '📦', 'Containers and protective materials for other businesses.', ['Recyclable Cartons', 'Food Containers', 'Protective Packaging', 'Reusable Crates', 'Gift Boxes', 'Mailer Bags', 'Pallet Wrap'], .6, .9),
  furniture: sector('manufacturing', 'furniture', 'Furniture', '🪑', 'Make furniture for homes, hotels and offices.', ['Modular Furniture', 'Office Desks', 'Hotel Furnishings', 'Custom Joinery', 'Outdoor Furniture', 'Kids’ Furniture', 'Sofa Beds'], .8, 1.1),
  travel: sector('marketing', 'travel', 'Travel Services', '🧳', 'Plan and sell holidays, tours and corporate travel.', ['Local Tours', 'Group Travel', 'Adventure Holidays', 'Business Travel', 'Ski Holidays', 'Cruise Bookings', 'Study Abroad Trips'], .7, 1.25),
}

/**
 * Industries that make goods can add production capacity without opening another outlet
 * (business/manage.ts "Build Capacity"): each unit adds half of one site's capacity at the home
 * site for a bit under half a site's equipment. Services, shops and deep tech (which builds its
 * own plants in the R&D Lab) grow by opening sites instead.
 */
export const CAPACITY_LINES: Partial<Record<Industry, { one: string; many: string }>> = {
  bakery: { one: 'oven line', many: 'oven lines' },
  brewery: { one: 'fermentation cellar', many: 'fermentation cellars' },
  fashion: { one: 'sewing line', many: 'sewing lines' },
  beauty: { one: 'filling line', many: 'filling lines' },
  ecommerce: { one: 'packing line', many: 'packing lines' },
  manufacturing: { one: 'production line', many: 'production lines' },
  farm: { one: 'greenhouse block', many: 'greenhouse blocks' },
  energy: { one: 'generating unit', many: 'generating units' },
}

/** The capacity unit an industry can build (null: it grows by opening sites). */
export function lineOf(industry: string): { one: string; many: string } | null {
  return (CAPACITY_LINES as Record<string, { one: string; many: string }>)[industry] ?? null
}

export function industryDef(id: string): IndustryDef {
  return (INDUSTRIES as Record<string, IndustryDef>)[id] ?? INDUSTRIES.restaurant
}

export function isIndustry(id: unknown): id is Industry {
  return typeof id === 'string' && id in INDUSTRIES
}
