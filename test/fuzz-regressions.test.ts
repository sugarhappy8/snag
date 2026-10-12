// Regressions for bugs found by the deep engine fuzzer (test/fuzz-kit.ts). Each test is small and
// deterministic. Menus are built from the committed state and actions run on a structuredClone
// draft, exactly like the UI store does; the committed state is deep-frozen so a menu closure
// that writes to an object it captured from it (instead of the draft) throws.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { businessCareerMenu } from '../src/game/business'
import { ownerProceeds } from '../src/game/business/exit'
import { newBiz } from '../src/game/business/founding'
import { businessAssets, readBiz, stakeValue } from '../src/game/business/state'
import { netWorth } from '../src/game/core'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import { getCountry } from '../src/game/world'
import { readTies } from '../src/game/events/wealth-core'
import { removeHeir, changeWill } from '../src/game/events/will-act'
import { willPersonNodes } from '../src/game/events/will-amends'
import { readWl, updateWl } from '../src/game/events/will-core'
import { createPerson } from '../src/game/people'
import { hire, ownerKey } from '../src/game/special/common'
import { disciplineMenu, fighterJobNodes } from '../src/game/special/sports-fight'
import { lineById } from '../src/game/shops/luxury-brands-catalog'
import { buyOffer } from '../src/game/shops/luxury-brands-deal'
import { luxuryAssetNodes } from '../src/game/shops/luxury-brands-assets'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

/** store.runMenuAction: the row comes from the committed state, run() gets a fresh draft. */
function runLikeStore(committed: GameState, action: MenuAction, input?: string): GameState {
  deepFreeze(committed)
  const draft = structuredClone(committed)
  action.run(draft, input)
  return draft
}

/** Render a menu like the UI does: every visible / text / subtitle / hint / disabled reason / header / children. */
function render(g: GameState, nodes: MenuNode[], depth = 0): number {
  let n = 0
  for (const node of nodes) {
    n++
    if (node.visible && !node.visible(g)) continue
    if (node.type === 'info') {
      if (typeof node.text === 'function') node.text(g)
      continue
    }
    if (node.type === 'heading') continue
    if (typeof node.subtitle === 'function') node.subtitle(g)
    node.hint?.(g)
    const off = node.disabledReason?.(g)
    if (node.type === 'action') {
      if (!off) node.confirm?.(g)
      continue
    }
    node.header?.(g)
    if (!off && depth < 6) n += render(g, node.children(g), depth + 1)
  }
  return n
}

function child(nodes: MenuNode[], id: string): MenuNode {
  const n = nodes.find((x) => x.id === id)
  if (!n) throw new Error(`no node ${id} in [${nodes.map((x) => x.id).join(', ')}]`)
  return n
}

describe('menu actions write to the draft, not the state they were built from', () => {
  it('Give as a Gift (luxury piece) records the gift on the receiver in the draft', () => {
    const g = makeTestGame(3, { age: 40, money: 5e9 })
    const l = lineById('cartier-tank')
    if (!l) throw new Error('cartier-tank')
    buyOffer(g, l, 0, 'boutique')
    g.queue = []
    const watch = g.assets[g.assets.length - 1]
    const kid = createPerson(g, { relation: 'child', age: 20, relationship: 70 })
    const gift = child(luxuryAssetNodes(g, watch) ?? [], `lux-gift-${watch.id}`) as MenuGroup
    const row = child(gift.children(g), `lux-giftto-${watch.id}-${kid.id}`) as MenuAction
    const worth = watch.value
    const draft = runLikeStore(g, row)
    expect(draft.assets.some((a) => a.id === watch.id)).toBe(false)
    const receiver = draft.people.find((p) => p.id === kid.id)!
    expect(readTies(draft, receiver).given).toBe(Math.round(worth))
  })

  /** A grown child who found out they were written out of the will, and is angry about it. */
  function feud(seed: number) {
    const g = makeTestGame(seed, { age: 62, money: 5_000_000 })
    const kid = createPerson(g, { relation: 'child', age: 31, relationship: 70, money: 30_000, traits: ['caring', 'calm'] })
    changeWill(g, (gg, w) => removeHeir(gg, w, kid))
    g.queue = []
    updateWl(g, kid, (w) => {
      w.known = true
      w.how = 'leak'
      w.knownY = g.year
      w.told = 'out'
      w.anger = 70
    })
    return { g, kid }
  }

  it('Your Will › Smooth It Over with Money pays the relative and eases their anger in the draft', () => {
    const { g, kid } = feud(20)
    const gift = child(willPersonNodes(g, kid), 'will.gift') as MenuAction
    const draft = runLikeStore(g, gift, '50000')
    const after = draft.people.find((p) => p.id === kid.id)!
    expect(draft.character.money).toBe(g.character.money - 50_000)
    expect(after.money).toBe(kid.money + 50_000)
    expect(readWl(draft, after).anger).toBeLessThan(70)
    expect(readWl(draft, after).buyY).toBe(draft.year)
    // ...so the row is spent for the year (the store re-checks the tapped row against the draft).
    expect(gift.disabledReason?.(draft)).toMatch(/already tried/)
  })

  it('Your Will › Heart-to-Heart and Explain Your Reasons are remembered in the draft', () => {
    const { g, kid } = feud(21)
    const peace = child(willPersonNodes(g, kid), 'will.peace') as MenuAction
    const talked = runLikeStore(g, peace)
    expect(readWl(talked, talked.people.find((p) => p.id === kid.id)!).talkY).toBe(talked.year)
    expect(peace.disabledReason?.(talked)).toMatch(/already tried/)

    const { g: g2, kid: kid2 } = feud(22)
    const explain = child(willPersonNodes(g2, kid2), 'will.explain') as MenuAction
    const explained = runLikeStore(g2, explain)
    const w = readWl(explained, explained.people.find((p) => p.id === kid2.id)!)
    expect(w.explained).toBe('kind')
    expect(w.anger).toBeLessThan(70)
  })
})

describe('menus are pure: rendering never writes to the state', () => {
  it("a pro fighter's Occupation rows and the combat-sport menus render from a frozen state", () => {
    const g = makeTestGame(11, { age: 26 })
    g.log = [{ age: 26, year: 2026, entries: [] }]
    hire(g, { defId: 'sports.fighter', title: 'Professional Nak Muay', company: 'x', salary: 0, data: { disc: 'muaythai', tier: 'major', promotion: 'x', cls: 2, rank: 1, regionalChamp: false, belts: [], defenses: 0, champ: null, fightsLeft: 3, streak: 2, promoWins: 4, injured: 1, earned: 0 } })
    g.flags['special.sports.fight'] = { striking: 50, grappling: 50, cardio: 50, chin: 60, iq: 50, natural: 2, gym: '', gymTier: 0, gymFee: 0, amateur: {}, pro: { muaythai: { w: 5, l: 2, d: 0, nc: 0, ko: 2, sub: 1, dec: 2, koLosses: 0 } }, belts: [], hype: 5, rivals: [], peakRank: 1, retiredAge: null, startAge: 22, earnings: 1000, doping: false, trained: [], lastFightAge: 26, owner: ownerKey(g) } as unknown as Json
    g.queue = []
    const before = JSON.stringify(g)
    deepFreeze(g)
    const nodes: MenuNode[] = [...fighterJobNodes(g), disciplineMenu('muaythai'), disciplineMenu('boxing')]
    expect(render(g, nodes)).toBeGreaterThan(10)
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe("investors' liquidation preference is not the founder's net worth", () => {
  it('the owner stake is what a sale at the valuation would pay the owner', () => {
    const g = makeTestGame(5, { age: 35 })
    for (const [valuation, share, pref] of [[5_520_000, 0.42, 6_210_000], [20_000_000, 0.42, 6_210_000], [8_000_000, 0.6, 4_000_000], [1_000_000, 1, 0], [3_000_000, 0.5, 0]] as const) {
      const b = newBiz(g, 'hotel', 'us', 'New York', { valuation, share, pref })
      expect(stakeValue(b), `${valuation} ${share} ${pref}`).toBe(ownerProceeds(b, valuation))
    }
  })

  it('founding a company with investor money does not raise net worth', () => {
    const g = createNewLife({ seed: 7, year: 2000, countryId: 'us' })
    g.queue = []
    g.character.age = 35
    g.character.money = 4_400_000
    g.character.city = getCountry('us').cities[0]
    g.character.stats.smarts = 70
    const before = netWorth(g)
    const start = businessCareerMenu.children(g).find((n) => n.id === 'biz.start') as MenuGroup
    ;(start.children(g).find((n) => n.id === 'biz.start.hotel') as MenuAction).run(g)
    for (let guard = 0; g.queue.length && guard < 50; guard++) {
      const m = g.queue.shift()!
      const at = g.queue.length
      // Take the most outside money on offer: the biggest starting capital, funded by investors.
      if (m.kind === 'choice') runScript(g, m.scriptId!, m.choices.some((c) => c.id === 'investors') ? 'investors' : m.choices[0].id, m.data, m)
      else if (m.kind === 'input') runScript(g, m.scriptId, m.input === 'text' ? 'Test Hotel' : String(m.max ?? m.min ?? 1), m.data, m)
      else if (m.kind === 'aiTask') applyFallback(g, m.task)
      g.queue.unshift(...g.queue.splice(at))
    }
    const a = businessAssets(g)[0]
    const b = readBiz(g, a)
    expect(b.share).toBeLessThan(1)
    expect(b.pref ?? 0).toBeGreaterThan(0)
    expect(a.value).toBe(ownerProceeds(b, b.valuation))
    expect(netWorth(g)).toBeLessThanOrEqual(before)
  })
})
