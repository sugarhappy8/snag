import { describe, expect, it } from 'vitest'
import { runScript } from '../src/game/scripts'
import { specialCareersMenu, specialJobNodes, yearlySpecial } from '../src/game/special'
import { hire, ownerKey } from '../src/game/special/common'
import { sportsCareerMenu, sportsJobNodes, sportsSummary, yearlySports } from '../src/game/special/sports'
import { addHeadTrauma, gamesSeason, rankFromPoints, sponsorCall, yearlyBrain } from '../src/game/special/sports-core'
import { fightInternals } from '../src/game/special/sports-fight'
import type { Asset, Character, GameState, Json, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

function game(age: number, overrides: Partial<Character> = {}, seed = 11): GameState {
  const g = makeTestGame(seed, { age, ...overrides })
  g.log = [{ age, year: 2026, entries: [] }]
  return g
}

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 7) return undefined
  for (const n of nodes) {
    if ('id' in n && n.id === id) return n
    if (n.type === 'menu') {
      if (n.visible && !n.visible(g)) continue
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

const sports = (_g: GameState) => [sportsCareerMenu]

function action(g: GameState, id: string, nodes: MenuNode[] = sports(g)): MenuAction {
  const n = findNode(g, nodes, id)
  if (!n || n.type !== 'action') throw new Error(`action ${id} not found`)
  return n
}

function reason(g: GameState, id: string, nodes?: MenuNode[]): string | null {
  return action(g, id, nodes).disabledReason?.(g) ?? null
}

function run(g: GameState, id: string, nodes?: MenuNode[]): void {
  const a = action(g, id, nodes)
  const why = a.disabledReason?.(g)
  if (why) throw new Error(`action ${id} is disabled: ${why}`)
  a.run(g)
}

type Picker = (m: Extract<ModalItem, { kind: 'choice' }>) => string | undefined

/** Resolve the whole queue the way the store does; `pick` chooses (default: first option). */
function drain(g: GameState, pick: Picker = () => undefined): ModalItem[] {
  const seen: ModalItem[] = []
  for (let guard = 0; g.queue.length && guard < 400; guard++) {
    const m = g.queue.shift()!
    seen.push(m)
    const before = g.queue.length
    if (m.kind === 'choice') {
      const want = pick(m)
      const id = want && m.choices.some((c) => c.id === want) ? want : m.choices[0].id
      runScript(g, m.scriptId!, id, m.data, m)
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? 'Test', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'done', m.data, m)
    g.queue.unshift(...g.queue.splice(before))
  }
  expect(g.queue.length).toBe(0)
  return seen
}

function nextYear(g: GameState): void {
  g.character.age += 1
  g.year += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.log.push({ age: g.character.age, year: g.year, entries: [] })
}

function flagProfile<T>(g: GameState, key: string): T {
  const v = g.flags[`special.${key}`]
  if (!v || typeof v !== 'object') throw new Error(`no profile ${key}`)
  return v as unknown as T
}

function checkSane(g: GameState): void {
  expect(Number.isFinite(g.character.money)).toBe(true)
  expect(g.character.money).toBeGreaterThanOrEqual(0)
  if (g.character.job) {
    expect(Number.isFinite(g.character.job.salary)).toBe(true)
    expect(g.character.job.salary).toBeGreaterThanOrEqual(0)
  }
  const json = JSON.stringify(g)
  expect(json).not.toContain('NaN')
  expect(json).not.toContain('undefined')
  expect(JSON.stringify(JSON.parse(json))).toBe(json)
}

const allText = (seen: ModalItem[]) => seen.map((m) => ('text' in m ? `${m.title}: ${m.text}` : '')).join('\n')


for (const SEED of Array.from({ length: 25 }, (_, i) => i + 200)) {
describe(`MMA seed ${SEED}`, () => {
  function fighterGame(): GameState {
    const g = game(18, { hidden: { ...game(0).character.hidden, athleticism: 90 } }, SEED)
    g.character.money = 50_000
    run(g, 'sports.mma.gym')
    drain(g, (m) => m.choices[1]?.id)
    const p = flagProfile<Record<string, number>>(g, 'sports.fight')
    p.striking = 92
    p.grappling = 90
    p.cardio = 92
    p.chin = 90
    p.iq = 85
    return g
  }

  /** Fight n amateur bouts, waiting out medical suspensions (a knockout ends your year). */
  function amateurBouts(g: GameState, n: number): void {
    let done = 0
    for (let guard = 0; done < n && guard < 20; guard++) {
      if (reason(g, 'sports.mma.amateur')) {
        nextYear(g)
        continue
      }
      run(g, 'sports.mma.amateur')
      drain(g, fightPicker)
      done++
    }
    expect(done).toBe(n)
  }

  const fightPicker: Picker = (m) => {
    if (m.scriptId === 'sports.fight.pick') {
      // An ambitious fighter: title fights first, then the bigger name.
      const offers = (m.data as unknown as { offers: { kind: string; main: boolean }[] }).offers
      const best = offers.findIndex((o) => o.kind === 'title' || o.kind === 'regionalTitle' || o.kind === 'defense')
      const main = offers.findIndex((o) => o.main)
      return String(best >= 0 ? best : main >= 0 ? main : 0)
    }
    if (m.scriptId === 'sports.fight.round') return 'strike'
    if (m.scriptId === 'sports.fight.cut') return 'smart'
    if (m.scriptId === 'sports.fight.presser') return 'trash'
    if (m.scriptId === 'sports.fight.callup') return 'sign'
    if (m.scriptId === 'sports.fight.callout') return 'champ'
    if (m.scriptId === 'sports.fight.renew') return 'sign'
    if (m.scriptId === 'sports.fight.turnPro') return undefined
    return undefined
  }

  it('builds an amateur record, turns pro, gets called up and fights for the belt', () => {
    const g = fighterGame()
    amateurBouts(g, 3)
    const prof0 = flagProfile<{ amateur: Record<string, { w: number; l: number; d: number; nc: number }> }>(g, 'sports.fight')
    const am = prof0.amateur.mma
    expect(am.w + am.l + am.d).toBe(3)
    expect(reason(g, 'sports.mma.turnPro')).toBeNull()
    run(g, 'sports.mma.turnPro')
    const nat = (g.queue[0] as { choices: { id: string; label: string }[] }).choices.find((c) => /natural/.test(c.label))!.id
    drain(g, () => nat)
    expect(g.character.job?.defId).toBe('sports.fighter')
    expect(g.character.job?.title).toMatch(/MMA Fighter/)

    let titleFought = false
    let calledUp = false
    const seenAll: ModalItem[] = []
    for (let year = 0; year < 12 && !titleFought; year++) {
      for (let f = 0; f < 3; f++) {
        const nodes = sportsJobNodes(g)
        const fight = findNode(g, nodes, 'sports.fight.go')
        if (!fight || fight.type !== 'action' || fight.disabledReason?.(g)) break
        fight.run(g)
        const pickModal = g.queue.find((m) => m.kind === 'choice' && m.scriptId === 'sports.fight.pick')
        if (pickModal && pickModal.kind === 'choice' && (pickModal.data as unknown as { offers: { kind: string }[] }).offers.some((o) => o.kind === 'title')) titleFought = true
        const seen = drain(g, fightPicker)
        seenAll.push(...seen)
        if (seen.some((m) => m.kind === 'choice' && m.scriptId === 'sports.fight.callup')) calledUp = true
        checkSane(g)
        if (!g.character.job) break
      }
      if (!g.character.job || titleFought) break
      nextYear(g)
      yearlySports(g)
      drain(g, fightPicker)
      checkSane(g)
      const pr = flagProfile<Record<string, number>>(g, 'sports.fight')
      pr.striking = Math.max(pr.striking, 90)
      pr.grappling = Math.max(pr.grappling, 88)
      pr.cardio = Math.max(pr.cardio, 90)
      pr.chin = Math.max(pr.chin, 85)
    }
    if (!calledUp || !titleFought) require('fs').appendFileSync('/tmp/claude-0/-home-user-snag/10662b3d-d68a-59c1-a541-a28cb41ae61d/scratchpad/mmafail.txt', `SEED ${SEED} called ${calledUp} title ${titleFought} age ${g.character.age} job ${JSON.stringify(g.character.job?.data)} rec ${JSON.stringify((g.flags['special.sports.fight'] as any).pro)} attrs ${JSON.stringify(['striking','grappling','cardio','chin','iq'].map((k) => (g.flags['special.sports.fight'] as any)[k]))}\n`)
    expect(calledUp).toBe(true)
    expect(titleFought).toBe(true)
    const text = allText(seenAll)
    expect(text).toMatch(/Round 1/)
    expect(text).toMatch(/Victory!|Defeat|Draw/)
    expect(text).toMatch(/Hexagon Fighting Championship/)
    const prof = flagProfile<{ pro: Record<string, { w: number; l: number; d: number; nc: number; ko: number; sub: number; dec: number }>; earnings: number }>(g, 'sports.fight')
    const r = prof.pro.mma
    expect(r.w).toBeGreaterThan(3)
    expect(r.ko + r.sub + r.dec).toBe(r.w)
    expect(Number.isFinite(prof.earnings) && prof.earnings > 0).toBe(true)
    expect(sportsSummary(g)).toMatch(/MMA fighter/)
    checkSane(g)
  })

  it('round choices resolve to finishes and decisions with sane numbers', () => {
    const g = game(25)
    let finishes = 0
    for (let i = 0; i < 300; i++) {
      const a = { s: 60, g: 60, c: 60, chin: 70, iq: 50 }
      const side = () => ({ hp: 20, st: 70, top: false, reckless: false })
      const ex = fightInternals.exchange(g, a, side(), (['strike', 'grapple', 'sub', 'defend', 'taunt'] as const)[i % 5], a, side(), 'strike', 0, 60, 1)
      expect(Number.isFinite(ex.pts) && Number.isFinite(ex.finish) && Number.isFinite(ex.dmg)).toBe(true)
      expect(ex.finish).toBeGreaterThanOrEqual(0)
      expect(ex.finish).toBeLessThanOrEqual(0.55)
      if (ex.finish > 0) finishes++
    }
    expect(finishes).toBeGreaterThan(0)
  })

  it('weight cuts can be missed and cost part of the purse', () => {
    const g = fighterGame()
    const p = flagProfile<Record<string, number>>(g, 'sports.fight')
    p.natural = 5
    amateurBouts(g, 3)
    run(g, 'sports.mma.turnPro')
    drain(g, () => '3')
    expect(g.character.job?.data.cls).toBe(3)
    // A knockout in the amateurs means a medical suspension for the rest of the year.
    if (reason(g, 'sports.fight.go', sportsJobNodes(g))) nextYear(g)
    run(g, 'sports.fight.go', sportsJobNodes(g))
    const seen = drain(g, (m) => (m.scriptId === 'sports.fight.cut' ? 'extreme' : m.scriptId === 'sports.fight.round' ? 'grapple' : undefined))
    expect(seen.some((m) => m.kind === 'choice' && m.scriptId === 'sports.fight.cut')).toBe(true)
    expect(allText(seen)).toMatch(/Weigh-Ins|Fight Cancelled/)
    checkSane(g)
  })
})

}
