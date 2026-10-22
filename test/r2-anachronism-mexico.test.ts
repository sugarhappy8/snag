// R2 anachronism fixes found by the 400-life lint in Mexico, one case per defect:
//  (a) the crypto buy menu and the crypto market notices showed in Mexico from 2010, years before the tech
//      table's rollout there (2% of adults: 2015). Rich markets keep their early market.
//  (b) Video Game Studio could be founded in Mexico in 1972 though consoles reach Mexico only around 1981.
// Both defects are old: v4.1.1 has the same menu, notices and market definition.
import { describe, expect, it } from 'vitest'
import { industryProblem, startBusinessMenu } from '../src/game/business/founding'
import { industryEraBlock } from '../src/game/business/competition-data'
import { anachronismsIn } from '../src/game/events/era'
import { techAdoption } from '../src/game/history/timeline'
import { cryptoSince } from '../src/game/invest/era'
import { investmentsMenu } from '../src/game/investments'
import type { GameState, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function adult(year: number, countryId: string, seed = 1): GameState {
  const g = makeTestGame(seed, { age: 30, money: 5_000_000, countryId, residence: { status: 'renting', rent: 0 } })
  g.lifeId = `r2-mx-${countryId}-${seed}`
  g.year = year
  g.log = [{ age: 30, year, entries: [] }]
  return g
}

function group(g: GameState, id: string): MenuGroup {
  const node = investmentsMenu.children(g).find((n: MenuNode) => n.id === id)
  expect(node, id).toBeTruthy()
  return node as MenuGroup
}

const newsTexts = (g: GameState): string[] => group(g, 'inv-news').children(g).flatMap((n) => ('text' in n && typeof n.text === 'string' ? [n.text] : []))
const cryptoMenuShows = (g: GameState): boolean => group(g, 'inv-crypto').visible?.(g) !== false
const subtitleOf = (g: GameState): string => {
  const s = investmentsMenu.subtitle
  return typeof s === 'function' ? s(g) : (s ?? '')
}

describe('crypto only where the tech has arrived (Mexico 2010 to 2014)', () => {
  it('rolls out from the tech table: Mexico 2015, the richest markets from 2009', () => {
    expect(cryptoSince('mx')).toBe(2015)
    expect(cryptoSince('us')).toBe(2009)
    // For a country on the tech table's rollout the gate is the table's own 2% line, year by year.
    for (const cid of ['mx', 'br', 'ng']) for (let y = 2009; y <= 2022; y++) expect(y >= cryptoSince(cid), `${cid} ${y}`).toBe(techAdoption(cid, 'crypto', y) >= 0.02)
  })

  it('has no crypto menu in Mexico before 2015, and has it from 2015', () => {
    for (let y = 2009; y <= 2014; y++) expect(cryptoMenuShows(adult(y, 'mx')), `mx ${y}`).toBe(false)
    for (const y of [2015, 2016, 2020]) expect(cryptoMenuShows(adult(y, 'mx')), `mx ${y}`).toBe(true)
  })

  it('has no crypto market notices in Mexico before 2015, and has them from 2016', () => {
    for (let y = 2009; y <= 2014; y++) {
      const g = adult(y, 'mx')
      const bad = newsTexts(g).filter((t) => /crypto|coin|internet currency/i.test(t))
      expect(bad, `mx ${y}`).toEqual([])
      for (const t of newsTexts(g)) expect(anachronismsIn(t, y, ['mx']), `mx ${y}: ${t}`).not.toContain('crypto')
    }
    expect(newsTexts(adult(2016, 'mx')).some((t) => /crypto/i.test(t))).toBe(true)
  })

  it("does not name crypto on the Investments menu's own line before it exists there", () => {
    expect(subtitleOf(adult(2012, 'mx'))).not.toMatch(/crypto/i)
    expect(subtitleOf(adult(1985, 'us'))).not.toMatch(/crypto/i)
    expect(subtitleOf(adult(2016, 'mx'))).toMatch(/crypto/i)
  })

  it('keeps the early market of the richest countries: the US still has its 2010 coins, menu and notices', () => {
    const g = adult(2010, 'us')
    expect(cryptoMenuShows(g)).toBe(true)
    expect(group(g, 'inv-crypto').children(g).length).toBeGreaterThan(0)
    expect(newsTexts(g).some((t) => /crypto/i.test(t))).toBe(true)
    expect(subtitleOf(g)).toMatch(/crypto/i)
  })
})

describe('Video Game Studio only where game machines have arrived (Mexico 1972)', () => {
  it('is not founded in Mexico before consoles reach it, and is from then on', () => {
    // First year the tech table says 2% of Mexican households have a console.
    let first = 1972
    while (techAdoption('mx', 'videoGameConsole', first) < 0.02) first++
    expect(first).toBeGreaterThan(1975)
    for (let y = 1971; y < first; y++) {
      expect(industryEraBlock('gameStudio', 'mx', y), `mx ${y}`).toBeTruthy()
      expect(industryProblem(adult(y, 'mx'), 'gameStudio'), `mx ${y}`).toBeTruthy()
    }
    for (const y of [first, first + 5, 2000]) {
      expect(industryEraBlock('gameStudio', 'mx', y), `mx ${y}`).toBeNull()
      expect(industryProblem(adult(y, 'mx'), 'gameStudio'), `mx ${y}`).toBeNull()
    }
  })

  it('tells a Mexican player in 1972 the studio is not invented yet, and offers no way to start one', () => {
    const g = adult(1972, 'mx')
    const row = startBusinessMenu.children(g).find((n: MenuNode) => n.id === 'biz.start.gameStudio')
    expect(row).toBeTruthy()
    if (!row || row.type !== 'action') throw new Error('no studio row')
    expect(typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle).toBe('Not invented yet')
    expect(row.disabledReason?.(g)).toBeTruthy()
  })

  it('keeps the studio open in the US from 1972 and in Mexico today', () => {
    for (const y of [1972, 1979, 1990, 2026]) expect(industryEraBlock('gameStudio', 'us', y), `us ${y}`).toBeNull()
    expect(industryProblem(adult(1979, 'us'), 'gameStudio')).toBeNull()
    expect(industryProblem(adult(2026, 'mx'), 'gameStudio')).toBeNull()
  })
})
