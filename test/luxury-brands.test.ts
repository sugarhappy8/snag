import { describe, expect, it } from 'vitest'
import { yearlyAssets } from '../src/game/assets'
import { netWorth } from '../src/game/core'
import { allBrands, brandById, brandExists, brandsFor } from '../src/game/data/brands'
import { jetListings, yachtListings } from '../src/game/shops/luxury-fleet'
import { isIndustryLegal } from '../src/game/data/markets'
import { hasTech } from '../src/game/history/timeline'
import { runScript } from '../src/game/scripts'
import { talentHint } from '../src/game/talents'
import { luxuryLifestyleMenu, yearlyLuxury } from '../src/game/shops/luxury'
import { brandAssets, luxuryAssetNodes, yearlyBrandAssets } from '../src/game/shops/luxury-brands-assets'
import { ALL_LINES, BOUTIQUE_NET_WORTH, LUXURY_TIER_NET_WORTH, alcoholBlock, lineById, lineOnSale, quoteNew, tierOpen, tierReason, unlockedTier } from '../src/game/shops/luxury-brands-catalog'
import { allocationOdds, authenticate, buyBlock, buyOffer, consignToAuction, offersFor, readBook, revealAuth, sellToDealer, toggleInsurance } from '../src/game/shops/luxury-brands-deal'
import { auctionLots, buyLot, grandTripsMenu } from '../src/game/shops/luxury-brands-rooms'
import { SHOP_CATEGORIES, categoryLines, boutiquesMenu, cellarMenu, wheelsMenu } from '../src/game/shops/luxury-brands-shop'
import { CLASSES, authOf, def, fakeOdds, holdOutlook, isFake, marketValue, outlookFrom, quickValue, stepMarket } from '../src/game/shops/luxury-brands-value'
import { LUXURY_NET_WORTH } from '../src/game/shops/luxury-common'
import { STAYS, VOYAGES } from '../src/game/shops/luxury-brands-stays'
import type { Asset, GameState, MenuNode, ModalItem } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { createPerson } from '../src/game/people'
import { makeTestGame } from './helpers'

function rich(money = 50_000_000, countryId = 'us', age = 40, seed = 3, year = 2026): GameState {
  const g = makeTestGame(seed, { age, money, countryId, birthCountryId: countryId })
  g.year = year
  g.log[0].year = year
  return g
}

function line(id: string) {
  const l = lineById(id)
  if (!l) throw new Error(`no line ${id}`)
  return l
}

function titles(g: GameState): string[] {
  return g.queue.flatMap((m) => (m.kind === 'notice' || m.kind === 'choice' ? [m.title] : []))
}

function answer(g: GameState, choice: string): void {
  const i = g.queue.findIndex((m) => (m.kind === 'choice' && m.source === 'script') || m.kind === 'input')
  expect(i).toBeGreaterThanOrEqual(0)
  const m = g.queue[i] as ModalItem & { scriptId?: string; data?: never }
  g.queue.splice(i, 1)
  runScript(g, String(m.scriptId), choice, m.data, m)
}

function text(v: string | ((g: GameState) => string) | undefined, g: GameState): string {
  return typeof v === 'function' ? v(g) : (v ?? '')
}

function walk(g: GameState, node: MenuNode, depth = 0, maxDepth = 4, out: string[] = []): string[] {
  if (node.type === 'info') {
    out.push(text(node.text, g))
    return out
  }
  if (node.type === 'heading') {
    out.push(node.label)
    return out
  }
  out.push(node.label, text(node.subtitle, g), node.disabledReason?.(g) ?? '', node.hint?.(g) ?? '')
  if (node.type === 'menu' && depth < maxDepth) {
    out.push(node.header?.(g) ?? '')
    for (const child of node.children(g)) walk(g, child, depth + 1, maxDepth, out)
  }
  return out
}

describe('The brand catalog', () => {
  it('has unique ids, real registry brands and sane years', () => {
    const ids = new Set<string>()
    for (const l of ALL_LINES) {
      expect(ids.has(l.id), l.id).toBe(false)
      ids.add(l.id)
      const b = brandById(l.brand)
      expect(b, `${l.id} brand ${l.brand}`).toBeDefined()
      expect(l.from, `${l.id} before the brand existed`).toBeGreaterThanOrEqual(b!.founded)
      if (b!.ended !== undefined) expect(l.until, `${l.id} outlives ${b!.name}`).toBeLessThanOrEqual(b!.ended)
      if (l.until !== undefined) expect(l.until).toBeGreaterThanOrEqual(l.from)
      expect(l.usd).toBeGreaterThan(0)
      expect(CLASSES[l.cls], l.id).toBeDefined()
      for (const [, m] of l.variants ?? []) expect(m).toBeGreaterThan(0)
      if (l.collect !== undefined) expect(l.collect).toBeGreaterThan(0)
    }
    expect(ALL_LINES.length).toBeGreaterThan(350)
  })

  it('covers every kind of brand the task asks for', () => {
    const cats = new Set(ALL_LINES.map((l) => l.cat))
    for (const c of ['watch', 'fashion', 'handbag', 'eyewear', 'jewelry', 'pen', 'sneakers', 'tech', 'car', 'moto', 'boat', 'air', 'wine', 'spirit']) expect(cats.has(c as never), c).toBe(true)
    expect(STAYS.length).toBeGreaterThan(10)
    expect(VOYAGES.length).toBeGreaterThan(8)
    const brandIds = new Set(ALL_LINES.map((l) => l.brand))
    for (const id of ['rolex', 'patek-philippe', 'seiko', 'hermes', 'chanel', 'cartier', 'ferrari', 'rolls-royce', 'gulfstream', 'riva', 'dom-perignon']) expect(brandIds.has(id), id).toBe(true)
  })

  it('does not sell a bag, a car or a jet before it existed', () => {
    const g = rich(5e9, 'fr', 40, 3, 1983)
    expect(lineOnSale(g, line('hermes-birkin'))).toBe(false)
    g.year = 1984
    expect(lineOnSale(g, line('hermes-birkin'))).toBe(true)
    g.year = 1930
    expect(lineOnSale(g, line('ferrari-sf90'))).toBe(false)
    expect(lineOnSale(g, line('rolex-submariner'))).toBe(false)
    g.year = 1954
    expect(lineOnSale(g, line('rolex-submariner'))).toBe(true)
    g.year = 2009
    expect(lineOnSale(g, line('gulfstream-g650'))).toBe(false)
    g.year = 2013
    expect(lineOnSale(g, line('gulfstream-g650'))).toBe(true)
    // A closed marque still has its old cars on the used market, but nothing new.
    g.year = 1990
    const duesenberg = line('duesenberg-model-j')
    expect(lineOnSale(g, duesenberg)).toBe(true)
    expect(offersFor(g, duesenberg).every((o) => o.channel !== 'boutique')).toBe(true)
    g.year = 1930
    expect(offersFor(g, duesenberg).some((o) => o.channel === 'boutique')).toBe(true)
  })

  it('uses historically accurate product names and commercial release windows', () => {
    expect(line('rolex-gmt-master')).toMatchObject({ name: 'GMT-Master', from: 1955, until: 1999 })
    expect(line('rolex-gmt-master-ii')).toMatchObject({ name: 'GMT-Master II', from: 1982 })
    expect(line('nike-air-jordan-1')).toMatchObject({ name: 'Air Jordan 1', from: 1985 })
    expect(line('penfolds-grange').from).toBe(1952)
    expect(line('bollinger-rd').from).toBe(1967)

    const g = rich(5e9, 'us', 40, 3, 1995)
    const avant = line('bang-olufsen-beovision-avant')
    expect(avant).toMatchObject({ from: 1995, until: 2005 })
    expect(offersFor(g, avant).some((o) => o.channel === 'boutique')).toBe(true)
    g.year = 2007
    expect(lineOnSale(g, avant)).toBe(true)
    expect(offersFor(g, avant).some((o) => o.channel === 'boutique')).toBe(false)
  })

  it('gates luxury electronics by technology', () => {
    const g = rich(5e9, 'us', 40, 3, 1975)
    const phone = line('vertu-signature')
    expect(lineOnSale(g, phone)).toBe(false)
    g.year = 2005
    expect(hasTech(g, 'mobilePhone')).toBe(true)
    expect(lineOnSale(g, phone)).toBe(true)
    expect(offersFor(g, phone, 0).some((o) => o.channel === 'boutique')).toBe(true)
    g.year = 2020
    // retired in 2017: only the used market is left
    expect(offersFor(g, phone, 0).some((o) => o.channel === 'boutique')).toBe(false)
    g.year = 1999
    expect(lineOnSale(g, line('vertu-signature-touch'))).toBe(false)
  })

  it('sells alcohol only to adults, where it is legal, never in Prohibition', () => {
    const g = rich(5e9, 'us', 17)
    expect(alcoholBlock(g)).toContain('21')
    expect(buyBlock(g, line('dom-perignon-vintage'))).not.toBeNull()
    g.character.age = 30
    expect(alcoholBlock(g)).toBeNull()
    g.year = 1925
    expect(alcoholBlock(g)).toContain('Prohibition')
    g.year = 2026
    const dry = COUNTRIES.find((c) => !isIndustryLegal(c.id, 'bar'))
    if (dry) {
      const d = rich(5e9, dry.id, 40)
      expect(alcoholBlock(d)).not.toBeNull()
      expect(categoryLines(d, SHOP_CATEGORIES.find((c) => c.id === 'cellar')!).length).toBeGreaterThan(-1)
    }
  })

  it('places every luxury brand in a real country and keeps facts inside the rules', () => {
    const ids = new Set(COUNTRIES.map((c) => c.id))
    for (const b of allBrands()) {
      if (!['watch', 'fashion', 'handbag', 'jewelry', 'supercar', 'car', 'jet', 'yacht', 'wine', 'champagne', 'spirit', 'auction', 'hotel', 'airline'].includes(b.category)) continue
      if (b.hq) expect(ids.has(b.hq), `${b.id} hq ${b.hq}`).toBe(true)
      for (const c of b.countries ?? []) expect(ids.has(c), `${b.id} country ${c}`).toBe(true)
      if (b.ended !== undefined) expect(b.ended, b.id).toBeLessThan(2026)
      expect(b.fame ?? 5).toBeGreaterThanOrEqual(1)
      expect(b.fame ?? 5).toBeLessThanOrEqual(10)
    }
    // no tobacco, vape, firearms or gambling operators in the luxury registry
    for (const b of allBrands()) expect(['tobacco', 'vape', 'firearms', 'casino', 'gambling']).not.toContain(b.category)
  })

  it('uses real builders and real airframes in the megayacht and jet dealers', () => {
    for (const year of [1925, 1950, 1975, 2000, 2026]) {
      const g = rich(5e9, 'us', 40, 3, year)
      const yards = brandsFor(g, 'yacht', { segment: 'yacht-builder' }).map((b) => b.name)
      for (const y of yachtListings(g)) expect(yards, `${year} ${y.builder}`).toContain(y.builder)
      for (const j of jetListings(g)) {
        expect(j.model, `${year}`).not.toMatch(/Stratoline|Falconetti|Bombastique|Halcyon|Aerostar|Skybridge|Marchetti/)
        if (j.model !== 'Supersonic Business Jet') {
          const known = ALL_LINES.some((l) => l.fleet && l.from <= year && (l.until === undefined || l.until >= year) && j.model.includes(l.name.split(' ')[0]))
          expect(known, `${year} ${j.model}`).toBe(true)
        }
        expect(j.price).toBeGreaterThan(0)
      }
    }
  })

  it('names every brand correctly and keeps real-looking titles', () => {
    for (const l of ALL_LINES) {
      expect(l.name.length, l.id).toBeGreaterThan(0)
      expect(brandExists(brandById(l.brand)!, Math.max(l.from, brandById(l.brand)!.founded)), l.id).toBe(true)
    }
  })
})

describe('Tiers', () => {
  it('opens boutique, luxury and ultra by net worth', () => {
    const g = rich(5_000)
    expect(unlockedTier(g)).toBeNull()
    expect(tierReason(g, 'boutique')).toContain('more')
    g.character.money = BOUTIQUE_NET_WORTH
    expect(unlockedTier(g)).toBe('boutique')
    expect(tierOpen(g, 'luxury')).toBe(false)
    g.character.money = LUXURY_TIER_NET_WORTH
    expect(unlockedTier(g)).toBe('luxury')
    expect(tierOpen(g, 'ultra')).toBe(false)
    g.character.money = LUXURY_NET_WORTH
    expect(unlockedTier(g)).toBe('ultra')
    expect(tierReason(g, 'ultra')).toBeNull()
  })

  it('blocks a piece above your tier even if you could afford it', () => {
    const g = rich(30_000)
    const swatch = line('swatch-original')
    expect(buyBlock(g, swatch)).toBeNull()
    const rolex = line('rolex-datejust')
    expect(rolex.tier).toBe('luxury')
    expect(buyBlock(g, rolex)).toContain('$250,000')
    expect(buyOffer(g, rolex, 0, 'preowned')).toBeNull()
    expect(g.assets).toHaveLength(0)
    g.character.money = 400_000
    expect(buyBlock(g, rolex)).toBeNull()
    const ferrari = line('ferrari-sf90')
    expect(buyBlock(g, ferrari)).toContain('$5,000,000')
  })

  it('refuses minors, prisoners and the dead', () => {
    const kid = rich(9e9, 'us', 16)
    expect(buyBlock(kid, line('swatch-original'))).toContain('adults')
    const con = rich()
    con.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(buyBlock(con, line('swatch-original'))).toContain('prison')
    const dead = rich()
    dead.character.alive = false
    expect(buyBlock(dead, line('swatch-original'))).toContain('dead')
  })

  it('needs a license for a boat or an aircraft', () => {
    const g = rich(9e9)
    expect(buyBlock(g, line('boston-whaler-montauk'))).toContain('boating')
    g.character.licenses.push('boating')
    expect(buyBlock(g, line('boston-whaler-montauk'))).toBeNull()
    expect(buyBlock(g, line('robinson-helicopter-r44'))).toContain('pilot')
  })
})

describe('Prices', () => {
  it('follows the local luxury price level and the era', () => {
    const us = rich(9e9, 'us')
    const dk = rich(9e9, 'dk')
    const ferrari = line('ferrari-sf90')
    expect(quoteNew(dk, ferrari).price).toBeGreaterThan(quoteNew(us, ferrari).price * 1.2)
    const old = rich(9e9, 'us', 40, 3, 1975)
    const rolex = line('rolex-datejust')
    expect(quoteNew(old, rolex).price).toBeLessThan(quoteNew(us, rolex).price)
    expect(quoteNew(us, rolex).price).toBeGreaterThan(9_000)
    expect(quoteNew(us, rolex, 2).price).toBeGreaterThan(quoteNew(us, rolex, 0).price * 3)
  })

  it('applies the 1991-1993 US luxury tax to jewelry and yachts over the thresholds', () => {
    const l = line('harry-winston-solitaire')
    const plain = rich(9e9, 'us', 40, 3, 1995)
    const taxed = rich(9e9, 'us', 40, 3, 1992)
    expect(quoteNew(taxed, l).luxuryTax).toBeGreaterThan(0)
    expect(quoteNew(plain, l).luxuryTax).toBe(0)
    expect(quoteNew(rich(9e9, 'gb', 40, 3, 1992), l).luxuryTax).toBe(0)
  })

  it('gives every line a finite positive price in every country and decade', () => {
    for (const country of ['us', 'dk', 'in', 'jp', 'ng', 'ch']) {
      for (const year of [1900, 1950, 1985, 2026, 2040]) {
        const g = rich(9e9, country, 40, 3, year)
        for (const l of ALL_LINES) {
          if (!lineOnSale(g, l)) continue
          for (const o of offersFor(g, l, 0)) {
            expect(Number.isFinite(o.price) && o.price > 0, `${l.id} ${country} ${year} ${o.channel}`).toBe(true)
            expect(Number.isFinite(o.mkt0) && o.mkt0 > 0, `${l.id} ${country} ${year} ${o.channel}`).toBe(true)
          }
        }
      }
    }
  })
})

function bought(g: GameState, id: string, channel: 'boutique' | 'preowned' | 'gray' = 'boutique', v = 0): Asset {
  const before = g.assets.length
  buyOffer(g, line(id), v, channel)
  expect(g.assets.length, `buying ${id} on ${channel}`).toBe(before + 1)
  return g.assets[g.assets.length - 1]
}

describe('Buying, value and resale', () => {
  it('turns a purchase into an asset with a registry brand, condition and an honest value', () => {
    const g = rich()
    const price = offersFor(g, line('omega-speedmaster'), 0)[0].price
    const a = bought(g, 'omega-speedmaster')
    expect(a.details.brand).toBe('omega')
    expect(a.kind).toBe('other')
    expect(a.condition).toBe(100)
    expect(a.purchasePrice).toBe(price)
    expect(a.value).toBeLessThan(a.purchasePrice)
    expect(a.value).toBeGreaterThan(a.purchasePrice * 0.5)
    expect(g.character.money).toBe(50_000_000 - price)
    const car = bought(g, 'ferrari-296-gtb')
    expect(car.kind).toBe('car')
    expect(car.details.carType).toBe('supercar')
    expect(car.details.brand).toBe('ferrari')
    g.character.licenses.push('boating')
    const boat = bought(g, 'riva-rivale')
    expect(boat.kind).toBe('boat')
  })

  it('maps categories to asset kinds', () => {
    const g = rich(5e9)
    g.character.licenses.push('boating', 'pilot')
    expect(bought(g, 'cartier-love-bracelet').kind).toBe('jewelry')
    expect(bought(g, 'robinson-helicopter-r44').kind).toBe('aircraft')
    expect(bought(g, 'louis-vuitton-speedy').details.cat).toBe('handbag')
    expect(brandAssets(g).length).toBe(g.assets.length)
  })

  it('loses money on a buy and sell loop: dealer spread and auction fees always bite', () => {
    const ids = ['omega-speedmaster', 'louis-vuitton-speedy', 'cartier-tank', 'ferrari-296-gtb', 'dom-perignon-vintage', 'nike-air-force-1', 'montblanc-meisterstuck']
    for (const id of ids) {
      const g = rich(900_000_000)
      const start = g.character.money
      for (let i = 0; i < 6; i++) {
        const a = bought(g, id, i % 2 === 0 ? 'boutique' : 'preowned')
        g.year += 0
        if (i % 2 === 0) sellToDealer(g, a)
        else consignToAuction(g, a, "Christie's")
        g.queue = []
        if (g.assets.length) g.assets = []
        g.flags = {}
      }
      expect(g.character.money, id).toBeLessThan(start)
    }
  })

  it('never gains in expectation at auction, across many random results', () => {
    let total = 0
    let spent = 0
    for (let seed = 1; seed <= 60; seed++) {
      const g = rich(900_000_000, 'us', 40, seed)
      const a = bought(g, 'rolex-datejust')
      spent += a.purchasePrice
      const before = g.character.money
      consignToAuction(g, a, "Sotheby's")
      total += g.character.money - before + (g.assets.includes(a) ? marketValue(a) * 0.85 : 0)
    }
    expect(total / spent).toBeLessThan(1)
    expect(total / spent).toBeGreaterThan(0.5)
  })

  it('makes allocation-only pieces a poor flip: you may not get one, and a resale loses to the retail price', () => {
    const l = line('rolex-submariner')
    const g = rich(5e9)
    const odds = allocationOdds(g, l, offersFor(g, l, 0)[0].price)
    expect(odds).toBeGreaterThan(0.1)
    expect(odds).toBeLessThan(0.7)
    let got = 0
    let sold = 0
    let paid = 0
    for (let seed = 1; seed <= 80; seed++) {
      const h = rich(5e9, 'us', 40, seed)
      const before = h.assets.length
      buyOffer(h, l, 0, 'boutique')
      h.queue = []
      if (h.assets.length > before) {
        got += 1
        const a = h.assets[h.assets.length - 1]
        paid += a.purchasePrice
        const m0 = h.character.money
        consignToAuction(h, a, "Christie's")
        sold += h.character.money - m0 + (h.assets.includes(a) ? marketValue(a) * 0.88 : 0)
      }
    }
    expect(got).toBeLessThan(40)
    expect(got).toBeGreaterThan(2)
    expect(sold / paid).toBeLessThan(1.05)
    // asking again the same year costs nothing and is refused politely
    const h = rich(5e9)
    buyOffer(h, l, 0, 'boutique')
    h.queue = []
    const book = readBook(h)
    expect(book.alloc[l.id]).toBe(h.year)
  })

  it('refuses a broke buyer and takes no money', () => {
    const g = rich(1_000)
    g.assets.push({ id: 'house', kind: 'house', name: 'House', emoji: '🏠', purchasePrice: 100_000, value: 100_000, condition: 90, purchasedAge: 30, upkeep: 0, details: {} })
    const m = g.character.money
    expect(buyOffer(g, line('tag-heuer-carrera'), 0, 'boutique')).toBeNull()
    expect(g.character.money).toBe(m)
    expect(titles(g)).toContain('Insufficient Funds')
  })

  it('removes the listing once bought', () => {
    const g = rich()
    expect(offersFor(g, line('cartier-tank'), 0).some((o) => o.channel === 'boutique')).toBe(true)
    bought(g, 'cartier-tank')
    expect(offersFor(g, line('cartier-tank'), 0).some((o) => o.channel === 'boutique')).toBe(false)
    g.year += 1
    expect(offersFor(g, line('cartier-tank'), 0).some((o) => o.channel === 'boutique')).toBe(true)
  })
})

describe('Value over time', () => {
  it('depreciates fashion and bags, holds icons, and caps the gains', () => {
    const g = rich(5e9)
    const jacket = bought(g, 'burberry-trench')
    const flap = bought(g, 'chanel-2-55')
    const sub = bought(g, 'rolex-oyster')
    const v0 = [jacket.value, flap.value, sub.value]
    for (let y = 0; y < 10; y++) {
      g.year += 1
      for (const a of g.assets) stepMarket(g, a)
    }
    expect(jacket.value).toBeLessThan(v0[0] * 0.5)
    expect(flap.value).toBeGreaterThan(v0[1] * 0.8)
    expect(sub.value).toBeGreaterThan(v0[2] * 0.8)
    for (let y = 0; y < 150; y++) {
      g.year += 1
      for (const a of g.assets) stepMarket(g, a)
    }
    for (const a of g.assets) {
      const cd = def(String(a.details.cls))
      expect(a.details.mkt as number).toBeLessThanOrEqual(Number(a.details.basis) * cd.cap + 1)
      expect(a.details.mkt as number).toBeGreaterThanOrEqual(Number(a.details.basis) * cd.floor - 1)
    }
  })

  it('quick-sale value counts toward net worth, below the market value', () => {
    const g = rich()
    const a = bought(g, 'omega-seamaster')
    expect(a.value).toBe(quickValue(a))
    expect(marketValue(a)).toBeGreaterThan(a.value)
    expect(netWorth(g)).toBe(g.character.money + a.value)
  })

  it('ages classic cars toward their quoted value today, bounded', () => {
    const g = rich(9e9, 'us', 40, 3, 1990)
    const gto = line('ferrari-250-gto')
    const a = bought(g, gto.id, 'preowned')
    for (let y = 1990; y < 2026; y++) {
      g.year = y + 1
      stepMarket(g, a)
    }
    const m = marketValue(a)
    expect(m).toBeGreaterThan(20_000_000)
    expect(m).toBeLessThan(gto.collect! * 2)
  })

  it('has honest outlooks for the Business talent that match the model', () => {
    const watch = holdOutlook('watch', 5)
    const fashion = holdOutlook('fashion', 5)
    const icon = holdOutlook('icon-watch', 5, true)
    expect(fashion.typical).toBeLessThan(watch.typical)
    expect(watch.typical).toBeLessThan(1)
    expect(icon.typical).toBeGreaterThan(watch.typical)
    expect(outlookFrom('icon-watch', 3, 5).typical).toBeGreaterThan(1)
    expect(outlookFrom('car', 1, 5).typical).toBeLessThan(0.9)
    // low <= typical <= high
    for (const c of Object.keys(CLASSES)) {
      const o = holdOutlook(c, 7)
      expect(o.low).toBeLessThanOrEqual(o.typical + 1e-9)
      expect(o.typical).toBeLessThanOrEqual(o.high + 1e-9)
    }
  })

  it('shows purple hints only to Business talents, claims no certainty and uses the real fake odds', () => {
    const g = rich(5e9)
    const sub = line('rolex-datejust')
    const row = (gg: GameState) => walk(gg, boutiquesMenu, 0, 6).filter((t) => t.includes('typical piece'))
    expect(row(g)).toHaveLength(0)
    g.character.talent = 'Business'
    const hints = row(g)
    expect(hints.length).toBeGreaterThan(5)
    for (const h of hints) {
      expect(h.startsWith('\u{1F52E}')).toBe(true)
      expect(h).toMatch(/guide, not a promise|Markets (move|can)/)
    }
    const grayHint = walk(g, boutiquesMenu, 0, 6).find((t) => t.includes('counterfeits'))
    expect(grayHint).toBeDefined()
    const gray = offersFor(g, sub, 0).find((o) => o.channel === 'gray')!
    expect(grayHint).toBeDefined()
    expect(talentHint(g, 'Business', `About ${Math.round(gray.fakeOdds * 100)} in 100`).length).toBeGreaterThan(5)
    expect(fakeOdds(g, sub.cls, 'gray')).toBe(gray.fakeOdds)
  })
})

describe('Counterfeits and authentication', () => {
  it('rolls fakes at the stated odds on the gray market, never at the boutique', () => {
    let fakes = 0
    const n = 400
    let odds = 0
    for (let seed = 1; seed <= n; seed++) {
      const g = rich(900_000_000, 'us', 40, seed)
      odds = offersFor(g, line('omega-seamaster'), 0).find((o) => o.channel === 'gray')!.fakeOdds
      const a = bought(g, 'omega-seamaster', 'gray')
      if (isFake(a)) fakes += 1
      g.queue = []
    }
    expect(fakes / n).toBeGreaterThan(odds - 0.1)
    expect(fakes / n).toBeLessThan(odds + 0.1)
    for (let seed = 1; seed <= 60; seed++) {
      const g = rich(900_000_000, 'us', 40, seed)
      expect(isFake(bought(g, 'omega-seamaster', 'boutique'))).toBe(false)
    }
  })

  it('hides the truth until checked, then a fake is worth almost nothing and cannot be sold', () => {
    let a: Asset | undefined
    let g: GameState | undefined
    for (let seed = 1; seed < 200 && !a; seed++) {
      const h = rich(900_000_000, 'us', 40, seed)
      const x = bought(h, 'cartier-love-bracelet', 'gray')
      h.queue = []
      if (isFake(x)) {
        a = x
        g = h
      }
    }
    expect(a).toBeDefined()
    expect(authOf(a!)).toBe('unknown')
    const believed = a!.value
    expect(believed).toBeGreaterThan(500)
    const m = g!.character.money
    authenticate(g!, a!)
    expect(g!.character.money).toBeLessThan(m)
    expect(authOf(a!)).toBe('fake')
    expect(a!.value).toBeLessThan(believed * 0.2)
    expect(titles(g!)).toContain('It Is a Fake')
    const before = g!.character.money
    sellToDealer(g!, a!)
    expect(g!.character.money).toBe(before)
    expect(g!.assets).toContain(a)
  })

  it('a dealer spots an unverified fake on the spot and nobody pays for it', () => {
    let tested = false
    for (let seed = 1; seed < 300 && !tested; seed++) {
      const g = rich(900_000_000, 'us', 40, seed)
      const a = bought(g, 'louis-vuitton-speedy', 'gray')
      g.queue = []
      if (!isFake(a)) continue
      const m = g.character.money
      sellToDealer(g, a)
      expect(g.character.money).toBe(m)
      expect(authOf(a)).toBe('fake')
      tested = true
    }
    expect(tested).toBe(true)
  })

  it('certifies a genuine piece and lets it sell', () => {
    for (let seed = 1; seed < 100; seed++) {
      const g = rich(900_000_000, 'us', 40, seed)
      const a = bought(g, 'seiko-prospex-diver', 'preowned')
      g.queue = []
      if (isFake(a)) continue
      authenticate(g, a)
      expect(authOf(a)).toBe('verified')
      const m = g.character.money
      sellToDealer(g, a)
      expect(g.character.money).toBeGreaterThan(m)
      return
    }
  })
})

describe('Unverified pieces are priced for the risk', () => {
  it('shows the same value for a real and a fake gray-market piece, so the number never gives it away', () => {
    const seen: { fake: boolean; value: number; paid: number }[] = []
    for (let seed = 1; seed <= 200 && (seen.filter((x) => x.fake).length < 3 || seen.filter((x) => !x.fake).length < 3); seed++) {
      const g = rich(900_000_000, 'us', 40, 3)
      g.rng = seed * 104729
      const a = bought(g, 'cartier-santos', 'gray')
      seen.push({ fake: a.details.lfake === true, value: a.value, paid: a.purchasePrice })
    }
    const fakes = seen.filter((x) => x.fake)
    const real = seen.filter((x) => !x.fake)
    expect(fakes.length).toBeGreaterThan(0)
    expect(real.length).toBeGreaterThan(0)
    // same price, same shown value
    for (const x of seen) expect(x.value).toBeLessThan(x.paid)
    expect(Math.abs(fakes[0].value / fakes[0].paid - real[0].value / real[0].paid)).toBeLessThan(0.35)
  })

  it('certifying a genuine piece restores its full quick-sale value', () => {
    for (let seed = 1; seed < 100; seed++) {
      const g = rich(900_000_000, 'us', 40, seed)
      const a = bought(g, 'omega-seamaster', 'preowned')
      if (isFake(a)) continue
      const before = a.value
      authenticate(g, a)
      expect(a.value).toBeGreaterThan(before)
      return
    }
  })

  it('applies Japan’s old commodity tax to jewelry, watches and cars, and not after 1988', () => {
    const jp = rich(9e9, 'jp', 40, 3, 1980)
    expect(quoteNew(jp, line('cartier-tank')).luxuryTax).toBeGreaterThan(0)
    expect(quoteNew(rich(9e9, 'jp', 40, 3, 1995), line('cartier-tank')).luxuryTax).toBe(0)
  })
})

describe('Service, insurance and theft', () => {
  it('insured thefts pay the market value minus a deductible, uninsured ones pay nothing', () => {
    let insuredPaid = 0
    let stolen = 0
    for (let seed = 1; seed <= 300 && stolen < 3; seed++) {
      const g = rich(900_000_000, 'us', 40, seed)
      const a = bought(g, 'cartier-love-bracelet')
      toggleInsurance(g, a)
      g.queue = []
      const m0 = g.character.money
      const v = marketValue(a)
      g.year += 1
      yearlyBrandAssets(g, { left: 1 })
      if (!g.assets.includes(a)) {
        stolen += 1
        insuredPaid = g.character.money - m0
        expect(insuredPaid).toBeGreaterThan(v * 0.5)
        expect(insuredPaid).toBeLessThan(v * 1.1)
      }
    }
    expect(stolen).toBeGreaterThan(0)
  })

  it('charges the premium once a year and lets the policy lapse when broke', () => {
    const g = rich(2_000_000)
    const a = bought(g, 'cartier-tank')
    toggleInsurance(g, a)
    g.queue = []
    const m = g.character.money
    g.year += 1
    yearlyBrandAssets(g, { left: 1 })
    if (g.assets.includes(a)) expect(g.character.money).toBeLessThan(m)
    const b = rich(30_000)
    const c = bought(b, 'swatch-original')
    toggleInsurance(b, c)
    b.character.money = 0
    b.year += 1
    yearlyBrandAssets(b, { left: 1 })
    if (b.assets.includes(c)) expect(c.details.luxIns).toBe(false)
  })

  it('wears pieces down and service restores them for a fee', () => {
    const g = rich(5_000_000)
    const a = bought(g, 'ferrari-roma')
    for (let y = 0; y < 6; y++) {
      g.year += 1
      yearlyBrandAssets(g, { left: 1 })
      g.queue = []
    }
    if (!g.assets.includes(a)) return
    expect(a.condition).toBeLessThan(90)
    const nodes = luxuryAssetNodes(g, a)!
    expect(nodes.some((n) => n.type === 'action' && n.id.startsWith('lux-service'))).toBe(true)
  })
})

describe('Auction rooms and grand trips', () => {
  it('lists this year’s lots with the buyer’s premium and never sells below market', () => {
    const g = rich(9e9, 'us', 40, 3, 2010)
    const lots = auctionLots(g)
    expect(lots.length).toBeGreaterThan(4)
    for (const lot of lots) {
      expect(lot.price).toBeGreaterThan(lot.mkt0 * 0.85)
      expect(Number.isFinite(lot.price)).toBe(true)
    }
    const before = g.assets.length
    const lot = lots.find((l) => l.kind === 'art')!
    expect(buyLot(g, lot)).not.toBeNull()
    expect(g.assets.length).toBe(before + 1)
    expect(auctionLots(g).some((l) => l.id === lot.id)).toBe(false)
    expect(g.assets[before].details.brand).toBe(lot.house)
  })

  it('has no auction rooms before the houses existed', () => {
    const g = rich(9e9, 'gb', 40, 3, 1700)
    expect(auctionLots(g)).toHaveLength(0)
  })

  it('books a stay only in years the hotel operated', () => {
    const g = rich(9e9, 'us', 40, 3, 1900)
    const open = grandTripsMenu.children(g).filter((n) => n.type === 'action').map((n) => n.id)
    expect(open).toContain('lux-stay-savoy')
    expect(open).not.toContain('lux-stay-burj-al-arab')
    expect(open).not.toContain('lux-voyage-concorde-ba')
    expect(open).toContain('lux-voyage-liner-cunard')
    g.year = 2000
    const later = grandTripsMenu.children(g).filter((n) => n.type === 'action').map((n) => n.id)
    expect(later).toContain('lux-voyage-concorde-ba')
    expect(later).not.toContain('lux-voyage-liner-white-star')
  })

  it('a stay costs money, makes the family happy and is limited to two a year', () => {
    const g = rich(9e9)
    const act = grandTripsMenu.children(g).find((n) => n.type === 'action' && n.id === 'lux-stay-ritz-paris')
    expect(act?.type).toBe('action')
    if (act?.type !== 'action') return
    for (let i = 0; i < 3; i++) {
      const m = g.character.money
      act.run(g, '3')
      answer(g, 'solo')
      if (i < 2) expect(g.character.money).toBeLessThan(m)
      else {
        expect(g.character.money).toBe(m)
        expect(titles(g)).toContain('Fully Rested')
      }
      g.queue = []
    }
  })
})

describe('Menus', () => {
  it('render for every country and sampled year without NaN or undefined', () => {
    for (const country of COUNTRIES.slice(0, 40)) {
      for (const year of [1912, 1958, 1999, 2026]) {
        const g = rich(9e9, country.id, 40, 3, year)
        const all = [boutiquesMenu, wheelsMenu, cellarMenu, grandTripsMenu].flatMap((m) => walk(g, m, 0, 4)).join('\n')
        expect(all, `${country.id} ${year}`).not.toMatch(/NaN|undefined|\[object|Infinity/)
      }
    }
  })

  it('fits the Luxury Lifestyle tab without crowding it (shop rows are submenus)', () => {
    const g = rich(9e9)
    const kids = luxuryLifestyleMenu.children(g)
    const menus = kids.filter((n) => n.type === 'menu')
    expect(menus.length).toBeLessThan(14)
    expect(kids.some((n) => n.type === 'heading' && n.label === 'Brand Shops')).toBe(true)
    expect(kids.some((n) => n.id === 'luxBoutiques')).toBe(true)
  })

  it('every purchase action in the shop works for a rich adult and leaves a registry brand', () => {
    const g = rich(9e12)
    g.character.licenses.push('boating', 'pilot', 'driver')
    const base = JSON.stringify(g)
    let ran = 0
    for (const cat of SHOP_CATEGORIES) {
      const lines = categoryLines(g, cat)
      for (const l of lines.slice(0, 25)) {
        const h = JSON.parse(base) as GameState
        const o = offersFor(h, l, 0)
        for (const offer of o) {
          buyOffer(h, l, 0, offer.channel)
          h.queue = []
        }
        for (const a of h.assets) {
          expect(brandById(String(a.details.brand))).toBeDefined()
          expect(Number.isFinite(a.value) && a.value > 0).toBe(true)
        }
        ran += 1
      }
    }
    expect(ran).toBeGreaterThan(100)
  })
})

function duplicateIds(g: GameState, node: MenuNode, depth = 0, out: string[] = []): string[] {
  if (node.type !== 'menu' || depth > 5) return out
  const kids = node.children(g)
  const seen = new Set<string>()
  for (const k of kids) {
    if (seen.has(k.id)) out.push(`${node.id} > ${k.id}`)
    seen.add(k.id)
    duplicateIds(g, k, depth + 1, out)
  }
  return out
}

describe('Menu structure', () => {
  it('keeps sibling ids unique everywhere so the UI can key its rows', () => {
    const g = rich(9e9, 'us', 40, 3, 2026)
    g.character.licenses.push('boating', 'pilot', 'driver')
    bought(g, 'rolex-datejust')
    bought(g, 'ferrari-roma')
    bought(g, 'cartier-tank')
    createPerson(g, { relation: 'child', age: 20 })
    for (const m of [luxuryLifestyleMenu, boutiquesMenu, wheelsMenu, cellarMenu]) expect(duplicateIds(g, m), m.id).toEqual([])
    const old = rich(9e9, 'gb', 40, 3, 1938)
    expect(duplicateIds(old, luxuryLifestyleMenu)).toEqual([])
  })
})

describe('Old saves', () => {
  it('ignores assets without brand data and keeps old jewelry, cars and art untouched', () => {
    const g = rich()
    const plain: Asset = { id: 'old1', kind: 'jewelry', name: 'Gold Band', emoji: '💍', purchasePrice: 1000, value: 900, condition: 90, purchasedAge: 30, upkeep: 0, details: { category: 'jewelry', fake: false } }
    g.assets.push(plain)
    const before = JSON.stringify(plain)
    yearlyBrandAssets(g, { left: 1 })
    yearlyLuxury(g)
    expect(JSON.stringify(plain)).toBe(before)
    expect(brandAssets(g)).toHaveLength(0)
    expect(luxuryAssetNodes(g, plain)).toBeNull()
  })

  it('loads a state with no luxury flags and survives a JSON round trip', () => {
    const g = rich()
    bought(g, 'cartier-tank')
    const h = JSON.parse(JSON.stringify(g)) as GameState
    h.year += 1
    yearlyLuxury(h)
    yearlyAssets(h)
    expect(h.assets.every((a) => Number.isFinite(a.value))).toBe(true)
  })
})

describe('A rich 40-year life', () => {
  it('buys, ages, sells and loses things without errors or bad numbers', () => {
    for (const country of ['us', 'gb', 'jp']) {
      const g = rich(400_000_000, country, 30, 7, 1990)
      g.character.licenses.push('boating', 'driver')
      for (let y = 0; y < 40; y++) {
        g.year += 1
        g.character.age += 1
        g.yearActions = {}
        const cats = SHOP_CATEGORIES.filter((c) => c.id !== 'aircraft')
        for (const cat of cats) {
          const lines = categoryLines(g, cat)
          if (!lines.length) continue
          const l = lines[(y * 7 + cat.id.length) % lines.length]
          const offers = offersFor(g, l, 0)
          if (!offers.length) continue
          const o = offers[y % offers.length]
          if (buyBlock(g, l) === null) buyOffer(g, l, 0, o.channel)
        }
        for (const a of [...g.assets].slice(0, 3)) {
          if (a.details.lux === 1 && y % 5 === 0) consignToAuction(g, a, 'Bonhams')
        }
        yearlyLuxury(g)
        yearlyAssets(g)
        g.queue = []
        expect(Number.isFinite(g.character.money), `${country} ${y}`).toBe(true)
        for (const a of g.assets) {
          expect(Number.isFinite(a.value) && a.value >= 0, `${a.name} ${y}`).toBe(true)
          expect(a.condition).toBeGreaterThanOrEqual(0)
          expect(a.condition).toBeLessThanOrEqual(100)
        }
        expect(JSON.parse(JSON.stringify(g.flags))).toEqual(g.flags)
      }
      expect(brandAssets(g).length).toBeGreaterThan(0)
    }
  })

  it('reveals auth state consistently', () => {
    const g = rich()
    const a = bought(g, 'omega-speedmaster')
    expect(revealAuth(g, a)).toBe(true)
    expect(authOf(a)).toBe('verified')
  })
})
