import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { becomeCeo } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessAssets, bizOf, readBiz } from '../src/game/business/state'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'

function drain(g: GameState, log: string[]): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => c.hint) ?? m.choices[0]
      if (m.choices.some((c) => c.hint)) log.push(`${m.title} -> ${ch.id} ${ch.hint}`)
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') {
      runScript(g, m.scriptId, m.defaultValue || (m.input === 'number' ? String(m.min ?? 1) : 'Test Co'), m.data, m)
    } else if (m.kind === 'minigame') {
      if (m.game === 'annualReport') {
        const r = m.data as unknown as AnnualReportData
        log.push(`report ${r.businessName} ${r.talentHint?.text}`)
        runScript(g, m.scriptId, JSON.stringify(r.talentHint ? { price: r.talentHint.price, production: r.talentHint.production } : { price: r.suggestedPrice, production: r.expectedDemand }), m.data, m)
      } else runScript(g, m.scriptId, 'done', m.data, m)
    } else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

describe('integration', () => {
  for (const cid of ['us', 'jp', 'br', 'ng', 'tw', 'kr']) {
    it(`talented owner lives in ${cid}`, () => {
      const g = createNewLife({ seed: 9, year: 1990, countryId: cid, talents: ['Business', 'Investing'] } as never)
      g.queue = []
      for (let i = 0; i < 25; i++) {
        ageUp(g)
        drain(g, [])
      }
      if (!g.character.alive) return
      g.character.money += 2_000_000
      const city = getCountry(cid).cities[0]
      for (const ind of ['restaurant', 'software', 'cafe'] as const) {
        const b0 = newBiz(g, ind, cid, city, { cash: 200_000 })
        const a = createBusinessAsset(g, `${ind} Co`, b0, 100_000)
        g.assets.push(a)
        if (ind === 'restaurant') becomeCeo(g, a, b0)
      }
      const log: string[] = []
      let maxMs = 0
      for (let y = 0; y < 30 && g.character.alive; y++) {
        const t = performance.now()
        ageUp(g)
        maxMs = Math.max(maxMs, performance.now() - t)
        drain(g, log)
        for (const a of businessAssets(g)) {
          const b = readBiz(g, a)
          for (const v of [b.cash, b.price, b.production, b.valuation, b.brand]) expect(Number.isFinite(v)).toBe(true)
        }
        expect(Number.isFinite(g.character.money)).toBe(true)
      }
      console.log(cid, 'max ageUp ms', Math.round(maxMs), 'money', Math.round(g.character.money), 'biz', businessAssets(g).length, '\n ' + log.slice(0, 14).join('\n '))
      void bizOf
    }, 120_000)
  }
})
