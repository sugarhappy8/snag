// The menu rows of the acts (R4-E10a, D.4): `socialNodes(g, p)` is what a person's page on the Relationships screen gains on a life the
// social stamp marks. It is spliced into `personActions` (relationships.ts) before the will's rows, so the way back shows for an
// estranged person too. PURE: built from the state on screen, it reads and writes nothing and draws nothing (the odds in a subtitle are
// computed, not rolled); the `run` of a row re-reads the people from the state it is handed, because an action runs on a fresh draft.
//
//   Ask for a Favor          on a friend or relative who can be asked: the call-in (favor.ts helpAct)
//   Ask {name} to ...        on the same person: a good word with the third person the giver knows who thinks least of you
//   Ask {name} to Speak ...  on a CUT-OUT or estranged relative: a brokered peace through the best giver who can be asked now
//   Ask {name} for a Loan    on the same person (R4-E10b): a slider from the least to the most the person will lend, the rate and the odds
//                            in the subtitle (loan.ts); it shares the call-in cooldown of the favors, and comes after their rows
//   You owe {name} ...       an info row, while the player owes that person a loan
//
// The rows are visible for a living person who is not a pet while the player is alive and 16 or older, and the heading 'Favors' with
// them. A row whose act is blocked stays and greys itself out with the reason (cooldown, trust); a person the player has no feeling
// for at all (under 30) gets no favor row, because the row would never be anything but grey. On a life that is not stamped the list is
// a plain empty array, so the rows of every v5.2.0 save are exactly what they were.
//
// Layer 3 (society). Other domains reach it through society/contract.ts.
import { formatMoney, getPerson } from '../core'
import type { GameState, MenuAction, MenuInfo, MenuNode, Person } from '../types'
import { actBlock, playerEdgeKey } from './acts'
import {
  FAVOR_AGE,
  FAVOR_COOLDOWN,
  askBroker,
  askFavor,
  askVouch,
  broker,
  brokerFor,
  cutOff,
  estranged,
  favorOdds,
  helpAct,
  thirdFor,
  vouch,
} from './favor'
import { socialOn } from '../world/social'
import { LOAN_AGE, askLoan, debtTo, loanAct, loanTerms } from './loan'

/** A person the player feels this much for or more gets the favor rows (20 under the 50 a favor needs); below it the row would never be anything but grey. */
const SHOW_FROM = 30

const pct = (x: number): number => Math.round(x * 100)

/** The reason the call-in on `giver` can't be made, from the state the row is read with. */
function reason(g: GameState, act: Parameters<typeof actBlock>[1], giver: Person): string | null {
  const live = getPerson(g, giver.id)
  if (live === undefined) return `${giver.firstName} isn't around.`
  const key = playerEdgeKey(g, live)
  return key === null ? `${giver.firstName} isn't around.` : actBlock(g, act, key, live)
}

function favorRow(g: GameState, p: Person): MenuAction {
  return {
    type: 'action',
    id: 'social.favor',
    label: 'Ask for a Favor',
    emoji: '\u{1F91D}',
    subtitle: `About ${pct(favorOdds(g, p))}% to say yes · once in ${FAVOR_COOLDOWN} years · you'll owe them`,
    disabledReason: (s) => reason(s, helpAct, p),
    run: (s) => {
      const q = getPerson(s, p.id)
      if (q) askFavor(s, q)
    },
  }
}

function vouchRow(g: GameState, p: Person, third: Person): MenuAction {
  return {
    type: 'action',
    id: 'social.vouch',
    label: `Ask ${p.firstName} to Vouch for You`,
    emoji: '\u{1F5E3}\u{FE0F}',
    subtitle: `A good word with ${third.firstName} · about ${pct(favorOdds(g, p))}% · you'll owe ${p.firstName}`,
    disabledReason: (s) => {
      const t = getPerson(s, third.id)
      return t === undefined ? `${third.firstName} isn't around.` : reason(s, vouch(t), p)
    },
    run: (s) => {
      const q = getPerson(s, p.id)
      const t = getPerson(s, third.id)
      if (q && t) askVouch(s, q, t)
    },
  }
}

function brokerRow(g: GameState, relative: Person, giver: Person): MenuAction {
  return {
    type: 'action',
    id: 'social.broker',
    label: `Ask ${giver.firstName} to Speak for You`,
    emoji: '\u{1F54A}\u{FE0F}',
    subtitle: `A word with ${relative.firstName} · about ${pct(favorOdds(g, giver))}% · it helps the peace, not the past`,
    disabledReason: (s) => {
      const r = getPerson(s, relative.id)
      return r === undefined ? `${relative.firstName} isn't around.` : reason(s, broker(r), giver)
    },
    run: (s) => {
      const q = getPerson(s, giver.id)
      const r = getPerson(s, relative.id)
      if (q && r) askBroker(s, q, r)
    },
  }
}

/** The step of the loan slider: whole dollars for a small loan, hundreds for a large one. */
const stepFor = (cap: number): number => (cap >= 100_000 ? 100 : cap >= 10_000 ? 10 : 1)

function loanRow(g: GameState, p: Person): MenuAction {
  const t = loanTerms(g, p)
  const step = stepFor(t.cap)
  const min = Math.min(t.cap, Math.ceil(t.min / step) * step)
  return {
    type: 'action',
    id: 'social.loan',
    label: `Ask ${p.firstName} for a Loan`,
    emoji: '\u{1F4B0}',
    subtitle: `Up to ${formatMoney(t.cap)} at ${t.rate}% a year · about ${pct(t.odds)}% to say yes · a share of your spare cash goes back each year`,
    disabledReason: (s) => reason(s, loanAct(t.min), p),
    input: {
      kind: 'slider',
      money: true,
      label: 'How much?',
      min,
      max: Math.max(min, t.cap),
      step,
      defaultValue: () => String(Math.max(min, Math.min(Math.max(min, t.cap), Math.round(t.cap / 2 / step) * step))),
    },
    run: (s, input) => {
      const q = getPerson(s, p.id)
      if (q) askLoan(s, q, Number(input))
    },
  }
}

function oweRow(g: GameState, p: Person): MenuInfo | null {
  const d = debtTo(g, p)
  if (d === null) return null
  const left = Math.max(0, d.owed - d.paid)
  return { type: 'info', id: 'social.owe', emoji: '\u{1F4DD}', text: `You owe ${p.firstName} ${formatMoney(left)} at ${d.rate}% a year.` }
}

/** The favor rows of a person's page. An empty list for a life that is not stamped, a child, a dead person, a pet. Pure. */
export function socialNodes(g: GameState, p: Person): MenuNode[] {
  if (!socialOn(g) || !g.character.alive || !(g.character.age >= FAVOR_AGE) || !p.alive || p.relation === 'pet') return []
  const rows: MenuNode[] = []
  if (cutOff(g, p)) {
    const giver = brokerFor(g, p)
    if (giver !== null) rows.push(brokerRow(g, p, giver))
  }
  if (!estranged(g, p) && p.relationship >= SHOW_FROM) {
    rows.push(favorRow(g, p))
    const third = thirdFor(g, p)
    if (third !== null) rows.push(vouchRow(g, p, third))
    if (g.character.age >= LOAN_AGE && p.age >= LOAN_AGE) rows.push(loanRow(g, p))
  }
  const owe = oweRow(g, p)
  if (owe !== null) rows.push(owe)
  return rows.length === 0 ? [] : [{ type: 'heading', id: 'social.head', label: 'Favors' }, ...rows]
}
