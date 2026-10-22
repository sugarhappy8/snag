// R3-G1 (H.4): a rival's profile reads estimates. Quality, technology and the quality of each product line are things the player
// cannot see, so in Realistic mode the profile rows show a range with a confidence chip; the same rows in Exact mode are
// today's text, byte for byte. Menus stay pure: no dice, no writes, the same rows twice.
import { describe, expect, it } from 'vitest'
import { marketViewOf } from '../src/game/business/competition'
import { marketKey } from '../src/game/business/competition-core'
import { shieldsOf } from '../src/game/business/lab-state'
import { familySlug, lineKey, rivalKey, rivalLine, rivalLinesOf, rivalRead, rivalScope, rivalStars, rivalTruth, weakest, lineRead } from '../src/game/business/market-fog'
import { familiesOf, rivalLines } from '../src/game/business/product-market'
import { readBiz } from '../src/game/business/state'
import { stars } from '../src/game/business/util'
import { INDUSTRY_IDS, type Industry } from '../src/game/data/markets'
import { withInfoMode } from '../src/game/knowledge/mode'
import type { Asset, GameState, MenuInfo, MenuNode } from '../src/game/types'
import { coverage, deepFreeze, fogGame, inFog } from './knowledge-kit'
import { adult, allNodes, company, marketNode, nextYear, renderAll } from './market-kit'

const LIVES = [
  ['software', 'us', 2015, 5],
  ['restaurant', 'jp', 2010, 7],
  ['semiconductor', 'us', 1990, 11],
] as const

function setup(ind: Industry, country: string, year: number, seed: number): { g: GameState; a: Asset } {
  const g = adult(seed, year, country)
  const a = company(g, ind)
  for (let i = 0; i < 3; i++) nextYear(g)
  return { g, a }
}

/** The info rows of a market screen whose id starts with `prefix`. */
function infos(g: GameState, a: Asset, prefix: string): MenuInfo[] {
  const m = marketNode(g, a)
  const all: MenuNode[] = m ? allNodes(g, [m]) : []
  return all.filter((n): n is MenuInfo => n.type === 'info' && n.id.startsWith(prefix))
}

const textOf = (n: MenuInfo, g: GameState): string => (typeof n.text === 'function' ? n.text(g) : n.text)

/** The first rivals of the view, with the rows of their profile. */
function profiles(g: GameState, a: Asset, n = 6) {
  const b = readBiz(g, a)
  const v = marketViewOf(g, b)
  return v.rivals.slice(0, n).map((r) => {
    const row = (part: string): MenuInfo => {
      const rows = infos(g, a, `biz.mkt.rp.${a.id}.${r.id}.${part}`)
      expect(rows.length, `${r.id} ${part}`).toBe(1)
      return rows[0]!
    }
    return { b, r, str: row('str'), lines: row('lines'), next: row('next') }
  })
}

/** What the rows said before this change, computed from the engine's own numbers. */
function exactStrengths(r: { real: boolean; quality: number; tech: number }): [string, string] {
  const s = (q: number) => stars(r.real ? Math.max(3, q / 20) : q / 20)
  return [s(r.quality), s(r.tech)]
}

function exactSells(g: GameState, a: Asset, rivalId: string): string {
  const b = readBiz(g, a)
  const r = marketViewOf(g, b).rivals.find((x) => x.id === rivalId)!
  const lines = rivalLines(r, b.industry, marketKey(b), g.year, shieldsOf(b))
  if (!lines.length) return 'Sells: its basic range (no product lines of note yet)'
  const shown = lines.slice(0, 4).map((l) => `${l.family} (${l.quality})`)
  return `Sells: ${shown.join(' \u{00B7} ')}${lines.length > 4 ? ` \u{00B7} +${lines.length - 4} more` : ''}`
}

describe('rival profile rows in Realistic mode', () => {
  for (const [ind, cid, year, seed] of LIVES) {
    it(`${ind}: strengths and product lines are ranges with a chip, not the exact numbers`, () => {
      const { g, a } = setup(ind, cid, year, seed)
      inFog(() => {
        const rows = profiles(g, a)
        expect(rows.length).toBeGreaterThan(3)
        for (const { r, str, lines } of rows) {
          const [q, t] = exactStrengths(r)
          const text = textOf(str, g)
          expect(text, r.id).toMatch(/^Strengths \(estimated\): quality .+ \u{00B7} technology .+ \u{00B7} prices /u)
          expect(text, `${r.id} shows quality exactly`).not.toContain(`quality ${q} \u{00B7}`)
          expect(text, `${r.id} shows technology exactly`).not.toContain(`technology ${t} \u{00B7}`)
          expect(text, `${r.id} has no range`).toMatch(/\u{2B50}+ to \u{2B50}+/u)
          expect(str.conf, r.id).toBeGreaterThanOrEqual(1)
          expect(str.conf, r.id).toBeLessThanOrEqual(3)
          const sells = textOf(lines, g)
          if (!/its basic range/.test(sells)) {
            expect(sells, r.id).not.toBe(exactSells(g, a, r.id))
            expect(sells, `${r.id} lines have no range`).toMatch(/\(\d+ to \d+\)|\(about \d+\)|\(\d+\)/)
            expect(lines.conf, r.id).toBeGreaterThanOrEqual(1)
            expect(lines.conf, r.id).toBeLessThanOrEqual(3)
          } else expect(lines.conf).toBeUndefined()
        }
      })
    })

    it(`${ind}: the guess about its next move says it is a guess`, () => {
      const { g, a } = setup(ind, cid, year, seed)
      inFog(() => {
        for (const { next } of profiles(g, a)) expect(textOf(next, g)).toMatch(/^Likely next \(our guess\): /)
      })
    })

    it(`${ind}: the menu built twice is equal, and building it touches neither the state nor the dice`, () => {
      const { g, a } = setup(ind, cid, year, seed)
      inFog(() => {
        const before = JSON.stringify(g)
        const rng = JSON.stringify(g.rng)
        const one = renderAll(g, a)
        const two = renderAll(g, a)
        expect(two).toEqual(one)
        expect(JSON.stringify(g)).toBe(before)
        expect(JSON.stringify(g.rng)).toBe(rng)
        expect(one.join('\n')).not.toMatch(/NaN|undefined|Infinity|\[object/)
        // A frozen state: a write anywhere in a read would throw here.
        expect(renderAll(deepFreeze(structuredClone(g)), a)).toEqual(one)
      })
    })
  }
})

describe('rival profile rows in Exact mode', () => {
  for (const [ind, cid, year, seed] of LIVES) {
    it(`${ind}: today's text, with no chip`, () => {
      const { g, a } = setup(ind, cid, year, seed)
      for (const { r, str, lines, next } of profiles(g, a)) {
        const [q, t] = exactStrengths(r)
        const text = textOf(str, g)
        expect(text.startsWith(`Strengths${r.real ? ' (modeled)' : ''}: quality ${q} \u{00B7} technology ${t} \u{00B7} prices `), r.id).toBe(true)
        expect(textOf(lines, g), r.id).toBe(exactSells(g, a, r.id))
        expect(textOf(next, g), r.id).toMatch(/^Likely next: /)
        expect(str.conf).toBeUndefined()
        expect(lines.conf).toBeUndefined()
        expect(next.conf).toBeUndefined()
        expect('conf' in str).toBe(false)
      }
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// The helpers themselves

/** A market's rivals with the company that meets them. */
function field(ind: Industry, cid: string, year: number, seed: number) {
  const { g, a } = setup(ind, cid, year, seed)
  const b = readBiz(g, a)
  return { g, a, b, rivals: marketViewOf(g, b).rivals }
}

describe('market-fog: honest', () => {
  it('a band holds the true quality, technology and line quality about 80% of the time', () => {
    const { b, rivals } = field('software', 'us', 2015, 5)
    const pool = rivals.slice(0, 30)
    expect(pool.length).toBeGreaterThanOrEqual(20)
    inFog(() => {
      for (const what of ['quality', 'tech'] as const) {
        const hit = coverage(600, (i) => {
          const r = pool[i % pool.length]!
          return { est: rivalRead(fogGame(i), b, r, what), truth: r[what] }
        })
        expect(hit, what).toBeGreaterThanOrEqual(0.75)
        expect(hit, `${what} is too wide to say anything`).toBeLessThanOrEqual(0.97)
      }
      const g0 = fogGame(0)
      const lines = pool.flatMap((r) => rivalLinesOf(g0, b, r).map((l) => ({ r, l })))
      expect(lines.length).toBeGreaterThan(20)
      const hit = coverage(600, (i) => {
        const { r, l } = lines[i % lines.length]!
        return { est: lineRead(fogGame(i), b, r.id, l.family, l.quality), truth: l.quality }
      })
      expect(hit).toBeGreaterThanOrEqual(0.75)
      expect(hit).toBeLessThanOrEqual(0.97)
    })
  })

  it('a Business talent narrows the band, and a band is never the exact number', () => {
    const { b, rivals } = field('software', 'us', 2015, 5)
    const width = (talents: string[]): number => {
      let sum = 0
      for (let i = 0; i < 60; i++) {
        const e = rivalRead(fogGame(i, { talents }), b, rivals[i % rivals.length]!, 'quality')
        expect(e.exact).toBe(false)
        expect(e.hi - e.lo).toBeGreaterThan(0)
        sum += e.hi - e.lo
      }
      return sum / 60
    }
    inFog(() => expect(width(['Business'])).toBeLessThan(width([])))
  })
})

describe('market-fog: stable and pure', () => {
  it('the same rival read twice in a year is the same text, and another year is another reading', () => {
    const { b, rivals } = field('restaurant', 'jp', 2010, 7)
    inFog(() => {
      let moved = 0
      for (let i = 0; i < 40; i++) {
        const r = rivals[i % rivals.length]!
        const g = fogGame(i)
        const one = rivalStars(g, b, r, 'quality')
        expect(rivalStars(g, b, r, 'quality')).toEqual(one)
        const line = rivalLinesOf(g, b, r)[0]
        if (line) expect(rivalLine(g, b, r.id, line.family, line.quality)).toEqual(rivalLine(g, b, r.id, line.family, line.quality))
        const next = rivalRead(fogGame(i, { year: g.year + 1 }), b, r, 'quality')
        if (next.mid !== rivalRead(g, b, r, 'quality').mid) moved++
      }
      expect(moved).toBeGreaterThan(30)
    })
  })

  it('reads leave the state and the dice alone, on a frozen state', () => {
    const { g, b, rivals } = field('semiconductor', 'us', 1990, 11)
    inFog(() => {
      const before = JSON.stringify(g)
      const rng = JSON.stringify(g.rng)
      const frozen = deepFreeze(structuredClone(g))
      for (const r of rivals.slice(0, 10)) {
        rivalStars(frozen, b, r, 'quality')
        rivalStars(frozen, b, r, 'tech')
        for (const l of rivalLinesOf(frozen, b, r)) rivalLine(frozen, b, r.id, l.family, l.quality)
      }
      expect(JSON.stringify(g)).toBe(before)
      expect(JSON.stringify(g.rng)).toBe(rng)
    })
  })
})

describe('market-fog: Exact mode is the old text', () => {
  it('stars of the true number (a real company never under three), the number itself, and no confidence', () => {
    const { g, b, rivals } = field('restaurant', 'jp', 2010, 7)
    withInfoMode('exact', () => {
      for (const r of rivals.slice(0, 12)) {
        const q = rivalStars(g, b, r, 'quality')
        const t = rivalStars(g, b, r, 'tech')
        expect(q).toEqual({ text: stars(r.real ? Math.max(3, r.quality / 20) : r.quality / 20) })
        expect(t).toEqual({ text: stars(r.real ? Math.max(3, r.tech / 20) : r.tech / 20) })
        for (const l of rivalLinesOf(g, b, r)) expect(rivalLine(g, b, r.id, l.family, l.quality)).toEqual({ text: String(l.quality) })
      }
    })
  })

  it('weakest keeps the lowest confidence and the oldest year of a row', () => {
    expect(weakest([])).toEqual({})
    expect(weakest([{ text: 'a' }, { text: 'b' }])).toEqual({})
    expect(weakest([{ text: 'a', conf: 3 }, { text: 'b', conf: 1, asOf: 2024 }, { text: 'c', conf: 2, asOf: 2022 }])).toEqual({ conf: 1, asOf: 2022 })
  })
})

describe('market-fog: keys', () => {
  it('every key is a valid knowledge key, and a rival id in two markets is two keys', () => {
    const KEY = /^riv:[A-Za-z0-9._~-]{1,40}(:[A-Za-z0-9._~-]{1,40})?:[A-Za-z0-9._~-]{1,40}$/
    const seen = new Set<string>()
    let lines = 0
    for (const [ind, cid, year, seed] of LIVES) {
      const { g, b, rivals } = field(ind, cid, year, seed)
      for (const r of rivals) {
        for (const k of [rivalKey(b, r.id, 'quality'), rivalKey(b, r.id, 'tech')]) {
          expect(k.length, k).toBeLessThanOrEqual(64)
          expect(k).toMatch(KEY)
          expect(seen.has(k), `${k} is used twice`).toBe(false)
          seen.add(k)
        }
        for (const l of rivalLinesOf(g, b, r)) {
          const k = lineKey(b, r.id, l.family)
          expect(k.length, k).toBeLessThanOrEqual(64)
          expect(k).toMatch(KEY)
          expect(k.endsWith(':line')).toBe(true)
          lines++
        }
      }
    }
    expect(seen.size).toBeGreaterThan(100)
    expect(lines).toBeGreaterThan(100)
    const us = { industry: 'restaurant', countryId: 'us' } as const
    const jp = { industry: 'restaurant', countryId: 'jp' } as const
    expect(rivalKey(us, 'rv-mcdonalds', 'quality')).not.toBe(rivalKey(jp, 'rv-mcdonalds', 'quality'))
    expect(rivalScope(us, 'f41')).not.toBe(rivalScope({ industry: 'aiLab', countryId: 'us' }, 'f41'))
    // A world market is one market for every country.
    expect(rivalScope({ industry: 'software', countryId: 'us' }, 'f41')).toBe(rivalScope({ industry: 'software', countryId: 'jp' }, 'f41'))
  })

  it('a family slug names one family of its industry, and every slug is a key part', () => {
    for (const ind of INDUSTRY_IDS) {
      const slugs = familiesOf(ind).map(familySlug)
      expect(new Set(slugs).size, ind).toBe(slugs.length)
      for (const s of slugs) expect(s, ind).toMatch(/^[a-z0-9-]{1,40}$/)
    }
  })

  it('rivalTruth finds the true number behind a key through the companies the player owns, and nothing else', () => {
    const { g, b, rivals } = field('software', 'us', 2015, 5)
    for (const r of rivals.slice(0, 8)) {
      expect(rivalTruth(g, rivalKey(b, r.id, 'quality'))).toBe(r.quality)
      expect(rivalTruth(g, rivalKey(b, r.id, 'tech'))).toBe(r.tech)
      for (const l of rivalLinesOf(g, b, r)) expect(rivalTruth(g, lineKey(b, r.id, l.family))).toBe(l.quality)
    }
    const r0 = rivals[0]!
    expect(rivalTruth(g, rivalKey({ industry: 'restaurant', countryId: 'jp' } as const, r0.id, 'quality'))).toBeNull()
    expect(rivalTruth(g, 'riv:zzzzzz:quality')).toBeNull()
    expect(rivalTruth(g, `${rivalKey(b, r0.id, 'quality').replace(':quality', ':cash')}`)).toBeNull()
    expect(rivalTruth(g, lineKey(b, r0.id, 'No Such Family'))).toBeNull()
    expect(rivalTruth(g, 'mkt:software:us:size')).toBeNull()
    expect(rivalTruth(g, 'riv:a:b:c:d:e')).toBeNull()
  })
})
