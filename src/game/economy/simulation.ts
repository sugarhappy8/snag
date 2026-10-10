import { currencyInflation } from '../data/currencies'
import { marketOf } from '../data/markets'
import { historicalCycle, historicalHousing, historicalPolicyRate, inHistory } from '../history/markets'
import { PRESENT_YEAR } from '../history/timeline'
import { bound, compactCountry, economicRoll, SECTORS, SECTOR_RULES, type CountryEconomy, type EconomicPolicy, type EconomyFeedback, type Sector, type SectorState } from './model'

export interface WorldConditions { growth: number; demand: number; supply: number; rate: number }
export function worldConditions(countries: Record<string, CountryEconomy>): WorldConditions {
  let size = 0, growth = 0, demand = 0, supply = 0, rate = 0
  for (const [id, e] of Object.entries(countries)) {
    const m = marketOf(id), weight = Math.sqrt(Math.max(1, m.populationM * m.gdpPerCapita))
    size += weight; growth += weight * e.growth; demand += weight * e.spending; supply += weight * e.supply; rate += weight * Math.min(.2, e.rate)
  }
  return size ? { growth: growth / size, demand: demand / size, supply: supply / size, rate: rate / size } : { growth: .02, demand: 1, supply: 0, rate: .04 }
}

/** One synchronous transition: every country reads the same opening world, never another
 * country's newly computed year. No player money is created by these aggregates. */
export function advanceCountry(old: CountryEconomy, country: string, year: number, seed: string, world: WorldConditions, feedback: EconomyFeedback[] = [], policies: EconomicPolicy[] = []): CountryEconomy {
  const m = marketOf(country), historic = inHistory(year)
  const roll = (name: string) => economicRoll(`${seed}|economy|${country}|${year}|${name}`)
  const globalRoll = economicRoll(`${seed}|economy|world|${year}|supply`)
  const neutralRate = bound(m.interestRate, .02, .075)
  const targetInflation = bound(m.inflation, .015, .045)
  const policy = (kind: EconomicPolicy['kind']) => bound(policies.filter(p => p.country === country && p.year < year && p.until >= year && p.kind === kind).reduce((s, p) => s + p.scale, 0), 0, 1.5)
  const investment = policy('investment'), education = policy('education'), health = policy('health')
  const taxCut = policy('taxCut'), taxRise = policy('taxRise'), regulation = policy('regulation')
  const own = feedback.filter(f => f.country === country)
  const jobs = bound(own.reduce((s, f) => s + f.jobs, 0), -.05, .05)
  const failures = bound(own.reduce((s, f) => s + f.failure, 0), 0, .12)
  const capex = bound(own.reduce((s, f) => s + f.investment, 0), 0, .08)
  const creditDrag = (Math.min(.4, old.rate) - neutralRate) * .9 + Math.max(0, old.defaults - .03) * .7
  // Supply incidents are small exogenous inputs. Their effects spread through input costs,
  // inflation, monetary policy and employment rather than rolling each of those separately.
  const incident = globalRoll < .06 ? .12 + globalRoll : roll('supply') < .045 ? .12 : 0
  const supply = bound(old.supply * .55 + world.supply * .15 + incident - old.sectors.energy.adoption * .025, 0, .6)
  const saving = bound(.15 + (1 - old.confidence) * .1 + old.unemployment * .3 + Math.max(0, old.rate - .04) * .4, .05, .4)
  const credit = bound(old.credit * .6 + .4 * (1 - creditDrag * 3 - Math.max(0, .23 - old.liquidity) * 2 - failures - regulation * .035), .25, 1.4)
  const fiscal = bound(investment * .018 + education * .012 + health * .012 + taxCut * .014 - taxRise * .014
    + Math.max(0, old.unemployment - .065) * .18 - Math.max(0, old.governmentDebt - 1) * .025, -.06, .08)
  const taxShift = bound(taxRise * .025 - taxCut * .025, -.05, .06)
  const trade = bound(.65 * old.trade + .35 * (1 + (world.demand - 1) * .6 - supply * .6 + (old.currency - 1) * .15), .4, 1.5)
  const spending = bound(.65 * old.spending + .35 * (1 + (old.wages - 1) * .2 - (old.unemployment - .055) * 1.5 + (old.confidence - 1) * .2 + (credit - 1) * .25 - (saving - .15) * .6 - taxShift), .5, 1.5)
  const demandImpulse = (spending - 1) * .15 + (trade - 1) * .07 + fiscal * .5 - creditDrag * .13 - supply * .08 + capex * .3
  const outputGap = bound(old.outputGap * .65 + demandImpulse - old.outputGap * Math.abs(old.outputGap) * 1.5 + (roll('activity') - .5) * .028, -.3, .22)
  const cycleHistory = historicalCycle(country, year, 1)
  const growth = bound(historic ? .02 + (cycleHistory - 1) * .35 + (outputGap - old.outputGap) * .15 : .018 + (outputGap - old.outputGap) * .5 + outputGap * .25 + (world.growth - .02) * .2, -.18, .14)
  const sectors = {} as Record<Sector, SectorState>
  let automation = 0, averageProductivity = 0
  for (const s of SECTORS) {
    const prev = old.sectors[s], rule = SECTOR_RULES[s]
    const innovations = bound(own.filter(f => f.sector === s).reduce((sum, f) => sum + f.innovation, 0), 0, .5)
    const background = s === 'technology' || s === 'industry' ? .006 * old.skills : .002 * old.skills
    const adoption = bound(prev.adoption + (innovations + background) * (1 - prev.adoption) * (.4 + old.skills * .6), 0, 1)
    const disruption = bound(prev.disruption * .55 + (adoption - prev.adoption) * rule.automation * 2.5, 0, .65)
    const productivity = bound(1 + adoption * .9 + (old.skills - .65) * .15, .75, 2.5)
    const inputs = Object.entries(rule.inputs).reduce((sum, [input, weight]) => sum + (old.sectors[input as Sector].costs - 1) * weight, 0)
    const demand = bound(1 + (spending - 1) * rule.cycle + (credit - 1) * rule.credit * .22 + (trade - 1) * rule.imports * .35
      + (s === 'care' ? (old.elderly - .17) * 2 + health * .07 : 0) + (s === 'public' ? fiscal * 2 + education * .1 : 0)
      + (s === 'technology' ? capex * 2 + investment * .08 : 0) - disruption * .2, .3, 1.8)
    const financing = Math.max(0, old.rate - neutralRate) * rule.credit
    const capacity = bound(prev.capacity + (demand - prev.capacity) * .12 * credit + (productivity - prev.productivity) * .3 + capex * .3 - supply * .05 - financing * .06, .4, 2.2)
    const scarcity = Math.max(-.15, demand / capacity - 1)
    const costs = bound(1 + inputs * .4 + scarcity * .2 + supply * rule.imports + (old.currency - 1) * rule.imports * .25
      + (old.wages - 1) * (1 - rule.automation * .45) * .25 - (productivity - 1) * .25, .5, 2.2)
    const competition = bound(prev.competition + (demand - costs) * .015 + (credit - 1) * .03 - failures * .15 + regulation * .008 + (1 - prev.competition) * .003, .18, .9)
    sectors[s] = { demand, capacity, costs, productivity, competition, adoption, disruption }
    automation += disruption / SECTORS.length; averageProductivity += productivity / SECTORS.length
  }
  const structuralJobless = bound(.055 + (65 - m.easeOfBusiness) * .0006, .03, .1)
  const unemployment = bound(old.unemployment * .65 + structuralJobless * .35 - (growth - .02) * .5 + automation * .12 + failures * .35 - jobs - education * .002, .02, .35)
  const defaults = bound(.02 + Math.max(0, unemployment - .05) * .3 + Math.max(0, old.rate - neutralRate) * .2 * old.privateDebt + Math.max(0, -old.housingReturn) * .2 + failures * .5, .005, .2)
  const liquidity = bound(.65 * old.liquidity + .35 * (.28 + saving * .1 - defaults * .6 + regulation * .04 + Math.max(0, .6 - old.credit) * .1), .07, .55)
  const privateDebt = bound(old.privateDebt + (credit - 1) * .045 - defaults * .15 - (old.privateDebt - .8) * .035, .2, 2)
  const governmentDebt = bound((old.governmentDebt + fiscal + Math.min(.12, old.rate) * old.governmentDebt * .35 - .012) / (1 + growth), .05, 2.5)
  const services = bound(.85 * old.services + .15 * (1 + education * .13 + health * .18 + investment * .08 - Math.max(0, governmentDebt - 1) * .22), .55, 1.4)
  const skills = bound(old.skills + education * .008 + (services - 1) * .004 - (old.skills - .65) * .015, .3, .95)
  const wages = bound(old.wages + (averageProductivity - old.productivity) * .35 + (.06 - unemployment) * .12 - (old.wages - 1) * .025, .6, 2.5)
  const inflation = historic || year <= PRESENT_YEAR ? currencyInflation(country, year) : bound(old.inflation * .55 + targetInflation * .45 + outputGap * .06 + supply * .12 - (averageProductivity - old.productivity) * .08 - Math.max(0, old.rate - neutralRate) * .05, -.035, .18)
  const rateTarget = neutralRate + (inflation - targetInflation) * 1.4 + outputGap * .18 - (unemployment - structuralJobless) * .12
  const rate = historic ? historicalPolicyRate(country, year) ?? neutralRate : bound(old.rate * .55 + rateTarget * .45, .0025, .28)
  const confidence = bound(.65 * old.confidence + .35 * (1 + growth * 2 - (unemployment - .05) * 1.5 - defaults * 1.5 - supply * .35), .3, 1.4)
  const bubble = bound(old.bubble + Math.max(0, credit - 1) * .08 + Math.max(0, old.housingReturn - .04) * .25 - Math.max(0, rate - neutralRate) * .5 - defaults * .15 - old.bubble * .08, 0, .6)
  const fundamental = bound(wages * (1 + (old.population - 1) * .25), .65, 2.5)
  const bust = Math.max(0, old.bubble - .15) * (Math.max(0, old.credit - credit) + Math.max(0, defaults - .035)) * 3
  const housingReturn = historicalHousing(country, year) ?? bound((credit - 1) * .08 - (rate - neutralRate) * 1.1 + (fundamental / old.housing - 1) * .06 + growth * .35 - (unemployment - .05) * .25 + (bubble - old.bubble) * .6 - bust, -.25, .18)
  const housing = bound(old.housing * (1 + housingReturn), .4, 4)
  const rent = bound(old.rent * .9 + .1 * (wages * .7 + housing * .3), .5, 3)
  const currency = bound(.85 * old.currency + .15 * (1 + (inflation - targetInflation) * 1.5 + (governmentDebt - .6) * .08 - (rate - world.rate) * .6), .5, 1.8)
  const inequality = bound(old.inequality + (unemployment - .06) * .015 + automation * .02 + taxCut * .001 - education * .002 - health * .001 - (old.inequality - .4) * .008, .25, .65)
  const mobility = bound(.5 + (skills - .65) * .5 + (services - 1) * .2 - (inequality - .4) * .8 - (unemployment - .06) * .5, .15, .85)
  const marketMove = historic ? 0 : bound(growth * .8 + (confidence - old.confidence) * .35 - (rate - old.rate) * 2.5 - (defaults - old.defaults) * 2 - old.bubble * bust * 2 - Math.log(old.market) * .025, -.35, .25)
  const market = bound(old.market * (1 + marketMove), .12, 8)
  const priceScale = year <= PRESENT_YEAR ? 1 : bound(old.priceScale * (1 + inflation) / (1 + currencyInflation(country, year)), 1e-6, 1e6)
  const causes: string[] = []
  if (supply > .075) causes.push('Supply shortages are raising production costs.')
  if (rate - neutralRate > .015) causes.push('Expensive credit is slowing borrowing and investment.')
  if (defaults > .05) causes.push('Defaults are tightening bank lending and household budgets.')
  if (growth < -.015) causes.push('Falling demand is putting jobs and business profits under pressure.')
  if (automation > .025) causes.push('New technology is lifting productivity while displacing some jobs.')
  if (investment + education + health > .2) causes.push('Public investment supports services and skills, funded through the budget.')
  if (housingReturn < -.04) causes.push('Weaker borrowing power is bringing house prices down.')
  if (!causes.length) causes.push(growth > .03 ? 'Stronger household spending is supporting hiring and expansion.' : 'Spending, lending and employment are adjusting gradually.')
  return compactCountry({ year, outputGap, growth, inflation, rate, unemployment, wages, productivity: averageProductivity, skills, confidence, spending, saving, credit, liquidity, defaults, privateDebt, governmentDebt, fiscal, taxShift, services, inequality, mobility,
    population: bound(old.population * (1 + .006 - (old.elderly - .17) * .035 - (unemployment - .06) * .01), .5, 2.5),
    elderly: bound(old.elderly + .0006 + (services - 1) * .0002 - (old.elderly - .25) * .002, .08, .4),
    trade, currency, supply, housing, rent, housingReturn, bubble, market, priceScale, sectors, causes: causes.slice(0, 3) })
}
