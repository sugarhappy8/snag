// Will & Testament: decide who inherits your estate. Your spouse, children (incl. stepchildren),
// grandchildren, parents, siblings and close friends can be named, and a share can go to charity.
// An empty will means "divide evenly among my children" (life.ts reads the will when the next
// generation starts, events/will-estate.ts splits it).
//
// Being written out is a real act: the people who were counting on a share get angry, find out in
// their own ways, and may cut contact, take sides or contest the will after you die
// (events/will-act.ts, will-feud.ts, will-scenes.ts, will-estate.ts). The rows here say honestly
// how upset each person would be before you remove them.
import { count, log, relationLabel } from '../core'
import { addHeir, changeWill, removeHeir, type ChangeReport } from '../events/will-act'
import { queueTells } from '../events/will-scenes'
import {
  angerLabel,
  CHARITY,
  cutRisk,
  expectation,
  expectationLabel,
  isInLine,
  livingKids,
  nameableBy,
  readWill,
  readWl,
  ROLE_ORDER,
  ROLE_TITLES,
  willEligible,
  willHeirs,
  willNameable,
  willSlices,
  type WillRole,
  willRole,
} from '../events/will-core'
import type { GameState, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { gate, result } from './common'

const WILL_EMOJI = '\u{1F4DC}'

export { willEligible, willHeirs }

const ROLE_EMOJI: Record<WillRole, string> = {
  spouse: '\u{1F48D}',
  child: '\u{1F9D2}',
  stepchild: '\u{1F9D2}',
  grandchild: '\u{1F476}',
  parent: '\u{1F9D3}',
  sibling: '\u{1F46B}',
  friend: '\u{1F91D}',
}

function who(p: Person): string {
  return `${p.firstName} ${p.lastName}`.trim()
}

function label(p: Person): string {
  return `${relationLabel(p).toLowerCase()} ${p.firstName}`
}

function listWords(items: string[]): string {
  return items.join(', ').replace(/, ([^,]*)$/, ' and $1')
}

/** One-line description of the current will. Pure. */
export function willSummary(g: GameState): string {
  const heirs = willHeirs(g)
  const kids = livingKids(g)
  const w = readWill(g)
  const slices = willSlices(g)
  const pctOf = (id: string) => Math.round((slices.find((s) => s.id === id)?.pct ?? 0) * 100)
  const charity = w.charity > 0 ? ` ${w.charity}% goes to charity.` : ''
  if (heirs.length === 0) {
    if (kids.length === 0) {
      if (w.charity > 0) return `You have no children, so everything goes to charity.`
      const sp = willEligible(g)[0]
      return sp
        ? `Your will says "divide evenly among my children", but you don't have any. Name your ${relationLabel(sp).toLowerCase()} so your estate doesn't end up with the government.`
        : "You don't have a spouse or children to inherit your estate. Name a relative or a friend, or leave a share to charity, or it all goes to the government."
    }
    return `Your estate will be divided evenly among your ${kids.length === 1 ? 'only child' : `${kids.length} children`}.${charity}`
  }
  const uneven = new Set(heirs.map((p) => pctOf(p.id))).size > 1 || w.charity > 0
  if (heirs.length === 1 && w.charity === 0) return `Everything goes to your ${label(heirs[0])}.`
  const parts = heirs.map((p) => (uneven ? `${label(p)} (${pctOf(p.id)}%)` : label(p)))
  if (w.charity > 0) parts.push(`charity (${pctOf(CHARITY)}%)`)
  return `Your estate will be split between ${listWords(parts)}.`
}

/** Relatives not in the will who are counting on a share (a heads-up row). Pure. */
function countingOn(g: GameState): Person[] {
  return willNameable(g)
    .filter((p) => (p.relation === 'spouse' || p.relation === 'child' || p.relation === 'stepchild') && !isInLine(g, p) && expectation(g, p) >= 55)
}

function removalWarning(g: GameState, p: Person): string | null {
  if (!isInLine(g, p) || p.age < 13) return null
  const e = expectation(g, p)
  if (e < 12) return null
  const { quiet, kind } = cutRisk(g, p)
  const he = p.gender === 'male' ? 'he' : 'she'
  return `${p.firstName} ${expectationLabel(e)}. If ${he} hears about it behind your back ${he}'d likely be ${angerLabel(quiet).toLowerCase()} (${quiet}); if you explain it kindly, ${angerLabel(kind).toLowerCase()} (${kind}). Putting ${p.firstName} back later only repairs part of it.`
}

function finish(g: GameState, report: ChangeReport, logLine: string, popup: string): void {
  count(g, 'willUpdates')
  log(g, logLine, 'neutral')
  const text = [popup, ...report.lines].join('\n\n')
  result(g, 'Will Updated', text, WILL_EMOJI, report.cut.length > 0 && report.lines.length > 0 ? 'bad' : undefined)
  queueTells(g, report)
}

function divideEvenly(g: GameState): void {
  const report = changeWill(g, (gg, w) => {
    gg.character.willBeneficiaries = []
    w.shares = {}
  })
  const kids = livingKids(g)
  finish(
    g,
    report,
    'I updated my will to divide my estate evenly among my children.',
    `You updated your will. Your estate will be divided evenly among your ${kids.length === 1 ? 'only child' : `${kids.length} children`}. No favorites. Officially.`,
  )
}

function divideAmongFamily(g: GameState): void {
  const report = changeWill(g, (gg, w) => {
    gg.character.willBeneficiaries = willEligible(gg).map((p) => p.id)
    w.shares = {}
  })
  finish(g, report, 'I updated my will to split my estate between my spouse and children.', `You updated your will. Your estate will be split ${willEligible(g).length} ways between your spouse and your children.`)
}

function leaveAllTo(g: GameState, personId: string): void {
  const p = willNameable(g).find((x) => x.id === personId)
  if (!p) return
  const report = changeWill(g, (gg, w) => {
    gg.character.willBeneficiaries = [p.id]
    w.shares = {}
  })
  finish(g, report, `I left everything to my ${label(p)} in my will.`, `You changed your will to leave everything to your ${label(p)}. Everyone else is going to hear about this eventually.`)
}

function toggle(g: GameState, personId: string): void {
  const p = willNameable(g).find((x) => x.id === personId)
  if (!p) return
  if (isInLine(g, p)) {
    const report = changeWill(g, (gg, w) => removeHeir(gg, w, p))
    finish(
      g,
      report,
      `I removed my ${label(p)} from my will.`,
      g.character.willBeneficiaries.length === 0 && livingKids(g).length > 0
        ? `You removed your ${label(p)} from your will. With nobody named, your estate will be divided evenly among your children.`
        : `You removed your ${label(p)} from your will.`,
    )
    return
  }
  const report = changeWill(g, (gg, w) => addHeir(gg, w, p, 100))
  finish(g, report, `I added my ${label(p)} to my will.`, `You added your ${label(p)} to your will.`)
}

function setShare(g: GameState, personId: string, pct: number): void {
  const p = willNameable(g).find((x) => x.id === personId)
  if (!p || !isInLine(g, p)) return
  const report = changeWill(g, (gg, w) => addHeir(gg, w, p, pct))
  const share = Math.round((willSlices(g).find((s) => s.id === p.id)?.pct ?? 0) * 100)
  finish(g, report, `I changed my ${label(p)}'s share in my will.`, `${p.firstName} will now inherit about ${share}% of your estate.`)
}

function setCharity(g: GameState, pct: number): void {
  if (!Number.isFinite(pct)) return
  const report = changeWill(g, (_gg, w) => {
    w.charity = Math.max(0, Math.min(90, Math.round(pct)))
  })
  const w = readWill(g)
  finish(
    g,
    report,
    w.charity > 0 ? `I left ${w.charity}% of my estate to charity.` : 'I took charity out of my will.',
    w.charity > 0 ? `You left ${w.charity}% of your estate to charity. Your lawyer asked which one. You said "a good one".` : 'You took charity out of your will.',
  )
}

function stateOf(g: GameState, p: Person): string {
  const cur = g.people.find((x) => x.id === p.id) ?? p
  const slices = willSlices(g)
  const mine = slices.find((s) => s.id === cur.id)
  const w = readWl(g, cur)
  const mood = w.known && w.anger >= 20 && w.cut ? ` · ${angerLabel(w.anger)} (${w.anger})` : ''
  if (mine && mine.pct > 0) return `${slices.length > 1 ? `✅ In your will (${Math.round(mine.pct * 100)}%)` : '✅ In your will'}${mood}`
  return `Not named${mood}`
}

function personRow(p: Person): MenuAction {
  return {
    type: 'action',
    id: `will.toggle.${p.id}`,
    label: who(p),
    emoji: ROLE_EMOJI[willRole(p) ?? 'friend'],
    subtitle: (g) => {
      const cur = g.people.find((x) => x.id === p.id) ?? p
      return `${relationLabel(cur)}, age ${cur.age} · ${stateOf(g, cur)}`
    },
    confirm: (g) => removalWarning(g, g.people.find((x) => x.id === p.id) ?? p),
    run: (g) => toggle(g, p.id),
  }
}

function shareRow(p: Person): MenuAction {
  return {
    type: 'action',
    id: `will.share.${p.id}`,
    label: `${p.firstName}'s Share`,
    emoji: '\u{2696}\u{FE0F}',
    visible: (g) => isInLine(g, p) && willSlices(g).length > 1,
    subtitle: (g) => {
      const mine = willSlices(g).find((s) => s.id === p.id)
      return `${readWill(g).shares[p.id] ?? 100}% of an equal share · about ${Math.round((mine?.pct ?? 0) * 100)}% of the estate`
    },
    input: {
      kind: 'slider',
      label: `${p.firstName}'s share of an equal portion`,
      min: 10,
      max: 100,
      step: 5,
      unit: '%',
      defaultValue: (g) => String(readWill(g).shares[p.id] ?? 100),
      preview: (g, v) => {
        const heirs = willHeirs(g)
        const w = readWill(g)
        const others = heirs.filter((h) => h.id !== p.id).reduce((a, h) => a + (w.shares[h.id] ?? 100), 0)
        const total = others + v
        const people = total > 0 ? v / total : 1
        return `${Math.round(people * (1 - w.charity / 100) * 100)}% of the estate`
      },
    },
    run: (g, input) => setShare(g, p.id, Number(input)),
  }
}

function soleHeirRow(p: Person): MenuAction {
  return {
    type: 'action',
    id: `will.sole.${p.id}`,
    label: `Leave Everything to ${p.firstName}`,
    emoji: '\u{1F451}',
    subtitle: `${relationLabel(p)}, age ${p.age}`,
    disabledReason: (g) => {
      const heirs = willHeirs(g)
      return heirs.length === 1 && heirs[0].id === p.id && readWill(g).charity === 0 ? `${p.firstName} is already your sole heir.` : null
    },
    confirm: () => `Leave your entire estate to ${p.firstName}? Anyone left out may not take it well.`,
    run: (g) => leaveAllTo(g, p.id),
  }
}

const charityRow: MenuAction = {
  type: 'action',
  id: 'will.charity',
  label: 'Leave a Share to Charity',
  emoji: '\u{1F397}\u{FE0F}',
  subtitle: (g) => (readWill(g).charity > 0 ? `${readWill(g).charity}% of your estate` : 'Nothing set aside yet'),
  input: {
    kind: 'slider',
    label: 'Share of your estate that goes to charity',
    min: 0,
    max: 90,
    step: 5,
    unit: '%',
    defaultValue: (g) => String(readWill(g).charity),
    preview: (_g, v) => (v === 0 ? 'No charity share' : `${v}% to charity, the rest to your heirs`),
  },
  run: (g, input) => setCharity(g, Number(input)),
}

export const willMenu: MenuGroup = {
  type: 'menu',
  id: 'will',
  label: 'Will & Testament',
  emoji: WILL_EMOJI,
  subtitle: 'Manage your legacy',
  disabledReason: (g) => gate(g, { minAge: 18 }),
  header: willSummary,
  children: (g): MenuNode[] => {
    const nameable = willNameable(g)
    if (nameable.length === 0) {
      return [
        {
          type: 'info',
          id: 'will.none',
          emoji: '\u{1F937}',
          text: 'Nobody in your life can inherit your estate yet. Get married, start a family or get close to a friend to name an heir, or leave a share to charity.',
        },
        charityRow,
      ]
    }
    const eligible = willEligible(g)
    const kids = livingKids(g)
    const sp = eligible.find((p) => p.relation === 'spouse')
    const nodes: MenuNode[] = []
    const waiting = countingOn(g)
    if (waiting.length > 0) {
      nodes.push({
        type: 'info',
        id: 'will.waiting',
        emoji: '\u{1F4AD}',
        text: `Not in your will but counting on a big share: ${listWords(waiting.map(label))}. If you leave them out on purpose, expect a reaction.`,
      })
    }
    nodes.push({ type: 'heading', id: 'will.split', label: 'Divide It' })
    if (kids.length > 0) {
      nodes.push({
        type: 'action',
        id: 'will.even',
        label: 'Divide Evenly Among Children',
        emoji: '\u{2696}\u{FE0F}',
        subtitle: 'Includes any children you have later',
        disabledReason: (s) => (s.character.willBeneficiaries.length === 0 && Object.keys(readWill(s).shares).length === 0 ? 'Your will already divides everything evenly among your children.' : null),
        run: divideEvenly,
      })
    }
    if (sp && kids.length > 0) {
      nodes.push({
        type: 'action',
        id: 'will.family',
        label: 'Split Between Spouse & Children',
        emoji: '\u{1F46A}',
        subtitle: `${kids.length + 1} equal shares`,
        disabledReason: (s) => (willHeirs(s).length === willEligible(s).length && willHeirs(s).every((h) => willEligible(s).some((e) => e.id === h.id)) && Object.keys(readWill(s).shares).length === 0 ? 'Your whole family is already in your will.' : null),
        run: divideAmongFamily,
      })
    }
    nodes.push(charityRow)
    if (eligible.length > 0) {
      nodes.push({ type: 'heading', id: 'will.sole', label: 'Leave It All to One Person' })
      for (const p of eligible) nodes.push(soleHeirRow(p))
    }
    nodes.push({ type: 'heading', id: 'will.custom', label: 'Custom Will (tap to add or remove)' })
    for (const role of ROLE_ORDER) {
      const list = nameableBy(g, role)
      if (list.length === 0) continue
      nodes.push({ type: 'heading', id: `will.role.${role}`, label: ROLE_TITLES[role] })
      for (const p of list) {
        nodes.push(personRow(p))
        nodes.push(shareRow(p))
      }
    }
    return nodes
  },
}
