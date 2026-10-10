import { describe, expect, it } from 'vitest'
import { initialCountry, normalizeCountry, type CountryEconomy } from '../src/game/economy/model'
import { advanceCountry, worldConditions } from '../src/game/economy/simulation'
import { countryTrade, initialTrade, normalizeTrade, sectorTrade, TRADE_INPUTS } from '../src/game/economy/trade'
import { tariffOn } from '../src/game/business/market-trade'
import { COUNTRIES } from '../src/game/world'

function frame(year = 2030): Record<string, CountryEconomy> {
  return Object.fromEntries(COUNTRIES.map(c => [c.id, initialCountry(c.id, year)]))
}
function advance(opening: Record<string, CountryEconomy>, country: string, year = opening[country].year + 1) {
  return advanceCountry(opening[country], country, year, 'connected-trade-test', worldConditions(opening), [], [], opening)
}

describe('World Simulation 2.0: connected international procurement', () => {
  it('records distinct major partners for chips and fuel, gated by their historical era', () => {
    const modern = initialTrade('jp', 2030), early = initialTrade('jp', 1930)
    expect(modern.inputs.technology.routes.some(r => r.partner === 'tw')).toBe(true)
    expect(modern.inputs.technology.routes.some(r => r.partner === 'kr')).toBe(true)
    expect(modern.inputs.energy.routes.some(r => ['sa','kw','ae'].includes(r.partner))).toBe(true)
    expect(early.inputs.technology.routes).toEqual([])
    expect(early.inputs.technology.dependence).toBe(0)
    expect(early.inputs.energy.routes.some(r => ['sa','ae','kw','qa'].includes(r.partner))).toBe(false)
    for (const input of TRADE_INPUTS) {
      expect(modern.inputs[input].routes.length).toBeLessThanOrEqual(3)
      expect(modern.inputs[input].routes.some(r => r.partner === 'jp')).toBe(false)
      expect(modern.inputs[input].routes.reduce((sum,r) => sum + r.share, 0)).toBeCloseTo(1, 6)
    }
  })

  it('a chip exporter outage reduces dependent importers actual production and raises their costs', () => {
    const normal = frame(), shortage = structuredClone(normal)
    normal.jp.sectors.technology.stock = shortage.jp.sectors.technology.stock = 0
    normal.jp.sectors.industry.stock = shortage.jp.sectors.industry.stock = 0
    for (const route of shortage.jp.tradeNetwork.inputs.technology.routes) {
      shortage[route.partner].sectors.technology.output = 0
      shortage[route.partner].sectors.technology.costs = 2
    }
    const before = advance(normal, 'jp'), after = advance(shortage, 'jp')
    expect(after.tradeNetwork.inputs.technology.availability).toBe(0)
    expect(sectorTrade(after.tradeNetwork, 'technology').importedGap).toBeGreaterThan(.25)
    for (const sector of ['industry','technology'] as const) {
      expect(after.sectors[sector].availability).toBeLessThan(before.sectors[sector].availability)
      expect(after.sectors[sector].output).toBeLessThan(before.sectors[sector].output)
      expect(after.sectors[sector].costs).toBeGreaterThan(before.sectors[sector].costs)
    }
    const domestic = structuredClone(shortage)
    domestic.jp.tradeNetwork.inputs.technology.dependence = 0
    expect(advance(domestic, 'jp').sectors.technology.output).toBeGreaterThan(after.sectors.technology.output)
  })

  it('authoritative US-China tariffs affect committed input prices and deliveries, not just a label', () => {
    const opening = frame(2017), network = opening.us.tradeNetwork
    network.inputs.industry.routes = [{ partner: 'cn', share: 1 }]
    network.inputs.industry.dependence = .8
    const before = countryTrade(opening, 'us', 2017, network), after = countryTrade(opening, 'us', 2018, network)
    expect(before.inputs.industry.tariff).toBeCloseTo(tariffOn('cn','us',2017),6)
    expect(after.inputs.industry.tariff).toBeCloseTo(tariffOn('cn','us',2018),6)
    expect(after.inputs.industry.cost).toBeGreaterThan(before.inputs.industry.cost)
    expect(after.inputs.industry.availability).toBeLessThan(before.inputs.industry.availability)
    expect(sectorTrade(after,'industry').importedGap).toBeGreaterThan(sectorTrade(before,'industry').importedGap)
  })

  it('keeps customs unions authoritative and never invents a tariff between their members', () => {
    const opening = frame(2000)
    for (const input of TRADE_INPUTS) opening.de.tradeNetwork.inputs[input].routes = [{ partner: 'fr', share: 1 }]
    const current = countryTrade(opening,'de',2001)
    for (const input of TRADE_INPUTS) expect(current.inputs[input].tariff).toBe(0)
    const historic = countryTrade(opening,'de',1967)
    expect(historic.inputs.industry.tariff).toBeGreaterThan(0)
  })

  it('settles old routes before switching, with at most three suppliers and a capped new contract', () => {
    const opening = frame(), old = opening.jp.tradeNetwork
    const original = old.inputs.technology.routes.map(r => r.partner)
    for (const partner of original) opening[partner].sectors.technology.output = 0
    const first = countryTrade(opening,'jp',2031)
    expect(first.inputs.technology.availability).toBe(0)
    const fresh = first.inputs.technology.routes.filter(r => !original.includes(r.partner))
    expect(fresh).toHaveLength(1)
    expect(fresh[0].share).toBeLessThanOrEqual(.12)
    expect(first.inputs.technology.routes.length).toBeLessThanOrEqual(3)
    const second = countryTrade(opening,'jp',2032,first)
    expect(second.inputs.technology.availability).toBeGreaterThan(0)
    expect(second.inputs.technology.availability).toBeLessThan(.15)
    expect(second.inputs.technology.routes.reduce((sum,r) => sum+r.share,0)).toBeCloseTo(1,6)
  })

  it('domestic substitution needs prior disruption, spare equipment and available finance', () => {
    const base = frame(), prepared = structuredClone(base), noCredit = structuredClone(base)
    for (const opening of [base,prepared,noCredit]) opening.jp.tradeNetwork.inputs.technology.availability = .2
    prepared.jp.sectors.technology.capacity = noCredit.jp.sectors.technology.capacity = 2
    noCredit.jp.credit = .25
    const ordinary = countryTrade(base,'jp',2031), local = countryTrade(prepared,'jp',2031), frozen = countryTrade(noCredit,'jp',2031)
    expect(local.inputs.technology.dependence).toBeLessThan(ordinary.inputs.technology.dependence)
    expect(frozen.inputs.technology.dependence).toBe(ordinary.inputs.technology.dependence)
    // No foreknowledge: a new outage does not cause an immediate domestic expansion.
    prepared.jp.tradeNetwork.inputs.technology.availability = 1
    for (const route of prepared.jp.tradeNetwork.inputs.technology.routes) prepared[route.partner].sectors.technology.output = 0
    expect(countryTrade(prepared,'jp',2031).inputs.technology.dependence).toBe(ordinary.inputs.technology.dependence)
  })

  it('foreign customer recessions lower export orders along actual commitments', () => {
    const opening = frame(), downturn = structuredClone(opening)
    for (const e of Object.values(downturn)) if (e.tradeNetwork.inputs.technology.routes.some(r => r.partner === 'tw')) {
      e.sectors.technology.demand = .45
      e.spending = .6
    }
    const baseline = countryTrade(opening,'tw',2031), crisis = countryTrade(downturn,'tw',2031)
    expect(crisis.inputs.technology.exportDemand).toBeLessThan(baseline.inputs.technology.exportDemand)
    expect(advance(downturn,'tw').sectors.technology.demand).toBeLessThan(advance(opening,'tw').sectors.technology.demand)
  })

  it('uses future relative FX in input costs without charging a historical currency redenomination', () => {
    const opening = frame(), weak = structuredClone(opening)
    opening.us.tradeNetwork.inputs.industry.routes = weak.us.tradeNetwork.inputs.industry.routes = [{ partner: 'jp', share: 1 }]
    weak.us.currency = 1.6
    expect(countryTrade(weak,'us',2031).inputs.industry.cost).toBeGreaterThan(countryTrade(opening,'us',2031).inputs.industry.cost)
    const old = frame(2005)
    old.us.tradeNetwork.inputs.industry.routes = [{ partner: 'tr', share: 1 }]
    expect(countryTrade(old,'us',2005).inputs.industry.fx).toBe(0)
    old.fr.tradeNetwork.inputs.industry.routes = [{ partner: 'de', share: 1 }]
    expect(countryTrade(old,'fr',2005).inputs.industry.fx).toBe(0)
  })

  it('does not treat an overseas war deployment as a domestic port closure', () => {
    const opening = frame(2003)
    opening.ca.tradeNetwork.inputs.industry.routes = [{ partner: 'us', share: 1 }]
    const network = countryTrade(opening,'ca',2003)
    expect(network.inputs.industry.restriction).toBeLessThan(.1)
    opening.ca.tradeNetwork.inputs.industry.routes = [{ partner: 'iq', share: 1 }]
    expect(countryTrade(opening,'ca',2003).inputs.industry.restriction).toBeGreaterThan(.25)
  })

  it('normalizes malformed networks safely and keeps exact serialized frames after reload', () => {
    const invalid = { v: 1, inputs: { industry: { routes: [{ partner: 'us',share: 1 },{ partner: 'invalid',share: 1 },{ partner: 'jp',share: .2 },{ partner: 'jp',share: .2 },{ partner: 'cn',share: Infinity }], dependence: NaN, cost: -5, availability: 50 } } }
    const normalized = normalizeTrade(invalid,'us',2030)
    expect(normalized.inputs.industry.routes).toEqual([{ partner: 'jp',share: 1 }])
    expect(normalized.inputs.industry.cost).toBe(.5)
    expect(normalized.inputs.industry.availability).toBe(1)
    const opening = frame(), e = advance(opening,'us')
    expect(JSON.stringify(normalizeCountry(JSON.parse(JSON.stringify(e)),'us',2031))).toBe(JSON.stringify(e))
    expect(JSON.stringify(normalizeTrade(JSON.parse(JSON.stringify(e.tradeNetwork)),'us',2031))).toBe(JSON.stringify(e.tradeNetwork))
  })

  it.each([1963,2005,2031])('keeps every country frame byte-identical after normalization in %i', year => {
    const opening = frame(year - 1)
    for (const { id } of COUNTRIES) {
      const current = advance(opening,id,year)
      expect(JSON.stringify(normalizeCountry(JSON.parse(JSON.stringify(current)),id,year)), id).toBe(JSON.stringify(current))
    }
  })
})
