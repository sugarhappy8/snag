// The popups of a will feud: how do you tell them, the confrontation (explain, apologize and put
// them back, double down, buy them off, offer a smaller share, refuse to talk), a spouse's
// ultimatum, the tabloids, grandkids caught in the middle, and an estranged child's olive branch.
// Every option has a real cost or risk; nothing here pays out money.
//
// The builders (queue...) are called by will-feud.ts and will-amends.ts; the handlers are
// registered at import time with defineScript.
import { moveCash } from '../cash'
import { addHidden, addMoney, clamp, addRelationship, addStat, canAfford, formatMoney, getPerson, inPrison, log, netWorth, notice, pronouns, scriptChoice, scriptInput } from '../core'
import { couplesCounseling } from '../love'
import { notePerson } from '../people'
import { pick } from '../rng'
import { defineScript } from '../scripts'
import type { ChoiceOption, GameState, Json, Person } from '../types'
import { common, landline, phoneWord } from './era'
import { addEntitlement, entitlement, goodsScale, noteCashGift, updateTies, readTies } from './wealth-core'
import { askedPurse, wholePurse } from './purses'
import { addHeir, changeWill, learn, reconcile, type ChangeReport } from './will-act'
import {
  angerAfterShare,
  angerLabel,
  estateEstimate,
  giftRelief,
  potentialShare,
  readWl,
  temper,
  updateWl,
  yourWho,
  myWho,
} from './will-core'

export const S_TELL = 'will.tell'
export const S_CONFRONT = 'will.confront'
export const S_BUY = 'will.confront.buy'
export const S_SHARE = 'will.confront.share'
export const S_SPOUSE = 'will.spouse'
export const S_PRESS = 'will.press'
export const S_GRANDKIDS = 'will.grandkids'
export const S_OLIVE = 'will.olive'

const EMOJI = '\u{1F4DC}'

function pid(data: Json | undefined): string {
  return data && typeof data === 'object' && !Array.isArray(data) && typeof data.pid === 'string' ? data.pid : ''
}

function field(data: Json | undefined, key: string): Json | undefined {
  return data && typeof data === 'object' && !Array.isArray(data) ? data[key] : undefined
}

/** The person a popup is about, if they are still alive and around. */
function who(g: GameState, data: Json | undefined): Person | undefined {
  const p = getPerson(g, pid(data))
  return p && p.alive ? p : undefined
}

function say(g: GameState, text: string, tone?: 'good' | 'bad'): void {
  notice(g, 'The Will', text, { emoji: EMOJI, tone })
}

export function nowAngry(g: GameState, p: Person): string {
  const a = readWl(g, p).anger
  return `${p.firstName} is ${angerLabel(a).toLowerCase()} (${a}).`
}

function contactNoun(g: GameState): string {
  return inPrison(g) ? 'a letter' : landline(g) ? 'a phone call' : 'a visit'
}

// ---------------------------------------------------------------------------
// How do you tell them?

/** Ask how to break the news to each person just written out (at most three; the rest hear it the hard way). */
export function queueTells(g: GameState, report: Pick<ChangeReport, 'tell'>): void {
  for (const p of report.tell.slice(0, 3)) {
    scriptChoice(
      g,
      S_TELL,
      `Tell ${p.firstName}?`,
      `You wrote ${yourWho(p)} out of your will. ${p.firstName} has no idea yet. These things tend to come out one way or another. How do you want ${pronouns(p.gender).him} to hear it?`,
      [
        { id: 'kind', label: 'Sit them down and explain, kindly', emoji: '\u{1F54A}\u{FE0F}' },
        { id: 'blunt', label: 'Tell them bluntly and move on', emoji: '\u{1F5E3}\u{FE0F}' },
        { id: 'letter', label: 'Leave a letter to be read with the will', emoji: '\u{2709}\u{FE0F}' },
        { id: 'silent', label: 'Say nothing and hope', emoji: '\u{1F910}' },
      ],
      { emoji: EMOJI, data: { pid: p.id }, personId: p.id },
    )
  }
}

defineScript(S_TELL, (g, choice, data) => {
  const p = who(g, data)
  if (!p || !readWl(g, p).cut) return
  if (choice === 'kind' || choice === 'blunt') {
    const line = learn(g, p, choice)
    log(g, choice === 'kind' ? `I sat down with ${myWho(p)} and explained my will.` : `I told ${myWho(p)} they were out of my will.`, 'neutral')
    say(g, `${line} ${nowAngry(g, p)}`, readWl(g, p).anger >= 50 ? 'bad' : undefined)
    return
  }
  if (choice === 'letter') {
    updateWl(g, p, (w) => {
      w.explained = 'letter'
    })
    log(g, `I wrote ${myWho(p)} a letter to be read with my will.`)
    say(g, `You wrote ${p.firstName} a long, honest letter and left it with your lawyer. It softens the blow, if the news doesn't reach ${pronouns(p.gender).him} first.`)
    return
  }
  log(g, `I didn't tell ${myWho(p)} about the change to my will.`)
})

// ---------------------------------------------------------------------------
// The confrontation

const OPENERS: Record<string, string[]> = {
  child: [
    '"I heard about the will," {name} says, standing in your doorway. "After everything? I\'m the one who showed up."',
    '{name} cornered you in the kitchen. "Tell me to my face why I\'m not in your will."',
    '{name} came over unannounced, holding nothing but a very tight jaw. "We need to talk about the will."',
  ],
  stepchild: [
    '{name} sat you down. "I know I\'m not your blood, but I thought I was family. Why am I not in your will?"',
    '"I never asked for anything," {name} says quietly. "I just want to know why I was written out."',
  ],
  sibling: [
    '{name} turned up at midnight, still in {coat}. "Our parents would be ashamed. How could you leave me out of your will?"',
    '{name} turned up at your door with a folded copy of your will. "We were supposed to be family."',
  ],
  parent: [
    '{name} looked at you across the table. "I raised you. And this is what I get?"',
    '"I did not think I would live to be cut out of my own child\'s will," {name} says, dry as toast.',
  ],
  grandchild: ['{name} stared at the floor. "They say I\'m not in your will. Did I do something?"'],
  friend: ['{name} laughed it off, then stopped laughing. "I know it\'s just paper. But I thought it meant something."'],
  spouse: ['{name} put the folded will on the table between you. "Explain this. Now."'],
}

function opener(g: GameState, p: Person): string {
  const key = p.relation === 'stepparent' ? 'parent' : p.relation === 'halfSibling' || p.relation === 'stepsibling' ? 'sibling' : p.relation === 'bestFriend' ? 'friend' : p.relation
  const list = OPENERS[key] ?? OPENERS.child
  return pick(g, list).replace('{name}', p.firstName).replace('{coat}', pronouns(p.gender).his + ' coat')
}

/** The cut-out relative confronts the player. */
export function queueConfront(g: GameState, p: Person): void {
  const w = readWl(g, p)
  const ties = readTies(g, p)
  const options: ChoiceOption[] = [
    { id: 'explain', label: 'Explain yourself', emoji: '\u{1F5E3}\u{FE0F}' },
    { id: 'restore', label: 'Apologize and put them back in the will', emoji: '\u{1F54A}\u{FE0F}' },
    { id: 'compromise', label: 'Offer a smaller share', emoji: '\u{2696}\u{FE0F}' },
    { id: 'buy', label: 'Buy them off with money now', emoji: '\u{1F4B5}' },
    { id: 'double', label: 'Double down: "It\'s my money"', emoji: '\u{1F624}' },
  ]
  if (ties.allowance > 0) options.push({ id: 'cutoff', label: 'Cut off their allowance too', emoji: '\u{2702}\u{FE0F}' })
  options.push({ id: 'refuse', label: 'Refuse to discuss it', emoji: '\u{1F910}' })
  updateWl(g, p, (x) => {
    x.confY = g.year
    x.stage = Math.max(x.stage, 3)
  })
  scriptChoice(g, S_CONFRONT, `${p.firstName} Wants to Talk`, `${inPrison(g) ? 'In the prison visiting room: ' : ''}${opener(g, p)}\n\n${nowAngry(g, p)}${w.hard > 0 ? ` Your last answer did not help.` : ''}`, options, {
    emoji: '\u{1F620}',
    data: { pid: p.id },
    personId: p.id,
  })
}

/** The softer or harder way a person takes an explanation. */
function listening(p: Person): number {
  const t = temper(p)
  return clamp(1 + 0.2 * t.forgiving - 0.2 * t.petulant, 0.6, 1.4)
}

defineScript(S_CONFRONT, (g, choice, data) => {
  const p = who(g, data)
  if (!p) return
  const w = readWl(g, p)
  const t = temper(p)
  switch (choice) {
    case 'explain': {
      const relief = Math.round((12 + 10 * (1 - w.anger / 100)) * listening(p))
      updateWl(g, p, (x) => {
        x.anger -= relief
        if (!x.explained) x.explained = 'kind'
      })
      addRelationship(g, p, 2)
      addStat(g, 'happiness', -1)
      log(g, `I explained my will to ${myWho(p)}.`)
      say(g, `You explained your reasons, slowly, without raising your voice. ${p.firstName} did not agree, but ${pronouns(p.gender).he} listened. ${nowAngry(g, p)}`)
      return
    }
    case 'restore': {
      const report = changeWill(g, (gg, ws) => addHeir(gg, ws, p, 100))
      const wl = readWl(g, p)
      log(g, `I put ${myWho(p)} back in my will.`, 'good')
      say(g, `You apologized and put ${p.firstName} back in your will. ${report.lines[0] ?? ''} ${wl.known ? nowAngry(g, p) : ''}`.trim(), 'good')
      return
    }
    case 'double': {
      const bump = Math.round(12 * (1 + 0.2 * t.petulant))
      updateWl(g, p, (x) => {
        x.anger += bump
        x.hard = Math.min(3, x.hard + 1)
      })
      addRelationship(g, p, -5)
      log(g, `I told ${myWho(p)} it was my money and my decision.`)
      say(g, `"It's my money, and it's my decision." The silence that followed was longer than the conversation. ${nowAngry(g, p)}`, 'bad')
      return
    }
    case 'cutoff': {
      const bump = Math.round(18 * (1 + t.petulant * 0.2) * (1 + entitlement(p) / 100))
      updateTies(g, p, (x) => {
        x.allowance = 0
      })
      updateWl(g, p, (x) => {
        x.anger += bump
        x.hard = Math.min(3, x.hard + 1)
      })
      addRelationship(g, p, -10)
      addEntitlement(p, -3)
      log(g, `I cut off ${myWho(p)}'s allowance on top of everything else.`, 'bad')
      say(g, `You stopped ${p.firstName}'s allowance as well. ${pronouns(p.gender).He} had planned a whole life around it. ${nowAngry(g, p)}`, 'bad')
      return
    }
    case 'refuse': {
      updateWl(g, p, (x) => {
        x.anger += 4
        x.hard = Math.min(3, x.hard + 1)
      })
      addRelationship(g, p, -2)
      log(g, `I refused to discuss my will with ${myWho(p)}.`)
      say(g, `"I'm not discussing this." You shut the door, politely. ${p.firstName} stood on the other side of it for a while. ${nowAngry(g, p)}`, 'bad')
      return
    }
    case 'buy': {
      const potential = Math.max(1, Math.round(potentialShare(g, p) * (w.anger / 100 + 0.2)))
      const cash = Math.max(0, g.character.money)
      const amts = [0.04, 0.12, 0.3].map((f) => Math.round(Math.min(cash * 0.6, potential * f)))
      const opts: ChoiceOption[] = amts
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a >= 1 && canAfford(g, a))
        .map(({ a, i }) => ({ id: `a${i}`, label: `${i === 0 ? 'A gesture' : i === 1 ? 'A serious check' : 'A fortune'}: ${formatMoney(a)}`, emoji: '\u{1F4B5}' }))
      opts.push({ id: 'no', label: 'Never mind', emoji: '\u{1F64A}' })
      scriptChoice(g, S_BUY, 'Buy Them Off?', `You could write ${p.firstName} a check right now. Money rarely fixes feelings, and it works less each time you try it. ${nowAngry(g, p)}`, opts, {
        emoji: '\u{1F4B5}',
        data: { pid: p.id, amts },
        personId: p.id,
      })
      return
    }
    case 'compromise': {
      scriptInput(g, {
        title: `A Smaller Share for ${p.firstName}`,
        emoji: '\u{2696}\u{FE0F}',
        text: `What share of an equal portion do you leave ${p.firstName}? (percent; 100 is the same as everyone else). ${p.firstName} is ${angerLabel(w.anger).toLowerCase()} (${w.anger}).`,
        input: 'slider',
        min: 10,
        max: 90,
        step: 5,
        defaultValue: '50',
        scriptId: S_SHARE,
        data: { pid: p.id },
      })
      return
    }
    default:
  }
})

/**
 * Pay a relative to smooth things over. Real money leaves the player and lands in their pocket;
 * relief shrinks with the size of the stake and with every earlier attempt. Returns the popup text.
 */
export function payOff(g: GameState, p: Person, amt: number): string | null {
  if (amt < 1 || !canAfford(g, amt)) return null
  const relief = giftRelief(g, p, amt)
  // Goodwill follows the anger that was really there to soothe, so a small grudge can't be milked for trust.
  const eased = Math.min(relief, readWl(g, p).anger)
  moveCash(g, askedPurse(g), wholePurse(p), amt, 'gift')
  noteCashGift(g, p, amt)
  updateWl(g, p, (x) => {
    x.anger -= relief
    x.buys += 1
    x.buyY = g.year
  })
  addRelationship(g, p, Math.min(5, Math.round(eased / 6)))
  log(g, `I wrote ${myWho(p)} a check for ${formatMoney(amt)} to smooth things over.`)
  const verdict = relief >= 15 ? `${p.firstName} took it, and some of the anger went with it.` : relief >= 5 ? `${p.firstName} took it, and said thank you in a tone that did not mean "thank you".` : `${p.firstName} took the money and still looked at you like you owed ${pronouns(p.gender).him} an apology.`
  return `You wrote ${p.firstName} a check for ${formatMoney(amt)}. ${verdict} ${nowAngry(g, p)}`
}

defineScript(S_BUY, (g, choice, data) => {
  const p = who(g, data)
  if (!p || choice === 'no') return
  const amts = field(data, 'amts')
  const i = choice.startsWith('a') ? Number(choice.slice(1)) : -1
  const amt = Array.isArray(amts) && typeof amts[i] === 'number' ? Math.round(amts[i] as number) : 0
  const text = payOff(g, p, amt)
  if (text) say(g, text)
})

defineScript(S_SHARE, (g, choice, data) => {
  const p = who(g, data)
  if (!p) return
  const pct = clamp(Math.round(Number(choice)), 10, 90)
  if (!Number.isFinite(pct)) return
  const report = changeWill(g, (gg, ws) => addHeir(gg, ws, p, pct))
  log(g, `I offered ${myWho(p)} a ${pct}% share in my will.`)
  const w = readWl(g, p)
  say(g, `You left ${p.firstName} ${pct}% of an equal share. ${report.lines[0] ?? ''} ${w.known ? nowAngry(g, p) : ''}`.trim(), w.known && w.anger < 35 ? 'good' : undefined)
})

/** What anger a compromise would leave (for honest previews). */
export function angerIfShare(g: GameState, p: Person, pct: number): number {
  return angerAfterShare(readWl(g, p).anger, pct)
}

// ---------------------------------------------------------------------------
// A spouse who is not putting up with it

export function settlementOffer(g: GameState, p: Person): number {
  const cap = Math.max(0, g.character.money) * 0.5
  return Math.max(0, Math.round(Math.min(cap, estateEstimate(g) * 0.04, potentialShare(g, p) * 0.3)))
}

export function queueSpouseUltimatum(g: GameState, p: Person): void {
  const prenup = p.data.prenup === true
  const offer = settlementOffer(g, p)
  const options: ChoiceOption[] = [
    { id: 'restore', label: `Put ${p.firstName} back in the will`, emoji: '\u{1F54A}\u{FE0F}' },
    ...(offer >= 1 && canAfford(g, offer) ? [{ id: 'settle', label: `Offer a settlement: ${formatMoney(offer)}`, emoji: '\u{1F4DD}' }] : []),
    ...(g.year >= 1950 ? [{ id: 'counsel', label: 'Suggest couples counseling', emoji: '\u{1F6CB}\u{FE0F}' }] : []),
    { id: 'bluff', label: 'Call the bluff', emoji: '\u{1F624}' },
  ]
  updateWl(g, p, (x) => {
    x.threatY = g.year
    x.confY = g.year
    x.stage = Math.max(x.stage, 3)
  })
  const text = prenup
    ? `${p.firstName} has read the will and has a lawyer. "Your prenup is not as airtight as you think," ${pronouns(p.gender).he} says, "and I am not going to be written out of this marriage quietly."`
    : `${p.firstName} has read the will. "Either I'm your partner or I'm a guest. Decide. Because I'm not staying to be written out of this."`
  scriptChoice(g, S_SPOUSE, `${p.firstName}'s Ultimatum`, `${text}\n\n${nowAngry(g, p)}`, options, { emoji: '\u{1F494}', data: { pid: p.id }, personId: p.id })
}

defineScript(S_SPOUSE, (g, choice, data) => {
  const p = who(g, data)
  if (!p || p.relation !== 'spouse') return
  if (choice === 'restore') {
    const report = changeWill(g, (gg, ws) => addHeir(gg, ws, p, 100))
    log(g, `I put ${p.firstName} back in my will.`, 'good')
    say(g, `You put ${p.firstName} back in the will. ${report.lines[0] ?? ''} ${nowAngry(g, p)}`.trim(), 'good')
    return
  }
  if (choice === 'settle') {
    const offer = settlementOffer(g, p)
    if (offer < 1 || !canAfford(g, offer)) return
    const relief = giftRelief(g, p, offer)
    moveCash(g, askedPurse(g), wholePurse(p), offer, 'gift')
    updateTies(g, p, (t) => {
      t.given += offer
    })
    updateWl(g, p, (x) => {
      x.anger -= relief
      x.buys += 1
      x.buyY = g.year
      x.threatY = 0
    })
    addRelationship(g, p, Math.min(6, Math.round(relief / 5)))
    log(g, `I paid ${p.firstName} ${formatMoney(offer)} to settle the will dispute.`)
    say(g, `Your lawyers drew up a settlement worth ${formatMoney(offer)} to ${p.firstName}, paid now. ${relief >= 15 ? 'It took the edge off.' : 'It helped less than you hoped.'} ${nowAngry(g, p)}`)
    return
  }
  if (choice === 'counsel') {
    const before = p.relationship
    couplesCounseling(g, p)
    if (p.relationship > before) {
      updateWl(g, p, (x) => {
        x.anger -= Math.round(10 + 8 * (1 - x.anger / 100))
        x.threatY = 0
      })
    } else {
      updateWl(g, p, (x) => {
        x.anger += 3
      })
    }
    return
  }
  updateWl(g, p, (x) => {
    x.anger += 8
    x.hard = Math.min(3, x.hard + 1)
  })
  addRelationship(g, p, -8)
  log(g, `I called ${p.firstName}'s bluff over the will.`, 'bad')
  say(g, `"Go ahead and leave, then." ${p.firstName} did not blink. ${p.data.prenup === true ? 'The prenup may hold. It may not.' : 'There is no prenup to hide behind.'} ${nowAngry(g, p)}`, 'bad')
})

// ---------------------------------------------------------------------------
// The tabloids

export function pressCost(g: GameState): number {
  return Math.round(clamp(netWorth(g) * 0.002, 3_000 * goodsScale(g), 400_000))
}

export function queuePress(g: GameState, p: Person): void {
  const cost = pressCost(g)
  const paper = g.year < 1925 ? 'The newspapers' : 'The tabloids'
  const options: ChoiceOption[] = [
    ...(canAfford(g, cost) ? [{ id: 'pr', label: `Hire ${g.year < 1950 ? 'a press agent' : 'a publicist'} (${formatMoney(cost)})`, emoji: '\u{1F4F0}' }] : []),
    { id: 'statement', label: 'Issue a short, dignified statement', emoji: '\u{1F4DD}' },
    { id: 'ignore', label: 'Say nothing', emoji: '\u{1F910}' },
  ]
  scriptChoice(
    g,
    S_PRESS,
    'Family Feud Makes the Papers',
    `${paper} got hold of the story. "${g.character.lastName} Heir Cut Out!" ${p.firstName} told a friend, who told a reporter, who told everyone. ${landline(g) ? `Your ${phoneWord(g)} has not stopped ringing.` : 'Visitors have not stopped arriving.'}`,
    options,
    { emoji: '\u{1F4F0}', data: { pid: p.id }, personId: p.id },
  )
}

defineScript(S_PRESS, (g, choice, data) => {
  const p = who(g, data)
  if (choice === 'pr') {
    const cost = pressCost(g)
    if (!canAfford(g, cost)) return
    addMoney(g, -cost, 'purchase')
    addStat(g, 'happiness', -1)
    log(g, `I hired ${g.year < 1950 ? 'a press agent' : 'a publicist'} to deal with the story about my will (${formatMoney(cost)}).`)
    notice(g, 'Damage Control', `The ${g.year < 1950 ? 'press agent' : 'publicist'} buried the story under three better ones. It cost ${formatMoney(cost)}. ${p ? `${p.firstName} was not thrilled to read about being "a source close to the family".` : ''}`.trim(), { emoji: '\u{1F4F0}' })
    return
  }
  if (choice === 'statement') {
    addStat(g, 'happiness', -2)
    addHidden(g, 'fame', -1)
    log(g, 'I issued a statement about my family and my will.')
    notice(g, 'Statement', 'You called it "a private family matter," which made it a public matter for about a week.', { emoji: '\u{1F4DD}' })
    return
  }
  addStat(g, 'happiness', -4)
  addHidden(g, 'fame', -2)
  addHidden(g, 'notoriety', 2)
  log(g, 'I let the papers write whatever they wanted about my will.', 'bad')
  notice(g, 'No Comment', `You said nothing and the story wrote itself. ${common(g, 'socialMedia') ? 'The comment section had notes on your character.' : 'The letters page of the paper had notes on your character.'}`, { emoji: '\u{1F4F0}', tone: 'bad' })
})

// ---------------------------------------------------------------------------
// Grandchildren in the middle

export function queueGrandkids(g: GameState, parent: Person, gc: Person): void {
  scriptChoice(
    g,
    S_GRANDKIDS,
    'Caught in the Middle',
    `${gc.firstName} (${gc.age}) tugged your sleeve. "Why doesn't ${parent.firstName} want to come over any more? Did you do something?"`,
    [
      { id: 'love', label: 'Say you love them both', emoji: '\u{1F496}' },
      { id: 'blame', label: `Say ${parent.firstName} is being unreasonable`, emoji: '\u{1F612}' },
      { id: 'dodge', label: '"Grown-up business."', emoji: '\u{1F64A}' },
    ],
    { emoji: '\u{1F9D2}', data: { pid: parent.id, gid: gc.id }, personId: gc.id },
  )
}

defineScript(S_GRANDKIDS, (g, choice, data) => {
  const parent = who(g, data)
  const gid = field(data, 'gid')
  const gc = typeof gid === 'string' ? getPerson(g, gid) : undefined
  if (!gc || !gc.alive) return
  if (choice === 'love') {
    addRelationship(g, gc, 4)
    notePerson(gc, 'Was kept out of the family feud by the player.')
    log(g, `I told ${myWho(gc)} I love the whole family, no matter what.`, 'good')
    notice(g, 'Caught in the Middle', `"I love you both, and this isn't your fault." ${gc.firstName} hugged you very hard. Kids know more than they let on.`, { emoji: '\u{1F496}', tone: 'good' })
    return
  }
  if (choice === 'blame') {
    addRelationship(g, gc, -2)
    if (parent) {
      updateWl(g, parent, (w) => {
        w.anger += 8
        w.hard = Math.min(3, w.hard + 1)
      })
    }
    log(g, `I badmouthed ${parent ? myWho(parent) : 'their parent'} to ${myWho(gc)}.`, 'bad')
    notice(g, 'Caught in the Middle', `You said ${parent ? parent.firstName : 'their parent'} was being unreasonable. ${gc.firstName} repeated it at home that night, word for word. ${parent ? `${nowAngry(g, parent)}` : ''}`, { emoji: '\u{1F612}', tone: 'bad' })
    return
  }
  addRelationship(g, gc, -2)
  addStat(g, 'happiness', -1)
  log(g, `I told ${myWho(gc)} it was grown-up business.`)
  notice(g, 'Caught in the Middle', `"Grown-up business." ${gc.firstName} nodded in the way kids nod when they have decided you don't know either.`, { emoji: '\u{1F64A}' })
})

// ---------------------------------------------------------------------------
// An olive branch from an estranged child

export function queueOlive(g: GameState, p: Person): void {
  const x = pronouns(p.gender)
  scriptChoice(
    g,
    S_OLIVE,
    `${p.firstName} Reaches Out`,
    `After years of silence, ${contactNoun(g)} from ${yourWho(p)}. "I'm not saying I forgive you," ${x.he} says. "But I'm tired of being angry. Can we talk?"`,
    [
      { id: 'accept', label: 'Say yes. Mean it.', emoji: '\u{1F91D}' },
      { id: 'later', label: '"Give me some time"', emoji: '\u{23F3}' },
      { id: 'refuse', label: 'Turn them away', emoji: '\u{1F6AA}' },
    ],
    { emoji: '\u{1F54A}\u{FE0F}', data: { pid: p.id }, personId: p.id },
  )
}

defineScript(S_OLIVE, (g, choice, data) => {
  const p = who(g, data)
  if (!p) return
  if (choice === 'accept') {
    reconcile(g, p)
    addStat(g, 'happiness', 6)
    notice(g, 'Back in Touch', `You and ${p.firstName} talked for three hours. Nothing was solved, and everything was better. It's a start.`, { emoji: '\u{1F91D}', tone: 'good' })
    return
  }
  if (choice === 'later') {
    updateWl(g, p, (w) => {
      w.anger += 3
    })
    log(g, `I asked ${myWho(p)} for more time when they reached out.`)
    return
  }
  updateWl(g, p, (w) => {
    w.anger += 12
    w.hard = Math.min(3, w.hard + 1)
  })
  addStat(g, 'happiness', -4)
  log(g, `I turned ${myWho(p)} away when they reached out.`, 'bad')
  notice(g, 'Door Closed', `You turned ${p.firstName} away. It took ${pronouns(p.gender).him} years to knock; it will take longer next time.`, { emoji: '\u{1F6AA}', tone: 'bad' })
})
