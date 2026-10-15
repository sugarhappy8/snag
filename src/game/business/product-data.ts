// Real-history demand for every kind of product a company can develop: when it was first sold,
// when it went mainstream, how big its market is against a typical line of its trade, and when
// (and how far) it declined. Street lighting spread from the 1880s, coal plants peaked around
// 2008, house calls faded after the 1930s and cronut knockoffs lasted about a year. Products that
// rode a technology follow the game's adoption curves for it (a smartphone chip follows
// smartphones). Poorer countries adopt later, like technologies do (history/timeline.ts). Pure
// data and pure helpers: no game state.
import { TECH, techAdoption, type TechId } from '../history/timeline'
import { getCountry } from '../world'

/**
 * [first year sold somewhere rich, year it reached half of its eventual demand there, size of its
 * market vs a typical line of the trade (1), year demand started to fall, share of the peak left
 * once the fall has run its course, years the fall takes to run most of its course (fads: 2)].
 */
type Span = readonly [first: number, main: number, size?: number, peak?: number, left?: number, fall?: number]

/** A kind of product that follows the adoption of a technology (with its size vs a typical line). */
interface TechCurve {
  tech: TechId
  size?: number
  /** First year it can be sold even if the technology lags (defaults to the technology's own). */
  first?: number
}

export type DemandCurve = Span | TechCurve

/** Years the poorest countries lag behind the richest for an ordinary product. */
const LAG = 15
/** Years a fall takes to run most of its course (e-folding time). */
const FALL_YEARS = 8

/** Timeless kinds of product: sold long before the game's first year, mainstream ever since. */
const OLD: Span = [1850, 1880]

const DEMAND: Record<string, DemandCurve> = {
  // Street food
  'Birria Tacos': [2013, 2020, 0.8, 2023, 0.55, 4],
  'Loaded Fries': [1988, 2005],
  'Korean BBQ Bowl': [2006, 2014, 0.8, 2019, 0.7],
  'Vegan Burger': [1983, 2017, 1, 2021, 0.65],
  'Breakfast Burrito': [1972, 1992],
  'Late-Night Menu': [1900, 1950],
  'Festival Catering': [1968, 1995, 0.8],
  'Daily Lunch Special': [1880, 1920],
  'Fresh Lemonade': [1880, 1910, 0.7, 1950, 0.55],
  'Fried Fish Supper': [1860, 1905, 1, 1950, 0.45],
  'Hot Sandwiches': [1880, 1925],
  // Restaurants
  'Tasting Menu': [1978, 2005, 0.7],
  'Weekend Brunch': [1948, 1985],
  'Delivery Service': [1900, 2012, 1.3],
  'Plant-Based Menu': [2008, 2019, 0.9, 2022, 0.8],
  'Happy Hour': [1958, 1980, 0.9],
  'Catering Arm': [1880, 1940],
  'Signature Dessert': [1880, 1930, 0.8],
  'Chef’s Cookbook': [1900, 1975, 0.5],
  'Sunday Roast': [1850, 1900, 1, 1965, 0.6],
  'Soup of the Day': [1880, 1920, 0.8],
  'Chef’s Special': [1880, 1920],
  'Private Dining Room': [1880, 1930, 0.8],
  // Cafés
  'Seasonal Spiced Latte': [2001, 2010],
  'Cold Brew on Tap': [2010, 2018, 0.9],
  'Oat Milk Everything': [2016, 2021, 0.9],
  'Coffee Subscription': [2008, 2018, 0.6],
  'House-Roasted Beans': [1900, 1995, 0.8],
  'Matcha Bar': [2012, 2019, 0.6],
  'Breakfast Sandwiches': [1968, 1990],
  'Afternoon Tea': [1850, 1890, 1, 1950, 0.5],
  'Pastry Counter': [1880, 1920],
  'House Blend': [1880, 1930],
  'Iced Coffee': [1900, 2000, 0.9],
  // Bakeries
  'Sourdough Line': [1880, 2005],
  'Wedding Cakes': [1850, 1900],
  'Gluten-Free Range': [2003, 2013, 0.7, 2017, 0.8],
  'Cronut Knockoffs': [2013, 2013, 0.6, 2014, 0.1, 2],
  'Wholesale to Cafés': [1880, 1960],
  'Holiday Specials': [1850, 1900, 0.8],
  'Rye Loaf': [1850, 1880, 1, 1945, 0.6],
  'Cream Pies': [1880, 1920, 0.8],
  'Fruit Tarts': [1880, 1920, 0.8],
  'Morning Rolls': [1850, 1890],
  // Bars
  'Craft Cocktail Menu': [2003, 2012],
  'Trivia Night': [1973, 2005, 0.8],
  'Live Music Weekends': [1900, 1950],
  'Rooftop Terrace': [1925, 2010, 0.8],
  'Bottomless Brunch': [1988, 2014, 0.8],
  'Karaoke Room': [1983, 1995, 0.8, 2005, 0.7],
  'House Punch': [1850, 1890, 0.7, 1930, 0.6],
  'Darts League': [1900, 1950, 0.8, 1985, 0.5],
  'Piano Nights': [1880, 1915, 0.8, 1935, 0.3],
  'Bar Snacks Menu': [1880, 1930, 0.8],
  // Breweries
  'Hazy IPA': [2010, 2017],
  'Barrel-Aged Stout': [1993, 2012, 0.6],
  'Hard Seltzer': [2014, 2019, 1, 2021, 0.5, 3],
  'Alcohol-Free Lager': [1978, 2020, 0.9],
  'Taproom Tours': [1983, 2012, 0.5],
  'Canned Six-Packs': [1936, 1960, 1.2],
  'Seasonal Sour': [2006, 2016, 0.5],
  'Pale Ale': [1850, 1880],
  Porter: [1850, 1860, 1, 1900, 0.3],
  'Bock Beer': [1850, 1880, 0.7, 1925, 0.4],
  'Bottled Pilsner': [1870, 1920, 1.2],
  // Grocery
  'Store Brand Line': [1915, 1980, 1.2],
  'Online Delivery': [1996, 2018, 1.3],
  'Organic Aisle': [1988, 2008],
  'Hot Food Counter': [1920, 1985, 0.8],
  'Loyalty Card': [1983, 1998, 0.9],
  'Bulk Bins': [1968, 1990, 0.6, 2000, 0.7],
  'Butcher Counter': [1850, 1880, 1, 1960, 0.6],
  'Deli Counter': [1880, 1940, 0.9],
  'Fresh Produce Stand': [1850, 1880],
  'Home Delivery Rounds': [1880, 1905, 1, 1950, 0.2],
  // Fashion
  'Streetwear Capsule': [1988, 2012],
  'Sustainable Denim': [2006, 2020, 0.8],
  'Sneaker Collab': [1983, 2015, 0.8],
  'Kidswear Line': [1880, 1950],
  'Athleisure Range': [2008, 2016],
  'Runway Collection': [1948, 1980, 0.6],
  'Limited Drop': [2008, 2016, 0.6],
  'Tailored Suits': [1850, 1890, 1, 1965, 0.4],
  'Evening Gowns': [1850, 1900, 0.8],
  'Hats & Gloves': [1850, 1880, 1, 1950, 0.1],
  'Workwear Line': [1870, 1920],
  // Beauty
  'Vitamin C Serum': [1993, 2015, 0.8],
  'Clean Beauty Line': [2010, 2019, 0.9],
  'Men’s Grooming Kit': [1988, 2012, 0.8],
  'Sunscreen That Isn’t Greasy': [1948, 1990, 0.9],
  'Lip Kit Collab': [2015, 2016, 0.6, 2017, 0.4, 3],
  'Fragrance Launch': [1900, 1950],
  'Hair Growth Oil': [1950, 2012, 0.6],
  'Cold Cream': [1880, 1920, 1, 1955, 0.3],
  'Face Powder': [1880, 1925, 1, 1950, 0.5],
  'Lipstick Line': [1915, 1945],
  'Hair Tonic': [1880, 1915, 0.8, 1945, 0.2],
  // Salons
  'Balayage Specials': [1998, 2014, 0.9],
  'Men’s Grooming Bar': [2003, 2015, 0.8],
  'Bridal Packages': [1958, 1990, 0.8],
  'Lash Extensions': [2003, 2015, 0.8],
  'Scalp Spa': [2008, 2020, 0.5],
  'House Hair Products': [1900, 1970, 0.7],
  'Permanent Waves': [1909, 1935, 1, 1985, 0.2],
  'Manicure Corner': [1880, 1960, 0.8],
  'Hot Towel Shaves': [1850, 1880, 0.8, 1940, 0.3],
  'Hair Coloring': [1920, 1965],
  // Gyms
  '24/7 Access': [1993, 2012],
  'Spin Studio': [1993, 2012, 0.8, 2018, 0.7],
  'Boxing Classes': [1890, 1930, 0.7],
  'Personal Training Packages': [1983, 2005],
  'Sauna & Recovery Zone': [2003, 2018, 0.7],
  'Fitness App': { tech: 'smartphone', size: 0.8, first: 2010 },
  'Weightlifting Room': [1880, 1960],
  'Swimming Lessons': [1880, 1930, 0.8],
  'Calisthenics Classes': [1880, 1910, 0.8, 1955, 0.4],
  'Wrestling Club': [1880, 1905, 0.6, 1935, 0.3],
  // Car repair
  'EV Servicing': { tech: 'electricCars', size: 1.2, first: 2012 },
  'Detailing Bay': [1968, 1995, 0.7],
  'Tire Center': [1905, 1950, 1.1],
  'Fleet Contracts': [1948, 1975, 0.9],
  'Classic Car Restoration': [1958, 1995, 0.5],
  'Mobile Mechanics': [1978, 2015, 0.6],
  'Oil Change Special': [1910, 1950],
  'Brake Service': [1910, 1950],
  'Paint & Body Shop': [1910, 1950],
  'Towing Service': [1915, 1950, 0.8],
  // Construction
  'Home Renovations': [1880, 1960, 1.2],
  'Commercial Fit-Outs': [1900, 1965],
  'Green Building': [1993, 2012],
  'Government Contracts': [1880, 1935, 1.2],
  'Prefab Homes': [1943, 1955, 0.8, 1972, 0.5],
  'Road Works': [1900, 1955, 1.1],
  'Family Houses': [1850, 1900, 1.2],
  Bridges: [1850, 1900, 0.9],
  'Schools & Hospitals': [1880, 1930],
  'Factory Buildings': [1880, 1920, 1, 1975, 0.6],
  // Real estate
  'Luxury Division': [1880, 1950, 0.8],
  'Property Management': [1880, 1955],
  'Commercial Leasing': [1880, 1955],
  'Virtual Tours': [1995, 2015, 0.6],
  'Relocation Services': [1958, 1985, 0.6],
  'Mortgage Desk': [1900, 1950],
  'Starter Homes': [1880, 1950],
  'Apartment Rentals': [1850, 1900],
  'Farmland Sales': [1850, 1880, 1, 1925, 0.4],
  'Holiday Cottages': [1900, 1960, 0.7],
  // Software
  'AI Assistant Feature': [2015, 2024, 1.4],
  'Mobile App': { tech: 'smartphone', size: 1.3, first: 2009 },
  'Enterprise Tier': [1998, 2010, 1.1],
  'API Platform': [2003, 2015],
  'Analytics Dashboard': [1998, 2012, 0.9],
  'Security Suite': [1993, 2005],
  'Marketplace Integrations': [2008, 2017, 0.7],
  'Payroll Program': [1955, 1975],
  'Inventory System': [1958, 1980],
  'Custom Programming': [1955, 1970, 1, 2000, 0.6],
  'Scheduling System': [1963, 1985, 0.8],
  // Game studios (their games are their products; kept for completeness)
  'Open-World Sequel': [1998, 2012],
  'Cozy Farming Game': [2008, 2017, 0.7],
  'Battle Royale Mode': [2016, 2018, 1, 2021, 0.6, 4],
  'Mobile Port': { tech: 'smartphone', first: 2009 },
  'Story DLC': [2005, 2012, 0.6],
  'VR Spin-Off': [2015, 2030, 0.5],
  'Remastered Classic': [1998, 2015, 0.6],
  'Arcade Game': [1971, 1979, 1, 1983, 0.15, 4],
  'Sports Game': [1972, 1995],
  'Space Shooter': [1972, 1980, 0.8, 1990, 0.3],
  'Puzzle Game': [1975, 1995, 0.8],
  // Online shopping
  'Same-Day Delivery': [1995, 2017],
  'Private Label': [1960, 2015],
  'Subscription Boxes': [2008, 2015, 0.7, 2018, 0.6, 4],
  'Marketplace for Sellers': [1998, 2010, 1.3],
  'Live-Stream Shopping': [2016, 2021, 0.8],
  'Buy Now, Pay Later': [2013, 2021, 0.7],
  'Gift Shop Section': [1880, 1950, 0.7],
  'Clearance Outlet': [1880, 1950, 0.8],
  'Gift Wrapping Service': [1900, 1950, 0.4],
  'Bestseller Shelf': [1880, 1950, 0.8],
  // Marketing
  'Influencer Network': [2010, 2018],
  'Data & Analytics Unit': [2003, 2014],
  'Video Production': [1965, 1980],
  'Crisis PR Desk': [1978, 1995, 0.6],
  'Short-Video Studio': [2015, 2020, 0.8],
  'B2B Lead Generation': [1998, 2012, 0.9],
  'Billboard Campaigns': [1880, 1930],
  'Newspaper Ads': [1850, 1880, 1.2, 1995, 0.25],
  'Trade Show Booths': [1880, 1950, 0.8],
  'Catalog Design': [1880, 1930, 0.8, 1995, 0.3],
  // Private healthcare
  'Urgent Care Wing': [1973, 2005],
  Telehealth: [1998, 2020],
  'Dermatology Practice': [1900, 1960, 0.8],
  Physiotherapy: [1900, 1965, 0.9],
  'Executive Health Checks': [1958, 1990, 0.6],
  'Diagnostic Imaging': [1971, 1990, 1.1],
  'Family Practice': [1850, 1880, 1.2],
  'Vaccination Clinic': [1890, 1955, 0.8],
  'Maternity Ward': [1880, 1940],
  'House Calls': [1850, 1870, 1, 1935, 0.1],
  // Hotels
  'Rooftop Bar': [1948, 2010, 0.7],
  'Day Spa': [1983, 2005, 0.8],
  'Wedding Venue': [1880, 1950],
  'Conference Center': [1948, 1975],
  'Loyalty Program': [1979, 1995, 0.9],
  'Boutique Suites': [1983, 2005, 0.8],
  'Grand Ballroom': [1850, 1890, 1, 1935, 0.5],
  'Honeymoon Suite': [1880, 1950, 0.7],
  'Hotel Restaurant': [1850, 1890],
  'Tea Room': [1850, 1890, 0.8, 1935, 0.3],
  // Logistics
  'Cold-Chain Freight': [1948, 1975],
  'Last-Mile Delivery': [2003, 2018, 1.2],
  'Cross-Border Trucking': [1948, 1995],
  Warehousing: [1880, 1950],
  'Electric Vans': { tech: 'electricCars', size: 0.9, first: 2012 },
  'Express Courier': [1968, 1990],
  'Parcel Service': [1880, 1920],
  'Moving Vans': [1900, 1950, 0.8],
  'Rail Freight Contracts': [1850, 1880, 1.2, 1950, 0.4],
  'Furniture Removals': [1880, 1930, 0.7],
  // Manufacturing
  'Smart Home Gadget': [2010, 2020, 0.9],
  'Industrial Robot Arm': [1962, 1990],
  'Eco Packaging': [1988, 2018, 0.8],
  'Kitchen Appliance Line': [1915, 1955, 1.2],
  'E-Bike Frames': [2003, 2020, 0.7],
  'Medical Devices': [1958, 1985, 1.1],
  'Solar Panel Mounts': [1978, 2015, 0.7],
  'Hand Tools': OLD,
  'Sewing Machines': [1855, 1900, 1, 1960, 0.2],
  'Bicycle Parts': [1880, 1900, 0.9],
  'Enamel Cookware': [1860, 1900, 0.8, 1935, 0.25],
  // Farming
  'Organic Certification': [1973, 2005, 0.9],
  'Farm Shop': [1880, 1960, 0.8],
  'Greenhouse Tomatoes': [1920, 1985, 0.9],
  'Free-Range Eggs': [1973, 2010, 0.8],
  'Agritourism Weekends': [1983, 2010, 0.5],
  'Direct-to-Restaurant Deals': [1988, 2012, 0.7],
  'Dairy Herd': [1850, 1880, 1.2],
  'Orchard Fruit': OLD,
  'Wheat Fields': [1850, 1880, 1.2],
  'Market Garden': [1850, 1880, 0.9, 1960, 0.6],
  // Energy
  'Battery Storage': [2008, 2023, 1.1],
  'Offshore Wind Farm': [1998, 2018, 1.2],
  'Rooftop Solar for Homes': [1978, 2015],
  'Green Hydrogen Pilot': [2016, 2035, 0.6],
  'Smart Meters': [2003, 2015, 0.7],
  'EV Charging Network': { tech: 'electricCars', first: 2010 },
  'Street Lighting': [1880, 1910, 0.8],
  'Hydro Dam': [1890, 1935, 1.3],
  'Town Electrification': [1885, 1925, 1.4, 1960, 0.3],
  'Coal-Fired Plant': [1882, 1920, 1.5, 2008, 0.35],
  // Live entertainment
  'Summer Music Festival': [1953, 1995],
  'Comedy Club Nights': [1968, 1985, 0.8],
  'Esports Tournament': { tech: 'esports', size: 0.8, first: 2000 },
  'Immersive Art Show': [2015, 2021, 0.6],
  'Drag Brunch': [2003, 2017, 0.5],
  'Podcast Live Tour': [2008, 2018, 0.5],
  'Dance Hall Nights': [1880, 1925, 1, 1950, 0.2],
  'Traveling Circus': [1850, 1880, 1, 1925, 0.15],
  'Brass Band Concerts': [1850, 1880, 0.8, 1915, 0.2],
  'Magic Show': [1850, 1900, 0.6],
  // Casinos
  'Tournament Weekends': [2001, 2006, 0.8, 2008, 0.5, 4],
  'Hotel Partnership': [1930, 1970],
  'Live Shows': [1930, 1960, 0.9],
  'Responsible Play Desk': [1993, 2010, 0.4],
  'Premium Dining': [1900, 1960, 0.8],
  'Card Room': OLD,
  'Roulette Tables': OLD,
  'Dinner Dances': [1900, 1930, 0.8, 1960, 0.5],
  'High-Roller Salon': [1880, 1930, 0.7],
  // Nightlife
  'Resident DJ': [1973, 1995],
  'Live Band Nights': [1900, 1950, 1, 1975, 0.6],
  'Members Lounge': [1900, 1960, 0.7],
  'Dance Showcase': [1900, 1950, 0.7],
  'Guest Artist Series': [1978, 2000, 0.8],
  'Jazz Band Nights': [1915, 1925, 1, 1950, 0.3],
  'Cocktail Lounge': [1920, 1940, 0.9],
  'Dance Contests': [1920, 1930, 0.7, 1960, 0.3],
  'Floor Show': [1900, 1930, 0.8, 1960, 0.3],
  // Adult entertainment
  'Stage Production': [1900, 1960],
  'Private Events': [1900, 1970, 0.8],
  'Cabaret Nights': [1880, 1920, 0.8, 1950, 0.5],
  'Performer Wellness Program': [2008, 2020, 0.4],
  // Solar power
  'Rooftop Arrays': [1978, 2015],
  'Utility Solar': [2003, 2018, 1.4],
  'Community Microgrids': [2010, 2025, 0.6],
  'Solar Irrigation': [2008, 2025, 0.5],
  // Batteries
  'Home Storage': [2013, 2024, 0.9],
  'Fleet Battery Packs': { tech: 'electricCars', size: 1.2, first: 2010 },
  'Grid Storage': [2008, 2024, 1.2],
  'Battery Recycling': [2013, 2030, 0.6],
  'Car Starter Batteries': [1912, 1935, 1.2],
  'Flashlight Cells': [1898, 1925, 0.8],
  'Radio Batteries': [1920, 1930, 0.7, 1950, 0.2],
  'Hearing Aid Cells': [1950, 1975, 0.4],
  // Water
  Desalination: [1960, 2005],
  'Industrial Water': [1880, 1950],
  'Smart Metering': [2003, 2018, 0.6],
  'Reuse Systems': [1988, 2015, 0.8],
  'Water Mains': [1850, 1900, 1.2],
  'Water Filtration': [1900, 1930],
  'Sewage Works': [1880, 1930, 1.1],
  'Well Drilling': [1850, 1880, 0.7, 1950, 0.4],
  // Recycling
  'Metal Recovery': [1880, 1950, 1.2],
  'Plastic Sorting': [1970, 1995],
  'E-Waste Processing': [1995, 2012, 0.8],
  Compost: [1970, 2010, 0.6],
  'Scrap Metal Yard': OLD,
  'Rag and Bone Rounds': [1850, 1870, 0.6, 1950, 0.1],
  'Paper Salvage': [1880, 1940, 0.7],
  'Glass Returns': [1880, 1920, 0.6, 1970, 0.4],
  // Telecommunications
  'Fiber Broadband': [1995, 2015, 1.3],
  'Business Networks': [1960, 1985],
  'Rural Coverage': [1900, 1950, 0.8],
  'Satellite Backup': [1990, 2015, 0.5],
  'Telephone Exchanges': [1880, 1920, 1.2],
  'Long-Distance Lines': [1890, 1935],
  'Telegraph Service': [1850, 1870, 1, 1930, 0.1],
  'Party Lines': [1890, 1920, 0.6, 1955, 0.1],
  // Data centers
  'Cloud Hosting': [2006, 2015, 1.4],
  'AI Compute': [2016, 2024, 1.2],
  'Sovereign Cloud': [2018, 2025, 0.6],
  'Disaster Recovery': [1990, 2005, 0.7],
  'Mainframe Time-Sharing': [1962, 1970, 1, 1985, 0.1],
  'Payroll Processing': [1960, 1975, 0.9],
  'Tape Backup Vaults': [1960, 1980, 0.6, 2005, 0.3],
  'Batch Processing': [1960, 1970, 0.8, 1990, 0.2],
  // Private education
  'Language Courses': [1880, 1950],
  'Coding Bootcamps': [2012, 2017, 0.7, 2019, 0.6, 4],
  'Exam Preparation': [1900, 1970],
  'Corporate Training': [1950, 1985],
  'Typing School': [1880, 1920, 1, 1990, 0.1],
  'Evening Classes': [1880, 1930],
  'Correspondence Courses': [1880, 1930, 0.8, 1990, 0.2],
  'Music Lessons': [1850, 1900, 0.8],
  // Pet care
  Grooming: [1900, 1990],
  Daycare: [1990, 2012, 0.8],
  Boarding: [1900, 1960],
  'Training Classes': [1920, 1990, 0.8],
  Kennels: [1850, 1900, 0.8],
  'Horse Stabling': [1850, 1860, 1, 1925, 0.1],
  'Pet Shop Counter': [1880, 1950, 0.8],
  'Bird Cages & Seed': [1850, 1900, 0.4, 1960, 0.3],
  // Home services
  'Deep Cleaning': [1900, 1980],
  'Maintenance Plans': [1960, 1990],
  'Move-Out Service': [1980, 2005, 0.6],
  'Garden Care': [1880, 1950],
  'Chimney Sweeping': [1850, 1860, 0.8, 1950, 0.2],
  'Window Washing': [1880, 1920, 0.8],
  'Laundry Rounds': [1850, 1880, 1, 1960, 0.2],
  'Handyman Visits': [1880, 1930],
  // Packaging
  'Recyclable Cartons': [1970, 2005],
  'Food Containers': [1900, 1960],
  'Protective Packaging': [1960, 2000],
  'Reusable Crates': [1900, 1950, 0.7],
  'Wooden Crates': [1850, 1860, 1, 1960, 0.3],
  'Paper Bags': [1870, 1910],
  'Tin Cans': [1850, 1900, 1.2],
  'Glass Bottles': [1850, 1890, 1, 1970, 0.6],
  // Furniture
  'Modular Furniture': [1950, 1985],
  'Office Desks': [1880, 1950],
  'Hotel Furnishings': [1880, 1950, 0.8],
  'Custom Joinery': [1850, 1880, 0.9, 1930, 0.5],
  'Dining Sets': OLD,
  'Bedroom Suites': [1850, 1900],
  'Rocking Chairs': [1850, 1870, 0.6, 1950, 0.3],
  'Upholstery Service': [1850, 1900, 0.8],
  // Travel
  'Local Tours': [1880, 1950],
  'Group Travel': [1950, 1975],
  'Adventure Holidays': [1970, 2000, 0.8],
  'Business Travel': [1950, 1985],
  'Rail Excursions': [1850, 1880, 1, 1955, 0.3],
  'Steamship Passages': [1850, 1880, 1, 1950, 0.1],
  'Seaside Holidays': [1870, 1920],
  'Pilgrimage Tours': [1850, 1900, 0.5],
  // Chips
  'Low-Power IoT Chip': [2012, 2020],
  'Smartphone SoC': { tech: 'smartphone', size: 1.6, first: 2007 },
  'Automotive Chip Line': [1975, 2005],
  'Memory Line': [1970, 1985, 1.4],
  'Chiplet Platform': [2017, 2025],
  'Developer Board': [1975, 2012, 0.4],
  // AI
  'Chat Assistant App': { tech: 'aiAssistants', size: 1.5, first: 2022 },
  'Coding Assistant': [2021, 2024],
  'Image Generator': [2022, 2024, 0.8],
  'Voice Mode': [2023, 2026, 0.7],
  'Enterprise Copilot': [2023, 2026, 1.2],
  'Developer Playground': [2020, 2024, 0.5],
  // Robotics
  'Warehouse Picker': [2012, 2022],
  'Robot-as-a-Service Plan': [2015, 2025],
  'Surgical Assist Arm': [1990, 2012],
  'Sidewalk Delivery Bot': [2017, 2030, 0.6],
  'Farm Harvester Bot': [2015, 2030, 0.8],
  'Home Helper': [2020, 2035, 1.2],
  // Biotech
  'Patient Support Program': [1990, 2005, 0.6],
  'Physician Education Tour': [1960, 1990, 0.7, 2005, 0.6],
  'Pediatric Formulation': [1960, 1990, 0.8],
  'Once-Weekly Version': [1990, 2010],
  'Combination Therapy': [1960, 2000, 1.2],
  'Home Infusion Service': [1985, 2010, 0.7],
  // Space
  'Rideshare Missions': [2015, 2022],
  'Dedicated Launch Package': [1980, 2015, 1.2],
  'Satellite Insurance Bundle': [1985, 2000, 0.5],
  'Launch Livestream Sponsorship': [2010, 2018, 0.3],
  'Payload Integration Service': [1980, 2015, 0.8],
  'Polar Orbit Service': [1970, 2015, 0.7],
  // Electric vehicles
  'Performance Edition': [2008, 2018],
  'Electric Pickup': [2019, 2030, 1.2],
  'Long-Range Battery Pack': [2012, 2020],
  'Premium Connectivity': [2010, 2020, 0.5],
  'Fleet Leasing': { tech: 'electricCars', first: 2010 },
  'Home Charger Bundle': [2012, 2022, 0.5],
  // Quantum
  'Quantum Chemistry Toolkit': [2015, 2032],
  'Optimization Service': [2016, 2035],
  'University Access Program': [2016, 2026, 0.6],
  'Quantum Training Course': [2015, 2030, 0.4],
  'Hybrid Cloud Plan': [2015, 2030],
  // Cybersecurity
  'Threat Intelligence Feed': [2005, 2015],
  'Phishing Simulator': [2005, 2016, 0.5],
  'Managed Detection Plan': [2015, 2022, 1.2],
  'Compliance Toolkit': [2000, 2012, 0.8],
  'Small Business Edition': [1995, 2015, 0.8],
  // Fusion
  'Neutron Source Rental': [1995, 2020, 0.5],
  'Superconducting Magnet Line': [1995, 2028, 0.8],
  'Plasma Diagnostics Kit': [1995, 2020, 0.4],
  'Fusion Power Contract': [2030, 2045, 1.6],
  'Industrial Heat Supply': [2032, 2048, 1.1],
  'Isotope Production Service': [1995, 2025, 0.6],
  // Neurotech
  'Neural Signal Toolkit': [1995, 2015, 0.5],
  'Seizure Warning Implant': [2013, 2028, 0.8],
  'Speech Restoration App': [2023, 2032, 0.9],
  'Neurofeedback Headset': [1995, 2020, 0.7],
  'Clinic Training Program': [1995, 2020, 0.4],
  'Implant Care Plan': [1995, 2025, 0.6],
  // Drones and air taxis
  'Aerial Survey Kit': [2000, 2016],
  'Unmanned Crop Sprayer': [2000, 2020, 0.9],
  'Drone Light Shows': [2016, 2022, 0.4],
  'Aerial Inspection Service': [2000, 2020, 0.8],
  'Medical Supply Drops': [2016, 2026, 0.7],
  'Drone Pilot School': [2012, 2018, 0.4],
  // Carbon removal
  'Removal Credit Subscription': [2019, 2028, 1.2],
  'Carbon Accounting Service': [2003, 2020, 0.6],
  'Low-Carbon Concrete Additive': [2015, 2028, 0.8],
  'CO2 for Greenhouses': [2000, 2016, 0.5],
  'Rock Weathering Plots': [2020, 2030, 0.6],
  'Biochar Line': [2005, 2022, 0.6],
  // More classic ideas for every trade
  'Smash Burgers': [2015, 2021],
  'Gourmet Grilled Cheese': [2008, 2014, 0.7],
  'Bubble Tea Window': [2010, 2020, 0.7],
  'Kids’ Menu': [1930, 1965, 0.8],
  'Prix-Fixe Lunch': [1900, 1950],
  'Natural Wine List': [2010, 2019, 0.6],
  'Avocado Toast': [2012, 2016, 0.8, 2020, 0.7],
  'Flat White': [1985, 2014],
  'Cake Counter': [1880, 1920, 0.8],
  'Croissant Line': [1900, 1980],
  'Custom Birthday Cakes': [1900, 1960],
  'Bagel Bakery': [1900, 1990, 0.8],
  'Craft Beer Taps': [1985, 2012],
  'Sports Screenings': [1960, 1995],
  'Mocktail Menu': [2015, 2023, 0.7],
  'Lager Six-Pack Line': [1940, 1960, 1.2],
  'Fruit Beer Range': [1990, 2012, 0.6],
  'Session IPA': [2012, 2016, 0.7],
  'Ready Meals Aisle': [1953, 1985],
  'In-Store Bakery': [1950, 1980, 0.9],
  'Click-and-Collect': [2008, 2020, 0.9],
  'Denim Line': [1900, 1960],
  'Swimwear Range': [1920, 1960, 0.8],
  'Plus-Size Range': [1975, 2015, 0.8],
  'Nail Polish Range': [1925, 1960, 0.8],
  'Sheet Mask Line': [2010, 2017, 0.6, 2020, 0.6],
  'Tinted Moisturizer': [1990, 2012, 0.8],
  'Blow-Dry Bar': [2008, 2015, 0.8],
  'Highlights & Color': [1950, 1985],
  'Kids’ Cuts': [1920, 1960, 0.7],
  'Yoga Classes': [1965, 2005],
  'Pilates Reformer Studio': [1990, 2020, 0.8],
  'HIIT Classes': [2010, 2016, 0.8],
  'Hybrid Servicing': [2000, 2012, 0.8],
  'Windshield Repair': [1972, 1990, 0.7],
  'Car Wash Tunnel': [1946, 1970],
  'Kitchen & Bath Remodels': [1950, 1980],
  'Solar Roof Installs': [2005, 2020, 0.8],
  'Warehouse Builds': [1920, 1970],
  'New-Build Sales': [1920, 1960],
  'Holiday Lets': [1960, 2012, 0.8],
  'Land Development': [1900, 1950],
  'Customer Support Desk': [1995, 2010],
  'Single Sign-On': [2005, 2015, 0.8],
  'Data Migration Service': [1990, 2005, 0.7],
  'Multiplayer Expansion': [1998, 2010],
  'Kart Racer': [1992, 2008, 0.8],
  'Educational Game': [1980, 2000, 0.6],
  'Gift Cards': [1995, 2010, 0.8],
  'Returns Portal': [2005, 2015, 0.6],
  'Refurbished Electronics': [2005, 2020, 0.7],
  'Email Campaigns': [1997, 2008],
  'Brand Strategy Workshops': [1950, 1985, 0.8],
  'Out-of-Home Displays': [1920, 1965],
  'Sports Medicine': [1970, 2000, 0.8],
  'Allergy Clinic': [1950, 1990, 0.7],
  'Sleep Lab': [1975, 2005, 0.6],
  'Long-Stay Suites': [1975, 2000, 0.8],
  'Pet-Friendly Rooms': [1995, 2015, 0.6],
  'Afternoon Tea Lounge': [1880, 1920, 0.6],
  'Freight Forwarding': [1900, 1960],
  'Hazardous Goods Haulage': [1950, 1980, 0.7],
  'Returns Handling': [2005, 2018, 0.7],
  'Power Tool Line': [1925, 1965],
  'LED Lighting Line': [2008, 2015],
  'Garden Equipment': [1950, 1975, 0.8],
  'Pick-Your-Own Fields': [1960, 1985, 0.6],
  'Honey & Beeswax': [1850, 1880, 0.5],
  'Microgreens': [2008, 2018, 0.5],
  'Peaker Plant': [1965, 1990, 0.8],
  'Heat Network': [1950, 2000, 0.7],
  'Biogas Digesters': [1980, 2012, 0.6],
  'Escape Rooms': [2012, 2017, 0.7, 2022, 0.7],
  'Theater Productions': [1850, 1890],
  'Magic & Variety Nights': [1880, 1920, 0.7, 1960, 0.5],
  'Power Semiconductors': [1960, 1990],
  'Image Sensor Line': [1995, 2012],
  'Networking Chip Line': [1985, 2005],
  'Translation API': [2016, 2021, 0.8],
  'Video Generator': [2024, 2028, 0.9],
  'Agent Builder': [2025, 2029, 1.1],
  'Cleaning Robot': [2002, 2018, 0.9],
  'Inspection Crawler': [2010, 2022, 0.6],
  'Kitchen Robot': [2018, 2032, 0.8],
  'Companion Diagnostic': [1998, 2015, 0.7],
  'Prefilled Pen Version': [1985, 2010, 0.8],
  'Rare Disease Registry': [1995, 2012, 0.4],
  'Earth Imaging Service': [1972, 2015],
  'Ground Station Network': [1960, 2015, 0.6],
  'Satellite Servicing': [2020, 2030, 0.7],
  'Compact Hatchback': [2010, 2022, 1.2],
  'Over-the-Air Upgrades': [2012, 2022, 0.5],
  'Battery Warranty Plan': [2010, 2020, 0.4],
  'Quantum-Safe Audit': [2016, 2028, 0.6],
  'Quantum Finance Toolkit': [2017, 2032, 0.8],
  'On-Premises Quantum System': [2020, 2035, 1.2],
  'Incident Response Retainer': [2000, 2015],
  'Penetration Testing': [1995, 2010, 0.8],
  'Security Awareness Training': [2003, 2016, 0.6],
  'Fusion Materials Testing': [2005, 2030, 0.6],
  'Sleep Tracking Headband': [2015, 2030, 0.6],
  'Drone Insurance Plan': [2015, 2025, 0.4],
  'Carbon Footprint Audit': [2004, 2022, 0.5],
  'Poker Room': [1950, 1980, 0.8],
  'Slot Club Rewards': [1985, 2000, 0.8],
  'Headline Boxing Nights': [1960, 1985, 0.7],
  'Theme Nights': [1975, 1995],
  'Bottle Service': [1995, 2010, 0.8],
  'Afterparty Sessions': [1990, 2010, 0.6],
  'Bachelor Party Packages': [1970, 1995, 0.8],
  'Champagne Room': [1980, 2000, 0.8],
  'Comedy Burlesque Nights': [1990, 2012, 0.6],
  'Solar Carports': [2008, 2020, 0.6],
  'Solar Plus Storage': [2015, 2025, 1.1],
  'Solar Maintenance Contracts': [1990, 2015, 0.5],
  'Power Tool Packs': [1995, 2012, 0.7],
  'E-Bike Batteries': [2005, 2018, 0.7],
  'Backup Power Units': [1985, 2012, 0.8],
  'Bottled Water Plant': [1900, 1990, 0.8],
  'Rainwater Harvesting': [1990, 2015, 0.5],
  'Leak Detection Service': [1980, 2012, 0.6],
  'Textile Recycling': [1900, 2015, 0.6],
  'Construction Waste Recovery': [1980, 2010, 0.8],
  'Glass Recycling': [1970, 1995, 0.8],
  'Mobile Plans': [1985, 2005, 1.3],
  'Home Phone Lines': [1880, 1950, 1, 2000, 0.3],
  'Enterprise Wi-Fi': [2003, 2015, 0.7],
  'Edge Computing Sites': [2016, 2028, 0.8],
  'Managed Backup': [1995, 2010, 0.7],
  'Private Cloud Racks': [2008, 2018, 0.9],
  'Tutoring Service': [1850, 1950],
  'Online Degrees': [1998, 2018, 0.9],
  'Driving Lessons': [1910, 1960, 0.7],
  'Vet Clinic Partnership': [1950, 1985, 0.9],
  'Dog Walking Rounds': [1960, 2005, 0.7],
  'Pet Photography': [1950, 2010, 0.4],
  'Pest Control': [1900, 1950, 0.8],
  'Pool Servicing': [1955, 1985, 0.6],
  'Elder Home Help': [1950, 2000],
  'Gift Boxes': [1900, 1950, 0.6],
  'Mailer Bags': [1995, 2015, 0.8],
  'Pallet Wrap': [1975, 1995, 0.7],
  'Outdoor Furniture': [1920, 1970, 0.7],
  'Kids’ Furniture': [1900, 1960, 0.6],
  'Sofa Beds': [1920, 1970, 0.7],
  'Ski Holidays': [1930, 1975, 0.7],
  'Cruise Bookings': [1920, 1995],
  'Study Abroad Trips': [1950, 1995, 0.6],
}

/**
 * Period classics for trades whose modern ideas didn't exist yet (a 1930 phone company runs
 * telephone exchanges, not fiber broadband). Offered like products.ts TIMELESS lists.
 */
export const PERIOD_CLASSICS: Record<string, string[]> = {
  battery: ['Car Starter Batteries', 'Flashlight Cells', 'Radio Batteries', 'Hearing Aid Cells'],
  water: ['Water Mains', 'Water Filtration', 'Sewage Works', 'Well Drilling'],
  recycling: ['Scrap Metal Yard', 'Rag and Bone Rounds', 'Paper Salvage', 'Glass Returns'],
  telecom: ['Telephone Exchanges', 'Long-Distance Lines', 'Telegraph Service', 'Party Lines'],
  dataCenter: ['Mainframe Time-Sharing', 'Payroll Processing', 'Tape Backup Vaults', 'Batch Processing'],
  education: ['Typing School', 'Evening Classes', 'Correspondence Courses', 'Music Lessons'],
  petCare: ['Kennels', 'Horse Stabling', 'Pet Shop Counter', 'Bird Cages & Seed'],
  homeCare: ['Chimney Sweeping', 'Window Washing', 'Laundry Rounds', 'Handyman Visits'],
  packaging: ['Wooden Crates', 'Paper Bags', 'Tin Cans', 'Glass Bottles'],
  furniture: ['Dining Sets', 'Bedroom Suites', 'Rocking Chairs', 'Upholstery Service'],
  travel: ['Rail Excursions', 'Steamship Passages', 'Seaside Holidays', 'Pilgrimage Tours'],
  casino: ['Card Room', 'Roulette Tables', 'Dinner Dances', 'High-Roller Salon'],
  nightclub: ['Jazz Band Nights', 'Cocktail Lounge', 'Dance Contests', 'Floor Show'],
}

/** A kind of product nobody listed: an ordinary, mature line. */
const DEFAULT: Span = [1850, 1900]

export function demandCurve(family: string): DemandCurve {
  return DEMAND[family] ?? DEFAULT
}

/** True when a kind of product has its own real-history curve (not the plain default). */
export function hasDemandCurve(family: string): boolean {
  return family in DEMAND
}

function isTech(c: DemandCurve): c is TechCurve {
  return !Array.isArray(c)
}

/** 'world' markets adopt like a fairly rich country; others by their own wealth (0 rich … 1 poorest). */
function laggard(place: string): number {
  if (place === 'world') return 0.3
  const w = getCountry(place).wealth ?? 1
  return Math.max(0, Math.min(1, 1 - Math.max(0.05, Math.min(1, w))))
}

/** Size of a kind of product's market against a typical line of its trade. */
export function demandSize(family: string): number {
  const c = demandCurve(family)
  const s = isTech(c) ? c.size : c[2]
  return typeof s === 'number' && s > 0 ? s : 1
}

export interface DemandLevel {
  /** False before anyone in this market could sell it. */
  exists: boolean
  /** 0-1: how far it has caught on (the S-curve, before any decline). */
  adoption: number
  /** Demand now vs its eventual peak (adoption times what is left after a decline). */
  level: number
}

/**
 * How much demand there is for a kind of product in a market (a country id or 'world') in a
 * year, from its real history: an S-curve from its first year to its mainstream year (later in
 * poorer countries), then a decline for products that faded.
 */
export function demandLevel(family: string, place: string, year: number): DemandLevel {
  const c = demandCurve(family)
  if (isTech(c)) {
    const tech = TECH[c.tech]
    const country = place === 'world' ? 'us' : place
    const first = c.first ?? tech.invented
    if (year < first) return { exists: false, adoption: 0, level: 0 }
    // A 'world' market follows the richest adopters with a few years' lag.
    const a = techAdoption(country, c.tech, place === 'world' ? year - 3 : year) / Math.max(0.05, tech.cap)
    const adoption = Math.max(0.01, Math.min(1, a))
    return { exists: true, adoption, level: adoption }
  }
  const [first, main, , peak, left, falls] = c
  const lag = laggard(place) * LAG
  const start = first + lag * 0.5
  if (year < start) return { exists: false, adoption: 0, level: 0 }
  const mid = main + lag
  const width = Math.max(1.5, (main - first) / 3.5)
  const adoption = 1 / (1 + Math.exp(-(year - mid) / width))
  let fall = 1
  if (typeof peak === 'number' && year > peak + lag) {
    const rest = typeof left === 'number' ? Math.max(0, Math.min(1, left)) : 1
    fall = rest + (1 - rest) * Math.exp(-(year - peak - lag) / (typeof falls === 'number' && falls > 0 ? falls : FALL_YEARS))
  }
  return { exists: true, adoption: Math.max(0.005, adoption), level: Math.max(0.005, adoption * fall) }
}

/** Growing (1), steady (0) or shrinking (-1) over the next few years. */
export function demandTrend(family: string, place: string, year: number): -1 | 0 | 1 {
  const now = demandLevel(family, place, year).level
  const next = demandLevel(family, place, year + 4).level
  if (next > now * 1.12) return 1
  if (next < now * 0.9) return -1
  return 0
}
