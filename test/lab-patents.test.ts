// Patents and licensing (R&D 3.0 task 5): who may patent a family, what filing costs and how long it shields,
// the shield through the field every reader shares (fieldOf and its market argument), one-way licensing and
// capped royalties, the book that fades and the expiry, and what a held patent does to the first-rival report
// of a breakthrough. Fixed seeds; restaurant is low tier, brewery mid, software high.
import { describe, expect, it, vi } from 'vitest'
import * as board from '../src/game/business/board'
import { marketKey } from '../src/game/business/competition-core'
import { bizWorth, marketCtxFor, valuationOf } from '../src/game/business/economy'
import { heavyArrival, heavyArrivals, heavyEligible, heavyGain, readHeavy } from '../src/game/business/heavy-rd'
import { INDUSTRIES } from '../src/game/business/industries'
import { BOOK_FADE, IP_SHARE, LICENSE_X, PATENT_AGE, PATENT_FEE_X, ROYALTY_CAP_X, SHIELD } from '../src/game/business/lab-data'
import { labMenus } from '../src/game/business/lab-menu'
import { licenseBlock, patentableFamilies, patentBlock, patentTerms, patentValue } from '../src/game/business/lab-rules'
import { fieldMarketOf, labValue, readLab, shieldsOf, type LabPatent } from '../src/game/business/lab-state'
import { LAB_LOG, LAB_SAY } from '../src/game/business/lab-text'
import { advanceLab, bookLabYear, doLicense, doPatent, fileLabPatent } from '../src/game/business/lab-year'
import * as productMarket from '../src/game/business/product-market'
import { applyProductRivalry, familiesOf, fieldFor, fieldOf, infoOf, lineInfo } from '../src/game/business/product-market'
import { productIdeas } from '../src/game/business/products'
import { rdQuote, rdReserve, rdValue, roundBudget } from '../src/game/business/rd'
import { bizOf, readBiz, type BizState } from '../src/game/business/state'
import { clampN, money } from '../src/game/business/util'
import { statementLines } from '../src/game/business/yearly'
import { marketOf, type Industry } from '../src/game/data/markets'
import { patentLaw } from '../src/game/workshop/market'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { deepFreeze, labGame, launchBreakthrough, noDraw, patchLab } from './lab-kit'
import { company, nextYear, renderAll } from './market-kit'

/** The money and the stored lab, as text: equal before and after means a refusal changed nothing. */
function snap(g: GameState, a: Asset): string {
  const b = readBiz(g, a)
  return JSON.stringify([b.cash, b.yearCosts, b.yearIncome, b.lab ?? null, b.rd, b.products, g.rng])
}

/** An own line of a family, as R&D would have launched it. */
function ownLine(b: BizState, family: string, launched: number): void {
  b.products.push({ name: family, launched, boost: 0, quality: 70, family, kind: 'core' })
}

/** A classic kind of product that rivals already sell in the company's market now (offer above 2%). */
function soldKind(g: GameState, b: BizState, skip: readonly string[] = []): string {
  const field = fieldFor(marketCtxFor(g, b, g.year))
  const family = familiesOf(b.industry).find((f) => !skip.includes(f) && field.of(f).exists && field.of(f).offer > 0.05 && !b.products.some((p) => infoOf(p, b.industry).family === f))
  if (!family) throw new Error('no kind that rivals sell')
  return family
}

/** A live patent as the engine stores it. */
function patent(over: Partial<LabPatent> & { family: string }): LabPatent {
  return { filed: 2030, until: 2036, mode: 'hold', lic: 0, plan: 400_000, book: 240_000, earned: 0, ...over }
}

function lines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

function rows(g: GameState, a: Asset): MenuNode[] {
  return (labMenus(a, readBiz(g, a))[0] as MenuGroup).children(g)
}

function actionOf(g: GameState, a: Asset, key: string): MenuAction | undefined {
  return rows(g, a).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.mkt.${key}.${a.id}`)
}

const slug = (family: string): string => family.toLowerCase().replace(/[^a-z0-9]+/g, '-')

describe('who may patent a family', () => {
  it('follows the tier and the rules [RF3]', () => {
    // low tier: a breakthrough passes, a classic recipe is refused for its tier
    {
      const { g, a, b } = labGame(60, 'restaurant', { country: 'ca' })
      const heavy = launchBreakthrough(g, a, b)
      expect(patentBlock(g, b, heavy)).toBeNull()
      const classic = soldKind(g, b)
      ownLine(b, classic, g.year)
      expect(patentBlock(g, b, classic)).toBe(LAB_SAY.lowTier(classic))
    }
    // mid and high: the same classic family is refused for novelty, not for tier
    for (const industry of ['brewery', 'software'] as const) {
      const { g, a, b } = labGame(61, industry, { country: 'ca' })
      const classic = soldKind(g, b)
      ownLine(b, classic, g.year)
      expect(patentBlock(g, b, classic), industry).toBe(LAB_SAY.notNovel(classic))
      expect(patentBlock(g, b, launchBreakthrough(g, a, b)), industry).toBeNull()
    }
    // the order of the reasons, on a mid company
    const { g, a, b } = labGame(62, 'brewery', { country: 'ca' })
    const heavy = launchBreakthrough(g, a, b)
    const classic = soldKind(g, b)
    ownLine(b, classic, g.year)
    const cost = patentTerms(g, b, heavy).fee + rdReserve(b)
    expect(patentBlock(g, b, heavy)).toBeNull()
    // no own line: a family the company never sold, then a bought line, then a line launched 4 years ago
    expect(patentBlock(g, b, 'Nothing Sold Here')).toBe(LAB_SAY.noOwnLine(String(PATENT_AGE)))
    expect(patentBlock(g, b, '')).toBe(LAB_SAY.noOwnLine(String(PATENT_AGE)))
    b.products.push({ name: 'Bought Kind', launched: g.year, boost: 0, quality: 70, family: 'Bought Kind', kind: 'core', from: 'A Rival' })
    expect(patentBlock(g, b, 'Bought Kind')).toBe(LAB_SAY.noOwnLine(String(PATENT_AGE)))
    ownLine(b, 'Old Kind', g.year - PATENT_AGE - 1)
    expect(patentBlock(g, b, 'Old Kind')).toBe(LAB_SAY.noOwnLine(String(PATENT_AGE)))
    // a breakthrough launched exactly PATENT_AGE years ago is still patentable
    const recent = launchBreakthrough(g, a, b, 1)
    b.products.find((p) => p.family === recent)!.launched = g.year - PATENT_AGE
    expect(patentBlock(g, b, recent)).toBeNull()
    b.products.find((p) => p.family === recent)!.launched = g.year - PATENT_AGE - 1
    expect(patentBlock(g, b, recent)).toBe(LAB_SAY.noOwnLine(String(PATENT_AGE)))
    b.products = b.products.filter((p) => p.family !== recent)
    // cash short by one dollar, then exactly enough
    b.cash = cost - 1
    expect(patentBlock(g, b, heavy)).toBe(LAB_SAY.patentCash(money(cost), money(1)))
    expect(patentBlock(g, b, heavy, true)).toBeNull()
    b.cash = cost
    expect(patentBlock(g, b, heavy)).toBeNull()
    // once per family
    patchLab(b, (d) => {
      d.filed.push(heavy)
    })
    expect(patentBlock(g, b, heavy)).toBe(LAB_SAY.alreadyFiled(heavy))
    // a seventh patent: six live ones
    patchLab(b, (d) => {
      d.filed = []
      d.patents = Array.from({ length: 6 }, (_, i) => patent({ family: `Held ${i}`, filed: g.year, until: g.year + 5 }))
    })
    expect(patentBlock(g, b, heavy)).toBe(LAB_SAY.patentsFull('6'))
    // not a product company
    const deep = labGame(62, 'aiLab')
    expect(patentBlock(deep.g, deep.b, 'Anything')).toBe(LAB_SAY.patentNotEligible())
    // a name that is no family at all is refused, not looked up on a prototype
    for (const bad of ['__proto__', 'constructor']) expect(patentBlock(g, b, bad)).not.toBeNull()
  })

  it('lists the own lines of the last three years, newest first, at most six', () => {
    const { g, b } = labGame(63, 'brewery', { country: 'ca' })
    b.products = []
    expect(patentableFamilies(g, b)).toEqual([])
    for (let i = 0; i < 8; i++) ownLine(b, `Kind ${i}`, g.year - (i % 4))
    b.products.push({ name: 'Bought', launched: g.year, boost: 0, quality: 60, family: 'Bought', kind: 'core', from: 'Rival' })
    b.products.push({ name: 'Kind 0 Pro', launched: g.year - 2, boost: 0, quality: 60, family: 'Kind 0', kind: 'premium' })
    const list = patentableFamilies(g, b)
    expect(list).toHaveLength(6)
    expect(list.slice(0, 2).sort()).toEqual(['Kind 0', 'Kind 4'])
    const years = list.map((f) => Math.max(...b.products.filter((p) => p.family === f && !p.from).map((p) => p.launched)))
    expect(years).toEqual([...years].sort((x, y) => y - x))
    expect(list).not.toContain('Bought')
    expect(list.every((f) => b.products.some((p) => p.family === f && g.year - p.launched <= PATENT_AGE))).toBe(true)
    // a line launched next year is not on sale yet
    b.products = []
    ownLine(b, 'Coming', g.year + 1)
    expect(patentableFamilies(g, b)).toEqual([])
  })
})

describe('terms', () => {
  it('follow the formulas for three countries', () => {
    for (const country of ['us', 'de', 'jp']) {
      const { g, a, b } = labGame(5, 'brewery', { country })
      const fam = launchBreakthrough(g, a, b)
      const t = patentTerms(g, b, fam)
      const law = patentLaw(country, g.year)
      expect(t.plan).toBe(2_000_000)
      expect(t.fee).toBe(roundBudget(PATENT_FEE_X * t.plan) + law.fee)
      expect(t.years).toBe(Math.max(2, Math.round(SHIELD.mid * law.enforcement)))
      expect(t.until).toBe(g.year + t.years)
      expect(t.book).toBe(Math.round(IP_SHARE * t.plan))
      expect(t.book).toBeLessThanOrEqual(t.plan)
      b.cash *= 1000
      expect(patentTerms(g, b, fam)).toEqual(t)
    }
  })

  it('give a classic family its ordinary development price and never ignore the tier', () => {
    const { g, b } = labGame(6, 'software', { country: 'us' })
    const fam = soldKind(g, b)
    const t = patentTerms(g, b, fam)
    expect(t.plan).toBe(rdQuote(g, b, fam, 1).cost)
    expect(t.years).toBe(Math.max(2, Math.round(SHIELD.high * patentLaw('us', g.year).enforcement)))
    const low = labGame(6, 'restaurant', { country: 'us' })
    const f2 = soldKind(low.g, low.b)
    expect(patentTerms(low.g, low.b, f2).years).toBe(Math.max(2, Math.round(SHIELD.low * patentLaw('us', low.g.year).enforcement)))
  })

  it('are finite and inside their caps for every country and year [RF4]', () => {
    for (const country of ['us', 'de', 'jp', 'ca', 'zz', 'in', 'ng']) {
      for (const year of [1900, 2030, 2100]) {
        const { g, a, b } = labGame(7, 'brewery', { country, year })
        g.year = year
        const fam = launchBreakthrough(g, a, b)
        const t = patentTerms(g, b, fam)
        for (const n of [t.plan, t.fee, t.years, t.until, t.book]) expect(Number.isFinite(n), `${country} ${year}`).toBe(true)
        expect(t.years).toBeGreaterThanOrEqual(2)
        expect(t.years).toBeLessThanOrEqual(Math.max(2, SHIELD.mid))
        expect(t.book).toBeLessThanOrEqual(t.plan)
        expect(t.fee).toBeGreaterThan(0)
      }
    }
  })
})

describe('extremes [RF4]', () => {
  it('every trade and a spread of years price, test and value a patent with finite numbers', () => {
    for (const trade of Object.keys(INDUSTRIES) as Industry[]) {
      const { g, b } = labGame(9, trade, { country: 'us' })
      if (!heavyEligible(b)) {
        expect(patentBlock(g, b, 'Anything'), trade).toBe(LAB_SAY.patentNotEligible())
        continue
      }
      const family = familiesOf(trade).find((f) => fieldFor(marketCtxFor(g, b, g.year)).of(f).exists) ?? familiesOf(trade)[0]
      ownLine(b, family, g.year)
      const t = patentTerms(g, b, family)
      for (const n of [t.plan, t.fee, t.years, t.until, t.book]) expect(Number.isFinite(n), trade).toBe(true)
      expect(t.plan, trade).toBeGreaterThan(0)
      expect(t.book, trade).toBeLessThanOrEqual(t.plan)
      expect(patentBlock(g, b, family), trade).toSatisfy((x: string | null) => x === null || typeof x === 'string')
      const v = patentValue(g, b, family)
      for (const n of [v.value, v.hold, v.license, v.fee]) expect(Number.isFinite(n), trade).toBe(true)
      expect(v.license, trade).toBeGreaterThanOrEqual(0)
      expect(v.value).toBeCloseTo(Math.max(v.hold, v.license) - v.fee, 6)
    }
  }, 180_000)

  it('1900 to 2100: nothing throws and nothing is infinite', () => {
    for (const year of [1900, 1950, 2100]) {
      const { g, a, b } = labGame(9, 'brewery', { country: 'de', year })
      g.year = year
      const fam = launchBreakthrough(g, a, b)
      const t = patentTerms(g, b, fam)
      const v = patentValue(g, b, fam)
      expect(Number.isFinite(t.fee + t.until + v.value), `${year}`).toBe(true)
      const free = fieldFor(marketCtxFor(g, b, year))
      expect(Number.isFinite(free.of(fam).offer), `${year}`).toBe(true)
    }
  }, 120_000)

  it('a damaged lab holds no more than six shields, all sane [RF1]', () => {
    const { g, b } = labGame(9, 'brewery', { country: 'ca' })
    const junk: unknown[] = [7, 'x', [], null, { patents: 'x' }, { patents: [1, null, { family: 3 }, { family: 'A', filed: 'x', until: 2040 }] }]
    for (const lab of junk) {
      const damaged = { lab: lab as never }
      expect(shieldsOf(damaged), JSON.stringify(lab)).toEqual([])
      expect(fieldMarketOf({ ...damaged, industry: 'brewery' }).shield).toEqual([])
    }
    patchLab(b, (d) => {
      d.patents = Array.from({ length: 1000 }, (_, i) => patent({ family: `Kind ${i}`, filed: g.year, until: g.year + 3 }))
    })
    expect(shieldsOf(b)).toHaveLength(6)
    for (const x of shieldsOf(b)) expect(Number.isFinite(x.until)).toBe(true)
  })
})

describe('the shield', () => {
  it('delays rivals through fieldOf and changes the key', () => {
    const { g, b } = labGame(64, 'brewery', { country: 'ca' })
    const c = marketCtxFor(g, b, g.year)
    const fam = soldKind(g, b)
    const until = g.year + 5
    const shield = [{ family: fam, until }]
    const open = fieldOf(c.rivals, c.fringe, c.key, g.year, undefined, { industry: b.industry })
    const held = fieldOf(c.rivals, c.fringe, c.key, g.year, undefined, { industry: b.industry, shield })
    expect(held).not.toBe(open)
    expect(open.of(fam).offer).toBeGreaterThan(0.05)
    for (let y = g.year; y < until; y++) {
      const f = fieldOf(c.rivals, c.fringe, c.key, y, undefined, { industry: b.industry, shield })
      const o = fieldOf(c.rivals, c.fringe, c.key, y, undefined, { industry: b.industry })
      expect(f.of(fam).offer, `${y}`).toBe(0)
      expect(f.of(fam).quality).toBe(50)
      expect(f.versions(fam).length).toBe(c.rivals.length)
      expect(f.versions(fam).every((v) => v === -1)).toBe(true)
      expect(f.of(fam).exists).toBe(o.of(fam).exists)
      expect(f.of(fam).level).toBe(o.of(fam).level)
      expect(f.of(fam).adoption).toBe(o.of(fam).adoption)
      // another kind is not touched
      const other = familiesOf(b.industry).find((x) => x !== fam && o.of(x).offer > 0.05)!
      expect(f.of(other)).toEqual(o.of(other))
    }
    // from `until` on it is the open field
    const after = fieldOf(c.rivals, c.fringe, c.key, until, undefined, { industry: b.industry, shield })
    const plain = fieldOf(c.rivals, c.fringe, c.key, until, undefined, { industry: b.industry })
    expect(after.of(fam)).toEqual(plain.of(fam))
    expect(after.versions(fam)).toEqual(plain.versions(fam))
    // the key: shields in any order are one field; another family or date is another
    const two = fieldOf(c.rivals, c.fringe, c.key, g.year, undefined, { industry: b.industry, shield: [{ family: 'A', until: 1 }, { family: 'B', until: 2 }] })
    expect(fieldOf(c.rivals, c.fringe, c.key, g.year, undefined, { industry: b.industry, shield: [{ family: 'B', until: 2 }, { family: 'A', until: 1 }] })).toBe(two)
    expect(fieldOf(c.rivals, c.fringe, c.key, g.year, undefined, { industry: b.industry, shield: [{ family: 'A', until: 1 }, { family: 'B', until: 3 }] })).not.toBe(two)
    expect(fieldOf(c.rivals, c.fringe, c.key, g.year, undefined, { industry: 'software', shield: [] })).not.toBe(fieldOf(c.rivals, c.fringe, c.key, g.year, undefined, { industry: b.industry, shield: [] }))
    // the field keeps its own copy of the shields
    const mine = [{ family: fam, until }]
    const copy = fieldOf(c.rivals, c.fringe, c.key, g.year + 1, undefined, { industry: b.industry, shield: mine })
    mine[0].until = 1
    expect(copy.of(fam).offer).toBe(0)
    // without any market it is the v3.0.0 field, shared as ever
    const bare = fieldOf(c.rivals, c.fringe, c.key, g.year)
    expect(fieldOf(c.rivals, c.fringe, c.key, g.year)).toBe(bare)
    expect(bare).not.toBe(open)
    expect(bare.market).toBeUndefined()
    expect(bare.of(fam).offer).toBeGreaterThan(0.05)
  })

  it('comes from a patent through shieldsOf and fieldMarketOf', () => {
    const { g, b } = labGame(65, 'brewery', { country: 'ca' })
    // no lab: one shared frozen empty list
    expect(shieldsOf(b)).toEqual([])
    expect(Object.isFrozen(shieldsOf(b))).toBe(true)
    expect(shieldsOf(b)).toBe(shieldsOf({}))
    expect(fieldMarketOf(b)).toEqual({ industry: 'brewery', shield: [] })
    const fam = soldKind(g, b)
    const other = soldKind(g, b, [fam])
    patchLab(b, (d) => {
      d.patents = [patent({ family: fam, filed: g.year, until: g.year + 5 }), patent({ family: other, filed: g.year, until: g.year + 5, mode: 'license', lic: g.year + 1 })]
    })
    expect(shieldsOf(b)).toEqual([{ family: fam, until: g.year + 5 }, { family: other, until: g.year + 1 }])
    expect(shieldsOf(b)).toBe(shieldsOf(b))
    expect(Object.isFrozen(shieldsOf(b))).toBe(true)
    expect(fieldMarketOf(b)).toEqual({ industry: 'brewery', shield: shieldsOf(b) })
    // marketCtxFor carries it: the held family is not offered by rivals, the licensed one is open from its first year
    const now = fieldFor(marketCtxFor(g, b, g.year))
    expect(now.of(fam).offer).toBe(0)
    expect(now.of(other).offer).toBe(0)
    // the field keeps its own copy, in family order
    expect(now.market).toEqual({ industry: 'brewery', shield: [{ family: fam, until: g.year + 5 }, { family: other, until: g.year + 1 }].sort((x, y) => (x.family < y.family ? -1 : 1)) })
    const next = fieldFor(marketCtxFor(g, b, g.year + 1))
    expect(next.of(fam).offer).toBe(0)
    expect(next.of(other).offer).toBeGreaterThan(0.05)
    // a pure read: no draw
    expect(noDraw(g, () => marketCtxFor(g, b, g.year + 2))).toBe(true)
  })

  it('is passed by every fieldOf call outside product-market', () => {
    const { g, b } = labGame(66, 'brewery', { country: 'ca' })
    const ctx = marketCtxFor(g, b, g.year)
    // a bare context gets the market with the industry
    const bare = { ...ctx, field: undefined }
    expect(fieldFor(bare).market).toEqual({ industry: 'brewery' })
    expect(fieldFor(ctx).market).toEqual({ industry: 'brewery' })
    const spy = vi.spyOn(productMarket, 'fieldOf')
    try {
      const idea = productIdeas(g, b, 1)[0]
      const fresh = marketCtxFor(g, b, g.year + 3)
      expect(fieldFor(fresh).market?.industry).toBe('brewery')
      const fromMarket = spy.mock.calls.filter((x) => x[5]?.industry === 'brewery').length
      expect(fromMarket).toBeGreaterThan(0)
      expect(spy.mock.calls.every((x) => x[5]?.industry === 'brewery')).toBe(true)
      spy.mockClear()
      rdQuote(g, b, idea, 20_000)
      expect(spy.mock.calls.length).toBeGreaterThan(0)
      expect(spy.mock.calls.every((x) => x[5]?.industry === 'brewery')).toBe(true)
      spy.mockClear()
      rdValue(g, b, idea, 20_000)
      expect(spy.mock.calls.length).toBeGreaterThan(0)
      expect(spy.mock.calls.every((x) => x[5]?.industry === 'brewery')).toBe(true)
      spy.mockClear()
      heavyGain(g, b, 'Anything Heavy')
      expect(spy.mock.calls.length).toBeGreaterThan(0)
      expect(spy.mock.calls.every((x) => x[5]?.industry === 'brewery')).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('reaches the planner: a patent lifts a quote and a value for the held kind, and rivalry reads the same field', () => {
    const { g, b } = labGame(67, 'brewery', { country: 'ca' })
    const idea = productIdeas(g, b, 6).find((x) => !b.products.some((p) => infoOf(p, b.industry).family === lineInfo(x, b.industry).family))!
    const family = lineInfo(idea, b.industry).family
    expect(familiesOf(b.industry)).toContain(family)
    const budget = 30_000
    const plainQuote = rdQuote(g, b, idea, budget)
    const plainValue = rdValue(g, b, idea, budget).value
    patchLab(b, (d) => {
      d.patents = [patent({ family, filed: g.year, until: g.year + 8 })]
    })
    expect(rdQuote(g, b, idea, budget).lift).toBeGreaterThan(plainQuote.lift)
    expect(rdValue(g, b, idea, budget).value).toBeGreaterThan(plainValue)
    // applyProductRivalry: its default field, its own path (a copied rivals array) and fieldFor(ctx) agree
    ownLine(b, family, g.year)
    const ctx = marketCtxFor(g, b, g.year)
    const viaField = applyProductRivalry(ctx, b.industry, b.products, fieldFor(ctx))
    const viaDefault = applyProductRivalry(ctx, b.industry, b.products)
    const copied = { ...ctx, rivals: [...ctx.rivals] }
    const viaOwn = applyProductRivalry(copied, b.industry, b.products, fieldFor(ctx))
    expect(viaDefault.rivals).toEqual(viaField.rivals)
    expect(viaOwn.rivals).toEqual(viaField.rivals)
    // and the shield really is in it: without the patent the rivals are split another way
    const free = JSON.parse(JSON.stringify(b)) as BizState
    delete free.lab
    const open = marketCtxFor(g, free, g.year)
    expect(applyProductRivalry(open, b.industry, b.products).rivals).not.toEqual(viaField.rivals)
  })
})

describe('filing', () => {
  it('takes the fee once, stores the patent and the family, and fades the book on the books [RF2]', () => {
    const { g, a, b } = labGame(68, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    const t = patentTerms(g, b, fam)
    const cash = b.cash
    const costs = b.yearCosts
    expect(noDraw(g, () => expect(fileLabPatent(g, a, b, fam, 'hold', true)).not.toBeNull())).toBe(true)
    expect(b.cash).toBe(cash - t.fee)
    expect(b.yearCosts).toBe(costs + t.fee)
    expect(readLab(b).patents).toEqual([{ family: fam, filed: g.year, until: t.until, mode: 'hold', lic: 0, plan: t.plan, book: t.book, earned: 0 }])
    expect(readLab(b).filed).toEqual([fam])
    expect(lines(g).some((x) => x === LAB_LOG.patented(a.name, fam))).toBe(true)
    // the CEO's path pays through the board budget: no second payment, and a second filing is refused
    const again = snap(g, a)
    expect(fileLabPatent(g, a, b, fam, 'hold', false)).toBeNull()
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'R&D')).toBe(true)
    expect(snap(g, a)).toBe(again)
    // a patent filed straight as a licence starts licensing next year
    const second = launchBreakthrough(g, a, b, 1)
    b.cash = cash
    const before = b.cash
    expect(fileLabPatent(g, a, b, second, 'license', false)?.lic).toBe(g.year + 1)
    expect(b.cash).toBe(before)
    expect(readLab(b).patents.map((p) => p.mode)).toEqual(['hold', 'license'])
  })

  it('names the owner only when the owner did it', () => {
    const { g, a, b } = labGame(69, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    g.queue = []
    expect(doPatent(g, a, fam)).toBe(true)
    const note = g.queue.find((m) => m.kind === 'notice' && m.title === 'Patent Filed')
    expect(note).toBeDefined()
    expect(note && 'text' in note ? note.text : '').toContain(fam)
    const x = labGame(69, 'brewery', { country: 'ca' })
    const fam2 = launchBreakthrough(x.g, x.a, x.b)
    x.g.queue = []
    expect(fileLabPatent(x.g, x.a, x.b, fam2, 'hold', false)).not.toBeNull()
    expect(x.g.queue.some((m) => m.kind === 'notice' && m.title === 'Patent Filed')).toBe(false)
  })
})

describe('licensing and royalties', () => {
  it('is one way, and royalties need rivals that sell [RF2]', () => {
    const { g, a, b } = labGame(71, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    expect(doPatent(g, a, fam)).toBe(true)
    expect(doLicense(g, a, fam)).toBe(true)
    expect(doLicense(g, a, fam)).toBe(false)
    expect(licenseBlock(g, b, fam)).toBe(LAB_SAY.alreadyLicensed(fam))
    const pat = readLab(b).patents[0]
    expect([pat.mode, pat.lic]).toEqual(['license', g.year + 1])
    expect(lines(g).filter((x) => x === LAB_LOG.licensed(a.name, fam))).toHaveLength(1)
    const start = g.year
    let total = 0
    let paidYears = 0
    for (let n = 1; n <= 30; n++) {
      g.year += 1
      const fiscal = g.year - 1
      const before = readLab(b).patents.find((p) => p.family === fam)
      bookLabYear(g, a, b, fiscal)
      const once = JSON.stringify(b)
      const rng = g.rng
      bookLabYear(g, a, b, fiscal)
      expect(JSON.stringify(b), `year ${fiscal} replayed`).toBe(once)
      expect(g.rng).toBe(rng)
      const f = fieldFor(marketCtxFor(g, b, fiscal)).of(fam)
      const live = before !== undefined && before.lic <= fiscal && fiscal < before.until
      const expected = live && before ? Math.min(ROYALTY_CAP_X * before.plan - before.earned, Math.round(LICENSE_X * before.plan * f.offer * f.level)) : 0
      const royalty = readLab(b).ledger.find((r) => r.year === fiscal)?.royalty ?? 0
      expect(royalty, `year ${fiscal}`).toBe(expected)
      if (f.offer === 0) expect(royalty).toBe(0)
      if (royalty > 0) paidYears++
      total += royalty
      if (before && fiscal < before.lic) expect(royalty).toBe(0)
      advanceLab(g, b, fiscal)
    }
    expect(paidYears).toBeGreaterThan(0)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(ROYALTY_CAP_X * pat.plan)
    // none from `until`: the patent is gone by then and the family stays filed
    expect(readLab(b).patents).toEqual([])
    expect(readLab(b).filed).toEqual([fam])
    expect(pat.until).toBeLessThanOrEqual(start + 7)
    expect(lines(g).filter((x) => x.includes('earned its first'))).toHaveLength(1)
    expect(lines(g).filter((x) => x === LAB_LOG.expired(a.name, fam))).toHaveLength(1)
  })

  it('pays what is left of the cap and no more', () => {
    const { g, a, b } = labGame(72, 'brewery', { country: 'ca' })
    const fam = soldKind(g, b)
    patchLab(b, (d) => {
      d.patents = [patent({ family: fam, filed: g.year - 1, until: g.year + 4, mode: 'license', lic: g.year, plan: 400_000, earned: ROYALTY_CAP_X * 400_000 - 1_000 })]
    })
    g.year += 1
    const fiscal = g.year - 1
    const f = fieldFor(marketCtxFor(g, b, fiscal)).of(fam)
    expect(Math.round(LICENSE_X * 400_000 * f.offer * f.level)).toBeGreaterThan(1_000)
    const cash = b.cash
    bookLabYear(g, a, b, fiscal)
    expect(readLab(b).ledger.find((r) => r.year === fiscal)?.royalty).toBe(1_000)
    expect(b.cash).toBe(cash + 1_000)
    expect(readLab(b).patents[0].earned).toBe(ROYALTY_CAP_X * 400_000)
    // the cap is spent: the next year pays nothing
    g.year += 1
    bookLabYear(g, a, b, g.year - 1)
    expect(readLab(b).ledger.find((r) => r.year === g.year - 1)).toBeUndefined()
  })

  it('shows on the annual report and is booked as income [RF2]', () => {
    const { g, b } = labGame(73, 'brewery', { country: 'ca' })
    const fam = soldKind(g, b)
    patchLab(b, (d) => {
      d.patents = [patent({ family: fam, filed: g.year - 1, until: g.year + 4, mode: 'license', lic: g.year, plan: 400_000 })]
    })
    const fiscal = g.year
    nextYear(g)
    const row = readLab(b).ledger.find((r) => r.year === fiscal)!
    expect(row.royalty).toBeGreaterThan(0)
    expect(readLab(b).patents[0].earned).toBe(row.royalty)
    const s = b.last!
    expect(s.year).toBe(fiscal)
    const shown = statementLines(b, s)
    expect(shown.find((l) => l.label === 'Patent licences')?.value).toBe(money(row.royalty))
    // the royalty is income of that year and nothing else claims it: it is inside the statement's other income
    expect(s.otherIncome).toBeGreaterThanOrEqual(row.royalty)
  }, 120_000)

  it('is left out of the earnings the valuation capitalizes', () => {
    const { b } = labGame(74, 'brewery', { country: 'ca' })
    const profit = 2_000_000
    const royalty = 300_000
    const years = [b.last!.year - 2, b.last!.year - 1, b.last!.year]
    const history = (p: number) => years.map((year) => ({ year, revenue: 1_000_000, profit: p, tax: 0, units: 1000, price: 10, staff: 5, valuation: 0, outlets: 1 }))
    b.history = history(profit)
    const without = JSON.parse(JSON.stringify(b)) as BizState
    const keep = 1 - clampN(marketOf(b.countryId).corporateTax, 0, 0.9)
    without.history = history(profit - royalty * keep)
    patchLab(b, (d) => {
      d.ledger = years.map((year) => ({ year, credit: 0, grant: 0, royalty, payroll: 0 }))
    })
    expect(Math.abs(valuationOf(b) - valuationOf(without))).toBeLessThanOrEqual(1)
  })
})

describe('the book and the expiry', () => {
  it('fades 10% a year, adds exactly its book to the valuation and ends on time', () => {
    const { g, a, b } = labGame(75, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    expect(doPatent(g, a, fam)).toBe(true)
    b.history = []
    const plain = JSON.parse(JSON.stringify(b)) as BizState
    delete plain.lab
    const t = readLab(b).patents[0]
    expect(labValue(b)).toBe(t.book)
    expect(valuationOf(b) - valuationOf(plain)).toBeCloseTo(labValue(b), 0)
    let book = t.book
    let fiscal = g.year
    let steps = 0
    while (readLab(b).patents.length) {
      const live = fiscal + 1 < t.until
      advanceLab(g, b, fiscal)
      steps++
      const left = readLab(b).patents
      if (live) {
        book = Math.round(book * BOOK_FADE)
        expect(left[0].book, `fiscal ${fiscal}`).toBe(book)
      } else expect(left).toEqual([])
      expect(valuationOf(b) - valuationOf(plain), `fiscal ${fiscal}`).toBeCloseTo(labValue(b), 0)
      // a replay of the same year changes nothing
      const json = JSON.stringify(b.lab)
      advanceLab(g, b, fiscal)
      expect(JSON.stringify(b.lab)).toBe(json)
      fiscal++
      expect(steps).toBeLessThan(20)
    }
    // dropped in the year whose end is the first without the shield, never earlier
    expect(fiscal - 1 + 1).toBe(t.until)
    expect(labValue(b)).toBe(0)
    expect(readLab(b).filed).toEqual([fam])
    expect(lines(g).filter((x) => x === LAB_LOG.expired(a.name, fam))).toHaveLength(1)
    expect(patentBlock(g, b, fam)).toBe(LAB_SAY.alreadyFiled(fam))
    expect(valuationOf(b)).toBeCloseTo(valuationOf(plain), 0)
  })

  it('draws nothing and holds no program', () => {
    const { g, a, b } = labGame(76, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    expect(doPatent(g, a, fam)).toBe(true)
    expect(noDraw(g, () => advanceLab(g, b, g.year))).toBe(true)
    expect(readLab(b).programs).toEqual([])
  })
})

describe('a held breakthrough', () => {
  it('holds back the first-rival report and the lead date until the shield ends', () => {
    const { g, a, b } = labGame(77, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    const rec = readHeavy(g, b.industry, marketKey(b))[0]
    // a second company of the same market, with no lab of its own
    const second = company(g, 'brewery', { name: 'Second Brewery' })
    const b2 = bizOf(g, second)
    expect(b2.lab).toBeUndefined()
    const sees = (): string[] => renderAll(g, a).filter((x) => x.includes('rivals can have their own from about'))
    const leadBefore = sees()
    expect(leadBefore.length).toBeGreaterThan(0)
    expect(leadBefore[0]).toContain(`from about ${rec.year + 4}`)
    expect(doPatent(g, a, fam)).toBe(true)
    const until = readLab(b).patents[0].until
    const rivals = marketCtxFor(g, b, until).rivals.filter((x) => !x.legacy && x.pull > 0 && !x.id.startsWith('owned:'))
    const arrives = Math.min(...rivals.map((x) => heavyArrival(rec, x)))
    // the test is not vacuous: without the shield a rival would be reported before it ends
    expect(arrives).toBeLessThan(until)
    // the Products row names no year before the shield ends
    const after = sees()
    expect(after.length).toBeGreaterThan(0)
    for (const line of after) expect(Number(/from about (\d+)/.exec(line)?.[1])).toBeGreaterThanOrEqual(until)
    // nothing is reported by either company before then
    for (let year = rec.year + 1; year + 1 < until; year++) {
      heavyArrivals(g, b, year)
      heavyArrivals(g, b2, year)
      expect(readHeavy(g, b.industry, marketKey(b))[0].rival, `year ${year}`).toBeUndefined()
      expect(lines(g).some((x) => x.includes('launches its own')), `year ${year}`).toBe(false)
    }
    // the report comes at the first year whose new year is the first without the shield
    heavyArrivals(g, b2, until - 1)
    expect(readHeavy(g, b.industry, marketKey(b))[0].rival).toBeDefined()
    expect(lines(g).filter((x) => x.includes('launches its own'))).toHaveLength(1)
  }, 120_000)

  it('is reported at once for a family nobody holds', () => {
    const { g, a, b } = labGame(77, 'brewery', { country: 'ca' })
    launchBreakthrough(g, a, b)
    const rec = readHeavy(g, b.industry, marketKey(b))[0]
    const rivals = marketCtxFor(g, b, rec.year + 8).rivals.filter((x) => !x.legacy && x.pull > 0 && !x.id.startsWith('owned:'))
    const arrives = Math.min(...rivals.map((x) => heavyArrival(rec, x)))
    heavyArrivals(g, b, arrives - 1)
    expect(readHeavy(g, b.industry, marketKey(b))[0].rival).toBeDefined()
  })
})

describe('what a patent is worth', () => {
  it('is pure and names the better mode', () => {
    const { g, a, b } = labGame(78, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    const w = bizWorth(g, b)
    const json = JSON.stringify(b)
    expect(noDraw(g, () => patentValue(g, b, fam, w))).toBe(true)
    expect(JSON.stringify(b)).toBe(json)
    const v = patentValue(g, b, fam, w)
    expect(v.fee).toBe(patentTerms(g, b, fam).fee)
    expect(v.value).toBeCloseTo(Math.max(v.hold, v.license) - v.fee, 6)
    expect(v.mode).toBe(v.license > v.hold ? 'license' : 'hold')
    expect(Number.isFinite(v.value)).toBe(true)
    // the shield on a novel line of its own is worth more than the royalties on it
    expect(v.hold).toBeGreaterThan(0)
    expect(v.mode).toBe('hold')
    // a kind rivals already sell, with no line of ours: nothing to hold, royalties to collect
    const classic = soldKind(g, b)
    const r = patentValue(g, b, classic, w)
    expect(r.hold).toBeCloseTo(0, 6)
    expect(r.license).toBeGreaterThan(0)
    expect(r.mode).toBe('license')
    expect(r.value).toBeCloseTo(r.license - r.fee, 6)
    // a frozen state reads without throwing
    const frozen = deepFreeze(structuredClone(g))
    const fa = frozen.assets.find((x) => x.id === a.id)!
    expect(() => patentValue(frozen, readBiz(frozen, fa), fam)).not.toThrow()
    expect(patentValue(frozen, readBiz(frozen, fa), fam).value).toBeCloseTo(v.value, 4)
  })
})

describe('the actions', () => {
  it('refuse without the right to, and ask the board [RF3]', () => {
    const { g, a, b } = labGame(80, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    const before = snap(g, a)
    const refused = (what: string) => {
      expect(doPatent(g, a, fam), what).toBe(false)
      expect(snap(g, a), what).toBe(before)
    }
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    refused('prison')
    g.character.prison = null
    g.character.age = 17
    refused('age 17')
    g.character.age = 31
    a.details.share = 0
    refused('no stake')
    delete a.details.share
    expect(doPatent(g, { ...a, id: 'not-mine' }, fam)).toBe(false)
    for (const bad of ['nope', '', '__proto__']) expect(doPatent(g, a, bad), bad).toBe(false)
    expect(snap(g, a)).toBe(before)
    // cash short by one dollar: nothing charged, nothing drawn
    const t = patentTerms(g, b, fam)
    const need = t.fee + rdReserve(b)
    const cash = b.cash
    b.cash = need - 1
    const short = snap(g, a)
    expect(doPatent(g, a, fam)).toBe(false)
    expect(snap(g, a)).toBe(short)
    b.cash = cash
    // the vote
    const value = patentValue(g, b, fam)
    const spy = vi.spyOn(board, 'boardAllows').mockReturnValue(false)
    try {
      expect(doPatent(g, a, fam)).toBe(false)
      expect(snap(g, a)).toBe(before)
      expect(spy).toHaveBeenCalledTimes(1)
      const [, asked, askedBiz, proposal] = spy.mock.calls[0]
      expect(asked.id).toBe(a.id)
      expect(askedBiz).toBeTruthy()
      expect(proposal).toMatchObject({ kind: 'capex', by: 'owner', amount: t.fee })
      expect(proposal.gain).toBeCloseTo(Math.max(0, (value.value + t.fee) / 5), 6)
      expect(proposal.label).toContain(fam)
      expect(readLab(b).patents).toEqual([])
      spy.mockReturnValue(true)
      expect(doPatent(g, a, fam)).toBe(true)
      expect(readLab(b).patents).toHaveLength(1)
      // a licence spends nothing, so it asks no vote
      spy.mockClear()
      const held = snap(g, a)
      for (const bad of ['nope', '', fam + ' x']) expect(doLicense(g, a, bad), bad).toBe(false)
      expect(snap(g, a)).toBe(held)
      g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
      expect(doLicense(g, a, fam)).toBe(false)
      g.character.prison = null
      expect(snap(g, a)).toBe(held)
      const cashBefore = b.cash
      expect(doLicense(g, a, fam)).toBe(true)
      expect(spy).not.toHaveBeenCalled()
      expect(b.cash).toBe(cashBefore)
      expect(readLab(b).patents[0].mode).toBe('license')
      expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Licensed')).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('will not license what runs out next year', () => {
    const { g, a, b } = labGame(81, 'brewery', { country: 'ca' })
    patchLab(b, (d) => {
      d.patents = [patent({ family: 'Late Kind', filed: g.year - 4, until: g.year + 1 })]
    })
    expect(licenseBlock(g, b, 'Late Kind')).toBe(LAB_SAY.tooLate('Late Kind'))
    const before = snap(g, a)
    expect(doLicense(g, a, 'Late Kind')).toBe(false)
    expect(snap(g, a)).toBe(before)
    expect(licenseBlock(g, b, 'Missing')).toBe(LAB_SAY.noPatent('Missing'))
  })
})

describe('the Patents section of the screen', () => {
  it('lists the lines that can be patented, with the single reason when one cannot, and the patents held', () => {
    const { g, a, b } = labGame(82, 'brewery', { country: 'ca' })
    const fam = launchBreakthrough(g, a, b)
    const classic = soldKind(g, b)
    ownLine(b, classic, g.year)
    const list = patentableFamilies(g, b)
    expect(list).toEqual(expect.arrayContaining([fam, classic]))
    const text = (n: MenuAction): string => (typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''))
    for (const family of list) {
      const row = actionOf(g, a, `lab.patent.${slug(family)}`)!
      expect(row, family).toBeDefined()
      expect(row.disabledReason?.(g) ?? null).toBe(patentBlock(g, b, family))
    }
    const ok = actionOf(g, a, `lab.patent.${slug(fam)}`)!
    const t = patentTerms(g, b, fam)
    expect(text(ok)).toContain(money(t.fee))
    expect(text(ok)).toContain(`${t.years} years`)
    expect(ok.confirm?.(g)).toContain(money(t.fee))
    expect(ok.confirm?.(g)).toContain(`${t.years} years`)
    const no = actionOf(g, a, `lab.patent.${slug(classic)}`)!
    expect(no.disabledReason?.(g)).toBe(LAB_SAY.notNovel(classic))
    // filing from the screen puts a patent on it, with an info row, and a licence row that goes away once used
    expect(actionOf(g, a, `lab.license.${slug(fam)}`)).toBeUndefined()
    ok.run(g)
    expect(readLab(b).patents.map((p) => p.family)).toEqual([fam])
    const infos = rows(g, a).filter((n) => n.type === 'info').map((n) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : ''))
    expect(infos.some((x) => x.startsWith(`${fam}: protected`))).toBe(true)
    const lic = actionOf(g, a, `lab.license.${slug(fam)}`)!
    expect(lic).toBeDefined()
    expect(lic.disabledReason?.(g) ?? null).toBe(licenseBlock(g, b, fam))
    expect(lic.confirm?.(g)).toMatch(/can't be undone|cannot be undone/)
    lic.run(g)
    expect(readLab(b).patents[0].mode).toBe('license')
    expect(actionOf(g, a, `lab.license.${slug(fam)}`)).toBeUndefined()
    const after = rows(g, a).filter((n) => n.type === 'info').map((n) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : ''))
    expect(after.some((x) => x.startsWith(`${fam}: licensed, royalties until ${readLab(b).patents[0].until}`))).toBe(true)
    // a filed family can't be filed twice
    expect(actionOf(g, a, `lab.patent.${slug(fam)}`)?.disabledReason?.(g)).toBe(LAB_SAY.alreadyFiled(fam))
  })

  it('is pure: rendering a deep-frozen company changes nothing and draws nothing', () => {
    const { g, a, b } = labGame(83, 'brewery', { country: 'ca' })
    launchBreakthrough(g, a, b)
    ownLine(b, soldKind(g, b), g.year)
    patchLab(b, (d) => {
      d.patents = [patent({ family: 'Held Kind', filed: g.year, until: g.year + 4 })]
    })
    const json = JSON.stringify(g)
    const rng = g.rng
    const render = (gg: GameState, aa: Asset): string => rows(gg, aa).map((n) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(gg) : n.text) : n.type === 'heading' ? n.label : [n.label, typeof n.subtitle === 'function' ? n.subtitle(gg) : '', n.disabledReason?.(gg) ?? ''].join('|'))).join('\n')
    const text = render(g, a)
    expect(text).toContain('Patents')
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(json)
    const frozen = deepFreeze(structuredClone(g))
    const fa = frozen.assets.find((x) => x.id === a.id)!
    expect(render(frozen, fa)).toBe(text)
    expect(frozen.rng).toBe(rng)
  })
})
