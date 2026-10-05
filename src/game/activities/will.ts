// Will & Testament: decide who inherits your estate. Like the real game, only your spouse
// and children (incl. stepchildren) can be named. An empty will means "divide evenly among
// my children" (life.ts reads character.willBeneficiaries when the next generation starts).
// Family members left out may find out and take it personally.
import { addRelationship, children, count, log, relationLabel, spouse } from '../core'
import { notePerson } from '../people'
import { chance, pick } from '../rng'
import type { GameState, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { gate, result } from './common'

const WILL_EMOJI = '\u{1F4DC}'

/** People who can legally be named in the will (alive spouse, children, stepchildren). */
export function willEligible(g: GameState): Person[] {
  const sp = spouse(g)
  const kids = children(g).sort((a, b) => b.age - a.age)
  return sp ? [sp, ...kids] : kids
}

/** Named beneficiaries who are still eligible (dead / divorced people drop out). */
export function willHeirs(g: GameState): Person[] {
  const eligible = willEligible(g)
  return g.character.willBeneficiaries.map((id) => eligible.find((p) => p.id === id)).filter((p): p is Person => !!p)
}

/** Drop beneficiaries who are no longer eligible (reverts to "divide evenly" when empty). */
function pruneWill(g: GameState): void {
  const ids = new Set(willEligible(g).map((p) => p.id))
  g.character.willBeneficiaries = g.character.willBeneficiaries.filter((id) => ids.has(id))
}

function who(p: Person): string {
  return `${p.firstName} ${p.lastName}`.trim()
}

function label(p: Person): string {
  return `${relationLabel(p).toLowerCase()} ${p.firstName}`
}

/** One-line description of the current will. Pure. */
export function willSummary(g: GameState): string {
  const heirs = willHeirs(g)
  const kids = children(g)
  if (heirs.length === 0) {
    if (kids.length === 0) {
      const sp = spouse(g)
      return sp
        ? `Your will says "divide evenly among my children", but you don't have any. Name your ${relationLabel(sp).toLowerCase()} so your estate doesn't end up with the government.`
        : "You don't have a spouse or children to inherit your estate. If you die without heirs, it all goes to charity."
    }
    return `Your estate will be divided evenly among your ${kids.length === 1 ? 'only child' : `${kids.length} children`}.`
  }
  if (heirs.length === 1) return `Everything goes to your ${label(heirs[0])}.`
  return `Your estate will be split between ${heirs.map(label).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`
}

/** Family members cut out of the will may find out and react. Returns popup lines. */
function cutOutReactions(g: GameState, cut: Person[]): string[] {
  const lines: string[] = []
  for (const p of cut) {
    if (p.age < 13 || !chance(g, 0.45)) continue
    addRelationship(p, -(8 + Math.floor((100 - p.relationship) / 10)))
    notePerson(p, 'Found out they were cut out of the player’s will.')
    lines.push(
      pick(g, [
        `Your ${label(p)} found out ${p.gender === 'male' ? 'he' : 'she'} was cut out of your will and called you heartless.`,
        `Your ${label(p)} discovered the new will and slammed the door so hard a picture fell off the wall.`,
        `Your ${label(p)} asked, very calmly, what ${p.gender === 'male' ? 'he' : 'she'} did to deserve this. It was not calm.`,
        `Your ${label(p)} heard about the will from your lawyer's chatty receptionist. Dinner was awkward.`,
      ]),
    )
  }
  return lines
}

function included(g: GameState, p: Person): boolean {
  return g.character.willBeneficiaries.includes(p.id)
}

function finish(g: GameState, before: Person[], logLine: string, popup: string): void {
  pruneWill(g)
  const after = willHeirs(g)
  const afterIds = new Set((after.length ? after : children(g)).map((p) => p.id))
  const beforeIds = new Set(before.map((p) => p.id))
  // Only people who used to be in line and are now out get upset.
  const cut = willEligible(g).filter((p) => beforeIds.has(p.id) && !afterIds.has(p.id))
  count(g, 'willUpdates')
  log(g, logLine, 'neutral')
  const reactions = cutOutReactions(g, cut)
  result(g, 'Will Updated', [popup, ...reactions].join('\n\n'), WILL_EMOJI, reactions.length ? 'bad' : undefined)
}

/** Who would inherit right now (named heirs, or the children by default). */
function currentlyInherits(g: GameState): Person[] {
  const heirs = willHeirs(g)
  return heirs.length ? heirs : children(g)
}

function divideEvenly(g: GameState): void {
  pruneWill(g)
  const before = currentlyInherits(g)
  g.character.willBeneficiaries = []
  const kids = children(g)
  finish(
    g,
    before,
    'I updated my will to divide my estate evenly among my children.',
    pick(g, [
      `You updated your will. Your estate will be divided evenly among your ${kids.length === 1 ? 'only child' : `${kids.length} children`}. No favorites. Officially.`,
      'Your lawyer read back the new will: "Everything split evenly among the kids." The notary yawned.',
    ]),
  )
}

function divideAmongFamily(g: GameState): void {
  pruneWill(g)
  const before = currentlyInherits(g)
  const all = willEligible(g)
  g.character.willBeneficiaries = all.map((p) => p.id)
  finish(
    g,
    before,
    'I updated my will to split my estate between my spouse and children.',
    `You updated your will. Your estate will be split ${all.length} ways between your spouse and your children.`,
  )
}

function leaveAllTo(g: GameState, personId: string): void {
  pruneWill(g)
  const p = willEligible(g).find((x) => x.id === personId)
  if (!p) return
  const before = currentlyInherits(g)
  g.character.willBeneficiaries = [p.id]
  addRelationship(p, 4)
  notePerson(p, 'Was named the sole heir in the player’s will.')
  finish(
    g,
    before,
    `I left everything to my ${label(p)} in my will.`,
    pick(g, [
      `You changed your will to leave everything to your ${label(p)}. ${p.firstName} pretended not to be thrilled.`,
      `Your lawyer drew up a new will naming your ${label(p)} as your sole heir. Everyone else is going to love this.`,
      `It's official: when you go, your ${label(p)} gets it all. ${p.firstName} suddenly started asking how you're feeling every day.`,
    ]),
  )
}

function toggle(g: GameState, personId: string): void {
  pruneWill(g)
  const p = willEligible(g).find((x) => x.id === personId)
  if (!p) return
  const before = currentlyInherits(g)
  // Starting a custom list from "divide evenly": begin with everyone currently inheriting.
  if (g.character.willBeneficiaries.length === 0) g.character.willBeneficiaries = before.map((x) => x.id)
  if (included(g, p)) {
    g.character.willBeneficiaries = g.character.willBeneficiaries.filter((id) => id !== p.id)
    finish(
      g,
      before,
      `I removed my ${label(p)} from my will.`,
      g.character.willBeneficiaries.length === 0
        ? `You removed your ${label(p)} from your will. With nobody named, your estate will be divided evenly among your children.`
        : `You removed your ${label(p)} from your will.`,
    )
    return
  }
  g.character.willBeneficiaries = [...g.character.willBeneficiaries, p.id]
  addRelationship(p, 3)
  finish(g, before, `I added my ${label(p)} to my will.`, `You added your ${label(p)} to your will.`)
}

function personRow(p: Person): MenuAction {
  return {
    type: 'action',
    id: `will.toggle.${p.id}`,
    label: who(p),
    emoji: '\u{1F464}',
    subtitle: (g) => `${relationLabel(p)}, age ${p.age} · ${willHeirs(g).some((x) => x.id === p.id) ? '✅ In your will' : 'Not named'}`,
    run: (g) => toggle(g, p.id),
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
      return heirs.length === 1 && heirs[0].id === p.id ? `${p.firstName} is already your sole heir.` : null
    },
    confirm: () => `Leave your entire estate to ${p.firstName}? Anyone left out may not take it well.`,
    run: (g) => leaveAllTo(g, p.id),
  }
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
    const eligible = willEligible(g)
    if (eligible.length === 0) {
      return [
        {
          type: 'info',
          id: 'will.none',
          emoji: '\u{1F937}',
          text: 'Only a spouse or children can inherit your estate. Get married or start a family to name an heir.',
        },
      ]
    }
    const kids = children(g)
    const sp = spouse(g)
    const nodes: MenuNode[] = [{ type: 'heading', id: 'will.split', label: 'Divide It' }]
    if (kids.length > 0) {
      nodes.push({
        type: 'action',
        id: 'will.even',
        label: 'Divide Evenly Among Children',
        emoji: '\u{2696}\u{FE0F}',
        subtitle: 'Includes any children you have later',
        disabledReason: (s) => (s.character.willBeneficiaries.length === 0 ? 'Your will already divides everything evenly among your children.' : null),
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
        disabledReason: (s) => (willHeirs(s).length === eligible.length ? 'Your whole family is already in your will.' : null),
        run: divideAmongFamily,
      })
    }
    nodes.push({ type: 'heading', id: 'will.sole', label: 'Leave It All to One Person' })
    for (const p of eligible) nodes.push(soleHeirRow(p))
    nodes.push({ type: 'heading', id: 'will.custom', label: 'Custom Will (tap to add or remove)' })
    for (const p of eligible) nodes.push(personRow(p))
    return nodes
  },
}
