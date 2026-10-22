// R2 anachronism fixes (tech): two latent words-before-their-technology defects the 400-life lint
// (test/anachronism.test.ts, ANACHRONISM_LIVES=400) finds, both already in v4.1.1.
//   (c) the Name popup of a Cybersecurity Company ("Stop the hackers...") in Portugal in 1996, before the
//       internet reached 2% of Portugal (the hasTech bar). The trade itself stays open (antivirus floppies,
//       and test/deeptech.test.ts founds it in India and Nigeria in 2000); its pitch waits for the internet.
//   (d) the dot-com boom notice ("...internet and chip companies...") reached a Brazilian company in
//       1998, where the internet isn't there yet. Gate: the event needs the internet in the country.
import { describe, expect, it } from 'vitest'
import { anachronismsIn } from '../src/game/events/era'
import { techAdoption } from '../src/game/history/timeline'
import { activeMarketEvents, eventStrength, MARKET_EVENTS } from '../src/game/history/market-events'
import { industryEraBlock } from '../src/game/business/competition-data'
import { createBusinessAsset, industryPitch, industryProblem, newBiz, startBusinessMenu } from '../src/game/business/founding'
import { INDUSTRIES } from '../src/game/business/industries'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { COUNTRIES, getCountry } from '../src/game/world'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

const hasNet = (country: string, year: number) => techAdoption(country, 'internet', year) >= 0.02

/** A player with one real-estate company in `country`, in `year`, ready for the yearly business step. */
function withCompany(seed: number, country: string, year: number): GameState {
  const g = makeTestGame(seed, { age: 45, money: 5e6 })
  g.year = year
  g.character.countryId = country
  g.character.city = getCountry(country).cities[0]
  g.assets.push(createBusinessAsset(g, 'Bricks Co', newBiz(g, 'realEstate', country, g.character.city, { cash: 2e6, founded: 1990 }), 1e6))
  return g
}

/** The market notices (mkt-<event>-...) the yearly step queued, as [event id, text]. */
function marketNotices(g: GameState): [string, string][] {
  return g.queue.flatMap((q) => (q.kind === 'notice' && q.id.startsWith('mkt-') ? [[q.id.split('-')[1], q.text] as [string, string]] : []))
}

describe('(c) the cybersecurity pitch waits for the internet', () => {
  const cyber = INDUSTRIES.cybersecurity
  const FLOPPY = 'Stop the viruses before they stop your clients. Paranoia as a service.'
  const player = (country: string, year: number): GameState => {
    const g = makeTestGame(31, { age: 35, money: 5e6 })
    g.character.countryId = country
    g.year = year
    return g
  }

  it('the plain pitch is an internet word, and Portugal had no internet in 1996 by the tech table', () => {
    expect(anachronismsIn(cyber.blurb, 1996, ['pt'])).toContain('hacking')
    expect(hasNet('pt', 1996)).toBe(false)
    expect(hasNet('pt', 1997)).toBe(true)
  })

  /** The text of the first popup a trade's row in Start a Business opens (the Name popup). */
  const namePopup = (g: GameState, industry: string): string => {
    const row = startBusinessMenu.children(g).find((n: MenuNode): n is MenuAction => n.type === 'action' && n.id === `biz.start.${industry}`)
    expect(row, `a row for ${industry}`).toBeTruthy()
    expect(row!.disabledReason?.(g) ?? null).toBeNull()
    g.queue = []
    row!.run(g)
    const m = g.queue[0]
    expect(m?.kind).toBe('input')
    return m && m.kind === 'input' ? m.text : ''
  }

  it('the real Name popup in Portugal in 1996 pitches antivirus, not hackers; in Portugal in 1997 and the US in 1996 it is unchanged', () => {
    const early = namePopup(player('pt', 1996), 'cybersecurity')
    expect(early).toBe(`${FLOPPY} What will you call it?`)
    expect(anachronismsIn(early, 1996, ['pt'])).toEqual([])
    expect(namePopup(player('pt', 1997), 'cybersecurity')).toBe(`${cyber.blurb} What will you call it?`)
    expect(namePopup(player('us', 1996), 'cybersecurity')).toBe(`${cyber.blurb} What will you call it?`)
  })

  it('the Name popup of a Portuguese cybersecurity company in 1996 pitches antivirus, not hackers', () => {
    expect(industryProblem(player('pt', 1996), 'cybersecurity')).toBeNull()
    expect(industryPitch(player('pt', 1996), 'cybersecurity')).toBe(FLOPPY)
    expect(anachronismsIn(industryPitch(player('pt', 1996), 'cybersecurity'), 1996, ['pt'])).toEqual([])
  })

  it('every other country and year keeps today\'s pitch: the internet countries and years, and the trades that never changed', () => {
    for (const [country, year] of [['pt', 1997], ['us', 1996], ['gb', 1996], ['us', 2026], ['de', 2010]] as const) {
      expect(industryPitch(player(country, year), 'cybersecurity'), `${country} ${year}`).toBe(cyber.blurb)
    }
    expect(industryPitch(player('us', 1996), 'cafe')).toBe(INDUSTRIES.cafe.blurb)
    expect(industryPitch(player('us', 1985), 'cafe')).toBe('Coffee, pastries and customers who never leave.')
    expect(industryPitch(player('us', 1950), 'grocery')).toBe('Everybody eats. Margins thinner than the paper bags.')
    expect(industryPitch(player('us', 1996), 'grocery')).toBe(INDUSTRIES.grocery.blurb)
    expect(industryPitch(player('pt', 1996), 'bakery')).toBe(INDUSTRIES.bakery.blurb)
  })

  it('wherever and whenever it can be founded, the pitch is not ahead of the internet (every country, 1900-2060)', () => {
    const g = player('us', 2000)
    const bad: string[] = []
    for (const c of COUNTRIES) {
      for (let y = 1900; y <= 2060; y++) {
        if (industryEraBlock('cybersecurity', c.id, y)) continue
        g.character.countryId = c.id
        g.year = y
        if (anachronismsIn(industryPitch(g, 'cybersecurity'), y, [c.id]).length) bad.push(`${c.id} ${y}`)
      }
    }
    expect(bad.slice(0, 5)).toEqual([])
  })
})

describe('(d) the dot-com boom and bust need the internet', () => {
  it('Brazil had no internet in 1998 by the tech table, so the boom does not reach it; the US, UK and Portugal keep it', () => {
    expect(hasNet('br', 1998)).toBe(false)
    expect(eventStrength(MARKET_EVENTS.find((e) => e.id === 'dotcomBoom')!, 'br', 1998)).toBe(0)
    expect(activeMarketEvents('br', 1998).map((x) => x.event.id)).not.toContain('dotcomBoom')
    const boom = MARKET_EVENTS.find((e) => e.id === 'dotcomBoom')!
    expect(eventStrength(boom, 'us', 1998)).toBeCloseTo(0.75, 9)
    expect(eventStrength(boom, 'gb', 1998)).toBeCloseTo(0.75 * 0.7, 9)
    expect(eventStrength(boom, 'pt', 1998)).toBeCloseTo(0.75 * 0.7, 9)
    expect(activeMarketEvents('pt', 1998).map((x) => x.event.id)).toContain('dotcomBoom')
  })

  it('a Brazilian company hears no dot-com boom notice in 1998, a US one still does (1997), and no market notice breaks an era rule', () => {
    const br = withCompany(41, 'br', 1998)
    yearlyBusinessImpl(br)
    expect(marketNotices(br).map(([id]) => id)).not.toContain('dotcomBoom')
    for (const [id, text] of marketNotices(br)) expect(anachronismsIn(text, br.year, ['br']), id).toEqual([])
    const us = withCompany(42, 'us', 1997)
    yearlyBusinessImpl(us)
    const boom = marketNotices(us).find(([id]) => id === 'dotcomBoom')
    expect(boom?.[1]).toMatch(/internet and chip companies/)
  })

  it('the bust has the same text and the same gate: India (no internet in 2001) hears none, the US still does (2000)', () => {
    expect(hasNet('in', 2001)).toBe(false)
    const india = withCompany(43, 'in', 2001)
    yearlyBusinessImpl(india)
    expect(marketNotices(india).map(([id]) => id)).not.toContain('dotcomCrash')
    for (const [id, text] of marketNotices(india)) expect(anachronismsIn(text, india.year, ['in']), id).toEqual([])
    const us = withCompany(44, 'us', 2000)
    yearlyBusinessImpl(us)
    expect(marketNotices(us).map(([id]) => id)).toContain('dotcomCrash')
  })

  it('wherever and whenever either event is at work, its text is not ahead of the internet (every country, 1990-2010)', () => {
    const bad: string[] = []
    for (const c of COUNTRIES) {
      for (let y = 1990; y <= 2010; y++) {
        for (const { event } of activeMarketEvents(c.id, y)) {
          if (event.id !== 'dotcomBoom' && event.id !== 'dotcomCrash') continue
          if (anachronismsIn(event.text, y, [c.id]).length) bad.push(`${c.id} ${y}: ${event.id}`)
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([])
  })
})
