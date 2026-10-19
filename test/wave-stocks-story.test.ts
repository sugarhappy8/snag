import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { marketMove } from '../src/game/business/fund-model'
import { advanceHeavy } from '../src/game/business/heavy-rd'
import { bizOf } from '../src/game/business/state'
import { readTechWaves } from '../src/game/business/tech-waves'
import { killCharacter } from '../src/game/death'
import { marketInstinct } from '../src/game/invest/instinct'
import { waveStockFactor } from '../src/game/invest/wave-stocks'
import { buySecurity, investmentListing, investmentsMenu } from '../src/game/investments'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { migrateSave, SAVE_SCHEMA } from '../src/game/save-schema'
import { peek } from '../src/game/special/common'
import type { GameState, MenuNode } from '../src/game/types'
import { adult, allNodes, company } from './market-kit'
import { exposedIn, holdable, project, rows } from './wave-kit'

const textOf = (g: GameState, n: MenuNode) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')
function play(seed: number, position: boolean) {
  const g = adult(seed, 2028, 'us'), a = company(g, 'software', { cash: 80_000_000 }); g.queue = []; g.character.talents = ['Business', 'Investing']
  const t = holdable(g, [2028], 'ai')[0]; expect(t, 'no ai-supply stock listed in 2028').toBeDefined(); if (position) expect(buySecurity(g, t.secId, 200_000)).toBe(true)
  const before = structuredClone(g), won = advanceHeavy(g, a, bizOf(g, a), project(g, 'Autonomous Agent Platform', 0.98), g.year - 1).won
  return { g, a, t, before, won }
}
const launched = (position: boolean) => { for (let seed = 1; seed <= 40; seed++) { const p = play(seed, position); if (p.won) return p } throw new Error('no launch won in 40 seeds') }

describe('the story', () => {
  it('a heavy launch lifts the sector level, the quote, the funds, the gut and the screen', () => {
    for (const position of [true, false]) {
      const { g, before, t } = launched(position), lvl = waveStockFactor(g, t.secId, g.year), price = (x: GameState) => investmentListing(x).find((q) => q.secId === t.secId)!.price
      expect(readTechWaves(g)[0]).toMatchObject({ kind: 'ai', year: g.year }); expect(lvl).toBeGreaterThan(1); expect(price(g) / price(before)).toBeCloseTo(lvl, 9)
      expect((1 + marketMove(g, 'us', g.year)) / (1 + marketMove(before, 'us', g.year))).toBeGreaterThan(1); expect(marketInstinct(g)).not.toBe(marketInstinct(before))
      expect(allNodes(g, investmentsMenu.children(g)).some((n) => textOf(g, n).startsWith('Autonomous Agent Platform wave: sector '))).toBe(true)
    }
  })
  it('an insider position is caught on some seed and a clean one never', () => {
    let caught = 0
    for (let seed = 1; seed <= 40 && caught < 2; seed++) {
      const dirty = play(seed, true), clean = play(seed, false); if (!dirty.won) continue
      expect(rows(dirty.g)).toHaveLength(1); expect(rows(dirty.g)[0]).toMatchObject({ cause: 'wave', role: 'founder' })
      if (exposedIn(dirty.g, dirty.g.year + 1, dirty.g.year + 6)) caught++
      if (clean.won) { expect(rows(clean.g)).toEqual([]); expect(exposedIn(clean.g, clean.g.year + 1, clean.g.year + 6)).toBeUndefined() }
    }
    expect(caught).toBeGreaterThan(0)
  }, 120_000)
  it('an heir inherits the waves and the level but never the case', () => {
    const { g, t } = launched(true); expect(rows(g)).toHaveLength(1)
    g.character.age = 70; const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 }); killCharacter(g, 'Old Age'); g.queue = []
    const n = continueAsChild(g, heir.id)
    expect(readTechWaves(n)).toEqual(readTechWaves(g)); expect(waveStockFactor(n, t.secId, g.year)).toBeCloseTo(waveStockFactor(g, t.secId, g.year), 9); expect([peek(g, 'politics') !== null, peek(n, 'politics')]).toEqual([true, null])
  })
})

describe('old saves, money paths and notes', () => {
  it('an old save loads with no wave state and plays years', () => {
    const r = migrateSave(structuredClone(JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>))
    if (r.kind !== 'ready') throw new Error(`expected a ready save, got ${JSON.stringify(r)}`)
    const game = r.game; for (let i = 0; i < 3; i++) { game.queue = []; ageUp(game) }
    expect([SAVE_SCHEMA, ['techWaves', 'techBase'].filter((k) => k in game.flags), investmentListing(game).length > 0]).toEqual([2, [], true])
  })
  it('no new code path adds money (C-03)', () => {
    for (const f of ['invest/wave-stocks.ts', 'invest/clock.ts', 'business/wave-insider.ts']) expect(readFileSync(`src/game/${f}`, 'utf8'), f).not.toMatch(/\b(addMoney|earnIncome|realize|spend)\(/)
  })
  it('the architecture notes name the new modules and say listed stocks take the level', () => {
    const arch = readFileSync('docs/ARCHITECTURE.md', 'utf8')
    for (const name of ['invest/wave-stocks.ts', 'invest/clock.ts', 'business/wave-insider.ts', '### Tech waves and stocks']) expect(arch, name).toContain(name)
    for (const stale of ['listed stocks are untouched until release 1b', 'listed stocks stay wave-free until release 1b']) expect(arch).not.toContain(stale)
  })
})
