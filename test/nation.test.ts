// Politics 2.0 (src/game/nation/): laws that reach the economy, trade, companies and taxes; pure
// menus; era and country gates on menus AND resolvers; honest odds; money conservation for dirty
// money; old saves.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { netWorth } from '../src/game/core'
import { economyOf } from '../src/game/economy'
import { initialCountry } from '../src/game/economy/model'
import { advanceCountry, worldConditions } from '../src/game/economy/simulation'
import { gameIncomeTax } from '../src/game/finance'
import { nationalMarket } from '../src/game/business/dynamics'
import { allocatedCorporateTax } from '../src/game/business/tax'
import { capitalGainsRate } from '../src/game/business/exit'
import { localPriceMult, isIndustryLegal } from '../src/game/data/markets'
import { tariffOn } from '../src/game/business/market-trade'
import { runScript } from '../src/game/scripts'
import { specialJobNodes } from '../src/game/special'
import { nationOverlay, personalTax } from '../src/game/nation/effects'
import { applyMeasure, deskMeasure, leanOf, measureBlock, previewOf, propose, resolveBill, type Measure } from '../src/game/nation/govern'
import { voteOdds } from '../src/game/nation/legislature'
import { officeView, powerFor } from '../src/game/nation/office'
import { tradeOverlay, tariffWith } from '../src/game/nation/trade-policy'
import { editMe, editPolicy, meView, policyOf, writeMe, writePolicy, ME_KEY, POLICY_KEY } from '../src/game/nation/state'
import { bringHome, moveOffshore, runScheme, schemeBlock, schemeOf, schemeQuote, SCHEMES } from '../src/game/nation/graft'
import { regimeBlock } from '../src/game/nation/regime'
import { buildReport, approvalTarget } from '../src/game/nation/yearly'
import { readNationReport } from '../src/ui/minigames/NationReport'
import type { ChoiceModal, GameState, MenuNode } from '../src/game/types'
import { newLeader } from './politics-kit'

const BAD = /\bNaN\b|\bundefined\b|\[object Object\]|-?Infinity/

function office(g: GameState, officeId: 'mayor' | 'governor' | 'leader', title: string): GameState {
  g.character.job = { ...g.character.job!, title, level: { mayor: 1, governor: 2, leader: 3 }[officeId], data: { ...g.character.job!.data, office: officeId } }
  return g
}

/** Walk every menu row, caption and slider preview; collect text. */
function walk(g: GameState, nodes: MenuNode[], out: string[] = [], depth = 0): string[] {
  for (const n of nodes) {
    if (n.visible && !n.visible(g)) continue
    if (n.type === 'info') { out.push(typeof n.text === 'function' ? n.text(g) : n.text); continue }
    if (n.type === 'heading') { out.push(n.label); continue }
    out.push(n.label)
    if (typeof n.subtitle === 'function') out.push(n.subtitle(g))
    const why = n.disabledReason?.(g)
    if (why) out.push(why)
    if (n.type === 'menu') {
      if (n.header) out.push(n.header(g))
      if (depth < 6) walk(g, n.children(g), out, depth + 1)
    } else if (n.input?.preview && n.input.min !== undefined && n.input.max !== undefined) {
      out.push(n.input.preview(g, n.input.min), n.input.preview(g, n.input.max))
    }
  }
  return out
}

function choices(g: GameState): ChoiceModal[] {
  return g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')
}

describe('old saves and untouched countries', () => {
  it('changes nothing until a government passes a law', () => {
    const g = newLeader(3, 'us', 2001)
    expect(g.flags[POLICY_KEY]).toBeUndefined()
    expect(nationOverlay(g, 'us', g.year)).toBeNull()
    expect(tradeOverlay(g)).toBeNull()
    expect(personalTax(g, 'income')).toBe(0)
    const old = initialCountry('us', 2000), world = worldConditions({ us: old })
    const a = advanceCountry(old, 'us', 2001, 'seed', world)
    const b = advanceCountry(old, 'us', 2001, 'seed', world, [], [], { us: old }, null)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('loads damaged records without throwing and without inventing money', () => {
    const g = newLeader(4)
    g.flags[POLICY_KEY] = { v: 1, countries: { us: { v: 1, national: { taxes: { income: 'x', corporate: 999 } }, tariffs: [{ input: 'nope' }], legislature: { seats: { progressive: -1 } } }, zz: {} } }
    g.flags[ME_KEY] = { owner: 'someone-else', dirty: 1e9 }
    const p = policyOf(g, 'us')
    expect(p.national.taxes.corporate).toBe(20)
    expect(p.national.taxes.income).toBeUndefined()
    expect(p.tariffs).toEqual([])
    expect(meView(g).dirty).toBe(0)
    expect(() => walk(g, specialJobNodes(g))).not.toThrow()
  })

  it('keeps laws for heirs but gives them a clean personal record', () => {
    const g = newLeader(5)
    const p = editPolicy(g, 'us')
    p.national.taxes.income = 5
    writePolicy(g, p)
    const me = editMe(g)
    me.dirty = 50_000
    writeMe(g, me)
    g.generation = (g.generation ?? 0) + 1
    g.character.id = 'heir'
    expect(policyOf(g, 'us').national.taxes.income).toBe(5)
    expect(meView(g).dirty).toBe(0)
  })
})

describe('menus are pure and readable', () => {
  for (const [country, year, officeId, title] of [['us', 2001, 'leader', 'President'], ['gb', 1975, 'leader', 'Prime Minister'], ['gb', 2015, 'governor', 'Member of Parliament'], ['us', 1960, 'governor', 'Governor'], ['br', 1990, 'mayor', 'Mayor'], ['ng', 2020, 'leader', 'President']] as const) {
    it(`${title} of ${country} in ${year}`, () => {
      const g = office(newLeader(6, country, year), officeId, title)
      const before = JSON.stringify(g)
      const rng = g.rng
      const text = walk(g, specialJobNodes(g))
      expect(JSON.stringify(g)).toBe(before)
      expect(g.rng).toBe(rng)
      expect(text.join('\n')).not.toMatch(BAD)
      if (officeId === 'leader') expect(text.some(t => /Govern|Taxes|Budget/.test(t))).toBe(true)
    })
  }
})

describe('era and country gates hold on menus and resolvers', () => {
  it('no carbon tax, space budget, cannabis or passport sales before their time', () => {
    const g = newLeader(7, 'us', 1950)
    const texts = walk(g, specialJobNodes(g)).join('\n')
    expect(texts).not.toMatch(/Carbon tax|Space program|cannabis/i)
    const carbon: Measure = { k: 'newTax', id: 'carbon', level: 1, industry: '' }
    expect(measureBlock(g, carbon)).toMatch(/1950/)
    expect(resolveBill(g, carbon, 'none')).toBe(false)
    expect(policyOf(g, 'us').newTaxes.carbon).toBeUndefined()
    expect(measureBlock(g, { k: 'budget', scope: 'national', id: 'space', level: 1.5 })).toBeTruthy()
    expect(measureBlock(g, { k: 'legal', id: 'cannabis', value: 1 })).toBeTruthy()
    expect(measureBlock(g, { k: 'tariff', input: 'technology', partner: 'all', add: 10 })).toBeTruthy()
    expect(schemeBlock(g, schemeOf('passports')!)).toMatch(/1950/)
  })

  it('a mayor cannot touch national taxes or trade', () => {
    const g = office(newLeader(8, 'us', 2001), 'mayor', 'Mayor')
    expect(measureBlock(g, { k: 'tax', scope: 'national', id: 'income', value: 2 })).toBeTruthy()
    expect(measureBlock(g, { k: 'tariff', input: 'all', partner: 'all', add: 10 })).toBeTruthy()
    expect(measureBlock(g, { k: 'tax', scope: 'city', id: 'property', value: .5 })).toBeNull()
  })

  it('strong institutions make the worst power grabs impossible', () => {
    const g = newLeader(9, 'se', 2001)
    const me = editMe(g)
    me.fear = 90; me.loyalty = 95
    writeMe(g, me)
    expect(regimeBlock(g, 'selfCoup')).toMatch(/never go along/)
    expect(regimeBlock(g, 'termLimits')).toMatch(/never go along/)
    const weak = newLeader(9, 've', 2001)
    const m2 = editMe(weak)
    m2.fear = 90; m2.loyalty = 95
    writeMe(weak, m2)
    expect(regimeBlock(weak, 'selfCoup')).toBeNull()
  })
})

function withPolicy(g: GameState, m: Measure, since = g.year - 1): GameState {
  const h = structuredClone(g)
  const p = editPolicy(h, 'us')
  applyMeasure(h, p, m, officeView(h))
  for (const k of Object.keys(p.since)) p.since[k] = since
  writePolicy(h, p)
  return h
}

describe('laws reach the economy, trade and companies', () => {
  it('a big corporate tax raises revenue and slows growth in the next transition', () => {
    const g = newLeader(10, 'us', 2001)
    ageUp(g); g.queue = []
    const base = structuredClone(g), taxed = withPolicy(g, { k: 'tax', scope: 'national', id: 'corporate', value: 15 }, g.year)
    ageUp(base); ageUp(taxed)
    const a = economyOf(base, 'us'), b = economyOf(taxed, 'us')
    expect(b.budget.revenue).toBeGreaterThan(a.budget.revenue + .01)
    expect(b.growth).toBeLessThan(a.growth)
    expect(b.unemployment).toBeGreaterThan(a.unemployment)
  })

  it('a spending spree with tax cuts piles up debt and costs the credit rating', () => {
    const g = newLeader(11, 'us', 2001)
    ageUp(g); g.queue = []
    let h = withPolicy(g, { k: 'tax', scope: 'national', id: 'income', value: -15 }, g.year)
    h = withPolicy(h, { k: 'budget', scope: 'national', id: 'welfare', level: 2 }, g.year)
    h = withPolicy(h, { k: 'budget', scope: 'national', id: 'military', level: 2 }, g.year)
    const base = structuredClone(g)
    for (let i = 0; i < 5; i++) { base.yearActions = {}; h.yearActions = {}; ageUp(base); ageUp(h); base.queue = []; h.queue = [] }
    expect(economyOf(h, 'us').governmentDebt).toBeGreaterThan(economyOf(base, 'us').governmentDebt + .2)
    const order = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D']
    expect(order.indexOf(policyOf(h, 'us').rating)).toBeGreaterThan(order.indexOf(policyOf(base, 'us').rating || 'AAA'))
  })

  it('tariffs protect home industry, raise import costs and feed the trade network', () => {
    const g = newLeader(12, 'us', 2001)
    ageUp(g); g.queue = []
    const t = withPolicy(g, { k: 'tariff', input: 'industry', partner: 'all', add: 40 }, g.year)
    expect(nationalMarket(t, 'manufacturing', 'us', t.year).demand).toBeGreaterThan(nationalMarket(g, 'manufacturing', 'us', g.year).demand)
    expect(tariffWith(t, 'cn', 'us', t.year, 'manufacturing')).toBeCloseTo(tariffOn('cn', 'us', t.year) + .4, 5)
    expect(localPriceMult(t, 'car')).toBeGreaterThan(localPriceMult(g, 'car'))
    const base = structuredClone(g)
    ageUp(base); ageUp(t)
    expect(economyOf(t, 'us').tradeNetwork.inputs.industry.tariff).toBeGreaterThan(economyOf(base, 'us').tradeNetwork.inputs.industry.tariff + .1)
    expect(economyOf(t, 'us').tradeNetwork.inputs.industry.cost).toBeGreaterThan(economyOf(base, 'us').tradeNetwork.inputs.industry.cost)
  })

  it('partners retaliate, and their tariffs cut our export orders', () => {
    let hit = 0
    for (let seed = 20; seed < 30 && !hit; seed++) {
      const g = newLeader(seed, 'us', 2001)
      ageUp(g); g.queue = []
      resolveBill(g, { k: 'tariff', input: 'all', partner: 'cn', add: 50 }, 'none')
      hit += policyOf(g, 'us').retaliation.filter(r => r.from === 'cn').length
      if (hit) {
        const base = structuredClone(g)
        const p = editPolicy(base, 'us'); p.retaliation = []; writePolicy(base, p)
        expect(tradeOverlay(g)!.tariff('us', 'cn', 'industry')).toBeGreaterThan(0)
        ageUp(base); ageUp(g)
        const exports = (x: GameState) => economyOf(x, 'us').tradeNetwork.inputs.technology.exportDemand + economyOf(x, 'us').tradeNetwork.inputs.industry.exportDemand
        expect(exports(g)).toBeLessThanOrEqual(exports(base))
      }
    }
    expect(hit).toBeGreaterThan(0)
  })

  it('companies pay the corporate rate, windfall taxes and breaks of their own industry', () => {
    const g = newLeader(13, 'us', 2001)
    const before = allocatedCorporateTax('us', 1e7, 1e8, 0, 0, g, g.year, 'energy')
    const p = editPolicy(g, 'us')
    p.national.taxes.corporate = 5
    p.newTaxes.windfall = { level: 2, industry: 'energy' }
    p.breaks.software = 2
    writePolicy(g, p)
    expect(allocatedCorporateTax('us', 1e7, 1e8, 0, 0, g, g.year, 'energy')).toBeCloseTo(before + 1e7 * (.05 + .2), -2)
    expect(allocatedCorporateTax('us', 1e7, 1e8, 0, 0, g, g.year, 'software')).toBeCloseTo(before + 1e7 * (.05 - .1), -2)
  })

  it('bans close an industry; legalizing opens one', () => {
    const g = newLeader(14, 'us', 2001)
    expect(isIndustryLegal('us', 'bar', g)).toBe(true)
    const p = editPolicy(g, 'us')
    p.legal.prohibition = -1
    writePolicy(g, p)
    expect(isIndustryLegal('us', 'bar', g)).toBe(false)
    expect(nationalMarket(g, 'brewery', 'us', g.year).demand).toBeLessThan(.1)
  })
})

describe('personal taxes follow the law where you live', () => {
  it('income, capital gains, wealth and property taxes reach the player', () => {
    const g = newLeader(15, 'us', 2001)
    const income = gameIncomeTax(g, 200_000), gains = capitalGainsRate(g)
    const p = editPolicy(g, 'us')
    p.national.taxes.income = 5
    p.national.taxes.capitalGains = 10
    p.national.taxes.wealth = 2
    writePolicy(g, p)
    expect(gameIncomeTax(g, 200_000)).toBeCloseTo(income + 195_000 * .05, -1)
    expect(capitalGainsRate(g)).toBeCloseTo(gains + .1, 5)
    g.character.money = 100_000_000
    const cash = g.character.money
    ageUp(g)
    expect(g.character.money).toBeLessThan(cash)
  })
})

describe('votes: the odds shown are the odds rolled', () => {
  it('pass frequency matches the displayed probability', () => {
    const g = newLeader(16, 'gb', 2001)
    office(g, 'governor', 'Member of Parliament')
    const m: Measure = { k: 'tax', scope: 'national', id: 'income', value: 3 }
    const v = officeView(g)!
    const odds = voteOdds(g, v, powerFor(v, 'tax')!, leanOf(policyOf(g, 'gb'), m)).pass
    propose(g, m)
    const c = choices(g)[0]
    expect(c.choices[0].label).toContain(`${Math.round(odds * 100)}%`)
    let passed = 0
    const n = 300
    for (let i = 0; i < n; i++) {
      const h = structuredClone(g)
      h.queue = []
      h.rng = (g.rng + i * 7919) >>> 0
      if (resolveBill(h, m, 'none')) passed++
    }
    const vetoFree = passed / n
    expect(Math.abs(vetoFree - odds)).toBeLessThan(.1)
  })

  it('previews come from the same overlay the economy uses', () => {
    const g = newLeader(17, 'us', 2001)
    const m: Measure = { k: 'budget', scope: 'national', id: 'healthcare', level: 1.5 }
    const prev = previewOf(g, m)
    expect(prev.lines.join(' ')).toMatch(/Spending \+/)
    expect(prev.groups.retirees ?? 0).toBeGreaterThan(0)
  })

  it('named desk bills map to real measures', () => {
    const g = office(newLeader(18, 'us', 2001), 'governor', 'Governor')
    expect(deskMeasure(g, 'Raise the minimum wage')).toMatchObject({ k: 'minWage', scope: 'regional' })
    const lead = newLeader(18, 'us', 2001)
    expect(deskMeasure(lead, 'A national carbon tax')).toMatchObject({ k: 'newTax', id: 'carbon' })
  })
})

describe('dirty money is conserved', () => {
  it('schemes add only to the slush fund; offshore and home transfers lose their cut', () => {
    const g = newLeader(19, 'us', 2001)
    const cash = g.character.money, worth = netWorth(g)
    const v = officeView(g)!
    const q = schemeQuote(g, v, schemeOf('kickbacks')!, .3)
    const took = runScheme(g, 'kickbacks', .3)
    const me = meView(g)
    expect(g.character.money).toBe(cash)
    expect(netWorth(g)).toBe(worth)
    if (took) { expect(took).toBe(q.take); expect(me.dirty).toBe(q.take); expect(me.taken).toBe(q.take) }
    else expect(me.cases.some(c => c.status === 'pending')).toBe(true)
    const m = editMe(g); m.dirty = 1_000_000; writeMe(g, m)
    g.yearActions = {}
    const moved = moveOffshore(g, 1_000_000)
    const after = meView(g)
    expect(after.dirty).toBe(0)
    if (moved) expect(after.offshore).toBe(880_000)
    else expect(after.seized).toBeGreaterThanOrEqual(1_000_000)
    const m2 = editMe(g); m2.offshore = 500_000; writeMe(g, m2)
    const before = g.character.money
    if (bringHome(g, 500_000)) expect(g.character.money - before).toBe(400_000)
    expect(meView(g).offshore).toBe(0)
  })

  it('no scheme is risk-free, and the take never exceeds its cap', () => {
    for (const country of ['us', 'ng', 'se']) {
      const g = newLeader(21, country, 2010)
      const v = officeView(g)!
      for (const s of SCHEMES) for (const size of [.1, .5, 1]) {
        const q = schemeQuote(g, v, s, size)
        expect(q.caught).toBeGreaterThan(0)
        expect(q.take).toBeLessThanOrEqual(q.cap)
        expect(Number.isFinite(q.take)).toBe(true)
      }
    }
  })
})

describe('the State of the Nation', () => {
  it('builds a readable report that the card parses', () => {
    const g = newLeader(22, 'us', 2001)
    resolveBill(g, { k: 'tax', scope: 'national', id: 'corporate', value: 10 }, 'none')
    ageUp(g)
    const v = officeView(g)
    if (!v) return
    const r = buildReport(g, v)
    expect(JSON.stringify(r)).not.toMatch(BAD)
    const parsed = readNationReport(JSON.parse(JSON.stringify(r)))
    expect(parsed.metrics.length).toBeGreaterThan(3)
    expect(parsed.groups.length).toBe(6)
    expect(readNationReport({ metrics: 'x', groups: [{ value: NaN }] }).groups).toEqual([])
  })

  it('bad policy visibly hurts: approval heads down as the economy sours', () => {
    const g = newLeader(23, 'us', 2001)
    ageUp(g); g.queue = []
    const bad = withPolicy(g, { k: 'tax', scope: 'national', id: 'corporate', value: 20 }, g.year)
    const worse = withPolicy(bad, { k: 'labor', value: 1 }, g.year)
    const v = officeView(worse)!
    expect(approvalTarget(worse, v).groups.business).toBeLessThan(approvalTarget(g, officeView(g)!).groups.business)
  })
})
