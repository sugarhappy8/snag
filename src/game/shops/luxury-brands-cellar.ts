// The cellar: fine wine, champagne and spirits from real houses. Adults only, and only where and
// when alcohol can legally be sold (shops/luxury-brands-shop.ts checks the age, the country and
// Prohibition). `usd` is the price of one bottle today in constant 2026 dollars; `peak` is how many
// years a bottle improves before it plateaus. Approximate.
import { lineMaker, type LuxLine } from './luxury-brands-types'

const w = lineMaker('wine')
const s = lineMaker('spirit')

const BOTTLE_CASE: [string, number][] = [
  ['Bottle', 1],
  ['Case of six', 5.4],
]
const CHAMPAGNE: [string, number][] = [
  ['Bottle', 1],
  ['Magnum', 2.3],
  ['Case of six', 5.4],
]

export const WINE_LINES: LuxLine[] = [
  w('chateau-lafite-rothschild', 'grand-vin', 'Grand Vin', 1900, 900, { peak: 30, variants: BOTTLE_CASE, blurb: 'A Pauillac first growth.' }),
  w('chateau-margaux', 'grand-vin', 'Grand Vin', 1900, 800, { peak: 30, variants: BOTTLE_CASE }),
  w('chateau-latour', 'grand-vin', 'Grand Vin', 1900, 900, { peak: 30, variants: BOTTLE_CASE }),
  w('chateau-mouton-rothschild', 'grand-vin', 'Grand Vin', 1900, 750, { peak: 28, variants: BOTTLE_CASE, blurb: 'Every year’s label is a commissioned work of art.' }),
  w('chateau-haut-brion', 'grand-vin', 'Grand Vin', 1900, 700, { peak: 28, variants: BOTTLE_CASE }),
  w('chateau-d-yquem', 'sauternes', 'Sauternes', 1900, 400, { peak: 40, blurb: 'Golden, sweet and nearly immortal.' }),
  w('romanee-conti', 'la-tache', 'La Tâche', 1900, 7500, { peak: 30 }),
  w('romanee-conti', 'romanee-conti', 'Romanée-Conti', 1900, 25000, { peak: 35, blurb: 'The most sought-after red in Burgundy.' }),
  w('penfolds', 'grange', 'Grange', 1951, 900, { peak: 30, variants: BOTTLE_CASE }),
  w('sassicaia', 'sassicaia', 'Sassicaia', 1971, 280, { peak: 20, variants: BOTTLE_CASE }),
  w('opus-one', 'opus-one', 'Opus One', 1979, 450, { peak: 20, variants: BOTTLE_CASE }),
  w('ornellaia', 'ornellaia', 'Ornellaia', 1985, 250, { peak: 18, variants: BOTTLE_CASE }),
  w('vega-sicilia', 'unico', 'Único', 1940, 450, { peak: 30 }),
  w('screaming-eagle', 'cabernet', 'Cabernet Sauvignon', 1995, 3500, { peak: 25, blurb: 'A mailing list that takes years to get on.' }),
  w('dom-perignon', 'vintage', 'Vintage', 1936, 280, { peak: 12, variants: CHAMPAGNE }),
  w('moet-chandon', 'imperial', 'Impérial', 1900, 60, { peak: 3, variants: CHAMPAGNE, tier: 'boutique' }),
  w('veuve-clicquot', 'yellow-label', 'Yellow Label', 1900, 70, { peak: 3, variants: CHAMPAGNE, tier: 'boutique' }),
  w('krug', 'grande-cuvee', 'Grande Cuvée', 1979, 220, { peak: 12, variants: CHAMPAGNE }),
  w('louis-roederer', 'cristal', 'Cristal', 1945, 650, { peak: 15, variants: CHAMPAGNE }),
  w('bollinger', 'rd', 'R.D.', 1952, 350, { peak: 15 }),
  w('taittinger', 'comtes', 'Comtes de Champagne', 1952, 220, { peak: 15 }),
  w('salon', 'blanc-de-blancs', 'Blanc de Blancs', 1921, 1000, { peak: 20 }),
  w('armand-de-brignac', 'brut-gold', 'Brut Gold', 2006, 350, { peak: 6, variants: CHAMPAGNE }),
]

export const SPIRIT_LINES: LuxLine[] = [
  s('hennessy', 'xo', 'X.O', 1870, 300),
  s('remy-martin', 'louis-xiii', 'Louis XIII', 1874, 3500, { blurb: 'Blended from eaux-de-vie up to a century old.' }),
  s('hennessy', 'paradis', 'Paradis', 1979, 1200),
  s('macallan', '18', '18 Years Old', 1980, 450),
  s('macallan', '25', '25 Years Old', 1980, 3500),
  s('glenfiddich', '18', '18 Years Old', 1990, 150, { tier: 'boutique' }),
  s('johnnie-walker', 'blue-label', 'Blue Label', 1992, 220),
  s('yamazaki', '12', '12 Years Old', 1984, 180, { blurb: 'Often called the first Japanese single malt.' }),
  s('grey-goose', 'vodka', 'Vodka', 1997, 35, { tier: 'boutique' }),
  s('clase-azul', 'reposado', 'Reposado', 1997, 190),
  s('don-julio', '1942', '1942', 2003, 180),
]

export const CELLAR_LINES: LuxLine[] = [...WINE_LINES, ...SPIRIT_LINES]
