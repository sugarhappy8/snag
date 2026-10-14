// The report that started this, as one story through real code: "i was a paralament member in the UK then
// i invested 2 trillion gpb and they said i was insider trading even though i didnt do anything just bought
// stocks. then they took all my money away and didnt return it and when i sued i didnt get any money."
//
// A UK MP with 3 trillion internal dollars buys 2 trillion of one made-up company's shares. The Buy action
// warns first and the notice is honest after; the bill is warned about before it is confirmed; the MP is
// flagged once, with a fair charge and sentence; the money the regulator takes is held and comes back on an
// acquittal; the acquittal files a suit that exists in Activities, Lawsuit; Do Anything points there. The
// same MP with shares bought ten years earlier is not warned and not flagged.
import { describe, expect, it } from 'vitest'
import { defendants, lawsuitMenu } from '../src/game/activities/lawsuit'
import { anchor, fam, regulator } from '../src/game/computer/money-common'
import { listedTargets, type BetTarget } from '../src/game/computer/money-stocks'
import { formatMoney } from '../src/game/core'
import { resolveCustomAction } from '../src/game/events/custom'
import { companyDef, exchangeInfo, exchangeYear } from '../src/game/invest/engine'
import { marketShocks } from '../src/game/invest/shocks'
import { buyImpactLimit, buySecurity, investmentHoldings, investmentsMenu } from '../src/game/investments'
import { propose, resolveBill, type Measure } from '../src/game/nation/govern'
import { legislatureOf } from '../src/game/nation/legislature'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import type { Asset, ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

const BIG = 2_000_000_000_000
const TARIFF: Measure = { k: 'tariff', input: 'industry', partner: 'cn', add: 10 }
const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1)

/** A UK MP: a politician in the middle rung ('governor') with no regional head, so a legislator. */
function ukMp(seed: number, money = 3_000_000_000_000): GameState {
  const g = makeTestGame(seed, { age: 55, countryId: 'gb', birthCountryId: 'gb', money })
  g.character.job = {
    defId: 'politician',
    title: 'Member of Parliament',
    company: 'Westminster',
    category: 'special',
    salary: 100_000,
    level: 2,
    performance: 60,
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { office: 'governor', party: 'centrist', approval: 60, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: 55, roleStartAge: 55 },
  }
  // A backbencher of the governing party: bills pass often enough to tell the story.
  const [party] = legislatureOf(g, 'gb').gov
  if (party) (g.character.job.data as Record<string, unknown>).party = party
  return g
}

function warp(g: GameState, year: number): void {
  g.character.age += year - g.year
  g.year = year
  g.yearActions = {}
}

/** A made-up industrial company listed under the same id in every given year. */
function company(g: GameState, years: number[]): BetTarget {
  const inf = exchangeInfo(g.character.countryId)
  const hit = listedTargets(g).find((t) => {
    const m = /s(\d+)g(\d+)$/.exec(t.secId)
    if (!m) return false
    const def = companyDef(inf, Number(m[1]), Number(m[2]))
    return !def.real && ['industrials', 'automakers'].includes(def.sector) && years.every((y) => exchangeYear(fam(g), anchor(g), inf, y).stocks[t.slot]?.id === t.secId)
  })
  if (!hit) throw new Error('no made-up industrial company listed')
  return hit
}

function find(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu' && n.id.startsWith('inv-')) {
      const hit = find(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

function buyRow(g: GameState, secId: string): MenuAction {
  const n = find(g, investmentsMenu.children(g), `inv-buy-${secId}`)
  if (!n || n.type !== 'action') throw new Error(`no Buy action for ${secId}`)
  return n
}
const sub = (g: GameState, n: MenuAction): string => (typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''))

function notices(g: GameState, title?: string): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && (!title || m.title === title))
}
const allText = (g: GameState): string => notices(g).map((n) => n.text).join('\n')

interface CaseRow { id: string; status: string; via: string; cause: string; stake: number; secId: string; bullish?: boolean; held?: number; gain: number }
function cases(g: GameState): CaseRow[] {
  const p = g.flags['special.politics'] as unknown as { abuse?: { cases: CaseRow[]; heat: number } } | undefined
  return p?.abuse?.cases ?? []
}
const heat = (g: GameState): number => (g.flags['special.politics'] as unknown as { abuse: { heat: number } }).abuse.heat

/** The bill popup for a measure. */
function popup(g: GameState, m: Measure): ChoiceModal {
  g.queue = []
  propose(g, m)
  const modal = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'nation.bill')
  if (!modal) throw new Error(`no bill popup: ${JSON.stringify(g.queue.map((q) => (q.kind === 'notice' ? q.text : q.kind)))}`)
  return modal
}

const WARNING = /insider trading/

/** Buy `amount` of the company, `yearsAgo` years back, then come back to 2026. */
function mpWithShares(seed: number, amount: number, yearsAgo = 0): { g: GameState; t: BetTarget } {
  const g = ukMp(seed)
  const t = company(g, [2026 - yearsAgo, 2026])
  warp(g, 2026 - yearsAgo)
  expect(buySecurity(g, t.secId, amount)).toBe(true)
  warp(g, 2026)
  g.queue = []
  return { g, t }
}

/** The law moved the industry's shares (it was enacted), whether or not the MP held any. */
const enactedLaw = (g: GameState): boolean => marketShocks(g).some((s) => s.cause === 'policy')

/** Propose the bill, read the popup, confirm it. Returns the popup text and whether the law was enacted. */
function passTariff(g: GameState): { text: string; enacted: boolean } {
  const modal = popup(g, TARIFF)
  const text = modal.text
  g.queue = []
  runScript(g, 'nation.bill', 'none', modal.data, modal)
  return { text, enacted: enactedLaw(g) }
}

// ---------------------------------------------------------------------------

describe('what the player sees around a 2 trillion buy', () => {
  it('the Buy action says where price impact starts to hurt, long before the order is placed', () => {
    const g = ukMp(1)
    const t = company(g, [2026])
    const text = sub(g, buyRow(g, t.secId))
    expect(text).toMatch(/Orders above about .* lose over 10% to price impact/)
    // The order he typed is thousands of times past it.
    expect(BIG / buyImpactLimit(500_000_000)).toBeGreaterThan(5_000)
  })

  it('the notice after it says what the order lost on paper and what selling it all returns', () => {
    const g = ukMp(1)
    const t = company(g, [2026])
    expect(buySecurity(g, t.secId, BIG)).toBe(true)
    const a = investmentHoldings(g)[0]
    const text = notices(g, 'Order Filled').pop()!.text
    expect(text).toMatch(/on paper it lost 99\.\d% of what you paid/)
    expect(text).toMatch(/A full sale would return about .*, before tax\./)
    expect(text).not.toContain('large orders move the market')
    // The header agrees: the marked loss stays, and what it would sell for is added.
    const top = investmentsMenu.header!(g).split('\n')[0]
    expect(top).toMatch(/Loss: .* \(-99\.\d%\) · Sells for about /)
    const sellAll = find(g, investmentsMenu.children(g), `inv-sellall-${a.id}`) as MenuAction
    const estimate = /About (.+?) after fees/.exec(sub(g, sellAll))![1]
    expect(text).toContain(estimate)
    expect(top).toContain(`Sells for about ${estimate}`)
  })
})

describe('the bill', () => {
  it('warns before the vote, flags the MP once, and a second bill adds to that case instead of opening another', () => {
    let enacted = 0
    for (const seed of SEEDS) {
      const { g, t } = mpWithShares(seed, BIG)
      const { text, enacted: passed } = passTariff(g)
      // Said before the vote, whatever the vote does.
      expect(text, `seed ${seed}`).toMatch(WARNING)
      expect(text).toContain(t.name)
      if (!passed) {
        expect(cases(g), `seed ${seed}`).toHaveLength(0)
        continue
      }
      enacted++
      expect(cases(g)).toHaveLength(1)
      expect(cases(g)[0]).toMatchObject({ via: 'shares', cause: 'policy', bullish: true, status: 'open', secId: t.secId })
      const heat1 = heat(g)
      const karma1 = g.character.hidden.karma
      const case1 = { ...cases(g)[0] }
      // A second bill on the same industry: the warning says it adds to the case the first one started (the shares it
      // lifts again would add to the gain), not that a new case would start; and no second case, heat or karma.
      let second = false
      for (const partner of ['de', 'jp', 'fr', 'in', 'br']) {
        const m: Measure = { k: 'tariff', input: 'industry', partner, add: 5 }
        // A failed vote also uses up one of the year's two bills: start the quota over, the case is what is under test.
        g.yearActions = {}
        const modal = popup(g, m)
        expect(modal.text, `seed ${seed} ${partner}`).toContain(`This moves ${t.name} again. It adds to the insider trading case the FCA could bring.`)
        expect(modal.text, `seed ${seed} ${partner}`).not.toMatch(/could call it insider trading/)
        g.queue = []
        if (resolveBill(g, m, 'none')) { second = true; break }
      }
      expect(second, `seed ${seed}: a second bill passed`).toBe(true)
      expect(cases(g)).toHaveLength(1)
      expect(cases(g)[0]).toMatchObject({ id: case1.id, via: 'shares', status: 'open', bullish: true })
      expect(cases(g)[0].stake).toBeGreaterThanOrEqual(case1.stake)
      expect(cases(g)[0].gain).toBeGreaterThan(case1.gain)
      expect(heat(g)).toBe(heat1)
      expect(g.character.hidden.karma).toBe(karma1)
      if (enacted >= 3) break
    }
    expect(enacted).toBeGreaterThan(0)
  })

  it('the same MP with shares bought ten years ago is not warned and not flagged', () => {
    let enacted = 0
    for (const seed of SEEDS) {
      const { g } = mpWithShares(seed, BIG, 10)
      const { text, enacted: passed } = passTariff(g)
      expect(text, `seed ${seed}`).not.toMatch(WARNING)
      expect(cases(g), `seed ${seed}`).toHaveLength(0)
      expect(allText(g)).not.toMatch(/moved with your own law/)
      if (passed) enacted++
      if (enacted >= 3) break
    }
    // The bill did pass for some of them: it is the shares' age that kept them out of it, not a failed vote.
    expect(enacted).toBeGreaterThan(0)
  })

  it('shares bought last year still count; the year before does not', () => {
    const outcome = (yearsAgo: number): { warned: boolean; cases: number } | null => {
      for (const seed of SEEDS) {
        const { g } = mpWithShares(seed, 50_000_000, yearsAgo)
        const modal = popup(g, TARIFF)
        g.queue = []
        runScript(g, 'nation.bill', 'none', modal.data, modal)
        if (enactedLaw(g)) return { warned: WARNING.test(modal.text), cases: cases(g).length }
      }
      return null
    }
    expect(outcome(1)).toEqual({ warned: true, cases: 1 })
    expect(outcome(2)).toEqual({ warned: false, cases: 0 })
  })
})

// ---------------------------------------------------------------------------

/** Years pass for the MP until the press connects the dots; the exposure popup is left in the queue. */
function exposeInYears(g: GameState): ChoiceModal | null {
  for (let year = 0; year < 8; year++) {
    g.character.age += 1
    g.year += 1
    g.yearActions = {}
    g.flags.taxableIncome = 0
    const job = g.character.job
    if (job) {
      Object.assign(job.data as Record<string, unknown>, { approval: 60, termLeft: 4 })
    }
    g.queue = []
    yearlySpecial(g)
    const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'special.pol.abuse.exposed')
    if (m) return m
  }
  return null
}

function arrestOf(g: GameState): ChoiceModal | undefined {
  return g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'crime.arrest')
}

function runTrial(g: GameState): void {
  for (let guard = 0; guard < 10; guard++) {
    const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && !!x.scriptId?.startsWith('crime.'))
    if (!m) return
    g.queue.splice(g.queue.indexOf(m), 1)
    const answer = m.scriptId === 'crime.arrest' ? 'cooperate' : m.scriptId === 'crime.trial.lawyer' ? 'pd' : m.scriptId === 'crime.trial.plea' ? 'trial' : m.scriptId === 'crime.trial.feds' ? 'refuse' : ''
    if (!answer) return
    runScript(g, m.scriptId!, answer, m.data, m)
  }
}

describe('from the case to the courtroom and back', () => {
  it('the investigation holds the money, the sentence is fair, and an acquittal returns it and opens the Lawsuit menu', () => {
    let acquitted = 0
    let convicted = 0
    let investigated = 0
    for (const seed of SEEDS) {
      if (acquitted >= 2 && convicted >= 2) break
      const { g, t } = mpWithShares(seed, BIG)
      if (!passTariff(g).enacted || cases(g).length !== 1) continue
      const stake = cases(g)[0].stake
      // The stake is the marked value of the shares: far past the 9 million that used to mean a life sentence.
      expect(stake).toBeGreaterThan(9_000_000)
      const modal = exposeInYears(g)
      if (!modal) continue
      expect(cases(g).filter((c) => c.status !== 'closed')).toHaveLength(1)
      const cash0 = g.character.money
      g.queue = []
      runScript(g, 'special.pol.abuse.exposed', 'deny', modal.data, modal)
      const arrest = arrestOf(g)
      if (!arrest) {
        // Not investigated: nothing taken, nothing held.
        expect(g.character.money).toBe(cash0)
        continue
      }
      investigated++
      const data = arrest.data as unknown as { refund: number; defendant: string; severity: number; charges: string[]; crime: string }
      // Held, not destroyed: what left the bank is what the trial now owns.
      expect(data.refund).toBeGreaterThan(0)
      expect(g.character.money).toBe(cash0 - data.refund)
      expect(data.defendant).toBe(regulator('gb'))
      expect(data.severity).toBeLessThanOrEqual(3)
      expect(data.charges).toContain('Abuse Of Office')
      expect(data.charges).not.toContain('Market Manipulation')
      expect(allText(g)).toMatch(/holding .* until the case is decided/)
      runTrial(g)
      if (g.character.prison) {
        convicted++
        // A conviction forfeits it; the record remembers it for an appeal. Five to fifteen years, not a life sentence.
        expect(g.character.money).toBe(cash0 - data.refund)
        expect(g.character.prison.sentenceYears).toBeLessThanOrEqual(20)
        expect(g.character.prison.life).toBeFalsy()
        expect(g.character.criminalRecord.find((r) => r.convicted)?.refund).toBe(data.refund)
        continue
      }
      acquitted++
      // Cleared: every cent is back.
      expect(g.character.money).toBe(cash0)
      expect(allText(g)).toContain(`You got back the ${formatMoney(data.refund)} taken in your case.`)
      expect(allText(g)).toContain('You can sue the FCA under Activities, Lawsuit.')
      // The suit the notice promises exists, in Activities, Lawsuit.
      expect(defendants(g).some((d) => d.name === 'the FCA' && d.kind === 'police')).toBe(true)
      expect(lawsuitMenu.disabledReason?.(g) ?? null).toBeNull()
      const rows = lawsuitMenu.children(g).filter((n): n is MenuGroup => n.type === 'menu')
      expect(rows.map((r) => r.label)).toContain('The FCA')
      // And typing it into Do Anything points there instead of a random outcome or a brawl.
      g.queue = []
      const cash1 = g.character.money
      const fights = g.counters.fights ?? 0
      resolveCustomAction(g, 'sue the FCA')
      const answer = notices(g).pop()!
      expect(answer.title).toBe('Lawsuit')
      expect(answer.text).toMatch(/Activities menu, under Lawsuit/)
      expect(g.character.money).toBe(cash1)
      expect(g.counters.fights ?? 0).toBe(fights)
      expect(t.name.length).toBeGreaterThan(0)
    }
    expect(investigated).toBeGreaterThan(2)
    expect(acquitted).toBeGreaterThan(0)
    expect(convicted).toBeGreaterThan(0)
  })

  it('the player who fought the seizure in court is not sent to a brawl', () => {
    const g = ukMp(1)
    for (const text of ['fight the seizure in court', 'argue my case in court', 'sue the FCA to get my money back']) {
      g.queue = []
      resolveCustomAction(g, text)
      expect(notices(g).pop()!.title, text).toBe('Lawsuit')
      expect(g.counters.fights ?? 0).toBe(0)
    }
  })

  it('the shares themselves can be sold for about what was paid: nothing in the story destroys them', () => {
    const { g } = mpWithShares(1, BIG)
    const a: Asset = investmentHoldings(g)[0]
    const sellRow = find(g, investmentsMenu.children(g), `inv-sellall-${a.id}`) as MenuAction
    const estimate = /About (.+?) after fees/.exec(sub(g, sellRow))![1]
    const before = g.character.money
    sellRow.run(g, '')
    expect(formatMoney(g.character.money - before)).toBe(estimate)
    expect((g.character.money - before) / BIG).toBeGreaterThan(0.97)
  })
})
