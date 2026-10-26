// Answering money requests: the popups (one ask, or a bundle of small ones), and what each
// answer does. Give / give less (a slider) / lend (tracked per person) / say no / set boundaries.
// Money only moves with spend() (never below zero); a yes pleases them (less so when they're
// spoiled) and spoils a kid a little; a no stings (more when you're rich and it's small change);
// boundaries stop the asking for a while at a smaller cost. Some kids respect a no.
import { addHidden, addStat, count, getPerson, log, notice, scriptChoice, scriptInput, spend } from '../core'
import type { Reason } from '../kernel/reasons'
import { touch } from '../love'
import { chance, randInt } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { BOUNDARY_LINES, GAVE_LINES, LENT_LINES, REFUSED_LINES } from '../text/pools'
import { fillSlots } from '../text/state'
import { defineScript } from '../scripts'
import { talentHint } from '../talents'
import { common } from './era'
import { queueSecretaryRequest } from '../shops/luxury-secretary-state'
import { askDef } from './wealth-catalog'
import { payPersonWhole } from './purses'
import { POCKET_SCRIPT, setAllowance } from './wealth-kids'
import { whoOf, type Ask, type AskDef } from './wealth-ask'
import {
  addEntitlement,
  bumpRelationship,
  cap,
  entitlement,
  gratitude,
  isAbroad,
  isDescendant,
  isKid,
  money,
  myOf,
  perceivedWealth,
  recordAsk,
  round,
  sting,
  traitIn,
  updateTies,
  type Answer,
} from './wealth-core'
import type { ChoiceOption, GameState, Json, Person } from '../types'

export { BOUNDARY_LINES }

export const ASK_SCRIPT = 'wealth.ask'
export const LESS_SCRIPT = 'wealth.ask.less'
export const BUNDLE_SCRIPT = 'wealth.bundle'
export const ADULT_SCRIPT = 'wealth.allowance.adult'

// ---------------------------------------------------------------------------
// Plain-JSON round trip of an Ask inside popup data

export function askJson(a: Ask): Json {
  return JSON.parse(JSON.stringify(a)) as Json
}

export function readAsk(data: Json | undefined): Ask | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const a = data.ask && typeof data.ask === 'object' && !Array.isArray(data.ask) ? data.ask : data
  if (typeof a.k !== 'string' || typeof a.title !== 'string' || typeof a.what !== 'string') return null
  const amt = typeof a.amt === 'number' && Number.isFinite(a.amt) ? Math.max(0, Math.round(a.amt)) : 0
  const out: Ask = { k: a.k, title: a.title, emoji: typeof a.emoji === 'string' ? a.emoji : '\u{1F4B5}', text: typeof a.text === 'string' ? a.text : '', amt, what: a.what }
  if (typeof a.pid === 'string') out.pid = a.pid
  if (typeof a.name === 'string') out.name = a.name
  if (a.buy === true) out.buy = true
  if (typeof a.giveLabel === 'string') out.giveLabel = a.giveLabel
  if (typeof a.alt === 'number' && Number.isFinite(a.alt) && a.alt > 0) out.alt = Math.round(a.alt)
  if (typeof a.altWhat === 'string') out.altWhat = a.altWhat
  if (typeof a.altLabel === 'string') out.altLabel = a.altLabel
  if (a.less === true) out.less = true
  if (a.lend === true) out.lend = true
  if (a.small === true) out.small = true
  if (typeof a.odds === 'number' && Number.isFinite(a.odds)) out.odds = Math.max(0, Math.min(1, a.odds))
  if (typeof a.partial === 'number' && Number.isFinite(a.partial)) out.partial = Math.max(0, Math.min(1, a.partial))
  if (a.x && typeof a.x === 'object' && !Array.isArray(a.x)) out.x = a.x
  return out
}

// ---------------------------------------------------------------------------
// Presenting

/** Smallest "give less" amount offered on the slider. */
function lessFloor(a: Ask): number {
  return Math.max(1, round(a.amt * 0.1))
}

function cashOf(g: GameState): number {
  return Math.max(0, g.character.money)
}

/** The honest options for one ask, given what you can actually pay right now. */
export function askChoices(g: GameState, a: Ask): ChoiceOption[] {
  const def = askDef(a.k)
  if (!def) return [{ id: 'no', label: 'Say no', emoji: '\u{1F645}' }]
  const p = a.pid ? getPerson(g, a.pid) : undefined
  const cash = cashOf(g)
  const out: ChoiceOption[] = []
  if (!def.custom) {
    if (a.amt > 0 && cash >= a.amt) out.push({ id: 'give', label: a.giveLabel ? `${a.giveLabel} (${money(a.amt)})` : `Give ${money(a.amt)}`, emoji: a.buy ? '\u{1F6CD}\u{FE0F}' : '\u{1F4B5}', hint: ventureHint(g, a) })
    if (a.alt && a.alt < a.amt && cash >= a.alt) out.push({ id: 'alt', label: `${a.altLabel ?? 'Offer less'} (${money(a.alt)})`, emoji: '\u{1F642}' })
    // The Business hint rides on the first way to fund it you can afford (full or partial: same odds).
    if (a.less && cash >= lessFloor(a) && a.amt > 1) out.push({ id: 'less', label: cash >= a.amt ? 'Give less...' : `Give what you can (you have ${money(cash)})...`, emoji: '\u{1F39A}\u{FE0F}', hint: cash >= a.amt ? undefined : ventureHint(g, a) })
    if (a.lend && p && a.amt > 0 && cash >= a.amt) out.push({ id: 'lend', label: `Lend it (${money(a.amt)}), to be paid back`, emoji: '\u{1F91D}' })
  }
  for (const x of def.extras ?? []) {
    if (x.show && !x.show(g, a, p)) continue
    out.push({ id: x.id, label: x.label(g, a, p), emoji: x.emoji, hint: x.hint?.(g, a, p) || undefined })
  }
  if (!def.noNo) out.push({ id: 'no', label: def.noLabel ?? 'Say no', emoji: '\u{1F645}' })
  if (p && !def.noNo && def.id !== 'kid.willfight') out.push({ id: 'bound', label: 'Set boundaries (no more money talk for a while)', emoji: '\u{1F6A7}' })
  return out
}

/** Business talent: the honest odds that a venture pays you back (the same odds the payout rolls). */
function ventureHint(g: GameState, a: Ask): string | undefined {
  if (typeof a.odds !== 'number') return undefined
  const odds = a.odds
  const back = Math.round((odds + (a.partial ?? 0)) * 100)
  const text = odds >= 0.4 ? `Your business sense likes this one: about a ${Math.round(odds * 100)}% chance it really works (${back}% you see some money back)` : odds >= 0.2 ? `Your business sense says it's a long shot: about ${Math.round(odds * 100)}% it works out` : `Your business sense says it's a money pit: about ${Math.round(odds * 100)}% it works out`
  return talentHint(g, 'Business', text) || undefined
}

/** Queue one ask as a choice popup, bypassing staff screening after explicit inbox review. */
export function presentAskDirect(g: GameState, a: Ask): void {
  const extra = cashOf(g) < a.amt && a.amt > 0 ? `\n\nYou have ${money(cashOf(g))} in cash right now.` : ''
  scriptChoice(g, ASK_SCRIPT, a.title, a.text + extra, askChoices(g, a), { emoji: a.emoji, data: { ask: askJson(a) }, personId: a.pid })
}

/** Queue one ask, or let an employed secretary put it in the approval inbox. */
export function presentAsk(g: GameState, a: Ask): void {
  const routed = queueSecretaryRequest(g, { pid: a.pid, title: a.title, what: a.what, amount: a.amt, ask: askJson(a) })
  if (!routed) return presentAskDirect(g, a)
  if (routed.policy === 'decline') refuse(g, a, 'no', true)
}

/** Queue several small asks as one popup (one tap answers them all). */
export function presentBundle(g: GameState, asks: Ask[]): void {
  // A secretary turns a noisy bundle into individual, attributable inbox items. Policies are
  // applied per relationship category; nothing is ever paid automatically.
  if (asks.length && queueThroughSecretary(g, asks)) return
  const total = asks.reduce((s, a) => s + a.amt, 0)
  const family = asks.filter((a) => {
    const p = a.pid ? getPerson(g, a.pid) : undefined
    return !!p && (isDescendant(p) || p.relation === 'spouse' || p.relation === 'partner' || p.relation === 'fiance')
  })
  const famTotal = family.reduce((s, a) => s + a.amt, 0)
  const lines = asks.map((a) => `• ${cap(whoOf(a, a.pid ? getPerson(g, a.pid) : undefined))}: ${a.what} (${money(a.amt)})`)
  const choices: ChoiceOption[] = []
  if (cashOf(g) >= total) choices.push({ id: 'all', label: `Pay for all of it (${money(total)})`, emoji: '\u{1F4B8}' })
  if (family.length > 0 && family.length < asks.length && cashOf(g) >= famTotal) choices.push({ id: 'family', label: `Only the family's (${money(famTotal)})`, emoji: '\u{1F46A}' })
  choices.push({ id: 'none', label: 'Say no to all of it', emoji: '\u{1F645}' })
  scriptChoice(g, BUNDLE_SCRIPT, 'Everybody Wants Something', `The little asks piled up this year:\n${lines.join('\n')}`, choices, {
    emoji: '\u{1F4EC}',
    data: { asks: asks.map(askJson) },
  })
}

function queueThroughSecretary(g: GameState, asks: Ask[]): boolean {
  // Test employment without mutating state. If the first request is not intercepted there is no
  // secretary, so the ordinary bundle stays intact.
  const first = asks[0]
  const routed = queueSecretaryRequest(g, { pid: first.pid, title: first.title, what: first.what, amount: first.amt, ask: askJson(first) })
  if (!routed) return false
  if (routed.policy === 'decline') refuse(g, first, 'no', true)
  for (const ask of asks.slice(1)) {
    const next = queueSecretaryRequest(g, { pid: ask.pid, title: ask.title, what: ask.what, amount: ask.amt, ask: askJson(ask) })
    if (next?.policy === 'decline') refuse(g, ask, 'no', true)
  }
  return true
}

// ---------------------------------------------------------------------------
// Answering

/** What they asked for, for the log: 'a trampoline' or 'money (help with rent)'. */
function askedFor(a: Ask): string {
  return a.buy ? a.what : `money (${a.what})`
}

/** An outsider's name for the first-person life log ('your cousin Dele' becomes 'my cousin Dele'). */
function myName(a: Ask): string {
  return (a.name ?? 'someone').replace(/^your /, 'my ')
}

function liveAsker(g: GameState, a: Ask): { ok: boolean; p?: Person } {
  if (!a.pid) return { ok: true }
  const p = getPerson(g, a.pid)
  if (!p || !p.alive) return { ok: false }
  return { ok: true, p }
}

function gone(g: GameState, a: Ask): void {
  notice(g, a.title, "They're no longer in your life, so the question answered itself.", { emoji: a.emoji })
}

/** Did a refused kid (or adult kid) secretly respect it? Grounded kids with a level head do. */
function respects(g: GameState, p: Person): boolean {
  if (!isDescendant(p) || entitlement(p) >= 40) return false
  const steady = traitIn(p, 'honest', 'serious', 'ambitious', 'calm', 'caring', 'loyal')
  return chance(g, steady ? 0.45 : 0.15)
}

function reactionLine(g: GameState, p: Person, full: boolean): string {
  const e = entitlement(p)
  const x = p.gender === 'male' ? { he: 'he', He: 'He', his: 'his' } : { he: 'she', He: 'She', his: 'her' }
  if (e >= 70) return pickSite(g, [`${x.He} asked why it took you so long.`, `${x.He} said "thanks, I guess" without looking up.`, `${x.He} is already asking about next time.`], 0xfa271119)
  if (!full && e >= 45) return pickSite(g, [`${x.He} looked at it like it was a parking ticket.`, `"That's it?" ${x.he} asked.`], 0x82078c70)
  // From prison the thanks come by mail or on visiting day.
  if (g.character.prison) return pickSite(g, [`${x.He} wrote back a thank-you letter, with drawings.`, `${x.He} came on visiting day just to say thank you.`, `${x.He} sent a card that said "you're the best (even in there)."`], 0xd39f22fc)
  // Family abroad can't hug you either.
  if (isAbroad(g, p)) return pickSite(g, [`${x.He} wrote to say thank you, at length.`, `${x.He} sent a photo of what it bought and a very long thank-you.`], 0x4cf06bce)
  return pickSite(g, [`${x.He} hugged you so hard your back cracked.`, `${x.He} was genuinely touched.`, `${x.He} said you're the best, and for a moment you believed it.`, `${x.He} got a little teary.`], 0x3fc695e9)
}

type GiveKind = 'full' | 'alt' | 'less'

/** What an ask costs the player: cash for the asker's own pocket is one booking between the two; anything else pays a bill or buys a thing. */
function payAsk(g: GameState, def: AskDef | undefined, p: Person | undefined, amount: number, reason: Reason): boolean {
  return p && def?.cash ? payPersonWhole(g, p, amount, reason) : spend(g, amount, 'purchase')
}

/** Pay for an ask (all of it, the cheaper alternative, or a chosen smaller amount). */
export function giveFor(g: GameState, a: Ask, amount: number, kind: GiveKind): void {
  const def = askDef(a.k)
  const { ok, p } = liveAsker(g, a)
  if (!def || !ok) return gone(g, a)
  const amt = Math.max(0, Math.round(amount))
  if (amt <= 0 || !payAsk(g, def, p, amt, 'gift')) {
    if (p) bumpRelationship(g, p, -1)
    notice(g, a.title, `You don't have ${money(amt)} in cash right now, so that settles that. ${p ? `${p.firstName} took it well, mostly.` : ''}`.trim(), { emoji: '\u{1F4B8}' })
    return
  }
  const full = kind === 'full'
  const share = Math.min(1, amt / Math.max(1, a.amt))
  const what = kind === 'alt' ? a.altWhat ?? a.what : a.what
  count(g, 'wealthGifts')
  let rel = 0
  if (p) {
    touch(g, p)
    updateTies(g, p, (t) => {
      t.given += amt
    })
    recordAsk(g, p, what, full ? 'yes' : 'less', amt)
    const thanks = def.thanks ?? 8
    rel = kind === 'full' ? gratitude(p, thanks) : kind === 'alt' ? gratitude(p, thanks * 0.6) : share < 0.25 ? -randInt(g, 1, 3) : gratitude(p, thanks * share)
    if (kind === 'alt' && entitlement(p) >= 60) rel = -randInt(g, 1, 4)
    bumpRelationship(g, p, rel)
    if (isDescendant(p) && p.age < 35 && def.spoil) addEntitlement(p, Math.round(def.spoil * (kind === 'full' ? 1 : kind === 'alt' ? 0.5 : share * 0.7)))
  }
  if (def.need) addHidden(g, 'karma', full ? 2 : 1)
  addStat(g, 'happiness', def.need || (p && isKid(p)) ? randInt(g, 1, 3) : randInt(g, 0, 2))
  const extra = def.onGive ? def.onGive(g, a, p, amt, full) : ''
  const mine = p ? myOf(p) : myName(a)
  log(g, a.buy ? `I bought ${mine} ${what} (${money(amt)}).` : fillSlots(pickLine(g, GAVE_LINES), { who: mine, money: money(amt), what }), 'good')
  const reaction = p ? (rel < 0 ? (share < 0.25 ? `${p.firstName} looked at the amount, then at you, then back at the amount.` : reactionLine(g, p, false)) : reactionLine(g, p, full)) : ''
  const you = a.buy ? `You bought ${whoOf(a, p)} ${what} for ${money(amt)}.` : `You gave ${whoOf(a, p)} ${money(amt)}${kind === 'less' && amt < a.amt ? ` (not the ${money(a.amt)} they asked for)` : ''}.`
  notice(g, a.title, [you, reaction, extra].filter(Boolean).join(' '), { emoji: a.emoji, tone: 'good' })
}

function lend(g: GameState, a: Ask): void {
  const def = askDef(a.k)
  const { ok, p } = liveAsker(g, a)
  if (!def || !ok || !p) return gone(g, a)
  if (!payAsk(g, def, p, a.amt, 'support')) {
    notice(g, a.title, `You don't have ${money(a.amt)} to lend right now.`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  updateTies(g, p, (t) => {
    if (t.owes <= 0) t.owesSince = g.year
    t.owes += a.amt
  })
  recordAsk(g, p, a.what, 'lend', a.amt)
  bumpRelationship(g, p, gratitude(p, (def.thanks ?? 8) * 0.6))
  count(g, 'wealthLoans')
  log(g, fillSlots(pickLine(g, LENT_LINES), { who: myOf(p), money: money(a.amt), what: a.what }))
  const promise = pickLine(g, ['by the end of the year', 'as soon as things pick up', 'with interest, probably', '"soon"'])
  notice(g, a.title, `You lent ${p.firstName} ${money(a.amt)}. ${p.gender === 'male' ? 'He' : 'She'} promised to pay you back ${promise}. You'll find it under Relationships if you ever want to ask for it.`, { emoji: '\u{1F91D}' })
}

/** How much a refusal stings: more when you're rich and it was pocket change to you. */
function refusalCost(g: GameState, a: Ask, def: AskDef, p: Person): number {
  const base = sting(p, def.hurt ?? 6)
  const pocketChange = a.amt > 0 && a.amt < perceivedWealth(g) * 0.005
  return Math.round(base * (pocketChange ? 1.3 : 1))
}

function refuse(g: GameState, a: Ask, answer: Answer, quiet = false): void {
  const def = askDef(a.k)
  const { ok, p } = liveAsker(g, a)
  if (!def || !ok) return gone(g, a)
  count(g, 'wealthRefusals')
  const parts: string[] = []
  if (p) {
    touch(g, p)
    recordAsk(g, p, a.what, answer, a.amt)
    const respect = answer === 'no' && respects(g, p)
    if (answer === 'bound') {
      updateTies(g, p, (t) => {
        t.bound = g.year + 5
      })
      const cost = entitlement(p) >= 60 ? refusalCost(g, a, def, p) : Math.round(refusalCost(g, a, def, p) * 0.5)
      bumpRelationship(g, p, -cost)
      if (isDescendant(p)) addEntitlement(p, -8)
      addStat(g, 'happiness', randInt(g, 0, 2))
      const atm = common(g, 'atm') ? 'an ATM' : 'a bank'
      parts.push(`You told ${p.firstName} you love ${p.gender === 'male' ? 'him' : 'her'}, but you're not ${atm}: no more money talk for a while.`)
      parts.push(entitlement(p) >= 60 ? `${p.firstName} did not take it well.` : `${p.firstName} was hurt, then quiet, then (eventually) okay.`)
      log(g, fillSlots(pickLine(g, BOUNDARY_LINES), { who: myOf(p) }))
    } else if (respect) {
      bumpRelationship(g, p, randInt(g, 1, 3))
      if (isDescendant(p)) addEntitlement(p, -4)
      parts.push(`You told ${p.firstName} no. ${p.gender === 'male' ? 'He' : 'She'} sulked for a day, then admitted you had a point. Secretly, ${p.gender === 'male' ? 'he' : 'she'} respects it.`)
      log(g, fillSlots(pickLine(g, REFUSED_LINES), { who: myOf(p), what: askedFor(a) }))
    } else {
      bumpRelationship(g, p, -refusalCost(g, a, def, p))
      if (isDescendant(p)) addEntitlement(p, -3)
      parts.push(`You told ${p.firstName} no.`)
      parts.push(
        entitlement(p) >= 60
          ? pickSite(g, [`${p.firstName} called it "abuse" and slammed every door in the house.`, `${p.firstName} told everyone you're "basically broke," which is not how that works.`], 0x286ac511)
          : pickSite(g, [`${p.firstName} said "fine." It was not fine.`, `${p.firstName} pointed out how much you have. Several times.`, `Dinner was very quiet.`], 0x91ba553b),
      )
      log(g, fillSlots(pickLine(g, REFUSED_LINES), { who: myOf(p), what: askedFor(a) }), 'bad')
    }
  } else {
    parts.push(pickLine(g, ['You said no.', 'You politely declined.', 'You passed.']))
  }
  if (def.need && answer !== 'bound' && perceivedWealth(g) > a.amt * 50) {
    addHidden(g, 'karma', -2)
    addStat(g, 'happiness', -randInt(g, 1, 3))
  }
  const extra = def.onNo ? def.onNo(g, a, p) : ''
  if (extra) parts.push(extra)
  if (!quiet) notice(g, a.title, parts.join(' '), { emoji: a.emoji })
}

/** Apply the ordinary refusal rules from the secretary inbox without another request popup. */
export function declineSecretaryAsk(g: GameState, a: Ask): void {
  refuse(g, a, 'no', true)
}

defineScript(ASK_SCRIPT, (g, choice, data) => {
  const a = readAsk(data)
  if (!a || !g.character.alive) return
  const def = askDef(a.k)
  if (!def) return
  switch (choice) {
    case 'give':
      return giveFor(g, a, a.amt, 'full')
    case 'alt':
      return giveFor(g, a, a.alt ?? a.amt, 'alt')
    case 'lend':
      return lend(g, a)
    case 'no':
      return refuse(g, a, 'no')
    case 'bound':
      return refuse(g, a, 'bound')
    case 'less': {
      const { ok, p } = liveAsker(g, a)
      if (!ok) return gone(g, a)
      const max = Math.min(Math.max(1, a.amt - 1), cashOf(g))
      if (max < 1) {
        notice(g, a.title, `You don't have any cash to give right now.`, { emoji: '\u{1F4B8}' })
        return
      }
      // The input popup has no cancel button, so the slider starts at zero: changing your mind
      // ("nothing after all") is a plain no.
      scriptInput(g, {
        title: a.title,
        emoji: a.emoji,
        text: `How much will you give ${whoOf(a, p)}? They asked for ${money(a.amt)}. (Slide to zero if you've changed your mind.)`,
        input: 'slider',
        money: true,
        min: 0,
        max,
        step: 1,
        defaultValue: String(Math.max(Math.min(lessFloor(a), max), Math.min(max, round(a.amt / 2)))),
        scriptId: LESS_SCRIPT,
        data: { ask: askJson(a) },
      })
      return
    }
    default: {
      const x = (def.extras ?? []).find((e) => e.id === choice)
      if (!x) return refuse(g, a, 'no')
      const { ok, p } = liveAsker(g, a)
      if (!ok) return gone(g, a)
      if (p) {
        touch(g, p)
        if (x.ans) recordAsk(g, p, a.what, x.ans, x.ans === 'yes' ? a.amt : 0)
        else
          updateTies(g, p, (t) => {
            t.asked = g.year
          })
      }
      x.run(g, a, p)
    }
  }
})

defineScript(LESS_SCRIPT, (g, choice, data) => {
  const a = readAsk(data)
  if (!a || !g.character.alive) return
  const n = Math.round(Number(choice))
  const max = Math.min(a.amt, cashOf(g))
  // A non-number (or zero) answer from an old client means "never mind": treat it as a no.
  if (!Number.isFinite(n) || n <= 0 || max <= 0) return refuse(g, a, 'no')
  giveFor(g, a, Math.min(n, max), n >= a.amt ? 'full' : 'less')
})

defineScript(POCKET_SCRIPT, (g, choice, data) => {
  if (!g.character.alive || !data || typeof data !== 'object' || Array.isArray(data)) return
  const p = typeof data.pid === 'string' ? getPerson(g, data.pid) : undefined
  if (!p || !p.alive) return
  const n = Number(choice)
  if (!Number.isFinite(n)) return
  updateTies(g, p, (t) => {
    t.asked = g.year
  })
  setAllowance(g, p, n)
})

defineScript(BUNDLE_SCRIPT, (g, choice, data) => {
  if (!g.character.alive || !data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.asks)) return
  const asks = data.asks.map((x) => readAsk(x)).filter((a): a is Ask => a !== null)
  const paid: string[] = []
  const refused: string[] = []
  for (const a of asks) {
    const { ok, p } = liveAsker(g, a)
    if (!ok) continue
    const family = !!p && (isDescendant(p) || p.relation === 'spouse' || p.relation === 'partner' || p.relation === 'fiance')
    const yes = choice === 'all' || (choice === 'family' && family)
    const def = askDef(a.k)
    if (yes && payAsk(g, def, p, a.amt, 'gift')) {
      paid.push(`${p ? p.firstName : a.name ?? 'someone'}: ${a.what}`)
      if (p) {
        touch(g, p)
        updateTies(g, p, (t) => {
          t.given += a.amt
        })
        recordAsk(g, p, a.what, 'yes', a.amt)
        bumpRelationship(g, p, gratitude(p, Math.max(2, (def?.thanks ?? 6) * 0.6)))
        if (isDescendant(p) && p.age < 35 && def?.spoil) addEntitlement(p, Math.max(1, Math.round(def.spoil * 0.7)))
      }
      if (def?.onGive) def.onGive(g, a, p, a.amt, true)
      log(g, `I paid for ${a.what} for ${p ? myOf(p) : myName(a)} (${money(a.amt)}).`, 'good')
    } else {
      refused.push(p ? p.firstName : a.name ?? 'someone')
      if (p) {
        touch(g, p)
        recordAsk(g, p, a.what, 'no', a.amt)
        bumpRelationship(g, p, -Math.max(1, Math.round(sting(p, (def?.hurt ?? 4) * 0.5))))
        if (isDescendant(p)) addEntitlement(p, -1)
      }
      // Life goes on without your money (a friend's wedding still happens).
      if (def?.onNo) def.onNo(g, a, p)
    }
  }
  const text = [paid.length ? `You paid for: ${paid.join('; ')}.` : '', refused.length ? `You said no to ${refused.join(', ')}. ${refused.length > 1 ? 'They compared notes.' : 'They noticed.'}` : ''].filter(Boolean).join('\n')
  notice(g, 'Everybody Wants Something', text || 'Nobody was left to ask.', { emoji: '\u{1F4EC}', tone: paid.length ? 'good' : 'neutral' })
})

defineScript(ADULT_SCRIPT, (g, choice, data) => {
  if (!g.character.alive || !data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.pids)) return
  const people = data.pids.map((id) => (typeof id === 'string' ? getPerson(g, id) : undefined)).filter((p): p is Person => !!p && p.alive)
  if (!people.length) return
  const names = people.map((p) => p.firstName).join(' and ')
  if (choice === 'keep') {
    for (const p of people) {
      updateTies(g, p, (t) => {
        t.adultOk = true
      })
      bumpRelationship(g, p, randInt(g, 2, 5))
    }
    notice(g, 'All Grown Up', `You'll keep supporting ${names}. ${people.length > 1 ? 'They' : people[0].gender === 'male' ? 'He' : 'She'} promised to "figure it out eventually."`, { emoji: '\u{1F393}' })
    return
  }
  for (const p of people) {
    updateTies(g, p, (t) => {
      t.allowance = 0
      t.adultOk = false
    })
    bumpRelationship(g, p, -randInt(g, 1, 4))
    addEntitlement(p, -6)
  }
  log(g, `I stopped paying ${names} an allowance now that they're adults.`)
  notice(g, 'All Grown Up', `You told ${names} the allowance stops now: welcome to adulthood. ${pickLine(g, ['There was a lot of sighing.', 'Someone said "but rent is SO expensive."', 'It was the first time anyone in your family read a job listing.'])}`, { emoji: '\u{1F393}' })
})
