// R3-G5 (H.4): scorecards, published versus estimated.
//
// A scorecard sets your figure against everyone else's. Where the rivals' figures are theirs to keep (a chip company's rivals, a
// device company's rivals) Realistic mode prints a range for the market, the best and your rank, says "(estimated)", and the
// confidence chip rides on the row. A published board (the AI benchmarks) stays exact and says "published". Exact mode prints
// today's text, byte for byte.
//
//   honest  the market band holds the true mean of the field and the best band the true best about 80% of the time; the rank
//           bracket holds the true rank at least as often (it is built to be safe, not tight)
//   stable  the same board in the same year reads the same; another year or another rival reads another number
//   pure    nothing is written and g.rng does not move
//   exact   Exact mode: scoreFog is null and every line equals the line scoreText wrote before this task
//
// The suite runs in Exact; every Realistic case goes through inFog (test/knowledge-kit.ts).
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { labStanding } from '../src/game/business/ai-bench-market'
import { techView } from '../src/game/business/deeptech-core'
import { benchRows } from '../src/game/business/deeptech-bench'
import { devicesMenu } from '../src/game/business/devices-menu'
import { specLines, specSheet } from '../src/game/business/devices-specs'
import { localEcon, marketCtxFor } from '../src/game/business/economy'
import { buildFabAction } from '../src/game/business/manage'
import { fieldFor } from '../src/game/business/product-market'
import { cmpKey, rankText, readRow, scoreFog, scoreRow, scoreText, type ScoreFog, type ScoreRow } from '../src/game/business/scorecard'
import { siliconBoard, siliconRows } from '../src/game/business/silicon-text'
import { bizOf, type BizState, type Product } from '../src/game/business/state'
import { withFlags } from '../src/game/flags'
import type { GameState, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { lab, offBest, rated } from './ai-bench-kit'
import { fogGame, inFog, unitAt } from './knowledge-kit'
import { adult, company } from './market-kit'
import { chipLab } from './silicon-kit'

const AI_CHIP = ['firstChip', 'volume', 'aiChip']
const DASH = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)
const BAD = /NaN|undefined|\[object|Infinity/
const FIELD = [78, 75, 70, 66, 64, 60, 55, 44]
const keyOf = (i: number): string => cmpKey('t.perf', `r${i}`)
/** A line of the estimated form: a range (or one rounded number) for the market and the best, a rank, and the basis. */
const ESTIMATED = /^[A-Za-z ]+ \d+\. Market about \d+( to \d+)?, best about \d+( to \d+)?, rank \d+( to \d+)? of \d+ \(estimated\)\.$/
const EXACT_LINE = /^[A-Za-z ]+ \d+\. Market \d+, best \d+, rank \d+ of \d+\.$/

/** The share of `n` lives whose [lo, hi] holds the truth. */
function holds(n: number, make: (i: number) => { band: readonly [number, number]; truth: number }): number {
  let hit = 0
  for (let i = 0; i < n; i++) {
    const { band, truth } = make(i)
    if (band[0] <= truth && truth <= band[1]) hit++
  }
  return hit / n
}

const infoText = (g: GameState, n: MenuNode): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')
const isInfo = (n: MenuNode): n is MenuInfo => n.type === 'info'

describe('scoreFog on a fixed board', () => {
  it('is null in Exact mode and for a market with no figures, and scoreText ignores a null fog', () => {
    const g = fogGame(1)
    const row = scoreRow('perf', 'Performance', '', 71, FIELD)
    expect(scoreFog(g, row, FIELD, keyOf)).toBeNull()
    const alone = scoreRow('perf', 'Performance', '', 71, [])
    inFog(() => {
      expect(scoreFog(g, alone, [], keyOf)).toBeNull()
      expect(scoreFog(g, scoreRow('p', 'P', '', 71, [NaN, Infinity]), [NaN, Infinity], keyOf)).toBeNull()
    })
    expect(scoreText(row, undefined, null)).toBe('Performance 71. Market 64, best 78, rank 3 of 9.')
    expect(scoreText(row)).toBe('Performance 71. Market 64, best 78, rank 3 of 9.')
    // An empty market keeps its sentence even when a fog is handed in.
    inFog(() => {
      const fog = scoreFog(g, row, FIELD, keyOf)!
      expect(scoreText(alone, undefined, fog)).toBe('Performance 71. The market has no figures.')
    })
  })

  it('prints ranges and says estimated, with ordered bands inside the scale', () => {
    const g = fogGame(1)
    inFog(() => {
      const row = scoreRow('perf', 'Performance', '', 71, FIELD)
      const fog = scoreFog(g, row, FIELD, keyOf)!
      expect(fog.basis).toBe('estimated')
      for (const [lo, hi] of [fog.market, fog.best]) {
        expect(lo).toBeGreaterThanOrEqual(0)
        expect(hi).toBeLessThanOrEqual(100)
        expect(lo).toBeLessThanOrEqual(hi)
      }
      expect(fog.best[0]).toBeGreaterThanOrEqual(row.mine)
      expect(fog.best[0]).toBeGreaterThanOrEqual(fog.market[0])
      expect(fog.rank[0]).toBeGreaterThanOrEqual(1)
      expect(fog.rank[0]).toBeLessThanOrEqual(fog.rank[1])
      expect(fog.rank[1]).toBeLessThanOrEqual(row.of)
      expect([0, 1, 2, 3]).toContain(fog.conf)
      const text = scoreText(row, undefined, fog)
      expect(text).toMatch(ESTIMATED)
      expect(text).not.toBe(scoreText(row))
      expect(text).not.toMatch(DASH)
      expect(text).not.toMatch(BAD)
      // Your own figure is yours: it prints exact.
      expect(text.startsWith('Performance 71. ')).toBe(true)
      expect(rankText(row, fog)).toMatch(/^rank \d+( to \d+)? of 9$/)
      expect(rankText(row)).toBe('rank 3 of 9')
      // A custom formatter applies to both ends of a range.
      expect(scoreText(row, (n) => `$${Math.round(n)}`, fog)).toMatch(/^Performance \$71\. Market about \$\d+( to \$\d+)?, best about \$\d+/)
    })
  })

  it('is stable in a year, moves with the year and with the rival, and is pure', () => {
    const g = fogGame(2)
    const row = scoreRow('perf', 'Performance', '', 71, FIELD)
    const before = JSON.stringify(g)
    const rng = g.rng
    inFog(() => {
      const one = scoreFog(g, row, FIELD, keyOf)
      expect(one).not.toBeNull()
      expect(scoreFog(g, row, FIELD, keyOf)).toEqual(one)
      expect(scoreFog(fogGame(2), row, FIELD, keyOf)).toEqual(one)
      expect(scoreFog(fogGame(2, { year: g.year + 1 }), row, FIELD, keyOf)).not.toEqual(one)
      expect(scoreFog(g, row, FIELD, (i) => cmpKey('t.perf', `other${i}`))).not.toEqual(one)
      expect(scoreFog(fogGame(3), row, FIELD, keyOf)).not.toEqual(one)
      // The input field is never written.
      expect(() => scoreFog(g, row, Object.freeze([...FIELD]), keyOf)).not.toThrow()
    })
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('reads the market band from the mean of the rivals, so a bigger field gives a tighter band', () => {
    const g = fogGame(4)
    inFog(() => {
      const width = (n: number): number => {
        const field = Array.from({ length: n }, (_, i) => 40 + (i % 5) * 6)
        const fog = scoreFog(g, scoreRow('p', 'P', '', 50, field), field, (i) => cmpKey('t.size', `r${i}`))!
        return fog.market[1] - fog.market[0]
      }
      expect(width(24)).toBeLessThan(width(3))
    })
  })

  it('narrows with the Business talent, as every cmp: read does', () => {
    inFog(() => {
      const row = scoreRow('perf', 'Performance', '', 71, FIELD)
      const plain = scoreFog(fogGame(5), row, FIELD, keyOf)!
      const gifted = scoreFog(fogGame(5, { talents: ['Business'] }), row, FIELD, keyOf)!
      expect(gifted.market[1] - gifted.market[0]).toBeLessThan(plain.market[1] - plain.market[0])
      expect(gifted.conf).toBeGreaterThanOrEqual(plain.conf)
    })
  })

  it('keeps every key a valid, short key whatever the ids look like', () => {
    const odd = ['row', 'x'.repeat(80), 'Real Brand: Acme/Corp (1990)', 'f0', 'a:b:c', 'éè']
    for (const id of odd) {
      const key = cmpKey(id, id)
      expect(key.length).toBeLessThanOrEqual(64)
      expect(key).toMatch(/^cmp:[A-Za-z0-9._~-]{1,24}:[A-Za-z0-9._~-]{1,24}:score$/)
    }
    expect(cmpKey('perf', 'f0')).toBe('cmp:perf:f0:score')
    expect(cmpKey('perf', 'x'.repeat(80))).not.toBe(cmpKey('perf', 'x'.repeat(81)))
    expect(cmpKey('', '')).toMatch(/^cmp:[A-Za-z0-9._~-]{1,24}:[A-Za-z0-9._~-]{1,24}:score$/)
    // A rival whose natural id is awkward still gets a fogged read.
    inFog(() => {
      const field = [60, 70]
      const fog = scoreFog(fogGame(6), scoreRow('p', 'P', '', 50, field), field, (i) => cmpKey('row', odd[i + 1]!))
      expect(fog).not.toBeNull()
    })
  })
})

describe('honest: the bands hold the truth', () => {
  const LIVES = 300
  /** Life i: a board of 5 to 9 rivals with figures between 35 and 75, and you somewhere in the middle. */
  const board = (i: number, talents: readonly string[], n: number, low: number, span: number): { fog: ScoreFog; row: ScoreRow } => {
    const field = Array.from({ length: n }, (_, j) => low + span * unitAt('field', i * 64 + j))
    const row = scoreRow('perf', 'Performance', '', low + span * unitAt('mine', i), field)
    return { fog: scoreFog(fogGame(i, { talents }), row, field, keyOf)!, row }
  }
  const read = (i: number, talents: readonly string[] = []): { fog: ScoreFog; row: ScoreRow } => board(i, talents, 5 + (i % 5), 35, 40)

  it('market band: the true mean of the field, about 80% of the time', () => {
    const share = inFog(() =>
      holds(LIVES, (i) => {
        const { fog, row } = read(i)
        return { band: fog.market, truth: row.market }
      }),
    )
    expect(share).toBeGreaterThan(0.75)
    expect(share).toBeLessThan(0.95)
  })

  it('best band: the true best on the board', () => {
    const share = inFog(() =>
      holds(LIVES, (i) => {
        const { fog, row } = read(i)
        return { band: fog.best, truth: row.best }
      }),
    )
    expect(share).toBeGreaterThan(0.75)
  })

  it('rank bracket: the true rank, at least as often (it is built safe)', () => {
    const share = inFog(() =>
      holds(LIVES, (i) => {
        const { fog, row } = read(i)
        return { band: fog.rank, truth: row.rank }
      }),
    )
    expect(share).toBeGreaterThan(0.8)
  })

  it('still holds with the Business talent', () => {
    const share = inFog(() =>
      holds(LIVES, (i) => {
        const { fog, row } = read(i, ['Business'])
        return { band: fog.market, truth: row.market }
      }),
    )
    expect(share).toBeGreaterThan(0.75)
  })

  it('holds on a big board at the top or the bottom of the scale, where a clipped reading would lean toward the middle', () => {
    for (const [low, span] of [[70, 30], [0, 30]] as const) {
      const share = inFog(() =>
        holds(LIVES, (i) => {
          const { fog, row } = board(i, [], 30, low, span)
          return { band: fog.market, truth: row.market }
        }),
      )
      expect(share, `figures from ${low} to ${low + span}`).toBeGreaterThan(0.75)
    }
  })

  it('readRow gives the row as the player reads it: your figure exact, the rest at the middle of its band', () => {
    inFog(() => {
      const { fog, row } = read(7)
      const seen = readRow(row, fog)
      expect(seen.mine).toBe(row.mine)
      expect(seen.of).toBe(row.of)
      expect(seen.trend).toBe(row.trend)
      expect(seen.market).toBeCloseTo((fog.market[0] + fog.market[1]) / 2, 9)
      expect(seen.best).toBeCloseTo((fog.best[0] + fog.best[1]) / 2, 9)
      expect(seen.rank).toBeGreaterThanOrEqual(fog.rank[0])
      expect(seen.rank).toBeLessThanOrEqual(fog.rank[1])
      expect(seen.market).not.toBe(row.market)
    })
    // Without a fog the row comes back as it was.
    const { row } = read(7)
    expect(readRow(row)).toEqual(row)
    expect(readRow(row, null)).toEqual(row)
  })
})

describe('Silicon 2.0: the chip scorecard', () => {
  const boardOf = (g: GameState, b: BizState, fog: boolean) => {
    const t = techView(b)
    return fog ? inFog(() => siliconBoard(g, b, t)) : siliconBoard(g, b, t)
  }
  const rowsOf = (g: GameState, b: BizState, fog: boolean) => boardOf(g, b, fog).rows

  it('prints ranges for performance and quality in Realistic, and today’s lines in Exact', () => {
    const L = chipLab({ year: 2025, patch: { done: AI_CHIP } })
    const b = bizOf(L.g, L.a)
    const exact = rowsOf(L.g, b, false)
    expect(exact.perf).toMatch(EXACT_LINE)
    expect(exact.quality).toMatch(EXACT_LINE)
    expect(boardOf(L.g, b, false).conf).toEqual({})
    expect(siliconRows(L.g, b, techView(b))).toEqual(exact)
    const fog = rowsOf(L.g, b, true)
    expect(fog.perf).toMatch(ESTIMATED)
    expect(fog.quality).toMatch(ESTIMATED)
    expect(fog.perf.startsWith(exact.perf.split('.')[0]!)).toBe(true)
    expect(fog.quality.startsWith(exact.quality.split('.')[0]!)).toBe(true)
    // Your own prices and a published share stay exact: the same lines in both modes.
    expect(fog.price).toBe(exact.price)
    expect(fog.share).toBe(exact.share)
    expect(fog.goodwill).toBe(exact.goodwill)
    expect(fog.price).not.toMatch(/estimated|about/)
    // The chip rides along.
    const conf = boardOf(L.g, b, true).conf
    expect([0, 1, 2, 3]).toContain(conf.perf)
    expect([0, 1, 2, 3]).toContain(conf.quality)
    for (const x of [fog.goodwill, fog.perf, fog.quality, fog.price, fog.share]) expect(x).not.toMatch(DASH)
  })

  it('is stable in a year and pure', () => {
    const L = chipLab({ year: 2025, patch: { done: AI_CHIP } })
    const b = bizOf(L.g, L.a)
    const before = JSON.stringify(L.g)
    const rng = L.g.rng
    const one = rowsOf(L.g, b, true)
    expect(rowsOf(L.g, b, true)).toEqual(one)
    expect(JSON.stringify(L.g)).toBe(before)
    expect(L.g.rng).toBe(rng)
  })

  it('says the market has no figures with no rivals, in both modes', () => {
    const L = chipLab({ year: 1900 })
    const b = bizOf(L.g, L.a)
    for (const fog of [false, true]) {
      const rows = rowsOf(L.g, b, fog)
      for (const key of ['perf', 'quality'] as const) expect(rows[key], `${fog} ${key}`).toMatch(/The market has no figures\.$/)
      expect(boardOf(L.g, b, fog).conf, `${fog}`).toEqual({})
    }
  })

  it('reaches the screen: the Chips & Fabs info rows carry the ranges and the chip', () => {
    const L = chipLab({ year: 2025, patch: { done: AI_CHIP } })
    const walk = (nodes: MenuNode[]): MenuNode[] => nodes.flatMap((n) => (n.type === 'menu' ? [n, ...walk(n.children(L.g))] : [n]))
    const scoreRows = (): MenuInfo[] => walk(businessAssetView(L.g, L.a)).filter(isInfo).filter((n) => /^dt\.i\.(perf|quality)\./.test(n.id))
    const exact = scoreRows()
    expect(exact).toHaveLength(2)
    expect(exact.every((n) => n.conf === undefined)).toBe(true)
    for (const n of exact) expect(infoText(L.g, n)).toMatch(EXACT_LINE)
    const fogged = inFog(() => scoreRows().map((n) => ({ text: infoText(L.g, n), conf: n.conf })))
    expect(fogged).toHaveLength(2)
    for (const f of fogged) {
      expect(f.text).toMatch(ESTIMATED)
      expect([0, 1, 2, 3]).toContain(f.conf)
    }
  })
})

describe('Ecosystem companies: the device scorecard', () => {
  const rival = (id: string, quality: number, tech: number, pull = 1, legacy = false) => ({
    id, name: `Rival ${id}`, hq: 'us', founded: 1990, quality, tech, legacy, real: false, tier: 'mid' as const, seg: 'mass' as const, pull, prev: 0,
  })
  const ctxWith = (g: GameState, b: BizState, rivals: ReturnType<typeof rival>[], versions: number[]) => {
    const c = marketCtxFor(g, b, g.year)
    return { ...c, rivals, field: { ...fieldFor(c), versions: () => versions } }
  }
  const devices = (seed = 5, year = 2026) => {
    const g = adult(seed, year, 'us')
    const a = company(g, 'devices', { cash: 5e9 })
    const b = bizOf(g, a)
    b.price = localEcon(b.industry, b.countryId, b.city).goingPrice
    return { g, a, b }
  }
  const core = (family: string, launched: number, quality = 60): Product => ({ name: family, launched, boost: 0, quality, family, kind: 'core' })
  const RIVALS = [rival('A', 60, 67), rival('B', 60, 40), rival('C', 60, 50), rival('D', 60, 62), rival('E', 60, 55)]
  const VERSIONS = [60, 58, 63, 55, 61]

  it('prints performance and quality as ranges in Realistic, price exact, and today’s lines in Exact', () => {
    const { g, b } = devices()
    b.products = [core('Smartphone', 2025, 62)]
    const ctx = ctxWith(g, b, RIVALS, VERSIONS)
    const exact = specSheet(g, b, g.year, ctx)[0]!
    expect(exact.fog).toBeUndefined()
    expect(specLines(exact)[0]).toBe(scoreText(exact.perf))
    expect(specLines(exact)[0]).toMatch(/^Performance \d+\. Market \d+, best \d+, rank \d+ of 6\.$/)
    inFog(() => {
      const spec = specSheet(g, b, g.year, ctx)[0]!
      expect(spec.fog?.perf.basis).toBe('estimated')
      expect(spec.fog?.quality.basis).toBe('estimated')
      const [perf, quality, price] = specLines(spec)
      expect(perf).toMatch(ESTIMATED)
      expect(quality).toMatch(ESTIMATED)
      expect(price).toBe(specLines(exact)[2])
      expect(price).toMatch(/^Price \$[\d,]+\. Market \$/)
      // The rows themselves stay the true numbers: charts and other readers take their own view of them.
      expect(spec.perf).toEqual(exact.perf)
      expect(spec.quality).toEqual(exact.quality)
      expect(spec.price).toEqual(exact.price)
      for (const x of [perf, quality, price]) expect(x).not.toMatch(DASH)
    })
  })

  it('is stable, pure and keyed by the kind of hardware, so a laptop reads its own rivals', () => {
    const { g, b } = devices()
    b.products = [core('Smartphone', 2025, 62), core('Laptop', 2025, 58)]
    const ctx = ctxWith(g, b, RIVALS, VERSIONS)
    const before = JSON.stringify(g)
    const rng = g.rng
    inFog(() => {
      const one = specSheet(g, b, g.year, ctx)
      expect(specSheet(g, b, g.year, ctx)).toEqual(one)
      expect(one).toHaveLength(2)
      expect(one[0]!.fog).toBeDefined()
      expect(one[0]!.fog).not.toEqual(one[1]!.fog)
    })
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('has no fog when nobody else sells the kind', () => {
    const { g, b } = devices()
    b.products = [core('Smartphone', 2025, 62)]
    inFog(() => {
      const spec = specSheet(g, b, g.year, ctxWith(g, b, [], []))[0]!
      expect(spec.fog).toBeUndefined()
      expect(specLines(spec)[0]).toBe('Performance 68. The market has no figures.')
    })
  })

  it('shows the rank as a range on the kind’s sub-menu and keeps the true market and best out of the chart', () => {
    const { g, a, b } = devices()
    b.products = [core('Smartphone', 2025, 62), core('Laptop', 2025, 58)]
    const subs = (): MenuGroup[] => devicesMenu(a, buildFabAction(a)).children(g).filter((n): n is MenuGroup => n.type === 'menu')
    const subtitleOf = (n: MenuGroup): string => (typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''))
    const exactSubs = subs()
    const sheet = specSheet(g, b, g.year, marketCtxFor(g, b, g.year))
    expect(exactSubs).toHaveLength(2)
    expect(sheet).toHaveLength(2)
    const read = inFog(() => specSheet(g, b, g.year, marketCtxFor(g, b, g.year)))
    for (const s of exactSubs) expect(subtitleOf(s)).toMatch(/^Performance \d+ · (rank \d+ of \d+|the market has no figures)$/)
    const fogged = inFog(() =>
      withFlags({ chartKit: true }, () =>
        subs().map((n) => {
          const kids = n.children(g).filter(isInfo)
          const chart = kids.find((k) => k.chart)
          return {
            subtitle: subtitleOf(n),
            lines: kids.filter((k) => !k.chart).map((k) => infoText(g, k)),
            conf: kids.filter((k) => !k.chart).map((k) => k.conf),
            spec: chart?.chart?.(g) ?? null,
          }
        }),
      ),
    )
    let ranged = 0
    fogged.forEach((f, i) => {
      const spec = sheet.find((s) => exactSubs[i]!.id.endsWith(s.family.toLowerCase()))!
      expect(f.subtitle).toMatch(/^Performance \d+ · (rank \d+( to \d+)? of \d+|the market has no figures)$/)
      if (spec.perf.of <= 1) return
      ranged++
      expect(f.lines[0]).toMatch(ESTIMATED)
      expect(f.lines[1]).toMatch(ESTIMATED)
      const fog = read.find((s) => s.family === spec.family)!.fog!.perf
      expect(f.subtitle).toBe(`Performance ${Math.round(spec.perf.mine)} · ${rankText(spec.perf, fog)}`)
      expect(f.conf[0]).toBeDefined()
      expect(f.conf[1]).toBeDefined()
      expect(f.conf[2]).toBeUndefined()
      // The chart draws what the player reads, not the true market and best.
      const series = (id: string): (number | null)[] => f.spec?.series.find((s) => s.id === id)?.values ?? []
      expect(series('mine')[0]).toBeCloseTo(spec.perf.mine, 1)
      expect(series('market')[0]).not.toBeCloseTo(spec.perf.market, 1)
      expect(series('best')[0]).not.toBeCloseTo(spec.perf.best, 1)
    })
    expect(ranged, 'the test needs a kind with rivals').toBeGreaterThan(0)
  })
})

describe('AI benchmarks: a published board stays exact and says so', () => {
  const make = (year = 2027) => {
    const L = lab({}, year)
    L.t.models = [rated(L.fam, 1, 2024, offBest(L.fam, 2024, 0)), rated(L.fam, 2, 2026, offBest(L.fam, 2026, 30))]
    return L
  }

  it('changes only the stand-in disclaimer: (modeled) becomes (published) in Realistic', () => {
    const L = make()
    const s = labStanding(L.fam, L.t, 2026)!
    expect(s.leader?.modeled, 'the test needs a board with a modeled leader').toBe(true)
    const exact = benchRows(L.fam, L.t, 2026)
    const fog = inFog(() => benchRows(L.fam, L.t, 2026))
    expect(fog).toHaveLength(exact.length)
    expect(exact.find((r) => r.id === 'leader')!.text).toBe(`Best lab: ${s.leader!.name} (modeled).`)
    expect(fog.find((r) => r.id === 'leader')!.text).toBe(`Best lab: ${s.leader!.name} (published).`)
    // Every score line is the exact one, byte for byte: the board is a public leaderboard.
    expect(fog.filter((r) => r.id !== 'leader')).toEqual(exact.filter((r) => r.id !== 'leader'))
    for (const r of fog) {
      expect(r.text).not.toMatch(/estimated|about/)
      expect(r.text).not.toMatch(DASH)
    }
  })

  it('leaves the AI scorecard rows without a fog, so they print as published', () => {
    const L = make()
    const s = labStanding(L.fam, L.t, 2026)!
    for (const row of [s.composite, ...s.caps]) {
      expect(inFog(() => scoreText(row))).toBe(scoreText(row))
      expect(scoreText(row)).toMatch(EXACT_LINE)
    }
  })

  it('keeps the same rows in both modes for a lab with no rated model', () => {
    const L = lab({}, 2027)
    expect(inFog(() => benchRows(L.fam, L.t, 2026))).toEqual(benchRows(L.fam, L.t, 2026))
  })
})
