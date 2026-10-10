import { addStat, log } from './core'
import { economyOf } from './economy'
import { householdPressure } from './economy/cohorts'
import { typicalIncome } from './events/wealth-core'
import { rand, randInt } from './rng'
import type { GameState, Person } from './types'
import { initializeNpc, npcWorth, startNpcCompany } from './npc-lives'
import { saveNpcLife } from './npc-state'
import { clampN } from './business/util'
import { getCountry } from './world'

export const BACKGROUNDS = ['Extreme poverty', 'Working class', 'Lower middle class', 'Middle class', 'Upper middle class', 'Wealthy', 'Multimillionaire family', 'Billionaire dynasty'] as const
/** Relative resources, not modern dollar cutoffs. Approximate country/era game distribution. */
export function birthBackgroundFor(g: GameState, roll: number): number {
  const wealth = getCountry(g.character.countryId).wealth, economy = economyOf(g), inequality = economy.inequality
  const poverty = clampN(.015 + (1 - wealth) * .055 + (g.year < 1950 ? .025 : 0), .005, .095)
  const ordinary = [poverty, .18 + (1 - wealth) * .12, .25, .28, .19 * wealth]
  // Cohort purchasing power shifts ordinary family circumstances, not the rare
  // wealth lottery or a newborn's cash. Preserve the total ordinary probability.
  const ordinaryTotal = ordinary.reduce((sum, weight) => sum + weight, 0)
  const pressure = clampN(1 - householdPressure(economy), -.35, .6)
  const sensitivity = [2, 1, .3, -.5, -1]
  for (let i = 0; i < ordinary.length; i++) ordinary[i] *= 1 + pressure * sensitivity[i]
  const changedTotal = ordinary.reduce((sum, weight) => sum + weight, 0)
  for (let i = 0; i < ordinary.length; i++) ordinary[i] *= ordinaryTotal / changedTotal
  const rare = [.035 + inequality * .015, .004 + inequality * .003, .00008 + wealth * .00002]
  const sum = [...ordinary, ...rare].reduce((a,b) => a+b, 0)
  let cumulative = 0
  for (let i = 0; i < 8; i++) { cumulative += [...ordinary, ...rare][i] / sum; if (roll < cumulative) return i }
  return 7
}
export function rollBirthBackground(g: GameState): number {
  const tier = birthBackgroundFor(g, rand(g))
  g.flags.birthBackground = tier
  return tier
}
export function initializeBirthParent(g: GameState, p: Person): void {
  const raw = g.flags.birthBackground
  if (typeof raw !== 'number' || raw < 0 || raw > 7) return
  const tier = Math.floor(raw), income = typicalIncome(g), l = initializeNpc(g, p)
  // This is an initial endowment of the parent, never money handed to the newborn.
  const years = [.06, .6, 1.8, 5, 18, 100, 1600, 90000][tier] * (.65 + rand(g) * .7)
  const total = income * years
  p.money = Math.round(total * (tier >= 4 ? .12 : .5))
  l.investments = Math.round(total * (tier >= 4 ? .6 : .1))
  l.housing = Math.round(total - p.money - l.investments)
  l.debt = tier === 0 ? income * .4 : tier <= 3 ? income * [.2,.5,1.2,2][tier] : 0
  l.housingQuality = [8,25,40,55,75,90,96,99][tier]
  if (tier === 0) { p.occupation = rand(g) < .45 ? 'Unemployed' : 'Casual Laborer'; l.housing = 0; l.investments = 0 }
  if (tier >= 5) { p.occupation = tier >= 6 ? 'Family Investment Director' : 'Business Owner'; l.field = 'Business'; l.education = 1; l.skill = Math.max(l.skill, randInt(g, 45, 85)); l.achievements = ['Business qualification'] }
  saveNpcLife(p, l)
  // One actual operating company per wealthy parent; capital is deducted from their cash.
  if (tier >= 5) startNpcCompany(g, p, tier >= 6 ? 'manufacturing' : 'cafe')
}
export function birthIntroduction(g: GameState): void {
  const tier = typeof g.flags.birthBackground === 'number' ? g.flags.birthBackground : 3
  const parents = g.people.filter(p => p.alive && ['parent','stepparent'].includes(p.relation) && p.livesWithPlayer)
  const business = parents.some(p => p.data.npcCompany)
  log(g, tier === 0 ? 'I was born into a struggling household with little savings, debt and insecure housing.' : tier >= 6 ? `I was born into an exceptionally wealthy family, supported by ${business ? 'a family business and investments' : 'an inherited investment portfolio'}. That wealth belongs to my parents, not me.` : `My family's starting circumstances: ${BACKGROUNDS[tier] ?? BACKGROUNDS[3]}. Our finances can change as my parents' lives unfold.`, 'event')
}
/** Childhood effects follow today's actual family resources, not the permanent birth label. */
export function yearlyBackground(g: GameState): void {
  if (!g.character.alive || g.character.age >= 18 || g.flags.backgroundYear === g.year) return
  g.flags.backgroundYear = g.year
  const parents = g.people.filter(p => p.alive && p.livesWithPlayer && ['parent','stepparent'].includes(p.relation))
  if (!parents.length) return
  const income = typicalIncome(g), resources = parents.reduce((sum,p) => sum + npcWorth(p, g.year), 0) / income
  if (resources < .5) {
    addStat(g, 'happiness', -1)
    if (economyOf(g).services < .55) addStat(g, 'health', -1)
    g.character.residence.description = 'An insecure family home'
  } else if (resources > 20) {
    // Tuition and enrichment are paid by parents. Wealth buys access, not perfect grades.
    const payer = parents.reduce((a,b) => a.money > b.money ? a : b)
    const fee = income * .02
    if (g.character.age >= 5 && payer.money >= fee) {
      payer.money -= fee; addStat(g, 'smarts', 1)
      const school = g.character.education.current
      if (school) school.grades = clampN(school.grades + 1, 0, 100)
    }
    g.character.residence.description = 'A comfortable family home'
  }
}
