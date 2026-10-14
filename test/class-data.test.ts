// The share classes real companies had, by year (invest/class-data.ts), and how the Stocks screen shows
// them. The table is data; these tests pin its shape (every entry names a registry stock and every
// year sits inside the company's trading years) and the sentences built from it.
import { describe, expect, it } from 'vitest'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { exchangeInfo, slotPlan } from '../src/game/invest/engine'
import { CLASS_ENTRIES, classEntryFor, classFacts, classRowsIn, votesText, type ClassRow } from '../src/game/invest/class-data'
import { allRealCos } from '../src/game/invest/real'
import { investmentListing, investmentsMenu } from '../src/game/investments'
import type { GameState, MenuGroup, MenuNode } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const ALPHABET = 'stock-us-alphabet'

function resident(countryId: string, year: number, seed = 9): GameState {
  const g = makeTestGame(seed, { age: 30, money: 5_000_000, countryId, residence: { status: 'renting', rent: 0 } })
  g.lifeId = `class-data-${countryId}-${seed}-${year}`
  g.year = year
  g.log = [{ age: 30, year, entries: [] }]
  return g
}

function textOf(n: MenuNode, g: GameState): string {
  return n.type === 'info' ? (typeof n.text === 'string' ? n.text : n.text(g)) : ''
}

function stocksOf(g: GameState): MenuGroup {
  return investmentsMenu.children(g).find((n) => n.id === 'inv-stocks') as MenuGroup
}

function offerFor(g: GameState, name: string): MenuGroup {
  const q = investmentListing(g).find((x) => x.type === 'stock' && x.name === name)
  if (!q) throw new Error(`no listing for ${name}`)
  const node = stocksOf(g).children(g).find((n) => n.id === `inv-offer-${q.secId}`)
  if (!node || node.type !== 'menu') throw new Error(`no offer node for ${name}`)
  return node
}

function infoLines(node: MenuGroup, g: GameState): string[] {
  return node.children(g).filter((n) => n.type === 'info').map((n) => textOf(n, g))
}

describe('classes of real companies', () => {
  const cos = allRealCos()
  const byId = new Map(cos.map((c) => [c.id, c]))

  it('every entry names a registry stock', () => {
    const seen = new Set<string>()
    for (const e of CLASS_ENTRIES) {
      expect(byId.has(e.id), e.id).toBe(true)
      expect(seen.has(e.id), `${e.id} appears twice`).toBe(false)
      seen.add(e.id)
    }
  })

  it("every year sits inside the company's trading years", () => {
    for (const e of CLASS_ENTRIES) {
      const co = byId.get(e.id)!
      for (const r of e.rows) {
        expect(Number.isInteger(r.from), `${e.id} ${r.letter} from`).toBe(true)
        expect(r.from, `${e.id} ${r.letter} starts after the listing`).toBeGreaterThanOrEqual(co.start)
        expect(r.from, `${e.id} ${r.letter} from <= to`).toBeLessThanOrEqual(r.to ?? r.from)
        if (r.to !== undefined) expect(r.to, `${e.id} ${r.letter} ends with the company`).toBeLessThanOrEqual(co.end ?? 9999)
      }
    }
  })

  it("letters are one capital letter, unique per company, and not the main line's", () => {
    for (const e of CLASS_ENTRIES) {
      const letters = e.rows.map((r) => r.letter)
      expect(new Set(letters).size, `${e.id} repeats a letter`).toBe(letters.length)
      for (const r of e.rows) {
        expect(r.letter, `${e.id} letter`).toMatch(/^[A-Z]$/)
        expect(e.main.label.endsWith(r.letter), `${e.id}: the main line is ${e.main.label}, a row ${r.letter}`).toBe(false)
        expect(r.label.trim().length, `${e.id} ${r.letter} label`).toBeGreaterThan(0)
      }
    }
  })

  it('votes are finite and not negative; a listed row has a numeric vote', () => {
    for (const e of CLASS_ENTRIES) {
      expect(Number.isFinite(e.main.votes) && e.main.votes >= 0, `${e.id} main`).toBe(true)
      for (const r of e.rows) {
        expect(Number.isFinite(r.votes) && r.votes >= 0, `${e.id} ${r.letter}`).toBe(true)
        if (r.listed) expect(typeof r.votes, `${e.id} ${r.letter} listed`).toBe('number')
      }
    }
  })

  it('the batch is the size this build can source', () => {
    // 21 companies and 12 listed extra classes. Left out for want of a dated public source: Maersk.
    // Kone's Class A is not listed (only Class B trades), which the plan had as listed.
    expect(CLASS_ENTRIES.length).toBe(21)
    expect(CLASS_ENTRIES.flatMap((e) => e.rows).filter((r) => r.listed).length).toBe(12)
    expect(CLASS_ENTRIES.some((e) => e.id === 'stock-dk-maersk')).toBe(false)
  })

  it("H&M's registry id is the real one", () => {
    // The plan wrote stock-se-h-and-m; the registry slug of 'H&M' has no hyphens.
    expect(classEntryFor({ id: 'stock-se-handm' })).toBeDefined()
    expect(classEntryFor({ id: 'stock-se-h-and-m' })).toBeUndefined()
  })

  it('a row never claims a share class twice in one year', () => {
    for (const e of CLASS_ENTRIES) {
      for (let y = 1900; y <= 2040; y += 1) {
        const letters = classRowsIn({ id: e.id }, y).map((r) => r.letter)
        expect(new Set(letters).size, `${e.id} ${y}`).toBe(letters.length)
      }
    }
  })

  it('classEntryFor and classRowsIn read the table and survive hostile input', () => {
    expect(classEntryFor({ id: ALPHABET })?.main.label).toBe('Class A')
    expect(classEntryFor({ id: 'stock-us-apple' })).toBeUndefined()
    expect(classEntryFor({ id: '' })).toBeUndefined()
    expect(classRowsIn({ id: 'stock-us-apple' }, 2020)).toEqual([])
    expect(classRowsIn({ id: ALPHABET }, Number.NaN)).toEqual([])
    expect(classRowsIn({ id: ALPHABET }, 2003)).toEqual([])
    expect(classRowsIn({ id: ALPHABET }, 2010).map((r) => r.letter)).toEqual(['B'])
    expect(classRowsIn({ id: ALPHABET }, 2014).map((r) => r.letter)).toEqual(['B', 'C'])
    // The row ends with its last year, and not before it.
    expect(classRowsIn({ id: 'stock-in-tata-motors' }, 2024).map((r) => r.letter)).toEqual(['D'])
    expect(classRowsIn({ id: 'stock-in-tata-motors' }, 2025)).toEqual([])
    expect(classRowsIn({ id: 'stock-in-tata-motors' }, 2007)).toEqual([])
    expect(classRowsIn({ id: 'stock-in-tata-motors' }, 2008).length).toBe(1)
  })

  it('votesText', () => {
    expect(votesText(0)).toBe('no vote')
    expect(votesText(1)).toBe('1 vote a share')
    expect(votesText(10)).toBe('10 votes a share')
    expect(votesText(0.1)).toBe('a tenth of a vote a share')
    expect(votesText(0.15)).toBe('0.15 of a vote a share')
    expect(votesText(50)).toBe('50 votes a share')
    // Hostile numbers never print NaN, Infinity or a minus sign.
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -3]) expect(votesText(v), String(v)).toBe('no vote')
  })

  it('classFacts follows the year', () => {
    const co = (id: string) => ({ id })
    // Alphabet: Class B from the 2004 listing, Class C from 2014.
    expect(classFacts(co(ALPHABET), 2003)).toBeNull()
    const a2010 = classFacts(co(ALPHABET), 2010)!
    expect(a2010).toMatch(/^Share classes: Class A \(this line\) has 1 vote a share\./)
    expect(a2010).toMatch(/Class B has 10 votes a share, held by the founders\./)
    expect(a2010).not.toMatch(/Class C/)
    const a2020 = classFacts(co(ALPHABET), 2020)!
    expect(a2020).toMatch(/Class B/)
    expect(a2020).toMatch(/Class C has no vote and is listed too\./)
    // Meta lists in 2012.
    expect(classFacts(co('stock-us-meta-platforms'), 2011)).toBeNull()
    expect(classFacts(co('stock-us-meta-platforms'), 2020)).toMatch(/Class B has 10 votes a share/)
    // Berkshire's Class B arrives in 1996 and is listed.
    expect(classFacts(co('stock-us-berkshire-hathaway'), 1995)).toBeNull()
    const b2000 = classFacts(co('stock-us-berkshire-hathaway'), 2000)!
    expect(b2000).toMatch(/Class B/)
    expect(b2000).toMatch(/listed too/)
    // Ford's sentence is its own note, word for word.
    expect(classFacts(co('stock-us-ford-motor-company'), 2000)).toBe('Share classes: Common (this line) has 1 vote a share. Class B, held by the Ford family, carries 40% of the votes.')
    expect(classFacts(co('stock-us-ford-motor-company'), 1955)).toBeNull()
    // Richemont's note.
    expect(classFacts(co('stock-ch-richemont'), 2010)).toMatch(/Class B, held by the Rupert family, carries half the votes with a tenth of the capital\.$/)
    // A class that ended says nothing after its last year.
    expect(classFacts(co('stock-in-tata-motors'), 2024)).toMatch(/DVR has a tenth of a vote a share and is listed too\./)
    expect(classFacts(co('stock-in-tata-motors'), 2025)).toBeNull()
    expect(classFacts(co('stock-de-bmw'), 2026)).toMatch(/Preference has no vote and is listed too\./)
    expect(classFacts(co('stock-de-bmw'), 2027)).toBeNull()
    // The main line can be the one without a vote.
    expect(classFacts(co('stock-ca-rogers-communications'), 2010)).toMatch(/^Share classes: Class B \(this line\) has no vote\. Class A has 50 votes a share and is listed too\.$/)
    // A listed company with no entry, and junk, give nothing.
    expect(classFacts(co('stock-us-apple'), 2020)).toBeNull()
    expect(classFacts(co(''), 2020)).toBeNull()
    expect(classFacts(co(ALPHABET), Number.NaN)).toBeNull()
  })

  it('every sentence is short enough for a line on the screen and follows the voice', () => {
    for (const e of CLASS_ENTRIES) {
      for (let y = 1900; y <= 2030; y++) {
        const text = classFacts({ id: e.id }, y)
        if (!text) continue
        expect(text, `${e.id} ${y}`).not.toMatch(/—|undefined|NaN|null/)
        expect(text.length, `${e.id} ${y}`).toBeLessThanOrEqual(240)
      }
    }
  })

  it('the table does not change when it is read', () => {
    const before = JSON.stringify(CLASS_ENTRIES)
    const rows: ClassRow[] = classRowsIn({ id: ALPHABET }, 2020)
    rows.push(rows[0])
    classFacts({ id: ALPHABET }, 2020)
    expect(JSON.stringify(CLASS_ENTRIES)).toBe(before)
    expect(PRESENT_YEAR).toBeGreaterThan(2000)
  })
})

describe('the Stocks screen shows the classes', () => {
  it("Alphabet's screen starts its classes line with the main line", () => {
    const g = resident('us', 2020)
    const lines = infoLines(offerFor(g, 'Alphabet'), g)
    expect(lines.some((t) => t.startsWith('Share classes: Class A (this line) has 1 vote a share.'))).toBe(true)
    expect(lines.join('\n')).toMatch(/Class C has no vote and is listed too\./)
  })

  it('a company with no entry has no classes line', () => {
    const g = resident('us', 2020)
    const lines = infoLines(offerFor(g, 'Apple'), g)
    expect(lines.some((t) => t.startsWith('Share classes:'))).toBe(false)
  })

  it('the classes line follows the year', () => {
    const g = resident('us', 2010)
    const lines = infoLines(offerFor(g, 'Google'), g)
    const text = lines.find((t) => t.startsWith('Share classes:'))!
    expect(text).toMatch(/Class B has 10 votes a share/)
    expect(text).not.toMatch(/Class C/)
  })

  it('the offer list is the same size as the slot plan', () => {
    const g = resident('us', 2020)
    const offers = stocksOf(g).children(g).filter((n) => n.type === 'menu' && n.id.startsWith('inv-offer-'))
    expect(offers.length).toBe(slotPlan(exchangeInfo('us')).length)
  })

  it('renders from a frozen state without changing it', () => {
    const g = resident('us', 2020)
    const snapshot = JSON.stringify(g)
    deepFreeze(g)
    const lines = infoLines(offerFor(g, 'Alphabet'), g)
    expect(lines.some((t) => t.startsWith('Share classes:'))).toBe(true)
    expect(JSON.stringify(g)).toBe(snapshot)
  })

  it('reading the screen does not draw from the random stream', () => {
    const g = resident('us', 2020)
    const rng = g.rng
    infoLines(offerFor(g, 'Alphabet'), g)
    expect(g.rng).toBe(rng)
  })
})
