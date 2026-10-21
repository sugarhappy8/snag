// C-10 (docs/FEATURE-ROADMAP.md): "rival, modifier, and live venture-company collections can grow
// without bounds". Two kinds of check live here.
//
// Played years: a company in a world market is raided, undercut, licensed and bought from, and an
// investment firm backs every pitch it sees, for 200 simulated years. Every list on the market
// state and on the venture book must stay under the cap its writer documents, both as stored and as
// read back. Honest play already stays under them (the writers slice), so these are regression
// guards.
//
// Loaded records: a damaged or hand-edited save is read by readMarket and readFund, and every
// consumer calls those thousands of times a year, so a reader that keeps whatever it is given turns
// one bad save into a slow game. The market's modifier table (`mods`) and rival shares (`rivals`)
// and the venture book's live startups had no cap on the way in; they do now, with a deterministic
// choice of what to keep.
//
// test/fuzz-kit.ts checkInvariants checks finite numbers, ids and ranges but no collection length,
// so the caps below are the ones the state files themselves declare.
import { describe, expect, it } from 'vitest'
import { acquireRival, priceOffensive, talentRaid } from '../src/game/business/competition-moves'
import { marketOfBiz, marketViewOf, refreshMarket, saveMarket } from '../src/game/business/competition'
import { marketStateOf } from '../src/game/business/competition-core'
import { MAX_RIVAL_MODS, MAX_RIVAL_SHARES, MAX_WAVE_FOUNDED, readMarket, type MarketState } from '../src/game/business/competition-state'
import { financeManagerTurn } from '../src/game/business/finance-firm'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { simulateFundYear } from '../src/game/business/fund'
import { investInPitch } from '../src/game/business/fund-actions'
import { MAX_LIVE_STARTUPS, MAX_RESOLVED_STARTUPS, MAX_VC_FUNDS, readFund, saveFund } from '../src/game/business/fund-state'
import { newVcFund, openPitches, raiseQuote } from '../src/game/business/fund-vc'
import { runEnter, runCampaign, runLicense, entryCandidates } from '../src/game/business/market-strategy'
import { readTech } from '../src/game/business/deeptech-state'
import { planFor, simulateYear } from '../src/game/business/economy'
import { bizOf, readBiz, type BizState } from '../src/game/business/state'
import type { Asset, GameState, Json } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { firm } from './fund-fixtures'
import { makeTestGame } from './helpers'

/** Every list on MarketState and the length its writers and readMarket hold it to (competition-state.ts). */
const MARKET_CAPS = {
  rivals: MAX_RIVAL_SHARES,
  history: 20,
  extra: 12,
  gone: 60,
  waveFounded: MAX_WAVE_FOUNDED,
  entries: 24,
  campaigns: 12,
  deals: 6,
  acquired: 20,
  mods: MAX_RIVAL_MODS,
} as const

type Sized = Record<string, unknown>

/** Lengths of the capped lists in a market record (stored JSON or the read-back state). */
function marketSizes(m: Sized | null | undefined): Record<keyof typeof MARKET_CAPS, number> {
  const len = (v: unknown): number => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0)
  const out = {} as Record<keyof typeof MARKET_CAPS, number>
  for (const k of Object.keys(MARKET_CAPS) as (keyof typeof MARKET_CAPS)[]) out[k] = len(m?.[k])
  return out
}

function expectUnderCaps(m: Sized | null | undefined, where: string): void {
  const sizes = marketSizes(m)
  for (const k of Object.keys(MARKET_CAPS) as (keyof typeof MARKET_CAPS)[]) expect(sizes[k], `${where}: ${k}`).toBeLessThanOrEqual(MARKET_CAPS[k])
}

function worldCompany(): { g: GameState; a: Asset } {
  const g = makeTestGame(31, { age: 40, money: 1e12, countryId: 'us', city: getCountry('us').cities[0] })
  g.year = 2010
  const c = g.character
  c.stats.smarts = 95
  c.licenses = ['driver']
  // An AI lab: a world market with deep-tech moves (cross-licences) as well as buy-outs and newcomers.
  const b = newBiz(g, 'aiLab', 'us', c.city, { cash: 1e10, quality: 70, brand: 40 })
  b.tech = JSON.parse(JSON.stringify({ ...readTech(undefined), level: 55, stage: 2, venture: 1e9 })) as Json
  const a = createBusinessAsset(g, 'Bounds Lab', b, 0)
  g.assets.push(a)
  return { g, a }
}

describe('C-10: 200 played years keep the market lists under their caps', () => {
  it('a raided, undercut, licensed and bought-from market stays bounded, stored and read back', () => {
    const { g, a } = worldCompany()
    const peak = { rivals: 0, mods: 0, extra: 0, gone: 0, entries: 0, campaigns: 0, deals: 0, acquired: 0 }
    for (let year = 0; year < 200; year++) {
      g.year += 1
      g.yearActions = {}
      const b = bizOf(g, a)
      b.cash = Math.max(b.cash, 1e10)
      // Sales big enough that a buy-out of the smallest rival is allowed (takeovers need a track record).
      b.last = { ...(b.last ?? simulateYear(g, JSON.parse(JSON.stringify(b)) as BizState, g.year - 1, 0, 1).stmt), revenue: 5e9 }
      // Book the last fiscal year with fat margins, so newcomers keep being lured in.
      const st = marketOfBiz(b)
      st.year = g.year - 1
      st.share = Math.max(st.share, 0.05)
      saveMarket(b, st)
      const plan = planFor(g, b, g.year, { calm: true })
      const stmt = { ...b.last, year: g.year, demand: plan.demand, sold: plan.demand, revenue: 50_000_000, net: 20_000_000 }
      refreshMarket(g, a, b, g.year, stmt, plan.market)
      // The moves that write rivals, modifiers, entries, campaigns and deals.
      const moves = bizOf(g, a)
      priceOffensive(g, a, moves)
      talentRaid(g, a, moves)
      const view = marketViewOf(g, moves)
      for (const r of view.rivals.slice(0, 2)) runLicense(g, a, moves, r.id)
      acquireRival(g, a, moves, [...view.rivals].reverse().find((r) => !r.legacy && r.share > 0)?.id ?? '')
      const abroad = entryCandidates(moves, view)[year % 20]
      if (abroad) {
        runEnter(g, a, moves, abroad, (['export', 'jv', 'sub'] as const)[year % 3])
        runCampaign(g, a, moves, abroad)
      }
      g.queue = []
      const after = bizOf(g, a)
      expectUnderCaps(after.market as Sized, `stored, year ${g.year}`)
      const read = marketStateOf(readBiz(g, a))
      expectUnderCaps(read as unknown as Sized, `read, year ${g.year}`)
      for (const k of Object.keys(peak) as (keyof typeof peak)[]) peak[k] = Math.max(peak[k], marketSizes(read as unknown as Sized)[k])
    }
    // The run must have actually filled the lists it claims to bound, or it proves nothing.
    expect(peak.rivals).toBeGreaterThan(10)
    for (const k of ['mods', 'extra', 'gone', 'entries', 'campaigns', 'deals', 'acquired'] as const) expect(peak[k], k).toBeGreaterThan(0)
  }, 120_000)
})

/** One fiscal year of a venture firm: the hired CEO decides, the books close, the CEO decides again. */
function managedYear(g: GameState, b: BizState): void {
  g.year += 1
  g.character.age += 1
  if (b.cash < 5e8) b.cash = 5e8
  financeManagerTurn(g, b)
  simulateFundYear(g, b, g.year - 1, 0)
  b.yearCosts = 0
  b.yearIncome = 0
  financeManagerTurn(g, b)
}

/** An owner who raises a fund whenever LPs allow and backs every pitch on the table. */
function ownerYear(g: GameState, a: Asset, b: BizState): void {
  g.year += 1
  g.character.age += 1
  if (b.cash < 5e8) b.cash = 5e8
  const f = readFund(b)
  const q = raiseQuote(g, b, f, g.year)
  if (!q.block && q.size > 0 && !f.funds.some((x) => !x.done && g.year - x.vintage < 5 && x.dry > x.size * 0.03)) {
    f.funds.push(newVcFund(q.n, q.size, g.year))
    saveFund(b, f)
  }
  for (const p of openPitches(g, b, readFund(b), g.year)) investInPitch(g, a.id, p.id)
  simulateFundYear(g, b, g.year - 1, 0)
  b.yearCosts = 0
  b.yearIncome = 0
}


describe('C-10: 200 played years keep the venture book under its caps', () => {
  function bounded(who: 'ceo' | 'owner'): void {
    const { g, a, b } = firm('vc', { skill: who === 'ceo' ? 90 : undefined, cash: 5e8, money: 5e8, year: 2026 })
    const peak = { funds: 0, live: 0, resolved: 0 }
    for (let year = 0; year < 200; year++) {
      if (who === 'ceo') managedYear(g, b)
      else ownerYear(g, a, b)
      const f = readFund(b)
      const stored = b.financeFirm as unknown as { cos: { status: string }[]; funds: unknown[] }
      const live = f.cos.filter((c) => c.status === 'live').length
      const resolved = f.cos.length - live
      expect(f.funds.length, `read funds, year ${g.year}`).toBeLessThanOrEqual(MAX_VC_FUNDS)
      expect(live, `read live, year ${g.year}`).toBeLessThanOrEqual(MAX_LIVE_STARTUPS)
      expect(resolved, `read resolved, year ${g.year}`).toBeLessThanOrEqual(MAX_RESOLVED_STARTUPS)
      expect(stored.funds.length, `stored funds, year ${g.year}`).toBeLessThanOrEqual(MAX_VC_FUNDS)
      expect(stored.cos.filter((c) => c.status === 'live').length, `stored live, year ${g.year}`).toBeLessThanOrEqual(MAX_LIVE_STARTUPS)
      expect(stored.cos.length - stored.cos.filter((c) => c.status === 'live').length, `stored resolved, year ${g.year}`).toBeLessThanOrEqual(MAX_RESOLVED_STARTUPS)
      peak.funds = Math.max(peak.funds, f.funds.length)
      peak.live = Math.max(peak.live, live)
      peak.resolved = Math.max(peak.resolved, resolved)
    }
    // The firm really invested all along, so the bound is not met by an idle book.
    expect(peak.funds, who).toBeGreaterThan(5)
    expect(peak.live, who).toBeGreaterThan(5)
    expect(peak.resolved, who).toBeGreaterThan(20)
    // Twelve-year fund life and at most six checks a year: honest play never gets near the live cap.
    expect(peak.live, who).toBeLessThan(MAX_LIVE_STARTUPS / 2)
  }

  it('a venture firm run by a hired CEO', () => bounded('ceo'), 120_000)
  it('a venture firm whose owner backs every pitch', () => bounded('owner'), 120_000)
})

describe('C-10: readMarket caps what a damaged save carries', () => {
  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `rival${String(i).padStart(5, '0')}`)

  it('keeps at most MAX_RIVAL_MODS modifiers, the longest running first, whatever order they were stored in', () => {
    const entries = ids(5000).map((id, i): [string, Json] => [id, { mult: 1.1, until: 2100 + (i % 7) }])
    const read = (rows: [string, Json][]): MarketState => readMarket({ v: 1, key: 'world', mods: Object.fromEntries(rows) } as Json, 'world')!
    const forward = read(entries)
    expect(Object.keys(forward.mods).length).toBe(MAX_RIVAL_MODS)
    // Only the ones that run longest survive, and ties go to the lower id, so the choice is stable.
    expect(Object.values(forward.mods).every((m) => m.until === 2106)).toBe(true)
    expect(Object.keys(forward.mods)).toEqual(ids(5000).filter((_, i) => i % 7 === 6).slice(0, MAX_RIVAL_MODS))
    const reversed = read([...entries].reverse())
    expect(Object.keys(reversed.mods).sort()).toEqual(Object.keys(forward.mods).sort())
  })

  it('keeps at most MAX_RIVAL_SHARES rival shares, the biggest first', () => {
    const rows = ids(5000).map((id, i): [string, number] => [id, 0.0001 + (i % 1000) * 1e-6])
    const st = readMarket({ v: 1, key: 'world', rivals: rows } as unknown as Json, 'world')!
    expect(st.rivals.length).toBe(MAX_RIVAL_SHARES)
    const top = [...rows].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, MAX_RIVAL_SHARES)
    expect(st.rivals).toEqual(top)
    const reversed = readMarket({ v: 1, key: 'world', rivals: [...rows].reverse() } as unknown as Json, 'world')!
    expect(reversed.rivals).toEqual(top)
  })

  it('caps every other list a damaged record can stuff', () => {
    const many = (n: number, make: (i: number) => Json): Json[] => Array.from({ length: n }, (_, i) => make(i))
    const st = readMarket({
      v: 1, key: 'world',
      history: many(500, (i) => ({ year: 1900 + i, share: 0.1, rank: 1, size: 1 })),
      extra: many(500, (i) => ({ id: `x${i}`, name: `Newcomer ${i}`, hq: 'us', founded: 2000, pot: 1, ramp: 3, origin: 'entrant' })),
      gone: many(500, (i) => `g${i}`),
      waveFounded: many(500, (i) => `w${i}`),
      entries: many(500, (i) => ({ country: `${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26) % 26)}`, home: 'us', mode: 'export', year: 2000, until: 2005 })),
      campaigns: many(500, (i) => ({ country: `${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26) % 26)}`, home: 'us', year: 2000, until: 2005 })),
      deals: many(500, (i) => ({ rivalId: `d${i}`, year: 2000, until: 2005 })),
      acquired: many(500, (i) => 1900 + i),
    } as Json, 'world')!
    expectUnderCaps(st as unknown as Sized, 'damaged record')
    // Each one hit its cap (so the check above is not vacuous).
    const sizes = marketSizes(st as unknown as Sized)
    for (const k of ['history', 'extra', 'gone', 'waveFounded', 'entries', 'campaigns', 'deals', 'acquired'] as const) expect(sizes[k], k).toBe(MARKET_CAPS[k])
  })

  it('reads an honest record back unchanged', () => {
    const { g, a } = worldCompany()
    for (let year = 0; year < 12; year++) {
      g.year += 1
      g.yearActions = {}
      const b = bizOf(g, a)
      const st = marketOfBiz(b)
      st.year = g.year - 1
      st.share = Math.max(st.share, 0.05)
      saveMarket(b, st)
      const plan = planFor(g, b, g.year, { calm: true })
      const base = b.last ?? simulateYear(g, JSON.parse(JSON.stringify(b)) as BizState, g.year - 1, 0, 1).stmt
      refreshMarket(g, a, b, g.year, { ...base, year: g.year, demand: plan.demand, sold: plan.demand, revenue: 5e7, net: 2e7 }, plan.market)
      const moved = bizOf(g, a)
      priceOffensive(g, a, moved)
      talentRaid(g, a, moved)
    }
    const stored = bizOf(g, a).market as Json
    const once = readMarket(stored, 'world')!
    expect(Object.keys(once.mods).length).toBeGreaterThan(0)
    expect(once.rivals.length).toBeGreaterThan(10)
    expect(JSON.stringify(readMarket(JSON.parse(JSON.stringify(once)) as Json, 'world'))).toBe(JSON.stringify(once))
  })
})

describe('C-10: readFund caps what a damaged venture book carries', () => {
  const startup = (i: number, status: 'live' | 'dead' | 'exit'): Json => ({
    id: `s${i}`, name: `Startup ${i}`, emoji: 'x', sector: 'tech', fund: 1, q: 50, stage: 1, val: 1e7, own: 0.1, cost: 1e6,
    born: 2000 + (i % 50), status, end: status === 'live' ? 0 : 2010, got: 0, how: '', round: null, unicorn: false,
  })
  const fundRow = (n: number): Json => ({ n, size: 1e8, vintage: 1990 + n, dry: 0, reserve: 0, invested: 8e7, dist: 0, carry: 0, fees: 0, done: true })

  it('keeps at most MAX_LIVE_STARTUPS live startups (the newest), MAX_RESOLVED_STARTUPS resolved ones and MAX_VC_FUNDS funds', () => {
    const { b } = firm('vc')
    const saved = { ...(b.financeFirm as Record<string, Json>) }
    b.financeFirm = {
      ...saved,
      cos: Array.from({ length: 6000 }, (_, i) => startup(i, i % 3 === 0 ? 'live' : i % 3 === 1 ? 'dead' : 'exit')),
      funds: Array.from({ length: 300 }, (_, i) => fundRow(i + 1)),
    } as Json
    const f = readFund(b)
    const live = f.cos.filter((c) => c.status === 'live')
    expect(live.length).toBe(MAX_LIVE_STARTUPS)
    expect(f.cos.length - live.length).toBe(MAX_RESOLVED_STARTUPS)
    expect(f.funds.length).toBe(MAX_VC_FUNDS)
    // The newest live ones stay: the oldest are the nearest to their forced sale anyway.
    expect(live[live.length - 1].id).toBe('s5997')
    expect(live[0].id).toBe(`s${5997 - 3 * (MAX_LIVE_STARTUPS - 1)}`)
  })

  it('reads an honest book back unchanged', () => {
    const { g, b } = firm('vc', { skill: 90, cash: 5e8, money: 5e8, year: 2026 })
    for (let year = 0; year < 30; year++) managedYear(g, b)
    const once = readFund(b)
    expect(once.cos.filter((c) => c.status === 'live').length).toBeGreaterThan(0)
    b.financeFirm = JSON.parse(JSON.stringify(once)) as Json
    expect(JSON.stringify(readFund(b))).toBe(JSON.stringify(once))
  })
})
