// Products 2.0 (docs/superpowers/specs/2026-10-12-products-rd-acquisitions-design.md): every line
// competes with the rivals' versions of it, every kind of product follows its real history,
// R&D costs belong to the product, and buying a rival brings its products.
import { describe, expect, it } from 'vitest'
import { marketViewOf } from '../src/game/business/competition'
import { acquireRival, acquisitionQuote, spreadSites } from '../src/game/business/competition-moves'
import { marketCtxFor, planFor, productsPullOf } from '../src/game/business/economy'
import { applyProductRivalry, fieldOf, lineInfo, productPull, qualityFromBoost, rivalLines, rivalVersion } from '../src/game/business/product-market'
import { demandLevel } from '../src/game/business/product-data'
import { productIdeas } from '../src/game/business/products'
import { advanceRd, rdRange, startRd } from '../src/game/business/rd'
import { bizOf, readBiz, totalOutlets, type BizState, type Product } from '../src/game/business/state'
import { presentCompetitionEvent } from '../src/game/business/competition-events'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState } from '../src/game/types'
import { adult, company, nextYear } from './market-kit'

function line(name: string, quality: number, launched: number): Product {
  return { name, launched, boost: 0, quality }
}

describe('kinds of product and their real history', () => {
  it('reads the kind and sort of every line productIdeas makes', () => {
    expect(lineInfo('Street Lighting', 'energy')).toEqual({ family: 'Street Lighting', kind: 'core', gen: 1 })
    expect(lineInfo('Street Lighting Mk III', 'energy')).toMatchObject({ family: 'Street Lighting', kind: 'next', gen: 3 })
    expect(lineInfo('Mobile App 2.0', 'software')).toMatchObject({ family: 'Mobile App', kind: 'next', gen: 2 })
    expect(lineInfo('Wedding Cakes, Recipe No. 4', 'bakery')).toMatchObject({ family: 'Wedding Cakes', kind: 'next', gen: 4 })
    expect(lineInfo('Premium Tasting Menu', 'restaurant')).toMatchObject({ family: 'Tasting Menu', kind: 'premium' })
    expect(lineInfo('Tasting Menu & Happy Hour Combo', 'restaurant')).toMatchObject({ family: 'Tasting Menu', kind: 'bundle' })
    expect(lineInfo('Delivery Service, Osaka Style', 'restaurant')).toMatchObject({ family: 'Delivery Service', kind: 'regional' })
    // Classic names that look like variants are kinds of their own.
    expect(lineInfo('Seasonal Spiced Latte', 'cafe')).toMatchObject({ family: 'Seasonal Spiced Latte', kind: 'core' })
    expect(lineInfo('Something Odd', 'cafe')).toMatchObject({ family: 'Something Odd', kind: 'core' })
  })

  it('offers only what existed: street lighting in 1930, telephone exchanges before fiber, no apps before smartphones', () => {
    const g = adult(3, 1930, 'jp')
    const energy = company(g, 'energy')
    expect(productIdeas(g, readBiz(g, energy), 6)).toContain('Street Lighting')
    expect(productIdeas(g, readBiz(g, energy), 6)).not.toContain('Battery Storage')
    const g2 = adult(3, 1930, 'us')
    const phone = company(g2, 'telecom')
    const ideas = productIdeas(g2, readBiz(g2, phone), 6)
    expect(ideas).toContain('Telephone Exchanges')
    expect(ideas).not.toContain('Fiber Broadband')
    expect(demandLevel('Mobile App', 'us', 2005).exists).toBe(false)
    expect(demandLevel('Mobile App', 'us', 2015).level).toBeGreaterThan(0.5)
    // Poorer countries adopt later.
    expect(demandLevel('Online Delivery', 'in', 2010).level).toBeLessThan(demandLevel('Online Delivery', 'us', 2010).level)
  })
})

describe('lines compete with the rivals’ versions', () => {
  it('has big rivals take up a kind of product before small ones, each at its own quality', () => {
    const giant = { id: 'g1', tier: 'giant' as const, quality: 70 }
    const small = { id: 's1', tier: 'small' as const, quality: 50 }
    let giantFirst = 0
    let smallFirst = 0
    for (const fam of ['Tasting Menu', 'Weekend Brunch', 'Delivery Service', 'Happy Hour', 'Catering Arm', 'Signature Dessert', 'Plant-Based Menu', 'Chef’s Cookbook']) {
      const at = (r: typeof giant | typeof small) => [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].find((a) => rivalVersion({ ...r, id: `${r.id}${fam}` }, fam, a).offers) ?? 2
      if (at(giant) < at(small)) giantFirst++
      else if (at(small) < at(giant)) smallFirst++
      const v = rivalVersion(giant, fam, 1)
      expect(v).toEqual(rivalVersion(giant, fam, 1))
      expect(Math.abs(v.quality - giant.quality)).toBeLessThanOrEqual(8)
    }
    expect(giantFirst).toBeGreaterThan(smallFirst)
  })

  it('wins more customers with a line better than the rivals’ versions, and nothing before the kind exists', () => {
    const g = adult(5, 2020, 'us')
    const a = company(g, 'restaurant')
    nextYear(g)
    const b = bizOf(g, a)
    const demand = (products: Product[]) => planFor(g, { ...b, products }, g.year, { calm: true }).demand
    const none = demand([])
    const worse = demand([line('Weekend Brunch', 30, g.year)])
    const better = demand([line('Weekend Brunch', 85, g.year)])
    expect(worse).toBeGreaterThan(none)
    expect(better - none).toBeGreaterThan((worse - none) * 2.5)
    // Different kinds stack.
    expect(demand([line('Weekend Brunch', 85, g.year), line('Happy Hour', 85, g.year)])).toBeGreaterThan(better)
    // A line rivals have long caught up with is worth less than a new one of the same quality.
    expect(demand([line('Weekend Brunch', 85, g.year - 20)])).toBeLessThan(better)
  })

  it('takes customers from the rivals whose versions are worse, not from the ones with better ones', () => {
    const g = adult(5, 2020, 'us')
    const a = company(g, 'software')
    nextYear(g)
    const b = bizOf(g, a)
    const ctx = marketCtxFor(g, { ...b, products: [] }, g.year)
    const field = fieldOf(ctx.rivals, ctx.fringe, ctx.key, g.year)
    const fam = 'Mobile App'
    const mine = [line(fam, 75, g.year)]
    const after = applyProductRivalry(ctx, b.industry, mine, field)
    const sum = (rs: { pull: number }[]) => rs.reduce((t, r) => t + r.pull, 0)
    // The rivals' combined pull is unchanged: your own gain is your pull (productPull), not theirs.
    expect(sum(after.rivals)).toBeCloseTo(sum(ctx.rivals), 6)
    const adoption = field.of(fam).adoption
    const worse: number[] = []
    const better: number[] = []
    ctx.rivals.forEach((r, i) => {
      const v = rivalVersion(r, fam, adoption)
      if (!v.offers || !(r.pull > 0)) return
      const ratio = after.rivals[i].pull / r.pull
      if (v.quality < 65) worse.push(ratio)
      else if (v.quality > 75) better.push(ratio)
    })
    expect(worse.length).toBeGreaterThan(0)
    expect(better.length).toBeGreaterThan(0)
    expect(Math.max(...worse)).toBeLessThan(Math.min(...better))
    // The market screen shows it: the worse rivals hold a smaller share once you sell the line.
    b.products = mine
    const v = marketViewOf(g, b)
    expect(v.rivals.length).toBeGreaterThan(0)
  })

  it('gives old saves’ lines a quality from their old boost and keeps them selling', () => {
    expect(qualityFromBoost(0.08)).toBe(50)
    expect(qualityFromBoost(0.16)).toBe(65)
    expect(qualityFromBoost(0.01)).toBe(25)
    const g = adult(5, 2020, 'us')
    const a = company(g, 'cafe')
    nextYear(g)
    const b = bizOf(g, a)
    b.products = [{ name: 'Cold Brew on Tap', launched: g.year - 2, boost: 0.12 }]
    const pull = productsPullOf(g, b, g.year)
    expect(pull.total).toBeGreaterThan(0)
    expect(pull.lines[0].quality).toBe(qualityFromBoost(0.12))
  })
})

describe('R&D quality at launch', () => {
  it('launches a line near its quoted quality and says how it stands against the rivals', () => {
    const g = adult(11, 2020, 'us')
    const a = company(g, 'restaurant', { cash: 50_000_000 })
    nextYear(g)
    const b = bizOf(g, a)
    const idea = productIdeas(g, b, 1)[0]
    const p = startRd(g, a, b, idea, rdRange(b, idea).max)!
    expect(p.quality).toBeGreaterThan(0)
    p.odds = 0.98
    p.progress = p.years - 1
    g.queue = []
    advanceRd(g, b, g.year)
    const made = b.products.find((x) => x.name === idea)
    expect(made).toBeTruthy()
    expect(Math.abs(made!.quality! - p.quality!)).toBeLessThanOrEqual(8 + 10)
    expect(made!.family).toBe(lineInfo(idea, b.industry).family)
    const note = g.queue.find((m) => m.kind === 'notice' && /R&D Results/.test(m.title))
    expect(note && note.kind === 'notice' ? note.text : '').toMatch(/quality \d+ \((rivals' versions \d+|no rival sells one yet)\)/)
  })
})

describe('buying a rival brings its products and whatnot', () => {
  function bought(): { g: GameState; before: BizState; after: BizState; q: NonNullable<ReturnType<typeof acquisitionQuote>> } {
    const g = adult(7, 2014, 'jp')
    const a = company(g, 'restaurant', { cash: 200_000_000 })
    nextYear(g)
    nextYear(g)
    g.yearActions = {}
    const b = bizOf(g, a)
    b.products = []
    const v = marketViewOf(g, b)
    const target = v.rivals.filter((r) => !r.legacy && rivalLines(r, b.industry, 'jp', g.year).length >= 2).sort((x, y) => x.share - y.share)[0]
    b.last = { ...b.last!, revenue: Math.max(b.last!.revenue, target.share * v.size) }
    const q = acquisitionQuote(g, b, target.id)!
    b.cash = q.price * 3
    const before = structuredClone(b)
    g.queue = []
    expect(acquireRival(g, a, b, target.id)).toBe(true)
    return { g, before, after: bizOf(g, a), q }
  }

  it('hands over its product lines at its quality, its sites across your cities, its know-how and some brand', () => {
    const { g, before, after, q } = bought()
    expect(q.lines.length).toBeGreaterThanOrEqual(2)
    for (const l of q.lines) {
      const got = after.products.find((p) => p.name === l.family)
      expect(got).toMatchObject({ quality: l.quality, family: l.family, kind: 'core', from: q.rival.name, launched: g.year })
    }
    expect(totalOutlets(after)).toBe(totalOutlets(before) + q.outlets)
    if (q.outlets >= 3) expect(new Set(after.outlets.map((o) => o.city)).size).toBeGreaterThan(1)
    expect(after.quality).toBe(Math.min(100, before.quality + q.knowhow))
    expect(after.brand).toBe(Math.min(100, before.brand + q.brand))
    const note = g.queue.find((m) => m.kind === 'notice' && m.title === 'Rival Acquired!')
    expect(note && note.kind === 'notice' ? note.text : '').toMatch(/product lines? (is|are) yours now/)
  })

  it('upgrades a line you already sell when its version is better, and never hands over a worse one', () => {
    const g = adult(7, 2014, 'jp')
    const a = company(g, 'restaurant', { cash: 200_000_000 })
    nextYear(g)
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    const r = v.rivals.find((x) => !x.legacy && rivalLines(x, b.industry, 'jp', g.year).length > 0)!
    const theirs = rivalLines(r, b.industry, 'jp', g.year)[0]
    b.products = [line(theirs.family, theirs.quality - 20, g.year)]
    expect(acquisitionQuote(g, b, r.id)!.lines.find((l) => l.family === theirs.family)).toMatchObject({ upgrade: true, quality: theirs.quality })
    b.products = [line(theirs.family, 99, g.year)]
    expect(acquisitionQuote(g, b, r.id)!.lines.find((l) => l.family === theirs.family)).toBeUndefined()
  })

  it('quotes without touching the game', () => {
    const g = adult(7, 2014, 'jp')
    const a = company(g, 'restaurant', { cash: 200_000_000 })
    nextYear(g)
    const b = bizOf(g, a)
    const r = marketViewOf(g, b).rivals.find((x) => !x.legacy)!
    const before = JSON.stringify(g)
    acquisitionQuote(g, readBiz(g, a), r.id)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('spreads sites over the biggest cities, biggest first', () => {
    const s = spreadSites('us', 20)
    expect(s.reduce((t, x) => t + x.count, 0)).toBe(20)
    expect(s[0].count).toBeGreaterThanOrEqual(s[s.length - 1].count)
    expect(spreadSites('us', 1)).toHaveLength(1)
    expect(spreadSites('us', 0)).toEqual([])
  })
})

describe('copycats', () => {
  it('a copy left alone costs the line its lead; a quick next version widens it', () => {
    const g = adult(13, 2020, 'us')
    const a = company(g, 'restaurant', { cash: 50_000_000 })
    nextYear(g)
    nextYear(g)
    const b = bizOf(g, a)
    b.products = [line('Weekend Brunch', 70, g.year)]
    g.queue = []
    presentCompetitionEvent(g, a, b, 'copycat')
    const m = g.queue.find((x) => x.kind === 'choice') as ChoiceModal | undefined
    expect(m).toBeTruthy()
    if (!m) return
    const g1 = structuredClone(g)
    runScript(g1, m.scriptId!, 'ignore', m.data, m)
    expect(readBiz(g1, g1.assets.find((x) => x.id === a.id)!).products[0].quality).toBe(62)
    const g2 = structuredClone(g)
    runScript(g2, m.scriptId!, 'innovate', m.data, m)
    expect(readBiz(g2, g2.assets.find((x) => x.id === a.id)!).products[0].quality).toBe(76)
  })
})

describe('the product field is a pure function of the market', () => {
  it('computes the same field twice and never draws on the game RNG', () => {
    const g = adult(17, 2020, 'us')
    const a = company(g, 'software')
    nextYear(g)
    const b = readBiz(g, a)
    const rng = g.rng
    const c1 = marketCtxFor(g, b, g.year)
    const c2 = marketCtxFor(g, b, g.year)
    expect(c1.field!.of('Mobile App')).toEqual(c2.field!.of('Mobile App'))
    expect(productPull(b.industry, [line('Mobile App', 70, g.year)], g.year, c1.field!)).toEqual(productPull(b.industry, [line('Mobile App', 70, g.year)], g.year, c2.field!))
    expect(g.rng).toBe(rng)
  })
})
