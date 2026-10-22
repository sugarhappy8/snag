// Shared helpers for the legit side of the home computer: who may use it, screen time,
// paying for things (kids get their parents to chip in), and taxed earnings.
import { personCash } from '../cash'
import { canUseComputer, computerLocked, ownsComputer } from '../computer'
import { addMoney, addStat, clamp, earnIncome, formatMoney, log, notice, parents, spend } from '../core'
import { taxAdditionalIncome } from '../finance'
import type { Reason } from '../kernel/reasons'
import { chance, randInt } from '../rng'
import { pickLine } from '../text/pick'
import type { GameState, Person } from '../types'
import { addScreenTime, SCREEN_LIMIT } from './skills'

/** Why the player can't do anything at all right now (dead / prison), else null. */
export function lifeBlock(g: GameState): string | null {
  if (!g.character.alive) return 'You are dead.'
  if (g.character.prison) return "There's no computer in your cell. Just a guy named Tiny who wants your pudding."
  return null
}

/** Why the player can't use the computer right now, else null. */
export function computerBlock(g: GameState): string | null {
  const life = lifeBlock(g)
  if (life) return life
  if (!ownsComputer(g)) return "You don't have a working computer."
  return computerLocked(g)
}

export function ageBlock(g: GameState, minAge: number, what: string): string | null {
  return g.character.age < minAge ? `You must be at least ${minAge} to ${what}.` : null
}

/** First non-null reason. */
export function firstReason(...reasons: (string | null)[]): string | null {
  for (const r of reasons) if (r) return r
  return null
}

export function hasUsableComputer(g: GameState): boolean {
  return g.character.alive && !g.character.prison && canUseComputer(g)
}

/** Living parents (and step-parents) who still look after you. */
export function guardians(g: GameState): Person[] {
  return parents(g).filter((p) => p.alive)
}

export function parentWord(p: Person): string {
  return p.relation === 'stepparent' ? (p.gender === 'male' ? 'your stepdad' : 'your stepmom') : p.gender === 'male' ? 'your dad' : 'your mom'
}

/**
 * A session at the computer. Past SCREEN_LIMIT sessions a year it starts to cost you: grades,
 * posture, sleep. Returns this year's sessions.
 */
export function useComputer(g: GameState, sessions = 1): number {
  const before = addScreenTime(g, 0)
  const total = addScreenTime(g, sessions)
  if (total <= SCREEN_LIMIT) return total
  const c = g.character
  const cur = c.education.current
  if (cur && cur.level !== 'preschool' && chance(g, 0.4)) cur.grades = Math.round(clamp(cur.grades - randInt(g, 1, 3)))
  if (chance(g, 0.25)) addStat(g, 'health', -1)
  if (chance(g, 0.2)) addStat(g, 'happiness', -1)
  if (before <= SCREEN_LIMIT) {
    log(g, pickLine(g, ['I have been staring at a screen so long my eyes feel like raisins.', 'I forgot what the sun looks like. It was on my screensaver.', 'My chair has a permanent dent in the shape of me.']), 'bad')
  }
  return total
}

/**
 * Pay for something. Kids (under 18) can get a parent to pay when the parent can afford it and
 * likes them enough. Returns who paid ('self', 'your mom', ...) or null after a notice.
 */
export function payFor(g: GameState, amount: number, what: string, opts: { parentsMayPay?: boolean; emoji?: string } = {}): string | null {
  if (!(amount > 0)) return 'free'
  const c = g.character
  if (c.money >= amount && spend(g, amount, 'tuition')) return 'self'
  if (c.age < 18 && opts.parentsMayPay !== false) {
    // Pocket money is easy; a bootcamp takes a parent who is well off and likes you.
    const big = amount > 2_000
    const ps = guardians(g).filter((p) => p.money >= amount * (big ? 5 : 2) && p.relationship >= (big ? 60 : 35))
    if (ps.length) {
      const p = ps.reduce((a, b) => (b.money > a.money ? b : a))
      // The parent pays the school: the rounding is the line's own.
      personCash(g, p, Math.round(p.money - amount) - p.money, 'tuition')
      return parentWord(p)
    }
  }
  notice(g, "Can't Afford It", `${what} costs ${formatMoney(amount)}, and you have ${formatMoney(Math.max(0, c.money))}.${c.age < 18 && guardians(g).length ? ' Your parents said no, too.' : ''}`, { emoji: opts.emoji ?? '\u{1F4B8}', tone: 'bad' })
  return null
}

/** " It cost you $50." / " Your mom paid the $50." / '' */
export function paidLine(who: string | null, amount: number): string {
  if (!who || who === 'free' || !(amount > 0)) return ''
  if (who === 'self') return ` It cost you ${formatMoney(amount)}.`
  return ` ${who.charAt(0).toUpperCase()}${who.slice(1)} paid the ${formatMoney(amount)}, with a short speech about money not growing on trees.`
}

/**
 * Taxable money earned between age-ups (gig pay, prizes): adds it, records it as income and
 * taxes it right away at the marginal rate. Returns the tax paid. `reason` says who paid (a client, a prize committee).
 */
export function earnNow(g: GameState, amount: number, reason: Reason = 'wage'): number {
  const a = Math.round(amount)
  if (!(a > 0)) return 0
  earnIncome(g, a, reason)
  return taxAdditionalIncome(g, a)
}

/**
 * Proceeds from selling a venture: the cash arrives, the gain over what you put in is taxed now.
 * Returns { tax, gain }.
 */
export function receiveSale(g: GameState, proceeds: number, basis: number): { tax: number; gain: number } {
  const cash = Math.max(0, Math.round(proceeds))
  const gain = Math.max(0, cash - Math.max(0, Math.round(basis)))
  addMoney(g, cash - gain, 'firm.sale')
  if (gain <= 0) return { tax: 0, gain: 0 }
  earnIncome(g, gain, 'firm.sale')
  return { tax: taxAdditionalIncome(g, gain), gain }
}

/** " $1,200 of it went to taxes." or ''. */
export function taxLine(tax: number): string {
  return tax > 0 ? ` ${formatMoney(tax)} of it went to taxes.` : ''
}
