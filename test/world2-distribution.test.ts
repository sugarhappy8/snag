import { describe, expect, it } from 'vitest'
import { advanceCohorts, COHORTS, cohortDemand, cohortSkills, initialCohorts, normalizeCohorts, type CohortConditions, type Cohorts } from '../src/game/economy/cohorts'
import { initialCountry, normalizeCountry, type CountryEconomy, type EconomicPolicy } from '../src/game/economy/model'
import { advanceCountry, worldConditions } from '../src/game/economy/simulation'
import { economyState, ensureEconomy, yearlyEconomy } from '../src/game/economy'
import { SECTORS } from '../src/game/economy/model'
import { makeTestGame } from './helpers'

function conditions(e: CountryEconomy, patch: Partial<CohortConditions> = {}): CohortConditions {
  return { wages: e.wages, unemployment: e.unemployment, credit: e.credit, rate: e.rate, taxShift: e.taxShift,
    services: e.services, mobility: e.mobility, education: 0, automation: 0, ...patch }
}
function workingJoblessness(cohorts: Cohorts): number {
  let population = 0, unemployed = 0
  for (const id of COHORTS) {
    const workingAge = cohorts[id].share * (1 - cohorts[id].retired)
    population += workingAge; unemployed += workingAge * (1 - cohorts[id].employment)
  }
  return unemployed / population
}
function step(old: CountryEconomy, policies: EconomicPolicy[] = []): CountryEconomy {
  return advanceCountry(old, 'ng', old.year + 1, 'world2-distribution', worldConditions({ ng: old }), [], policies)
}

describe('World Simulation 2.0: socioeconomic distribution', () => {
  it('food costs reduce working household consumption and buffers more sharply than wealthy spending', () => {
    const base = initialCountry('us',2030), expensive = structuredClone(base)
    expensive.sectors.essentials.costs = 2
    const normal = advanceCohorts(base,conditions(base)), foodShock = advanceCohorts(expensive,conditions(expensive))
    const poorLoss = normal.working.spending - foodShock.working.spending
    const richLoss = normal.wealthy.spending - foodShock.wealthy.spending
    expect(poorLoss).toBeGreaterThan(richLoss * 2)
    expect(foodShock.working.savings).toBeLessThan(normal.working.savings)
    expect(foodShock.working.debt).toBeGreaterThan(normal.working.debt)
    expect(cohortDemand(foodShock)).toBeLessThan(cohortDemand(normal))
    // Aggregate household book-keeping cannot itself transfer money to any player/NPC.
    expect(base.cohorts.working.spending).toBe(1)
  })

  it('education funding improves future workforce qualifications without retroactively supplying this years workers', () => {
    let control = initialCountry('ng',2030)
    control.skills = .4
    control.cohorts = initialCohorts(.4,control.inequality,control.unemployment,control.elderly)
    let funded = structuredClone(control)
    const policies: EconomicPolicy[] = [{ id:'education-scholarships',country:'ng',kind:'education',year:2030,until:2036,scale:1 }]
    const firstControl = step(control), firstFunded = step(funded,policies)
    expect(firstFunded.sectors.technology.workforce).toBe(firstControl.sectors.technology.workforce)
    expect(cohortSkills(firstFunded.cohorts)).toBeGreaterThan(cohortSkills(firstControl.cohorts))
    control = firstControl; funded = firstFunded
    for (let year=0;year<4;year++) { control=step(control); funded=step(funded,policies) }
    expect(funded.skills).toBeGreaterThan(control.skills)
    expect(funded.cohorts.working.skill).toBeGreaterThan(control.cohorts.working.skill)
    expect(funded.sectors.technology.workforce).toBeGreaterThan(control.sectors.technology.workforce)
    expect(funded.governmentDebt).toBeGreaterThan(control.governmentDebt)
  })

  it('automation reallocates an existing unemployment burden rather than applying another national loss', () => {
    const old = initialCountry('us',2030)
    const normal = advanceCohorts(old,conditions(old,{unemployment:.1})), automation = advanceCohorts(old,conditions(old,{unemployment:.1,automation:.2}))
    expect(automation.working.employment).toBeLessThan(normal.working.employment)
    expect(automation.professional.employment).toBeGreaterThan(normal.professional.employment)
    expect(workingJoblessness(automation)).toBeCloseTo(workingJoblessness(normal),4)
    const standard = advanceCountry(old,'us',2031,'distribution-automation',worldConditions({us:old}))
    const innovative = advanceCountry(old,'us',2031,'distribution-automation',worldConditions({us:old}),[{country:'us',sector:'industry',jobs:0,investment:0,failure:0,innovation:.3}])
    expect(innovative.sectors.industry.productivity).toBeGreaterThan(standard.sectors.industry.productivity)
    expect(innovative.sectors.industry.costs).toBeLessThan(standard.sectors.industry.costs)
    expect(innovative.sectors.industry.disruption).toBeGreaterThan(standard.sectors.industry.disruption)
    expect(innovative.cohorts.working.employment).toBeLessThan(standard.cohorts.working.employment)
  })

  it('uses real input prices once, not nominal inflation or currency priceScale twice', () => {
    const old = initialCountry('kr',2030), nominal = structuredClone(old)
    nominal.inflation = .18
    nominal.priceScale = 100
    expect(advanceCohorts(nominal,conditions(nominal))).toEqual(advanceCohorts(old,conditions(old)))
  })

  it('realized lost production feeds next-year growth and jobs without an unrelated same-turn credit penalty', () => {
    const base = initialCountry('ng',2030), outage = structuredClone(base)
    outage.sectors.industry.output = .1
    const normal = step(base), hit = step(outage)
    expect(hit.growth).toBeLessThan(normal.growth)
    expect(hit.unemployment).toBeGreaterThan(normal.unemployment)
    expect(hit.cohorts.working.employment).toBeLessThan(normal.cohorts.working.employment)
    expect(hit.credit).toBe(normal.credit)
    // Banks react later through realized borrower stress, rather than being charged a
    // second arbitrary outage modifier in the same macro transition.
    expect(hit.defaults).toBeGreaterThan(normal.defaults)
    expect(step(hit).credit).toBeLessThan(step(normal).credit)
  })

  it('preserves coherent bounded population shares and exact JSON normalization', () => {
    const base = initialCountry('us',2030), corrupt = structuredClone(base.cohorts) as unknown as Record<string, unknown>
    corrupt.working = { share:Infinity, income:-1, debt:NaN, retired:99, employment:-3, spending:500,skill:NaN,savings:Infinity }
    const fixed = normalizeCohorts(corrupt,base.cohorts)
    expect(COHORTS.reduce((sum,id)=>sum+fixed[id].share,0)).toBeCloseTo(1,6)
    for(const id of COHORTS)for(const value of Object.values(fixed[id]))expect(Number.isFinite(value)).toBe(true)
    expect(fixed.working.employment).toBe(0)
    expect(fixed.working.retired).toBe(.55)
    const next = advanceCountry(base,'us',2031,'distribution-roundtrip',worldConditions({us:base}))
    expect(JSON.stringify(normalizeCountry(JSON.parse(JSON.stringify(next)),'us',2031))).toBe(JSON.stringify(next))
  })

  it('a century of coupled household and supplier feedback does not collapse ordinary production or employment', () => {
    const g = makeTestGame(437,{age:30,money:123456})
    g.lifeId = 'world2-distribution-century'
    g.year = 2030
    ensureEconomy(g)
    for(let year=0;year<120;year++){
      g.year++;g.character.age++
      if(year===40||year===80)g.flags=JSON.parse(JSON.stringify(g.flags))
      yearlyEconomy(g)
    }
    const countries=Object.values(economyState(g)!.countries)
    const average=(f:(e:CountryEconomy)=>number)=>countries.reduce((sum,e)=>sum+f(e),0)/countries.length
    const output=average(e=>SECTORS.reduce((sum,s)=>sum+e.sectors[s].output,0)/SECTORS.length)
    const coverage=average(e=>SECTORS.reduce((sum,s)=>sum+e.sectors[s].availability,0)/SECTORS.length)
    expect(output).toBeGreaterThan(.6)
    expect(coverage).toBeGreaterThan(.65)
    expect(average(e=>e.unemployment)).toBeLessThan(.2)
    expect(average(e=>cohortDemand(e.cohorts))).toBeGreaterThan(.5)
    for(const e of countries){
      expect(COHORTS.reduce((sum,id)=>sum+e.cohorts[id].share,0)).toBeCloseTo(1,6)
      for(const id of COHORTS)for(const value of Object.values(e.cohorts[id]))expect(Number.isFinite(value)).toBe(true)
    }
    expect(g.character.money).toBe(123456)
    expect(g.rng).toBe(437)
    // A century of whole-world transitions: sized for a 2-core CI runner.
  },120000)
})
