// R4-E8 (X46): memory moves three odds, a little (src/game/world/edge-odds.ts). memoryOdds reads the memories of the edge person > player
// and gives a signed term for one group:
//
//   repay   added inside repayOdds (events/wealth-core.ts), which takes the game as an optional third argument
//   peace   added inside peaceOdds (events/will-core.ts)
//   ask     the weight of an ask in requestCandidates (events/wealth.ts) is multiplied by 1 + the term
//
// What the file proves: the table (printed, every kind, every entry within 5 hundredths), the bounds (0.05 a kind, 0.15 in all, with 100
// memories offered), the zero cases (no stamp, no edge, no memory), purity (a frozen game with its dice trapped), the three terms in the
// three chances, and that a game that is not stamped, or a call with no game, gets the old number to the last digit.
import { describe, expect, it } from 'vitest'
import { requestCandidates, yearlyWealth } from '../src/game/events/wealth'
import { entitlement, readTies, repayOdds, updateTies, wealthTier } from '../src/game/events/wealth-core'
import { wealthNodes } from '../src/game/events/wealth-menu'
import { peaceOdds } from '../src/game/events/will-core'
import { personEntity } from '../src/game/kernel/person-ref'
import { EDGE_CAPS } from '../src/game/world/caps'
import { MEMORY_KINDS, formatMemory, type MemoryKind } from '../src/game/world/edge-memory'
import { KIND_ODDS_MAX, MEMORY_ODDS, ODDS_GROUPS, TOTAL_ODDS_MAX, memoryOdds, oddsOfMemories, type OddsGroup } from '../src/game/world/edge-odds'
import { putEdge, remember } from '../src/game/world/edge-write'
import { type Edge } from '../src/game/world/edges'
import { playerRef } from '../src/game/world/people'
import { createPerson } from '../src/game/people'
import type { GameState, MenuNode, Person } from '../src/game/types'
import { makeTestGame } from './helpers'
import { frozenGame, trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { findSeed } from './seed-kit'
import { cast, socialGame } from './social-kit'

const E = (over: Partial<Edge> = {}): Edge => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: 2000, l: 2026, ...over })
const mem = (kind: MemoryKind, year: number, w: 1 | 2 | 3 = 3): string => formatMemory({ kind, year, w, by: 'ego' })
const keyOf = (g: GameState, p: Person): string => `${personEntity(p)}>${playerRef(g)}`

/** A stamped game with one friend whose edge carries these memories. */
function withMemories(memories: string[], seed = 1): { g: GameState; p: Person } {
  const g = socialGame(seed)
  const p = cast(g, 50)
  expect(putEdge(g, keyOf(g, p), E({ m: memories }))).toBe(true)
  return { g, p }
}

describe('the table', () => {
  it('has a row for each of the 40 kinds, three integer entries each, none beyond 5 hundredths and none all zero', () => {
    expect(Object.keys(MEMORY_ODDS)).toEqual([...MEMORY_KINDS])
    for (const k of MEMORY_KINDS) {
      const row = MEMORY_ODDS[k]
      expect(Object.keys(row), k).toEqual([...ODDS_GROUPS])
      for (const gr of ODDS_GROUPS) {
        expect(Number.isInteger(row[gr]), `${k} ${gr}`).toBe(true)
        expect(Math.abs(row[gr]), `${k} ${gr}`).toBeLessThanOrEqual(KIND_ODDS_MAX * 100)
      }
      expect(ODDS_GROUPS.some((gr) => row[gr] !== 0), `${k} moves nothing`).toBe(true)
      expect(Object.isFrozen(row)).toBe(true)
    }
    expect(Object.isFrozen(MEMORY_ODDS)).toBe(true)
  })

  it('prints the table, one line a kind: repay, peace and ask in hundredths at weight 3', () => {
    const rows = MEMORY_KINDS.map((k) => `${k.padEnd(18)} ${ODDS_GROUPS.map((gr) => String(MEMORY_ODDS[k][gr]).padStart(5)).join(' ')}`)
    process.stdout.write(`memory odds (hundredths at weight 3)\n${'kind'.padEnd(18)} ${ODDS_GROUPS.map((gr) => gr.padStart(5)).join(' ')}\n${rows.join('\n')}\n`)
    expect(rows).toHaveLength(40)
  })

  it('points the way a reader would say: a payer repays, an olive branch makes peace, a gift brings asks, a betrayal costs all three', () => {
    expect(MEMORY_ODDS.loan_repaid.repay).toBeGreaterThan(0)
    expect(MEMORY_ODDS.loan_unpaid.repay).toBeLessThan(0)
    expect(MEMORY_ODDS.olive_branch.peace).toBeGreaterThan(0)
    expect(MEMORY_ODDS.cut_from_will.peace).toBeLessThan(0)
    expect(MEMORY_ODDS.gift_given.ask).toBeGreaterThan(0)
    expect(MEMORY_ODDS.gift_refused.ask).toBeLessThan(0)
    for (const gr of ODDS_GROUPS) expect(MEMORY_ODDS.betrayal[gr]).toBeLessThan(0)
    for (const gr of ODDS_GROUPS) expect(MEMORY_ODDS.saved_me[gr]).toBeGreaterThan(0)
  })
})

describe('the term', () => {
  it('is 0 with no memory: no edge, an edge with no memory, and a game that is not stamped', () => {
    const g = socialGame(3)
    const p = cast(g, 50)
    for (const gr of ODDS_GROUPS) expect(memoryOdds(g, p, gr)).toBe(0)
    putEdge(g, keyOf(g, p), E())
    for (const gr of ODDS_GROUPS) expect(memoryOdds(g, p, gr)).toBe(0)
    const plain = makeTestGame(3)
    const q = createPerson(plain, { relation: 'friend', age: 30, relationship: 50 })
    for (const gr of ODDS_GROUPS) expect(memoryOdds(plain, q, gr)).toBe(0)
  })

  it('is 0 for a life that is not stamped even when a hostile save holds the edge and its memory', () => {
    const g = socialGame(4)
    const p = cast(g, 50)
    putEdge(g, keyOf(g, p), E({ m: [mem('saved_me', 2020)] }))
    expect(memoryOdds(g, p, 'repay')).toBeGreaterThan(0)
    const bare = { ...g, world: { v: 1, edges: g.world!.edges } } as GameState
    for (const gr of ODDS_GROUPS) expect(memoryOdds(bare, p, gr)).toBe(0)
  })

  it('is the table entry for one memory at weight 3, and a third and two thirds of it at weights 1 and 2', () => {
    for (const k of MEMORY_KINDS) {
      for (const gr of ODDS_GROUPS) {
        const full = MEMORY_ODDS[k][gr] / 100
        const { g, p } = withMemories([mem(k, 2020, 3)])
        expect(memoryOdds(g, p, gr), `${k} ${gr} w3`).toBeCloseTo(full, 10)
        for (const w of [1, 2] as const) {
          const one = withMemories([mem(k, 2020, w)])
          expect(memoryOdds(one.g, one.p, gr), `${k} ${gr} w${w}`).toBeCloseTo((full * w) / 3, 10)
        }
      }
    }
  })

  it('adds the memories of different kinds', () => {
    const { g, p } = withMemories([mem('loan_repaid', 2020), mem('gift_given', 2021), mem('betrayal', 2022)])
    const want = (MEMORY_ODDS.loan_repaid.repay + MEMORY_ODDS.gift_given.repay + MEMORY_ODDS.betrayal.repay) / 100
    expect(memoryOdds(g, p, 'repay')).toBeCloseTo(want, 10)
  })

  it('never moves a group by more than 0.05 for one kind and 0.15 in all, with 100 memories offered', () => {
    for (const gr of ODDS_GROUPS) {
      for (const k of MEMORY_KINDS) {
        const hundred = Array.from({ length: 100 }, () => ({ kind: k, w: 3 }))
        expect(Math.abs(oddsOfMemories(hundred, gr)), `${k} ${gr}`).toBeLessThanOrEqual(KIND_ODDS_MAX + 1e-12)
      }
      const up = MEMORY_KINDS.flatMap((k) => (MEMORY_ODDS[k][gr] > 0 ? Array.from({ length: 3 }, () => ({ kind: k, w: 3 })) : []))
      const down = MEMORY_KINDS.flatMap((k) => (MEMORY_ODDS[k][gr] < 0 ? Array.from({ length: 3 }, () => ({ kind: k, w: 3 })) : []))
      expect(oddsOfMemories(up, gr)).toBe(TOTAL_ODDS_MAX)
      expect(oddsOfMemories(down, gr)).toBe(-TOTAL_ODDS_MAX)
      expect(Math.abs(oddsOfMemories([...up, ...down], gr))).toBeLessThanOrEqual(TOTAL_ODDS_MAX)
    }
  })

  it('keeps the bounds on a stored edge that carries 100 memories (the edge keeps 8) and a world of edges at the cap', () => {
    const lots = Array.from({ length: 100 }, (_, i) => mem('saved_me', 2000 + (i % 30)))
    const { g, p } = withMemories(lots)
    for (const gr of ODDS_GROUPS) expect(Math.abs(memoryOdds(g, p, gr))).toBeLessThanOrEqual(KIND_ODDS_MAX + 1e-12)
    const many = socialGame(5)
    const people = Array.from({ length: 40 }, () => cast(many, 50))
    for (const q of people) putEdge(many, keyOf(many, q), E({ m: MEMORY_KINDS.slice(0, EDGE_CAPS.memPerEdge).map((k, i) => mem(k, 2010 + i)) }))
    for (const q of people) for (const gr of ODDS_GROUPS) expect(Math.abs(memoryOdds(many, q, gr))).toBeLessThanOrEqual(TOTAL_ODDS_MAX + 1e-12)
  })

  it('skips a kind, a weight and a group it does not know', () => {
    expect(oddsOfMemories([{ kind: 'nope' as MemoryKind, w: 3 }, { kind: 'saved_me', w: 0 }, { kind: 'saved_me', w: 9 }, null as never], 'repay')).toBe(0)
    expect(oddsOfMemories([{ kind: 'saved_me', w: 3 }], 'nope' as OddsGroup)).toBe(0)
    expect(oddsOfMemories(null as never, 'repay')).toBe(0)
    const { g, p } = withMemories([mem('saved_me', 2020)])
    expect(memoryOdds(g, p, 'nope' as OddsGroup)).toBe(0)
  })
})

describe('purity', () => {
  it('reads a frozen stamped game whose dice are trapped, writes nothing and gives the same answer twice', () => {
    const live = socialGame(6)
    const p = cast(live, 50)
    putEdge(live, keyOf(live, p), E({ m: [mem('loan_repaid', 2020), mem('betrayal', 2021)] }))
    const g = deepFreeze(trapRng(live))
    const snap = JSON.stringify(g)
    for (const gr of ODDS_GROUPS) expect(memoryOdds(g, p, gr)).toBe(memoryOdds(g, p, gr))
    expect(JSON.stringify(g)).toBe(snap)
  })

  it('reads a frozen game that has no world at all and does not make one', () => {
    const g = frozenGame(7)
    const p = createPerson(makeTestGame(7), { relation: 'friend', age: 30, relationship: 50 })
    for (const gr of ODDS_GROUPS) expect(memoryOdds(g, p, gr)).toBe(0)
    expect(g.world).toBeUndefined()
  })
})

describe('repayOdds', () => {
  const owes = 1000

  it('takes the game as an optional third argument and gives the old number without it', () => {
    const { g, p } = withMemories([mem('saved_me', 2020)])
    expect(repayOdds(p, owes)).toBe(repayOdds(p, owes, undefined))
    expect(repayOdds(p, owes, g)).toBeGreaterThan(repayOdds(p, owes))
  })

  it('adds the term, inside the old floor and ceiling', () => {
    const { g, p } = withMemories([mem('loan_repaid', 2020), mem('gift_given', 2021)], 8)
    p.money = 0
    const base = repayOdds(p, owes)
    expect(base).toBeGreaterThan(0.03)
    expect(base).toBeLessThan(0.75 - TOTAL_ODDS_MAX)
    expect(repayOdds(p, owes, g)).toBeCloseTo(base + memoryOdds(g, p, 'repay'), 10)
  })

  it('stays between 0.03 and 0.75 with the best memories and the worst, and moves the old number by 0.15 at most', () => {
    const best = withMemories([mem('saved_me', 2020), mem('loan_repaid', 2021), mem('bailed_out', 2022), mem('stood_by_me', 2023)])
    best.p.money = 10 ** 9
    best.p.traits = ['honest', 'loyal']
    // the best a person can be without a memory is 0.42, so the ceiling of 0.75 is out of reach of the term: it adds 0.15 and no more
    expect(repayOdds(best.p, owes, best.g)).toBeCloseTo(repayOdds(best.p, owes) + TOTAL_ODDS_MAX, 10)
    expect(repayOdds(best.p, owes, best.g)).toBeLessThanOrEqual(0.75)
    const worst = withMemories([mem('betrayal', 2020), mem('loan_unpaid', 2021), mem('estranged', 2022), mem('allowance_cut', 2023)])
    worst.p.money = 0
    worst.p.traits = ['sneaky', 'lazy']
    expect(repayOdds(worst.p, owes, worst.g)).toBe(0.03)
  })

  it('gives the old number to the last digit on a game that is not stamped', () => {
    const g = makeTestGame(9)
    const people = [30, 55, 80].map((r) => createPerson(g, { relation: 'child', age: 30, relationship: r, money: r * 100 }))
    for (const q of people) for (const o of [10, 1000, 10 ** 7]) expect(repayOdds(q, o, g)).toBe(repayOdds(q, o))
    expect(entitlement(people[0]!)).toBe(0)
  })
})

describe('peaceOdds', () => {
  it('adds the term, and the two odds agree with each other on an honest preview', () => {
    const none = withMemories([])
    const good = withMemories([mem('olive_branch', 2020), mem('reconciled', 2021)])
    const bad = withMemories([mem('estranged', 2020), mem('betrayal', 2021)])
    const base = peaceOdds(none.g, none.p)
    expect(peaceOdds(good.g, good.p)).toBeGreaterThan(base)
    expect(peaceOdds(bad.g, bad.p)).toBeLessThan(base)
    expect(Math.abs(peaceOdds(good.g, good.p) - base - memoryOdds(good.g, good.p, 'peace'))).toBeLessThanOrEqual(0.01 + 1e-9)
  })

  it('moves by at most 0.15 (and the half hundredth of its own rounding) from the odds with no memory', () => {
    const none = withMemories([])
    const base = peaceOdds(none.g, none.p)
    for (const list of [MEMORY_KINDS.filter((k) => MEMORY_ODDS[k].peace > 0), MEMORY_KINDS.filter((k) => MEMORY_ODDS[k].peace < 0)]) {
      const { g, p } = withMemories(list.slice(0, 8).map((k, i) => mem(k, 2010 + i)))
      expect(Math.abs(peaceOdds(g, p) - base)).toBeLessThanOrEqual(TOTAL_ODDS_MAX + 0.01 + 1e-9)
    }
  })

  it('is the old number on a game that is not stamped, even when a hostile save holds the edge and its memories', () => {
    const none = withMemories([], 10)
    const some = withMemories([mem('estranged', 2020), mem('betrayal', 2021)], 10)
    expect(peaceOdds(some.g, some.p)).toBeLessThan(peaceOdds(none.g, none.p))
    const bare = { ...some.g, world: { v: 1, edges: some.g.world!.edges } } as GameState
    expect(peaceOdds(bare, some.p)).toBe(peaceOdds(none.g, none.p))
  })
})

describe('the weight of an ask', () => {
  function rich(seed: number) {
    const g = socialGame(seed, { age: 45, money: 20_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
    const kid = createPerson(g, { relation: 'child', age: 17, relationship: 70, lastName: g.character.lastName, livesWithPlayer: true })
    return { g, kid }
  }
  const weights = (g: GameState, id: string): Map<string, number> => {
    const out = new Map<string, number>()
    for (const c of requestCandidates(g, wealthTier(g))) if (c.p?.id === id) out.set(c.def.id, c.w)
    return out
  }

  it('is multiplied by 1 + the term for the person who remembers, and by 1 for a person who remembers nothing', () => {
    const { g, kid } = rich(11)
    const other = createPerson(g, { relation: 'child', age: 18, relationship: 70, lastName: g.character.lastName })
    const before = weights(g, kid.id)
    const otherBefore = weights(g, other.id)
    expect(before.size).toBeGreaterThan(0)
    expect(remember(g, kid, 'gift_given', { w: 3 })).toBe(true)
    const term = memoryOdds(g, kid, 'ask')
    expect(term).toBeGreaterThan(0)
    const after = weights(g, kid.id)
    expect([...after.keys()]).toEqual([...before.keys()])
    for (const [id, w] of before) expect(after.get(id)! / w, id).toBeCloseTo(1 + term, 9)
    expect(weights(g, other.id)).toEqual(otherBefore)
  })

  it('shrinks for a person who was refused and never goes to zero or past 1.15 of the old weight', () => {
    const { g, kid } = rich(12)
    const before = weights(g, kid.id)
    const year = g.year
    for (const [i, kind] of (['gift_refused', 'asked_too_often', 'betrayal', 'estranged', 'allowance_cut'] as const).entries()) {
      g.year = year + i
      expect(remember(g, kid, kind, { w: 3 })).toBe(true)
    }
    g.year = year
    const after = weights(g, kid.id)
    for (const [id, w] of before) {
      expect(after.get(id)!, id).toBeLessThan(w)
      expect(after.get(id)! / w, id).toBeGreaterThanOrEqual(1 - TOTAL_ODDS_MAX - 1e-9)
    }
  })

  it('is the old weight to the last digit on a game that is not stamped', () => {
    const a = socialGame(13, { age: 45, money: 20_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
    const b = makeTestGame(13, { age: 45, money: 20_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
    for (const g of [a, b]) createPerson(g, { relation: 'child', age: 17, relationship: 70, lastName: g.character.lastName, livesWithPlayer: true })
    const wa = [...requestCandidates(a, wealthTier(a))].map((c) => [c.def.id, c.w] as const)
    const wb = [...requestCandidates(b, wealthTier(b))].map((c) => [c.def.id, c.w] as const)
    expect(wa).toEqual(wb)
    expect(wa.length).toBeGreaterThan(0)
  })
})

/** Every node of a menu, the children of its submenus included. */
const flat = (g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] => nodes.flatMap((n) => (n.type === 'menu' && depth < 5 ? [n, ...flat(g, n.children(g), depth + 1)] : [n]))

describe('the callers of repayOdds pass the game', () => {
  const GOOD: readonly MemoryKind[] = ['saved_me', 'loan_repaid', 'bailed_out', 'stood_by_me']
  const BAD: readonly MemoryKind[] = ['betrayal', 'loan_unpaid', 'estranged', 'allowance_cut']

  /** A grown child owes 20,000 and can pay it; true when some of it came back after the year's hook or the Ask to Be Paid Back action. */
  function repaid(seed: number, kinds: readonly MemoryKind[], via: 'year' | 'menu'): boolean {
    const g = socialGame(seed, { age: 45, money: 20_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
    const kid = createPerson(g, { relation: 'child', age: 30, relationship: 50, lastName: g.character.lastName, traits: ['calm'], money: 1_000_000 })
    updateTies(g, kid, (t) => {
      t.owes = 20_000
      t.owesSince = g.year
    })
    for (const k of kinds) expect(remember(g, kid, k, { w: 3 })).toBe(true)
    g.queue = []
    if (via === 'year') {
      g.year += 1
      g.character.age += 1
      for (const p of g.people) if (p.alive) p.age += 1
      g.yearActions = {}
      yearlyWealth(g)
    } else {
      const ask = flat(g, wealthNodes(g, kid)).find((n) => n.type === 'action' && n.id === 'wealth.repay')
      if (ask?.type !== 'action') throw new Error('no Ask to Be Paid Back')
      ask.run(g, undefined)
    }
    return readTies(g, kid).owes < 20_000
  }

  for (const via of ['year', 'menu'] as const) {
    it(`${via === 'year' ? 'the yearly collection (collectLoans)' : 'the Ask to Be Paid Back action'} reads what the debtor remembers`, () => {
      const better = findSeed((s) => repaid(s, GOOD, via) && !repaid(s, [], via), { label: `repay better ${via}`, tries: 300 })
      expect(repaid(better, GOOD, via)).toBe(true)
      expect(repaid(better, [], via)).toBe(false)
      const worse = findSeed((s) => repaid(s, [], via) && !repaid(s, BAD, via), { label: `repay worse ${via}`, tries: 300 })
      expect(repaid(worse, [], via)).toBe(true)
      expect(repaid(worse, BAD, via)).toBe(false)
    })
  }
})
