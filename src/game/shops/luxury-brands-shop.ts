// The brand shops of the Luxury Lifestyle: designer boutiques (watches, jewelry, bags, fashion,
// pens and fine goods, sneakers), wheels and wings (supercars and luxury cars, motorcycles,
// boats, aircraft) and the cellar (wine, champagne and spirits). Category > brand > line >
// how to buy it (new, certified pre-owned, or the gray market). Every row is a pure function of
// the state: nothing here consumes g.rng.
import { formatMoney, shortMoney } from '../core'
import { brandById, brandName } from '../data/brands'
import { hasTech } from '../history/timeline'
import { hasTalent, talentHint } from '../talents'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import {
  ALL_LINES,
  brandsWith,
  lineOnSale,
  linesOfBrand,
  lineTitle,
  TIER_LABEL,
  tierOpen,
  unlockedTier,
} from './luxury-brands-catalog'
import { allocationOdds, buyBlock, buyOffer, isScarceNow, type Offer, offersFor } from './luxury-brands-deal'
import type { LuxCat, LuxLine } from './luxury-brands-types'
import { collectRef, def, holdOutlook, scarcePremium } from './luxury-brands-value'
import { taxLine } from './luxury-common'

export interface ShopCategory {
  id: string
  label: string
  emoji: string
  blurb: string | ((g: GameState) => string)
  cats: LuxCat[]
  /** Which of the three shop menus it sits in. */
  group: 'boutiques' | 'wheels' | 'cellar'
}

export const SHOP_CATEGORIES: ShopCategory[] = [
  { id: 'watches', label: 'Watches', emoji: '⌚', blurb: 'From everyday Swiss and Japanese watches to the icons that appreciate.', cats: ['watch'], group: 'boutiques' },
  { id: 'jewelry', label: 'Jewelry', emoji: '💍', blurb: 'The famous jewelers, from a charm bracelet to a necklace with its own security guard.', cats: ['jewelry'], group: 'boutiques' },
  { id: 'bags', label: 'Bags & Leather Goods', emoji: '👜', blurb: 'Handbags, trunks and luggage. Some have waiting lists.', cats: ['handbag', 'luggage'], group: 'boutiques' },
  { id: 'fashion', label: 'Fashion & Eyewear', emoji: '🧥', blurb: 'The houses, the tailors and the sunglasses. Fashion loses value the moment you leave.', cats: ['fashion', 'eyewear'], group: 'boutiques' },
  { id: 'fine', label: 'Pens, Cameras & Fine Goods', emoji: '🖋️', blurb: (g) => `Fountain pens, crystal, porcelain, cameras${g.year >= 1950 ? ', high-end audio' : ''}${hasTech(g, 'mobilePhone') ? ' and luxury phones' : ''}.`, cats: ['pen', 'fine', 'tech'], group: 'boutiques' },
  { id: 'sneakers', label: 'Designer Sneakers', emoji: '👟', blurb: 'Classics, collector pairs and the luxury houses’ trainers.', cats: ['sneakers'], group: 'boutiques' },
  { id: 'cars', label: 'Luxury Cars & Supercars', emoji: '🏎️', blurb: 'Italian, British, German, French and American marques, new and classic.', cats: ['car'], group: 'wheels' },
  { id: 'moto', label: 'Motorcycles', emoji: '🏍️', blurb: 'Cruisers, sport bikes and the classics collectors fight over.', cats: ['moto'], group: 'wheels' },
  { id: 'boats', label: 'Boats & Yachts', emoji: '🛥️', blurb: 'Real boatyards: runabouts, cruisers and classic racing yachts. Custom megayachts are at the Boat Dealership.', cats: ['boat'], group: 'wheels' },
  { id: 'aircraft', label: 'Aircraft & Helicopters', emoji: '🚁', blurb: (g) => `${g.year >= 1946 ? 'Light aircraft and helicopters' : 'Light aircraft'} from the real airframers. ${g.year >= 1960 ? 'Business jets' : 'Larger aircraft'} are at the Aircraft Brokerage.`, cats: ['air'], group: 'wheels' },
  { id: 'cellar', label: 'Fine Wine & Spirits', emoji: '🍷', blurb: 'Bordeaux, Burgundy, Napa, champagne, whisky and cognac. Adults only, where it is legal.', cats: ['wine', 'spirit'], group: 'cellar' },
]

/** Lines of this shop category on sale to the player (aircraft with a brokerage class are sold by the brokerage). */
export function categoryLines(g: GameState, c: ShopCategory): LuxLine[] {
  return ALL_LINES.filter((l) => c.cats.includes(l.cat) && lineOnSale(g, l) && !(l.cat === 'air' && l.fleet) && !(l.cat === 'boat' && l.usd >= 20_000_000)).sort((a, b) => a.usd - b.usd)
}

function categoryBrands(g: GameState, c: ShopCategory): string[] {
  const ids = new Set(categoryLines(g, c).map((l) => l.brand))
  return brandsWith(g, c.cats).filter((b) => ids.has(b))
}

// ---------------------------------------------------------------------------
// Honest hints (Business talent)

function outlookText(g: GameState, l: LuxLine): string | null {
  if (l.cat === 'art') return null
  const scarce = isScarceNow(l, g.year)
  let typical: number
  let low: number
  let high: number
  if (l.collect !== undefined) {
    const r = collectRef(l, g.year + 5) / Math.max(1, collectRef(l, g.year))
    typical = r * def(l.cls).instant
    low = typical * 0.85
    high = typical * 1.15
  } else {
    const o = holdOutlook(l.cls, 5, scarce, l.peak)
    typical = o.typical
    low = o.low
    high = o.high
  }
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const verdict = typical >= 1.05 ? 'Tends to hold its value or better' : typical >= 0.8 ? 'Loses some value' : 'Loses value quickly'
  return `${verdict}: a typical piece is worth about ${pct(typical)} of its price after 5 years (range ${pct(low)}-${pct(high)}). Markets move, so this is a guide, not a promise.`
}

function lineHint(g: GameState, l: LuxLine): string | null {
  if (!hasTalent(g, 'Business')) return null
  const t = outlookText(g, l)
  return t ? talentHint(g, 'Business', t) : null
}

function grayHint(g: GameState, o: Offer): string | null {
  if (!hasTalent(g, 'Business')) return null
  const pct = Math.round(o.fakeOdds * 100)
  return talentHint(g, 'Business', `About ${pct} in 100 pieces sold this way are counterfeits. If it is real, you still pay for the check and the dealer's cut when you sell.`)
}

// ---------------------------------------------------------------------------
// Buying

function priceTag(o: Offer): string {
  return formatMoney(o.price + o.trip)
}

function offerSubtitle(g: GameState, l: LuxLine, o: Offer): string {
  const bits = [shortMoney(o.price + o.trip)]
  if (o.allocation) bits.push(`allocation odds about ${Math.round(allocationOdds(g, l, o.price) * 100)}%`)
  if (o.used) bits.push(`${o.age} yrs old · ${o.condition}% condition`)
  if (o.channel === 'gray') bits.push('no papers')
  return bits.join(' · ')
}

function offerAction(l: LuxLine, variantIdx: number, o: Offer): MenuAction {
  const vname = l.variants?.[variantIdx]?.[0]
  const label = vname && variantIdx > 0 && o.channel !== 'boutique' ? `${o.label} (${vname})` : vname && o.channel === 'boutique' ? `${o.label}: ${vname}` : o.label
  return {
    type: 'action',
    id: `lux-buy-${l.id}-${variantIdx}-${o.channel}`,
    label,
    emoji: o.channel === 'gray' ? '🕶️' : o.channel === 'preowned' ? '🔎' : o.allocation ? '🕰️' : '🛍️',
    subtitle: (g) => offerSubtitle(g, l, o),
    disabledReason: (g) => {
      const b = buyBlock(g, l)
      if (b) return b
      const total = o.price + o.trip
      return g.character.money < total ? `You need ${formatMoney(total - g.character.money)} more.` : null
    },
    hint: (g) => (o.channel === 'gray' ? grayHint(g, o) : null),
    confirm: (g) => {
      const total = priceTag(o)
      if (o.allocation) return `Ask for an allocation of the ${lineTitle(l)}? If it comes through you pay ${total}. If not, you pay nothing and can try again next year (${Math.round(allocationOdds(g, l, o.price) * 100)}% this time).`
      if (o.channel === 'gray') return `Buy the ${lineTitle(l)} for ${total}? There are no papers, and about ${Math.round(o.fakeOdds * 100)} in 100 pieces sold this way are counterfeits. You can pay for an authentication afterwards.`
      return `Buy the ${lineTitle(l)}${vname && variantIdx > 0 ? ` (${vname})` : ''} for ${total}?${o.trip > 0 ? ` That includes ${formatMoney(o.trip)} to get to the nearest boutique.` : ''}`
    },
    run: (g) => {
      buyOffer(g, l, variantIdx, o.channel)
    },
  }
}

function lineSubtitle(g: GameState, l: LuxLine): string {
  const offers = offersFor(g, l, 0)
  const bits: string[] = []
  if (offers.length) bits.push(`from ${shortMoney(Math.min(...offers.map((o) => o.price + o.trip)))}`)
  else bits.push('nothing in stock this year')
  bits.push(l.until !== undefined && l.until < g.year ? `made ${l.from}-${l.until}` : `since ${l.from}`)
  if (l.limited) bits.push('limited run')
  if (isScarceNow(l, g.year)) bits.push('waiting list')
  return bits.join(' · ')
}

function lineHeader(g: GameState, l: LuxLine): string {
  const parts = [l.blurb ?? '', `${brandName(l.brand)} · ${TIER_LABEL[l.tier]}`, taxLine(g)]
  const t = unlockedTier(g)
  if (!tierOpen(g, l.tier)) parts.push('This tier is not open to you yet.')
  else if (t) parts.push(`You have ${formatMoney(g.character.money)}. Prices are approximate.`)
  return parts.filter(Boolean).join(' ')
}

function lineGroup(l: LuxLine): MenuGroup {
  return {
    type: 'menu',
    id: `lux-line-${l.id}`,
    label: l.name,
    emoji: l.emoji,
    subtitle: (g) => lineSubtitle(g, l),
    disabledReason: (g) => buyBlock(g, l),
    hint: (g) => lineHint(g, l),
    header: (g) => lineHeader(g, l),
    children: (g): MenuNode[] => {
      const nodes: MenuNode[] = []
      const n = l.variants?.length ?? 1
      const boutiques: Offer[] = []
      for (let v = 0; v < n; v++) {
        const bo = offersFor(g, l, v).find((o) => o.channel === 'boutique')
        if (bo) {
          boutiques.push(bo)
          nodes.push(offerAction(l, v, bo))
        }
      }
      const base = offersFor(g, l, 0).filter((o) => o.channel !== 'boutique')
      if (base.length) {
        nodes.push({ type: 'heading', id: `lux-h-other-${l.id}`, label: boutiques.length ? 'Other ways to buy' : 'Where to find one' })
        for (const o of base) nodes.push(offerAction(l, 0, o))
      }
      if (!nodes.length) nodes.push({ type: 'info', id: `lux-none-${l.id}`, text: 'Nothing is for sale this year. Check back next year.', emoji: '🪧' })
      if (isScarceNow(l, g.year)) nodes.push({ type: 'info', id: `lux-scarce-${l.id}`, text: `New ones are allocated to loyal clients. A fresh piece resells at up to ${Math.round(scarcePremium(l.cls) * 100)}% over retail, but dealers and auction houses take a cut, so flipping them is not a living.`, emoji: 'ℹ️' })
      return nodes
    },
  }
}

function brandGroup(c: ShopCategory, brandId: string): MenuGroup {
  const b = brandById(brandId)
  return {
    type: 'menu',
    id: `lux-brand-${c.id}-${brandId}`,
    label: brandName(brandId),
    emoji: c.emoji,
    subtitle: (g) => {
      const lines = linesOfBrand(g, brandId, c.cats).filter((l) => !(l.cat === 'air' && l.fleet))
      const lo = lines.length ? Math.min(...lines.map((l) => l.usd)) : 0
      return `${lines.length} model${lines.length === 1 ? '' : 's'}${b ? ` · est. ${b.founded}` : ''}${lo ? ` · from about ${shortMoney(lo)}` : ''}`
    },
    header: () => (b?.blurb ? `${b.blurb}.` : ''),
    children: (g) => linesOfBrand(g, brandId, c.cats).filter((l) => !(l.cat === 'air' && l.fleet)).map(lineGroup),
  }
}

function categoryGroup(c: ShopCategory): MenuGroup {
  return {
    type: 'menu',
    id: `lux-cat-${c.id}`,
    label: c.label,
    emoji: c.emoji,
    visible: (g) => categoryLines(g, c).length > 0,
    subtitle: (g) => `${categoryBrands(g, c).length} houses`,
    header: (g) => `${typeof c.blurb === 'function' ? c.blurb(g) : c.blurb} ${taxLine(g)}`.trim(),
    children: (g) => categoryBrands(g, c).map((b) => brandGroup(c, b)),
  }
}

function shopMenu(id: string, label: string, emoji: string, subtitle: string, group: ShopCategory['group']): MenuGroup {
  return {
    type: 'menu',
    id,
    label,
    emoji,
    subtitle,
    header: (g) => {
      const t = unlockedTier(g)
      return `Real houses, approximate prices. Open to you: ${t ? TIER_LABEL[t] : 'none yet'}. You have ${formatMoney(g.character.money)}.`
    },
    children: () => SHOP_CATEGORIES.filter((c) => c.group === group).map(categoryGroup),
  }
}

export const boutiquesMenu: MenuGroup = shopMenu('luxBoutiques', 'Designer Boutiques', '🛍️', 'Watches, jewelry, bags, fashion, pens, sneakers', 'boutiques')
export const wheelsMenu: MenuGroup = shopMenu('luxWheels', 'Cars, Bikes, Boats & Aircraft', '🏎️', 'Supercars, classics, runabouts, helicopters', 'wheels')
export const cellarMenu: MenuGroup = shopMenu('luxCellar', 'Fine Wine & Spirits', '🍷', 'Bordeaux, champagne, whisky, cognac', 'cellar')
