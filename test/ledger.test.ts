// ci: fast
// R2-L2 (A.K1 a): the ledger core. Every dollar that moves is an entry between two accounts, so the books cannot drift from the
// cash: the sum of the accounts is what the declared mints created less what the declared burns destroyed, each year's flows net to
// zero per reason, and a hostile or garbage save can never make the ledger unbounded or unbalanced. The wrappers that call it
// arrive in R2-L3; here every booking is made directly.
import { describe, expect, it } from 'vitest'
import { isRef, parseRef } from '../src/game/kernel/ids'
import {
  ACCT_CLASSES,
  LEDGER_CAPS,
  acctBalance,
  book,
  bookAcct,
  bookBurn,
  bookMint,
  bookPlayer,
  checkLedger,
  flowsOf,
  foldAccount,
  ledgerProblems,
  ledgerRoot,
  mintRoom,
  normalizeLedger,
  peekLedger,
  playerAcct,
  roomFor,
  tokenSeen,
  type AcctRef,
} from '../src/game/kernel/ledger'
import type { LedgerShard } from '../src/game/kernel/ledger-types'
import { BURNS, MINTS, POOLS, REASON_GROUPS, REASONS, counterparty, type Reason } from '../src/game/kernel/reasons'
import { SPREADS, ask, bid } from '../src/game/kernel/spreads'
import type { GameState } from '../src/game/types'
import '../src/game/world/shards'
import { ensureWorld, normalizeWorld, registerShard, worldShard } from '../src/game/world/state'
import { makeTestGame } from './helpers'

/** A small seeded generator for the tests (never g.rng). */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) freeze(x)
  }
  return v
}

const sumA = (g: GameState): number => Object.values(peekLedger(g).a).reduce((x, y) => x + y, 0)
const sumOf = (r: Record<string, number>): number => Object.values(r).reduce((x, y) => x + y, 0)
const cast = <T>(x: unknown): T => x as T
const setWorld = (g: GameState, v: unknown): void => {
  ;(g as { world?: unknown }).world = v
}
const rowOf = (g: GameState, reason: Reason, country = 'us', year = g.year) => flowsOf(g, year).find((r) => r.reason === reason && r.country === country)

describe('double entry', () => {
  it('keeps the sum of the accounts at zero and deletes an account that returns to zero', () => {
    const g = makeTestGame()
    expect(book(g, 'wage', 'pool:employers', 'person:a', 1000)).toBe(1000)
    expect(book(g, 'purchase', 'person:a', 'pool:retail', 400)).toBe(400)
    expect(book(g, 'tax.income', 'person:a', 'gov:us', 100)).toBe(100)
    expect(sumA(g)).toBe(0)
    expect(acctBalance(g, 'person:a')).toBe(500)
    expect(acctBalance(g, 'pool:employers')).toBe(-1000)
    expect(acctBalance(g, 'pool:retail')).toBe(400)
    expect(acctBalance(g, 'gov:us')).toBe(100)
    expect(book(g, 'purchase', 'person:a', 'pool:retail', 500)).toBe(500)
    expect(Object.keys(peekLedger(g).a).sort()).toEqual(['gov:us', 'pool:employers', 'pool:retail'])
    expect(acctBalance(g, 'person:a')).toBe(0)
    expect(peekLedger(g).k).toBe(4)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('rounds an amount to whole dollars and returns what it booked', () => {
    const g = makeTestGame()
    expect(book(g, 'wage', 'pool:employers', 'person:a', 10.4)).toBe(10)
    expect(book(g, 'wage', 'pool:employers', 'person:a', 10.6)).toBe(11)
    expect(acctBalance(g, 'person:a')).toBe(21)
  })

  it('gives each reason its own flow row with the class vector of who paid and who got', () => {
    const g = makeTestGame()
    book(g, 'wage', 'pool:employers', 'person:a', 1000)
    book(g, 'purchase', 'person:a', 'pool:retail', 400)
    book(g, 'tax.income', 'person:a', 'gov:us', 100)
    const zero = { person: 0, firm: 0, bank: 0, gov: 0, pool: 0, abroad: 0, mint: 0, burn: 0 }
    expect(rowOf(g, 'wage')!.net).toEqual({ ...zero, person: 1000, pool: -1000 })
    expect(rowOf(g, 'purchase')!.net).toEqual({ ...zero, person: -400, pool: 400 })
    expect(rowOf(g, 'tax.income')!.net).toEqual({ ...zero, person: -100, gov: 100 })
    expect(flowsOf(g).length).toBe(3)
  })

  it('names a class for every kind of account, and counts anything else as a pool', () => {
    const g = makeTestGame()
    book(g, 'gift', 'person:a', 'firm:f1', 5)
    book(g, 'gift', 'bank:b1', 'abroad', 5)
    book(g, 'gift', 'home:h1', 'gov:us', 5)
    const net = rowOf(g, 'gift')!.net
    expect(net).toEqual({ person: -5, firm: 5, bank: -5, gov: 5, pool: -5, abroad: 5, mint: 0, burn: 0 })
    expect(ACCT_CLASSES).toEqual(['person', 'firm', 'bank', 'gov', 'pool', 'abroad', 'mint', 'burn'])
  })
})

describe('rejections', () => {
  it('returns 0 and changes nothing for a bad amount, a bad account, an unknown reason or a sink on the wrong side', () => {
    const g = makeTestGame()
    book(g, 'wage', 'pool:employers', 'person:a', 100)
    const before = JSON.stringify(g)
    const bad: [string, () => number][] = [
      ['NaN', () => book(g, 'wage', 'pool:employers', 'person:a', NaN)],
      ['Infinity', () => book(g, 'wage', 'pool:employers', 'person:a', Infinity)],
      ['-Infinity', () => book(g, 'wage', 'pool:employers', 'person:a', -Infinity)],
      ['0.4', () => book(g, 'wage', 'pool:employers', 'person:a', 0.4)],
      ['0', () => book(g, 'wage', 'pool:employers', 'person:a', 0)],
      ['-5', () => book(g, 'wage', 'pool:employers', 'person:a', -5)],
      ['2e15', () => book(g, 'wage', 'pool:employers', 'person:a', 2e15)],
      ['a string amount', () => book(g, 'wage', 'pool:employers', 'person:a', cast<number>('5'))],
      ['equal accounts', () => book(g, 'wage', 'person:a', 'person:a', 5)],
      ["'bad' payer", () => book(g, 'wage', cast<AcctRef>('bad'), 'person:a', 5)],
      ["'bad' payee", () => book(g, 'wage', 'person:a', cast<AcctRef>('bad'), 5)],
      ['an empty account', () => book(g, 'wage', cast<AcctRef>(''), 'person:a', 5)],
      ['a number as an account', () => book(g, 'wage', cast<AcctRef>(7), 'person:a', 5)],
      ['an unknown reason', () => book(g, cast<Reason>('nope'), 'pool:employers', 'person:a', 5)],
      ['a prototype name as a reason', () => book(g, cast<Reason>('toString'), 'pool:employers', 'person:a', 5)],
      ['mint:lending as a payer', () => book(g, 'loan.principal', cast<AcctRef>('mint:lending'), 'person:a', 5)],
      ['burn:writeoff as a payee', () => book(g, 'writeoff', 'person:a', cast<AcctRef>('burn:writeoff'), 5)],
      ['mint:lending as a payee', () => book(g, 'loan.principal', 'person:a', cast<AcctRef>('mint:lending'), 5)],
      ['a mint over an unknown name', () => bookMint(g, cast<'lending'>('nope'), 'person:a', 5)],
      ['a mint to a bad account', () => bookMint(g, 'lending', cast<AcctRef>('bad'), 5)],
      ['a mint under an unknown reason', () => bookMint(g, 'lending', 'person:a', 5, cast<Reason>('nope'))],
      ['a burn of NaN', () => bookBurn(g, 'writeoff', 'person:a', NaN)],
      ['a burn from a bad account', () => bookBurn(g, 'writeoff', cast<AcctRef>('bad'), 5)],
    ]
    for (const [name, call] of bad) expect(call(), name).toBe(0)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('creates no ledger and no world for a booking it rejects', () => {
    const g = makeTestGame()
    expect(book(g, 'wage', 'pool:employers', 'person:a', NaN)).toBe(0)
    expect(book(g, 'wage', 'person:a', 'person:a', 5)).toBe(0)
    expect('world' in g).toBe(false)
  })

  it('rejects a booking that would push a balance past 9e15, and accepts one that reaches it', () => {
    const g = makeTestGame()
    for (let i = 0; i < 9; i++) expect(book(g, 'wage', 'pool:employers', 'person:a', 1e15)).toBe(1e15)
    expect(acctBalance(g, 'person:a')).toBe(LEDGER_CAPS.maxBalance)
    const before = JSON.stringify(g)
    expect(book(g, 'wage', 'pool:employers', 'person:a', 1)).toBe(0)
    expect(bookMint(g, 'lending', 'person:a', 1)).toBe(0)
    expect(JSON.stringify(g)).toBe(before)
    // The other side may go as far below zero, and an account may be paid back down.
    expect(acctBalance(g, 'pool:employers')).toBe(-LEDGER_CAPS.maxBalance)
    expect(book(g, 'purchase', 'person:a', 'pool:employers', 1)).toBe(1)
  })

  it('allows an account to go negative', () => {
    const g = makeTestGame()
    book(g, 'purchase', 'person:a', 'pool:retail', 70)
    expect(acctBalance(g, 'person:a')).toBe(-70)
    expect(checkLedger(g).ok).toBe(true)
  })
})

describe('mints and burns', () => {
  it('credits only the payee on a mint and keeps the sum of the accounts equal to the mint', () => {
    const g = makeTestGame()
    expect(bookMint(g, 'lending', 'person:a', 1_000_000_000)).toBe(1_000_000_000)
    const L = peekLedger(g)
    expect(L.a).toEqual({ 'person:a': 1_000_000_000 })
    expect(L.m).toEqual({ lending: 1_000_000_000 })
    expect(L.ym).toEqual({ lending: 1_000_000_000 })
    expect(sumA(g)).toBe(1_000_000_000)
    const row = rowOf(g, 'loan.principal')!
    expect(row.net.mint).toBe(-1_000_000_000)
    expect(row.net.person).toBe(1_000_000_000)
    expect(L.l.some((r) => r[1] === 'mint' && r[2] === 'lending' && r[3] === 1_000_000_000)).toBe(true)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('clips a mint at its yearly cap, logs a cap row, and gives the room back next year', () => {
    const g = makeTestGame()
    expect(mintRoom(g, 'lending')).toBe(1_000_000_000_000)
    expect(bookMint(g, 'lending', 'person:a', 400_000_000_000)).toBe(400_000_000_000)
    expect(bookMint(g, 'lending', 'person:a', 800_000_000_000)).toBe(600_000_000_000)
    expect(peekLedger(g).l.find((r) => r[1] === 'cap')).toEqual([2026, 'cap', 'lending', 200_000_000_000])
    expect(mintRoom(g, 'lending')).toBe(0)
    expect(bookMint(g, 'lending', 'person:a', 1)).toBe(0)
    expect(acctBalance(g, 'person:a')).toBe(1_000_000_000_000)
    expect(sumA(g)).toBe(peekLedger(g).m.lending)
    g.year += 1
    expect(mintRoom(g, 'lending')).toBe(1_000_000_000_000)
    expect(bookMint(g, 'lending', 'person:a', 100)).toBe(100)
    expect(peekLedger(g).ym).toEqual({ lending: 100 })
    expect(peekLedger(g).m.lending).toBe(1_000_000_000_100)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('never books a printing mint while its cap is 0', () => {
    const g = makeTestGame()
    expect(MINTS.printing.cap).toBe(0)
    expect(mintRoom(g, 'printing')).toBe(0)
    expect(bookMint(g, 'printing', 'person:a', 1000)).toBe(0)
    expect(bookMint(g, 'printing', 'person:a', 1)).toBe(0)
    expect(acctBalance(g, 'person:a')).toBe(0)
    expect(peekLedger(g).l.some((r) => r[1] === 'cap' && r[2] === 'printing' && r[3] === 1001)).toBe(true)
  })

  it('mirrors every mint rule for a burn', () => {
    const g = makeTestGame()
    book(g, 'wage', 'pool:employers', 'person:a', 5_000_000_000_000)
    expect(bookBurn(g, 'writeoff', 'person:a', 700_000_000_000)).toBe(700_000_000_000)
    expect(bookBurn(g, 'writeoff', 'person:a', 700_000_000_000)).toBe(300_000_000_000)
    expect(bookBurn(g, 'writeoff', 'person:a', 1)).toBe(0)
    const L = peekLedger(g)
    expect(L.b).toEqual({ writeoff: 1_000_000_000_000 })
    expect(L.yb).toEqual({ writeoff: 1_000_000_000_000 })
    expect(L.l.find((r) => r[1] === 'cap' && r[2] === 'writeoff')).toEqual([2026, 'cap', 'writeoff', 400_000_000_000 + 1])
    expect(sumA(g)).toBe(-L.b.writeoff!)
    expect(rowOf(g, 'writeoff')!.net.burn).toBe(1_000_000_000_000)
    expect(rowOf(g, 'writeoff')!.net.person).toBe(-1_000_000_000_000)
    expect(checkLedger(g).ok).toBe(true)
    g.year += 1
    expect(bookBurn(g, 'writeoff', 'person:a', 10)).toBe(10)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('books a mint and a burn under the reason of their sink unless the caller names one', () => {
    const g = makeTestGame()
    bookMint(g, 'lending', 'person:a', 100)
    bookMint(g, 'revaluation', 'person:a', 10)
    bookMint(g, 'immigrants', 'person:a', 10, 'luck')
    bookBurn(g, 'inflation', 'person:a', 5)
    bookBurn(g, 'emigration', 'person:a', 5)
    const reasons = flowsOf(g).map((r) => r.reason)
    expect(reasons).toEqual(expect.arrayContaining(['loan.principal', 'inflation', 'luck', 'emigration']))
    expect(rowOf(g, 'inflation')!.net).toMatchObject({ mint: -10, burn: 5, person: 5 })
  })

  it('lets a mint carry its own country into the flow rows', () => {
    const g = makeTestGame()
    bookMint(g, 'lending', 'person:a', 100, undefined, undefined, 'fr')
    expect(rowOf(g, 'loan.principal', 'fr')!.net.mint).toBe(-100)
    expect(rowOf(g, 'loan.principal', 'us')).toBeUndefined()
  })

  it('does not book a mint to its payee twice for the same token', () => {
    const g = makeTestGame()
    expect(bookMint(g, 'lending', 'person:a', 100, 'loan.principal', 'loan:1')).toBe(100)
    expect(bookMint(g, 'lending', 'person:a', 100, 'loan.principal', 'loan:1')).toBe(0)
    expect(bookBurn(g, 'writeoff', 'person:a', 10, 'writeoff', 'w:1')).toBe(10)
    expect(bookBurn(g, 'writeoff', 'person:a', 10, 'writeoff', 'w:1')).toBe(0)
    expect(acctBalance(g, 'person:a')).toBe(90)
  })
})

describe('tokens', () => {
  it('books a token once and frees it next year', () => {
    const g = makeTestGame()
    expect(tokenSeen(g, 'redeem:a1:2026')).toBe(false)
    expect(book(g, 'bond.redeem', 'gov:us', 'person:a', 500, 'redeem:a1:2026')).toBe(500)
    expect(tokenSeen(g, 'redeem:a1:2026')).toBe(true)
    expect(book(g, 'bond.redeem', 'gov:us', 'person:a', 500, 'redeem:a1:2026')).toBe(0)
    expect(acctBalance(g, 'person:a')).toBe(500)
    g.year += 1
    expect(tokenSeen(g, 'redeem:a1:2026')).toBe(false)
    expect(book(g, 'bond.redeem', 'gov:us', 'person:a', 500, 'redeem:a1:2026')).toBe(500)
    expect(acctBalance(g, 'person:a')).toBe(1000)
  })

  it('holds 600 tokens a year and drops the oldest', () => {
    const g = makeTestGame()
    for (let i = 0; i < 650; i++) book(g, 'wage', 'pool:employers', 'person:a', 1, `t${i}`)
    expect(peekLedger(g).r.length).toBe(LEDGER_CAPS.receipts)
    expect(tokenSeen(g, 't0')).toBe(false)
    expect(tokenSeen(g, 't49')).toBe(false)
    expect(tokenSeen(g, 't50')).toBe(true)
    expect(tokenSeen(g, 't649')).toBe(true)
    expect(book(g, 'wage', 'pool:employers', 'person:a', 1, 't649')).toBe(0)
    expect(book(g, 'wage', 'pool:employers', 'person:a', 1, 't0')).toBe(1)
  })

  it('does not book a rejected booking under its token', () => {
    const g = makeTestGame()
    expect(book(g, 'wage', 'person:a', 'person:a', 5, 't')).toBe(0)
    expect(tokenSeen(g, 't')).toBe(false)
    expect(book(g, 'wage', 'pool:employers', 'person:a', 5, 't')).toBe(5)
  })

  it('treats an empty token as no token', () => {
    const g = makeTestGame()
    expect(book(g, 'wage', 'pool:employers', 'person:a', 5, '')).toBe(5)
    expect(book(g, 'wage', 'pool:employers', 'person:a', 5, '')).toBe(5)
    expect(peekLedger(g).r).toEqual([])
  })
})

describe('flows', () => {
  const REASON_LIST = Object.keys(REASONS) as Reason[]
  const ACCTS: AcctRef[] = ['person:a', 'person:b', 'firm:f1', 'bank:b1', 'gov:us', 'gov:fr', 'pool:retail', 'pool:employers', 'pool:hh:us', 'abroad', 'home:h1']
  const COUNTRIES = ['us', 'fr', 'de', 'jp']

  it('nets every flow row to zero after 2,000 random bookings, mints and burns', () => {
    const g = makeTestGame()
    const rand = prng(11)
    const pickOf = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
    for (let i = 0; i < 2000; i++) {
      const country = pickOf(COUNTRIES)
      const amount = Math.floor(rand() * 5000) + 1
      const k = rand()
      if (k < 0.8) {
        const from = pickOf(ACCTS)
        const to = pickOf(ACCTS)
        book(g, pickOf(REASON_LIST), from, to, amount, undefined, country)
      } else if (k < 0.9) bookMint(g, pickOf(['lending', 'immigrants', 'revaluation'] as const), pickOf(ACCTS), amount, pickOf(REASON_LIST), undefined, country)
      else bookBurn(g, pickOf(['writeoff', 'inflation', 'emigration'] as const), pickOf(ACCTS), amount, pickOf(REASON_LIST), undefined, country)
    }
    const L = peekLedger(g)
    expect(Object.keys(L.f).length).toBeGreaterThan(20)
    for (const [key, v] of Object.entries(L.f)) {
      expect(v.length, key).toBe(8)
      expect(v.reduce((x, y) => x + y, 0), key).toBe(0)
    }
    for (const row of flowsOf(g)) expect(Object.values(row.net).reduce((x, y) => x + y, 0)).toBe(0)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('gives at most 8 countries a year their own rows and sends the ninth and the rest to *', () => {
    const g = makeTestGame()
    const names = ['aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah', 'ai', 'aj']
    for (const c of names) book(g, 'purchase', 'person:a', 'pool:retail', 10, undefined, c)
    const countries = [...new Set(flowsOf(g).map((r) => r.country))].sort()
    expect(countries).toEqual(['*', 'aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah'])
    expect(rowOf(g, 'purchase', '*')!.net.person).toBe(-20)
    // A country that already has a row keeps it, and the cap applies per year.
    book(g, 'purchase', 'person:a', 'pool:retail', 10, undefined, 'aa')
    expect(rowOf(g, 'purchase', 'aa')!.net.person).toBe(-20)
    g.year += 1
    book(g, 'purchase', 'person:a', 'pool:retail', 10, undefined, 'ai')
    expect(rowOf(g, 'purchase', 'ai')!.net.person).toBe(-10)
  })

  it('names a bad country as xx, not as a bad key', () => {
    const g = makeTestGame()
    book(g, 'purchase', 'person:a', 'pool:retail', 10, undefined, 'a:b')
    book(g, 'purchase', 'person:a', 'pool:retail', 10, undefined, '')
    expect(flowsOf(g).map((r) => r.country)).toEqual(['xx'])
    expect(rowOf(g, 'purchase', 'xx')!.net.person).toBe(-20)
  })

  it('never keeps more than 480 rows: once the specific rows fill up, new ones land in *', () => {
    const g = makeTestGame()
    const countries = ['aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah']
    const reasons = Object.keys(REASONS) as Reason[]
    for (const year of [2026, 2027]) {
      g.year = year
      for (const c of countries) for (const r of reasons) book(g, r, 'person:a', 'pool:retail', 1, undefined, c)
    }
    const rows = Object.keys(peekLedger(g).f)
    expect(rows.length).toBeLessThanOrEqual(LEDGER_CAPS.flowRows)
    expect(rows.some((k) => k.includes(':*:'))).toBe(true)
    expect(checkLedger(g).ok).toBe(true)
    // The money is all there: the player-side flow of the two years adds up to what was booked.
    const total = flowsOf(g).reduce((s, r) => s + r.net.person, 0)
    expect(total).toBe(-2 * 8 * reasons.length)
  })

  it('drops rows older than last year at the roll, and flowsOf sorts and returns this year and last year only', () => {
    const g = makeTestGame()
    for (const [year, c] of [[2026, 'us'], [2026, 'fr'], [2027, 'fr'], [2027, 'us']] as const) {
      g.year = year
      book(g, 'purchase', 'person:a', 'pool:retail', 10, undefined, c)
      book(g, 'gift', 'person:a', 'pool:retail', 10, undefined, c)
    }
    expect(flowsOf(g).map((r) => `${r.year}:${r.country}:${r.reason}`)).toEqual([
      '2026:fr:gift',
      '2026:fr:purchase',
      '2026:us:gift',
      '2026:us:purchase',
      '2027:fr:gift',
      '2027:fr:purchase',
      '2027:us:gift',
      '2027:us:purchase',
    ])
    g.year = 2028
    book(g, 'purchase', 'person:a', 'pool:retail', 10)
    const rows = flowsOf(g)
    expect([...new Set(rows.map((r) => r.year))]).toEqual([2027, 2028])
    expect(Object.keys(peekLedger(g).f).every((k) => !k.startsWith('2026:'))).toBe(true)
    expect(flowsOf(g, 2027).every((r) => r.year === 2027)).toBe(true)
    expect(flowsOf(g, 2026)).toEqual([])
    const sorted = [...rows].sort((a, b) => a.year - b.year || (a.country < b.country ? -1 : 1) || (a.reason < b.reason ? -1 : 1))
    expect(rows).toEqual(sorted)
  })
})

describe('closes and the identity', () => {
  it('keeps the books and the closes consistent over six years of random bookings', () => {
    const g = makeTestGame()
    const rand = prng(23)
    const accts: AcctRef[] = ['person:a', 'person:b', 'firm:f1', 'gov:us', 'pool:retail', 'pool:employers', 'pool:banks']
    const pickOf = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
    for (let year = 2026; year < 2032; year++) {
      g.year = year
      for (let i = 0; i < 150; i++) {
        const amount = Math.floor(rand() * 100_000) + 1
        const k = rand()
        if (k < 0.7) book(g, pickOf(['wage', 'purchase', 'rent', 'tax.income', 'gift']), pickOf(accts), pickOf(accts), amount)
        else if (k < 0.85) bookMint(g, pickOf(['lending', 'revaluation', 'immigrants'] as const), pickOf(accts), amount)
        else bookBurn(g, pickOf(['writeoff', 'inflation'] as const), pickOf(accts), amount)
      }
      const report = checkLedger(g)
      expect(report.problems, `year ${year}`).toEqual([])
      expect(report.ok).toBe(true)
      expect(report.sum).toBe(report.mint - report.burn)
    }
    const c = peekLedger(g).c
    expect(c.length).toBe(LEDGER_CAPS.closes)
    expect(c.map((x) => x[0])).toEqual([2027, 2028, 2029, 2030])
    for (let i = 1; i < c.length; i++) {
      const [, s1, m1, b1] = c[i - 1]!
      const [, s2, m2, b2] = c[i]!
      expect(Math.abs(s2 - s1 - (m2 - m1 - (b2 - b1)))).toBeLessThanOrEqual(1)
    }
    for (const [, s, m, b] of c) expect(s).toBe(m - b)
  })

  it('closes the year that just ended, with the sum and the cumulative mint and burn at that moment', () => {
    const g = makeTestGame()
    bookMint(g, 'lending', 'person:a', 700)
    bookBurn(g, 'writeoff', 'person:a', 200)
    g.year = 2027
    expect(peekLedger(g).c).toEqual([])
    book(g, 'wage', 'pool:employers', 'person:a', 5)
    expect(peekLedger(g).c).toEqual([[2026, 500, 700, 200]])
    expect(peekLedger(g).y).toBe(2027)
    expect(peekLedger(g).ym).toEqual({})
    expect(peekLedger(g).yb).toEqual({})
  })

  it('resets the yearly counters without a close when the clock moves backwards', () => {
    const g = makeTestGame()
    for (let y = 2026; y <= 2029; y++) {
      g.year = y
      bookMint(g, 'lending', 'person:a', 1000)
    }
    const closes = peekLedger(g).c.map((c) => c.slice())
    expect(closes.length).toBe(3)
    g.year = 2020
    bookMint(g, 'lending', 'person:a', 40)
    const L = peekLedger(g)
    expect(L.y).toBe(2020)
    expect(L.ym).toEqual({ lending: 40 })
    expect(L.c.map((c) => c.slice())).toEqual(closes)
    expect(Object.keys(L.f).every((k) => Number(k.split(':')[0]) <= 2020)).toBe(true)
    // Time catches up: the closes stay strictly increasing.
    g.year = 2021
    bookMint(g, 'lending', 'person:a', 1)
    const years = peekLedger(g).c.map((c) => c[0])
    expect(years).toEqual([...years].sort((a, b) => a - b))
    expect(new Set(years).size).toBe(years.length)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('adopts the clock of a ledger whose year was never set, with no close', () => {
    const g = makeTestGame()
    setWorld(g, { v: 1, ledger: { v: 1, y: 0, a: {}, m: {}, b: {}, ym: {}, yb: {}, f: {}, r: [], c: [], l: [], k: 0 } })
    book(g, 'wage', 'pool:employers', 'person:a', 5)
    expect(peekLedger(g).y).toBe(2026)
    expect(peekLedger(g).c).toEqual([])
  })

  it('reports a break of the identity, a bad close, a bad flow row and an over-cap yearly mint', () => {
    const g = makeTestGame()
    bookMint(g, 'lending', 'person:a', 1000)
    g.year = 2027
    book(g, 'wage', 'pool:employers', 'person:a', 10)
    expect(checkLedger(g).ok).toBe(true)
    const L = peekLedger(g) as LedgerShard
    L.a['person:a']! += 5
    expect(ledgerProblems(g).join('|')).toMatch(/sum/)
    L.a['person:a']! -= 5
    expect(checkLedger(g).ok).toBe(true)
    L.c[0]![1] += 3
    expect(checkLedger(g).ok).toBe(false)
    L.c[0]![1] -= 3
    L.f['2027:us:wage']![0]! += 1
    expect(ledgerProblems(g).join('|')).toMatch(/flow/)
    L.f['2027:us:wage']![0]! -= 1
    L.ym.lending = MINTS.lending.cap + 1
    expect(ledgerProblems(g).join('|')).toMatch(/cap/)
    L.ym.lending = 1
    expect(checkLedger(g).ok).toBe(true)
    L.m.heal = 4
    L.a['person:a']! += 4
    expect(checkLedger(g).ok).toBe(false)
    expect(checkLedger(g, { allowHeal: true }).ok).toBe(true)
  })
})

describe('the account cap', () => {
  it('keeps at most 500 accounts, sends the extra bookings to pool:other with a redirect row, and keeps the sum', () => {
    const g = makeTestGame()
    for (let i = 0; i < 600; i++) book(g, 'wage', 'pool:employers', `person:p${i}` as AcctRef, 10)
    const L = peekLedger(g)
    expect(Object.keys(L.a).length).toBeLessThanOrEqual(LEDGER_CAPS.accounts)
    expect(Object.keys(L.a).length).toBeGreaterThan(450)
    expect(acctBalance(g, 'pool:other')).toBeGreaterThan(0)
    expect(L.l.some((r) => r[1] === 'redirect')).toBe(true)
    expect(sumA(g)).toBe(0)
    // A balance held by a redirected account is not lost: what pool:other holds is what the extra accounts were paid.
    const held = Object.entries(L.a)
      .filter(([k]) => k.startsWith('person:'))
      .reduce((s, [, v]) => s + v, 0)
    expect(held + acctBalance(g, 'pool:other')).toBe(6000)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('lands a booking between two redirected accounts on pool:other without moving a dollar', () => {
    const g = makeTestGame()
    for (let i = 0; i < 520; i++) book(g, 'wage', 'pool:employers', `person:p${i}` as AcctRef, 10)
    const before = JSON.stringify(peekLedger(g).a)
    expect(book(g, 'gift', 'person:new1', 'person:new2', 50)).toBe(50)
    expect(JSON.stringify(peekLedger(g).a)).toBe(before)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('folds the smallest person and firm accounts into pool:other at the roll when over 450, but never the player', () => {
    const g = makeTestGame()
    const me = playerAcct(g)
    book(g, 'wage', 'pool:employers', me, 1)
    for (let i = 0; i < 480; i++) book(g, i % 2 ? 'wage' : 'sales', 'pool:employers', `${i % 2 ? 'person' : 'firm'}:x${i}` as AcctRef, 100 + i)
    expect(Object.keys(peekLedger(g).a).length).toBeGreaterThan(450)
    g.year += 1
    book(g, 'wage', 'pool:employers', me, 1)
    const L = peekLedger(g)
    expect(Object.keys(L.a).length).toBeLessThanOrEqual(450)
    expect(acctBalance(g, me)).toBe(2)
    // The smallest were folded: the largest person account survives, the smallest is gone.
    expect(acctBalance(g, 'person:x479')).toBe(579)
    expect(acctBalance(g, 'firm:x0')).toBe(0)
    expect(L.l.some((r) => r[1] === 'fold')).toBe(true)
    expect(sumA(g)).toBe(0)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('folds a whole balance with foldAccount, signed, without a flow row', () => {
    const g = makeTestGame()
    book(g, 'purchase', 'person:a', 'pool:retail', 70)
    book(g, 'wage', 'pool:employers', 'person:b', 30)
    const flows = JSON.stringify(flowsOf(g))
    expect(foldAccount(g, 'person:a', 'pool:other')).toBe(-70)
    expect(acctBalance(g, 'person:a')).toBe(0)
    expect(acctBalance(g, 'pool:other')).toBe(-70)
    expect(JSON.stringify(flowsOf(g))).toBe(flows)
    expect(peekLedger(g).l.some((r) => r[1] === 'fold')).toBe(true)
    expect(sumA(g)).toBe(0)
    expect(foldAccount(g, 'person:a', 'pool:other')).toBe(0)
    expect(foldAccount(g, 'person:b', 'person:b')).toBe(0)
    expect(foldAccount(g, 'person:b', cast<AcctRef>('bad'))).toBe(0)
    expect(foldAccount(g, 'person:b', 'pool:other', 'f1')).toBe(30)
    expect(checkLedger(g).ok).toBe(true)
  })
})

describe('foldAccount and the reserved slot', () => {
  it('never folds pool:other away: at 500 accounts a fold into a new account would leave the ledger no room for it, and the next redirect made 501', () => {
    const g = makeTestGame()
    for (let i = 0; i < 600; i++) book(g, 'wage', 'pool:employers', `person:p${i}` as AcctRef, 10)
    expect(Object.keys(peekLedger(g).a)).toHaveLength(LEDGER_CAPS.accounts)
    const other = acctBalance(g, 'pool:other')
    expect(other).not.toBe(0)

    expect(foldAccount(g, 'pool:other', 'person:p861' as AcctRef)).toBe(0)
    expect(foldAccount(g, 'pool:other', 'person:p3' as AcctRef)).toBe(0)
    expect(acctBalance(g, 'pool:other')).toBe(other)
    expect(Object.keys(peekLedger(g).a)).toHaveLength(LEDGER_CAPS.accounts)

    // The booking that has to redirect still has its account, and the count holds.
    expect(book(g, 'gift', 'person:new1', 'person:new2', 50)).toBe(50)
    expect(Object.keys(peekLedger(g).a).length).toBeLessThanOrEqual(LEDGER_CAPS.accounts)
    expect(checkLedger(g).ok).toBe(true)
    // A live, valid shard is already what normalizeLedger would make of it.
    const L = peekLedger(g)
    expect(normalizeLedger(structuredClone(L))).toEqual(L)
  })

  it('still folds an ordinary account into pool:other, or into another account, at any count', () => {
    const g = makeTestGame()
    for (let i = 0; i < 600; i++) book(g, 'wage', 'pool:employers', `person:p${i}` as AcctRef, 10)
    const before = sumA(g)
    expect(foldAccount(g, 'person:p3', 'pool:other')).toBe(10)
    expect(foldAccount(g, 'person:p4', 'person:p5')).toBe(10)
    expect(acctBalance(g, 'person:p5')).toBe(20)
    expect(sumA(g)).toBe(before)
    expect(checkLedger(g).ok).toBe(true)
    expect(normalizeLedger(structuredClone(peekLedger(g)))).toEqual(peekLedger(g))
  })
})

describe('normalizeLedger on a hostile shard', () => {
  function hostile(): unknown {
    const a: Record<string, unknown> = {}
    for (let i = 0; i < 50_000; i++) a[`person:p${i}`] = i % 7 === 0 ? 2.5 : i
    Object.assign(a, { 'bad key': 5, '': 1, 'person:big': 1e300, 'person:neg': -1e300, 'pool:zero': -0, 'person:nan': NaN, 'mint:lending': 9, 'person:str': '5' })
    const closes = Array.from({ length: 50 }, (_, i) => [2000 + i, i * 7, i * 3, i])
    return {
      v: 1,
      y: 2026,
      a,
      m: { lending: 1e300, bogus: 5, heal: -3, immigrants: 2.5 },
      b: { writeoff: NaN, inflation: 4 },
      ym: { lending: 1e300, bogus: 9 },
      yb: { writeoff: -4 },
      f: {
        '2026:us:wage': [1, 0, 0, 0, -1, 0, 0, 0],
        '2026:us:purchase': [1, 2, 3, 4, 5, 6, 7, 8],
        '2026:us:nope': [0, 0, 0, 0, 0, 0, 0, 0],
        '2026:us:tax.income': [1.5, 0, 0, -1.5, 0, 0, 0, 0],
        '2026:us:gift': [1, 2],
        '2026:us:rent': 'x',
        'bad:key': [0, 0, 0, 0, 0, 0, 0, 0],
        '2026:u:s:wage': [0, 0, 0, 0, 0, 0, 0, 0],
      },
      r: Array.from({ length: 1000 }, (_, i) => `t${i}`),
      c: closes,
      l: Array.from({ length: 100 }, (_, i) => [2026, 'mint', `n${i}`, i]),
      k: 'x',
    }
  }

  it('always returns a valid shard within every cap, and heals the identity with a logged heal row', () => {
    const out = normalizeLedger(hostile())
    expect(out.v).toBe(1)
    expect(Object.keys(out.a).length).toBeLessThanOrEqual(LEDGER_CAPS.accounts)
    expect(out.r.length).toBeLessThanOrEqual(LEDGER_CAPS.receipts)
    expect(out.c.length).toBeLessThanOrEqual(LEDGER_CAPS.closes)
    expect(out.l.length).toBeLessThanOrEqual(LEDGER_CAPS.logRows)
    expect(Object.keys(out.f).length).toBeLessThanOrEqual(LEDGER_CAPS.flowRows)
    for (const v of Object.values(out.a)) expect(Number.isInteger(v) && Math.abs(v) <= LEDGER_CAPS.maxBalance).toBe(true)
    for (const v of Object.values(out.a)) expect(Object.is(v, -0)).toBe(false)
    expect(Object.keys(out.a).every((k) => k !== 'bad key' && k !== '' && !k.startsWith('mint:'))).toBe(true)
    expect(out.ym.lending).toBeLessThanOrEqual(MINTS.lending.cap)
    expect(Object.keys(out.m).every((k) => k in MINTS || k === 'heal')).toBe(true)
    expect(Object.keys(out.b).every((k) => k in BURNS || k === 'heal')).toBe(true)
    expect(out.f['2026:us:wage']).toEqual([1, 0, 0, 0, -1, 0, 0, 0])
    expect(out.f['2026:us:purchase']).toBeUndefined()
    expect(out.f['2026:us:nope']).toBeUndefined()
    expect(out.f['2026:us:gift']).toBeUndefined()
    expect(out.k).toBe(0)
    expect(out.l.some((r) => r[1] === 'heal')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(out.a, '__proto__')).toBe(false)
  })

  it('passes the check with allowHeal and fails it without, once the heal is nonzero', () => {
    const g = makeTestGame()
    setWorld(g, { v: 1, ledger: hostile() })
    expect(checkLedger(g, { allowHeal: true }).problems).toEqual([])
    expect(checkLedger(g, { allowHeal: true }).ok).toBe(true)
    const plain = checkLedger(g)
    expect(plain.ok).toBe(false)
    expect(plain.problems.join('|')).toMatch(/heal/)
    // And it stays usable: the next booking writes a valid ledger.
    expect(book(g, 'wage', 'pool:employers', 'person:fresh', 5)).toBe(5)
    expect(checkLedger(g, { allowHeal: true }).ok).toBe(true)
    expect(Object.keys(peekLedger(g).a).length).toBeLessThanOrEqual(LEDGER_CAPS.accounts)
  })

  it('is idempotent: the result of a normalization is itself valid and comes back as the same object', () => {
    const once = normalizeLedger(hostile())
    expect(normalizeLedger(once)).toBe(once)
    expect(JSON.stringify(normalizeLedger(JSON.parse(JSON.stringify(once))))).toBe(JSON.stringify(once))
  })

  it('returns a valid shard as the same object, and rebuilds it as soon as one number is off', () => {
    const g = makeTestGame()
    book(g, 'wage', 'pool:employers', 'person:a', 100)
    bookMint(g, 'lending', 'person:a', 50)
    g.year += 1
    book(g, 'wage', 'pool:employers', 'person:a', 100, 't')
    const raw = peekLedger(g) as LedgerShard
    expect(normalizeLedger(raw)).toBe(raw)
    const clone = JSON.parse(JSON.stringify(raw)) as LedgerShard
    expect(normalizeLedger(clone)).toBe(clone)
    clone.a['person:a'] = 250.5
    expect(normalizeLedger(clone)).not.toBe(clone)
  })

  it('reads anything that is not a shard as the empty one, and never throws', () => {
    const cyc: Record<string, unknown> = { v: 1 }
    cyc.a = cyc
    cyc.f = cyc
    const protoKey = JSON.parse('{"v":1,"y":2026,"a":{"__proto__":5,"person:a":1},"f":{"__proto__":[0,0,0,0,0,0,0,0]}}') as unknown
    for (const raw of [undefined, null, 0, 5, 'x', true, [], [1, 2], {}, { v: 2 }, { v: 1.5 }, cyc, protoKey, () => 1, Symbol('x')]) {
      const out = normalizeLedger(raw)
      expect(out.v).toBe(1)
      expect(sumOf(out.a)).toBe(sumOf(out.m) - sumOf(out.b))
    }
    expect(normalizeLedger(undefined)).toEqual({ v: 1, y: 0, a: {}, m: {}, b: {}, ym: {}, yb: {}, f: {}, r: [], c: [], l: [], k: 0 })
    expect(Object.getPrototypeOf(normalizeLedger(protoKey).a)).toBe(Object.prototype)
  })

  it('keeps the newest tokens and the newest log rows, and drops closes that are out of order or do not balance', () => {
    const base = normalizeLedger(undefined)
    const raw = {
      ...base,
      y: 2030,
      r: ['a', 'a', 'b', 7, 'c'],
      c: [
        [2020, 0, 0, 0],
        [2019, 0, 0, 0],
        [2021, 5, 1, 0],
        [2022.5, 0, 0, 0],
        [2023, 10, 12, 2],
        [2024, 0, 0, 0],
      ],
      l: [[2026, 'mint', 'lending', 5], [2026, 'x y', 'lending', 5], [2026, 'cap', 'lending', 2.4], 'x'],
    }
    const out = normalizeLedger(raw)
    expect(out.r).toEqual(['a', 'b', 'c'])
    expect(out.c).toEqual([[2020, 0, 0, 0], [2023, 10, 12, 2], [2024, 0, 0, 0]])
    expect(out.l).toEqual([[2026, 'mint', 'lending', 5], [2026, 'cap', 'lending', 2]])
  })
})

describe('purity', () => {
  it('reads an absent, frozen or garbage ledger as the empty shard without writing', () => {
    const g = makeTestGame()
    const empty = normalizeLedger(undefined)
    expect(peekLedger(g)).toEqual(empty)
    expect(acctBalance(g, 'person:a')).toBe(0)
    const frozen = freeze(makeTestGame())
    expect(peekLedger(frozen)).toEqual(empty)
    expect(acctBalance(frozen, 'pool:retail')).toBe(0)
    expect(flowsOf(frozen)).toEqual([])
    expect(tokenSeen(frozen, 'x')).toBe(false)
    expect(mintRoom(frozen, 'lending')).toBe(MINTS.lending.cap)
    expect(checkLedger(frozen).ok).toBe(true)
    for (const garbage of [5, 'x', [], null, { v: 2 }, { v: 1.5 }]) {
      const h = makeTestGame()
      setWorld(h, { v: 1, ledger: garbage })
      const before = JSON.stringify(h)
      expect(peekLedger(h)).toEqual(empty)
      expect(checkLedger(h).ok).toBe(true)
      expect(JSON.stringify(h)).toBe(before)
    }
    const w = makeTestGame()
    setWorld(w, 5)
    expect(peekLedger(w)).toEqual(empty)
    expect(w.world).toBe(cast(5))
  })

  it('throws a TypeError from ledgerRoot on a frozen state, and from a booking on frozen ledger roots', () => {
    const frozen = freeze(makeTestGame())
    expect(() => ledgerRoot(frozen)).toThrow(TypeError)
    expect(() => book(frozen, 'wage', 'pool:employers', 'person:a', 5)).toThrow(TypeError)
    const g = makeTestGame()
    book(g, 'wage', 'pool:employers', 'person:a', 5)
    freeze(g)
    expect(() => book(g, 'wage', 'pool:employers', 'person:a', 5)).toThrow(TypeError)
    expect(acctBalance(g, 'person:a')).toBe(5)
  })

  it('reads the same shard back through peekLedger after a structuredClone', () => {
    const g = makeTestGame()
    book(g, 'wage', 'pool:employers', 'person:a', 5)
    const copy = structuredClone(g)
    expect(peekLedger(copy)).toEqual(peekLedger(g))
    expect(peekLedger(copy)).not.toBe(peekLedger(g))
  })
})

describe('the tables', () => {
  const NAMES = [
    'asset.buy', 'asset.sell', 'benefit', 'bond.redeem', 'bribe', 'capex', 'career.cost', 'career.income', 'claim', 'crime.cost',
    'crime.take', 'dividend', 'divorce', 'donation', 'draw', 'emigration', 'estate', 'fee.bank', 'fee.gov', 'fine',
    'firm.sale', 'gamble', 'gift', 'health', 'inflation', 'inheritance', 'inject', 'inputs', 'intel', 'invest.income', 'leisure',
    'legal', 'living', 'loan.interest', 'loan.principal', 'loan.repay', 'luck', 'marketing', 'payroll', 'pension', 'premium',
    'prize', 'property.buy', 'property.sell', 'purchase', 'rent', 'rnd', 'royalty', 'sales', 'severance', 'support',
    'tax.capgains', 'tax.corp', 'tax.estate', 'tax.income', 'tax.property', 'tax.sales', 'tax.transaction', 'trade.buy', 'trade.sell', 'tuition',
    'unreasoned', 'wage', 'writeoff',
  ]

  it('has the 64 reasons of the design, a pinned list so a deletion is a decision', () => {
    expect(Object.keys(REASONS).sort()).toEqual([...NAMES].sort())
    expect(Object.keys(REASONS).length).toBe(64)
    expect(Object.keys(REASONS).length).toBeLessThanOrEqual(80)
  })

  it('keeps each group sorted and no reason in two groups', () => {
    const seen = new Set<string>()
    for (const [group, rows] of Object.entries(REASON_GROUPS)) {
      const keys = Object.keys(rows)
      expect(keys, group).toEqual([...keys].sort())
      for (const k of keys) {
        expect(seen.has(k), k).toBe(false)
        seen.add(k)
      }
    }
    expect(seen.size).toBe(Object.keys(REASONS).length)
    expect(Object.keys(REASONS).every((k) => seen.has(k))).toBe(true)
  })

  it('resolves every pay and get to an account or a declared sink', () => {
    const accountOrSink = (s: string): boolean => {
      if (s === 'abroad') return true
      const p = parseRef(s)
      if (!p) return false
      if (p.kind === 'mint') return p.key in MINTS
      if (p.kind === 'burn') return p.key in BURNS
      if (p.kind === 'gov') return p.key === 'us'
      if (p.kind === 'pool') return (POOLS as readonly string[]).includes(p.key) || p.key === 'hh:us'
      return false
    }
    for (const [name, def] of Object.entries(REASONS)) {
      for (const cp of [def.pay, def.get]) {
        const acct = counterparty(cp, 'us')
        expect(isRef(acct) || acct === 'abroad', `${name} ${cp}`).toBe(true)
        expect(accountOrSink(acct), `${name} ${cp} -> ${acct}`).toBe(true)
      }
      expect(def.note.length, name).toBeGreaterThan(5)
    }
    expect(counterparty('hh', 'fr')).toBe('pool:hh:fr')
    expect(counterparty('gov', 'fr')).toBe('gov:fr')
    expect(counterparty('retail', 'fr')).toBe('pool:retail')
    expect(counterparty('abroad', 'fr')).toBe('abroad')
    expect(counterparty('mint:lending', 'fr')).toBe('mint:lending')
    expect(counterparty('burn:writeoff', 'fr')).toBe('burn:writeoff')
  })

  it('names 17 pools, sorted, and gives every mint and burn a finite cap', () => {
    expect(POOLS.length).toBe(17)
    expect([...POOLS]).toEqual([...POOLS].sort())
    expect(new Set(POOLS).size).toBe(17)
    for (const [name, m] of Object.entries(MINTS)) expect(Number.isFinite(m.cap) && m.cap >= 0 && Number.isInteger(m.cap), name).toBe(true)
    for (const [name, b] of Object.entries(BURNS)) expect(Number.isFinite(b.cap) && b.cap > 0 && Number.isInteger(b.cap), name).toBe(true)
    expect({ lending: MINTS.lending.cap, printing: MINTS.printing.cap, immigrants: MINTS.immigrants.cap, revaluation: MINTS.revaluation.cap }).toEqual({
      lending: 1_000_000_000_000,
      printing: 0,
      immigrants: 500_000_000,
      revaluation: 1_000_000_000_000,
    })
    for (const b of Object.values(BURNS)) expect(b.cap).toBe(1_000_000_000_000)
    expect(LEDGER_CAPS).toEqual({ accounts: 500, flowRows: 480, flowCountries: 8, receipts: 600, closes: 4, logRows: 40, maxBooking: 1e15, maxBalance: 9e15 })
  })

  it('has the loan reason create money and the sink reasons end in a sink', () => {
    expect(REASONS['loan.principal'].get).toBe('mint:lending')
    expect(REASONS.inflation).toMatchObject({ pay: 'burn:inflation', get: 'mint:revaluation' })
    expect(REASONS.writeoff).toMatchObject({ pay: 'burn:writeoff', get: 'burn:writeoff' })
    expect(REASONS.emigration).toMatchObject({ pay: 'burn:emigration', get: 'burn:emigration' })
    expect(REASONS.rent).toMatchObject({ pay: 'landlords', get: 'hh' })
    expect(REASONS.unreasoned).toMatchObject({ pay: 'other', get: 'other' })
  })
})

describe('determinism and cost', () => {
  function run(g: GameState, from: number, to: number): void {
    const rand = prng(99)
    const accts: AcctRef[] = ['person:a', 'person:b', 'firm:f1', 'gov:us', 'pool:retail', 'pool:employers', 'abroad']
    for (let i = 0; i < to; i++) {
      const x = rand()
      const y = rand()
      const z = rand()
      const amount = Math.floor(rand() * 9000) + 1
      if (i < from) continue
      if (i % 40 === 0) g.year += 1
      if (z < 0.1) bookMint(g, 'lending', accts[Math.floor(x * accts.length)]!, amount)
      else book(g, i % 3 ? 'purchase' : 'wage', accts[Math.floor(x * accts.length)]!, accts[Math.floor(y * accts.length)]!, amount, i % 17 === 0 ? `tok${i}` : undefined)
    }
  }

  it('gives the same JSON for the same bookings', () => {
    const a = makeTestGame()
    const b = makeTestGame()
    run(a, 0, 600)
    run(b, 0, 600)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(checkLedger(a).ok).toBe(true)
  })

  it('gives the same JSON after a JSON round trip and more bookings as the uninterrupted run', () => {
    const straight = makeTestGame()
    run(straight, 0, 600)
    const part = makeTestGame()
    run(part, 0, 300)
    const reloaded = JSON.parse(JSON.stringify(part)) as GameState
    // Replay the second half on the reloaded copy by running the generator from the middle.
    const rand = prng(99)
    const accts: AcctRef[] = ['person:a', 'person:b', 'firm:f1', 'gov:us', 'pool:retail', 'pool:employers', 'abroad']
    for (let i = 0; i < 600; i++) {
      const x = rand()
      const y = rand()
      const z = rand()
      const amount = Math.floor(rand() * 9000) + 1
      if (i < 300) continue
      if (i % 40 === 0) reloaded.year += 1
      if (z < 0.1) bookMint(reloaded, 'lending', accts[Math.floor(x * accts.length)]!, amount)
      else book(reloaded, i % 3 ? 'purchase' : 'wage', accts[Math.floor(x * accts.length)]!, accts[Math.floor(y * accts.length)]!, amount, i % 17 === 0 ? `tok${i}` : undefined)
    }
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(straight))
  })

  it('books 100,000 transfers between 40 accounts in well under 400 ms', () => {
    const g = makeTestGame()
    const accts = Array.from({ length: 40 }, (_, i) => `person:p${i}` as AcctRef)
    book(g, 'wage', 'pool:employers', accts[0]!, 1)
    const t0 = performance.now()
    for (let i = 0; i < 100_000; i++) book(g, 'purchase', accts[i % 40]!, accts[(i * 7 + 1) % 40]!, 1 + (i % 50))
    const ms = performance.now() - t0
    expect(peekLedger(g).k).toBeGreaterThan(99_000)
    expect(ms).toBeLessThan(400)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('validates a structuredClone of a 450-account ledger with full flows in under 10 ms', () => {
    const g = makeTestGame()
    const reasons = Object.keys(REASONS) as Reason[]
    for (let i = 0; i < 449; i++) book(g, 'wage', 'pool:employers', `person:p${i}` as AcctRef, 10 + i)
    for (const year of [2026, 2027]) {
      g.year = year
      for (const c of ['aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah']) for (const r of reasons.slice(0, 40)) book(g, r, 'person:p1', 'pool:retail', 3, undefined, c)
    }
    expect(Object.keys(peekLedger(g).a).length).toBeGreaterThanOrEqual(449)
    expect(Object.keys(peekLedger(g).f).length).toBeGreaterThan(300)
    const copy = structuredClone(g)
    const t0 = performance.now()
    const root = ledgerRoot(copy)
    const ms = performance.now() - t0
    expect(root).toBe(copy.world!.ledger)
    expect(ms).toBeLessThan(10)
    const t1 = performance.now()
    expect(ledgerRoot(copy)).toBe(root)
    expect(performance.now() - t1).toBeLessThan(1)
  })
})

describe('spreads', () => {
  it('has an entry for every pool, and a buy then a sale to the same pool always loses', () => {
    for (const p of POOLS) {
      expect(typeof SPREADS[p], p).toBe('number')
      expect(SPREADS[p], p).toBeGreaterThan(0)
      for (const mid of [1, 100, 12_345.67, 1e9]) {
        expect(ask(mid, p), p).toBeGreaterThan(mid)
        expect(bid(mid, p), p).toBeLessThan(mid)
        expect(bid(ask(mid, p), p), p).toBeLessThan(mid)
        expect(ask(mid, p) - bid(mid, p), p).toBeCloseTo(2 * SPREADS[p] * mid, 3)
      }
    }
    expect(Object.keys(SPREADS).sort()).toEqual([...POOLS])
  })

  it('has the design numbers: markets 0.001, sellers 0.03, retail 0.10, other 0.05, banks 0.002, the rest 0.05', () => {
    expect({ markets: SPREADS.markets, sellers: SPREADS.sellers, retail: SPREADS.retail, other: SPREADS.other, banks: SPREADS.banks }).toEqual({
      markets: 0.001,
      sellers: 0.03,
      retail: 0.1,
      other: 0.05,
      banks: 0.002,
    })
    for (const p of POOLS) if (!['markets', 'sellers', 'retail', 'other', 'banks'].includes(p)) expect(SPREADS[p], p).toBe(0.05)
  })
})

describe('the world root', () => {
  it('replaces a garbage g.world with { v: 1, ledger } on the first booking, as ensureWorld does', () => {
    for (const garbage of [5, 'x', [], null, { v: 2 }, { v: 1.5 }, { v: '1' }, true]) {
      const g = makeTestGame()
      setWorld(g, garbage)
      expect(book(g, 'wage', 'pool:employers', 'person:a', 5)).toBe(5)
      expect(Object.keys(g.world!).sort()).toEqual(['ledger', 'v'])
      expect(g.world!.v).toBe(1)
      const h = makeTestGame()
      setWorld(h, garbage)
      expect(Object.keys(ensureWorld(h))).toEqual(['v'])
      expect(h.world).toEqual({ v: 1 })
    }
  })

  it('keeps a valid g.world with its other shards, and the same world object', () => {
    registerShard('ledgerprobe', { normalize: (raw) => raw })
    const g = makeTestGame()
    const world = { v: 1 as const, y: 2026, ledgerprobe: { v: 1, rows: [1, 2] } }
    g.world = world
    book(g, 'wage', 'pool:employers', 'person:a', 5)
    expect(g.world).toBe(world)
    expect(world.ledgerprobe).toEqual({ v: 1, rows: [1, 2] })
    expect(world.y).toBe(2026)
    expect(Object.keys(world).sort()).toEqual(['ledger', 'ledgerprobe', 'v', 'y'])
  })

  it('registers the ledger shard, so the world reader and the load normalizer keep and bound it', () => {
    const g = makeTestGame()
    book(g, 'wage', 'pool:employers', 'person:a', 5)
    expect(worldShard<LedgerShard>(g, 'ledger')).toBe(g.world!.ledger)
    const copy = structuredClone(g)
    expect(normalizeWorld(copy.world).ledger).toEqual(g.world!.ledger)
    const hostile = normalizeWorld({ v: 1, ledger: { v: 1, a: { 'person:a': 1e300 }, junk: 1 } })
    expect(Object.keys(hostile.ledger as LedgerShard)).toContain('a')
    expect((hostile.ledger as unknown as { junk?: unknown }).junk).toBeUndefined()
  })

  it('resolves the reload of a ledger the same through ledgerRoot and through worldShard', () => {
    const g = makeTestGame()
    book(g, 'wage', 'pool:employers', 'person:a', 5)
    const copy = JSON.parse(JSON.stringify(g)) as GameState
    expect(worldShard(copy, 'ledger')).toBe(copy.world!.ledger)
    expect(ledgerRoot(copy)).toBe(copy.world!.ledger)
  })
})

describe('bookPlayer, bookAcct and roomFor', () => {
  it('books the player side of a receipt or a payment with the default counterparty of the reason', () => {
    const g = makeTestGame()
    const me = playerAcct(g)
    expect(me).toBe(`person:${g.character.id}`)
    expect(bookPlayer(g, 'wage', 1000)).toBe(1000)
    expect(bookPlayer(g, 'tax.income', -300)).toBe(-300)
    expect(bookPlayer(g, 'rent', -100)).toBe(-100)
    expect(bookPlayer(g, 'rent', 50)).toBe(50)
    expect(acctBalance(g, me)).toBe(650)
    expect(acctBalance(g, 'pool:employers')).toBe(-1000)
    expect(acctBalance(g, 'gov:us')).toBe(300)
    expect(acctBalance(g, 'pool:landlords')).toBe(100)
    expect(acctBalance(g, 'pool:hh:us')).toBe(-50)
    expect(sumA(g)).toBe(0)
  })

  it('books a call with no reason under unreasoned against pool:other', () => {
    const g = makeTestGame()
    expect(bookPlayer(g, undefined, 40)).toBe(40)
    expect(bookPlayer(g, undefined, -15)).toBe(-15)
    expect(acctBalance(g, 'pool:other')).toBe(-25)
    expect(rowOf(g, 'unreasoned')!.net.person).toBe(25)
    expect(bookPlayer(g, cast<Reason>('not a reason'), 5)).toBe(5)
    expect(rowOf(g, 'unreasoned')!.net.person).toBe(30)
  })

  it('books nothing for a delta under a dollar, a non-finite one or a huge one', () => {
    const g = makeTestGame()
    expect(bookPlayer(g, 'wage', 0)).toBe(0)
    expect(bookPlayer(g, 'wage', 0.3)).toBe(0)
    expect(bookPlayer(g, 'wage', NaN)).toBe(0)
    expect(bookPlayer(g, 'wage', -Infinity)).toBe(0)
    expect(bookPlayer(g, 'wage', 2e15)).toBe(0)
    expect('world' in g).toBe(false)
  })

  it('lets `with` name the counterparty and `country` switch hh and gov', () => {
    const g = makeTestGame()
    expect(bookPlayer(g, { reason: 'bond.redeem', with: 'gov:fr' }, 400)).toBe(400)
    expect(acctBalance(g, 'gov:fr')).toBe(-400)
    expect(bookPlayer(g, { reason: 'tax.income', country: 'fr' }, -90)).toBe(-90)
    expect(acctBalance(g, 'gov:fr')).toBe(-310)
    expect(bookPlayer(g, { reason: 'rent', country: 'fr' }, 70)).toBe(70)
    expect(acctBalance(g, 'pool:hh:fr')).toBe(-70)
    expect(rowOf(g, 'tax.income', 'fr')!.net.gov).toBe(90)
    expect(rowOf(g, 'tax.income', 'us')).toBeUndefined()
    // A `with` that is no account, or the player's own, falls back to the table.
    expect(bookPlayer(g, { reason: 'wage', with: cast<AcctRef>('nonsense') }, 10)).toBe(10)
    expect(bookPlayer(g, { reason: 'wage', with: playerAcct(g) }, 10)).toBe(10)
    expect(acctBalance(g, 'pool:employers')).toBe(-20)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('mints a receipt whose payer is a mint, clipped to the room, and burns a payment whose payee is a burn', () => {
    const g = makeTestGame()
    expect(roomFor(g, 'loan.principal')).toBe(1_000_000_000_000)
    expect(roomFor(g, 'wage')).toBe(Infinity)
    expect(roomFor(g, undefined)).toBe(Infinity)
    expect(bookPlayer(g, 'loan.principal', 400_000_000_000)).toBe(400_000_000_000)
    expect(roomFor(g, 'loan.principal')).toBe(600_000_000_000)
    expect(bookPlayer(g, 'loan.principal', 800_000_000_000)).toBe(600_000_000_000)
    expect(roomFor(g, 'loan.principal')).toBe(0)
    expect(peekLedger(g).m.lending).toBe(1_000_000_000_000)
    expect(bookPlayer(g, 'inflation', -1000)).toBe(-1000)
    expect(peekLedger(g).b.inflation).toBe(1000)
    expect(bookPlayer(g, 'inflation', 700)).toBe(700)
    expect(peekLedger(g).m.revaluation).toBe(700)
    expect(roomFor(g, { reason: 'wage', with: cast<AcctRef>('mint:immigrants') })).toBe(500_000_000)
    expect(bookPlayer(g, { reason: 'wage', with: cast<AcctRef>('mint:immigrants') }, 90)).toBe(90)
    expect(peekLedger(g).m.immigrants).toBe(90)
    expect(sumA(g)).toBe(peekLedger(g).m.lending! + 700 + 90 - 1000)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('books a sink on the wrong side against pool:other, so the books never part from the cash', () => {
    const g = makeTestGame()
    // writeoff names burn:writeoff on both sides: a receipt cannot come from a burn.
    expect(bookPlayer(g, 'writeoff', 30)).toBe(30)
    expect(acctBalance(g, 'pool:other')).toBe(-30)
    expect(peekLedger(g).b.writeoff).toBeUndefined()
    // loan.principal pays banks when the player pays.
    expect(bookPlayer(g, 'loan.principal', -10)).toBe(-10)
    expect(acctBalance(g, 'pool:banks')).toBe(10)
    expect(bookPlayer(g, 'writeoff', -20)).toBe(-20)
    expect(peekLedger(g).b.writeoff).toBe(20)
    // The same when the caller names the sink: a burn cannot pay a receipt, a mint cannot take a payment.
    expect(bookPlayer(g, { reason: 'wage', with: cast<AcctRef>('burn:writeoff') }, 5)).toBe(5)
    expect(bookPlayer(g, { reason: 'wage', with: cast<AcctRef>('mint:lending') }, -5)).toBe(-5)
    expect(peekLedger(g).b.writeoff).toBe(20)
    expect(peekLedger(g).m.lending).toBeUndefined()
    expect(checkLedger(g).ok).toBe(true)
  })

  it('books any account the same way through bookAcct, and the token only once', () => {
    const g = makeTestGame()
    expect(bookAcct(g, 'firm:f1', { reason: 'sales', token: 's:2026' }, 500)).toBe(500)
    expect(bookAcct(g, 'firm:f1', { reason: 'sales', token: 's:2026' }, 500)).toBe(0)
    expect(bookAcct(g, 'firm:f1', 'payroll', -200)).toBe(-200)
    expect(acctBalance(g, 'firm:f1')).toBe(300)
    expect(acctBalance(g, 'pool:hh:us')).toBe(-300)
    expect(rowOf(g, 'sales')!.net).toMatchObject({ firm: 500, pool: -500 })
  })
})
