import { it, expect } from 'vitest'
import { runScript } from '../src/game/scripts'
import { sportsCareerMenu, sportsJobNodes, yearlySports } from '../src/game/special/sports'
import type { GameState, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

const OUT = '/tmp/claude-0/-home-user-snag/10662b3d-d68a-59c1-a541-a28cb41ae61d/scratchpad/sweep.txt'
const fs = require('fs')
function find(g: GameState, nodes: MenuNode[], id: string, d = 0): MenuAction | undefined {
  if (d > 7) return
  for (const n of nodes) {
    if (n.type === 'action' && n.id === id) return n
    if (n.type === 'menu') { if (n.visible && !n.visible(g)) continue; const h = find(g, n.children(g), id, d + 1); if (h) return h }
  }
}
function tryRun(g: GameState, id: string, nodes: MenuNode[] = [sportsCareerMenu]): boolean {
  const a = find(g, nodes, id)
  if (!a || a.disabledReason?.(g) || (a.visible && !a.visible(g))) return false
  a.run(g); return true
}
function drain(g: GameState, seed: number) {
  let k = 0
  for (let guard = 0; g.queue.length && guard < 500; guard++) {
    const m = g.queue.shift()!; const before = g.queue.length
    if (m.kind === 'choice') {
      const prefer = ['accept', 'sign', 'resign', 'keep', 'stay', 'pro', 'smart', 'trash', 'champ', 'strike', 'attack', 'medal']
      let id = prefer.find((p) => m.choices.some((c) => c.id === p))
      if (m.scriptId === 'sports.fight.pick') { const o = (m.data as any).offers; const t = o.findIndex((x: any) => ['title','regionalTitle','defense','unify'].includes(x.kind)); id = String(t >= 0 ? t : 0) }
      if (m.scriptId === 'sports.fight.round') id = ['strike','grapple','strike','sub','defend','power','body'][ (seed + k++) % 7 ]
      if (!id || !m.choices.some((c) => c.id === id)) id = m.choices[(seed + k++) % Math.max(1, m.choices.length - 1)].id
      runScript(g, m.scriptId!, id, m.data, m)
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? 'X', m.data, m)
    g.queue.unshift(...g.queue.splice(before))
  }
}
function next(g: GameState) { g.character.age++; g.year++; g.yearActions = {}; g.flags.taxableIncome = 0; g.log.push({ age: g.character.age, year: g.year, entries: [] }) }

function career(kind: string, seed: number) {
  const country = seed % 3 === 0 ? 'br' : seed % 3 === 1 ? 'us' : 'jp'
  const g = makeTestGame(seed, { age: 8, countryId: kind === 'sumo' ? 'jp' : country, city: kind === 'sumo' || country === 'jp' ? 'Tokyo' : country === 'br' ? 'São Paulo' : 'Chicago', gender: kind === 'sumo' ? 'male' : seed % 2 ? 'male' : 'female' })
  g.character.hidden.athleticism = 55 + (seed % 40)
  g.character.money = 30000
  g.assets.push({ id: 'pc', kind: 'other', name: 'Gaming PC', emoji: 'x', value: 1, purchasePrice: 1, condition: 100, purchasedAge: 8, upkeep: 0, details: {} })
  let earned = 0, maxYear = 0, peak = ''
  for (let age = 8; age < 50; age++) {
    const m0 = g.character.money
    if (age < 18) {
      tryRun(g, 'sports.youth.join.' + (kind === 'team' ? 'team' : kind === 'mma' || kind === 'boxing' ? 'combat' : 'individual')); drain(g, seed)
      tryRun(g, 'sports.youth.train'); tryRun(g, 'sports.youth.train'); tryRun(g, 'sports.youth.compete'); drain(g, seed)
    }
    if (!g.character.job) {
      if (kind === 'tennis' || kind === 'golf' || kind === 'motor' || kind === 'track' || kind === 'cycling') { for (let i = 0; i < 5; i++) { tryRun(g, `sports.ind.${kind}.practice`); drain(g, seed) } tryRun(g, `sports.ind.${kind}.pro`); drain(g, seed) }
      if (kind === 'mma' || kind === 'boxing') { tryRun(g, `sports.${kind}.gym`); drain(g, seed); for (let i = 0; i < 4; i++) { tryRun(g, `sports.${kind}.train`); drain(g, seed) } for (let i = 0; i < 3; i++) { tryRun(g, `sports.${kind}.amateur`); drain(g, seed) } tryRun(g, `sports.${kind}.turnPro`); drain(g, seed) }
      if (kind === 'sumo') { tryRun(g, 'sports.sumo.join'); drain(g, seed) }
      if (kind === 'esports') { tryRun(g, 'sports.es.game'); drain(g, seed); for (let i = 0; i < 3; i++) { tryRun(g, 'sports.es.grind'); drain(g, seed) } tryRun(g, 'sports.es.cup'); drain(g, seed); tryRun(g, 'sports.es.pro'); drain(g, seed) }
      if (kind === 'wrestle') { tryRun(g, 'sports.wrestle.school'); drain(g, seed); tryRun(g, 'sports.wrestle.debut'); drain(g, seed) }
      if (kind === 'team') { tryRun(g, 'athlete.tryout'); drain(g, seed) }
    } else {
      const nodes = sportsJobNodes(g)
      for (const id of ['sports.ind.practice', 'sports.ind.fitness', 'sports.fight.trainPro', 'sports.sumo.keiko', 'sports.sumo.chanko', 'sports.es.scrims', 'athlete.practice', 'athlete.train', 'sports.wrestle.promo', 'sports.wrestle.tryout']) { for (let i = 0; i < 4; i++) { tryRun(g, id, sportsJobNodes(g)); drain(g, seed) } }
      for (let i = 0; i < 9; i++) { for (const id of ['sports.ind.compete', 'sports.fight.go', 'sports.es.compete', 'sports.wrestle.match']) { tryRun(g, id, sportsJobNodes(g)); drain(g, seed) } }
      void nodes
    }
    next(g); yearlySports(g); drain(g, seed)
    const d = g.character.money - m0
    const spons = ((g.flags['special.sports'] as any)?.sponsors ?? []).reduce((a: number, x: any) => a + x.yearly, 0)
    if (process.env.DIAG === kind && seed === 3) fs.appendFileSync(OUT, `  ${kind} age ${g.character.age} +${Math.round(d).toLocaleString()} spons ${spons.toLocaleString()} fame ${g.character.hidden.fame} job ${g.character.job?.title}@${g.character.job?.company} sal ${g.character.job?.salary}\n`)
    if (d > maxYear) { maxYear = d; peak = `${g.character.age}:${g.character.job?.title ?? '-'}@${g.character.job?.company ?? '-'}` }
    earned += Math.max(0, d)
    expect(Number.isFinite(g.character.money)).toBe(true)
    expect(g.character.money).toBeGreaterThanOrEqual(0)
    const js = JSON.stringify(g); expect(js.includes('NaN')).toBe(false)
    if (!g.character.alive) break
  }
  const hon = (g.flags['special.sports'] as any)?.honors?.length ?? 0
  return { earned: Math.round(earned), maxYear: Math.round(maxYear), peak, honors: hon, trauma: (g.flags['special.sports'] as any)?.headTrauma ?? 0, alive: g.character.alive }
}

it('sweeps careers', () => {
  fs.writeFileSync(OUT, '')
  for (const kind of ['tennis', 'golf', 'motor', 'track', 'cycling', 'mma', 'boxing', 'sumo', 'esports', 'wrestle', 'team']) {
    const rows = []
    for (let seed = 1; seed <= 12; seed++) rows.push(career(kind, seed))
    const sorted = [...rows].sort((a, b) => b.earned - a.earned)
    fs.appendFileSync(OUT, `${kind}: median ${sorted[6].earned.toLocaleString()} top ${sorted[0].earned.toLocaleString()} bottom ${sorted[11].earned.toLocaleString()} | maxYear ${Math.max(...rows.map((r) => r.maxYear)).toLocaleString()} (${sorted[0].peak}) honors ${rows.map((r) => r.honors).join(',')} trauma ${rows.map((r) => Math.round(r.trauma)).join(',')} dead ${rows.filter((r) => !r.alive).length}\n`)
  }
}, 600000)
