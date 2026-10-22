// R3-H8 (H.13): market signals and one hedged analyst line in the Financial News.
//
// The line cites a real present signal (a tech wave moving a sector, a market shock announced this year, a lopsided year for
// the listed stocks), carries a confidence and a hedge, and gives no direction: the free tip (a coin flip about the year to
// come) and the Investing gut stay the only voices that point anywhere. The signals read this year and last, never a year
// after g.year, and the whole thing is a pure read: no g.rng, no write, the same text every time the menu opens.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const asked = vi.hoisted(() => ({ years: [] as number[] }))
// `wave` replaces what waveNews says (null for no line); undefined leaves the real one alone.
const fake = vi.hoisted(() => ({ wave: undefined as string | null | undefined }))

// The spy of analyst-tip.test.ts: the four readers of a market year record the year each call asked for.
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

vi.mock('../src/game/invest/wave-stocks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/invest/wave-stocks')>()
  return { ...real, waveNews: (...args: Parameters<typeof real.waveNews>) => (fake.wave === undefined ? real.waveNews(...args) : fake.wave) }
})

import { companyDef, eraIdentity, exchangeInfo, exchangeStatus, exchangeYear, isRealSecId } from '../src/game/invest/engine'
import { READ_MAX, marketRead, marketSignals, type MarketSignal } from '../src/game/invest/signals'
import { SHOCK_CAUSES, addMarketShock, type ShockCause } from '../src/game/invest/shocks'
import { waveNews } from '../src/game/invest/wave-stocks'
import { investmentsMenu } from '../src/game/investments'
import { timelineFamily } from '../src/game/timeMachine'
import type { TechWave } from '../src/game/business/tech-waves'
import type { GameState, Json, MenuGroup } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'

const YEAR = 2031
const READ = /^🧭 /
const TIP = /^📣 /
const GUT = /Market instinct for \d{4}/
const HEDGE = 'Worth watching, nothing more.'
const CONFIDENCE = ['Low confidence.', 'Some confidence.', 'Fairly confident.']
const DIRECTION = /\b(buy|sell|strong|overvalued|undervalued|bullish|bearish|cautious|rally|crash|soar|surge|plunge|jump|rise|rose|rising|fall|fell|falling|up|down|higher|lower|gain|gains|loss|will)\b/i
const DASHES = /[\u2013\u2014]/
const J = (v: unknown): Json => v as Json

/** An adult born in 1997 by default, so the family market starts before every year the tests ask about. */
function life(seed: number, year = YEAR, o: { country?: string; talent?: boolean; born?: number } = {}): GameState {
  const country = o.country ?? 'us'
  const g = makeTestGame(seed, { age: year - (o.born ?? 1997), money: 1_000_000, countryId: country, talents: o.talent ? ['Investing'] : undefined })
  g.lifeId = `read-${country}-${seed}`
  g.year = year
  g.log = [{ age: g.character.age, year, entries: [] }]
  return g
}

const infoOf = (g: GameState) => exchangeInfo(g.character.countryId)
const readOf = (g: GameState) => marketRead(g, infoOf(g))
const signalsOf = (g: GameState) => marketSignals(g, infoOf(g))
const famOf = (g: GameState): string => timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))
const anchorOf = (g: GameState): number => g.year - g.character.age

/** A life whose year gives no signal of its own (no lopsided breadth), so a wave or a shock put on it is the strongest thing it reads. */
function calm(year = YEAR): GameState {
  const was = fake.wave
  fake.wave = null
  try {
    for (let seed = 1; seed <= 200; seed++) {
      const g = life(seed, year)
      if (signalsOf(g).length === 0) return g
    }
  } finally {
    fake.wave = was
  }
  throw new Error('no calm life found')
}

function newsLines(g: GameState): string[] {
  const news = investmentsMenu.children(g).find((n) => n.id === 'inv-news') as MenuGroup
  return news.children(g).map((n) => (n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : ''))
}

const SMART = (o: Partial<TechWave> = {}): TechWave => ({ id: 'workshop:smartphone:2030:x', kind: 'smartphone', name: 'Smartphones', source: 'workshop', year: 2030, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const CHIPS = (o: Partial<TechWave> = {}): TechWave => ({ id: 'chips', kind: 'chips', name: 'Chip leap', source: 'workshop', year: 2031, market: 'world', size: 0.6, hype: 1, delivery: 1, last: 2031, ...o })
const put = (g: GameState, ...w: TechWave[]) => { g.flags.techWaves = J(w) }

/** A made-up stock of the player's exchange to put a shock on (a real company takes no damaging story): the first one the year lists. */
function shockOn(g: GameState, cause: ShockCause, mult: number, over: { year?: number; exKey?: string; asset?: 'stock' | 'coin' } = {}) {
  const info = infoOf(g)
  const s = exchangeYear(famOf(g), anchorOf(g), info, g.year).stocks.find((x) => !isRealSecId(companyDef(info, x.slot, x.gen).id))!
  const def = companyDef(info, s.slot, s.gen)
  return addMarketShock(g, {
    asset: over.asset ?? 'stock', secId: def.id, exKey: over.exKey ?? info.key, slot: s.slot, name: def.name, symbol: def.symbol,
    cause, year: over.year ?? g.year, mult, fade: 0, countryId: g.character.countryId,
  })
}

function deepFreeze(o: unknown): void {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
}

/** The breadth of the year, restated from the engine: stocks that rose out of the stocks that can be rated, or null when none can. */
function breadth(g: GameState): { rose: number; n: number } | null {
  const now = exchangeYear(famOf(g), anchorOf(g), infoOf(g), g.year)
  const listed = now.stocks.filter((s) => s.event !== 'ipo' && !s.ended)
  if (listed.length < 6 || !listed.some((s) => s.ret !== 0)) return null
  return { rose: listed.filter((s) => s.ret > 0).length, n: listed.length }
}

beforeEach(() => {
  asked.years.length = 0
  fake.wave = undefined
})

describe('the wave signal', () => {
  it('a life with a live wave gets a line that names the wave, graded by the sector move', () => {
    const g = life(7)
    expect(waveNews(g, infoOf(g).key, YEAR)).toBeNull()
    put(g, SMART({ year: YEAR }), CHIPS())
    const news = waveNews(g, infoOf(g).key, YEAR)!
    expect(news).toMatch(/^Chip leap wave moved Semiconductors stocks up 4[34]%\.$/)
    const top = signalsOf(g)[0]
    expect(top).toEqual({ kind: 'wave', strength: 3, label: 'Chip leap wave', year: YEAR })
    const read = readOf(g)!
    expect(read).toMatch(READ)
    expect(read).toContain('Chip leap wave')
    expect(read).toContain('Fairly confident.')
    expect(read).toContain(HEDGE)
  })

  it('reads the size of the move from the news line: 3, 6 and 10 percent give strength 1, 2 and 3, below 3 gives none', () => {
    const g = life(7)
    const strengthOf = (text: string | null): number | null => {
      fake.wave = text
      return signalsOf(g).find((s) => s.kind === 'wave')?.strength ?? null
    }
    const line = (n: number, dir = 'up') => `Frontier AI wave moved Semiconductors stocks ${dir} ${n}%.`
    expect([2, 3, 5, 6, 9, 10, 43].map((n) => strengthOf(line(n)))).toEqual([null, 1, 1, 2, 2, 3, 3])
    expect(strengthOf(line(9, 'down'))).toBe(2)
    expect(strengthOf(null)).toBeNull()
    expect(strengthOf('Something else happened.')).toBeNull()
    expect(strengthOf('Frontier AI wave moved Semiconductors stocks up 9% or so.')).toBeNull()
  })

  it('names the wave and never the sector or a company', () => {
    const g = life(7)
    fake.wave = 'Frontier AI wave moved Semiconductors stocks up 9%.'
    const read = readOf(g)!
    expect(read).toContain('Frontier AI wave')
    expect(read).not.toMatch(/Semiconductors/)
    expect(read).toContain('Some confidence.')
  })
})

describe('the shock signal', () => {
  it('a life with a shock announced this year names the shock, graded by its size', () => {
    const cases: [ShockCause, number, string, number][] = [
      ['ban', 0.8, 'government ban', 1],
      ['probe', 0.65, 'government probe', 2],
      ['nationalize', 0.45, 'nationalization talk', 3],
      ['contract', 1.2, 'state contract', 1],
      ['deregulate', 1.35, 'deregulation', 2],
      ['endorse', 1.5, 'state endorsement', 3],
      ['policy', 0.7, 'new law', 2],
    ]
    for (const [cause, mult, words, strength] of cases) {
      const g = calm()
      shockOn(g, cause, mult)
      const top = signalsOf(g).find((s) => s.kind === 'shock')
      expect(top, cause).toMatchObject({ kind: 'shock', strength, year: YEAR })
      expect(top!.label, cause).toContain(words)
      expect(readOf(g), cause).toMatch(new RegExp(words, 'i'))
    }
  })

  it('names no company, symbol or direction', () => {
    const g = calm()
    const sh = shockOn(g, 'ban', 0.5)
    const read = readOf(g)!
    expect(read).not.toContain(sh.name)
    expect(read).not.toContain(` ${sh.symbol} `)
    expect(read).not.toMatch(DIRECTION)
  })

  it('ignores a move under 15%, the player\'s own order flow, last year, a foreign exchange and a coin before coins trade', () => {
    const g = calm()
    shockOn(g, 'ban', 0.9)
    shockOn(g, 'liquidity', 0.5)
    shockOn(g, 'ban', 0.4, { year: YEAR - 1 })
    shockOn(g, 'ban', 0.4, { exKey: 'XX:nowhere' })
    expect(signalsOf(g).filter((s) => s.kind === 'shock')).toEqual([])
    const early = life(3, 1985, { born: 1955 })
    shockOn(early, 'endorse', 1.6, { asset: 'coin', exKey: 'crypto' })
    expect(signalsOf(early).filter((s) => s.kind === 'shock')).toEqual([])
  })

  it('reads a coin shock once coins trade, and the largest move of several', () => {
    const g = calm()
    shockOn(g, 'endorse', 1.6, { asset: 'coin', exKey: 'crypto' })
    expect(signalsOf(g).find((s) => s.kind === 'shock')).toMatchObject({ strength: 3, label: 'a state endorsement' })
    shockOn(g, 'ban', 0.2)
    expect(signalsOf(g).find((s) => s.kind === 'shock')).toMatchObject({ strength: 3, label: 'a government ban' })
  })

  it('does not break on a stored shock that is not a number', () => {
    const g = life(3)
    g.flags.marketShocks = J([{ id: 'x', asset: 'stock', secId: 's', exKey: infoOf(g).key, slot: 0, name: 'N', symbol: 'N', cause: 'ban', year: YEAR, mult: 'big', fade: 0, countryId: 'us' }])
    expect(() => readOf(g)).not.toThrow()
  })
})

describe('the tilt signal', () => {
  it('fires on a lopsided year (30% or less, or 70% or more rose) and on nothing else, over 40 lives by 12 years', { timeout: 120_000 }, () => {
    const seen = { none: 0, one: 0, two: 0 }
    for (let seed = 1; seed <= 40; seed++) {
      const g = life(seed, 2027)
      for (let i = 0; i < 12; i++, g.year += 3, g.character.age += 3) {
        const tilt = signalsOf(g).filter((s) => s.kind === 'tilt')
        const b = breadth(g)
        const one = b !== null && (b.rose * 10 <= 3 * b.n || b.rose * 10 >= 7 * b.n)
        const two = b !== null && (b.rose * 10 <= 2 * b.n || b.rose * 10 >= 8 * b.n)
        if (!one) {
          expect(tilt, `seed ${seed} year ${g.year}`).toEqual([])
          seen.none++
          continue
        }
        expect(tilt, `seed ${seed} year ${g.year}`).toEqual([{ kind: 'tilt', strength: two ? 2 : 1, label: 'market breadth', year: g.year }])
        if (two) seen.two++
        else seen.one++
      }
    }
    expect(seen.none).toBeGreaterThan(40)
    expect(seen.one).toBeGreaterThan(5)
    expect(seen.two).toBeGreaterThan(5)
  })

  it('a middling year with no wave and no shock gets no line at all', { timeout: 120_000 }, () => {
    let quiet = 0
    let spoken = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = life(seed, 2027)
      for (let i = 0; i < 12; i++, g.year += 3, g.character.age += 3) {
        const b = breadth(g)
        const lopsided = b !== null && (b.rose * 10 <= 3 * b.n || b.rose * 10 >= 7 * b.n)
        if (lopsided) {
          expect(readOf(g), `seed ${seed} year ${g.year}`).not.toBeNull()
          spoken++
        } else {
          expect(readOf(g), `seed ${seed} year ${g.year}`).toBeNull()
          expect(signalsOf(g)).toEqual([])
          quiet++
        }
      }
    }
    expect(quiet).toBeGreaterThan(40)
    expect(spoken).toBeGreaterThan(10)
  })
})

describe('ranking', () => {
  it('lists the strongest first and keeps the order wave, shock, tilt on a tie', () => {
    const g = calm()
    fake.wave = 'Frontier AI wave moved Semiconductors stocks up 4%.'
    shockOn(g, 'ban', 0.45)
    const kinds = signalsOf(g).map((s) => `${s.kind}${s.strength}`)
    expect(kinds.slice(0, 2)).toEqual(['shock3', 'wave1'])
    expect(readOf(g)).toMatch(/government ban/i)
    fake.wave = 'Frontier AI wave moved Semiconductors stocks up 40%.'
    expect(signalsOf(g).slice(0, 2).map((s) => s.kind)).toEqual(['wave', 'shock'])
    const sorted = signalsOf(g)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1].strength).toBeGreaterThanOrEqual(sorted[i].strength)
  })

  it('every signal carries a year that is not after g.year', () => {
    const g = calm()
    fake.wave = 'Frontier AI wave moved Semiconductors stocks up 12%.'
    shockOn(g, 'policy', 0.6)
    for (const s of signalsOf(g)) expect(s.year).toBeLessThanOrEqual(g.year)
  })
})

describe('a shut exchange has no market to read', () => {
  it('returns nothing in a year of history when the exchange is closed or not yet open, even with a wave and a shock', () => {
    const found: { country: string; year: number }[] = []
    for (const c of COUNTRIES.map((x) => x.id)) {
      for (const y of [1915, 1925, 1940, 1944, 1945, 1950, 1960, 1975, 1990]) {
        if (exchangeStatus(exchangeInfo(c), y) !== 'open') found.push({ country: c, year: y })
      }
    }
    expect(found.length).toBeGreaterThan(5)
    for (const { country, year } of found.slice(0, 12)) {
      const g = makeTestGame(2, { age: 30, money: 1_000_000, countryId: country })
      g.lifeId = `shut-${country}`
      g.year = year
      fake.wave = 'Frontier AI wave moved Semiconductors stocks up 40%.'
      shockOn(g, 'ban', 0.4)
      expect(signalsOf(g), `${country} ${year}`).toEqual([])
      expect(readOf(g), `${country} ${year}`).toBeNull()
    }
  })
})

describe('the line', () => {
  /** Every wording the file can print: each kind, each strength, the longest label of each. */
  function lineOfKind(g: GameState, kind: MarketSignal['kind'], strength: 1 | 2 | 3): string | null {
    fake.wave = null
    g.flags.marketShocks = J([])
    if (kind === 'wave') fake.wave = `Frontier AI wave moved Semiconductors stocks up ${[3, 6, 10][strength - 1]}%.`
    if (kind === 'shock') shockOn(g, 'nationalize', 1 - [0.15, 0.3, 0.5][strength - 1] - 1e-6)
    return readOf(g)
  }

  it('fits in 110 characters for every cause, strength and label up to 21 characters', () => {
    const longest = 'Frontier AI wave'
    for (const cause of SHOCK_CAUSES) {
      for (const mult of [0.8, 0.6, 0.4, 1.2, 1.4, 1.6]) {
        const g = life(5)
        shockOn(g, cause, mult)
        const read = readOf(g)
        if (cause === 'liquidity') continue
        expect(read, `${cause} ${mult}`).not.toBeNull()
        expect(read!.length, `${cause} ${mult}: ${read}`).toBeLessThanOrEqual(READ_MAX)
      }
    }
    for (const name of [longest, 'Smartphones wave', 'Quantum computing wave', 'Electric vehicles wave']) {
      fake.wave = `${name.replace(/ wave$/, '')} wave moved Semiconductors stocks up 40%.`
      for (let seed = 1; seed <= 30; seed++) {
        const read = readOf(life(seed))
        expect(read!.length, `${name} seed ${seed}: ${read}`).toBeLessThanOrEqual(READ_MAX)
        expect(read).toContain(name)
      }
    }
  })

  it('drops a wave whose name is too long for any wording and falls back to the next signal', () => {
    const g = calm()
    fake.wave = `${'Extraordinarily elaborate '.repeat(3)}wave moved Semiconductors stocks up 40%.`
    const read = readOf(g)
    expect(read === null || read.length <= READ_MAX).toBe(true)
    expect(read ?? '').not.toContain('Extraordinarily')
    shockOn(g, 'policy', 0.5)
    expect(readOf(g)).toMatch(/new law/)
  })

  it('hedges every line with a confidence by strength and the words "Worth watching, nothing more."', () => {
    for (const kind of ['wave', 'shock'] as const) {
      for (const strength of [1, 2, 3] as const) {
        const line = lineOfKind(calm(), kind, strength)!
        expect(line, `${kind} ${strength}`).toMatch(READ)
        expect(line.endsWith(` ${CONFIDENCE[strength - 1]} ${HEDGE}`), line).toBe(true)
      }
    }
  })

  it('has three wordings of each kind and picks one by a hash of life, year and kind', { timeout: 120_000 }, () => {
    const bodies = (read: string) => read.replace(/^🧭 /, '').replace(/ (Low|Some) confidence\. .*$/, '').replace(/ Fairly confident\. .*$/, '')
    const forKind = (make: (g: GameState) => void): Set<string> => {
      const out = new Set<string>()
      for (let seed = 1; seed <= 60; seed++) {
        const g = life(seed)
        make(g)
        const a = readOf(g)!
        out.add(bodies(a).replace('Frontier AI wave', 'W').replace(/government ban/i, 'C'))
        // the same life and year give the same wording every time
        expect(readOf(g)).toBe(a)
      }
      return out
    }
    expect(forKind(() => { fake.wave = 'Frontier AI wave moved Semiconductors stocks up 9%.' }).size).toBe(3)
    fake.wave = null
    expect(forKind((g) => { shockOn(g, 'ban', 0.5) }).size).toBe(3)
    fake.wave = undefined
    const tilts = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const g = life(seed, 2027)
      for (let i = 0; i < 12; i++, g.year += 3, g.character.age += 3) {
        const read = readOf(g)
        if (read) tilts.add(bodies(read))
      }
    }
    expect(tilts.size).toBe(3)
  })

  it('holds no NaN, no dash, no company name and no word of direction, across lives and years', { timeout: 120_000 }, () => {
    let lines = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = life(seed, 2027)
      for (let i = 0; i < 12; i++, g.year += 3, g.character.age += 3) {
        if (i % 4 === 0) shockOn(g, SHOCK_CAUSES[(seed + i) % 7], 0.5 + ((seed + i) % 3) * 0.4)
        const read = readOf(g)
        if (!read) continue
        lines++
        expect(read, `seed ${seed} year ${g.year}`).toMatch(READ)
        expect(read.length).toBeLessThanOrEqual(READ_MAX)
        expect(read).not.toMatch(/NaN|undefined|Infinity|\[object/)
        expect(read).not.toMatch(DASHES)
        expect(read).not.toMatch(DIRECTION)
        expect(read).toContain(HEDGE)
        const info = infoOf(g)
        for (const s of exchangeYear(famOf(g), anchorOf(g), info, g.year).stocks) {
          expect(read, `${read} names a company`).not.toContain(eraIdentity(companyDef(info, s.slot, s.gen), g.year).name)
        }
      }
    }
    expect(lines).toBeGreaterThan(60)
  })
})

describe('purity', () => {
  it('draws no number, writes nothing and gives the same text every time, on a deep-frozen state', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const g = life(seed)
      put(g, SMART({ year: YEAR }), CHIPS())
      shockOn(g, 'policy', 0.55)
      const before = JSON.stringify(g)
      const rng = g.rng
      deepFreeze(g)
      const first = readOf(g)
      const signals = signalsOf(g)
      expect(first).not.toBeNull()
      expect(readOf(g)).toBe(first)
      expect(signalsOf(g)).toEqual(signals)
      expect(g.rng).toBe(rng)
      expect(JSON.stringify(g)).toBe(before)
    }
  })

  it('opens the same news twice with the same lines and leaves the state alone', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const g = life(seed)
      shockOn(g, 'contract', 1.4)
      const before = JSON.stringify(g)
      const first = newsLines(g)
      expect(newsLines(g)).toEqual(first)
      expect(g.rng).toBe(seed)
      expect(JSON.stringify(g)).toBe(before)
    }
  })

  it('asks no market year after g.year, over 40 lives by 12 years', { timeout: 120_000 }, () => {
    let reads = 0
    let worst = -Infinity
    for (let seed = 1; seed <= 40; seed++) {
      const g = life(seed, 2027)
      for (let i = 0; i < 12; i++, g.year += 3, g.character.age += 3) {
        asked.years.length = 0
        marketSignals(g, infoOf(g))
        readOf(g)
        reads++
        expect(asked.years.length, `seed ${seed} year ${g.year} asked for nothing`).toBeGreaterThan(0)
        for (const y of asked.years) worst = Math.max(worst, y - g.year)
      }
    }
    expect(reads).toBe(480)
    expect(worst).toBeLessThanOrEqual(0)
  })

  it('imports neither the gut nor a draw: the file is a reader of the present', () => {
    const text = readFileSync(fileURLToPath(new URL('../src/game/invest/signals.ts', import.meta.url)), 'utf8')
    const imports = [...text.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports.length).toBeGreaterThan(3)
    for (const from of imports) expect(from, from).not.toMatch(/instinct|\/rng$|^\.\.\/core$/)
    expect(text).not.toMatch(/g\.rng|Math\.random/)
    expect(text).not.toMatch(DASHES)
  })
})

describe('in the Financial News', () => {
  it('adds the read after the free tip and before the gut, once, and nothing when the year gives no signal', () => {
    const g = life(3, 2027, { talent: true })
    fake.wave = 'Frontier AI wave moved Semiconductors stocks up 9%.'
    const lines = newsLines(g)
    expect(lines.filter((t) => READ.test(t))).toHaveLength(1)
    const read = lines.findIndex((t) => READ.test(t))
    const gut = lines.findIndex((t) => GUT.test(t))
    const tip = lines.findIndex((t) => TIP.test(t))
    expect(tip).toBeGreaterThanOrEqual(0)
    expect(gut).toBeGreaterThan(read)
    expect(read).toBe(tip + 1)
    expect(gut).toBe(read + 1)
    expect(lines[read]).toBe(readOf(g))
    fake.wave = null
    let quiet = 0
    for (let seed = 1; seed <= 30; seed++) {
      const q = life(seed, 2027)
      if (readOf(q) === null) {
        expect(newsLines(q).some((t) => READ.test(t))).toBe(false)
        quiet++
      }
    }
    expect(quiet).toBeGreaterThan(5)
  })

  it('leaves the tip and the gut as they were: the line has its own mark and no tip wording', () => {
    const g = life(3, 2027, { talent: true })
    fake.wave = 'Frontier AI wave moved Semiconductors stocks up 9%.'
    const lines = newsLines(g)
    expect(lines.filter((t) => TIP.test(t)).length).toBeLessThanOrEqual(1)
    expect(lines.filter((t) => GUT.test(t))).toHaveLength(1)
    expect(lines.find((t) => READ.test(t))).not.toMatch(/bullish|cautious|rates|cuts/)
  })

  it('is the same real wave the news already reports, not a second source', () => {
    const g = life(7)
    put(g, SMART({ year: YEAR }), CHIPS())
    const lines = newsLines(g)
    const news = lines.find((t) => / wave moved .+ stocks (up|down) \d+%\.$/.test(t))!
    expect(news).toMatch(/^Chip leap wave moved/)
    expect(lines.find((t) => READ.test(t))).toContain('Chip leap wave')
  })
})
