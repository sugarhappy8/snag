// Product lines on water and in the air: runabouts and motor yachts from real boatyards, the
// real yacht builders (shops/luxury-fleet.ts uses their names for the custom megayachts), light
// aircraft, business jets, VIP airliners and helicopters. Lines with a `fleet` class feed the
// Luxury Aircraft Brokerage's models for that class in the year. Prices are approximate, in
// constant 2026 dollars for a new one.
import { lineMaker, type LuxLine } from './luxury-brands-types'

const b = lineMaker('boat')
const a = lineMaker('air')

export const BOAT_LINES: LuxLine[] = [
  b('herreshoff', '12-5', 'Twelve-and-a-Half', 1914, 90_000, { until: 1945, blurb: 'A small, beautiful sailboat that taught a generation to race.' }),
  b('herreshoff', 'new-york-40', 'New York 40', 1916, 400_000, { until: 1920 }),
  b('chris-craft', 'barrel-back', 'Barrel Back Runabout', 1935, 150_000, { until: 1941, blurb: 'Varnished mahogany and a roar.' }),
  b('camper-nicholsons', 'j-class', 'J-Class Sloop', 1930, 6_000_000, { until: 1937, blurb: 'The giant sloops of the America’s Cup.' }),
  b('riva', 'aquarama', 'Aquarama', 1962, 900_000, { until: 1996, blurb: 'The Ferrari of the water: a mahogany speedboat.' }),
  b('boston-whaler', 'montauk', 'Montauk', 1987, 60_000),
  b('sea-ray', 'sundancer', 'Sundancer', 1980, 350_000),
  b('sunseeker', 'predator', 'Predator', 1987, 3_200_000),
  b('hinckley', 'picnic-boat', 'Picnic Boat', 1994, 700_000),
  b('azimut', 'flybridge-55', '55 Flybridge', 2000, 1_600_000),
  b('sunseeker', 'manhattan', 'Manhattan', 2002, 4_500_000),
  b('riva', 'rivale', 'Rivale', 2003, 900_000),
  b('riva', '88-folgore', '88’ Folgore', 2013, 3_500_000),
  b('riva', '110-dolcevita', '110’ Dolcevita', 2018, 7_000_000),
]

export const AIR_LINES: LuxLine[] = [
  // Tourers, before the war
  a('curtiss', 'jn-4', 'JN-4 Jenny', 1917, 120_000, { until: 1927, fleet: 'tourer', seats: 2, blurb: 'Surplus from the war, flown by daredevils across the country.' }),
  a('lockheed', 'vega', 'Vega', 1927, 400_000, { until: 1934, fleet: 'tourer', seats: 6 }),
  a('de-havilland', 'dh60-moth', 'DH.60 Moth', 1925, 140_000, { until: 1934, fleet: 'tourer', seats: 2, blurb: 'The little biplane that put private flying within reach.' }),
  a('beechcraft', 'staggerwing', 'Staggerwing', 1932, 700_000, { until: 1948, fleet: 'tourer', seats: 5 }),
  a('cessna', 'airmaster', 'Airmaster', 1934, 400_000, { until: 1940, fleet: 'tourer', seats: 4 }),
  a('piper', 'j3-cub', 'J-3 Cub', 1938, 120_000, { until: 1947, seats: 2 }),
  a('sikorsky', 's-38', 'S-38', 1928, 500_000, { until: 1933, fleet: 'flyingBoat', seats: 8, blurb: 'An amphibian with a hull like a boat.' }),
  a('sikorsky', 's-43', 'S-43', 1935, 800_000, { until: 1939, fleet: 'flyingBoat', seats: 12 }),
  // Piston and turboprop
  a('lockheed', 'constellation', 'Constellation', 1946, 15_000_000, { until: 1958, fleet: 'propliner', seats: 30, blurb: 'Four propellers and a triple tail.' }),
  a('gulfstream', 'gulfstream-i', 'Gulfstream I', 1958, 8_000_000, { until: 1969, fleet: 'propliner', seats: 12 }),
  a('beechcraft', 'bonanza', 'Bonanza', 1947, 1_000_000, { seats: 4 }),
  a('cessna', 'skyhawk', '172 Skyhawk', 1956, 450_000, { seats: 4 }),
  a('beechcraft', 'king-air', 'King Air', 1964, 6_000_000, { seats: 8 }),
  a('cirrus', 'sr22', 'SR22', 2001, 1_000_000, { seats: 4, blurb: 'It has a parachute for the whole airplane.' }),
  a('pilatus', 'pc-12', 'PC-12', 1994, 5_000_000, { seats: 9, fleet: 'light' }),
  a('cessna', 'caravan-amphibian', 'Caravan Amphibian', 1985, 3_000_000, { fleet: 'amphib', seats: 9 }),
  // Business jets
  a('lockheed', 'jetstar', 'JetStar', 1961, 14_000_000, { until: 1978, fleet: 'light', seats: 10, blurb: 'An early business jet, with four engines at the back.' }),
  a('learjet', 'learjet-23', 'Learjet 23', 1964, 4_000_000, { until: 1966, fleet: 'light', seats: 6 }),
  a('cessna', 'citation-i', 'Citation I', 1971, 5_000_000, { until: 1985, fleet: 'light', seats: 6 }),
  a('learjet', 'learjet-35', 'Learjet 35', 1973, 10_000_000, { until: 1994, fleet: 'light', seats: 8 }),
  a('cessna', 'citationjet', 'CitationJet', 1993, 9_000_000, { fleet: 'light', seats: 6 }),
  a('embraer', 'phenom-100', 'Phenom 100', 2008, 5_000_000, { fleet: 'light', seats: 6 }),
  a('honda-aircraft', 'hondajet', 'HondaJet', 2015, 7_000_000, { fleet: 'light', seats: 6, blurb: 'Engines mounted over the wings.' }),
  a('dassault-falcon', 'falcon-20', 'Falcon 20', 1963, 12_000_000, { until: 1988, fleet: 'midsize', seats: 9 }),
  a('bombardier', 'challenger-600', 'Challenger 600', 1978, 28_000_000, { fleet: 'midsize', seats: 11 }),
  a('dassault-falcon', 'falcon-50', 'Falcon 50', 1979, 20_000_000, { until: 2008, fleet: 'midsize', seats: 9 }),
  a('learjet', 'learjet-60', 'Learjet 60', 1993, 14_000_000, { until: 2007, fleet: 'midsize', seats: 8 }),
  a('dassault-falcon', 'falcon-2000', 'Falcon 2000', 1994, 30_000_000, { fleet: 'midsize', seats: 10 }),
  a('cessna', 'citation-x', 'Citation X', 1996, 28_000_000, { until: 2018, fleet: 'midsize', seats: 9 }),
  a('gulfstream', 'g280', 'G280', 2012, 25_000_000, { fleet: 'midsize', seats: 10 }),
  a('bombardier', 'challenger-350', 'Challenger 350', 2014, 28_000_000, { fleet: 'midsize', seats: 10 }),
  a('cessna', 'latitude', 'Citation Latitude', 2015, 18_000_000, { fleet: 'midsize', seats: 9 }),
  a('pilatus', 'pc-24', 'PC-24', 2018, 11_000_000, { fleet: 'midsize', seats: 8, blurb: 'A jet that can land on grass.' }),
  a('embraer', 'praetor-600', 'Praetor 600', 2019, 21_000_000, { fleet: 'midsize', seats: 12 }),
  a('gulfstream', 'g-ii', 'Gulfstream II', 1967, 25_000_000, { until: 1979, fleet: 'largeCabin', seats: 14 }),
  a('gulfstream', 'g-iii', 'Gulfstream III', 1979, 40_000_000, { until: 1986, fleet: 'largeCabin', seats: 14 }),
  a('dassault-falcon', 'falcon-900', 'Falcon 900', 1986, 38_000_000, { fleet: 'largeCabin', seats: 14 }),
  a('gulfstream', 'g-iv', 'Gulfstream IV', 1985, 45_000_000, { until: 2003, fleet: 'largeCabin', seats: 14 }),
  a('embraer', 'legacy-600', 'Legacy 600', 2002, 28_000_000, { until: 2015, fleet: 'largeCabin', seats: 13 }),
  a('gulfstream', 'g450', 'G450', 2005, 40_000_000, { fleet: 'largeCabin', seats: 16 }),
  a('dassault-falcon', 'falcon-7x', 'Falcon 7X', 2007, 55_000_000, { until: 2021, fleet: 'largeCabin', seats: 14 }),
  a('dassault-falcon', 'falcon-8x', 'Falcon 8X', 2016, 60_000_000, { fleet: 'largeCabin', seats: 14 }),
  a('gulfstream', 'g-v', 'Gulfstream V', 1995, 55_000_000, { until: 2003, fleet: 'ultraLong', seats: 16 }),
  a('bombardier', 'global-express', 'Global Express', 1998, 60_000_000, { until: 2012, fleet: 'ultraLong', seats: 15 }),
  a('gulfstream', 'g550', 'G550', 2003, 70_000_000, { fleet: 'ultraLong', seats: 16 }),
  a('gulfstream', 'g650', 'G650', 2012, 75_000_000, { until: 2023, fleet: 'ultraLong', seats: 18 }),
  a('bombardier', 'global-7500', 'Global 7500', 2018, 78_000_000, { fleet: 'ultraLong', seats: 19 }),
  a('gulfstream', 'g700', 'G700', 2022, 82_000_000, { fleet: 'ultraLong', seats: 19 }),
  // VIP airliners
  a('boeing', '707-vip', '707 VIP', 1958, 90_000_000, { until: 1979, fleet: 'airliner', seats: 30 }),
  a('boeing', '727-vip', '727 VIP', 1963, 60_000_000, { until: 1984, fleet: 'airliner', seats: 28 }),
  a('boeing', 'bbj', 'Boeing Business Jet', 1996, 100_000_000, { fleet: 'airliner', seats: 40 }),
  a('airbus', 'acj319', 'Airbus ACJ319', 1997, 95_000_000, { fleet: 'airliner', seats: 38 }),
  a('airbus', 'acj320', 'Airbus ACJ320', 1997, 110_000_000, { fleet: 'airliner', seats: 40 }),
  a('embraer', 'lineage-1000', 'Lineage 1000', 2008, 70_000_000, { fleet: 'airliner', seats: 30 }),
  a('boeing', '747-vip', '747 VIP', 1970, 300_000_000, { until: 2023, fleet: 'widebody', seats: 70 }),
  a('airbus', 'a330-acj', 'Airbus ACJ330', 2008, 280_000_000, { fleet: 'widebody', seats: 60 }),
  a('boeing', '787-bbj', 'Boeing 787 BBJ', 2008, 280_000_000, { fleet: 'widebody', seats: 60 }),
  // Helicopters
  a('bell', 'bell-47', 'Bell 47', 1946, 1_000_000, { until: 1973, seats: 3, emoji: '🚁' }),
  a('bell', '206-jetranger', '206 JetRanger', 1967, 2_400_000, { until: 2017, seats: 5, emoji: '🚁' }),
  a('sikorsky', 's-76', 'S-76', 1979, 14_000_000, { seats: 12, emoji: '🚁' }),
  a('airbus-helicopters', 'h125', 'H125 (AS 350)', 1992, 3_500_000, { seats: 6, emoji: '🚁', blurb: 'A light single-engine helicopter built for mountains, rescue and sightseeing.' }),
  a('robinson-helicopter', 'r22', 'R22', 1979, 400_000, { seats: 2, emoji: '🚁' }),
  a('robinson-helicopter', 'r44', 'R44', 1992, 600_000, { seats: 4, emoji: '🚁' }),
  a('bell', '407', '407', 1996, 3_400_000, { seats: 7, emoji: '🚁' }),
  a('sikorsky', 's-92', 'S-92', 2004, 28_000_000, { seats: 19, emoji: '🚁' }),
  a('bell', '429', '429', 2009, 8_000_000, { seats: 7, emoji: '🚁' }),
  a('robinson-helicopter', 'r66', 'R66', 2010, 1_100_000, { seats: 5, emoji: '🚁' }),
  a('airbus-helicopters', 'h160', 'H160', 2020, 18_000_000, { seats: 12, emoji: '🚁' }),
]

/** Airframes that belong to one of the Luxury Aircraft Brokerage's classes and were on sale in `year`. */
export function fleetModels(fleetClass: string, year: number): LuxLine[] {
  return AIR_LINES.filter((l) => l.fleet === fleetClass && year >= l.from && year <= (l.until ?? Infinity))
}

export const CRAFT_LINES: LuxLine[] = [...BOAT_LINES, ...AIR_LINES]
