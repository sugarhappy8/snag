// The Business talent: purple hints in every company (the Annual Report's best plan, the best
// choice in every business popup, company-screen advice) and a modest growth perk.
import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import {
  appealOf,
  bestPlan,
  bizWorth,
  ceoSkill,
  costFactor,
  evolve,
  fxValue,
  hotIndustries,
  industryHint,
  LASTING_YEARS,
  planFor,
  recordYear,
  simulateYear,
  staffNet,
  TALENT_DEMAND,
  valuationOf,
  type BizFx,
} from '../src/game/business/economy'
import { businessEventInternals } from '../src/game/business/events'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { bizOf, findBusiness, readBiz, type BizState, type KeyStaff } from '../src/game/business/state'
import { applyPlan, autoPlan, crunchValues, reportData } from '../src/game/business/yearly'
import { industryDemand, INDUSTRY_IDS, type Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

/** An adult who has run a company for two years (so it has a history and a last statement). */
function company(seed: number, countryId: string, industry: Industry, talent: boolean, opts: Partial<BizState> = {}): { g: GameState; a: Asset; b: BizState } {
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  g.year = 2030
  c.money = 5_000_000
  c.talent = null
  c.talents = talent ? ['Business'] : undefined
  c.stats.smarts = 65
  c.licenses = ['driver']
  const city = getCountry(countryId).cities[0]
  const b0 = newBiz(g, industry, countryId, city, { cash: 250_000, ...opts })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  applyPlan(b, autoPlan(g, b, 1))
  for (let y = 0; y < 2; y++) {
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

function staffer(id: string, focus: KeyStaff['focus'], skill: number, salary: number, trait = 'steady'): KeyStaff {
  return { id, firstName: 'Robin', lastName: 'Vale', gender: 'female', age: 40, role: `Lead ${id}`, focus, skill, salary, trait, morale: 70, years: 2 }
}

/** Every row of a menu tree, depth first (groups' children included). */
function allNodes(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  const out: MenuNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.type === 'menu' && depth < 3) {
      try {
        out.push(...allNodes(g, n.children(g), depth + 1))
      } catch {
        // A submenu that needs more state than the test has.
      }
    }
  }
  return out
}

function hints(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.flatMap((n) => (n.type === 'menu' || n.type === 'action' ? [n.hint?.(g) ?? ''] : [])).filter(Boolean)
}

function lastChoice(g: GameState): ChoiceModal {
  const m = [...g.queue].reverse().find((x): x is ChoiceModal => x.kind === 'choice')
  if (!m) throw new Error('no choice queued')
  return m
}

describe('Business talent: the Annual Report plan', () => {
  it('adds a purple plan only with the talent, inside the report limits, without touching the RNG', () => {
    const plain = company(5, 'us', 'restaurant', false)
    expect(reportData(plain.g, plain.a, plain.b).talentHint).toBeUndefined()

    const { g, a, b } = company(5, 'us', 'restaurant', true)
    const rng = g.rng
    const r = reportData(g, a, b)
    expect(g.rng).toBe(rng)
    const h = r.talentHint
    expect(h).toBeDefined()
    expect(h!.text.startsWith('\u{1F52E}')).toBe(true)
    expect(h!.text).toMatch(/Charge \$[\d,.]+ and make [\d.,K]+ meals/)
    expect(h!.price).toBeGreaterThanOrEqual(r.minPrice)
    expect(h!.price).toBeLessThanOrEqual(r.maxPrice)
    expect(h!.production).toBeGreaterThanOrEqual(0)
    expect(h!.production).toBeLessThanOrEqual(r.maxProduction)
    // Deterministic: asking again gives the same plan.
    expect(reportData(g, a, b).talentHint).toEqual(h)
  })

  it('earns more on average than the suggested plan, across seeds, markets and industries', () => {
    let hinted = 0
    let suggested = 0
    let wins = 0
    let n = 0
    const industries: Industry[] = ['foodTruck', 'restaurant', 'cafe', 'brewery', 'software', 'fashion']
    for (const cid of ['us', 'jp', 'ng', 'de', 'br', 'in']) {
      for (const industry of industries) {
        const { g, a, b } = company(11 + n, cid, industry, true)
        const r = reportData(g, a, b)
        const h = r.talentHint!
        // Same world, same dice: one copy follows the hint, the other the suggested price.
        const gA = structuredClone(g)
        const gB = structuredClone(g)
        const bA = bizOf(gA, findBusiness(gA, a.id)!)
        const bB = bizOf(gB, findBusiness(gB, a.id)!)
        bA.price = h.price
        bA.production = h.production
        bB.price = r.suggestedPrice
        bB.production = Math.max(0, Math.min(r.maxProduction, r.expectedDemand - r.inventory))
        // Stock left over still has (most of) its cost value next year.
        const unit = planFor(g, b, g.year, { calm: true }).unitCost * costFactor(b, true) * 0.85
        const yA = simulateYear(gA, bA, gA.year, b.ownerSalary)
        const yB = simulateYear(gB, bB, gB.year, b.ownerSalary)
        const vA = yA.stmt.net + yA.inventoryEnd * unit
        const vB = yB.stmt.net + yB.inventoryEnd * unit
        for (const v of [vA, vB, h.price, h.production]) expect(Number.isFinite(v)).toBe(true)
        hinted += vA
        suggested += vB
        if (vA >= vB) wins++
        n++
      }
    }
    expect(hinted).toBeGreaterThan(suggested)
    expect(wins / n).toBeGreaterThan(0.7)
  })

  it('never suggests anything absurd for a brand-new or struggling company', () => {
    const { g, a, b } = company(21, 've', 'foodTruck', true)
    b.cash = -50_000
    b.history = []
    b.last = null
    const p = bestPlan(g, b, { ownerDraw: b.ownerSalary })
    for (const v of [p.price, p.production, p.profit, p.demand]) expect(Number.isFinite(v)).toBe(true)
    expect(p.price).toBeGreaterThan(0)
    expect(p.production).toBeGreaterThanOrEqual(0)
    expect(reportData(g, a, b).talentHint?.text).toMatch(/\u{1F52E}/u)
  })
})

/** The value of what a choice actually did to the company (the same yardstick the hints use). */
function measure(g0: GameState, g1: GameState, assetId: string, arrestSeverity: number): number {
  const b0 = readBiz(g0, findBusiness(g0, assetId)!)
  const w = bizWorth(g0, b0)
  const a1 = findBusiness(g1, assetId)
  if (!a1) throw new Error('business gone')
  const b1 = readBiz(g1, a1)
  const cost: Record<string, number> = { budget: 0.86, standard: 1, premium: 1.18 }
  const tier: Record<string, number> = { budget: -12, standard: 0, premium: 12 }
  const fx: BizFx = {
    cash: b1.cash - b0.cash,
    brand: b1.brand - b0.brand,
    quality: b1.quality - b0.quality,
    morale: b1.morale - b0.morale,
    demandTo: b1.demandShock,
    capacityTo: b1.capacityLoss,
    costSet: b1.costShock,
    pressureTo: b1.pressure,
    priceCut: b0.price > 0 ? Math.max(0, 1 - b1.price / b0.price) : 0,
    wage: b1.wageLevel - b0.wageLevel,
    karma: g1.character.hidden.karma - g0.character.hidden.karma,
    arrest: (g1.counters.arrests ?? 0) > (g0.counters.arrests ?? 0) ? arrestSeverity : 0,
    ...(b1.supplier !== b0.supplier ? { costFactor: cost[b1.supplier] / cost[b0.supplier], qualityTarget: tier[b1.supplier] - tier[b0.supplier] } : {}),
  }
  let v = fxValue(g0, b0, w, fx)
  // Key people: what they add (minus pay) over the years they stay.
  const team = (b: BizState) => b.staff.reduce((t, s) => t + staffNet(g0, b0, w, s), 0) * LASTING_YEARS
  v += team(b1) - team(b0)
  return v
}

interface Setup {
  id: string
  /** Variant check on the queued popup (e.g. the good or bad viral review). */
  title?: RegExp
  country?: string
  industry?: Industry
  arrest?: number
  prep?: (b: BizState) => void
}

const SETUPS: Setup[] = [
  { id: 'inspection', industry: 'restaurant', country: 'mx', arrest: 2 },
  { id: 'audit', country: 'ng', arrest: 2 },
  { id: 'audit', country: 'us', arrest: 3, prep: (b) => (b.cooked = 2) },
  { id: 'strike', prep: (b) => (b.morale = 25) },
  { id: 'viral', title: /Gone Viral/, prep: (b) => (b.quality = 80) },
  { id: 'viral', title: /Viral Review/, prep: (b) => (b.quality = 20) },
  { id: 'competitor' },
  { id: 'supplier', industry: 'restaurant' },
  { id: 'currency', country: 'ar' },
  { id: 'celebrity' },
  { id: 'lawsuit' },
  { id: 'disaster' },
  { id: 'tacos' },
  { id: 'poached', prep: (b) => b.staff.push(staffer('k1', 'sales', 85, 30_000)) },
  { id: 'poached', prep: (b) => b.staff.push(staffer('k2', 'finance', 20, 140_000, 'lazy')) },
  { id: 'embezzle', prep: (b) => b.staff.push(staffer('k3', 'finance', 70, 45_000, 'shady')) },
]

describe('Business talent: popup hints', () => {
  it('marks exactly one choice, only with the talent, and never changes the dice', () => {
    for (const s of SETUPS) {
      for (const talent of [false, true]) {
        const { g, a, b } = company(31, s.country ?? 'us', s.industry ?? 'cafe', talent)
        s.prep?.(b)
        businessEventInternals.present(g, a, b, s.id)
        const m = lastChoice(g)
        const hinted = m.choices.filter((c) => c.hint)
        if (!talent) expect(hinted, s.id).toHaveLength(0)
        else {
          expect(hinted, s.id).toHaveLength(1)
          expect(hinted[0].hint!.startsWith('\u{1F52E}')).toBe(true)
        }
      }
      // Same seed with and without the talent: the hint costs no randomness.
      const x = company(32, s.country ?? 'us', s.industry ?? 'cafe', false)
      const y = company(32, s.country ?? 'us', s.industry ?? 'cafe', true)
      s.prep?.(x.b)
      s.prep?.(y.b)
      x.g.rng = y.g.rng = 777
      businessEventInternals.present(x.g, x.a, x.b, s.id)
      businessEventInternals.present(y.g, y.a, y.b, s.id)
      expect(y.g.rng, s.id).toBe(x.g.rng)
    }
  })

  it("points at the choice that works out best under the resolvers' own odds", () => {
    const RUNS = 160
    for (const s of SETUPS) {
      let found: { g: GameState; a: Asset; m: ChoiceModal } | null = null
      for (let seed = 40; seed < 80 && !found; seed++) {
        const { g, a, b } = company(seed, s.country ?? 'us', s.industry ?? 'cafe', true)
        s.prep?.(b)
        businessEventInternals.present(g, a, b, s.id)
        const m = lastChoice(g)
        if (!s.title || s.title.test(m.title)) found = { g, a, m }
      }
      expect(found, s.id).not.toBeNull()
      const { g, a, m } = found!
      g.queue = []
      const means = new Map<string, number>()
      const vars = new Map<string, number>()
      for (const c of m.choices) {
        let sum = 0
        let sq = 0
        for (let i = 0; i < RUNS; i++) {
          const g1 = structuredClone(g)
          g1.rng = 1_000 + i * 7919 // the same dice for every choice
          runScript(g1, m.scriptId!, c.id, m.data, m)
          const v = measure(g, g1, a.id, s.arrest ?? 2)
          sum += v
          sq += v * v
        }
        const mean = sum / RUNS
        means.set(c.id, mean)
        vars.set(c.id, Math.max(0, sq / RUNS - mean * mean))
      }
      const best = [...means.entries()].sort((x, y) => y[1] - x[1])[0]
      const pick = m.choices.find((c) => c.hint)!.id
      const se = Math.sqrt((vars.get(pick)! + vars.get(best[0])!) / RUNS)
      const scale = Math.max(...[...means.values()].map(Math.abs), 1)
      // The hinted choice is the best one, or statistically tied with it.
      expect(means.get(pick)!, `${s.id}: hinted ${pick} ${Math.round(means.get(pick)!)} vs best ${best[0]} ${Math.round(best[1])}`).toBeGreaterThanOrEqual(best[1] - 3 * se - scale * 0.06)
    }
  })

  it('prices a buyout against what the company is worth', () => {
    const { g, a, b } = company(51, 'us', 'cafe', true)
    let saw = { accept: false, counter: false }
    for (let i = 0; i < 40; i++) {
      g.queue = []
      g.rng = 500 + i * 31
      businessEventInternals.present(g, a, b, 'buyout')
      const m = lastChoice(g)
      const offer = Number((m.data as { offer: number }).offer)
      const pick = m.choices.find((c) => c.hint)!.id
      // Taking it is worth (offer - value); countering wins 15% more half the time.
      const accept = offer - b.valuation
      const counter = 0.5 * (offer * 1.15 - b.valuation)
      expect(pick).toBe(accept >= counter ? 'accept' : 'counter')
      saw = { ...saw, [pick]: true }
    }
    expect(saw.accept || saw.counter).toBe(true)
  })

  it('advises the cheapest honest way out of a cash crunch', () => {
    const { b } = company(52, 'us', 'cafe', true)
    b.cash = -40_000
    b.share = 1
    const v = crunchValues(b)
    expect(v.cover).toBeGreaterThan(v.loan)
    expect(v.cover).toBeGreaterThan(v.bankrupt)
    b.share = 0.5
    // With partners, covering the hole yourself subsidizes them: an investor is fairer.
    const w = crunchValues(b)
    expect(w.investor).toBeGreaterThan(w.cover)
  })
})

describe('Business talent: the company screen', () => {
  it('shows purple advice on the rows that matter, only with the talent', () => {
    const plain = company(61, 'us', 'restaurant', false)
    expect(hints(plain.g, allNodes(plain.g, businessView(plain.g, plain.a)))).toHaveLength(0)

    const { g, a } = company(61, 'us', 'restaurant', true)
    const rng = g.rng
    const nodes = allNodes(g, businessView(g, a))
    const lines = hints(g, nodes)
    expect(g.rng).toBe(rng)
    expect(lines.length).toBeGreaterThan(5)
    for (const id of [`biz.plan.${a.id}`, `biz.marketing.${a.id}`, `biz.products.${a.id}`, `biz.expand.${a.id}`, `biz.hireMenu.${a.id}`, `biz.insurance.${a.id}`]) {
      const n = nodes.find((x) => x.id === id)
      expect(n, id).toBeDefined()
      expect(n!.type === 'menu' || n!.type === 'action' ? n!.hint?.(g) : null, id).toMatch(/^\u{1F52E}/u)
    }
    // Exactly one marketing budget row is the best one.
    const budgets = nodes.filter((n) => n.id.startsWith(`biz.budget.`) && (n.type === 'action' ? n.hint?.(g) : null))
    expect(budgets).toHaveLength(1)
  })

  it('keeps hints off companies the player cannot manage (prison)', () => {
    const { g, a } = company(62, 'us', 'restaurant', true)
    g.character.prison = { years: 3, served: 0, security: 'minimum', crime: 'Fraud' } as unknown as GameState['character']['prison']
    const nodes = allNodes(g, businessView(g, a))
    expect(nodes.filter((n) => n.id === `biz.plan.${a.id}`).every((n) => n.type !== 'action' || !n.hint?.(g))).toBe(true)
  })
})

describe('Business talent: the growth perk', () => {
  it('brings 6% more customers and a sharper CEO while you run it yourself', () => {
    const x = company(71, 'us', 'cafe', false)
    const y = company(71, 'us', 'cafe', true)
    const bx = readBiz(x.g, x.a)
    const by = { ...bx }
    expect(appealOf(y.g, by, y.g.year) / appealOf(x.g, bx, x.g.year)).toBeGreaterThan(TALENT_DEMAND * 1.0)
    expect(ceoSkill(y.g, by)).toBeGreaterThan(ceoSkill(x.g, bx))
    // Handing the company to a manager hands the perk back.
    const managed = { ...by, ceo: 'manager' as const, manager: { firstName: 'Pat', lastName: 'Lee', gender: 'male' as const, skill: 60, salary: 90_000, since: 2030 } }
    const managedPlain = { ...managed }
    expect(appealOf(y.g, managed, y.g.year)).toBeCloseTo(appealOf(x.g, managedPlain, x.g.year), 6)
  })
})

describe('Business talent: hot industries', () => {
  it('names at most three of the fastest-paying industries in a city, only with the talent', () => {
    const { g } = company(95, 'us', 'cafe', true)
    const city = getCountry('us').cities[0]
    const marked = INDUSTRY_IDS.filter((id) => industryHint(g, id, 'us', city))
    expect(marked.length).toBeGreaterThan(0)
    expect(marked.length).toBeLessThanOrEqual(3)
    const top = hotIndustries(g, 'us', city)
    expect(marked).toEqual(expect.arrayContaining(top.map((x) => x.industry)))
    for (let i = 1; i < top.length; i++) expect(top[i].payback).toBeGreaterThanOrEqual(top[i - 1].payback)
    expect(industryHint(g, top[0].industry, 'us', city)).toMatch(/^\u{1F52E} The hottest bet in/u)
    g.character.talents = []
    expect(INDUSTRY_IDS.filter((id) => industryHint(g, id, 'us', city))).toHaveLength(0)
  })
})

describe('Business talent: robustness', () => {
  it('gives finite plans and hints for every industry in very different markets', () => {
    for (const industry of INDUSTRY_IDS) {
      for (const cid of ['us', 've', 'ng']) {
        if (industryDemand(cid, industry) <= 0) continue
        const { g, a, b } = company(91, cid, industry, true)
        const p = bestPlan(g, b, { quick: true, ownerDraw: b.ownerSalary })
        for (const v of [p.price, p.production, p.profit, p.demand]) expect(Number.isFinite(v), `${industry} ${cid}`).toBe(true)
        const w = bizWorth(g, b)
        for (const v of Object.values(w)) expect(Number.isFinite(v), `${industry} ${cid} worth`).toBe(true)
        for (const h of hints(g, allNodes(g, businessView(g, a), 1))) expect(h, `${industry} ${cid}`).not.toMatch(/NaN|undefined|Infinity/)
      }
    }
  }, 120_000)
})

describe('Business talent: old saves', () => {
  it('works on characters saved before talents existed', () => {
    const { g, a, b } = company(81, 'us', 'cafe', false)
    delete (g.character as { talents?: string[] }).talents
    expect(reportData(g, a, b).talentHint).toBeUndefined()
    expect(hints(g, allNodes(g, businessView(g, a)))).toHaveLength(0)
  })
})
