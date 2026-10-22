// R3-G9 (H.8): how much a stock, a penny stock or a coin swings is something the player cannot see. In Realistic mode the single-stock
// bets list says it in words with a confidence chip (a range with the Investing talent, or once an analyst has looked), each
// security's own screen gets a row with the same chip and a Look closer group, and a read of it is honest (the band holds the truth
// about 80% of the time), stable (the same number all year, a repeat buy changes nothing) and pure (no dice, no writes, no year
// after g.year). In Exact mode every row is today's text, byte for byte.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const asked = vi.hoisted(() => ({ years: [] as number[] }))

// The spy wraps the engine's market-year readers and records the year each call asked for (the pattern of analyst-tip.test.ts).
vi.mock('../src/game/invest/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/invest/engine')>()
  return {
    ...real,
    exchangeYear: (...args: Parameters<typeof real.exchangeYear>) => {
      asked.years.push(args[3])
      return real.exchangeYear(...args)
    },
    cryptoYear: (...args: Parameters<typeof real.cryptoYear>) => {
      asked.years.push(args[2])
      return real.cryptoYear(...args)
    },
    goldYear: (...args: Parameters<typeof real.goldYear>) => {
      asked.years.push(args[2])
      return real.goldYear(...args)
    },
    fxYear: (...args: Parameters<typeof real.fxYear>) => {
      asked.years.push(args[2])
      return real.fxYear(...args)
    },
  }
})

import { absPct } from '../src/game/computer/money-common'
import { coinTargets, listedTargets, priceLabel, stockBetsMenu } from '../src/game/computer/money-stocks'
import { coinDef, companyDef, exchangeInfo, exchangeYear, pennyDef } from '../src/game/invest/engine'
import {
  SWING_WORDS,
  analystNote,
  coinVolOf,
  secTag,
  stockVolOf,
  swingKey,
  swingLook,
  swingRead,
  swingRow,
  swingTruth,
  swingWord,
} from '../src/game/invest/contract'
import { investmentsMenu } from '../src/game/investments'
import { buyIntel, isExact, know, lookCloser, offersFor, readKnow, takeReading } from '../src/game/knowledge/contract'
import { parseKey, ruleOf } from '../src/game/knowledge/keys'
import { kindOfKey, labelOfKey } from '../src/game/knowledge/kinds'
import { COUNTRIES } from '../src/game/world'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { coverage, deepFreeze, fogGame, inFog, unitAt } from './knowledge-kit'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------------------------------------------------------------
// Lives and screens

/** A life of 30. `heir` 2 is the same market (the family seed drops the -g suffix) read by another character, so another draw. */
function life(seed: number, over: { talent?: boolean; money?: number; year?: number; country?: string; heir?: number } = {}): GameState {
  const g = makeTestGame(seed, { age: 30, countryId: over.country ?? 'us', money: over.money ?? 5_000_000, talents: over.talent ? ['Investing'] : undefined })
  g.lifeId = `fog-inv-${over.country ?? 'us'}-${seed}${over.heir ? `-g${over.heir}` : ''}`
  if (over.year !== undefined) g.year = over.year
  return g
}

const targets = (g: GameState) => [...listedTargets(g), ...coinTargets(g)]
const subOf = (n: MenuAction | MenuGroup, g: GameState): string => (typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''))
const textOf = (n: MenuInfo, g: GameState): string => (typeof n.text === 'function' ? n.text(g) : n.text)
const betRows = (g: GameState): MenuAction[] => stockBetsMenu().children(g).filter((n): n is MenuAction => n.type === 'action')
const betRow = (g: GameState, secId: string): MenuAction => {
  const r = betRows(g).find((n) => n.id === `computer.stockbets.${secId}`)
  if (!r) throw new Error(`no bet row for ${secId}`)
  return r
}

function group(nodes: readonly MenuNode[], id: string): MenuGroup {
  const n = nodes.find((x) => x.id === id)
  if (!n || n.type !== 'menu') throw new Error(`no group ${id}`)
  return n
}

/** The screen of one security: the offer node under Stocks, Penny Stocks or Crypto, and its rows. */
function offer(g: GameState, list: 'inv-stocks' | 'inv-penny' | 'inv-crypto', secId: string): { node: MenuGroup; rows: MenuNode[] } {
  const node = group(group(investmentsMenu.children(g), list).children(g), `inv-offer-${secId}`)
  return { node, rows: node.children(g) }
}

const swingInfo = (rows: readonly MenuNode[]): MenuInfo | undefined => rows.find((n): n is MenuInfo => n.type === 'info' && n.id.startsWith('inv-oswing-'))
const lookGroup = (rows: readonly MenuNode[]): MenuGroup | undefined => rows.find((n): n is MenuGroup => n.type === 'menu' && n.id.startsWith('look.swing.'))

/** Every node under `nodes`, depth first. */
function walk(g: GameState, nodes: readonly MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...walk(g, n.children(g))] : [n]))
}

/** Everything the bets list and the investments tree say about a life, as text: what a stability or purity case compares. */
function render(g: GameState): string[] {
  const out: string[] = []
  const nodes = [...stockBetsMenu().children(g), ...walk(g, investmentsMenu.children(g))]
  for (const n of nodes) {
    if (n.type === 'info') out.push(`${n.id}|${textOf(n, g)}|${n.conf ?? '-'}|${n.asOf ?? '-'}`)
    else if (n.type === 'heading') out.push(n.label)
    else out.push(`${n.id}|${n.label}|${subOf(n, g)}|${n.conf ?? '-'}|${n.asOf ?? '-'}|${n.disabledReason?.(g) ?? ''}`)
  }
  return out
}

/** A stock of the bets list with something to swing, preferably a made up company (a real one reads the same). */
function aStock(g: GameState) {
  const ts = listedTargets(g).filter((t) => t.vol > 0)
  const t = ts.find((x) => !x.real) ?? ts[0]
  if (!t) throw new Error('no stock')
  return t
}

const RIDE = / · (a steady|a choppy|a wild|an extreme) ride$/
const RANGE = / · swings (about )?\d+%( to \d+%)? a year$/

// ---------------------------------------------------------------------------------------------------------------------------------

beforeEach(() => {
  asked.years.length = 0
})

describe('the suite runs in Exact', () => {
  it('starts in Exact, so every row below is today\'s text unless a case flips the mode', () => {
    expect(isExact()).toBe(true)
  })
})

describe('Exact mode: every row is today\'s text', () => {
  it('the bets list keeps "swings ~X% a year", byte for byte, and carries no chip', () => {
    for (const seed of [1, 2, 3]) {
      const g = life(seed)
      const ts = targets(g)
      expect(ts.length).toBeGreaterThan(10)
      for (const t of ts) {
        const row = betRow(g, t.secId)
        const want = `${priceLabel(t.price)} · ${t.sector}${t.vol > 0 ? ` · swings ~${absPct(t.vol, 0)} a year` : ''}`
        expect(subOf(row, g), t.symbol).toBe(want)
        expect(row.conf).toBeUndefined()
        expect(row.asOf).toBeUndefined()
      }
    }
  })

  it('a security\'s own screen has no swing row and no Look closer group', () => {
    const g = life(4)
    const t = aStock(g)
    const { rows } = offer(g, 'inv-stocks', t.secId)
    expect(swingInfo(rows)).toBeUndefined()
    expect(lookGroup(rows)).toBeUndefined()
    expect(swingRow(g, t.secId)).toBeNull()
    expect(swingLook(g, t.secId)).toBeNull()
    expect(analystNote(g, t.secId)).toBeNull()
  })

  it('swingRead says the old words and no confidence', () => {
    const g = life(5)
    expect(swingRead(g, 'X#s1g0', 0.184)).toEqual({ text: 'swings ~18% a year' })
    expect(swingRead(g, 'X#s1g0', 0.004)).toEqual({ text: 'swings ~0% a year' })
    expect(swingRead(g, 'X#s1g0', 1.06)).toEqual({ text: 'swings ~106% a year' })
  })
})

describe('Realistic mode: the bets list reads words with a chip', () => {
  it('shows a word and a confidence of 1, never the number', () => {
    const g = life(1)
    inFog(() => {
      const ts = targets(g)
      expect(ts.length).toBeGreaterThan(10)
      let swinging = 0
      for (const t of ts) {
        const row = betRow(g, t.secId)
        const s = subOf(row, g)
        expect(s, `${t.symbol} keeps no number`).not.toContain('~')
        if (t.vol > 0) {
          swinging++
          expect(s, t.symbol).toMatch(RIDE)
          expect(row.conf, t.symbol).toBe(1)
          expect(row.asOf).toBeUndefined()
        } else {
          expect(s, `${t.symbol} has nothing to swing`).not.toMatch(/swing|ride/)
          expect(row.conf).toBeUndefined()
        }
      }
      expect(swinging).toBeGreaterThan(10)
    })
  })

  it('shows a range with a confidence of 2 for the Investing talent', () => {
    const g = life(1, { talent: true })
    inFog(() => {
      for (const t of targets(g).filter((x) => x.vol > 0)) {
        const row = betRow(g, t.secId)
        expect(subOf(row, g), t.symbol).toMatch(RANGE)
        expect(row.conf, t.symbol).toBe(2)
      }
    })
  })

  it('uses every word across a market, and the words are fallible (another life can read another one)', () => {
    const seen = new Set<string>()
    const differ = new Set<string>()
    inFog(() => {
      for (let seed = 1; seed <= 12; seed++) {
        const g = life(seed)
        const a = life(seed, { heir: 2 })
        for (const t of listedTargets(g).filter((x) => x.vol > 0)) {
          const w = subOf(betRow(g, t.secId), g).match(RIDE)?.[1] ?? ''
          seen.add(w)
          const other = subOf(betRow(a, t.secId), a).match(RIDE)?.[1] ?? ''
          if (other !== w) differ.add(t.secId)
        }
      }
    })
    expect(seen.size).toBeGreaterThanOrEqual(3)
    expect(differ.size).toBeGreaterThan(0)
  })

  it('the same screen twice is the same text', () => {
    const g = life(2)
    inFog(() => {
      expect(render(g)).toEqual(render(g))
    })
  })

  it('reads purely: no dice, no writes, and the frozen life is built without a throw', () => {
    const g = life(6)
    inFog(() => {
      const before = JSON.stringify(g)
      const rng = g.rng
      render(g)
      for (const t of targets(g)) swingRead(g, t.secId, t.vol)
      expect(JSON.stringify(g)).toBe(before)
      expect(g.rng).toBe(rng)
    })
    const frozen = deepFreeze(life(7, { talent: true }))
    inFog(() => {
      expect(() => render(frozen)).not.toThrow()
      expect(() => analystNote(frozen, aStock(frozen).secId)).not.toThrow()
    })
  })
})

describe('Realistic mode: a security\'s own screen', () => {
  it('gets a swing row with a chip and a Look closer group, for stocks, penny stocks and coins only', () => {
    const g = life(3)
    inFog(() => {
      const t = aStock(g)
      const stock = offer(g, 'inv-stocks', t.secId).rows
      const row = swingInfo(stock)
      expect(row, 'stock').toBeDefined()
      expect(row!.id).toBe(`inv-oswing-${t.secId}`)
      expect(textOf(row!, g)).toMatch(/^Year to year, it's (a steady|a choppy|a wild|an extreme) ride\.$/)
      expect(row!.conf).toBe(1)
      expect(lookGroup(stock)?.id).toBe(`look.swing.${secTag(t.secId)}`)

      const pennies = group(investmentsMenu.children(g), 'inv-penny').children(g).filter((n): n is MenuGroup => n.type === 'menu')
      expect(pennies.length).toBeGreaterThan(0)
      for (const p of pennies) {
        const rows = p.children(g)
        expect(swingInfo(rows), p.id).toBeDefined()
        expect(lookGroup(rows), p.id).toBeDefined()
      }

      const coins = group(investmentsMenu.children(g), 'inv-crypto').children(g).filter((n): n is MenuGroup => n.type === 'menu')
      expect(coins.length).toBeGreaterThan(1)
      const unstable = new Set(coinTargets(g).filter((c) => c.vol > 0).map((c) => `inv-offer-${c.secId}`))
      for (const c of coins) {
        const rows = c.children(g)
        if (unstable.has(c.id)) expect(swingInfo(rows), c.id).toBeDefined()
        else {
          expect(swingInfo(rows), `${c.id} is a stablecoin`).toBeUndefined()
          expect(lookGroup(rows), `${c.id} is a stablecoin`).toBeUndefined()
        }
      }

      // The fund, the property trust, gold, the bonds and the savings have no such row.
      for (const n of investmentsMenu.children(g)) {
        if (n.type !== 'menu' || !n.id.startsWith('inv-offer-')) continue
        const rows = n.children(g)
        expect(swingInfo(rows), n.id).toBeUndefined()
        expect(lookGroup(rows), n.id).toBeUndefined()
      }
    })
  })

  it('shows the same row twice', () => {
    const g = life(3)
    inFog(() => {
      const t = aStock(g)
      const a = swingInfo(offer(g, 'inv-stocks', t.secId).rows)!
      const b = swingInfo(offer(g, 'inv-stocks', t.secId).rows)!
      expect(a).toEqual(b)
    })
  })

  it('has no row for a stablecoin, and no row at all for a security that is not on the market', () => {
    const g = life(3)
    inFog(() => {
      expect(swingRow(g, 'NOPE#s0g0')).toBeNull()
      expect(swingLook(g, 'NOPE#s0g0')).toBeNull()
      expect(analystNote(g, 'NOPE#s0g0')).toBeNull()
      for (const c of coinTargets(g).filter((x) => x.vol === 0)) expect(swingRow(g, c.secId)).toBeNull()
    })
  })
})

describe('an analyst note sharpens the swing', () => {
  it('turns the word into a range, in the bets list and on the security\'s screen, and says so', () => {
    const g = life(8)
    inFog(() => {
      const t = aStock(g)
      const key = swingKey(t.secId)
      expect(analystNote(g, t.secId)).toBeNull()
      expect(subOf(betRow(g, t.secId), g)).toMatch(RIDE)

      expect(buyIntel(g, 'analyst', [key]).ok).toBe(true)

      const note = analystNote(g, t.secId)!
      expect(note).toMatch(new RegExp(`^An analyst puts the yearly swing of ${t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} at (about \\d+%|\\d+% to \\d+%)\\.$`))
      const span = note.match(/ at (about \d+%|\d+% to \d+%)\.$/)![1]!
      const row = betRow(g, t.secId)
      expect(subOf(row, g)).toContain(`swings ${span} a year`)
      expect(row.conf).toBe(2)

      const shown = swingInfo(offer(g, 'inv-stocks', t.secId).rows)!
      expect(textOf(shown, g)).toBe(note)
      expect(shown.conf).toBe(2)
    })
  })

  it('makes a repeat buy the same text and costs nothing', () => {
    const g = life(9)
    inFog(() => {
      const t = aStock(g)
      const key = swingKey(t.secId)
      expect(buyIntel(g, 'analyst', [key]).ok).toBe(true)
      const cash = g.character.money
      const text = render(g)
      const again = buyIntel(g, 'analyst', [key])
      expect(again.ok).toBe(false)
      expect(again.why).toBe("You already have this year's reading.")
      expect(g.character.money).toBe(cash)
      expect(render(g)).toEqual(text)
    })
  })

  it('goes through the Look closer group on the screen: the fee is booked once, the row sharpens, the offer closes', () => {
    const g = life(10)
    inFog(() => {
      const t = aStock(g)
      const key = swingKey(t.secId)
      const group0 = lookGroup(offer(g, 'inv-stocks', t.secId).rows)!
      const analyst = group0.children(g).find((n): n is MenuAction => n.type === 'action' && n.id === `${group0.id}.analyst`)!
      expect(analyst.label).toBe('An analyst')
      expect(analyst.disabledReason?.(g) ?? null).toBeNull()
      const price = offersFor(g, [key]).find((o) => o.src === 'analyst')!.price
      expect(price).toBeGreaterThan(0)

      const cash = g.character.money
      analyst.run(g)
      expect(g.character.money).toBe(cash - price)
      expect(analystNote(g, t.secId)).not.toBeNull()

      const after = lookGroup(offer(g, 'inv-stocks', t.secId).rows)!
      const again = after.children(g).find((n): n is MenuAction => n.type === 'action' && n.id === `${after.id}.analyst`)!
      expect(again.disabledReason?.(g)).toBe("You already have this year's reading.")
      analyst.run(g)
      expect(g.character.money).toBe(cash - price)
    })
  })

  it('reads on the same number all year and another number next year', () => {
    const g = life(11)
    inFog(() => {
      const t = aStock(g)
      const key = swingKey(t.secId)
      const a = know(g, key, t.vol).mid
      expect(know(g, key, t.vol).mid).toBe(a)
      const later = { ...g, year: g.year + 1 }
      expect(know(later, key, t.vol).mid).not.toBe(a)
    })
  })

  it('is no note at all when the reading came from the trade press or has aged away', () => {
    const g = life(12)
    inFog(() => {
      const t = aStock(g)
      const key = swingKey(t.secId)
      expect(buyIntel(g, 'press', [key]).ok).toBe(true)
      expect(readKnow(g)?.k[key]?.src).toBe('press')
      expect(analystNote(g, t.secId)).toBeNull()

      const h = life(13)
      const u = aStock(h)
      expect(buyIntel(h, 'analyst', [swingKey(u.secId)]).ok).toBe(true)
      expect(analystNote(h, u.secId)).not.toBeNull()
      // Six years on the reading is worth less than the plain read, so it is no longer the one shown.
      h.year += 6
      h.character.age += 6
      expect(analystNote(h, u.secId)).toBeNull()
    })
  })
})

describe('the band is honest', () => {
  it('holds the swing about 80% of 10,000 passive reads, and 80% for the Investing talent too', () => {
    inFog(() => {
      const plain = coverage(10_000, (i) => {
        const vol = 0.08 + 1.2 * unitAt('vol', i)
        return { est: know(fogGame(i), swingKey(`X#s${i}g0`), vol), truth: vol }
      })
      expect(plain).toBeGreaterThan(0.77)
      expect(plain).toBeLessThan(0.83)
      const gifted = coverage(10_000, (i) => {
        const vol = 0.08 + 1.2 * unitAt('vol2', i)
        return { est: know(fogGame(i, { talents: ['Investing'] }), swingKey(`X#s${i}g0`), vol), truth: vol }
      })
      expect(gifted).toBeGreaterThan(0.77)
      expect(gifted).toBeLessThan(0.83)
    })
  })

  it('holds the swing at least 75% of 3,000 reads after an analyst, and the bands are tighter', () => {
    inFog(() => {
      let width = 0
      const hit = coverage(3_000, (i) => {
        const vol = 0.08 + 1.2 * unitAt('vol3', i)
        const g = { ...fogGame(i), flags: {} }
        const est = takeReading(g, 'analyst', swingKey(`X#s${i}g0`), vol)!
        expect(est.src).toBe('analyst')
        width += Math.log(est.hi / est.lo)
        return { est, truth: vol }
      })
      expect(hit).toBeGreaterThanOrEqual(0.75)
      expect(hit).toBeLessThan(0.86)
      const passive = Math.log(Math.exp(1.298 * 0.25) / Math.exp(-1.298 * 0.25))
      expect(width / 3_000).toBeLessThan(passive * 0.6)
    })
  })

  it('a conf 2 reading is a range of whole percents and the word is the one for the reading', () => {
    inFog(() => {
      const g = fogGame(1, { talents: ['Investing'] })
      const r = swingRead(g, 'X#s9g0', 0.3)
      expect(r.conf).toBe(2)
      expect(r.text).toMatch(/^swings (about )?\d+%( to \d+%)? a year$/)
      const p = swingRead(fogGame(2), 'X#s9g0', 0.3)
      expect(p.conf).toBe(1)
      expect(p.text).toMatch(/^an? (steady|choppy|wild|extreme) ride$/)
    })
  })
})

describe('the words', () => {
  it('end at 18%, 32% and 55%', () => {
    expect(SWING_WORDS).toEqual(['steady', 'choppy', 'wild', 'extreme'])
    expect(swingWord(0.05)).toBe('steady')
    expect(swingWord(0.179)).toBe('steady')
    expect(swingWord(0.18)).toBe('choppy')
    expect(swingWord(0.319)).toBe('choppy')
    expect(swingWord(0.32)).toBe('wild')
    expect(swingWord(0.549)).toBe('wild')
    expect(swingWord(0.55)).toBe('extreme')
    expect(swingWord(2)).toBe('extreme')
    expect(swingWord(Number.NaN)).toBe('steady')
  })

  it('suit the market: a quiet utility is steady, a penny stock or a meme coin is extreme', () => {
    const g = life(14)
    const info = exchangeInfo('us')
    const ey = exchangeYear('fam', 2000, info, 2026)
    const pennies = ey.pennies.map((s) => stockVolOf(info, pennyDef(info, s.slot, s.gen)))
    expect(pennies.length).toBeGreaterThan(0)
    for (const v of pennies) expect(swingWord(v)).toBe('extreme')
    const stocks = ey.stocks.map((s) => swingWord(stockVolOf(info, companyDef(info, s.slot, s.gen))))
    expect(new Set(stocks).size).toBeGreaterThanOrEqual(2)
    expect(coinTargets(g).some((c) => swingWord(c.vol) === 'extreme')).toBe(true)
  })
})

describe('the key and its kind', () => {
  it('is a valid key of at most 64 characters with a rule row, and no two securities of an exchange share one', () => {
    let n = 0
    for (const c of COUNTRIES.slice(0, 60)) {
      const info = exchangeInfo(c.id)
      const ids = new Map<string, string>()
      const add = (secId: string): void => {
        const key = swingKey(secId)
        const p = parseKey(key)
        expect(p, key).not.toBeNull()
        expect(key.length).toBeLessThanOrEqual(64)
        expect(ruleOf(key)?.unit).toBe('pct')
        expect(ids.get(key) ?? secId, `${key} is shared`).toBe(secId)
        ids.set(key, secId)
        n++
      }
      for (let slot = 0; slot < 24; slot++) {
        for (let gen = 0; gen < 4; gen++) add(companyDef(info, slot, gen).id)
        if (slot < 12) for (let gen = 0; gen < 3; gen++) add(pennyDef(info, slot, gen).id)
      }
    }
    for (let slot = 0; slot < 8; slot++) for (let gen = 0; gen < 4; gen++) expect(parseKey(swingKey(coinDef(slot, gen).id))).not.toBeNull()
    expect(n).toBeGreaterThan(2000)
  })

  it('finds the truth of every security of the bets list, and none for a stablecoin', () => {
    for (const seed of [1, 2]) {
      const g = life(seed)
      for (const t of targets(g)) {
        const key = swingKey(t.secId)
        const kind = kindOfKey(key)
        expect(kind, t.symbol).not.toBeNull()
        const truth = kind!.truth(g, key)
        if (t.vol > 0) {
          expect(truth, t.symbol).toBeCloseTo(t.vol, 12)
          expect(swingTruth(g, t.secId), t.symbol).toBeCloseTo(t.vol, 12)
          expect(labelOfKey(g, key)).toBe(`${t.name} swings`)
        } else expect(truth, t.symbol).toBeNull()
      }
    }
  })

  it('keeps the formulas the menus always used', () => {
    for (const c of COUNTRIES.slice(0, 30)) {
      const info = exchangeInfo(c.id)
      const v = Math.min(0.8, Math.max(0.05, info.ex.volatility))
      for (let slot = 0; slot < 10; slot++) {
        const def = companyDef(info, slot, 0)
        expect(stockVolOf(info, def)).toBeCloseTo(Math.sqrt((def.beta * v * 0.85) ** 2 + def.idio ** 2), 12)
      }
    }
    for (let slot = 0; slot < 8; slot++) {
      const def = coinDef(slot, 0)
      expect(coinVolOf(def)).toBeCloseTo(def.stable ? 0 : Math.min(2, Math.sqrt((def.beta * 0.5) ** 2 + def.idio ** 2)), 12)
    }
  })

  it('offers an analyst, the trade press and your own homework for the key, in Realistic mode only', () => {
    const g = life(15)
    const key = swingKey(aStock(g).secId)
    expect(offersFor(g, [key])).toEqual([])
    expect(lookCloser(g, { id: 'x', keys: [key] })).toBeNull()
    inFog(() => {
      const srcs = offersFor(g, [key]).map((o) => o.src)
      expect(srcs).toEqual(expect.arrayContaining(['own', 'press', 'analyst']))
      expect(srcs).not.toContain('diligence')
      expect(lookCloser(g, { id: 'x', keys: [key] })).not.toBeNull()
    })
  })
})

describe('no foresight', () => {
  it('asks the engine for no year after g.year: the swing reads, the analyst note, the screens and the free news', () => {
    for (const [seed, year] of [
      [1, 2026],
      [2, 2005],
      [3, 1995],
    ] as const) {
      const g = life(seed, { year })
      inFog(() => {
        asked.years.length = 0
        render(g)
        const t = aStock(g)
        expect(buyIntel(g, 'analyst', [swingKey(t.secId)]).ok).toBe(true)
        expect(analystNote(g, t.secId)).not.toBeNull()
        for (const x of targets(g)) swingRead(g, x.secId, x.vol)
        const news = group(investmentsMenu.children(g), 'inv-news')
        news.children(g)
        expect(asked.years.length, `${year} asked for nothing`).toBeGreaterThan(0)
        expect(Math.max(...asked.years) - g.year, `${year} read ahead`).toBeLessThanOrEqual(0)
      })
    }
  })
})
