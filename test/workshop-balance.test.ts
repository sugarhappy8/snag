// Inventing is a viable path to wealth, not an exploit: scripted inventor lives (Workshop only,
// a steady side income for parts and patents) compared before income tax.
// A strong professional career earns roughly $6-10M over a life for comparison.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { runScript } from '../src/game/scripts'
import type { GameState } from '../src/game/types'
import { brainstorm, buildCost, buildOdds, resolveBuild, type Approach } from '../src/game/workshop/build'
import { benchFor, dealsLeft, filePatent, license, rightsBasis, routeQuotes, acceptOffer, runCrowd, subjectOf, type Bench } from '../src/game/workshop/launch'
import { licenseValue, patentFee, trueAppeal } from '../src/game/workshop/market'
import { inventions, mutWorkshop, readWorkshop } from '../src/game/workshop/notebook'
import { yearlyWorkshop } from '../src/game/workshop/yearly'

function drain(g: GameState): void {
  for (let i = 0; i < 50 && g.queue.length; i++) {
    const m = g.queue.shift()!
    if (m.kind !== 'choice' || !m.scriptId) continue
    const c = m.choices.find((x) => ['write', 'enter', 'team', 'sue', 'recall', 'fight', 'keep', 'walk', 'cancel'].includes(x.id)) ?? m.choices[0]
    runScript(g, m.scriptId, c.id, m.data, m)
  }
}
function benches(g: GameState): Bench[] {
  const ws = readWorkshop(g)
  return [...ws.ideas.map((i) => ({ kind: 'idea' as const, id: i.id })), ...inventions(g).filter((o) => o.inv.stage === 'patented').map((o) => ({ kind: 'asset' as const, id: o.a.id }))]
    .map((t) => benchFor(g, ws, t)).filter((b): b is Bench => !!b)
}

/** A whole inventing life. 'strong' optimizes (geniuses read their hints); 'casual' tinkers. */
function life(seed: number, genius: boolean, born: number, style: 'strong' | 'casual'): number {
  const g = makeTestGame(seed, { age: 8, money: 0, talents: genius ? ['Inventor'] : [] })
  g.character.stats.smarts = genius ? 80 : 65
  g.lifeId = `balance-${seed}`
  for (let age = 8; age <= 90; age++) {
    g.character.age = age
    g.year = born + age
    g.yearActions = {}
    g.flags.taxableIncome = 0
    if (age >= 22 && age <= 70) g.character.money += 40_000
    yearlyWorkshop(g)
    drain(g)
    if (age > 70) continue
    for (let i = 0; i < (style === 'strong' ? 2 : 1); i++) { brainstorm(g); drain(g) }
    for (let k = 0; k < 5; k++) {
      const ws = readWorkshop(g)
      const value = (b: Bench) => (b.q >= 75 ? -1 : licenseValue(g, { ...subjectOf(g, b), q: 70 }, genius ? trueAppeal(g, b.def) : b.def.a, ws.rep))
      const list = benches(g).filter((b) => buildCost(g, b.def, 'safe') <= g.character.money * 0.5).sort((x, y) => value(y) - value(x))
      const b = list[0]
      if (!b || value(b) < 0) break
      const ap: Approach = style === 'casual' ? 'cheap' : buildOdds(g, ws, b.def, b.builds, 'safe').high >= 75 ? 'safe' : 'bold'
      if (!resolveBuild(g, b.target, ap)) break
      drain(g)
    }
    if (!dealsLeft(g)) continue
    const ready = benches(g).filter((b) => b.q >= (style === 'casual' ? 30 : 60))
    let b = ready[0]
    if (!b) continue
    const ws = mutWorkshop(g)
    if (style === 'strong' && !b.patent && b.q >= 40) {
      const world = { scope: 'world' as const, country: b.country, filed: g.year, expires: g.year + 20 }
      const gain = licenseValue(g, { ...subjectOf(g, b), patent: world }, b.def.a, ws.rep) - licenseValue(g, subjectOf(g, b), b.def.a, ws.rep)
      const fee = patentFee(b.country, g.year, 'world')
      if (gain > fee * 1.5 && g.character.money > fee) {
        const a = filePatent(g, b.target, 'world')
        drain(g)
        if (a) b = benchFor(g, readWorkshop(g), { kind: 'asset', id: a.id })!
      }
    }
    if (style === 'casual' || !genius) license(g, b.target)
    else {
      const best = routeQuotes(g, readWorkshop(g), b).filter((q) => q.route === 'license' || q.route === 'sell' || q.route === 'crowd').reduce((x, y) => (y.value > x.value ? y : x))
      if (best.route === 'sell') acceptOffer(g, b.target, 'A buyer', Math.round(rightsBasis(g, readWorkshop(g), b) * 0.8))
      else if (best.route === 'crowd') runCrowd(g, b.target, 1)
      else license(g, b.target)
    }
    drain(g)
  }
  return readWorkshop(g).earned
}

describe('inventing pays, within reason', () => {
  it('a dedicated genius gets rich, a dedicated tinkerer does well, a casual tinkerer rarely does', () => {
    const genius = [life(10, true, 1950, 'strong'), life(17, true, 1990, 'strong')]
    const normal = life(24, false, 1960, 'strong')
    const casual = [life(31, false, 1960, 'casual'), life(38, false, 1980, 'casual')]
    for (const x of genius) {
      expect(x).toBeGreaterThan(5_000_000)
      expect(x).toBeLessThan(80_000_000)
    }
    expect(normal).toBeGreaterThan(500_000)
    expect(normal).toBeLessThan(Math.min(...genius))
    for (const x of casual) expect(x).toBeLessThan(3_000_000)
    expect(Math.max(...casual)).toBeLessThan(normal)
  }, 600_000)
})
