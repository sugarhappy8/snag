// Global competition and market share: early movers in exploding markets (an AI lab in 2005)
// grow into near-monopolies, the same company founded today fights a crowded field, local trades
// compete locally, antitrust comes for the dominant, rivals are deterministic, menus are pure,
// old saves load, and every number stays finite for decades in very different markets.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { businessAssetView, businessSummary } from '../src/game/business'
import { acquisitionQuote, acquireRival } from '../src/game/business/competition-moves'
import { buildCtx, marketDemand, marketStateOf } from '../src/game/business/competition-core'
import { effectiveRegime, industryEraBlock, mergerLimit, sizeRatio, tierFor } from '../src/game/business/competition-data'
import { maybeAntitrust, presentCompetitionEvent } from '../src/game/business/competition-events'
import { rosterOf } from '../src/game/business/competition-roster'
import { readMarket } from '../src/game/business/competition-state'
import { marketViewOf, refreshMarket, saveMarket, marketOfBiz } from '../src/game/business/competition'
import { bestTechPlan, techOf, techPlan } from '../src/game/business/deeptech-core'
import { frontierScore } from '../src/game/business/deeptech-data'
import { readTech } from '../src/game/business/deeptech-state'
import { bestPlan, localEcon, marketCtxFor, marketScale, planFor, simulateYear } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, businessAssets, findBusiness, normalizeBiz, readBiz, totalOutlets } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, Asset, GameState, Json, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

const PREFER = ['decline', 'settle', 'innovate', 'match', 'pounce', 'outspend', 'cover', 'loan', 'investor', 'closed', 'steady', 'sign', 'pay', 'savings', 'no', 'humble', 'apologize']

/** Answer every popup sensibly (never sell the company), using the talent's plan when there is one. */
function drain(g: GameState): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => PREFER.includes(c.id)) ?? m.choices[m.choices.length - 1]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || '1', m.data, m)
    else if (m.kind === 'minigame') {
      if (m.game === 'annualReport') {
        const r = m.data as unknown as AnnualReportData
        runScript(g, m.scriptId, JSON.stringify({ price: r.suggestedPrice, production: Math.min(r.maxProduction, Math.round(r.expectedDemand * 1.05)) }), m.data, m)
      } else runScript(g, m.scriptId, 'skip', m.data, m)
    } else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function adult(seed: number, year: number, countryId: string, money = 1e9): GameState {
  const g = createNewLife({ seed, year: year - 30, countryId })
  g.queue = []
  g.year = year
  const c = g.character
  c.age = 30
  c.money = money
  c.stats.smarts = 95
  c.city = getCountry(countryId).cities[0]
  c.licenses = ['driver']
  c.talent = null
  c.talents = []
  return g
}

function company(g: GameState, industry: Industry, opts: { cash?: number; tech?: Record<string, Json>; outlets?: number } = {}): Asset {
  const c = g.character
  const b = newBiz(g, industry, c.countryId, c.city, { cash: opts.cash ?? 5_000_000, quality: 70, brand: 40 })
  if (opts.outlets) b.outlets[0].count = opts.outlets
  if (opts.tech) {
    const t = readTech(undefined)
    Object.assign(t, opts.tech)
    b.tech = JSON.parse(JSON.stringify(t)) as Json
  }
  const a = createBusinessAsset(g, `Test ${industry}`, b, 0)
  g.assets.push(a)
  c.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: c.age, roleStartAge: c.age } }
  return a
}

/** One fiscal year: the calendar moves on and the business hook runs, popups answered. */
function nextYear(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  yearlyBusinessImpl(g)
  drain(g)
}

/**
 * A well-run AI lab: the R&D keeps up (stages, frontier models, compute), capacity is built to
 * meet demand (paid for by the founder when the company is short), and the year is planned with
 * the talent's planner.
 */
function runAiWell(g: GameState, a: Asset, start: number): void {
  const b = bizOf(g, a)
  const t = techOf(b)
  const yrs = g.year - start
  t.stage = Math.max(t.stage, yrs >= 8 ? 4 : yrs >= 5 ? 3 : yrs >= 2 ? 2 : yrs >= 1 ? 1 : 0)
  t.level = Math.min(92, 45 + 4 * yrs)
  t.hype = 60
  t.programs = []
  if (t.stage >= 1 && !t.models.some((m) => m.year === g.year)) t.models.push({ gen: t.models.length + 1, name: `Nova ${t.models.length + 1}`, score: frontierScore(g.year) + 3, open: false, year: g.year })
  t.plant = Math.min(6, Math.max(t.plant, Math.floor(yrs / 2)))
  b.quality = 75
  b.morale = 75
  b.brand = Math.max(b.brand, 55)
  const p = techPlan(g, b, t, g.year, { calm: true })
  if (t.stage >= 1 && p.demand > p.capacity * 0.95) {
    const per = p.capacity / Math.max(1, totalOutlets(b))
    const add = per > 0 ? Math.min(150, Math.ceil((p.demand * 1.15 - p.capacity) / per)) : 0
    if (add > 0) {
      const cost = add * localEcon('aiLab', b.countryId, b.city).capital
      if (b.cash < cost) {
        g.character.money -= cost
        b.cash += cost
        b.invested += cost
      }
      b.cash -= cost
      b.outlets[0].count += add
    }
  }
  const best = bestTechPlan(g, b, t)
  b.price = best.price
  b.production = best.production
  t.venture = Math.max(t.venture, 20_000_000)
  if (b.cash < 0) {
    g.character.money += b.cash
    b.invested -= b.cash
    b.cash = 0
  }
}

function aiShares(seed: number, start: number, years: number): number[] {
  const g = adult(seed, start, 'us')
  const a = company(g, 'aiLab', { cash: 20_000_000, tech: { level: 45, hype: 50, venture: 50_000_000 } })
  const shares: number[] = []
  for (let y = 0; y < years; y++) {
    if (!findBusiness(g, a.id)) break
    runAiWell(g, a, start)
    nextYear(g)
    if (!findBusiness(g, a.id)) break
    shares.push(marketViewOf(g, readBiz(g, a)).share)
  }
  return shares
}

/** Every number in a JSON value is finite. */
function finite(v: unknown, path = 'g'): void {
  if (typeof v === 'number') {
    expect(Number.isFinite(v), path).toBe(true)
    return
  }
  if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`)
}

/** Book last year in the company's market as if it had held `share` of it (rivals split the rest). */
function forceShare(g: GameState, b: ReturnType<typeof bizOf>, share: number): void {
  const st = marketOfBiz(b)
  const ctx = marketCtxFor(g, b, g.year - 1)
  st.year = g.year - 1
  st.share = share
  st.base = share
  st.size = 1e9
  st.rivals = ctx.rivals.map((r): [string, number] => [r.id, ((1 - share) * r.pull) / ctx.F]).filter((x) => x[1] > 0)
  saveMarket(b, st)
}

function allNodes(g: GameState, nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...allNodes(g, n.children(g))] : [n]))
}

/** Render every row of a company screen, as the UI would (labels, subtitles, hints, reasons). */
function renderAll(g: GameState, a: Asset): string[] {
  const out: string[] = []
  for (const n of allNodes(g, businessAssetView(g, a))) {
    if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
    else if (n.type === 'heading') out.push(n.label)
    else {
      out.push(n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? '', n.hint?.(g) ?? '', n.disabledReason?.(g) ?? '')
      if (n.type === 'menu' && n.header) out.push(n.header(g))
    }
  }
  return out
}

describe('competition: first movers and crowded fields', () => {
  it('an AI lab founded in 2005 in the US and run well owns most of the world market by ~2020', () => {
    let dominant = 0
    for (const seed of [1, 2, 3, 4, 5]) {
      const shares = aiShares(seed, 2005, 15) // fiscal years 2005-2019, booked by 2020
      const by2020 = Math.max(...shares.slice(-3))
      if (by2020 > 0.5) dominant++
    }
    expect(dominant, 'most seeds reach a >50% world share').toBeGreaterThanOrEqual(4)
  }, 60_000)

  it('the same company founded in PRESENT_YEAR rarely gets past 10%', () => {
    let big = 0
    for (const seed of [1, 2, 3, 4, 5]) {
      const shares = aiShares(seed, PRESENT_YEAR, 15)
      expect(shares.length).toBeGreaterThan(5)
      if (Math.max(...shares) > 0.1) big++
    }
    expect(big).toBeLessThanOrEqual(1)
  }, 60_000)

  it('a company in a crowded PRESENT_YEAR market sells what it always did (the factor is ~1)', () => {
    const g = adult(3, PRESENT_YEAR, 'us')
    for (const ind of ['restaurant', 'software', 'manufacturing', 'gym', 'ecommerce', 'energy'] as Industry[]) {
      const b = newBiz(g, ind, 'us', 'Chicago')
      const p = planFor(g, b, g.year, { calm: true })
      expect(p.market, ind).toBeTruthy()
      expect(p.market!.factor, ind).toBeGreaterThan(0.95)
      expect(p.market!.factor, ind).toBeLessThan(1.06)
    }
  })

  it('markets follow their era: AI tiny before deep learning, quantum lab-only before 2016, the dot-com bust hits', () => {
    expect(sizeRatio('aiLab', 2005)).toBeLessThan(0.01)
    expect(sizeRatio('aiLab', 2020) / sizeRatio('aiLab', 2012)).toBeGreaterThan(8)
    expect(sizeRatio('aiLab', PRESENT_YEAR)).toBe(1)
    expect(sizeRatio('quantum', 2010)).toBeLessThan(0.01)
    expect(sizeRatio('electricVehicles', 2005)).toBeLessThan(0.01)
    expect(sizeRatio('ecommerce', 2001)).toBeLessThan(sizeRatio('ecommerce', 2000))
    expect(sizeRatio('software', 2001)).toBeLessThan(sizeRatio('software', 2000))
    // A software company sells less in the bust than in the boom (same company, same price).
    const g = adult(4, 2000, 'us')
    const b = newBiz(g, 'software', 'us', 'Chicago', { outlets: [{ countryId: 'us', city: 'Chicago', count: 5, opened: 1999 }] })
    const boom = planFor(g, b, 2000, { calm: true, cycle: () => 1 }).demand
    const bust = planFor(g, b, 2001, { calm: true, cycle: () => 1 }).demand
    expect(bust).toBeLessThan(boom * 0.97)
    // Nobody opens an online store before the internet, or an AI lab before the term exists.
    expect(industryEraBlock('ecommerce', 'us', 1990)).toBeTruthy()
    expect(industryEraBlock('ecommerce', 'us', 2005)).toBeNull()
    expect(industryEraBlock('aiLab', 'us', 1940)).toBeTruthy()
    expect(industryEraBlock('restaurant', 'us', 1920)).toBeNull()
  })

  it('a dominant company keeps customers at higher prices (share drives pricing power and margins)', () => {
    const g = adult(5, 2020, 'us')
    const a = company(g, 'software', { outlets: 40 })
    const b = bizOf(g, a)
    const small = bestPlan(g, b, { fast: true })
    const st = marketOfBiz(b)
    st.year = g.year - 1
    st.base = 0.85
    st.share = 0.85
    saveMarket(b, st)
    const ctx = marketCtxFor(g, b, g.year)
    expect(ctx.dominance).toBeGreaterThan(0.9)
    const big = bestPlan(g, b, { fast: true })
    expect(big.price).toBeGreaterThan(small.price)
    expect(planFor(g, b, g.year, { calm: true }).unitCost).toBeLessThan(planFor(g, { ...b, market: undefined }, g.year, { calm: true }).unitCost)
    // Same bottom-up demand, more customers kept when you're the network everyone is on.
    const pick = (base: number) => marketDemand(buildCtx(g.lifeId, 'software', 'world', g.year, { ...st, base, rev: st.rev + 1000 + Math.round(base * 100) }, ...Object.values(marketScale('software', 'us')) as [number, number]), 20_000).units
    expect(pick(0.8)).toBeGreaterThan(pick(0.05) * 2)
  })
})

describe('competition: local trades compete locally', () => {
  it("a restaurant's rivals are local and its world share is ~0, unless it becomes a big chain abroad", () => {
    const g = adult(6, PRESENT_YEAR, 'us')
    const a = company(g, 'restaurant', { cash: 2_000_000 })
    nextYear(g)
    const v = marketViewOf(g, readBiz(g, a))
    expect(v.scope).toBe('national')
    expect(v.place).toBe('the United States')
    expect(v.rivals.length).toBeGreaterThan(3)
    for (const r of v.rivals) expect(r.hq).toBe('us')
    expect(v.share).toBeLessThan(0.001)
    expect(v.worldShare).toBeLessThan(0.0001)
    expect(v.fringe).toBeGreaterThan(0.5)
    // A chain of hundreds of restaurants across the world registers worldwide.
    const b = bizOf(g, a)
    b.outlets = [
      { countryId: 'us', city: 'Chicago', count: 120, opened: g.year },
      { countryId: 'jp', city: getCountry('jp').cities[0], count: 120, opened: g.year },
      { countryId: 'de', city: getCountry('de').cities[0], count: 120, opened: g.year },
      { countryId: 'gb', city: getCountry('gb').cities[0], count: 120, opened: g.year },
    ]
    b.production = 50_000_000
    nextYear(g)
    const chain = marketViewOf(g, readBiz(g, a))
    expect(chain.worldShare).toBeGreaterThan(v.worldShare * 50)
    expect(chain.worldShare).toBeLessThan(0.05)
  })
})

describe('competition: antitrust', () => {
  function dominantIn(countryId: string, year: number, share: number): { g: GameState; a: Asset } {
    const g = adult(7, year, countryId)
    const a = company(g, 'software', { outlets: 30 })
    const b = bizOf(g, a)
    b.last = { year: year - 1, demand: 2_500_000, sold: 2_500_000, produced: 2_500_000, spoiled: 0, price: b.price, revenue: 5_000_000_000, salesTax: 0, netRevenue: 5_000_000_000, cogs: 750_000_000, wages: 1_000_000_000, keyStaff: 0, rent: 125_000_000, marketing: 250_000_000, interest: 0, upkeep: 50_000_000, other: 0, otherIncome: 0, ownerPay: 0, pbt: 2_825_000_000, corpTax: 625_000_000, net: 2_200_000_000, cashErosion: 0, cycle: 1, openFraction: 1, employees: 10_000 }
    forceShare(g, b, share)
    return { g, a }
  }

  it('comes for dominant companies, harder in the EU than in a lax place, never for small ones', () => {
    const eu = dominantIn('fr', 2020, 0.8)
    const lax = dominantIn('ng', 2020, 0.8)
    const small = dominantIn('fr', 2020, 0.1)
    const vEu = marketViewOf(eu.g, readBiz(eu.g, eu.a)).antitrust
    const vLax = marketViewOf(lax.g, readBiz(lax.g, lax.a)).antitrust
    expect(vEu.p).toBeGreaterThan(0)
    expect(vEu.regime.name).toBe('the European Commission')
    expect(vEu.p).toBeGreaterThan(vLax.p)
    expect(marketViewOf(small.g, readBiz(small.g, small.a)).antitrust.p).toBe(0)
    expect(effectiveRegime('us', 1911, false).strict).toBeGreaterThan(effectiveRegime('us', 1990, false).strict)
    // Over the years a near-monopoly in the EU gets an antitrust case.
    let cases = 0
    for (let y = 0; y < 25 && !cases; y++) {
      const b = bizOf(eu.g, eu.a)
      const st = marketOfBiz(b)
      st.year = eu.g.year
      saveMarket(b, st)
      maybeAntitrust(eu.g, eu.a, b, eu.g.year, false)
      cases = marketOfBiz(bizOf(eu.g, eu.a)).antitrust.cases
      if (cases) {
        const m = eu.g.queue.find((x) => x.kind === 'choice')
        expect(m && m.kind === 'choice' && m.title).toBe('Antitrust Investigation')
        drain(eu.g)
      }
      eu.g.year += 1
    }
    expect(cases).toBeGreaterThan(0)
    finite(eu.g.assets)
  })

  it('blocks acquisitions that would make a company too big, and lets small ones through', () => {
    const { g, a } = dominantIn('fr', 2024, 0.45)
    const b = bizOf(g, a)
    const v = marketViewOf(g, b)
    const top = v.rivals.find((r) => !r.legacy)!
    const q = acquisitionQuote(g, b, top.id)!
    expect(q.combined).toBeGreaterThan(mergerLimit(effectiveRegime('fr', g.year, true)))
    expect(q.block).toMatch(/European Commission/)
    expect(acquireRival(g, a, b, top.id)).toBe(false)
    // A small player can buy a small rival.
    const s = adult(8, 2024, 'us')
    const sa = company(s, 'software', { outlets: 3, cash: 1e10 })
    nextYear(s)
    const sb = bizOf(s, sa)
    const target = marketViewOf(s, sb).rivals.filter((r) => !r.legacy).slice(-1)[0]
    const sq = acquisitionQuote(s, sb, target.id)!
    expect(sq.block).toBeNull()
    expect(sq.price).toBeGreaterThan(0)
    const before = marketViewOf(s, sb).rivals.length
    expect(acquireRival(s, sa, sb, target.id)).toBe(true)
    const after = marketViewOf(s, readBiz(s, sa))
    expect(after.rivals.some((r) => r.id === target.id)).toBe(false)
    expect(after.rivals.length).toBe(before - 1)
    expect(readBiz(s, sa).cash).toBeLessThan(1e10)
  })

  it('assigns dominance tiers from share and rank', () => {
    expect(tierFor(0.001, 50)).toBe('startup')
    expect(tierFor(0.01, 12)).toBe('niche')
    expect(tierFor(0.05, 4)).toBe('contender')
    expect(tierFor(0.15, 1)).toBe('leader')
    expect(tierFor(0.45, 1)).toBe('dominant')
    expect(tierFor(0.8, 1)).toBe('monopoly')
  })
})

describe('competition: determinism, menus, saves', () => {
  it('generates the same rivals for the same world, different ones for another, and keeps them for heirs', () => {
    const a1 = rosterOf('life-1980-abc', 'aiLab', 'world').rivals.map((r) => `${r.name}|${r.founded}|${r.hq}`)
    const a2 = rosterOf('life-1980-abc', 'aiLab', 'world').rivals.map((r) => `${r.name}|${r.founded}|${r.hq}`)
    const heir = rosterOf('life-1980-abc-g2'.replace(/-g\d+$/, ''), 'aiLab', 'world').rivals.map((r) => `${r.name}|${r.founded}|${r.hq}`)
    const other = rosterOf('life-1980-xyz', 'aiLab', 'world').rivals.map((r) => `${r.name}|${r.founded}|${r.hq}`)
    expect(a1).toEqual(a2)
    expect(heir).toEqual(a1)
    expect(other).not.toEqual(a1)
    // Names are unique within a market.
    expect(new Set(a1.map((x) => x.split('|')[0])).size).toBe(a1.length)
    // Rivals are founded as the market grows: very few AI labs before deep learning.
    const early = rosterOf('life-1980-abc', 'aiLab', 'world').rivals.filter((r) => r.founded < 2005).length
    const later = rosterOf('life-1980-abc', 'aiLab', 'world').rivals.filter((r) => r.founded >= 2012 && r.founded <= PRESENT_YEAR).length
    expect(later).toBeGreaterThan(early)
  })

  it('renders every company screen without touching the dice or the state, the same way twice', () => {
    for (const [ind, cid] of [['aiLab', 'us'], ['restaurant', 'jp'], ['software', 'de'], ['gameStudio', 'tw'], ['quantum', 'ng']] as [Industry, string][]) {
      const g = adult(9, 2015, cid)
      g.character.talents = ['Business']
      const a = company(g, ind, { tech: ind === 'aiLab' || ind === 'quantum' ? { level: 60, stage: 2 } : undefined })
      nextYear(g)
      nextYear(g)
      const before = JSON.stringify(g)
      const one = renderAll(g, a)
      const two = renderAll(g, a)
      expect(JSON.stringify(g), `${ind}: menus must not change the state`).toBe(before)
      expect(two).toEqual(one)
      expect(one.join('\n')).toMatch(/Market & Competition/)
      expect(one.join('\n')).not.toMatch(/NaN|undefined|Infinity/)
    }
  })

  it('shows market share in the info rows and the AI summary', () => {
    const g = adult(10, 2018, 'us')
    const a = company(g, 'aiLab', { tech: { level: 70, stage: 3, models: [{ gen: 1, name: 'Nova 1', score: 70, open: false, year: 2017 }] } as unknown as Record<string, Json> })
    const b = bizOf(g, a)
    const plan = bestTechPlan(g, b, techOf(b))
    b.price = plan.price
    b.production = plan.production
    nextYear(g)
    const rows = renderAll(g, a).join('\n')
    expect(rows).toMatch(/of the world AI market/)
    expect(businessSummary(g)).toMatch(/world AI market/)
    const r = adult(11, 2018, 'jp')
    company(r, 'restaurant')
    nextYear(r)
    expect(businessSummary(r)).toMatch(/Japan's restaurant market/)
  })

  it('loads business saves from before competition existed (and shrugs off damaged market data)', () => {
    const g = adult(12, PRESENT_YEAR, 'de')
    const a = company(g, 'manufacturing', { outlets: 2 })
    const raw = JSON.parse(JSON.stringify(a.details)) as Record<string, Json>
    delete raw.market
    a.details = raw
    expect(marketStateOf(readBiz(g, a))).toBeNull()
    expect(normalizeBiz(raw, g.year).market).toBeUndefined()
    expect(renderAll(g, a).join('\n')).toMatch(/New to the world manufacturing market/)
    nextYear(g)
    expect(marketStateOf(readBiz(g, a))?.year).toBe(g.year - 1)
    // Garbage in the market field reads as a fresh market, never a crash.
    for (const junk of [5, 'x', [1, 2], { rivals: 'no', base: 'high', history: [null, { year: 'soon' }], extra: [{}], mods: { r1: 7 } }]) {
      a.details.market = junk as Json
      expect(() => renderAll(g, a)).not.toThrow()
      expect(() => planFor(g, readBiz(g, a), g.year, { calm: true })).not.toThrow()
    }
    expect(readMarket({ rivals: [['r1', 0.5], ['bad']], base: 2 } as unknown as Json, 'world')?.base).toBe(1)
  })

  it('books each year once (re-running the hook for a year changes nothing)', () => {
    const g = adult(13, 2010, 'us')
    const a = company(g, 'software', { outlets: 4 })
    nextYear(g)
    const b = bizOf(g, a)
    const st = JSON.stringify(b.market)
    const stmt = b.last!
    refreshMarket(g, a, b, g.year - 1, stmt, simulateYear(g, JSON.parse(JSON.stringify(b)), g.year - 1, 0, 1).market ?? null)
    expect(JSON.stringify(b.market)).toBe(st)
  })
})

describe('competition: events', () => {
  it('presents and resolves every competition event without breaking the numbers', () => {
    for (const id of ['giantBid', 'copycat', 'rivalPriceWar', 'rivalScandal']) {
      for (const pickLast of [false, true]) {
        const g = adult(14, 2022, 'us')
        g.character.talents = ['Business']
        const a = company(g, 'software', { outlets: 10 })
        const b = bizOf(g, a)
        b.products = [{ name: 'Mobile App', launched: g.year - 1, boost: 0.1 }]
        nextYear(g)
        g.queue = []
        presentCompetitionEvent(g, a, bizOf(g, a), id)
        const m = g.queue.find((x) => x.kind === 'choice')
        expect(m, id).toBeTruthy()
        if (!m || m.kind !== 'choice') continue
        // Exactly one purple hint with the talent.
        expect(m.choices.filter((c) => c.hint).length, id).toBe(1)
        g.queue = []
        const choice = pickLast ? m.choices[m.choices.length - 1] : m.choices[0]
        runScript(g, m.scriptId!, choice.id, m.data, m)
        drain(g)
        finite(g.assets)
        if (findBusiness(g, a.id)) nextYear(g)
        finite(g.assets)
      }
    }
  })

  it('draws newcomers into a market with fat margins', () => {
    const g = adult(15, 2015, 'us')
    const a = company(g, 'software', { outlets: 20 })
    let lured = 0
    for (let y = 0; y < 15 && !lured; y++) {
      const b = bizOf(g, a)
      const st = marketOfBiz(b)
      st.year = g.year - 1
      st.share = Math.max(st.share, 0.05)
      saveMarket(b, st)
      const plan = planFor(g, b, g.year, { calm: true })
      const stmt = { ...(b.last ?? simulateYear(g, JSON.parse(JSON.stringify(b)), g.year - 1, 0, 1).stmt), year: g.year, demand: plan.demand, sold: plan.demand, revenue: 50_000_000, net: 20_000_000 }
      refreshMarket(g, a, b, g.year, stmt, plan.market)
      lured = marketOfBiz(bizOf(g, a)).extra.length
      g.year += 1
    }
    expect(lured).toBeGreaterThan(0)
  })
})

describe('competition: decades in very different markets', () => {
  it('keeps every number finite over 30 years in us/jp/tw/ng/de', () => {
    for (const [i, cid] of ['us', 'jp', 'tw', 'ng', 'de'].entries()) {
      for (const [j, ind] of (['software', 'restaurant', 'aiLab', 'ecommerce', 'manufacturing'] as Industry[]).entries()) {
        const start = ind === 'ecommerce' ? 2000 : 1990 + 2 * i
        const g = adult(20 + i * 5 + j, start, cid)
        if (industryEraBlock(ind, cid, start)) continue
        const a = company(g, ind, { cash: 50_000_000, tech: ind === 'aiLab' ? { level: 55, stage: 2, venture: 100_000_000 } : undefined })
        for (let y = 0; y < 30 && findBusiness(g, a.id); y++) nextYear(g)
        finite(g.assets)
        for (const x of businessAssets(g)) {
          const v = marketViewOf(g, readBiz(g, x))
          finite(v)
          expect(v.share).toBeGreaterThanOrEqual(0)
          expect(v.share).toBeLessThanOrEqual(1)
          expect(v.size).toBeGreaterThanOrEqual(0)
          expect(v.rivals.reduce((t, r) => t + r.share, 0) + v.share).toBeLessThanOrEqual(1.000001)
          expect(x.value).toBeGreaterThanOrEqual(0)
        }
        expect(Number.isFinite(g.character.money)).toBe(true)
      }
    }
  }, 120_000)
})
