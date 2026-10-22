// R3-G2 (H.4): the market overview, the countries and national markets, and the what-if scenarios read estimates.
//
// The owner's rule (D27): the player's own industry is known, so size, share, rank, leaders and demand stay numbers in every country
// of it. What the player cannot see is fogged: the chance of an antitrust case (a word, a percent only with the Business talent),
// the profit a what-if move should make (a range), and the market of an industry the player has no company in (a range and a chip).
// The same rows in Exact mode are today's text, byte for byte. Menus stay pure: no dice, no writes, the same rows twice.
import { describe, expect, it } from 'vitest'
import { marketOfBiz, marketViewOf, saveMarket, shareText } from '../src/game/business/competition'
import { marketCtxFor } from '../src/game/business/economy'
import {
  FORECAST_FLOOR, antitrustEstimate, antitrustKey, antitrustRead, antitrustTruth, demandRead, forecastRead, knownMarket, marketShareKey,
  marketSizeKey, marketTruth, profitRead, scenarioKey, scenarioScope, shareBand, unknownMarket,
} from '../src/game/business/market-fog'
import { countryRows, localRows, scenarioLine, scenarioRead, scenarioRows, scenarioTruth, type ScenarioRow } from '../src/game/business/market-menu'
import { countryDetail, localField } from '../src/game/business/market-view'
import { bizOf, readBiz } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { know } from '../src/game/knowledge/contract'
import { withInfoMode } from '../src/game/knowledge/mode'
import { parseKey } from '../src/game/knowledge/keys'
import type { Asset, GameState, MenuInfo, MenuNode } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { coverage, deepFreeze, fogGame, inFog, unitAt } from './knowledge-kit'
import { adult, allNodes, company, marketNode, nextYear, renderAll } from './market-kit'

type Industry = Parameters<typeof company>[1]

/** A grown-up with a company, three years in. `talents` empty is a life without the Business talent. */
function world(ind: Industry, cid: string, year: number, seed: number, talents: string[] = []): { g: GameState; a: Asset } {
  const g = adult(seed, year, cid)
  g.character.talents = talents
  const a = company(g, ind)
  for (let i = 0; i < 3; i++) nextYear(g)
  return { g, a }
}

/** A company that holds `share` of its market, so the regulator has a case to open (as test/competition.test.ts does). */
function dominant(cid: string, year: number, share: number, talents: string[] = []): { g: GameState; a: Asset } {
  const g = adult(7, year, cid)
  g.character.talents = talents
  const a = company(g, 'software', { outlets: 30 })
  const b = bizOf(g, a)
  b.last = { year: year - 1, demand: 2_500_000, sold: 2_500_000, produced: 2_500_000, spoiled: 0, price: b.price, revenue: 5_000_000_000, salesTax: 0, netRevenue: 5_000_000_000, cogs: 750_000_000, wages: 1_000_000_000, keyStaff: 0, rent: 125_000_000, marketing: 250_000_000, interest: 0, upkeep: 50_000_000, other: 0, otherIncome: 0, ownerPay: 0, pbt: 2_825_000_000, corpTax: 625_000_000, net: 2_200_000_000, cashErosion: 0, cycle: 1, openFraction: 1, employees: 10_000 }
  const st = marketOfBiz(b)
  const ctx = marketCtxFor(g, b, g.year - 1)
  st.year = g.year - 1
  st.share = share
  st.base = share
  st.size = 1e9
  st.rivals = ctx.rivals.map((r): [string, number] => [r.id, ((1 - share) * r.pull) / ctx.F]).filter((x) => x[1] > 0)
  saveMarket(b, st)
  return { g, a }
}

const textOf = (n: MenuInfo, g: GameState): string => (typeof n.text === 'function' ? n.text(g) : n.text)

/** The info rows of a market screen whose id starts with `prefix`. */
function infos(g: GameState, a: Asset, prefix: string): MenuInfo[] {
  const m = marketNode(g, a)
  const all: MenuNode[] = m ? allNodes(g, [m]) : []
  return all.filter((n): n is MenuInfo => n.type === 'info' && n.id.startsWith(prefix))
}

const one = (g: GameState, a: Asset, prefix: string): MenuInfo => {
  const rows = infos(g, a, prefix)
  expect(rows.length, prefix).toBe(1)
  return rows[0]!
}

/** The scenario sentence as it was before this change, from the engine's own numbers. */
function oldScenarioLine(r: ScenarioRow): string {
  const parts: string[] = []
  if (r.shareDelta !== null) {
    const x = Math.abs(r.shareDelta * 100)
    parts.push(!(x >= 0.005) ? 'share unchanged' : `share ${r.shareDelta >= 0 ? 'up' : 'down'} ${x.toFixed(x < 0.1 ? 2 : 1)} pts`)
  }
  if (r.value !== null) parts.push(`about ${r.value >= 0 ? '+' : '-'}${money(Math.abs(r.value))} profit`)
  if (r.cost !== null) parts.push(`costs ${money(r.cost)}`)
  if (r.block) return `If you ${r.ask}: not possible right now. ${r.block}`
  return `If you ${r.ask}: ${parts.join(', ')} (${r.note}).`
}

const WORLD_LIFE = ['software', 'us', 2015, 5] as const
const LOCAL_LIFE = ['restaurant', 'jp', 2010, 7] as const

// ---------------------------------------------------------------------------------------------------------------------
describe('knownMarket: the one line that says which markets are the player\'s', () => {
  it('is true for every country of the industry the company is in, in either mode', () => {
    const { g, a } = world(...WORLD_LIFE)
    const b = readBiz(g, a)
    for (const mode of ['exact', 'realistic'] as const) {
      withInfoMode(mode, () => {
        for (const c of ['us', 'jp', 'fr', 'ng', 'br']) {
          expect(knownMarket(g, b, c), `${mode} ${c}`).toBe(true)
          expect(knownMarket(g, b, c, 'software'), `${mode} ${c} named`).toBe(true)
        }
      })
    }
  })

  it('is false for an industry the player has no company in, until the player has one; Exact mode knows them all', () => {
    const { g, a } = world(...WORLD_LIFE)
    const b = readBiz(g, a)
    inFog(() => {
      expect(knownMarket(g, b, 'us', 'restaurant')).toBe(false)
      expect(knownMarket(g, b, 'jp', 'semiconductor')).toBe(false)
    })
    withInfoMode('exact', () => expect(knownMarket(g, b, 'us', 'restaurant')).toBe(true))
    company(g, 'restaurant')
    inFog(() => expect(knownMarket(g, b, 'us', 'restaurant')).toBe(true))
  })

  it('unknownMarket hands a row builder its context for a market that is not known, and nothing for one that is', () => {
    const { g, a } = world(...WORLD_LIFE)
    const b = readBiz(g, a)
    inFog(() => {
      expect(unknownMarket(g, b, 'us')).toBeUndefined()
      expect(unknownMarket(g, b, 'us', 'restaurant')).toEqual({ g, b, industry: 'restaurant' })
    })
    withInfoMode('exact', () => expect(unknownMarket(g, b, 'us', 'restaurant')).toBeUndefined())
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('keys', () => {
  it('every mkt, scn and odds key is a valid knowledge key of 64 characters at most, and each is its own', () => {
    const seen = new Set<string>()
    const add = (k: string, kind: string): void => {
      expect(k.length, k).toBeLessThanOrEqual(64)
      const p = parseKey(k)
      expect(p, k).not.toBeNull()
      expect(p!.kind, k).toBe(kind)
      expect(seen.has(k), `${k} is used twice`).toBe(false)
      seen.add(k)
    }
    for (const ind of INDUSTRY_IDS) {
      for (const c of COUNTRIES) {
        add(marketSizeKey(ind, c.id), 'mkt')
        add(marketShareKey(ind, c.id), 'mkt')
        add(marketShareKey(ind, c.id, 'Some Very Long Local Champion Holding Company Of The Country'), 'mkt')
      }
    }
    for (const id of ['offense', 'raid', 'buy', 'enter', 'campaign', 'defend', 'supply', 'license']) add(scenarioKey('abc123', id), 'scn')
    add(antitrustKey('abc123'), 'odds')
    expect(seen.size).toBeGreaterThan(1000)
  })

  it('a champion is a different key from the leader and from another champion; a company is its own scope', () => {
    expect(marketShareKey('software', 'us', 'Acme')).not.toBe(marketShareKey('software', 'us'))
    expect(marketShareKey('software', 'us', 'Acme')).not.toBe(marketShareKey('software', 'us', 'Bolt'))
    expect(marketShareKey('software', 'us', 'Acme')).not.toBe(marketShareKey('software', 'jp', 'Acme'))
    const { g, a } = world(...WORLD_LIFE)
    const b = company(g, 'restaurant')
    expect(scenarioScope(a)).not.toBe(scenarioScope(b))
    expect(scenarioKey(scenarioScope(a), 'offense')).not.toBe(scenarioKey(scenarioScope(b), 'offense'))
  })

  it('no country id breaks the key syntax (a dot ends the country in a champion key)', () => {
    for (const c of COUNTRIES) expect(c.id, c.id).toMatch(/^[A-Za-z0-9_~-]{1,12}$/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('demandRead and shareBand: a market the player does not know', () => {
  const sizes = (): { demand: number; share: number }[] => {
    const { g, a } = world(...WORLD_LIFE)
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    const out: { demand: number; share: number }[] = []
    for (const c of ['us', 'jp', 'de', 'fr', 'gb', 'cn', 'in', 'br', 'au', 'kr']) {
      const d = countryDetail(g, b, v, c)
      if (d && d.row.demand > 0 && d.row.leader && d.row.leader.share > 0) out.push({ demand: d.row.demand, share: d.row.leader.share })
    }
    return out
  }

  it('Realistic: a range or a word with a chip, not the number; Exact: the number the row has always had', () => {
    const rows = sizes()
    expect(rows.length).toBeGreaterThan(4)
    const g = fogGame(1)
    const fog = { industry: 'restaurant' }
    inFog(() => {
      for (const { demand, share } of rows) {
        const d = demandRead(g, fog, 'jp', demand)
        expect(d.text, 'no exact number').not.toBe(money(demand))
        expect(d.conf).toBeGreaterThanOrEqual(0)
        expect(d.conf).toBeLessThanOrEqual(3)
        const s = shareBand(g, fog, 'jp', share, 'Acme')
        expect(s.text).not.toBe(shareText(share))
        expect(s.conf).toBeDefined()
      }
    })
    withInfoMode('exact', () => {
      for (const { demand, share } of rows) {
        expect(demandRead(g, fog, 'jp', demand)).toEqual({ text: money(demand) })
        expect(shareBand(g, fog, 'jp', share, 'Acme')).toEqual({ text: shareText(share) })
      }
    })
  })

  it('a truth that is not above zero stays the number it is, in Realistic too', () => {
    inFog(() => {
      expect(shareBand(fogGame(1), { industry: 'restaurant' }, 'jp', 0, 'Acme')).toEqual({ text: '0%' })
      expect(demandRead(fogGame(1), { industry: 'restaurant' }, 'jp', 0)).toEqual({ text: money(0) })
    })
  })

  it('honest: a stated band holds the truth about 80% of the time (size and share)', () => {
    const rows = sizes()
    const key = (i: number) => rows[i % rows.length]!
    inFog(() => {
      const size = coverage(600, (i) => ({ est: know(fogGame(i), marketSizeKey('restaurant', 'jp'), key(i).demand), truth: key(i).demand }))
      expect(size).toBeGreaterThanOrEqual(0.75)
      expect(size).toBeLessThanOrEqual(0.97)
      const share = coverage(600, (i) => ({ est: know(fogGame(i), marketShareKey('restaurant', 'jp', 'Acme'), key(i).share), truth: key(i).share }))
      expect(share).toBeGreaterThanOrEqual(0.75)
      expect(share).toBeLessThanOrEqual(0.97)
    })
  })

  it('stable and pure: the same read twice is the same text, another year another one, and a frozen state is read without a write', () => {
    const rows = sizes()
    const fog = { industry: 'restaurant' }
    inFog(() => {
      let moved = 0
      for (let i = 0; i < 40; i++) {
        const g = fogGame(i)
        const r = rows[i % rows.length]!
        const first = demandRead(g, fog, 'jp', r.demand)
        expect(demandRead(g, fog, 'jp', r.demand)).toEqual(first)
        expect(shareBand(g, fog, 'jp', r.share, 'Acme')).toEqual(shareBand(g, fog, 'jp', r.share, 'Acme'))
        if (demandRead(fogGame(i, { year: g.year + 1 }), fog, 'jp', r.demand).text !== first.text) moved++
      }
      expect(moved).toBeGreaterThan(15)
      const g = fogGame(3)
      const before = JSON.stringify(g)
      const rng = JSON.stringify(g.rng)
      const frozen = deepFreeze(structuredClone(g))
      for (const r of rows) {
        demandRead(frozen, fog, 'jp', r.demand)
        shareBand(frozen, fog, 'jp', r.share, 'Acme')
      }
      expect(JSON.stringify(g)).toBe(before)
      expect(JSON.stringify(g.rng)).toBe(rng)
    })
  })

  it('a Business talent narrows the band', () => {
    const rows = sizes()
    const width = (talents: string[]): number => {
      let sum = 0
      for (let i = 0; i < 60; i++) {
        const e = know(fogGame(i, { talents }), marketSizeKey('restaurant', 'jp'), rows[i % rows.length]!.demand)
        sum += Math.log(e.hi / e.lo)
      }
      return sum / 60
    }
    inFog(() => expect(width(['Business'])).toBeLessThan(width([])))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('country and national-market rows', () => {
  it('a world market of the player\'s own industry reads the same numbers in Realistic as in Exact mode', () => {
    const { g, a } = world(...WORLD_LIFE)
    const exact = withInfoMode('exact', () => infos(g, a, 'biz.mkt.c.').map((n) => [n.id, textOf(n, g)]))
    expect(exact.length).toBeGreaterThan(20)
    const fog = inFog(() => infos(g, a, 'biz.mkt.c.').map((n) => [n.id, textOf(n, g), n.conf]))
    expect(fog.map((r) => r.slice(0, 2))).toEqual(exact)
    for (const r of fog) expect(r[2], `${r[0]} has a chip`).toBeUndefined()
  })

  it('a national market of the player\'s own industry reads the same numbers in Realistic as in Exact mode', () => {
    const { g, a } = world(...LOCAL_LIFE)
    const exact = withInfoMode('exact', () => infos(g, a, 'biz.mkt.l.').map((n) => [n.id, textOf(n, g)]))
    expect(exact.length).toBeGreaterThan(12)
    const fog = inFog(() => infos(g, a, 'biz.mkt.l.').map((n) => [n.id, textOf(n, g), n.conf]))
    expect(fog.map((r) => r.slice(0, 2))).toEqual(exact)
    for (const r of fog) expect(r[2], `${r[0]} has a chip`).toBeUndefined()
  })

  it('the overview, leaderboard and segments rows stay numbers', () => {
    const { g, a } = world(...WORLD_LIFE)
    const pick = (): string[] => ['biz.mkt.ov.size', 'biz.mkt.ov.home', 'biz.mkt.ov.me', 'biz.mkt.ov.hhi', 'biz.mkt.ov.field', 'biz.mkt.lb.', 'biz.mkt.seg.'].flatMap((p) => infos(g, a, p).map((n) => textOf(n, g)))
    expect(inFog(pick)).toEqual(withInfoMode('exact', pick))
  })

  it('a country the player does not know reads a range with a chip, and the leader\'s and champions\' shares are ranges', () => {
    const { g, a } = world(...WORLD_LIFE)
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    let checked = 0
    inFog(() => {
      for (const c of ['us', 'jp', 'de', 'fr', 'gb', 'cn', 'in', 'br']) {
        const d = countryDetail(g, b, v, c)
        if (!d || !d.row.leader) continue
        const rows = countryRows(a, d, { g, b, industry: 'restaurant' })
        const size = rows.find((n) => n.id.endsWith('.size')) as MenuInfo
        const lead = rows.find((n) => n.id.endsWith('.lead')) as MenuInfo
        const st = textOf(size, g)
        expect(st, c).toMatch(/^Local demand: .+ a year \u{00B7} appetite (hungry|typical|small)$/u)
        expect(st, `${c} shows the number`).not.toContain(money(d.row.demand))
        expect(st, `${c} shows the slice of the world`).not.toContain('of the world')
        expect(size.conf, c).toBeDefined()
        const lt = textOf(lead, g)
        expect(lt, c).toContain(`Leader there: ${d.row.leader.name} (`)
        expect(lt, `${c} shows the share`).not.toContain(`with ${shareText(d.row.leader.share)}`)
        expect(lead.conf, c).toBeDefined()
        if (d.champions.length) {
          const champs = rows.find((n) => n.id.endsWith('.champs')) as MenuInfo
          expect(champs.conf, c).toBeDefined()
          for (const ch of d.champions) if (ch.share > 0) expect(textOf(champs, g), c).not.toContain(`${ch.name} ${shareText(ch.share)} `)
        }
        // The player's own share, the tariffs, the currency and the rules are not hidden numbers.
        for (const id of ['.me', '.trade', '.fx', '.reg']) expect((rows.find((n) => n.id.endsWith(id)) as MenuInfo).conf, `${c} ${id}`).toBeUndefined()
        checked++
      }
    })
    expect(checked).toBeGreaterThan(4)
  })

  it('the same fogged rows built twice are equal, and in Exact mode they are the rows a known market has', () => {
    const { g, a } = world(...WORLD_LIFE)
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    const d = countryDetail(g, b, v, 'jp')!
    const fog = { g, b, industry: 'restaurant' }
    const text = (rows: MenuNode[]): string[] => rows.map((n) => textOf(n as MenuInfo, g))
    const plain = text(countryRows(a, d))
    inFog(() => expect(text(countryRows(a, d, fog))).toEqual(text(countryRows(a, d, fog))))
    withInfoMode('exact', () => expect(text(countryRows(a, d, fog))).toEqual(plain))
  })

  it('a national market the player does not know reads a range with a chip, and the local top is a list of ranges', () => {
    const { g, a } = world(...LOCAL_LIFE)
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    let checked = 0
    inFog(() => {
      for (const c of ['us', 'kr', 'de', 'fr', 'gb', 'br']) {
        const f = localField(g, b, v, c)
        if (!f.top.length) continue
        const rows = localRows(a, f, v, { g, b, industry: 'software' })
        const size = rows.find((n) => n.id.endsWith('.size')) as MenuInfo
        const st = textOf(size, g)
        expect(st, c).toMatch(/^Local market: .+ a year \u{00B7} appetite /u)
        expect(st, c).not.toContain(money(f.demand))
        expect(size.conf, c).toBeDefined()
        f.top.forEach((t, i) => {
          const row = rows.find((n) => n.id.endsWith(`.t${i}`)) as MenuInfo
          expect(row.conf, `${c} t${i}`).toBeDefined()
          expect(textOf(row, g), `${c} t${i}`).not.toContain(shareText(t.share))
          expect(textOf(row, g)).toContain(t.name)
        })
        expect(rows.find((n) => n.id.endsWith('.reg'))).toBeDefined()
        checked++
      }
    })
    expect(checked).toBeGreaterThan(3)
  })

  it('the national rows in Exact mode with a fog context are the rows without one', () => {
    const { g, a } = world(...LOCAL_LIFE)
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    const f = localField(g, b, v, 'us')
    const text = (rows: MenuNode[]): string[] => rows.map((n) => textOf(n as MenuInfo, g))
    withInfoMode('exact', () => expect(text(localRows(a, f, v, { g, b, industry: 'software' }))).toEqual(text(localRows(a, f, v))))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('the antitrust row', () => {
  const row = (g: GameState, a: Asset): MenuInfo => one(g, a, 'biz.mkt.ov.anti')

  it('Exact mode: today\'s text, with the label and the percent, and no chip', () => {
    const { g, a } = dominant('fr', 2020, 0.8)
    const at = marketViewOf(g, readBiz(g, a)).antitrust
    expect(at.p).toBeGreaterThan(0)
    const r = row(g, a)
    expect(textOf(r, g).startsWith(`Antitrust risk: ${at.label} (about ${(at.p * 100).toFixed(0)}% a year) \u{00B7} ${at.regime.name}`)).toBe(true)
    expect(r.conf).toBeUndefined()
    expect('conf' in r).toBe(false)
  })

  it('Realistic without the talent: a word and a chip, no percent', () => {
    const { g, a } = dominant('fr', 2020, 0.8)
    const at = marketViewOf(g, readBiz(g, a)).antitrust
    inFog(() => {
      const r = row(g, a)
      const t = textOf(r, g)
      expect(t).toMatch(/^Antitrust risk: [a-z ]+ \u{00B7} /u)
      expect(t).not.toMatch(/\d+%/)
      expect(t).not.toContain(`${at.label} (`)
      expect(t).toContain(at.regime.name)
      expect(r.conf).toBeDefined()
      expect(r.conf).toBeLessThanOrEqual(1)
    })
  })

  it('Realistic with the Business talent: about N% a year, chip 2', () => {
    const { g, a } = dominant('fr', 2020, 0.8, ['Business'])
    inFog(() => {
      const r = row(g, a)
      expect(textOf(r, g)).toMatch(/^Antitrust risk: about \d+% a year \u{00B7} /u)
      expect(r.conf).toBe(2)
    })
  })

  it('a market where no case can open is a published rule: the same text in both modes, no chip', () => {
    const { g, a } = dominant('fr', 2020, 0.1)
    const exact = withInfoMode('exact', () => row(g, a))
    const fog = inFog(() => row(g, a))
    expect(textOf(exact, g)).toMatch(/^Antitrust: no risk at your size/)
    expect(textOf(fog, g)).toBe(textOf(exact, g))
    expect(fog.conf).toBeUndefined()
  })

  it('honest: a stated band holds the true chance about 80% of the time', () => {
    const scope = 'abc123'
    const p = (i: number): number => 0.01 + 0.39 * unitAt('antitrust', i)
    inFog(() => {
      const hit = coverage(600, (i) => ({ est: antitrustEstimate(fogGame(i), scope, p(i)), truth: p(i) }))
      expect(hit).toBeGreaterThanOrEqual(0.75)
      expect(hit).toBeLessThanOrEqual(0.97)
    })
  })

  it('stable and pure: the same read twice is the same text, in Exact mode there is no read at all', () => {
    inFog(() => {
      const g = fogGame(4)
      expect(antitrustRead(g, 'abc123', 0.08)).toEqual(antitrustRead(g, 'abc123', 0.08))
      const before = JSON.stringify(g)
      antitrustRead(deepFreeze(structuredClone(g)), 'abc123', 0.08)
      expect(JSON.stringify(g)).toBe(before)
    })
    withInfoMode('exact', () => expect(antitrustRead(fogGame(4), 'abc123', 0.08)).toBeNull())
  })

  it('antitrustTruth finds the true chance through the companies the player owns, and nothing else', () => {
    const { g, a } = dominant('fr', 2020, 0.8)
    const p = marketViewOf(g, readBiz(g, a)).antitrust.p
    expect(antitrustTruth(g, antitrustKey(scenarioScope(a)))).toBe(p)
    expect(antitrustTruth(g, antitrustKey('zzzzzz'))).toBeNull()
    expect(antitrustTruth(g, `odds:${scenarioScope(a)}:bank:p`)).toBeNull()
    expect(antitrustTruth(g, 'riv:abc:quality')).toBeNull()
    expect(antitrustTruth(g, 'odds:a:b:c:d')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('what-if scenarios', () => {
  const LIVES = [WORLD_LIFE, LOCAL_LIFE, ['semiconductor', 'us', 1990, 11], ['restaurant', 'us', 2015, 3]] as const

  it('Exact mode: every line is today\'s sentence, with or without the state, and no row carries a chip', () => {
    for (const [ind, cid, year, seed] of LIVES) {
      const { g, a } = world(ind, cid, year, seed)
      const rows = scenarioRows(g, a)
      expect(rows.length, ind).toBeGreaterThan(2)
      for (const r of rows) {
        expect(scenarioLine(r), `${ind} ${r.id}`).toBe(oldScenarioLine(r))
        expect(scenarioLine(r, g, a), `${ind} ${r.id} with state`).toBe(oldScenarioLine(r))
        expect(scenarioRead(r, g, a).conf).toBeUndefined()
      }
      const menu = infos(g, a, 'biz.mkt.sc.')
      expect(menu.map((n) => textOf(n, g))).toEqual(rows.map(oldScenarioLine))
      for (const n of menu) expect('conf' in n).toBe(false)
    }
  })

  it('Realistic: the profit is a range, a guess or a word with a chip; the share and the cost keep their numbers', () => {
    for (const [ind, cid, year, seed] of LIVES) {
      const { g, a } = world(ind, cid, year, seed)
      inFog(() => {
        const rows = scenarioRows(g, a)
        const menu = infos(g, a, 'biz.mkt.sc.')
        expect(menu.length).toBe(rows.length)
        let fogged = 0
        rows.forEach((r, i) => {
          const t = textOf(menu[i]!, g)
          const old = oldScenarioLine(r)
          if (r.block || r.value === null) {
            expect(t, `${ind} ${r.id}`).toBe(old)
            return
          }
          fogged++
          const exactProfit = `about ${r.value >= 0 ? '+' : '-'}${money(Math.abs(r.value))} profit`
          expect(t, `${ind} ${r.id} shows the profit`).not.toContain(exactProfit)
          expect(t, `${ind} ${r.id}`).toMatch(/profit/)
          expect(menu[i]!.conf, `${ind} ${r.id}`).toBeGreaterThanOrEqual(0)
          // Everything else in the sentence is the sentence it was: the move, the share change, the cost and the note.
          const body = (x: string): string => x.slice(`If you ${r.ask}: `.length, x.length - ` (${r.note}).`.length)
          expect(t.startsWith(`If you ${r.ask}: `) && t.endsWith(` (${r.note}).`), `${ind} ${r.id}`).toBe(true)
          if (r.shareDelta !== null) expect(body(t).startsWith(`${body(old).split(', ')[0]}, `), `${ind} ${r.id} share`).toBe(true)
          if (r.cost !== null) expect(body(t).endsWith(`, costs ${money(r.cost)}`), `${ind} ${r.id} cost`).toBe(true)
        })
        expect(fogged, ind).toBeGreaterThan(1)
      })
    }
  })

  it('Realistic: a typical forecast is a range with a plus or minus sign, and the section has fewer than 16 rows', () => {
    const { g, a } = world(...WORLD_LIFE)
    inFog(() => {
      const menu = infos(g, a, 'biz.mkt.sc.')
      expect(menu.length).toBeLessThan(16)
      expect(menu.map((n) => textOf(n, g)).join('\n')).toMatch(/roughly [+-]\$[\d.]+[KM]? to [+-]?\$[\d.]+[KM]? profit/)
    })
  })

  it('honest: a stated band holds the true profit about 80% of the time, over 100 lives and then 600', () => {
    const truths: { b: ReturnType<typeof readBiz>; scope: string; id: string; value: number }[] = []
    for (const [ind, cid, year, seed] of LIVES) {
      const { g, a } = world(ind, cid, year, seed)
      const b = readBiz(g, a)
      for (const r of scenarioRows(g, a)) if (r.value !== null && !r.block) truths.push({ b, scope: scenarioScope(a), id: r.id, value: r.value })
    }
    expect(truths.length).toBeGreaterThan(12)
    inFog(() => {
      for (const n of [100, 600]) {
        const hit = coverage(n, (i) => {
          const t = truths[i % truths.length]!
          return { est: forecastRead(fogGame(i), t.b, t.scope, t.id, t.value), truth: t.value }
        })
        expect(hit, `${n} draws`).toBeGreaterThanOrEqual(0.75)
        expect(hit, `${n} draws: too wide to say anything`).toBeLessThanOrEqual(0.97)
      }
    })
  })

  it('a band is wide enough to be honest and no wider than 30% of the larger of the move and a tenth of last year\'s sales', () => {
    const { g, a } = world(...WORLD_LIFE)
    const b = readBiz(g, a)
    const revenue = b.last?.revenue ?? 0
    expect(revenue).toBeGreaterThan(0)
    inFog(() => {
      for (const r of scenarioRows(g, a)) {
        if (r.value === null || r.block) continue
        const e = forecastRead(g, b, scenarioScope(a), r.id, r.value)
        const scale = Math.max(Math.abs(r.value), revenue * FORECAST_FLOOR)
        expect(e.hi - e.lo, r.id).toBeGreaterThan(0)
        expect(e.hi - e.lo, r.id).toBeLessThanOrEqual(2 * 1.298 * 0.3 * scale * 1.0001)
      }
    })
  })

  it('stable and pure: the same line twice, a frozen state, and nothing written or rolled', () => {
    const { g, a } = world(...WORLD_LIFE)
    inFog(() => {
      const rows = scenarioRows(g, a)
      for (const r of rows) expect(scenarioLine(r, g, a)).toBe(scenarioLine(r, g, a))
      const before = JSON.stringify(g)
      const rng = JSON.stringify(g.rng)
      const frozen = deepFreeze(structuredClone(g))
      for (const r of rows) scenarioLine(r, frozen, a)
      expect(JSON.stringify(g)).toBe(before)
      expect(JSON.stringify(g.rng)).toBe(rng)
      // Another year is another reading (the same rows, a year on).
      const later = { ...g, year: g.year + 1 }
      expect(rows.some((r) => r.value !== null && scenarioLine(r, later, a) !== scenarioLine(r, g, a))).toBe(true)
    })
  })

  it('profitRead has three shapes by confidence, and Exact mode is the sentence it was', () => {
    const b = { last: { revenue: 40_000_000 } } as Parameters<typeof profitRead>[1]
    inFog(() => {
      const seen = new Set<string>()
      for (let i = 0; i < 300 && seen.size < 2; i++) {
        const talents = i % 2 ? ['Business'] : []
        const p = profitRead(fogGame(i, { talents }), b, 'abc123', 'offense', 12_000_000 * (i % 3 === 0 ? -1 : 1))
        expect(p.text).toMatch(/profit/)
        seen.add(p.text.startsWith('about') ? 'about' : p.text.startsWith('roughly') ? 'roughly' : p.text.startsWith('profit:') ? 'word' : 'other')
      }
      expect(seen.has('roughly')).toBe(true)
    })
    withInfoMode('exact', () => {
      expect(profitRead(fogGame(0), b, 'abc123', 'offense', 12_000_000)).toEqual({ text: `about +${money(12_000_000)} profit` })
      expect(profitRead(fogGame(0), b, 'abc123', 'offense', -3_500_000)).toEqual({ text: `about -${money(3_500_000)} profit` })
    })
  })

  it('scenarioTruth finds the value behind a key through the companies the player owns, and nothing else', () => {
    const { g, a } = world(...WORLD_LIFE)
    for (const r of scenarioRows(g, a)) expect(scenarioTruth(g, scenarioKey(scenarioScope(a), r.id))).toBe(r.value)
    expect(scenarioTruth(g, scenarioKey('zzzzzz', 'offense'))).toBeNull()
    expect(scenarioTruth(g, scenarioKey(scenarioScope(a), 'nosuchmove'))).toBeNull()
    expect(scenarioTruth(g, 'riv:abc:quality')).toBeNull()
    expect(scenarioTruth(g, 'scn:a:b:c:d')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('marketTruth', () => {
  it('finds the size, the leader and a champion of a world market, and the size and top of a national one', () => {
    const w = world(...WORLD_LIFE)
    const bw = readBiz(w.g, w.a)
    const vw = marketViewOf(w.g, bw)
    let found = 0
    for (const c of ['us', 'jp', 'de', 'fr', 'gb']) {
      const d = countryDetail(w.g, bw, vw, c)
      if (!d) continue
      expect(marketTruth(w.g, marketSizeKey('software', c))).toBe(d.row.demand)
      expect(marketTruth(w.g, marketShareKey('software', c))).toBe(d.row.leader?.share ?? null)
      for (const ch of d.champions) {
        expect(marketTruth(w.g, marketShareKey('software', c, ch.name))).toBe(ch.share)
        found++
      }
    }
    expect(found).toBeGreaterThan(0)
    const l = world(...LOCAL_LIFE)
    const bl = readBiz(l.g, l.a)
    const f = localField(l.g, bl, marketViewOf(l.g, bl), 'us')
    expect(marketTruth(l.g, marketSizeKey('restaurant', 'us'))).toBe(f.demand)
    expect(marketTruth(l.g, marketShareKey('restaurant', 'us'))).toBe(f.top[0]?.share ?? null)
    for (const t of f.top) expect(marketTruth(l.g, marketShareKey('restaurant', 'us', t.name))).toBe(t.share)
  })

  it('knows nothing of an industry the player is not in, or of a key that is not ours', () => {
    const { g } = world(...WORLD_LIFE)
    expect(marketTruth(g, marketSizeKey('restaurant', 'us'))).toBeNull()
    expect(marketTruth(g, marketSizeKey('software', 'zz'))).toBeNull()
    expect(marketTruth(g, 'mkt:software:us:cash')).toBeNull()
    expect(marketTruth(g, 'mkt:software:us.abc:size')).toBeNull()
    expect(marketTruth(g, 'mkt:software:us:share:x')).toBeNull()
    expect(marketTruth(g, 'riv:software:us:size')).toBeNull()
    expect(marketTruth(g, 'mkt:software:us.nosuchname:share')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('the whole market screen in Realistic mode', () => {
  it('built twice is equal, touches neither the state nor the dice, and a frozen state reads without a write', () => {
    for (const make of [() => dominant('fr', 2020, 0.8), () => world(...WORLD_LIFE), () => world(...LOCAL_LIFE)]) {
      const { g, a } = make()
      inFog(() => {
        const before = JSON.stringify(g)
        const rng = JSON.stringify(g.rng)
        const first = renderAll(g, a)
        expect(renderAll(g, a)).toEqual(first)
        expect(JSON.stringify(g)).toBe(before)
        expect(JSON.stringify(g.rng)).toBe(rng)
        expect(first.join('\n')).not.toMatch(/NaN|undefined|Infinity|\[object/)
        expect(renderAll(deepFreeze(structuredClone(g)), a)).toEqual(first)
      })
    }
  })

  it('no row of this task has a dash that is not a minus sign or a hyphen', () => {
    const { g, a } = dominant('fr', 2020, 0.8)
    inFog(() => {
      const text = [...infos(g, a, 'biz.mkt.ov.'), ...infos(g, a, 'biz.mkt.sc.')].map((n) => textOf(n, g)).join('\n')
      expect(text).not.toMatch(/[\u{2013}\u{2014}]/u)
    })
  })
})
