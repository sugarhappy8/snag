// Review fixes for the real-rival cast: what you read AFTER answering a rival event is as neutral
// as the question (real companies are never accused of anything, mocked or quoted), hidden adult
// brand names stay unique and cover bars as well as breweries, and rival profiles stay factual.
import { describe, expect, it } from 'vitest'
import { COMPETITION_EVENTS, presentCompetitionEvent } from '../src/game/business/competition-events'
import { adultBrandName, marketViewOf } from '../src/game/business/competition'
import { profileOf } from '../src/game/business/market-view'
import { bizOf, readBiz } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, NoticeModal } from '../src/game/types'
import { adult, company, nextYear, renderAll } from './market-kit'

const SNIDE = /run out of money|fantasy|\bCEO\b|lawyers are watching|nobody can quite say|restructur|follows orders|scandal|fraud|lawsuit|breach|recall|bankrupt|knockoff|shameless/i

function allText(g: GameState): string {
  return g.queue
    .flatMap((m) => {
      if (m.kind === 'notice') return [(m as NoticeModal).title, (m as NoticeModal).text]
      if (m.kind === 'choice') return [(m as ChoiceModal).title, (m as ChoiceModal).text]
      return []
    })
    .join('\n')
}

describe('what you read after answering a rival event', () => {
  it('never mocks, quotes or accuses a real company, whichever choice you make', () => {
    let exercised = 0
    for (const [ind, cid, year] of [['restaurant', 'us', 2010], ['software', 'us', 2015], ['manufacturing', 'de', 1985]] as [Industry, string, number][]) {
      const g = adult(21, year, cid)
      const a = company(g, ind)
      for (let i = 0; i < 2; i++) nextYear(g)
      bizOf(g, a).products.push({ name: 'Flagship', launched: g.year - 1, boost: 0.1 })
      const real = new Set(marketViewOf(g, bizOf(g, a)).rivals.filter((r) => r.real).map((r) => r.name))
      for (const ev of COMPETITION_EVENTS) {
        if (ev.id === 'rivalScandal' || ev.id === 'newcomer') continue
        g.queue = []
        presentCompetitionEvent(g, a, bizOf(g, a), ev.id)
        const modal = g.queue.find((m) => m.kind === 'choice') as ChoiceModal | undefined
        if (!modal) continue
        const rival = String((modal.data as Record<string, unknown> | undefined)?.rival ?? '')
        if (!real.has(rival)) continue
        for (const ch of modal.choices) {
          const g2 = structuredClone(g)
          g2.queue = []
          runScript(g2, modal.scriptId!, ch.id, modal.data, modal)
          const text = allText(g2)
          expect(text, `${ind}/${ev.id}/${ch.id}`).not.toMatch(SNIDE)
          exercised++
        }
      }
    }
    expect(exercised).toBeGreaterThan(10)
  })

  it('describes a real rival that is losing ground or state-backed without calling it troubled', () => {
    const g = adult(22, 2000, 'us')
    const a = company(g, 'spaceTech' as Industry)
    for (let i = 0; i < 2; i++) nextYear(g)
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    for (const r of v.rivals) {
      const p = profileOf(g, b, v, r.id)!
      expect(`${p.next} ${p.recent.join(' ')}`).not.toMatch(SNIDE)
    }
  })
})

describe('adult brand names', () => {
  it('stay unique for any length of field and cover bars as well as breweries', () => {
    const g = adult(23, 2012, 'de')
    const a = company(g, 'brewery')
    const b = readBiz(g, a)
    g.character.age = 10
    const names = Array.from({ length: 80 }, (_, i) => adultBrandName(g, b, 'Heineken', true, i))
    expect(new Set(names).size).toBe(80)
    expect(names[0]).toBe('Brewer A')
    expect(names[25]).toBe('Brewer Z')
    expect(names[26]).toBe('Brewer AA')
    expect(adultBrandName(g, b, 'Fictional Ales', false, 3)).toBe('Fictional Ales')
    g.character.age = 40
    expect(adultBrandName(g, b, 'Heineken', true, 0)).toBe('Heineken')
    const bar = company(g, 'bar')
    const bb = readBiz(g, bar)
    g.character.age = 9
    expect(adultBrandName(g, bb, "Hofbräuhaus München", true, 1)).toBe('Bar B')
    const rest = company(g, 'restaurant')
    expect(adultBrandName(g, readBiz(g, rest), "McDonald's", true, 0)).toBe("McDonald's")
    g.character.age = 40
  })

  it('hides real bar names from a minor heir on every screen', () => {
    const g = adult(24, 2012, 'gb')
    const a = company(g, 'bar')
    for (let i = 0; i < 2; i++) nextYear(g)
    g.character.age = 11
    const text = renderAll(g, a).join('\n')
    expect(text).not.toMatch(/Wetherspoon|Harvester|All Bar One|Slug and Lettuce|Hooters|Chili's/)
    g.character.age = 40
  })
})
