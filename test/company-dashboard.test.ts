// Running a company 2.0: the dashboard card, milestones, the tidied company screen, the IPO bar
// and old saves. Menus must stay pure: rendering the whole screen never changes the game.
import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { companyHealth, dashboardRows, trend } from '../src/game/business/dashboard'
import { evolve, recordYear, simulateYear, valuationOf } from '../src/game/business/economy'
import { canIpo, IPO_PROFIT, ipoThreshold } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { MILESTONES, milestoneYear, milestonesMenu, nextMilestones, readMilestones } from '../src/game/business/milestones'
import { COMPARE_SHOWN } from '../src/game/business/national-view'
import { maxKeyStaff, roleBlurb } from '../src/game/business/staff'
import { bizOf, normalizeBiz, readBiz, type BizState } from '../src/game/business/state'
import { applyPlan, autoPlan, statementLines, yearlyBusinessImpl } from '../src/game/business/yearly'
import { industryDef } from '../src/game/business/industries'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState, Json, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

function company(seed: number, industry: string, opts: Partial<BizState> & { years?: number; talent?: boolean; country?: string } = {}): { g: GameState; a: Asset; b: BizState } {
  const country = opts.country ?? 'us'
  const g = createNewLife({ seed, year: 1980, countryId: country })
  g.queue = []
  g.year = 2012
  const c = g.character
  c.age = 32
  c.money = 3_000_000
  c.talent = null
  c.talents = opts.talent === false ? undefined : ['Business']
  c.licenses = ['driver']
  const { years = 2, talent: _t, country: _c, ...rest } = opts
  const b0 = newBiz(g, industry as BizState['industry'], country, getCountry(country).cities[0], { cash: 400_000, ...rest })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  applyPlan(b, autoPlan(g, b, 1))
  for (let y = 0; y < years; y++) {
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    b.valuation = valuationOf(b)
    g.year += 1
    applyPlan(b, autoPlan(g, b, r.stmt.cycle))
  }
  g.queue = []
  return { g, a, b }
}

/** Every node of a menu tree, rendering labels, subtitles, hints, headers, reasons and previews like the UI. */
function render(g: GameState, nodes: MenuNode[], depth = 0, out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.visible && !n.visible(g)) continue
    if (n.type === 'info') {
      out.push(typeof n.text === 'function' ? n.text(g) : n.text)
      continue
    }
    if (n.type === 'heading') {
      out.push(n.label)
      continue
    }
    out.push(n.label)
    const sub = typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle
    if (sub) out.push(sub)
    const hint = n.hint?.(g)
    if (hint) out.push(hint)
    const reason = n.disabledReason?.(g)
    if (reason) out.push(reason)
    if (n.type === 'action') {
      const c = n.confirm?.(g)
      if (c) out.push(c)
      const input = n.input
      if (input) {
        const def = input.defaultValue?.(g)
        if (def) out.push(def)
        if (input.preview && input.min !== undefined && input.max !== undefined) {
          for (const v of [input.min, input.max, Number(def ?? input.min)]) out.push(input.preview(g, Number.isFinite(v) ? v : input.min))
        }
      }
    }
    if (n.type === 'menu') {
      if (n.header) out.push(n.header(g))
      if (depth < 4) render(g, n.children(g), depth + 1, out)
    }
  }
  return out
}

function texts(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.filter((n) => n.type === 'info').map((n) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : ''))
}

function allNodes(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' && depth < 4 ? [n, ...allNodes(g, n.children(g), depth + 1)] : [n]))
}

describe('company dashboard', () => {
  it('trend arrows read sales and profit changes plainly', () => {
    expect(trend(112, 100)).toBe('\u{25B2}12%')
    expect(trend(70, 100)).toBe('\u{25BC}30%')
    expect(trend(100, 100)).toBe('\u{25AA} flat')
    expect(trend(50, -20, 'profit')).toBe('\u{25B2} back in profit')
    expect(trend(-50, 20, 'profit')).toBe('\u{25BC} into a loss')
    expect(trend(-10, -50, 'profit')).toBe('\u{25B2} smaller loss')
    expect(trend(10, null)).toBe('')
  })

  it('shows a compact card for every kind of company (classic, studio, deep tech, finance, brand new)', () => {
    const kinds: { industry: string; years?: number; rows: number }[] = [
      { industry: 'restaurant', rows: 5 },
      { industry: 'software', rows: 5 },
      { industry: 'gameStudio', rows: 5 },
      { industry: 'semiconductor', rows: 5 },
      { industry: 'bar', rows: 5 },
      { industry: 'bank', rows: 3 },
      { industry: 'investmentFirm', rows: 3 },
      { industry: 'cafe', years: 0, rows: 5 },
    ]
    for (const k of kinds) {
      const { g, a } = company(3, k.industry, { years: k.years ?? 2, ...(k.industry === 'semiconductor' ? { cash: 30_000_000 } : {}) })
      const rows = dashboardRows(g, a)
      expect(rows, k.industry).toHaveLength(k.rows)
      const lines = texts(g, rows)
      for (const t of lines) {
        expect(t, k.industry).not.toMatch(/NaN|undefined|Infinity|null/)
        expect(t.length, `${k.industry}: ${t}`).toBeLessThanOrEqual(150)
      }
      expect(lines[0]).toContain(industryDef(k.industry).label)
      expect(lines[1]).toMatch(/Cash/)
      if (k.rows === 5) expect(lines[4]).toMatch(/^(Just opened|Thriving|Steady|Struggling|In danger): /)
      // The screen opens with the card, not the old wall of facts.
      const view = businessView(g, a)
      expect(view.slice(0, k.rows).map((n) => n.id)).toEqual(rows.map((n) => n.id))
      expect(view.some((n) => n.id === `biz.details.${a.id}`)).toBe(true)
      expect(view.some((n) => n.id === `biz.milestones.${a.id}`)).toBe(true)
    }
  }, 120_000)

  it('labels health honestly: danger when cash is negative, struggling on losses, thriving on growth', () => {
    const { g, a, b } = company(4, 'restaurant')
    const s = b.last!
    const with_ = (patch: Partial<BizState>) => companyHealth(g, a, { ...b, ...patch })
    expect(with_({ cash: -5_000 }).id).toBe('danger')
    expect(with_({ cash: 10_000, last: { ...s, net: -50_000, revenue: 500_000 } }).id).toBe('danger') // under a year of runway
    expect(with_({ cash: 5_000_000, last: { ...s, net: -50_000, revenue: 500_000 } }).id).toBe('struggling')
    const prev = b.history[b.history.length - 2]
    const grown = { ...b, cash: 100_000, morale: 70, last: { ...s, net: Math.max(1, prev.profit) * 1.5 + 50_000, revenue: prev.revenue * 1.1 }, history: [...b.history.slice(0, -1), { ...b.history[b.history.length - 1], revenue: prev.revenue * 1.1, profit: Math.max(1, prev.profit) * 1.5 + 50_000 }] }
    expect(companyHealth(g, a, grown).id).toBe('thriving')
    expect(companyHealth(g, a, { ...b, last: null, history: [] }).id).toBe('new')
  })
})

describe('the tidied company screen', () => {
  it('renders the whole screen without changing the game (classic, studio, deep tech, bank, fund, venue)', () => {
    for (const industry of ['restaurant', 'cafe', 'gameStudio', 'semiconductor', 'bank', 'investmentFirm', 'bar', 'construction']) {
      const { g, a, b } = company(5, industry, { brand: 60, quality: 70, ...(industry === 'semiconductor' ? { cash: 30_000_000 } : {}) })
      b.franchise = { units: 3, since: 2010, added: 1, addedYear: g.year, booked: g.year - 1, carry: 0.2, lifetime: 50_000, scandals: 0, lastScandal: 0, ledger: [{ year: g.year - 1, fees: 1_000, royalty: 2_000 }] } as unknown as Json
      b.milestones = { profit: 2013 } as unknown as Json
      const before = JSON.stringify(g)
      const rng = g.rng
      const one = render(g, businessView(g, a))
      const two = render(g, businessView(g, a))
      expect(JSON.stringify(g), `${industry}: rendering changed the state`).toBe(before)
      expect(g.rng).toBe(rng)
      expect(two).toEqual(one)
      expect(one.join('\n'), industry).not.toMatch(/NaN|undefined|Infinity/)
    }
  }, 180_000)

  it('keeps financial firms free of product-company programs and inventions', () => {
    for (const industry of ['bank', 'onlineBank', 'investmentFirm']) {
      const { g, a } = company(6, industry)
      const ids = allNodes(g, businessView(g, a)).map((n) => n.id)
      expect(ids.some((id) => id.startsWith('biz.national.')), industry).toBe(false)
      expect(ids.some((id) => id.startsWith('biz.inventor.')), industry).toBe(false)
      expect(ids.some((id) => id.startsWith('biz.franchise.')), industry).toBe(false)
      // Their key roles say what the job is, not a product-company blurb.
      for (const role of industryDef(industry).roles) expect(roleBlurb({ industry: industry as BizState['industry'] }, role)).not.toMatch(/books clean|unit costs|Raises quality|customers$/)
    }
    const { g, a } = company(6, 'restaurant')
    expect(allNodes(g, businessView(g, a)).some((n) => n.id === `biz.national.${a.id}`)).toBe(true)
  })

  it('compares only the most promising foreign markets, with a one-line summary', () => {
    const { g, a } = company(7, 'restaurant')
    const national = allNodes(g, businessView(g, a)).find((n) => n.id === `biz.national.explore.${a.id}`)
    expect(national?.type).toBe('menu')
    if (national?.type !== 'menu') return
    const rows = national.children(g)
    const countries = rows.filter((n) => n.id.startsWith(`national.compare.${a.id}.`))
    expect(countries.length).toBeLessThanOrEqual(COMPARE_SHOWN)
    expect(countries.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(COMPARE_SHOWN + 2)
    expect(texts(g, rows)[0]).toMatch(/markets open to a restaurant: \d+ expanding, \d+ weakening/)
  })

  it('counts leadership seats against the roles a company actually has', () => {
    const { b } = company(8, 'bank')
    expect(maxKeyStaff(b)).toBeLessThanOrEqual(industryDef('bank').roles.length)
    const big = { ...b, outlets: [{ countryId: 'us', city: 'New York', count: 60, opened: 2000 }] }
    expect(maxKeyStaff(big)).toBe(industryDef('bank').roles.length)
    const { g, a } = company(8, 'restaurant', { outlets: [{ countryId: 'us', city: 'New York', count: 40, opened: 2000 }] })
    const heading = allNodes(g, businessView(g, a)).find((n) => n.id === `biz.keyStaffH.${a.id}`)
    expect(heading?.type === 'heading' ? heading.label : '').toBe(`Leadership team (0/${industryDef('restaurant').roles.length})`)
  })

  it('shows no line on the company screen longer than a couple of sentences', () => {
    const { g, a } = company(9, 'restaurant')
    const top = businessView(g, a).filter((n) => n.type === 'info')
    for (const t of texts(g, top)) expect(t.length, t).toBeLessThanOrEqual(150)
  })
})

describe('IPO bar', () => {
  it('lists a successful mid-size company at $25M a year (studios and deep tech keep their own rules)', () => {
    expect(IPO_PROFIT).toBe(25_000_000)
    const { b } = company(10, 'restaurant')
    expect(ipoThreshold(b)).toBe(25_000_000)
    const rich = { ...b, history: [...b.history.slice(0, -1), { ...b.history[b.history.length - 1], profit: 26_000_000 }] }
    expect(canIpo(rich)).toBeNull()
    const short = { ...b, history: [...b.history.slice(0, -1), { ...b.history[b.history.length - 1], profit: 24_000_000 }] }
    expect(canIpo(short)).toMatch(/\$25M/)
    expect(ipoThreshold({ ...b, industry: 'gameStudio' })).toBe(25_000_000)
    expect(ipoThreshold({ ...b, industry: 'semiconductor' })).not.toBe(IPO_PROFIT)
  })
})

describe('milestones', () => {
  it('celebrates a new milestone once, with one popup a year for all companies', () => {
    const x = company(11, 'restaurant', { years: 1 })
    const { g, a, b } = x
    expect(b.last && b.last.net > 0).toBe(true)
    const happy = g.character.stats.happiness
    const hits = milestoneYear(g, a, b)
    expect(hits.map((h) => h.id)).toContain('profit')
    const pops = g.queue.filter((m) => m.kind === 'notice' && m.title === 'Milestones!')
    expect(pops).toHaveLength(1)
    expect(g.character.stats.happiness).toBeGreaterThan(happy)
    // Again: nothing new, no second popup.
    expect(milestoneYear(g, a, b)).toHaveLength(0)
    expect(g.queue.filter((m) => m.kind === 'notice' && m.title === 'Milestones!')).toHaveLength(1)
    // A second company reaching milestones the same year joins the same popup.
    const b2 = newBiz(g, 'cafe', 'us', 'Chicago', { cash: 1_000 })
    b2.history = [{ year: g.year - 1, revenue: 12_000_000, profit: 50_000, tax: 0, units: 0, price: 0, staff: 0, valuation: 0, outlets: 1 }]
    b2.last = { ...b.last!, revenue: 12_000_000, net: 50_000 }
    const a2 = createBusinessAsset(g, 'Second Co', b2, 0)
    g.assets.push(a2)
    const more = milestoneYear(g, a2, bizOf(g, a2))
    expect(more.map((h) => h.id)).toEqual(expect.arrayContaining(['profit', 'rev1m', 'rev10m']))
    const all = g.queue.filter((m) => m.kind === 'notice' && m.title === 'Milestones!')
    expect(all).toHaveLength(1)
    expect(all[0].kind === 'notice' ? all[0].text : '').toMatch(/Second Co: \$10M in yearly sales/)
    // Rewards are capped per year however many milestones land.
    expect(g.character.stats.happiness - happy).toBeLessThanOrEqual(6)
  })

  it('records an old company’s past achievements quietly (old saves and bought companies)', () => {
    const { g, a, b } = company(12, 'restaurant', { years: 3 })
    expect(b.milestones).toBeUndefined()
    b.founded = g.year - 30
    const n = g.queue.length
    expect(milestoneYear(g, a, b)).toHaveLength(0)
    expect(g.queue.length).toBe(n)
    const done = readMilestones(b)
    expect(done.profit).toBe(g.year)
    expect(done.age25).toBe(g.year)
    expect(done.age50).toBeUndefined()
  })

  it('shows reached and next milestones in a pure submenu', () => {
    const { g, a, b } = company(13, 'restaurant')
    milestoneYear(g, a, b)
    const menu = milestonesMenu(a)
    const before = JSON.stringify(g)
    const rows = menu.children(g)
    expect(JSON.stringify(g)).toBe(before)
    const lines = texts(g, rows)
    expect(lines.some((t) => /First profitable year · \d{4}/.test(t))).toBe(true)
    expect(nextMilestones(g, readBiz(g, a), 3)).toHaveLength(3)
    expect(typeof menu.subtitle === 'function' ? menu.subtitle(g) : '').toMatch(new RegExp(`of ${MILESTONES.length} reached`))
  })

  it('runs in the yearly loop and survives old saves without the new fields', () => {
    const { g, a, b } = company(14, 'restaurant', { years: 1 })
    delete b.milestones
    delete b.franchise
    const plain = normalizeBiz(JSON.parse(JSON.stringify(a.details)) as Record<string, Json>, g.year)
    expect(plain.milestones).toBeUndefined()
    b.milestones = { profit: 2010, bogus: 'x' } as unknown as Json
    b.franchise = { units: 2, ledger: 'junk' } as unknown as Json
    const kept = normalizeBiz(JSON.parse(JSON.stringify(a.details)) as Record<string, Json>, g.year)
    expect(kept.milestones).toEqual({ profit: 2010, bogus: 'x' })
    expect(readMilestones(kept)).toEqual({ profit: 2010 })
    g.year += 1
    expect(() => yearlyBusinessImpl(g)).not.toThrow()
    expect(readBiz(g, a).last?.year).toBe(g.year - 1)
    const after = readBiz(g, a)
    expect(readMilestones(after).profit).toBe(2010)
    const json = JSON.stringify(g)
    expect(JSON.stringify(JSON.parse(json))).toBe(json)
  })
})

describe('a hired CEO in a cash crunch', () => {
  it('still plans the coming year while the owner decides how to fill the hole', () => {
    const { g, a, b } = company(15, 'restaurant', { years: 2 })
    g.character.job = null
    b.ceo = 'manager'
    b.manager = { firstName: 'Pat', lastName: 'Morgan', gender: 'male', skill: 55, salary: 60_000, since: g.year - 1 }
    b.cash = -2_000_000
    b.price = 0.5
    g.year += 1
    yearlyBusinessImpl(g)
    const after = readBiz(g, a)
    expect(g.queue.some((m) => m.kind === 'choice' && m.title === 'Cash Crunch')).toBe(true)
    expect(after.price).toBeGreaterThan(0.5)
  })
})

describe('the Annual Report statement', () => {
  it('shows franchise money as its own income line, taken out of other income', () => {
    const { b } = company(16, 'restaurant')
    const s = { ...b.last!, otherIncome: 30_000 }
    b.franchise = { units: 4, ledger: [{ year: s.year, fees: 5_000, royalty: 20_000 }] } as unknown as Json
    const lines = statementLines(b, s)
    expect(lines.find((l) => l.label === 'Franchise fees & royalties')?.value).toBe('$25,000')
    expect(lines.find((l) => l.label === 'Other income')?.value).toBe('$5,000')
  })
})
