// Money an insider investigation takes is held for the player, not destroyed (special/politics.ts):
// `InsiderCase.held` is set when the regulator opens the case, goes to the trial with the arrest
// (acquittal or a successful appeal gives it back, a conviction or plea forfeits it), and comes back
// when the case ends without a trial (statute of limitations, "lost in a flood"). Everything runs through
// the real exposure script, the real yearly loop and the real arrest, trial and appeal scripts.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { defendants } from '../src/game/activities/lawsuit'
import { anchor, fam, moneyState, regulator } from '../src/game/computer/money-common'
import { listedTargets, placeBet, type BetTarget } from '../src/game/computer/money-stocks'
import { formatMoney } from '../src/game/core'
import { companyDef, exchangeInfo, exchangeYear } from '../src/game/invest/engine'
import { buySecurity, investmentHoldings } from '../src/game/investments'
import { officeHooks } from '../src/game/nation/office'
import { prisonMenu } from '../src/game/prison'
import { migrateSave } from '../src/game/save-schema'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { ownerKey } from '../src/game/special/common'
import type { Asset, ChoiceModal, GameState, MenuAction, MenuNode, ModalItem, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

const GAIN = 1_234_567
const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1)
const NO_MODAL = undefined as unknown as ModalItem

type Office = 'gb' | 'us'

/** A UK MP (no immunity: arrested at once) or a US president (immune in office: the case waits). */
function official(country: Office, seed: number, money = 5_000_000_000): GameState {
  const g = makeTestGame(seed, { age: 55, countryId: country, birthCountryId: country, money })
  g.character.job = {
    defId: 'politician',
    title: country === 'gb' ? 'Member of Parliament' : 'President',
    company: 'Somewhere',
    category: 'special',
    salary: 100_000,
    level: country === 'gb' ? 2 : 3,
    performance: 60,
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { office: country === 'gb' ? 'governor' : 'leader', party: 'centrist', approval: 60, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: 55, roleStartAge: 55 },
  }
  return g
}

function holdable(g: GameState): BetTarget {
  const inf = exchangeInfo(g.character.countryId)
  const hit = listedTargets(g).find((t) => {
    const m = /s(\d+)g(\d+)$/.exec(t.secId)
    if (!m) return false
    const def = companyDef(inf, Number(m[1]), Number(m[2]))
    return !def.real && ['industrials', 'automakers'].includes(def.sector) && exchangeYear(fam(g), anchor(g), inf, g.year).stocks[t.slot]?.id === t.secId
  })
  if (!hit) throw new Error('no made-up industrial company listed')
  return hit
}

function held(g: GameState, secId: string): Asset | undefined {
  return investmentHoldings(g).find((a) => a.details.secId === secId)
}

interface CaseRow { id: string; status: string; held?: unknown; gain: number; stake: number; countryId: string; age: number; cause: string; secId: string }
function cases(g: GameState): CaseRow[] {
  const p = g.flags['special.politics'] as unknown as { abuse?: { cases: CaseRow[] } } | undefined
  return p?.abuse?.cases ?? []
}
const theCase = (g: GameState): CaseRow => cases(g)[0]

/** Fresh shares, a bullish law, one open policy case whose paper gain is a fixed, known amount. */
function startCase(g: GameState, gain = GAIN): void {
  const t = holdable(g)
  expect(buySecurity(g, t.secId, 40_000_000)).toBe(true)
  expect(held(g, t.secId)).toBeDefined()
  officeHooks().policyMove(g, 'industry', true, 'Test law')
  expect(cases(g)).toHaveLength(1)
  theCase(g).gain = gain
}

/** The press finds out and the player answers; the case is read afterwards from the saved state. */
function expose(g: GameState, choice = 'deny'): void {
  g.queue = []
  runScript(g, 'special.pol.abuse.exposed', choice, { caseId: theCase(g).id }, NO_MODAL)
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}
function noticeTexts(g: GameState): string {
  return notices(g).map((n) => n.text).join('\n')
}
function arrestModal(g: GameState): ChoiceModal | undefined {
  return g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'crime.arrest')
}
function arrestData(g: GameState): { refund: number; defendant?: string; severity: number; charges: string[] } {
  return arrestModal(g)!.data as unknown as { refund: number; defendant?: string; severity: number; charges: string[] }
}

/** Answer the trial chain: cooperate, free lawyer, then accept or refuse a plea deal. */
function runTrial(g: GameState, plea: 'accept' | 'trial' = 'trial'): void {
  for (let guard = 0; guard < 10; guard++) {
    const m = arrestModal(g) ?? g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && !!x.scriptId?.startsWith('crime.trial.'))
    if (!m) return
    g.queue.splice(g.queue.indexOf(m), 1)
    if (m.scriptId === 'crime.arrest') runScript(g, m.scriptId, 'cooperate', m.data, m)
    else if (m.scriptId === 'crime.trial.lawyer') runScript(g, m.scriptId, 'pd', m.data, m)
    else if (m.scriptId === 'crime.trial.plea') runScript(g, m.scriptId, plea, m.data, m)
    else if (m.scriptId === 'crime.trial.feds') runScript(g, m.scriptId, 'refuse', m.data, m)
    else return
  }
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
function prisonAction(g: GameState, id: string): MenuAction {
  const n = findNode(g, prisonMenu.children(g), id)
  if (!n || n.type !== 'action') throw new Error(`no prison action ${id}`)
  return n
}

const logText = (g: GameState): string => g.log.flatMap((y) => y.entries.map((e) => e.text)).join('\n')

/** Years pass for a politics profile: the clock moves, yearly actions reset, the yearly hooks run. */
function tick(g: GameState, years = 1): void {
  g.character.age += years
  g.year += years
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.queue = []
  yearlySpecial(g)
}

function leaveOffice(g: GameState): void {
  g.character.job = null
}

const roundTrips = (g: GameState): void => {
  const json = JSON.stringify(g)
  expect(JSON.stringify(JSON.parse(json))).toBe(json)
  expect(json).not.toMatch(/NaN|Infinity/)
  expect(JSON.stringify(cases(g))).not.toMatch(/"held":0\b/)
}

/** A US president whose case was opened by the regulator and is waiting out the immunity (`cash`: the bank before the seizure). */
function pendingPresident(seed: number): { g: GameState; cash: number } | null {
  const g = official('us', seed)
  startCase(g)
  const cash = g.character.money
  expose(g)
  return theCase(g).status === 'pending' ? { g, cash } : null
}

// ---------------------------------------------------------------------------

describe('the regulator holds what it takes', () => {
  it('a seizure sets `held` to the amount that left the bank and the text says it is held', () => {
    let seen = 0
    let skipped = 0
    for (const seed of SEEDS) {
      const g = official('us', seed)
      startCase(g)
      const cash0 = g.character.money
      expose(g)
      const cs = theCase(g)
      if (cs.status !== 'pending') {
        // Not investigated: nothing was taken and nothing is held.
        expect(cs.status).toBe('closed')
        expect(cs.held).toBeUndefined()
        expect(g.character.money).toBe(cash0)
        skipped++
        continue
      }
      seen++
      expect(cs.held).toBe(GAIN)
      expect(g.character.money).toBe(cash0 - GAIN)
      // Nothing was created or destroyed: the bank and the case together still hold the old balance.
      expect(g.character.money + (cs.held as number)).toBe(cash0)
      const text = noticeTexts(g)
      expect(text).toContain(formatMoney(GAIN))
      expect(text).toMatch(/holding .* until the case is decided/)
      expect(text).not.toMatch(/seized/)
      roundTrips(g)
    }
    expect(seen).toBeGreaterThan(5)
    expect(skipped).toBeGreaterThan(0)
  })

  it('bets the investigators freeze stay lost; only the cash they take is held', () => {
    let seen = 0
    for (const seed of SEEDS) {
      const g = official('us', seed)
      const t = holdable(g)
      moneyState(g).broker = 'Summit Securities'
      expect(placeBet(g, { via: 'own', secId: t.secId, kind: 'call', strike: 'atm', stake: 100_000 })).not.toBeNull()
      officeHooks().policyMove(g, 'industry', true, 'Test law')
      expect(cases(g)).toHaveLength(1)
      theCase(g).gain = GAIN
      const cash0 = g.character.money
      expose(g)
      if (theCase(g).status !== 'pending') continue
      seen++
      expect(moneyState(g).bets.filter((b) => b.caseId)).toHaveLength(0)
      expect(theCase(g).held).toBe(GAIN)
      // The premium left the bank when the bet was placed, so the only new change is what is held.
      expect(g.character.money).toBe(cash0 - GAIN)
      expect(noticeTexts(g)).toMatch(/froze .* of open bets and are holding/)
    }
    expect(seen).toBeGreaterThan(5)
  })

  it('takes nothing when the player has nothing to take, and never more than the bank holds', () => {
    let seen = 0
    for (const seed of SEEDS) {
      const poor = official('us', seed, 5_000_000_000)
      startCase(poor)
      poor.character.money = 1_000
      expose(poor)
      if (theCase(poor).status !== 'pending') continue
      seen++
      expect(theCase(poor).held).toBe(1_000)
      expect(poor.character.money).toBe(0)
      const broke = official('us', seed, 5_000_000_000)
      startCase(broke)
      broke.character.money = 0
      expose(broke)
      expect(theCase(broke).held).toBeUndefined()
      expect(broke.character.money).toBe(0)
      expect(noticeTexts(broke)).not.toMatch(/holding/)
    }
    expect(seen).toBeGreaterThan(3)
  })

  it('opening the same case again takes nothing more than the profit it claims', () => {
    let seen = 0
    for (const seed of SEEDS) {
      const g = official('us', seed)
      startCase(g)
      const cash0 = g.character.money
      expose(g)
      if (theCase(g).status !== 'pending') continue
      seen++
      expect(theCase(g).held).toBe(GAIN)
      // A replayed popup (or a second pass over the same pending case) finds nothing more to take.
      expose(g)
      if (theCase(g).status === 'pending') {
        expect(theCase(g).held).toBe(GAIN)
        expect(g.character.money).toBe(cash0 - GAIN)
      } else {
        // The regulator dropped it this time: the case ends without a trial and gives back what it held.
        expect(theCase(g).status).toBe('closed')
        expect(theCase(g).held).toBeUndefined()
        expect(g.character.money).toBe(cash0)
      }
    }
    expect(seen).toBeGreaterThan(3)
  })

  it('an immediate arrest hands the held money and the regulator to the trial', () => {
    let seen = 0
    for (const seed of SEEDS) {
      const g = official('gb', seed)
      startCase(g)
      const cash0 = g.character.money
      expose(g)
      if (!arrestModal(g)) continue
      seen++
      const data = arrestData(g)
      expect(data.refund).toBe(GAIN)
      expect(data.defendant).toBe(regulator('gb'))
      expect(data.defendant).toBe('the FCA')
      expect(g.character.money).toBe(cash0 - GAIN)
      // The trial owns it now: the case no longer holds it a second time.
      expect(theCase(g).held).toBeUndefined()
      expect(theCase(g).status).toBe('closed')
      expect(noticeTexts(g)).toMatch(/holding .* until the case is decided/)
    }
    expect(seen).toBeGreaterThan(5)
  })
})

// ---------------------------------------------------------------------------

describe('a later law joins the case on that security instead of starting another', () => {
  it('a pending case takes in a second law: one case, one seizure, one trial', () => {
    let arrested = 0
    let folded = 0
    for (let seed = 1; seed <= 200 && arrested < 2; seed++) {
      const p = pendingPresident(seed)
      if (!p) continue
      const { g } = p
      folded++
      const stake1 = theCase(g).stake
      // A much bigger fresh buy, then a second law on the same industry while the case waits out the immunity.
      expect(buySecurity(g, holdable(g).secId, 400_000_000)).toBe(true)
      expect(officeHooks().policyWarning(g, 'industry', true, 'Second law')).toBe(`This moves ${holdable(g).name} again. It adds to the insider trading case the SEC could bring.`)
      const bank = g.character.money
      g.queue = []
      officeHooks().policyMove(g, 'industry', true, 'Second law')
      expect(cases(g)).toHaveLength(1)
      expect(theCase(g).status).toBe('pending')
      expect(theCase(g).stake).toBeGreaterThan(stake1)
      // Already investigated: the gain the money was taken on stays, and nothing more is taken.
      expect(theCase(g).gain).toBe(GAIN)
      expect(theCase(g).held).toBe(GAIN)
      expect(g.character.money).toBe(bank)
      leaveOffice(g)
      let arrests = 0
      let exposures = 0
      for (let year = 0; year < 12; year++) {
        tick(g)
        if (arrestModal(g)) {
          arrests++
          expect(arrestData(g).refund).toBe(GAIN)
        }
        exposures += g.queue.filter((m) => m.kind === 'choice' && m.scriptId === 'special.pol.abuse.exposed').length
      }
      expect(exposures).toBe(0)
      expect(arrests).toBeLessThanOrEqual(1)
      expect(theCase(g).status).toBe('closed')
      arrested += arrests
    }
    expect(folded).toBeGreaterThan(2)
    expect(arrested).toBeGreaterThan(0)
  })

  it('a small first case, then a big fresh buy and a second law: the seizure covers the big position', () => {
    let seen = 0
    for (const seed of SEEDS) {
      const g = official('gb', seed)
      const t = holdable(g)
      expect(buySecurity(g, t.secId, 1_000_000)).toBe(true)
      officeHooks().policyMove(g, 'industry', true, 'First law')
      expect(cases(g)).toHaveLength(1)
      const small = { ...theCase(g) }
      expect(small.gain).toBeGreaterThan(0)
      expect(buySecurity(g, t.secId, 400_000_000)).toBe(true)
      officeHooks().policyMove(g, 'industry', true, 'Second law')
      expect(cases(g)).toHaveLength(1)
      const { stake, gain } = theCase(g)
      expect(stake).toBeGreaterThan(small.stake * 100)
      expect(gain).toBeGreaterThan(small.gain * 100)
      const cash0 = g.character.money
      expose(g)
      if (!arrestModal(g)) continue
      seen++
      expect(arrestData(g).refund).toBe(gain)
      expect(g.character.money).toBe(cash0 - gain)
      if (seen >= 3) break
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('a pending case the regulator then drops gives back what it held', () => {
    let dropped = 0
    for (const seed of SEEDS) {
      const p = pendingPresident(seed)
      if (!p) continue
      const { g, cash: cash0 } = p
      const cash = g.character.money
      // The popup comes back (a replay) and this time the regulator lets the case go.
      expose(g)
      if (theCase(g).status !== 'closed') continue
      dropped++
      expect(arrestModal(g)).toBeUndefined()
      expect(theCase(g).held).toBeUndefined()
      expect(g.character.money).toBe(cash + GAIN)
      expect(g.character.money).toBe(cash0)
      expect(logText(g)).toContain(`I got back the ${formatMoney(GAIN)} held in my case.`)
      roundTrips(g)
    }
    expect(dropped).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------

describe('the trial decides who keeps it', () => {
  it('an acquittal returns every cent once, a conviction forfeits it and remembers it for an appeal', () => {
    let acquitted = 0
    let convicted = 0
    for (const seed of SEEDS) {
      const g = official('gb', seed)
      startCase(g)
      const cash0 = g.character.money
      expose(g)
      if (!arrestModal(g)) continue
      runTrial(g)
      if (g.character.prison) {
        convicted++
        expect(g.character.money).toBe(cash0 - GAIN)
        const rec = g.character.criminalRecord.filter((r) => r.convicted)
        expect(rec).toHaveLength(1)
        expect(rec[0].refund).toBe(GAIN)
        expect(noticeTexts(g)).not.toContain('got back')
      } else {
        acquitted++
        expect(g.character.money).toBe(cash0)
        expect(noticeTexts(g)).toContain(`You got back the ${formatMoney(GAIN)} taken in your case.`)
        expect(g.character.criminalRecord.every((r) => r.refund === undefined)).toBe(true)
        // The grievance the acquittal files names the regulator.
        expect(defendants(g).some((d) => d.name === 'the FCA')).toBe(true)
      }
      expect(theCase(g).held).toBeUndefined()
      roundTrips(g)
    }
    expect(acquitted).toBeGreaterThan(0)
    expect(convicted).toBeGreaterThan(0)
  })

  it('a plea deal forfeits it too', () => {
    let pleas = 0
    for (const seed of SEEDS) {
      const g = official('gb', seed)
      startCase(g)
      const cash0 = g.character.money
      expose(g)
      if (!arrestModal(g)) continue
      runTrial(g, 'accept')
      if (!notices(g).some((n) => n.title === 'Plea Accepted')) continue
      pleas++
      expect(g.character.money).toBe(cash0 - GAIN)
      expect(g.character.criminalRecord.find((r) => r.convicted)?.refund).toBe(GAIN)
    }
    expect(pleas).toBeGreaterThan(0)
  })

  it('a successful appeal gives it back; a lost appeal keeps it on the record', () => {
    let won = 0
    let lost = 0
    for (const seed of SEEDS) {
      // Same life twice: the only difference is whether the regulator took anything.
      const make = (gain: number): GameState | null => {
        const g = official('gb', seed)
        startCase(g, gain)
        expose(g)
        if (!arrestModal(g)) return null
        runTrial(g)
        if (!g.character.prison) return null
        g.character.money = 1_000_000_000
        g.character.hidden.karma = 100
        return g
      }
      const control = make(0)
      const treated = make(GAIN)
      if (!control || !treated) continue
      prisonAction(control, 'prison.appeal.top').run(control)
      prisonAction(treated, 'prison.appeal.top').run(treated)
      expect(!!treated.character.prison).toBe(!!control.character.prison)
      if (treated.character.prison) {
        lost++
        expect(treated.character.money).toBe(control.character.money)
        expect(treated.character.criminalRecord.find((r) => r.convicted)?.refund).toBe(GAIN)
        continue
      }
      won++
      expect(treated.character.money - control.character.money).toBe(GAIN)
      expect(noticeTexts(treated)).toContain(formatMoney(GAIN))
      expect(treated.character.criminalRecord.every((r) => r.refund === undefined)).toBe(true)
    }
    expect(won).toBeGreaterThan(0)
    expect(lost).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------

describe('a case that ends without a trial returns the money', () => {
  it('the statute of limitations closes it and the held money comes back', () => {
    let seen = 0
    for (const seed of SEEDS) {
      const p = pendingPresident(seed)
      if (!p) continue
      const { g, cash: cash0 } = p
      seen++
      leaveOffice(g)
      const cash = g.character.money
      expect(theCase(g).held).toBe(GAIN)
      tick(g, 11)
      expect(theCase(g).status).toBe('closed')
      expect(theCase(g).held).toBeUndefined()
      expect(g.character.money).toBe(cash + GAIN)
      expect(g.character.money).toBe(cash0)
      expect(logText(g)).toContain('The statute of limitations ran out')
      expect(logText(g)).toContain(`I got back the ${formatMoney(GAIN)} held in my case.`)
      expect(arrestModal(g)).toBeUndefined()
      roundTrips(g)
    }
    expect(seen).toBeGreaterThan(5)
  })

  it('a case file lost in a flood returns it', () => {
    let floods = 0
    for (let seed = 1; seed <= 400 && floods < 4; seed++) {
      const p = pendingPresident(seed)
      if (!p) continue
      const { g, cash: cash0 } = p
      leaveOffice(g)
      const cash = g.character.money
      tick(g)
      if (!logText(g).includes('lost in a flood')) continue
      floods++
      expect(theCase(g).status).toBe('closed')
      expect(theCase(g).held).toBeUndefined()
      expect(g.character.money).toBe(cash + GAIN)
      expect(g.character.money).toBe(cash0)
      expect(logText(g)).toContain(`I got back the ${formatMoney(GAIN)} held in my case.`)
      expect(arrestModal(g)).toBeUndefined()
      roundTrips(g)
    }
    expect(floods).toBeGreaterThan(0)
  })

  it('a case that is still pending keeps the money, in office or out, and a save in between loses nothing', () => {
    let kept = 0
    for (const seed of SEEDS) {
      const p = pendingPresident(seed)
      if (!p) continue
      const { g } = p
      // In office the case waits: the yearly check leaves it and its money alone.
      const cash = g.character.money
      tick(g)
      expect(theCase(g).status).toBe('pending')
      expect(theCase(g).held).toBe(GAIN)
      expect(g.character.money).toBeGreaterThanOrEqual(cash)
      // Out of office, a quiet year (no flood, no arrest) leaves it pending with the money still held.
      const copy = JSON.parse(JSON.stringify(g)) as GameState
      expect(theCase(copy).held).toBe(GAIN)
      leaveOffice(copy)
      const cash1 = copy.character.money
      tick(copy)
      if (theCase(copy).status !== 'pending' || arrestModal(copy)) continue
      kept++
      expect(theCase(copy).held).toBe(GAIN)
      expect(copy.character.money).toBe(cash1)
    }
    expect(kept).toBeGreaterThan(0)
  })

  it('the later arrest passes the held money to the trial, which then decides', () => {
    let acquitted = 0
    let convicted = 0
    for (let seed = 1; seed <= 200 && (acquitted < 2 || convicted < 2); seed++) {
      const p = pendingPresident(seed)
      if (!p) continue
      const { g, cash: cash0 } = p
      leaveOffice(g)
      const cash = g.character.money
      let arrested = false
      for (let year = 0; year < 3 && !arrested; year++) {
        tick(g)
        arrested = !!arrestModal(g)
        if (!arrested && theCase(g).status !== 'pending') break
      }
      if (!arrested) continue
      const data = arrestData(g)
      expect(data.refund).toBe(GAIN)
      expect(data.defendant).toBe('the SEC')
      expect(theCase(g).held).toBeUndefined()
      expect(theCase(g).status).toBe('closed')
      runTrial(g)
      if (g.character.prison) {
        convicted++
        // Forfeited: whatever came in since is salary-free, so the bank is exactly where the arrest found it.
        expect(g.character.money).toBe(cash)
        expect(g.character.criminalRecord.find((r) => r.convicted)?.refund).toBe(GAIN)
      } else {
        acquitted++
        expect(g.character.money).toBe(cash + GAIN)
        expect(g.character.money).toBe(cash0)
      }
      roundTrips(g)
    }
    expect(acquitted).toBeGreaterThan(0)
    expect(convicted).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------

describe('old saves and hostile saves', () => {
  it('a pending case from an old save (money already gone) closes quietly: no refund, no extra line', () => {
    let seen = 0
    for (const seed of SEEDS) {
      const p = pendingPresident(seed)
      if (!p) continue
      const { g } = p
      seen++
      delete (theCase(g) as { held?: unknown }).held
      leaveOffice(g)
      const cash = g.character.money
      tick(g, 11)
      expect(theCase(g).status).toBe('closed')
      expect(g.character.money).toBe(cash)
      expect(logText(g)).toContain('The statute of limitations ran out')
      expect(logText(g)).not.toContain('held in my case')
    }
    expect(seen).toBeGreaterThan(5)
  })

  it('a pending case from an old save is arrested with no refund', () => {
    let arrests = 0
    for (let seed = 1; seed <= 200 && arrests < 3; seed++) {
      const p = pendingPresident(seed)
      if (!p) continue
      const { g } = p
      delete (theCase(g) as { held?: unknown }).held
      leaveOffice(g)
      for (let year = 0; year < 3 && !arrestModal(g); year++) tick(g)
      if (!arrestModal(g)) continue
      arrests++
      expect(arrestData(g).refund).toBe(0)
    }
    expect(arrests).toBeGreaterThan(0)
  })

  it('damaged `held` values are repaired when the game loads the case, and a good one survives', () => {
    const g = (pendingPresident(3) ?? pendingPresident(4) ?? pendingPresident(5) ?? pendingPresident(6))?.g
    expect(g).toBeDefined()
    const base = { ...theCase(g!) }
    const make = (id: string, value: unknown) => ({ ...base, id, held: value })
    const bad: [string, unknown][] = [
      ['neg', -5], ['nan', Number.NaN], ['inf', Number.POSITIVE_INFINITY], ['ninf', Number.NEGATIVE_INFINITY], ['str', '1000'], ['obj', { x: 1 }],
      ['arr', [5]], ['bool', true], ['nul', null], ['huge', 1e300], ['frac', 1234.6], ['zero', 0],
    ]
    const p = g!.flags['special.politics'] as unknown as { owner: string; abuse: { cases: unknown[] } }
    p.owner = ownerKey(g!)
    p.abuse.cases = [make('good', GAIN), ...bad.map(([id, v]) => make(id, v))]
    g!.queue = []
    yearlySpecial(g!)
    const byId = Object.fromEntries(cases(g!).map((c) => [c.id, c.held]))
    expect(byId.good).toBe(GAIN)
    for (const id of ['neg', 'nan', 'inf', 'ninf', 'str', 'obj', 'arr', 'bool', 'nul', 'zero']) expect(byId[id], id).toBeUndefined()
    expect(byId.huge).toBe(1e15)
    expect(Number.isInteger(byId.frac)).toBe(true)
    expect(byId.frac as number).toBeGreaterThanOrEqual(1234)
    expect(byId.frac as number).toBeLessThanOrEqual(1235)
    for (const c of cases(g!)) {
      if (c.held !== undefined) {
        expect(Number.isFinite(c.held)).toBe(true)
        expect(c.held as number).toBeGreaterThan(0)
        expect(c.held as number).toBeLessThanOrEqual(1e15)
      }
    }
    expect(JSON.stringify(cases(g!))).not.toMatch(/"held":(-|null|"|\[|\{|true|0\b)/)
  })

  it('a case that goes cold gives back anything it somehow held (a damaged open case)', () => {
    let closed = 0
    for (const seed of SEEDS) {
      const g = official('us', seed)
      startCase(g)
      leaveOffice(g)
      ;(theCase(g) as { held?: unknown; quiet?: number }).held = 5_000
      ;(theCase(g) as { quiet?: number }).quiet = 3
      const cash = g.character.money
      tick(g)
      if (theCase(g).status !== 'closed' || !logText(g).includes('The trail went cold')) continue
      closed++
      expect(theCase(g).held).toBeUndefined()
      expect(g.character.money).toBe(cash + 5_000)
      expect(logText(g)).toContain(`I got back the ${formatMoney(5_000)} held in my case.`)
    }
    expect(closed).toBeGreaterThan(0)
  })

  it('a hostile `held` on a case that ends is paid back within the game\'s ceiling, never more', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = pendingPresident(seed)
      if (!p) continue
      const { g } = p
      ;(theCase(g) as { held?: unknown }).held = 1e300
      leaveOffice(g)
      const cash = g.character.money
      tick(g, 11)
      expect(Number.isFinite(g.character.money)).toBe(true)
      expect(g.character.money - cash).toBeLessThanOrEqual(1e15)
      return
    }
    throw new Error('no pending case in 40 seeds')
  })
})

// ---------------------------------------------------------------------------

describe('through the real save path', () => {
  const fixture = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>

  /** An old save (schema 1) of a person with a politics record whose pending case holds `held`. */
  function load(held: unknown): GameState {
    const raw = structuredClone(fixture) as unknown as GameState
    raw.character.job = null
    raw.character.prison = null
    raw.queue = []
    raw.flags['special.politics'] = {
      held: [], wins: 0, losses: 0, party: '', billsPassed: 0, vetoes: 0, impeached: 0, formerLeader: false, formerLeaderTitle: '', owner: ownerKey(raw),
      abuse: {
        heat: 0, moves: 1, crony: '',
        cases: [{ id: 'case1', age: raw.character.age - 11, year: raw.year - 11, target: 'Severn Industries', symbol: 'SEVA', secId: 'x#s1g1', cause: 'policy', stake: 5, via: 'shares', crony: '', evidence: 0.5, status: 'pending', office: 'leader', title: 'President', countryId: 'us', quiet: 0, extra: [], gain: 5, bullish: true, ...(held === undefined ? {} : { held }) }],
      },
    } as never
    const out = migrateSave(JSON.parse(JSON.stringify(raw)))
    if (out.kind !== 'ready') throw new Error(`save did not load: ${out.kind}`)
    return out.game
  }

  it('a saved case keeps what it holds, and the statute of limitations after the load gives it back', () => {
    const g = load(750_000)
    expect(theCase(g).held).toBe(750_000)
    g.character.age += 1
    g.year += 1
    g.yearActions = {}
    const cash = g.character.money
    yearlySpecial(g)
    expect(theCase(g).status).toBe('closed')
    expect(theCase(g).held).toBeUndefined()
    // The old save's balance carries cents; the game rounds money when it is paid in.
    expect(Math.abs(g.character.money - cash - 750_000)).toBeLessThan(1)
  })

  it('a save from before this change loads and closes as before, with nothing to give back', () => {
    const g = load(undefined)
    expect('held' in theCase(g)).toBe(false)
    g.character.age += 1
    g.year += 1
    g.yearActions = {}
    const cash = g.character.money
    yearlySpecial(g)
    expect(theCase(g).status).toBe('closed')
    expect(Math.abs(g.character.money - cash)).toBeLessThan(1)
  })

  it('damaged values never cost the save, and none of them pays anything out', () => {
    for (const bad of [-5, 'lots', null, {}, [1], true, 0]) {
      const g = load(bad)
      g.character.age += 1
      g.year += 1
      g.yearActions = {}
      const cash = g.character.money
      yearlySpecial(g)
      expect(theCase(g).status, JSON.stringify(bad)).toBe('closed')
      expect(Math.abs(g.character.money - cash), JSON.stringify(bad)).toBeLessThan(1)
      expect('held' in theCase(g)).toBe(false)
    }
  })
})
