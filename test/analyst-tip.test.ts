// The free analyst tip in the Financial News looks at the year just gone, never at next year.
// Only the Investing talent's gut (invest/instinct.ts) is allowed to know what comes next
// (advisor-manager spec, decision D2), so without the talent the tip must be a coin flip about
// the future: it reads exchangeYear for g.year and earlier, and it calls a stock "strong" when
// its return this year beats the median of that year's stocks.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const asked = vi.hoisted(() => ({ years: [] as number[] }))

vi.mock('../src/game/invest/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/invest/engine')>()
  return {
    ...real,
    exchangeYear: (...args: Parameters<typeof real.exchangeYear>) => {
      asked.years.push(args[3])
      return real.exchangeYear(...args)
    },
  }
})

import { companyDef, eraIdentity, exchangeInfo, exchangeYear } from '../src/game/invest/engine'
import { isRealName } from '../src/game/invest/real'
import { investmentsMenu } from '../src/game/investments'
import { timelineFamily } from '../src/game/timeMachine'
import type { GameState, MenuGroup } from '../src/game/types'
import { makeTestGame } from './helpers'

const SEEDS = 40
const YEARS = 12
const STEP = 3
const FIRST_YEAR = 2027
const TIP = /^📣 /

function investor(seed: number, countryId = 'us', talent = false, year = FIRST_YEAR): GameState {
  const g = makeTestGame(seed, { age: year - 1997, money: 1_000_000, countryId, talents: talent ? ['Investing'] : undefined })
  g.lifeId = `tip-${countryId}-${seed}`
  g.year = year
  g.log = [{ age: g.character.age, year, entries: [] }]
  return g
}

function later(g: GameState, years: number): void {
  g.year += years
  g.character.age += years
}

function newsLines(g: GameState): string[] {
  const news = investmentsMenu.children(g).find((n) => n.id === 'inv-news') as MenuGroup
  return news.children(g).map((n) => (n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : ''))
}

function tipOf(g: GameState): string | null {
  return newsLines(g).find((t) => TIP.test(t)) ?? null
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

function famOf(g: GameState): string {
  return timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))
}

function anchorOf(g: GameState): number {
  return g.year - g.character.age
}

/** The tip, read from the text, and the truth about next year measured straight from the engine (the test may peek). */
interface Call {
  strong: boolean
  fictional: boolean
  /** Return of the stock (or the sector's median) over the year just gone. */
  thisYear: number
  /** Did the stock (or the sector's average) go up over the year after? */
  nextUp: boolean
}

function callOf(g: GameState, text: string): Call | null {
  const info = exchangeInfo(g.character.countryId)
  const f = famOf(g)
  const an = anchorOf(g)
  const now = exchangeYear(f, an, info, g.year)
  const next = exchangeYear(f, an, info, g.year + 1)
  const fic = text.match(/(rates|cuts) .+ \(([^)]+)\) (?:a (?:strong )?buy|to a sell)/)
  if (fic) {
    const s = now.stocks.find((q) => companyDef(info, q.slot, q.gen).symbol === fic[2])
    if (!s) return null
    const after = next.stocks[s.slot]
    if (!after || after.gen !== s.gen) return null
    return { strong: fic[1] === 'rates', fictional: true, thisYear: s.ret, nextUp: after.ret > 0 }
  }
  const sector = text.match(/is (bullish|cautious) on (.+) stocks/)
  if (!sector) return null
  const peers = now.stocks.filter((q) => eraIdentity(companyDef(info, q.slot, q.gen), g.year).label.toLowerCase() === sector[2] && next.stocks[q.slot]?.gen === q.gen)
  if (!peers.length) return null
  const avg = peers.reduce((sum, q) => sum + next.stocks[q.slot].ret, 0) / peers.length
  return { strong: sector[1] === 'bullish', fictional: false, thisYear: median(peers.map((q) => q.ret)), nextUp: avg > 0 }
}

beforeEach(() => {
  asked.years.length = 0
})

describe('the free analyst tip', () => {
  it('reads no year after g.year, with no talent, over 40 seeds by 12 years', { timeout: 120_000 }, () => {
    let opened = 0
    let worst = -Infinity
    for (let seed = 1; seed <= SEEDS; seed++) {
      const g = investor(seed)
      for (let i = 0; i < YEARS; i++, later(g, STEP)) {
        asked.years.length = 0
        newsLines(g)
        opened++
        for (const y of asked.years) worst = Math.max(worst, y - g.year)
        expect(asked.years.length, `seed ${seed} year ${g.year} asked for nothing`).toBeGreaterThan(0)
      }
    }
    expect(opened).toBe(SEEDS * YEARS)
    expect(worst).toBeLessThanOrEqual(0)
  })

  it('is a coin flip about next year: the call matches the true next-year sign about half the time', { timeout: 120_000 }, () => {
    let calls = 0
    let hits = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const g = investor(seed)
      for (let i = 0; i < YEARS; i++, later(g, STEP)) {
        const text = tipOf(g)
        if (!text) continue
        const call = callOf(g, text)
        if (!call) continue
        calls++
        if (call.strong === call.nextUp) hits++
      }
    }
    expect(calls).toBeGreaterThan(300)
    const rate = hits / calls
    expect(rate, `${hits} of ${calls}`).toBeGreaterThan(0.44)
    expect(rate, `${hits} of ${calls}`).toBeLessThan(0.6)
  })

  it('calls a made-up stock a buy when its year beat the median of that year, and a sell when it did not', { timeout: 120_000 }, () => {
    let fictional = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const g = investor(seed)
      for (let i = 0; i < YEARS; i++, later(g, STEP)) {
        const text = tipOf(g)
        if (!text) continue
        const m = text.match(/^📣 (.+) (rates|cuts) (.+) \(([^)]+)\) (?:a buy|to a sell) after a ([+-]?\d+)% year\.$/)
        if (!m) continue
        fictional++
        const info = exchangeInfo(g.character.countryId)
        const now = exchangeYear(famOf(g), anchorOf(g), info, g.year)
        const rets = now.stocks.filter((q) => q.event !== 'ipo' && !q.ended).map((q) => q.ret)
        const s = now.stocks.find((q) => companyDef(info, q.slot, q.gen).symbol === m[4])!
        expect(isRealName(m[3]), `${m[3]} is a made-up company`).toBe(false)
        expect(m[2] === 'rates', `${text} (return ${s.ret}, median ${median(rets)})`).toBe(s.ret > median(rets))
        // The year it quotes is the year just gone.
        expect(Math.abs(Number(m[5]) - s.ret * 100)).toBeLessThanOrEqual(0.6)
        expect(text.length).toBeLessThanOrEqual(120)
      }
    }
    expect(fictional).toBeGreaterThan(30)
  })

  it('keeps real companies to sector calls and never says strong buy or overvalued', { timeout: 120_000 }, () => {
    let sectorCalls = 0
    for (const year of [1975, 1990, 2005, 2019, 2026, 2040]) {
      for (let seed = 1; seed <= 10; seed++) {
        const g = investor(seed, 'us', false, year)
        const lines = newsLines(g)
        expect(lines.join('\n'), `${year} seed ${seed}`).not.toMatch(/strong buy|overvalued/)
        const text = lines.find((t) => TIP.test(t))
        if (!text) continue
        if (/ (rates|cuts) /.test(text)) {
          const name = text.match(/^📣 .+? (?:rates|cuts) (.+) \([^)]+\) /)![1]
          expect(isRealName(name), `${year} seed ${seed}: ${text}`).toBe(false)
        } else {
          sectorCalls++
          expect(text, `${year} seed ${seed}`).toMatch(/^📣 .+ is (?:bullish on .+ stocks after a strong year|cautious on .+ stocks after a weak year)\.$/)
        }
      }
    }
    expect(sectorCalls).toBeGreaterThan(5)
  })

  it('still shows the Investing talent its gut feeling, and only with the talent', () => {
    const plain = investor(3)
    expect(newsLines(plain).some((t) => /Market instinct for/.test(t))).toBe(false)
    const gifted = investor(3, 'us', true)
    const lines = newsLines(gifted)
    expect(lines.filter((t) => /Market instinct for \d{4}/.test(t))).toHaveLength(1)
    expect(lines.some((t) => TIP.test(t))).toBe(true)
  })

  it('gives the same lines every time it is opened and touches no random stream', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const g = investor(seed)
      const before = JSON.stringify(g)
      const first = newsLines(g)
      const second = newsLines(g)
      expect(second).toEqual(first)
      expect(g.rng).toBe(seed)
      expect(JSON.stringify(g)).toBe(before)
    }
  })
})
