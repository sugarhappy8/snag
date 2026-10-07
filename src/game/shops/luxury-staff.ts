// Luxury Lifestyle › Personal Staff: butler, private chef, chauffeur, bodyguard and personal
// trainer. Wages follow the local labor market (localMarket(g).laborCost, never below the local
// minimum wage) and are paid every birthday; staff quit when the money runs out. State lives in
// g.flags['luxury.staff'] as plain JSON: { [roleId]: { name, gender, hiredAge, skill, quirk } }.
import { nicePrice } from '../assets'
import { addHidden, addStat, count, formatMoney, inPrison, log, notice, pronouns, remember, scriptChoice, spend } from '../core'
import { localMarket } from '../data/markets'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { ChoiceOption, GameState, Gender, MenuAction, MenuGroup, MenuNode, StatKey } from '../types'
import { randomFirstName, randomLastName } from '../world'
import { cantAfford, laborMult, luxuryBlock, luxuryReason, num, obj, str, takePopup, type PopupBudget } from './luxury-common'

export type StaffRoleId = 'butler' | 'chef' | 'chauffeur' | 'bodyguard' | 'trainer'

export interface StaffRole {
  id: StaffRoleId
  label: string
  emoji: string
  /** Typical yearly pay for a full-time live-in professional in the US. */
  usd: number
  perkText: string
  /** Yearly stat perks (scaled by the employee's skill). */
  perks: Partial<Record<StatKey, number>>
  quirks: string[]
}

export const STAFF_ROLES: StaffRole[] = [
  {
    id: 'butler',
    label: 'Butler',
    emoji: '🤵',
    usd: 90_000,
    perkText: 'Runs the household so you never touch a dish again',
    perks: { happiness: 3 },
    quirks: ['irons your newspapers', 'has a very judgmental eyebrow', 'speaks only in compliments', 'trained at a castle', 'never seems to blink', 'refers to you in the third person'],
  },
  {
    id: 'chef',
    label: 'Private Chef',
    emoji: '👨‍🍳',
    usd: 95_000,
    perkText: 'Healthy, ridiculous gourmet meals every day',
    perks: { health: 3, happiness: 1 },
    quirks: ['puts foam on everything', 'cooked for a prime minister once', 'refuses to make toast', 'plates food with tweezers', 'insists on cooking with jazz on', 'grows microgreens in your bathtub'],
  },
  {
    id: 'chauffeur',
    label: 'Chauffeur',
    emoji: '🚘',
    usd: 60_000,
    perkText: 'Drives you everywhere; you can nap in traffic',
    perks: { happiness: 2 },
    quirks: ['knows every shortcut', 'used to drive getaway cars, allegedly', 'hums opera at red lights', 'wears driving gloves indoors', 'has opinions about every other driver'],
  },
  {
    id: 'bodyguard',
    label: 'Bodyguard',
    emoji: '🕶️',
    usd: 120_000,
    perkText: 'Keeps paparazzi, stalkers and muggers at a polite distance',
    perks: { happiness: 1, health: 1 },
    quirks: ['ex-special forces', 'can fold a fan in half with one hand', 'wears sunglasses at night', 'has never smiled on record', 'speaks four languages and uses none of them'],
  },
  {
    id: 'trainer',
    label: 'Personal Trainer',
    emoji: '🏋️',
    usd: 80_000,
    perkText: 'Daily workouts whether you like it or not',
    perks: { health: 3, looks: 1 },
    quirks: ['yells motivational quotes', 'drinks raw eggs', 'used to train an action star', 'counts reps in a whisper', 'believes carbs are a myth'],
  },
]

export interface StaffMember {
  name: string
  gender: Gender
  hiredAge: number
  /** 0.8-1.3: better staff ask for more and do more. */
  skill: number
  quirk: string
}

const STAFF_KEY = 'luxury.staff'

export function roleById(id: string): StaffRole | undefined {
  return STAFF_ROLES.find((r) => r.id === id)
}

/** Everyone on the payroll (tolerates old or hand-edited saves). */
export function staffRoster(g: GameState): { role: StaffRole; member: StaffMember }[] {
  const o = obj(g.flags[STAFF_KEY])
  if (!o) return []
  const out: { role: StaffRole; member: StaffMember }[] = []
  for (const role of STAFF_ROLES) {
    const m = obj(o[role.id])
    if (!m) continue
    out.push({
      role,
      member: {
        name: str(m.name, role.label),
        gender: m.gender === 'female' ? 'female' : 'male',
        hiredAge: num(m.hiredAge),
        skill: Math.max(0.5, Math.min(1.5, num(m.skill, 1))),
        quirk: str(m.quirk),
      },
    })
  }
  return out
}

export function hasStaff(g: GameState): boolean {
  return staffRoster(g).length > 0
}

function setStaff(g: GameState, id: StaffRoleId, m: StaffMember | null): void {
  const o = { ...(obj(g.flags[STAFF_KEY]) ?? {}) }
  if (m) o[id] = { name: m.name, gender: m.gender, hiredAge: m.hiredAge, skill: m.skill, quirk: m.quirk }
  else delete o[id]
  if (Object.keys(o).length === 0) delete g.flags[STAFF_KEY]
  else g.flags[STAFF_KEY] = o
}

/** Yearly pay for this role here: US pay × local labor cost, never under 1.2× the minimum wage. */
export function staffWage(g: GameState, role: StaffRole, skill = 1): number {
  const minWage = Math.max(0, num(localMarket(g).minWage, 0))
  return nicePrice(Math.max(role.usd * laborMult(g) * skill, minWage * 1.2, 1_000))
}

export function payroll(g: GameState): number {
  return staffRoster(g).reduce((sum, s) => sum + staffWage(g, s.role, s.member.skill), 0)
}

function hireReason(g: GameState, role: StaffRole): string | null {
  const r = luxuryReason(g)
  if (r) return r
  if (staffRoster(g).some((s) => s.role.id === role.id)) return `You already have a ${role.label.toLowerCase()}.`
  return null
}

/** Put someone on the payroll (first year's wages are paid up front). */
export function hireStaff(g: GameState, id: StaffRoleId, candidate: StaffMember): boolean {
  const role = roleById(id)
  if (!role) return false
  const reason = hireReason(g, role)
  if (reason) {
    notice(g, 'Personal Staff', reason, { emoji: role.emoji })
    return false
  }
  const wage = staffWage(g, role, candidate.skill)
  if (!spend(g, wage)) {
    cantAfford(g, wage, `a year of a ${role.label.toLowerCase()}'s wages`)
    return false
  }
  setStaff(g, role.id, { ...candidate, hiredAge: g.character.age })
  count(g, 'staffHired')
  addStat(g, 'happiness', randInt(g, 2, 5))
  log(g, `I hired ${candidate.name} as my ${role.label.toLowerCase()}.`, 'good')
  notice(g, 'Hired!', `${candidate.name} is your new ${role.label.toLowerCase()} (${candidate.quirk}). You paid the first year's ${formatMoney(wage)} up front; after that, wages come out every birthday.`, { emoji: role.emoji, tone: 'good' })
  return true
}

/** Let someone go. */
export function fireStaff(g: GameState, id: StaffRoleId): boolean {
  const entry = staffRoster(g).find((s) => s.role.id === id)
  if (!entry) return false
  const { role, member } = entry
  setStaff(g, id, null)
  const years = g.character.age - member.hiredAge
  if (years >= 10) addHidden(g, 'karma', -1)
  log(g, `I let my ${role.label.toLowerCase()}, ${member.name}, go.`)
  const { He } = pronouns(member.gender)
  notice(g, 'Let Go', years >= 10 ? `You let ${member.name} go after ${years} years. ${He} packed up quietly and left a handwritten note listing everything you do wrong.` : `You let ${member.name} go. ${He} took it professionally and only slammed one door.`, { emoji: role.emoji })
  return true
}

const HIRE = defineScript('luxury.staff.hire', (g, choice, data) => {
  const o = obj(data)
  const roleId = str(o?.role)
  const list = Array.isArray(o?.candidates) ? o.candidates : []
  const idx = Number(choice)
  if (choice === 'cancel' || !Number.isInteger(idx)) return
  const c = obj(list[idx])
  const role = roleById(roleId)
  if (!c || !role) return
  hireStaff(g, role.id, { name: str(c.name, role.label), gender: c.gender === 'female' ? 'female' : 'male', hiredAge: g.character.age, skill: Math.max(0.5, Math.min(1.5, num(c.skill, 1))), quirk: str(c.quirk) })
})

function candidates(g: GameState, role: StaffRole): StaffMember[] {
  const country = g.character.countryId
  const quirks = [...role.quirks]
  return [0.85, 1, 1.25].map((skill) => {
    const gender: Gender = chance(g, 0.5) ? 'male' : 'female'
    const quirk = quirks.splice(randInt(g, 0, quirks.length - 1), 1)[0] ?? 'very discreet'
    return { name: `${randomFirstName(g, country, gender)} ${randomLastName(g, country)}`, gender, hiredAge: g.character.age, skill: Math.round(skill * randInt(g, 95, 105)) / 100, quirk }
  })
}

function hireAction(role: StaffRole): MenuAction {
  return {
    type: 'action',
    id: `lux-staff-hire-${role.id}`,
    label: `Hire a ${role.label}`,
    emoji: role.emoji,
    subtitle: (g) => `About ${formatMoney(staffWage(g, role))}/yr · ${role.perkText}`,
    disabledReason: (g) => hireReason(g, role),
    run: (g) => {
      const list = candidates(g, role)
      const choices: ChoiceOption[] = list.map((c, i) => ({ id: String(i), label: `${c.name}: ${c.quirk} (${formatMoney(staffWage(g, role, c.skill))}/yr)`, emoji: i === 2 ? '⭐' : role.emoji }))
      choices.push({ id: 'cancel', label: 'Keep doing it yourself', emoji: '✖️' })
      scriptChoice(g, HIRE, `${role.emoji} Hire a ${role.label}`, `The agency sent three candidates. Better ones cost more and do more. Wages follow local pay here, about ${formatMoney(staffWage(g, role))} a year for a typical hire.`, choices, {
        emoji: role.emoji,
        data: { role: role.id, candidates: list.map((c) => ({ name: c.name, gender: c.gender, skill: c.skill, quirk: c.quirk })) },
      })
    },
  }
}

function employeeAction(role: StaffRole, member: StaffMember): MenuAction {
  return {
    type: 'action',
    id: `lux-staff-${role.id}`,
    label: `${role.label}: ${member.name}`,
    emoji: role.emoji,
    subtitle: (g) => `${formatMoney(staffWage(g, role, member.skill))}/yr · ${member.quirk} · tap to let go`,
    disabledReason: luxuryBlock,
    confirm: () => `Let ${member.name} go?`,
    run: (g) => {
      fireStaff(g, role.id)
    },
  }
}

export const personalStaffMenu: MenuGroup = {
  type: 'menu',
  id: 'luxuryStaff',
  label: 'Personal Staff',
  emoji: '🤵',
  subtitle: (g) => {
    const n = staffRoster(g).length
    return n ? `${n} on the payroll · ${formatMoney(payroll(g))}/yr` : 'Butlers, chefs, chauffeurs, bodyguards, trainers'
  },
  disabledReason: (g) => luxuryBlock(g) ?? (hasStaff(g) ? null : luxuryReason(g)),
  header: (g) => {
    const m = laborMult(g)
    const pct = Math.round(m * 100)
    const level =
      m >= 1.15
        ? `Household staff here earn about ${pct}% of US pay. Good help is expensive, and they know it.`
        : m >= 0.85
          ? 'Household staff here earn about what they would in the US.'
          : `Household staff here earn about ${pct}% of US pay. Local minimum wage laws still apply, and a good tip goes a long way.`
    return `${level} Wages are paid every birthday; if you can't cover them, your staff quit. Payroll: ${formatMoney(payroll(g))} a year.`
  },
  children: (g): MenuNode[] => {
    const roster = staffRoster(g)
    const nodes: MenuNode[] = []
    if (roster.length) {
      nodes.push({ type: 'heading', id: 'lux-staff-mine', label: 'Your Staff' })
      for (const s of roster) nodes.push(employeeAction(s.role, s.member))
    }
    const open = STAFF_ROLES.filter((r) => !roster.some((s) => s.role.id === r.id))
    if (open.length) {
      nodes.push({ type: 'heading', id: 'lux-staff-hire', label: 'Hire' })
      for (const r of open) nodes.push(hireAction(r))
    }
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Yearly: wages, perks, the odd staff story

const POACHED = defineScript('luxury.staff.poached', (g, choice, data) => {
  const o = obj(data)
  const id = str(o?.role) as StaffRoleId
  const raise = Math.max(0, num(o?.raise))
  const entry = staffRoster(g).find((s) => s.role.id === id)
  if (!entry) return
  const { role, member } = entry
  if (choice === 'match') {
    if (!spend(g, raise)) {
      setStaff(g, id, null)
      log(g, `My ${role.label.toLowerCase()}, ${member.name}, was poached by a rival billionaire.`, 'bad')
      notice(g, 'Poached', `You couldn't scrape together ${formatMoney(raise)}, so ${member.name} took the rival's offer. The farewell hug was brief and businesslike.`, { emoji: role.emoji, tone: 'bad' })
      return
    }
    setStaff(g, id, { ...member, skill: Math.min(1.5, member.skill + 0.05) })
    addHidden(g, 'karma', 1)
    notice(g, 'Loyalty Bonus', `You paid ${member.name} a ${formatMoney(raise)} retention bonus. ${pronouns(member.gender).He} turned down the rival and is working harder than ever.`, { emoji: role.emoji, tone: 'good' })
  } else {
    setStaff(g, id, null)
    log(g, `My ${role.label.toLowerCase()}, ${member.name}, was poached by a rival billionaire.`, 'bad')
    notice(g, 'Poached', `${member.name} left to work for your rival. You saw them on a magazine cover together, laughing. Laughing!`, { emoji: role.emoji, tone: 'bad' })
  }
})

/** Pay wages (or lose staff), apply perks, maybe one staff story. */
export function yearlyStaff(g: GameState, budget: PopupBudget): void {
  const roster = staffRoster(g)
  if (roster.length === 0) return
  const c = g.character
  if (inPrison(g)) {
    for (const s of roster) setStaff(g, s.role.id, null)
    log(g, 'My household staff found new jobs while I was in prison.', 'bad')
    takePopup(budget, true)
    notice(g, 'Staff Gone', `Your ${roster.length === 1 ? roster[0].role.label.toLowerCase() : 'household staff'} couldn't wait for you to get out of prison. ${roster.length === 1 ? 'They have' : 'They all have'} new employers now.`, { emoji: '🧳', tone: 'bad' })
    return
  }
  let paid = 0
  const quit: string[] = []
  for (const { role, member } of roster) {
    const wage = staffWage(g, role, member.skill)
    if (!spend(g, wage)) {
      quit.push(`${member.name} (${role.label.toLowerCase()})`)
      setStaff(g, role.id, null)
      continue
    }
    paid += wage
    for (const [key, amount] of Object.entries(role.perks) as [StatKey, number][]) addStat(g, key, Math.max(1, Math.round(amount * member.skill)))
    if (role.id === 'trainer') addHidden(g, 'athleticism', 1)
    if (role.id === 'bodyguard' && c.hidden.fame >= 30 && chance(g, 0.12)) {
      addStat(g, 'happiness', 2)
      log(g, pick(g, [`My bodyguard, ${member.name}, stopped an overexcited fan from climbing my gate.`, `${member.name} body-blocked a paparazzo who jumped out of a hedge at me.`, `My bodyguard spotted a stalker following my car and made them disappear (politely).`]), 'good')
    }
  }
  if (paid > 0) {
    count(g, 'staffWages', paid)
    log(g, `I paid ${formatMoney(paid)} in wages to my household staff.`)
  }
  if (quit.length) {
    takePopup(budget, true)
    log(g, `My staff quit because I couldn't pay them.`, 'bad')
    remember(g, `Couldn't afford household staff anymore; ${quit.length} quit.`)
    notice(g, 'Staff Walked Out', `You couldn't make payroll, so ${quit.join(', ')} quit on the spot. ${quit.length > 1 ? 'They took the good silverware as severance.' : 'They left the keys on the counter and a very pointed note.'}`, { emoji: '🧳', tone: 'bad' })
    return
  }
  const remaining = staffRoster(g)
  if (remaining.length && chance(g, 0.06) && takePopup(budget)) {
    const { role, member } = pick(g, remaining)
    const raise = nicePrice(staffWage(g, role, member.skill) * 0.5)
    scriptChoice(g, POACHED, 'Poaching Attempt', `A rival billionaire offered ${member.name}, your ${role.label.toLowerCase()}, a huge raise. ${pronouns(member.gender).He} is torn. A ${formatMoney(raise)} retention bonus would settle it.`, [
      { id: 'match', label: `Pay the bonus (${formatMoney(raise)})`, emoji: '💵' },
      { id: 'release', label: 'Wish them well', emoji: '👋' },
    ], { emoji: role.emoji, data: { role: role.id, raise } })
  }
}
