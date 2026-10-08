// The late era packs (events/era-pack-1980*.ts and era-pack-2000*.ts): flavor pools and popups for
// 1980-2026. Structural checks only here (valid era tags, untagged fallbacks that survive the
// anachronism lint in every country, known tokens, no real people, no forbidden brands, popup ids);
// the lived-through-the-decades checks are in era-late-lives.test.ts.
import { describe, expect, it } from 'vitest'
import { anachronismsIn, eraOk, eraTags } from '../src/game/events/era'
import { ERA_PACKS, type EraFlavorPool } from '../src/game/events/era-life'
import { createPerson } from '../src/game/people'
import { TECH } from '../src/game/history/timeline'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

const LATE_PACKS = ERA_PACKS.filter((p) => p.from >= 1980)
const KNOWN_GATES = new Set(['landline', 'texting', 'flights', 'cars', ...Object.keys(TECH)])
const KNOWN_TOKENS = new Set(['mom', 'dad', 'sib', 'sibRel', 'friend', 'partner', 'pet', 'petSpecies', 'kid', 'kidRel', 'adultKid', 'adultKidRel', 'grandkid', 'cellmate', 'school', 'company', 'city', 'country', 'food', 'show', 'radioShow', 'kidPrize', 'movieKind', 'hobby', 'textbookPrice', 'valetTip'])
const SAMPLE_COUNTRIES = ['us', 'gb', 'de', 'jp', 'kr', 'cn', 'in', 'id', 'br', 'mx', 'ng', 'ke', 'za', 'eg', 'tr', 'au', 'ru', 'ph', 'ar', 'sa', 'cd']

function stateFor(year: number, age: number, countryId: string, family = false): GameState {
  const g = makeTestGame(7, { countryId, birthCountryId: countryId, age })
  g.year = year
  if (family) {
    g.people.push(
      createPerson(g, { relation: 'partner', age: Math.max(18, age), firstName: 'Sam', lastName: 'Lee' }),
      createPerson(g, { relation: 'child', age: 6, firstName: 'Kit', lastName: 'Lee' }),
    )
  }
  return g
}

function gateOk(gate: string): boolean {
  if (/^-?\d{4}$/.test(gate)) return true
  const id = gate.replace(/^(own:|[!+])/, '')
  return KNOWN_GATES.has(id)
}

function poolSpan(pack: { from: number; to: number }, pool: EraFlavorPool): [number, number] {
  return [pool.from ?? pack.from, pool.to ?? pack.to]
}

const FORBIDDEN = [
  // Real tobacco, vape, firearm and gambling-operator brands never appear.
  /\bMarlboro\b|\bCamel\b|\bJuul\b|\bWinston\b|\bBenson\b|\bLucky Strike\b|\bGlock\b|\bRemington\b|\bSmith & Wesson\b|\bBet365\b|\bDraftKings\b|\bFanDuel\b|\bPokerStars\b|\bWilliam Hill\b|\bLadbrokes\b/i,
  // A short list of real people the library must never name (founders, celebrities, leaders).
  /\b(Michael Jackson|Madonna|Prince|Steve Jobs|Bill Gates|Mark Zuckerberg|Elon Musk|Jeff Bezos|Taylor Swift|Beyonc|Britney|Eminem|Oprah|Trump|Obama|Reagan|Thatcher|Mandela|Diana|Tupac|Kurt Cobain|Jordan|Maradona|Pel[eé]\b|Xuxa|Mr\.? Rogers|Jane Fonda|Hulk Hogan|Spielberg|Lucas)\b/,
]

describe('late era packs', () => {
  it('registers a pack for 1980-1999 and one for 2000-2026', () => {
    expect(LATE_PACKS.map((p) => [p.from, p.to])).toEqual([
      [1980, 1999],
      [2000, 2026],
    ])
  })

  it('uses only valid era tags, known tokens and clean text in every flavor line', () => {
    const problems: string[] = []
    for (const pack of LATE_PACKS) {
      const keys = new Set<string>()
      for (const pool of pack.flavor) {
        if (keys.has(pool.key)) problems.push(`duplicate pool key ${pool.key}`)
        keys.add(pool.key)
        const [a, b] = poolSpan(pack, pool)
        if (a < pack.from || b > pack.to || a > b) problems.push(`${pool.key}: span ${a}-${b} outside the pack`)
        if (!(pool.weight > 0 && pool.weight <= 12)) problems.push(`${pool.key}: weight ${pool.weight}`)
        const seen = new Set<string>()
        for (const line of pool.lines) {
          if (seen.has(line)) problems.push(`${pool.key}: duplicate line "${line.slice(0, 50)}"`)
          seen.add(line)
          for (const t of eraTags(line)) if (!gateOk(t)) problems.push(`${pool.key}: bad tag "${t}" in "${line.slice(0, 60)}"`)
          if (/^@/.test(line) && eraTags(line).length === 0) problems.push(`${pool.key}: malformed tag in "${line.slice(0, 60)}"`)
          const body = line.replace(/^@[\w!+,-]+\s+/, '')
          if (/^[a-z]/.test(body)) problems.push(`${pool.key}: lowercase start "${body.slice(0, 50)}"`)
          if (!/[.!?"]$/.test(body)) problems.push(`${pool.key}: no final punctuation "${body.slice(-40)}"`)
          if (/\s{2}|\bundefined\b|\bNaN\b|\[object/.test(body)) problems.push(`${pool.key}: stray text in "${body.slice(0, 60)}"`)
          for (const m of body.matchAll(/\{(\w+)\}/g)) if (!KNOWN_TOKENS.has(m[1])) problems.push(`${pool.key}: unknown token {${m[1]}}`)
          if (body.length > 260) problems.push(`${pool.key}: too long (${body.length}) "${body.slice(0, 40)}"`)
          for (const re of FORBIDDEN) if (re.test(body)) problems.push(`${pool.key}: forbidden name in "${body.slice(0, 80)}"`)
        }
      }
    }
    expect(problems.slice(0, 40)).toEqual([])
  })

  it('keeps enough untagged-or-valid lines in every pool for every year, age and country it applies to', () => {
    // pool key -> worst usable count and where it happens
    const worst = new Map<string, { n: number; at: string; years: Set<number> }>()
    const never: string[] = []
    for (const pack of LATE_PACKS) {
      for (const pool of pack.flavor) {
        const [from, to] = poolSpan(pack, pool)
        const lo = pool.minAge ?? 0
        const hi = Math.min(pool.maxAge ?? 100, 100)
        const ages = [...new Set([lo, Math.round((lo + hi) / 2), hi])]
        let active = 0
        const years: number[] = []
        for (let year = from; year <= to; year += year + 3 > to ? 1 : 3) years.push(year)
        for (const year of years) {
          for (const country of SAMPLE_COUNTRIES) {
            for (const age of ages) {
              const mk = (family = false): GameState => {
                const st = stateFor(year, age, country, family)
                // A pool split out for households that own a technology is read as one that does.
                const own = /~own\.(\w+)$/.exec(pool.key)
                if (own) st.flags[`own.${own[1]}`] = true
                return st
              }
              let g = mk()
              if (pool.when && !pool.when(g)) g = mk(true)
              if (pool.when && !pool.when(g)) continue
              active++
              const ok = pool.lines.filter((l) => eraOk(g, l) && anachronismsIn(l.replace(/^@[\w!+,-]+\s+/, '').replace(/\{\w+\}/g, 'Sam'), year, [country]).length === 0)
              if (ok.length < (pool.key.includes('~own.') ? 1 : 3)) {
                const w = worst.get(pool.key) ?? { n: 99, at: '', years: new Set<number>() }
                w.years.add(year)
                if (ok.length < w.n) {
                  w.n = ok.length
                  w.at = `${year} ${country} age ${age}`
                }
                worst.set(pool.key, w)
              }
            }
          }
        }
        if (active === 0) never.push(pool.key)
      }
    }
    const report = [...worst.entries()].map(([k, w]) => `${k}: worst ${w.n} usable at ${w.at}; short in years ${[...w.years].sort().join(',')}`)
    expect([...report, ...never.map((k) => `${k}: never active`)]).toEqual([])
  }, 60_000)

  it('splits household-ownership lines into owner pools and leaves no raw own: tag behind', () => {
    const pools = LATE_PACKS.flatMap((p) => p.flavor)
    const owner = pools.filter((p) => p.key.includes('~own.'))
    expect(owner.length).toBeGreaterThan(30)
    for (const p of pools) for (const l of p.lines) expect(l, p.key).not.toMatch(/@[^ ]*own:/)
    for (const p of owner) {
      expect(p.when, p.key).toBeTypeOf('function')
      for (const l of p.lines) expect(l, p.key).toMatch(/^@[^ ]*\+(homeComputer|internet|mobilePhone|smartphone|videoGameConsole|streaming|socialMedia)/)
    }
    // A household with no computer never draws from the computer pools; one with a computer can.
    const g = stateFor(1997, 15, 'us')
    g.flags['own.homeComputer'] = false
    expect(owner.filter((p) => p.key.endsWith('~own.homeComputer')).some((p) => p.when!(g))).toBe(false)
    g.flags['own.homeComputer'] = true
    expect(owner.filter((p) => p.key.endsWith('~own.homeComputer')).some((p) => p.when!(g))).toBe(true)
  })

  it('bounds every line about a dated object to the years it belonged to', () => {
    const DATED = /\b(cassette|pager|beeper|dial-up|floppy|VCR|Walkman|Discman|CD-ROM|camcorder|answering machine|typewriter|dot-matrix|fax machine|payphone|pay phone|phone booth|record store|video store|video rental|rolled up)\b|mixtape|boombox/i
    const MODERN = /\b(smartphones?|apps?|streaming|chatbots?|selfies?|social media|influencers?|short-video|group chat|AI|emoji|hotspot|Wi-Fi|TikTok|Instagram|Snapchat|podcasts?)\b/
    const problems: string[] = []
    for (const pack of LATE_PACKS) {
      for (const pool of pack.flavor) {
        for (const line of pool.lines) {
          const tags = eraTags(line)
          const body = line.replace(/^@[\w!+,-]+\s+/, '')
          const bounded = tags.some((t) => /^-\d{4}$/.test(t)) || tags.some((t) => /^\d{4}$/.test(t) && Number(t) > pack.from + 10)
          const gated = tags.some((t) => !/^-?\d{4}$/.test(t))
          if (DATED.test(body) && pack.from >= 2000 && !bounded) problems.push(`${pool.key}: dated object without an end year: "${body.slice(0, 70)}"`)
          if (MODERN.test(body) && pack.from < 2000) problems.push(`${pool.key}: modern word in the nineties pack: "${body.slice(0, 70)}"`)
          if (MODERN.test(body) && pack.from >= 2000 && !gated && !tags.some((t) => /^\d{4}$/.test(t) && Number(t) >= 2004)) problems.push(`${pool.key}: modern word without a gate: "${body.slice(0, 70)}"`)
        }
      }
    }
    expect(problems.slice(0, 30)).toEqual([])
  })

  it('has serious volume of flavor lines', () => {
    for (const pack of LATE_PACKS) {
      const lines = pack.flavor.reduce((n, p) => n + p.lines.length, 0)
      expect(lines, `pack ${pack.from}`).toBeGreaterThanOrEqual(600)
      expect(pack.flavor.length, `pools ${pack.from}`).toBeGreaterThanOrEqual(40)
    }
  })

  it('ships popup events with unique era. ids', () => {
    const ids = new Set<string>()
    for (const pack of LATE_PACKS) {
      expect(pack.events.length, `events ${pack.from}`).toBeGreaterThanOrEqual(25)
      for (const ev of pack.events) {
        expect(ev.id.startsWith('era.'), ev.id).toBe(true)
        expect(ids.has(ev.id), `duplicate ${ev.id}`).toBe(false)
        ids.add(ev.id)
        expect(ev.minAge).toBeLessThanOrEqual(ev.maxAge)
        expect(Object.keys(ev.resolve).length).toBeGreaterThanOrEqual(2)
      }
    }
  })
})
