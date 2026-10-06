// The 25 industries you can start a business in. Every number is a US baseline for ONE
// outlet (a truck, a restaurant, an office, a plant) in a typical city; economy.ts scales it
// to each market with data/markets.ts (labor cost, rents, local prices, taxes, demand).
//
// Rough US first-year picture per outlet (before the owner's salary and corporate tax):
// food truck ~$80K profit on ~$290K sales, restaurant ~$250K on $1.3M, software ~$150K
// that scales well, energy ~$4M on a $35M plant. Tuned for gameplay, grounded in reality.
import type { Industry, PriceCategory } from '../data/markets'

export type StaffFocus = 'quality' | 'sales' | 'finance' | 'ops'

export interface RoleDef {
  title: string
  focus: StaffFocus
  /** US yearly salary for a solid hire. */
  pay: number
}

export interface IndustryDef {
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

export const INDUSTRIES: Record<Industry, IndustryDef> = {
  foodTruck: {
    id: 'foodTruck', label: 'Food Truck', emoji: '\u{1F69A}', unit: 'meals', unitOne: 'meal', site: 'truck', sitePlural: 'trucks',
    blurb: 'Street food on wheels. Cheap to start, hard on the back.',
    price: 12, unitCost: 4.2, localShare: 0.5, costCat: 'food', tradable: 0, demand: 24_000, elasticity: 1.6, incomeSens: 0.3,
    capital: 55_000, capitalLocal: 0.35, staff: 2, wage: 30_000, staffScale: 0.9, rent: 15_000, maint: 0.1, capMult: 1.6,
    multiple: 2.5, growth: 0.4, perMillion: 15, taxShare: 1, perishable: 0.95, food: true, needs: 'driver', marketingShare: 0.03,
    roles: [r('Head Cook', 'quality', 38_000), r('Social Media Whiz', 'sales', 34_000), r('Bookkeeper', 'finance', 40_000)],
    products: ['Birria Tacos', 'Loaded Fries', 'Korean BBQ Bowl', 'Vegan Burger', 'Breakfast Burrito', 'Late-Night Menu', 'Festival Catering'],
    suffixes: ['Street Eats', 'Grill on Wheels', 'Kitchen Cruiser', 'Food Truck'],
  },
  restaurant: {
    id: 'restaurant', label: 'Restaurant', emoji: '\u{1F37D}\u{FE0F}', unit: 'meals', unitOne: 'meal', site: 'restaurant', sitePlural: 'restaurants',
    blurb: 'Sit-down dining. Thin margins, long hours, loyal regulars.',
    price: 30, unitCost: 9.5, localShare: 0.55, costCat: 'food', tradable: 0, demand: 42_000, elasticity: 1.5, incomeSens: 0.5,
    capital: 450_000, capitalLocal: 0.6, staff: 11, wage: 31_000, staffScale: 0.85, rent: 96_000, maint: 0.07, capMult: 1.6,
    multiple: 4, growth: 0.5, perMillion: 8, taxShare: 1, perishable: 0.95, food: true, marketingShare: 0.03,
    roles: [r('Head Chef', 'quality', 62_000), r('Sous Chef', 'quality', 48_000), r('Front-of-House Manager', 'sales', 52_000), r('Sommelier', 'sales', 50_000), r('Bookkeeper', 'finance', 45_000), r('General Manager', 'ops', 70_000)],
    products: ['Tasting Menu', 'Weekend Brunch', 'Delivery Service', 'Plant-Based Menu', 'Happy Hour', 'Catering Arm', 'Signature Dessert', 'Chef’s Cookbook'],
    suffixes: ['Kitchen', 'Bistro', 'Grill', 'Table', 'Eatery'],
  },
  cafe: {
    id: 'cafe', label: 'Café', emoji: '\u{2615}', unit: 'cups', unitOne: 'cup', site: 'café', sitePlural: 'cafés',
    blurb: 'Coffee, pastries and laptops that never leave.',
    price: 5.5, unitCost: 1.6, localShare: 0.5, costCat: 'food', tradable: 0.1, demand: 95_000, elasticity: 1.4, incomeSens: 0.6,
    capital: 180_000, capitalLocal: 0.55, staff: 5, wage: 29_000, staffScale: 0.85, rent: 48_000, maint: 0.08, capMult: 1.6,
    multiple: 4, growth: 0.5, perMillion: 14, taxShare: 1, perishable: 0.9, food: true, marketingShare: 0.03,
    roles: [r('Head Barista', 'quality', 36_000), r('Pastry Chef', 'quality', 40_000), r('Shift Manager', 'ops', 42_000), r('Social Media Whiz', 'sales', 38_000), r('Bookkeeper', 'finance', 42_000)],
    products: ['Seasonal Spiced Latte', 'Cold Brew on Tap', 'Oat Milk Everything', 'Coffee Subscription', 'House-Roasted Beans', 'Matcha Bar', 'Breakfast Sandwiches'],
    suffixes: ['Coffee', 'Café', 'Roasters', 'Espresso Bar', 'Coffee House'],
  },
  bakery: {
    id: 'bakery', label: 'Bakery', emoji: '\u{1F950}', unit: 'baked goods', unitOne: 'baked good', site: 'bakery', sitePlural: 'bakeries',
    blurb: 'Up at 4 AM so everyone else can have warm bread.',
    price: 5, unitCost: 1.4, localShare: 0.5, costCat: 'food', tradable: 0, demand: 110_000, elasticity: 1.4, incomeSens: 0.3,
    capital: 200_000, capitalLocal: 0.5, staff: 5, wage: 31_000, staffScale: 0.85, rent: 42_000, maint: 0.08, capMult: 1.6,
    multiple: 4, growth: 0.4, perMillion: 10, taxShare: 1, perishable: 0.98, food: true, marketingShare: 0.03,
    roles: [r('Head Baker', 'quality', 42_000), r('Pastry Chef', 'quality', 44_000), r('Counter Manager', 'sales', 36_000), r('Bookkeeper', 'finance', 42_000)],
    products: ['Sourdough Line', 'Wedding Cakes', 'Gluten-Free Range', 'Cronut Knockoffs', 'Wholesale to Cafés', 'Holiday Specials'],
    suffixes: ['Bakery', 'Bakehouse', 'Bread Co.', 'Patisserie'],
  },
  bar: {
    id: 'bar', label: 'Bar', emoji: '\u{1F378}', unit: 'drinks', unitOne: 'drink', site: 'bar', sitePlural: 'bars',
    blurb: 'Pour drinks, listen to problems, mop the floor at 3 AM.',
    price: 9, unitCost: 2.4, localShare: 0.3, costCat: 'alcohol', tradable: 0, demand: 70_000, elasticity: 1.3, incomeSens: 0.5,
    capital: 350_000, capitalLocal: 0.6, staff: 7, wage: 29_000, staffScale: 0.85, rent: 72_000, maint: 0.07, capMult: 1.6,
    multiple: 4, growth: 0.35, perMillion: 8, taxShare: 1, perishable: 0.15, food: true, needs: 'drinking', marketingShare: 0.03,
    roles: [r('Head Bartender', 'quality', 40_000), r('Mixologist', 'quality', 44_000), r('Bar Manager', 'ops', 50_000), r('Events Promoter', 'sales', 40_000), r('Bookkeeper', 'finance', 42_000)],
    products: ['Craft Cocktail Menu', 'Trivia Night', 'Live Music Weekends', 'Rooftop Terrace', 'Bottomless Brunch', 'Karaoke Room'],
    suffixes: ['Tavern', 'Taproom', 'Lounge', 'Pub', 'Bar'],
  },
  brewery: {
    id: 'brewery', label: 'Brewery', emoji: '\u{1F37A}', unit: 'barrels', unitOne: 'barrel', site: 'brewery', sitePlural: 'breweries',
    blurb: 'Craft beer with names nobody can pronounce.',
    price: 330, unitCost: 115, localShare: 0.35, costCat: 'alcohol', priceCat: 'alcohol', tradable: 0.3, demand: 3_400, elasticity: 1.2, incomeSens: 0.5,
    capital: 1_200_000, capitalLocal: 0.4, staff: 8, wage: 44_000, staffScale: 0.7, rent: 84_000, maint: 0.06, capMult: 1.8,
    multiple: 7, growth: 0.6, perMillion: 3, taxShare: 0, perishable: 0.3, needs: 'drinking', marketingShare: 0.03,
    roles: [r('Brewmaster', 'quality', 72_000), r('Quality Control Lead', 'quality', 55_000), r('Sales Rep', 'sales', 58_000), r('Operations Manager', 'ops', 68_000), r('Controller', 'finance', 70_000)],
    products: ['Hazy IPA', 'Barrel-Aged Stout', 'Hard Seltzer', 'Alcohol-Free Lager', 'Taproom Tours', 'Canned Six-Packs', 'Seasonal Sour'],
    suffixes: ['Brewing Co.', 'Brewery', 'Ales', 'Beer Works'],
  },
  grocery: {
    id: 'grocery', label: 'Grocery Store', emoji: '\u{1F6D2}', unit: 'shopping baskets', unitOne: 'shopping basket', site: 'store', sitePlural: 'stores',
    blurb: 'Everybody eats. Margins thinner than the plastic bags.',
    price: 49, unitCost: 34.5, localShare: 0.15, costCat: 'food', tradable: 0, demand: 68_000, elasticity: 2.2, incomeSens: 0.2,
    capital: 900_000, capitalLocal: 0.55, staff: 16, wage: 29_000, staffScale: 0.8, rent: 150_000, maint: 0.06, capMult: 1.6,
    multiple: 6, growth: 0.3, perMillion: 10, taxShare: 0.4, perishable: 0.6, food: true, marketingShare: 0.015,
    roles: [r('Store Manager', 'ops', 60_000), r('Produce Manager', 'quality', 42_000), r('Butcher', 'quality', 45_000), r('Merchandiser', 'sales', 40_000), r('Bookkeeper', 'finance', 44_000)],
    products: ['Store Brand Line', 'Online Delivery', 'Organic Aisle', 'Hot Food Counter', 'Loyalty Card', 'Bulk Bins'],
    suffixes: ['Market', 'Grocers', 'Fresh Mart', 'Foods', 'Supermarket'],
  },
  fashion: {
    id: 'fashion', label: 'Fashion Brand', emoji: '\u{1F457}', unit: 'garments', unitOne: 'garment', site: 'boutique', sitePlural: 'boutiques',
    blurb: 'Clothes, hype and a very opinionated creative director.',
    price: 65, unitCost: 22, localShare: 0.3, tradable: 0.6, demand: 19_000, elasticity: 1.1, incomeSens: 0.8,
    capital: 300_000, capitalLocal: 0.5, staff: 8, wage: 38_000, staffScale: 0.75, rent: 120_000, maint: 0.1, capMult: 2,
    multiple: 8, growth: 0.8, perMillion: 4, taxShare: 1, perishable: 0.25, marketingShare: 0.06,
    roles: [r('Creative Director', 'quality', 85_000), r('Pattern Maker', 'quality', 52_000), r('Brand Manager', 'sales', 70_000), r('Store Manager', 'ops', 50_000), r('Controller', 'finance', 68_000)],
    products: ['Streetwear Capsule', 'Sustainable Denim', 'Sneaker Collab', 'Kidswear Line', 'Athleisure Range', 'Runway Collection', 'Limited Drop'],
    suffixes: ['Apparel', 'Clothing Co.', 'Atelier', 'Threads', 'Studio'],
  },
  beauty: {
    id: 'beauty', label: 'Beauty Brand', emoji: '\u{1F484}', unit: 'products', unitOne: 'product', site: 'store', sitePlural: 'stores',
    blurb: 'Skincare, cosmetics and serums with very scientific names.',
    price: 28, unitCost: 7.5, localShare: 0.3, tradable: 0.6, demand: 48_000, elasticity: 1, incomeSens: 0.7,
    capital: 1_000_000, capitalLocal: 0.4, staff: 9, wage: 42_000, staffScale: 0.7, rent: 96_000, maint: 0.06, capMult: 2,
    multiple: 10, growth: 0.8, perMillion: 3, taxShare: 1, perishable: 0.1, marketingShare: 0.06,
    roles: [r('Cosmetic Chemist', 'quality', 82_000), r('Product Developer', 'quality', 70_000), r('Influencer Manager', 'sales', 60_000), r('Retail Manager', 'ops', 55_000), r('Controller', 'finance', 70_000)],
    products: ['Vitamin C Serum', 'Clean Beauty Line', 'Men’s Grooming Kit', 'Sunscreen That Isn’t Greasy', 'Lip Kit Collab', 'Fragrance Launch', 'Hair Growth Oil'],
    suffixes: ['Beauty', 'Cosmetics', 'Skincare', 'Glow', 'Labs'],
  },
  salon: {
    id: 'salon', label: 'Salon', emoji: '\u{1F487}', unit: 'appointments', unitOne: 'appointment', site: 'salon', sitePlural: 'salons',
    blurb: 'Haircuts, nails and gossip, by appointment only.',
    price: 55, unitCost: 8, localShare: 0.4, tradable: 0, demand: 9_500, elasticity: 1.3, incomeSens: 0.5,
    capital: 120_000, capitalLocal: 0.6, staff: 6, wage: 33_000, staffScale: 0.9, rent: 54_000, maint: 0.08, capMult: 1.5,
    multiple: 3.5, growth: 0.35, perMillion: 20, taxShare: 1, perishable: 1, marketingShare: 0.03,
    roles: [r('Master Stylist', 'quality', 48_000), r('Colorist', 'quality', 44_000), r('Nail Technician', 'quality', 34_000), r('Front Desk Manager', 'sales', 32_000), r('Bookkeeper', 'finance', 40_000)],
    products: ['Balayage Specials', 'Men’s Grooming Bar', 'Bridal Packages', 'Lash Extensions', 'Scalp Spa', 'House Hair Products'],
    suffixes: ['Salon', 'Hair Studio', 'Nails & Spa', 'Barbershop'],
  },
  gym: {
    id: 'gym', label: 'Gym', emoji: '\u{1F3CB}\u{FE0F}', unit: 'memberships', unitOne: 'membership', site: 'gym', sitePlural: 'gyms',
    blurb: 'Sell New Year’s resolutions by the month.',
    price: 600, unitCost: 110, localShare: 0.5, tradable: 0, demand: 1_100, elasticity: 1.4, incomeSens: 0.8,
    capital: 450_000, capitalLocal: 0.45, staff: 6, wage: 32_000, staffScale: 0.6, rent: 120_000, maint: 0.1, capMult: 1.8,
    multiple: 6, growth: 0.45, perMillion: 6, taxShare: 1, perishable: 1, marketingShare: 0.04,
    roles: [r('Head Trainer', 'quality', 45_000), r('Class Instructor', 'quality', 38_000), r('Membership Sales Lead', 'sales', 42_000), r('Club Manager', 'ops', 55_000), r('Bookkeeper', 'finance', 42_000)],
    products: ['24/7 Access', 'Spin Studio', 'Boxing Classes', 'Personal Training Packages', 'Sauna & Recovery Zone', 'Fitness App'],
    suffixes: ['Fitness', 'Gym', 'Athletic Club', 'Strength'],
  },
  autoShop: {
    id: 'autoShop', label: 'Auto Repair Shop', emoji: '\u{1F527}', unit: 'repair jobs', unitOne: 'repair job', site: 'garage', sitePlural: 'garages',
    blurb: '"It’s probably the transmission." It’s always the transmission.',
    price: 480, unitCost: 210, localShare: 0.3, tradable: 0.2, demand: 2_200, elasticity: 1.2, incomeSens: 0.6,
    capital: 280_000, capitalLocal: 0.45, staff: 6, wage: 47_000, staffScale: 0.9, rent: 66_000, maint: 0.08, capMult: 1.6,
    multiple: 4, growth: 0.3, perMillion: 10, taxShare: 1, perishable: 1, marketingShare: 0.03,
    roles: [r('Master Mechanic', 'quality', 68_000), r('Diagnostics Tech', 'quality', 58_000), r('Service Advisor', 'sales', 50_000), r('Shop Foreman', 'ops', 62_000), r('Bookkeeper', 'finance', 44_000)],
    products: ['EV Servicing', 'Detailing Bay', 'Tire Center', 'Fleet Contracts', 'Classic Car Restoration', 'Mobile Mechanics'],
    suffixes: ['Auto Repair', 'Motors', 'Garage', 'Auto Works'],
  },
  construction: {
    id: 'construction', label: 'Construction', emoji: '\u{1F3D7}\u{FE0F}', unit: 'projects', unitOne: 'project', site: 'crew', sitePlural: 'crews',
    blurb: 'Build things, blow deadlines, invoice anyway.',
    price: 42_000, unitCost: 27_000, localShare: 0.6, tradable: 0, demand: 55, elasticity: 1.5, incomeSens: 0.5,
    capital: 650_000, capitalLocal: 0.4, staff: 10, wage: 52_000, staffScale: 0.9, rent: 42_000, maint: 0.1, capMult: 1.7,
    multiple: 5, growth: 0.5, perMillion: 6, taxShare: 0, perishable: 1, marketingShare: 0.01,
    roles: [r('Site Foreman', 'quality', 75_000), r('Project Manager', 'ops', 85_000), r('Estimator', 'sales', 70_000), r('Safety Officer', 'quality', 62_000), r('Controller', 'finance', 78_000)],
    products: ['Home Renovations', 'Commercial Fit-Outs', 'Green Building', 'Government Contracts', 'Prefab Homes', 'Road Works'],
    suffixes: ['Construction', 'Builders', 'Contracting', 'Build Group'],
  },
  realEstate: {
    id: 'realEstate', label: 'Real Estate Agency', emoji: '\u{1F3E1}', unit: 'home sales', unitOne: 'home sale', site: 'office', sitePlural: 'offices',
    blurb: 'Commission on every "cozy" (small) and "charming" (old) home.',
    price: 11_000, unitCost: 6_200, localShare: 0.8, tradable: 0, demand: 120, elasticity: 1, incomeSens: 0.7,
    capital: 150_000, capitalLocal: 0.7, staff: 6, wage: 48_000, staffScale: 0.85, rent: 72_000, maint: 0.08, capMult: 1.8,
    multiple: 5, growth: 0.5, perMillion: 5, taxShare: 0, perishable: 1, marketingShare: 0.05,
    roles: [r('Top Producer', 'sales', 90_000), r('Listing Agent', 'sales', 70_000), r('Office Manager', 'ops', 52_000), r('Transaction Coordinator', 'quality', 48_000), r('Bookkeeper', 'finance', 45_000)],
    products: ['Luxury Division', 'Property Management', 'Commercial Leasing', 'Virtual Tours', 'Relocation Services', 'Mortgage Desk'],
    suffixes: ['Realty', 'Properties', 'Real Estate', 'Homes'],
  },
  software: {
    id: 'software', label: 'Software Company', emoji: '\u{1F4BB}', unit: 'subscriptions', unitOne: 'subscription', site: 'office', sitePlural: 'offices',
    blurb: 'Write code once, sell it forever. In theory.',
    price: 1_200, unitCost: 140, localShare: 0.2, tradable: 0.85, demand: 1_900, elasticity: 1.2, incomeSens: 0.6,
    capital: 400_000, capitalLocal: 0.6, staff: 14, wage: 105_000, staffScale: 0.55, rent: 150_000, maint: 0.15, capMult: 8,
    multiple: 15, growth: 1, perMillion: 1.5, taxShare: 0, perishable: 1, marketingShare: 0.08,
    roles: [r('Lead Engineer', 'quality', 170_000), r('Product Manager', 'quality', 150_000), r('Head of Sales', 'sales', 160_000), r('Head of Growth', 'sales', 140_000), r('CFO', 'finance', 180_000), r('COO', 'ops', 175_000)],
    products: ['AI Assistant Feature', 'Mobile App', 'Enterprise Tier', 'API Platform', 'Analytics Dashboard', 'Security Suite', 'Marketplace Integrations'],
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
    products: ['Open-World Sequel', 'Cozy Farming Game', 'Battle Royale Mode', 'Mobile Port', 'Story DLC', 'VR Spin-Off', 'Remastered Classic'],
    suffixes: ['Games', 'Interactive', 'Studios', 'Entertainment'],
  },
  ecommerce: {
    id: 'ecommerce', label: 'E-Commerce Store', emoji: '\u{1F4E6}', unit: 'orders', unitOne: 'order', site: 'warehouse', sitePlural: 'warehouses',
    blurb: 'Sell online, ship fast, pray the returns are rare.',
    price: 48, unitCost: 30, localShare: 0.3, tradable: 0.3, demand: 52_000, elasticity: 1.6, incomeSens: 0.7,
    capital: 120_000, capitalLocal: 0.5, staff: 8, wage: 44_000, staffScale: 0.6, rent: 96_000, maint: 0.12, capMult: 5,
    multiple: 9, growth: 0.9, perMillion: 2, taxShare: 1, perishable: 0.2, marketingShare: 0.08,
    roles: [r('Head of Merchandising', 'quality', 75_000), r('Performance Marketer', 'sales', 85_000), r('Warehouse Manager', 'ops', 58_000), r('Customer Service Lead', 'quality', 48_000), r('Controller', 'finance', 75_000)],
    products: ['Same-Day Delivery', 'Private Label', 'Subscription Boxes', 'Marketplace for Sellers', 'Live-Stream Shopping', 'Buy Now, Pay Later'],
    suffixes: ['Online', 'Shop', 'Direct', 'Express', 'Store'],
  },
  marketing: {
    id: 'marketing', label: 'Marketing Agency', emoji: '\u{1F4E3}', unit: 'client accounts', unitOne: 'client account', site: 'office', sitePlural: 'offices',
    blurb: 'Make other people’s products go viral. Bill hourly.',
    price: 62_000, unitCost: 9_000, localShare: 0.6, tradable: 0.15, demand: 24, elasticity: 1.1, incomeSens: 0.6,
    capital: 100_000, capitalLocal: 0.7, staff: 14, wage: 66_000, staffScale: 0.8, rent: 96_000, maint: 0.12, capMult: 2,
    multiple: 6, growth: 0.6, perMillion: 3, taxShare: 0, perishable: 1, marketingShare: 0.02,
    roles: [r('Creative Director', 'quality', 120_000), r('Account Director', 'sales', 110_000), r('Head of Strategy', 'quality', 115_000), r('Operations Manager', 'ops', 85_000), r('Finance Director', 'finance', 105_000)],
    products: ['Influencer Network', 'Data & Analytics Unit', 'Video Production', 'Crisis PR Desk', 'TikTok Studio', 'B2B Lead Generation'],
    suffixes: ['Media', 'Marketing', 'Creative', 'Agency', 'Collective'],
  },
  clinic: {
    id: 'clinic', label: 'Medical Clinic', emoji: '\u{1FA7A}', unit: 'patient visits', unitOne: 'patient visit', site: 'clinic', sitePlural: 'clinics',
    blurb: 'Private healthcare. Needs doctors, licences and nerves of steel.',
    price: 190, unitCost: 42, localShare: 0.6, tradable: 0, demand: 12_500, elasticity: 0.8, incomeSens: 0.6,
    capital: 1_300_000, capitalLocal: 0.45, staff: 12, wage: 92_000, staffScale: 0.85, rent: 120_000, maint: 0.07, capMult: 1.6,
    multiple: 9, growth: 0.4, perMillion: 6, taxShare: 0, perishable: 1, needs: 'medical', marketingShare: 0.02,
    roles: [r('Chief Physician', 'quality', 260_000), r('Head Nurse', 'quality', 95_000), r('Practice Manager', 'ops', 80_000), r('Patient Relations Lead', 'sales', 55_000), r('Billing Manager', 'finance', 70_000)],
    products: ['Urgent Care Wing', 'Telehealth', 'Dermatology Practice', 'Physiotherapy', 'Executive Health Checks', 'Diagnostic Imaging'],
    suffixes: ['Medical Center', 'Clinic', 'Health', 'Family Practice'],
  },
  hotel: {
    id: 'hotel', label: 'Hotel', emoji: '\u{1F3E8}', unit: 'room nights', unitOne: 'room night', site: 'hotel', sitePlural: 'hotels',
    blurb: 'Fluffy towels, tiny shampoos and one-star reviews about the Wi-Fi.',
    price: 165, unitCost: 46, localShare: 0.6, tradable: 0.4, demand: 17_000, elasticity: 1.3, incomeSens: 0.4,
    capital: 6_500_000, capitalLocal: 0.6, staff: 26, wage: 31_000, staffScale: 0.8, rent: 240_000, maint: 0.04, capMult: 1.3,
    multiple: 11, growth: 0.5, perMillion: 4, taxShare: 1, perishable: 1, food: true, marketingShare: 0.04,
    roles: [r('Hotel General Manager', 'ops', 110_000), r('Executive Chef', 'quality', 75_000), r('Head of Housekeeping', 'quality', 48_000), r('Revenue Manager', 'sales', 80_000), r('Controller', 'finance', 85_000)],
    products: ['Rooftop Bar', 'Day Spa', 'Wedding Venue', 'Conference Center', 'Loyalty Program', 'Boutique Suites'],
    suffixes: ['Hotel', 'Inn', 'Resort', 'Suites', 'Grand Hotel'],
  },
  logistics: {
    id: 'logistics', label: 'Logistics Company', emoji: '\u{1F69B}', unit: 'shipments', unitOne: 'shipment', site: 'depot', sitePlural: 'depots',
    blurb: 'Move other people’s stuff from A to B, mostly on time.',
    price: 360, unitCost: 175, localShare: 0.3, costCat: 'fuel', tradable: 0.1, demand: 6_200, elasticity: 1.5, incomeSens: 0.4,
    capital: 1_100_000, capitalLocal: 0.3, staff: 13, wage: 52_000, staffScale: 0.85, rent: 90_000, maint: 0.1, capMult: 1.7,
    multiple: 7, growth: 0.5, perMillion: 3, taxShare: 0, perishable: 1, needs: 'driver', marketingShare: 0.01,
    roles: [r('Fleet Manager', 'ops', 72_000), r('Dispatch Lead', 'ops', 58_000), r('Safety Manager', 'quality', 65_000), r('Key Account Manager', 'sales', 75_000), r('Controller', 'finance', 78_000)],
    products: ['Cold-Chain Freight', 'Last-Mile Delivery', 'Cross-Border Trucking', 'Warehousing', 'Electric Vans', 'Express Courier'],
    suffixes: ['Logistics', 'Freight', 'Transport', 'Express', 'Haulage'],
  },
  manufacturing: {
    id: 'manufacturing', label: 'Manufacturing', emoji: '\u{1F3ED}', unit: 'units', unitOne: 'unit', site: 'factory', sitePlural: 'factories',
    blurb: 'Make things in bulk. Hard hats mandatory.',
    price: 125, unitCost: 68, localShare: 0.4, tradable: 0.8, demand: 38_000, elasticity: 1.6, incomeSens: 0.3,
    capital: 3_500_000, capitalLocal: 0.35, staff: 28, wage: 46_000, staffScale: 0.75, rent: 240_000, maint: 0.06, capMult: 2,
    multiple: 8, growth: 0.7, perMillion: 2, taxShare: 0, perishable: 0.05, marketingShare: 0.02,
    roles: [r('Plant Manager', 'ops', 110_000), r('Quality Engineer', 'quality', 90_000), r('Process Engineer', 'quality', 95_000), r('Sales Director', 'sales', 120_000), r('Controller', 'finance', 100_000)],
    products: ['Smart Home Gadget', 'Industrial Robot Arm', 'Eco Packaging', 'Kitchen Appliance Line', 'E-Bike Frames', 'Medical Devices', 'Solar Panel Mounts'],
    suffixes: ['Industries', 'Manufacturing', 'Works', 'Products', 'Engineering'],
  },
  farm: {
    id: 'farm', label: 'Farm', emoji: '\u{1F69C}', unit: 'tons of produce', unitOne: 'ton of produce', site: 'farm', sitePlural: 'farms',
    blurb: 'Up with the rooster, at the mercy of the weather.',
    price: 520, unitCost: 230, localShare: 0.5, costCat: 'fuel', priceCat: 'food', tradable: 0.6, demand: 2_100, elasticity: 1.8, incomeSens: 0.1,
    capital: 1_600_000, capitalLocal: 0.5, staff: 6, wage: 31_000, staffScale: 0.8, rent: 72_000, maint: 0.05, capMult: 1.5,
    multiple: 7, growth: 0.35, perMillion: 10, taxShare: 0, perishable: 0.7, marketingShare: 0.01,
    roles: [r('Farm Manager', 'ops', 58_000), r('Agronomist', 'quality', 65_000), r('Head Herdsman', 'quality', 45_000), r('Produce Buyer Liaison', 'sales', 52_000), r('Bookkeeper', 'finance', 44_000)],
    products: ['Organic Certification', 'Farm Shop', 'Greenhouse Tomatoes', 'Free-Range Eggs', 'Agritourism Weekends', 'Direct-to-Restaurant Deals'],
    suffixes: ['Farms', 'Harvest', 'Agro', 'Orchards', 'Ranch'],
  },
  energy: {
    id: 'energy', label: 'Energy Company', emoji: '\u{26A1}', unit: 'MWh', unitOne: 'MWh', site: 'power plant', sitePlural: 'power plants',
    blurb: 'Keep the lights on. Capital-hungry, steady and heavily regulated.',
    price: 72, unitCost: 14, localShare: 0.4, priceCat: 'fuel', tradable: 0.5, demand: 120_000, elasticity: 2, incomeSens: 0.2,
    capital: 35_000_000, capitalLocal: 0.35, staff: 16, wage: 88_000, staffScale: 0.5, rent: 300_000, maint: 0.04, capMult: 1.3,
    multiple: 11, growth: 0.4, perMillion: 0.5, taxShare: 0, perishable: 1, marketingShare: 0.005,
    roles: [r('Chief Engineer', 'quality', 160_000), r('Grid Operations Lead', 'ops', 140_000), r('Regulatory Affairs Director', 'finance', 150_000), r('Energy Trader', 'sales', 170_000), r('CFO', 'finance', 190_000)],
    products: ['Battery Storage', 'Offshore Wind Farm', 'Rooftop Solar for Homes', 'Green Hydrogen Pilot', 'Smart Meters', 'EV Charging Network'],
    suffixes: ['Energy', 'Power', 'Solar', 'Renewables', 'Utilities'],
  },
  entertainment: {
    id: 'entertainment', label: 'Entertainment Company', emoji: '\u{1F3AA}', unit: 'tickets', unitOne: 'ticket', site: 'venue', sitePlural: 'venues',
    blurb: 'Concerts, comedy nights and festivals. Glamorous until it rains.',
    price: 42, unitCost: 13, localShare: 0.5, tradable: 0.2, demand: 40_000, elasticity: 1.3, incomeSens: 0.8,
    capital: 600_000, capitalLocal: 0.5, staff: 12, wage: 40_000, staffScale: 0.75, rent: 150_000, maint: 0.1, capMult: 1.8,
    multiple: 7, growth: 0.7, perMillion: 4, taxShare: 1, perishable: 1, marketingShare: 0.06,
    roles: [r('Talent Booker', 'quality', 80_000), r('Production Manager', 'ops', 70_000), r('Head of Ticketing', 'sales', 65_000), r('Promoter', 'sales', 60_000), r('Controller', 'finance', 75_000)],
    products: ['Summer Music Festival', 'Comedy Club Nights', 'Esports Tournament', 'Immersive Art Show', 'Drag Brunch', 'Podcast Live Tour'],
    suffixes: ['Entertainment', 'Events', 'Live', 'Productions'],
  },
}

export function industryDef(id: string): IndustryDef {
  return (INDUSTRIES as Record<string, IndustryDef>)[id] ?? INDUSTRIES.restaurant
}

export function isIndustry(id: unknown): id is Industry {
  return typeof id === 'string' && id in INDUSTRIES
}
