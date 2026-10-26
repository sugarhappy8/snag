// Making up after a will: the rows on a relative's sheet. Every way back costs something real: an
// honest talk takes a toll and may not get through (the odds are shown), money soothes less each
// time it is tried, and a place in the will (or a smaller share) is a promise on your estate. None
// of it creates money, and trust only comes back by a bounded amount.
import { addRelationship, addStat, canAfford, clamp, count, getPerson, log, notice, pronouns } from '../core'
import { flagOn } from '../flags'
import { isExact } from '../knowledge/contract'
import { chance, randInt } from '../rng'
import type { GameState, MenuNode, Person } from '../types'
import { entitlement } from './wealth-core'
import { addHeir, changeWill, reconcile } from './will-act'
import {
  angerAfterShare,
  angerLabel,
  expectation,
  giftRelief,
  HOW_TEXT,
  isInLine,
  keptAwayBy,
  peaceOdds,
  potentialShare,
  readWl,
  shareOf,
  temper,
  updateWl,
  willRole,
  type Learn,
} from './will-core'
import { payOff, queueTells } from './will-scenes'

const EMOJI = '\u{1F4DC}'

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

/**
 * The person profile exists (R4-U5): the build flag is on and the player reads estimates. The same switch as peopleFog() of
 * people-fog.ts, which this file may not import (events->life is a counted pair of the layer ratchet), so it is gated here; a case
 * in test/people-rows.test.ts holds the two equal for the four pairs of flag and mode.
 */
const fogged = (): boolean => flagOn('peopleProfile') && !isExact()

function statusLine(g: GameState, p: Person): string {
  const w = readWl(g, p)
  const bits: string[] = []
  if (w.estr) bits.push(`Estranged since ${w.estrY}`)
  if (w.known) {
    // The word stays; the figure behind it is theirs, and a profile does not print what you cannot read.
    bits.push(fogged() ? angerLabel(w.anger) : `${angerLabel(w.anger)} (${w.anger}/100)`)
    const how = HOW_TEXT[(w.how as Learn) in HOW_TEXT ? (w.how as Learn) : 'external']
    bits.push(`knew by ${how}${w.knownY > 0 ? ` in ${w.knownY}` : ''}`)
  } else if (w.cut) {
    bits.push("Doesn't know yet that they were left out")
  }
  const mine = shareOf(g, p)
  bits.push(mine > 0 ? `In your will (${pct(mine)})` : w.cut ? 'Written out of your will' : 'Not in your will')
  if (w.cold && !w.estr) bits.push('Giving you the cold shoulder')
  return bits.join(' · ')
}

/** The rows of "Your Will" on a relative's sheet. [] when there is nothing to mend. */
export function willPersonNodes(g: GameState, p: Person): MenuNode[] {
  const c = g.character
  if (!c.alive || c.age < 18 || !p.alive || !willRole(p) || p.data.disowned === true) return []
  // These rows are built from the state on screen; actions run on a fresh draft of it, so read and
  // write the person through the state each callback is handed.
  const live = (s: GameState): Person => getPerson(s, p.id) ?? p
  const away = keptAwayBy(g, p)
  if (away) {
    return [
      { type: 'heading', id: 'will.head', label: 'Your Will' },
      { type: 'info', id: 'will.kept', emoji: '\u{1F6AA}', text: `${away.firstName} isn't letting ${p.firstName} see you while the two of you aren't speaking. Making up with ${away.firstName} is the way back.` },
    ]
  }
  const w = readWl(g, p)
  if (!w.cut && !w.estr && !(w.known && w.anger > 0)) return []
  const nodes: MenuNode[] = [
    { type: 'heading', id: 'will.head', label: 'Your Will' },
    { type: 'info', id: 'will.status', emoji: EMOJI, text: statusLine(g, p) },
  ]
  if (w.estr) {
    nodes.push({
      type: 'info',
      id: 'will.estranged',
      emoji: '\u{1F6AA}',
      text: `${p.firstName} isn't visiting, calling or letting the grandchildren near. There is no help for you in old age from this side of the family until that changes.`,
    })
  }

  const known = w.known
  const odds = peaceOdds(g, p)
  nodes.push({
    type: 'action',
    id: 'will.peace',
    label: w.estr ? 'Reach Out' : 'Heart-to-Heart',
    emoji: '\u{1F54A}\u{FE0F}',
    subtitle: `An honest apology · about ${Math.round(odds * 100)}% to get through`,
    visible: () => known,
    disabledReason: (s) => {
      const cur = readWl(s, live(s))
      if (cur.talkY === s.year) return `You already tried talking to ${p.firstName} this year.`
      if (cur.estr && cur.anger > 55) return `${p.firstName} isn't ready to hear from you yet.`
      return null
    },
    run: (s) => {
      const q = getPerson(s, p.id)
      if (q) heartToHeart(s, q)
    },
  })

  if (known && w.explained === '' && !w.estr) {
    nodes.push({
      type: 'action',
      id: 'will.explain',
      label: 'Explain Your Reasons',
      emoji: '\u{1F5E3}\u{FE0F}',
      subtitle: 'Once. It helps most with people who can hear it.',
      disabledReason: (s) => (readWl(s, live(s)).talkY === s.year ? `You already tried talking to ${p.firstName} this year.` : null),
      run: (s) => {
        const q = getPerson(s, p.id)
        if (q) explainReasons(s, q)
      },
    })
  }

  if (w.cut && !isInLine(g, p)) {
    nodes.push({
      type: 'action',
      id: 'will.restore',
      label: 'Put Back in Your Will',
      emoji: '\u{2705}',
      subtitle: known ? `Anger would fall to about ${angerAfterShare(w.anger, 100)}; trust returns only in part` : 'They will not feel any different until they find out',
      confirm: () => `Put ${p.firstName} back in your will with a full share? Taking ${pronouns(p.gender).him} out again later will hurt even more.`,
      run: (s) => {
        const report = changeWill(s, (gg, ws) => addHeir(gg, ws, p, 100))
        count(s, 'willUpdates')
        log(s, `I put ${p.firstName} back in my will.`, 'good')
        notice(s, 'Will Updated', [`You put ${p.firstName} back in your will.`, ...report.lines].join('\n\n'), { emoji: EMOJI, tone: 'good' })
        queueTells(s, report)
      },
    })
    nodes.push({
      type: 'action',
      id: 'will.compromise',
      label: 'Offer a Smaller Share',
      emoji: '\u{2696}\u{FE0F}',
      subtitle: 'A share between nothing and a full one',
      input: {
        kind: 'slider',
        label: `${p.firstName}'s share of an equal portion`,
        min: 10,
        max: 90,
        step: 5,
        unit: '%',
        defaultValue: () => '50',
        preview: (s, v) => {
          const cur = readWl(s, live(s))
          return cur.known ? `${p.firstName}'s anger would fall from ${cur.anger} to about ${angerAfterShare(cur.anger, v)}` : `${p.firstName} doesn't know yet`
        },
      },
      run: (s, input) => {
        const v = clamp(Math.round(Number(input)), 10, 90)
        const report = changeWill(s, (gg, ws) => addHeir(gg, ws, p, v))
        count(s, 'willUpdates')
        log(s, `I offered my ${p.firstName} a ${v}% share in my will.`)
        notice(s, 'Will Updated', [`You left ${p.firstName} ${v}% of an equal share.`, ...report.lines].join('\n\n'), { emoji: EMOJI })
        queueTells(s, report)
      },
    })
  }

  if (known) {
    const cash = Math.max(0, c.money)
    const potential = Math.max(1, Math.round(potentialShare(g, p) * (expectation(g, p) / 100 + 0.2)))
    const top = Math.max(0, Math.round(Math.min(cash * 0.6, potential)))
    const tries = w.buys
    nodes.push({
      type: 'action',
      id: 'will.gift',
      label: 'Smooth It Over with Money',
      emoji: '\u{1F4B5}',
      subtitle: tries > 0 ? 'Money works less each time you try it' : 'A check helps a little, and only a little',
      disabledReason: (s) => {
        const cur = readWl(s, live(s))
        if (cur.buyY === s.year) return `You already tried money on ${p.firstName} this year.`
        if (Math.max(0, s.character.money) < 100 || top < 1) return "You can't spare enough for it to mean anything."
        return null
      },
      input: {
        kind: 'slider',
        label: `Gift for ${p.firstName}`,
        money: true,
        min: 1,
        max: Math.max(2, top),
        defaultValue: () => String(Math.max(1, Math.round(top / 3))),
        preview: (s, v) => {
          const relief = giftRelief(s, live(s), v)
          const e = entitlement(live(s))
          return `Takes about ${relief} off ${p.firstName}'s anger${e >= 60 ? ' (spoiled people expect more)' : ''}`
        },
      },
      run: (s, input) => {
        const amt = Math.round(Number(input))
        const q = getPerson(s, p.id)
        if (!q) return
        const cur = readWl(s, q)
        if (!Number.isFinite(amt) || amt < 1 || cur.buyY === s.year) return
        if (!canAfford(s, amt)) {
          notice(s, 'Not Enough', "You can't afford that.", { emoji: '\u{1F4B8}' })
          return
        }
        const text = payOff(s, q, amt)
        if (text) notice(s, 'The Will', text, { emoji: EMOJI })
      },
    })
  }
  return nodes
}

function heartToHeart(g: GameState, p: Person): void {
  const w = readWl(g, p)
  if (w.talkY === g.year) return
  if (w.estr && w.anger > 55) return
  const odds = peaceOdds(g, p)
  const t = temper(p)
  updateWl(g, p, (x) => {
    x.talkY = g.year
  })
  addStat(g, 'happiness', -1)
  const x = pronouns(p.gender)
  if (chance(g, odds)) {
    const relief = Math.round((10 + 14 * (1 - w.anger / 100)) * (1 + 0.3 * t.forgiving))
    updateWl(g, p, (y) => {
      y.anger -= relief
      y.hard = Math.max(0, y.hard - 1)
    })
    addRelationship(g, p, Math.min(4, 1 + Math.round(relief / 10)))
    log(g, `I had an honest talk with ${p.firstName} about my will.`, 'good')
    if (w.estr) reconcile(g, p)
    const left = readWl(g, p)
    notice(g, 'The Talk', `${p.firstName} listened, really listened, and for a minute you both stopped defending yourselves. ${w.estr ? `${x.He} is talking to you again.` : ''} ${p.firstName} is ${angerLabel(left.anger).toLowerCase()} now (${left.anger}).`.replace(/\s+/g, ' '), { emoji: '\u{1F54A}\u{FE0F}', tone: 'good' })
    return
  }
  const bump = t.petulant > 0 ? randInt(g, 2, 5) : 0
  if (bump > 0) {
    updateWl(g, p, (y) => {
      y.anger += bump
    })
  }
  addRelationship(g, p, -1)
  log(g, `I tried to talk to ${p.firstName} about my will. It didn't land.`)
  notice(g, 'The Talk', `${p.firstName} heard you out and shook ${x.his} head. "Sorry isn't a share." Maybe next year.`, { emoji: '\u{1F54A}\u{FE0F}' })
}

function explainReasons(g: GameState, p: Person): void {
  const w = readWl(g, p)
  if (w.talkY === g.year || w.explained !== '') return
  const t = temper(p)
  const relief = Math.round((10 + 10 * (1 - w.anger / 100)) * clamp(1 + 0.2 * t.forgiving - 0.2 * t.petulant, 0.6, 1.4))
  updateWl(g, p, (x) => {
    x.talkY = g.year
    x.anger -= relief
    x.explained = 'kind'
  })
  addRelationship(g, p, 2)
  addStat(g, 'happiness', -1)
  log(g, `I explained my will to ${p.firstName}.`)
  const left = readWl(g, p)
  notice(g, 'The Talk', `You explained your reasons without raising your voice. ${p.firstName} didn't agree, but ${pronouns(p.gender).he} understood. ${p.firstName} is ${angerLabel(left.anger).toLowerCase()} (${left.anger}).`, { emoji: '\u{1F5E3}\u{FE0F}' })
}
