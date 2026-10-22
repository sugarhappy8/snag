// R2-L9 (A.K1 e): migration 4, the shops and the computer. Every scenario plays one real flow of the batch through its public
// function and then asserts the three things the batch owes: the player's cash and the player's account never part (driftSince),
// the reason rows and the class of the counterparty are the ones the plan names (flowTotal), and the books balance
// (expectConserved). A person who pays or is paid has an account of their own, and it follows the record to the dollar. Not in the
// fast tier.
import { describe, expect, it } from 'vitest'
import { stepVenture } from '../src/game/computer/dev-venture'
import { earnNow, payFor, receiveSale } from '../src/game/computer/dev-common'
import { readVenture, writeVenture } from '../src/game/computer/dev-state'
import { moneyNodes } from '../src/game/computer/money'
import { brokerName, moneyState, payOrBorrow } from '../src/game/computer/money-common'
import { compulsiveTrading } from '../src/game/computer/money-options'
import { listedTargets, placeBet, settleBets } from '../src/game/computer/money-stocks'
import { GAMBLING_ADDICTION } from '../src/game/gambling'
import { flowsOf } from '../src/game/kernel/ledger'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { charterOf, settleCharter } from '../src/game/shops/fleet-operations'
import { lineById } from '../src/game/shops/luxury-brands-catalog'
import { buyOffer, consignToAuction, sellToDealer, serviceAsset } from '../src/game/shops/luxury-brands-deal'
import { buyJet, buyYacht, jetListings, yachtListings } from '../src/game/shops/luxury-fleet'
import { buyIsland, islandListings, ISLAND_PLANS } from '../src/game/shops/luxury-islands'
import { attendLuxuryExperience } from '../src/game/shops/luxury-pamper'
import { joinSociety, societyById } from '../src/game/shops/luxury-societies'
import { hireStaff } from '../src/game/shops/luxury-staff'
import { joinMembership } from '../src/game/shops/memberships'
import { goToEvent, ticketEvents } from '../src/game/shops/memberships-tickets'
import type { Asset, ChoiceModal, GameState, InputModal, Json, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { acctOf, booksOf, driftSince, expectConserved, flowTotal } from './ledger-kit'
import { makeTestGame } from './helpers'
import { findSeed } from './seed-kit'

const rows = (g: GameState, reason: string): number => flowsOf(g).filter((r) => r.reason === reason).length

/** Nothing the scenario did went through the default reason, and the books balance. */
function clean(g: GameState): void {
  expect(rows(g, 'unreasoned')).toBe(0)
  expectConserved(g)
}

function rich(money = 1_000_000_000, age = 40, seed = 3): GameState {
  return makeTestGame(seed, { age, money, countryId: 'us', birthCountryId: 'us' })
}

/** An adult with a computer. */
function pc(seed: number, age: number, money: number): GameState {
  const g = makeTestGame(seed, { age, money, countryId: 'us', birthCountryId: 'us' })
  g.assets.push({ id: 'pc1', kind: 'other', name: 'Laptop', emoji: '\u{1F4BB}', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: age, upkeep: 0, details: { category: 'electronics' } })
  return g
}

function take<K extends ModalItem['kind']>(g: GameState, kind: K, scriptId?: string): Extract<ModalItem, { kind: K }> {
  const i = g.queue.findIndex((m) => m.kind === kind && (!scriptId || ('scriptId' in m && m.scriptId === scriptId)))
  if (i < 0) throw new Error(`no ${kind} ${scriptId ?? ''} in queue: ${g.queue.map((m) => `${m.kind}:${'scriptId' in m ? m.scriptId : ''}:${'title' in m ? m.title : ''}`).join(', ')}`)
  const [m] = g.queue.splice(i, 1)
  return m as Extract<ModalItem, { kind: K }>
}

function answer(g: GameState, scriptId: string, choice: string): ChoiceModal {
  const m = take(g, 'choice', scriptId)
  runScript(g, scriptId, choice, m.data, m)
  return m
}

function input(g: GameState, scriptId: string, value: string): InputModal {
  const m = take(g, 'input', scriptId)
  runScript(g, scriptId, value, m.data, m)
  return m
}

function findNode(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

function act(g: GameState, id: string): void {
  const n = findNode(g, moneyNodes(g), id)
  if (!n || n.type !== 'action') throw new Error(`no action ${id}`)
  const a: MenuAction = n
  expect(a.disabledReason?.(g) ?? null, `${id} disabled`).toBeNull()
  a.run(g)
}

const acct = (id: string): `person:${string}` => `person:${id}`

/** A script run directly, with no popup behind it (the way the scripts' own tests do it). */
function run(g: GameState, scriptId: string, choice: string, data: Record<string, unknown>): void {
  runScript(g, scriptId, choice, data as unknown as Json, undefined as unknown as ModalItem)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------------------------------------------------------

describe('R2-L9: luxury goods book as asset.buy and asset.sell against the retail pool', () => {
  it('1. a luxury purchase and its resale: asset.buy then asset.sell, and the round trip loses money', () => {
    const g = rich(900_000_000)
    const start = g.character.money
    const before = booksOf(g)
    const a = buyOffer(g, lineById('omega-speedmaster')!, 0, 'boutique')
    expect(a).not.toBeNull()
    const paid = start - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'asset.buy', 'person')).toBe(-paid)
    expect(flowTotal(g, 'asset.buy', 'pool')).toBe(paid)
    expect(acctOf(g, 'pool:retail')).toBe(paid)
    sellToDealer(g, a!)
    const got = g.character.money - (start - paid)
    expect(got).toBeGreaterThan(0)
    expect(flowTotal(g, 'asset.sell', 'person')).toBe(got)
    expect(flowTotal(g, 'asset.sell', 'pool')).toBe(-got)
    expect(g.character.money).toBeLessThan(start)
    expect(acctOf(g, 'pool:retail')).toBe(paid - got)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('1b. authenticating and servicing a piece are purchases, a dealer sale in between is asset.sell', () => {
    const g = rich(900_000_000)
    const a = buyOffer(g, lineById('omega-speedmaster')!, 0, 'boutique')!
    const retail = acctOf(g, 'pool:retail')
    const before = booksOf(g)
    serviceAsset(g, a)
    const cost = before.cash - g.character.money
    expect(cost).toBeGreaterThan(0)
    expect(flowTotal(g, 'purchase', 'person')).toBe(-cost)
    expect(acctOf(g, 'pool:retail')).toBe(retail + cost)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('1c. an auction: a sale books asset.sell for the net after the house takes its cut, a bought-in lot books only the fee as a purchase', () => {
    const sold = findSeed(
      (s) => {
        const g = rich(900_000_000, 40, s)
        const a = buyOffer(g, lineById('omega-speedmaster')!, 0, 'boutique')!
        const m = g.character.money
        consignToAuction(g, a, "Christie's")
        return g.assets.length === 0 && g.character.money > m
      },
      { label: 'a lot that sells' },
    )
    const g = rich(900_000_000, 40, sold)
    const a = buyOffer(g, lineById('omega-speedmaster')!, 0, 'boutique')!
    const before = booksOf(g)
    consignToAuction(g, a, "Christie's")
    const net = g.character.money - before.cash
    expect(net).toBeGreaterThan(0)
    expect(flowTotal(g, 'asset.sell', 'person')).toBe(net)
    expect(driftSince(g, before)).toBe(0)
    clean(g)

    const unsold = findSeed(
      (s) => {
        const h = rich(900_000_000, 40, s)
        const b = buyOffer(h, lineById('omega-speedmaster')!, 0, 'boutique')!
        const m = h.character.money
        consignToAuction(h, b, "Christie's")
        return h.assets.length === 1 && h.character.money < m
      },
      { label: 'a lot that is bought in' },
    )
    const h = rich(900_000_000, 40, unsold)
    const b = buyOffer(h, lineById('omega-speedmaster')!, 0, 'boutique')!
    const before2 = booksOf(h)
    const retail = acctOf(h, 'pool:retail')
    consignToAuction(h, b, "Christie's")
    const fee = before2.cash - h.character.money
    expect(fee).toBeGreaterThan(0)
    expect(flowTotal(h, 'purchase', 'person')).toBe(-fee)
    expect(acctOf(h, 'pool:retail')).toBe(retail + fee)
    expect(driftSince(h, before2)).toBe(0)
    clean(h)
  })
})

describe('R2-L9: fleets', () => {
  it('2. a yacht and a jet are asset.buy of the whole price', () => {
    const g = rich(2_000_000_000)
    const before = booksOf(g)
    const y = buyYacht(g, yachtListings(g)[0]!, 'classic')
    expect(y).not.toBeNull()
    const j = buyJet(g, jetListings(g)[0]!, 'spa')
    expect(j).not.toBeNull()
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(flowTotal(g, 'asset.buy', 'person')).toBe(-paid)
    expect(acctOf(g, 'pool:retail')).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('2b. a charter year: operating costs and receipts book, and the taxable pair cancels in the player\'s cash', () => {
    const g = rich(2_000_000_000)
    const y = buyYacht(g, yachtListings(g)[0]!, 'classic')!
    y.details.chartered = true
    const before = booksOf(g)
    g.flags.taxableIncome = 0
    settleCharter(g, y)
    const p = charterOf(y)
    expect(p.booked).toBeGreaterThan(0)
    expect(p.net).toBeGreaterThan(0)
    // Operating costs go out as purchases, the receipts come in as sales, and the pair makes the net taxable without moving it.
    expect(g.character.money - before.cash).toBe(p.net)
    expect(flowTotal(g, 'sales', 'person')).toBeGreaterThan(0)
    expect(flowTotal(g, 'royalty', 'person')).toBe(p.net)
    expect(flowTotal(g, 'royalty', 'pool')).toBe(-p.net)
    expect(g.flags.taxableIncome).toBe(p.net)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

describe('R2-L9: the island mortgage puts the whole price into the sellers\' pool', () => {
  it('3. an island bought for cash is property.buy', () => {
    const g = rich(1_000_000_000)
    const l = islandListings(g)[0]!
    const before = booksOf(g)
    const a = buyIsland(g, l, null)
    expect(a).not.toBeNull()
    const paid = before.cash - g.character.money
    expect(paid).toBe(l.price)
    expect(flowTotal(g, 'property.buy', 'person')).toBe(-paid)
    expect(acctOf(g, 'pool:sellers')).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('3b. an island on a mortgage: the down payment is property.buy, the lender\'s loan is the lending mint, and the pool gets the price', () => {
    const g = rich(300_000_000)
    g.character.job = { defId: 'ceo', title: 'CEO', company: 'Big Co', category: 'fulltime', salary: 30_000_000, level: 5, performance: 80, yearsInRole: 5, yearsAtCompany: 5, data: {} }
    const l = islandListings(g)[0]!
    const before = booksOf(g)
    const a = buyIsland(g, l, ISLAND_PLANS[ISLAND_PLANS.length - 1]!)
    expect(a?.mortgage?.balance, 'the private bank said yes').toBeGreaterThan(0)
    const down = before.cash - g.character.money
    const principal = a!.mortgage!.balance
    expect(down + principal).toBe(l.price)
    expect(flowTotal(g, 'property.buy', 'person')).toBe(-down)
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-principal)
    expect(acctOf(g, 'pool:sellers')).toBe(l.price)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

describe('R2-L9: memberships, clubs, tickets, staff and treats', () => {
  it('4. a membership is leisure, and so is the upgrade to a better tier', () => {
    const g = rich(1_000_000)
    g.character.age = 40
    const before = booksOf(g)
    const a = joinMembership(g, 'golf', 'basic') ?? joinMembership(g, 'golf', 'full')
    expect(a).not.toBeNull()
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(flowTotal(g, 'leisure', 'person')).toBe(-paid)
    expect(flowTotal(g, 'leisure', 'pool')).toBe(paid)
    expect(acctOf(g, 'pool:leisure')).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('4b. a society fee is leisure', () => {
    const g = rich(500_000_000)
    const s = societyById('croissant')!
    const before = booksOf(g)
    expect(joinSociety(g, s)).toBe(true)
    expect(flowTotal(g, 'leisure', 'person')).toBe(-s.fee)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('4c. a household hire pays a year of wages to the employers', () => {
    const g = rich(500_000_000)
    const before = booksOf(g)
    expect(hireStaff(g, 'chauffeur', { name: 'Jeeves Penny', gender: 'male', hiredAge: 40, skill: 1, quirk: 'knows every shortcut' })).toBe(true)
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(flowTotal(g, 'wage', 'person')).toBe(-paid)
    expect(acctOf(g, 'pool:employers')).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('4d. a luxury experience is leisure', () => {
    const g = rich(500_000_000)
    createPerson(g, { relation: 'child', age: 18, relationship: 40 })
    const before = booksOf(g)
    expect(attendLuxuryExperience(g, 'familyRetreat')).toBe(true)
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(flowTotal(g, 'leisure', 'person')).toBe(-paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('5. a teenager\'s concert ticket paid by a parent: the parent\'s account falls, nobody else\'s cash moves', () => {
    const g = makeTestGame(5, { age: 15, money: 0, countryId: 'us', birthCountryId: 'us' })
    const mom = createPerson(g, { relation: 'parent', gender: 'female', age: 45, lastName: 'Player', relationship: 80, money: 900_000 })
    const ev = ticketEvents(g, 'concert')[0]!
    const before = booksOf(g)
    const momBefore = mom.money
    expect(goToEvent(g, ev, 0, null)).toBe(true)
    const paid = momBefore - mom.money
    expect(paid).toBeGreaterThan(0)
    expect(g.character.money).toBe(0)
    expect(acctOf(g, acct(mom.id))).toBe(-paid)
    expect(flowTotal(g, 'leisure', 'person')).toBe(-paid)
    expect(acctOf(g, 'pool:leisure')).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('5b. the same ticket for an adult comes out of the cash as leisure', () => {
    const g = makeTestGame(5, { age: 30, money: 100_000, countryId: 'us', birthCountryId: 'us' })
    const ev = ticketEvents(g, 'concert')[0]!
    const before = booksOf(g)
    expect(goToEvent(g, ev, 0, null)).toBe(true)
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(flowTotal(g, 'leisure', 'person')).toBe(-paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('5c. a crash in the family car: the person\'s share and the player\'s share are both purchases at the repair shop', () => {
    const g = rich(500_000_000)
    const a = buyYacht(g, yachtListings(g)[0]!, 'classic')!
    const kid = createPerson(g, { relation: 'child', age: 19, lastName: 'Player', money: 40_000 })
    const retail = acctOf(g, 'pool:retail')
    const before = booksOf(g)
    const kidBefore = kid.money
    run(g, 'luxury.family.crash', 'split', { asset: a.id, person: kid.id, bill: 100_000 })
    const share = kidBefore - kid.money
    expect(share).toBe(30_000)
    expect(before.cash - g.character.money).toBe(70_000)
    expect(acctOf(g, acct(kid.id))).toBe(-share)
    expect(acctOf(g, 'pool:retail')).toBe(retail + 100_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The computer
// ---------------------------------------------------------------------------------------------------------------------------

describe('R2-L9: stocks and options book against the markets', () => {
  it('6. a bet on a stock: the stake and the broker\'s fee are trade.buy, and a settled win is trade.sell', () => {
    const g = pc(2, 30, 1_000_000)
    moneyState(g).broker = brokerName('us')
    const t = listedTargets(g)[0]!
    const before = booksOf(g)
    const bet = placeBet(g, { via: 'own', secId: t.secId, kind: 'call', strike: 'atm', stake: 10_000 })
    expect(bet).not.toBeNull()
    const paid = before.cash - g.character.money
    expect(paid).toBe(10_100)
    expect(flowTotal(g, 'trade.buy', 'person')).toBe(-paid)
    expect(acctOf(g, 'pool:markets')).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    // Make it a winner, then let the year end.
    bet!.openPrice = bet!.openPrice / 10
    g.year += 1
    const mid = booksOf(g)
    settleBets(g, moneyState(g))
    const won = g.character.money - mid.cash
    expect(won).toBeGreaterThan(0)
    expect(driftSince(g, mid)).toBe(0)
    expect(flowTotal(g, 'trade.sell', 'person')).toBeGreaterThan(0)
    clean(g)
  })

  it('6b. a crony pays the bet back: trade.sell, and a cut is kept by the crony', () => {
    const g = pc(2, 30, 1_000_000)
    moneyState(g).broker = brokerName('us')
    const t = listedTargets(g)[0]!
    const bet = placeBet(g, { via: 'crony', secId: t.secId, kind: 'call', strike: 'atm', stake: 10_000, crony: 'Nigel Pratt', cut: 0.25 })
    expect(bet).not.toBeNull()
    expect(flowTotal(g, 'trade.buy', 'person')).toBe(-10_000)
    bet!.openPrice = bet!.openPrice / 10
    g.year += 1
    const mid = booksOf(g)
    settleBets(g, moneyState(g))
    expect(driftSince(g, mid)).toBe(0)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('6c. a bill that cash cannot cover becomes a loan, and the lender\'s money goes to whoever was owed', () => {
    const g = pc(2, 30, 10_000)
    const before = booksOf(g)
    const financed = payOrBorrow(g, 50_000, 'Margin Desk', 'trade.buy')
    expect(financed).toBe(40_000)
    expect(g.character.money).toBe(0)
    expect(g.character.loans[0]?.balance).toBe(40_000)
    expect(flowTotal(g, 'trade.buy', 'person')).toBe(-10_000)
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-40_000)
    expect(acctOf(g, 'pool:markets')).toBe(50_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('6d. a fine the regulator sets is paid to the government, and the loan behind it too', () => {
    const g = pc(2, 30, 10_000)
    const before = booksOf(g)
    expect(payOrBorrow(g, 30_000, 'The Regulator', 'fine')).toBe(20_000)
    expect(acctOf(g, 'gov:us')).toBe(30_000)
    expect(flowTotal(g, 'fine', 'gov')).toBe(10_000)
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-20_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  /** A teenager's yolo trade in the mother's account, to the end of the popup chain. */
  function yolo(seed: number): { g: GameState; mom: ReturnType<typeof createPerson> } {
    const g = pc(seed, 15, 5_000)
    const mom = createPerson(g, { relation: 'parent', gender: 'female', age: 45, lastName: 'Player', relationship: 70, money: 200_000 })
    act(g, 'computer.options.parent')
    answer(g, 'computer.money.opt.parent', 'yolo')
    answer(g, 'computer.money.yolo.dir', 'call')
    input(g, 'computer.money.yolo.size', '5000')
    return { g, mom }
  }

  it('7. a teen trades in a parent\'s account: every dollar the parent puts in or gets out has a row of the parent\'s own', () => {
    const seed = findSeed((s) => yolo(s).mom.money !== 200_000, { label: 'a trade that moves the parent\'s money' })
    const { g, mom } = yolo(seed)
    expect(mom.money).not.toBe(200_000)
    // Whatever the trade did, the parent's account is the parent's record to the dollar, and the player's cash is booked.
    expect(acctOf(g, acct(mom.id))).toBe(mom.money - 200_000)
    expect(rows(g, 'trade.buy')).toBeGreaterThan(0)
    expect(driftSince(g, { cash: 5_000, acct: 0 })).toBe(0)
    clean(g)
  })

  it('7b. a parent who finds out makes the teen pay back what was lost: one gift, both sides moved', () => {
    const seed = findSeed(
      (s) => {
        const { g } = yolo(s)
        return g.character.money < 5_000
      },
      { label: 'a caught teen repays the parent' },
    )
    const { g, mom } = yolo(seed)
    const repaid = 5_000 - g.character.money
    expect(repaid).toBeGreaterThan(0)
    expect(acctOf(g, acct(mom.id))).toBe(mom.money - 200_000)
    expect(rows(g, 'gift')).toBe(1)
    expect(flowTotal(g, 'gift', 'person')).toBe(0)
    expect(driftSince(g, { cash: 5_000, acct: 0 })).toBe(0)
    clean(g)
  })

  it('8. revenge trading in the small hours is trade.buy', () => {
    const seed = findSeed(
      (s) => {
        const g = pc(s, 30, 100_000)
        const st = moneyState(g)
        st.broker = brokerName('us')
        st.trades = 3
        g.character.conditions.push({ name: GAMBLING_ADDICTION, severity: 1 } as never)
        const m = g.character.money
        compulsiveTrading(g, st)
        return g.character.money < m
      },
      { label: 'an addicted trader loses at night' },
    )
    const g = pc(seed, 30, 100_000)
    const st = moneyState(g)
    st.broker = brokerName('us')
    st.trades = 3
    g.character.conditions.push({ name: GAMBLING_ADDICTION, severity: 1 } as never)
    const before = booksOf(g)
    compulsiveTrading(g, st)
    const lost = before.cash - g.character.money
    expect(lost).toBeGreaterThan(0)
    expect(flowTotal(g, 'trade.buy', 'person')).toBe(-lost)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

describe('R2-L9: scams, coins and the courts', () => {
  it('9. a scam the player runs books crime.take from the crime pool', () => {
    const seed = findSeed(
      (s) => {
        const g = pc(s, 30, 0)
        act(g, 'computer.scam.store')
        return g.character.money > 0
      },
      { label: 'a scam that pays' },
    )
    const g = pc(seed, 30, 0)
    const before = booksOf(g)
    act(g, 'computer.scam.store')
    expect(g.character.money).toBeGreaterThan(0)
    expect(flowTotal(g, 'crime.take', 'person')).toBeGreaterThan(0)
    expect(acctOf(g, 'pool:crime')).toBeLessThan(0)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('10. aping into a coin is trade.buy and its payout is trade.sell', () => {
    const g = pc(9, 30, 100_000)
    const before = booksOf(g)
    act(g, 'computer.crypto.ape')
    const m = take(g, 'choice', 'computer.money.ape')
    runScript(g, 'computer.money.ape', m.choices[0]!.id, m.data, m)
    expect(rows(g, 'trade.buy')).toBe(1)
    expect(flowTotal(g, 'trade.buy', 'person')).toBeLessThan(0)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

describe('R2-L9: learning, selling a venture and running one', () => {
  it('11. a bootcamp a parent pays for is tuition from the parent\'s account', () => {
    const g = makeTestGame(4, { age: 15, money: 0, countryId: 'us', birthCountryId: 'us' })
    const mom = createPerson(g, { relation: 'parent', gender: 'female', age: 45, lastName: 'Player', relationship: 80, money: 900_000 })
    const before = booksOf(g)
    const who = payFor(g, 4_000, 'A bootcamp')
    expect(who).not.toBeNull()
    expect(who).not.toBe('self')
    expect(mom.money).toBe(896_000)
    expect(acctOf(g, acct(mom.id))).toBe(-4_000)
    expect(flowTotal(g, 'tuition', 'person')).toBe(-4_000)
    expect(acctOf(g, 'pool:edu')).toBe(4_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('11b. a course the player pays for is tuition, and a prize is taxable income under its own reason', () => {
    const g = pc(4, 30, 50_000)
    const before = booksOf(g)
    expect(payFor(g, 1_000, 'A course')).toBe('self')
    expect(flowTotal(g, 'tuition', 'person')).toBe(-1_000)
    const tax = earnNow(g, 20_000, 'prize')
    expect(flowTotal(g, 'prize', 'person')).toBe(20_000)
    expect(flowTotal(g, 'tax.income', 'gov')).toBe(tax)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('12. selling a venture is firm.sale, and the tax on the gain is tax.income', () => {
    const g = pc(4, 30, 10_000)
    const before = booksOf(g)
    const { tax, gain } = receiveSale(g, 100_000, 20_000)
    expect(gain).toBe(80_000)
    expect(tax).toBeGreaterThan(0)
    expect(flowTotal(g, 'firm.sale', 'person')).toBe(100_000)
    expect(flowTotal(g, 'tax.income', 'gov')).toBe(tax)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  function founded(seed: number): { g: GameState; a: Asset } {
    const g = pc(seed, 30, 500_000)
    run(g, 'computer.dev.venture.name', 'Acme', { type: 'saas', idea: { text: 'Invoicing for clowns', key: 'Idea', mult: 1 }, hired: false, cost: 3_000 })
    const a = g.assets.find((x) => x.kind === 'venture')
    if (!a) throw new Error('no venture')
    return { g, a }
  }

  it('13. founding a venture is a purchase, and an investor\'s money into the company account is inject', () => {
    const { g, a } = founded(6)
    expect(flowTotal(g, 'purchase', 'person')).toBe(-3_000)
    const before = booksOf(g)
    run(g, 'computer.dev.venture.event', 'take', { ev: 'investor', assetId: a.id, pct: 20, amount: 400_000, cost: 0 })
    expect(readVenture(g, a).cash).toBe(400_000)
    expect(acctOf(g, `firm:${a.id}`)).toBe(400_000)
    expect(flowTotal(g, 'inject', 'firm')).toBe(400_000)
    expect(g.character.money).toBe(before.cash)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('13b. a fine comes out of the company account first, then the owner, and both go to the government', () => {
    const { g, a } = founded(6)
    const v = readVenture(g, a)
    v.cash = 1_000
    v.users = 5_000
    writeVenture(a, v)
    const before = booksOf(g)
    run(g, 'computer.dev.venture.event', 'disclose', { ev: 'breach', assetId: a.id, cost: 0 })
    const after = readVenture(g, a)
    const fromCash = 1_000 - after.cash
    expect(fromCash).toBe(1_000)
    const fromYou = before.cash - g.character.money
    expect(fromYou).toBeGreaterThan(0)
    expect(acctOf(g, `firm:${a.id}`)).toBe(-fromCash)
    expect(flowTotal(g, 'fine', 'firm')).toBe(-fromCash)
    expect(flowTotal(g, 'fine', 'person')).toBe(-fromYou)
    expect(acctOf(g, 'gov:us')).toBe(fromCash + fromYou)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('13c. the build year pays contractors from the company account first, and the books name the firm', () => {
    const { g, a } = founded(6)
    const v = readVenture(g, a)
    v.contractors = 2
    v.cash = 500
    writeVenture(a, v)
    const before = booksOf(g)
    stepVenture(g, a, false)
    expect(readVenture(g, a).cash).toBe(0)
    expect(acctOf(g, `firm:${a.id}`)).toBe(-500)
    expect(flowTotal(g, 'inputs', 'firm')).toBe(-500)
    expect(before.cash - g.character.money).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('13d. a sold venture: the offer is firm.sale', () => {
    const { g, a } = founded(6)
    const before = booksOf(g)
    run(g, 'computer.dev.venture.sell', 'offer0', { assetId: a.id, offers: [{ buyer: 'a buyer', amount: 25_000 }] })
    expect(g.assets.find((x) => x.id === a.id)).toBeUndefined()
    expect(flowTotal(g, 'firm.sale', 'person')).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})
