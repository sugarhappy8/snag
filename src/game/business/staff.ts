// Key staff: interviews, hiring, raises, team-building, yelling and firing. General staff are
// hired to match the production plan automatically; you control their pay policy and morale.
import { addHidden, addStat, count, formatMoney, log, notice, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { bell, chance, rand, randInt, uid, weightedPick } from '../rng'
import { pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { Asset, ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { bizWorth, fxValue, LASTING_YEARS, localEcon, localPay, staffNet, TALENT_HIRE, talentCeo, type Worth } from './economy'
import { laborProtection, localOuting, severanceMonths, STAFF_TRAITS, traitOf, unionStrength } from './flavor'
import { roleTitle, sameRole } from './era'
import { manageBlock, noCash, tooBusy } from './gate'
import { familyStaffLine } from './nepo-staff-line'
import { industryDef, type RoleDef } from './industries'
import { sectorRoleBlurb } from './sector-data'
import { bizOf, findBusiness, readBiz, totalOutlets, type BizState, type KeyStaff } from './state'
import { clampN, markBest, money, num, rec, str, toJson } from './util'
import { leadershipPower, leadershipSummary, LEADERSHIP } from './leadership'

/** Key people the company can use: more with more locations, never more than the roles it has. */
export function maxKeyStaff(b: BizState): number {
  return Math.min(8, 3 + Math.floor(totalOutlets(b) / 3), Math.max(1, industryDef(b.industry).roles.length))
}

/** What a key role does, in a few words (financial firms' roles are not product jobs). */
export function roleBlurb(b: Pick<BizState, 'industry'>, role: RoleDef): string {
  const def = industryDef(b.industry)
  if (def.model === 'finance') {
    const bank = b.industry === 'bank' || b.industry === 'onlineBank'
    const FINANCE: Record<RoleDef['focus'], [string, string]> = {
      finance: ['Decides who gets a loan', 'Manages the client portfolios'],
      quality: ['Watches risk and bad loans', 'Researches what to buy'],
      sales: ['Wins depositors and borrowers', 'Wins and keeps clients'],
      ops: ['Runs the branches and systems', 'Keeps the firm compliant and lean'],
    }
    return FINANCE[role.focus][bank ? 0 : 1]
  }
  const own = sectorRoleBlurb(b.industry, role.title)
  if (own) return own
  return role.focus === 'quality' ? 'Raises quality' : role.focus === 'sales' ? 'Brings in customers' : role.focus === 'finance' ? 'Cuts costs and keeps the books clean' : 'More capacity, lower unit costs'
}

interface Candidate {
  firstName: string
  lastName: string
  gender: 'male' | 'female'
  age: number
  skill: number
  salary: number
  trait: string
}

/** How likely each trait is among candidates. */
function traitWeight(id: string): number {
  return id === 'steady' ? 3 : id === 'shady' || id === 'nepo' ? 0.6 : 1
}

function candidatesFor(g: GameState, b: BizState, role: RoleDef): Candidate[] {
  const n = randInt(g, 2, 4)
  const base = localPay(b.countryId, role.pay)
  // A business-talented owner-CEO has an eye for people: the shortlist is a notch better.
  const eye = talentCeo(g, b) ? TALENT_HIRE : 0
  const out: Candidate[] = []
  for (let i = 0; i < n; i++) {
    const gender = chance(g, 0.5) ? 'male' : 'female'
    const trait = weightedPick(g, STAFF_TRAITS, (t) => traitWeight(t.id))
    const skill = clampN(bell(g, 25, 98) + (trait.id === 'overqualified' ? 10 : 0) + eye, 10, 100)
    const salary = Math.round((base * (0.6 + (skill / 100) * 0.8) * trait.ask) / 500) * 500
    out.push({
      firstName: randomFirstName(g, b.countryId, gender),
      lastName: randomLastName(g, b.countryId),
      gender,
      age: randInt(g, 22, 61),
      skill,
      salary: Math.max(1_000, salary),
      trait: trait.id,
    })
  }
  return out
}

/** New hires start with morale between 65 and 85. */
const HIRE_MORALE = 75

/**
 * A candidate's value over the next few years: what they add (by focus, at the margin) minus
 * their pay, minus the theft a risky résumé tends to bring (the embezzlement event's weight).
 */
export function hireValue(g: GameState, b: BizState, w: Worth, focus: KeyStaff['focus'], c: { skill: number; salary: number; trait: string }): number {
  const risk = Math.max(0, traitOf(c.trait).risk - 0.5) * 0.04 * Math.max(1_000, w.revenue * 0.03)
  return (staffNet(g, b, w, { focus, skill: c.skill, trait: c.trait, morale: HIRE_MORALE, salary: c.salary }) - risk) * LASTING_YEARS
}

/** What a typical candidate for a role is worth (the average shortlist, at the going pay). */
export function roleValue(g: GameState, b: BizState, w: Worth, role: RoleDef): number {
  const base = localPay(b.countryId, role.pay)
  const eye = talentCeo(g, b) ? TALENT_HIRE : 0
  const total = STAFF_TRAITS.reduce((t, x) => t + traitWeight(x.id), 0)
  let v = 0
  for (const t of STAFF_TRAITS) {
    const skill = clampN(61.5 + (t.id === 'overqualified' ? 10 : 0) + eye, 10, 100)
    const salary = Math.max(1_000, base * (0.6 + (skill / 100) * 0.8) * t.ask)
    v += (traitWeight(t.id) / total) * hireValue(g, b, w, role.focus, { skill, salary, trait: t.id })
  }
  return v
}

/** The key role worth filling first (null when none would pay for itself). */
export function bestRole(g: GameState, b: BizState): { role: RoleDef; value: number } | null {
  const w = bizWorth(g, b)
  let best: { role: RoleDef; value: number } | null = null
  for (const role of industryDef(b.industry).roles) {
    if (b.staff.some((x) => sameRole(x.role, role.title))) continue
    const value = roleValue(g, b, w, role)
    if (value > 0 && (!best || value > best.value)) best = { role, value }
  }
  return best
}

const HIRE = defineScript('business.hire', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d || choice === 'none' || manageBlock(g, a)) return
  const b = bizOf(g, a)
  const requested = str(d.role)
  const role = industryDef(b.industry).roles.find((r) => sameRole(requested, r.title) || sameRole(requested, roleTitle(g, b.countryId, r.title)))
  if (!role || b.staff.some((s) => sameRole(s.role, role.title))) return
  const list = Array.isArray(d.candidates) ? d.candidates : []
  const raw = rec(list[Number(choice.replace('c', ''))] as Json)
  if (!raw) return
  if (b.staff.length >= maxKeyStaff(b)) {
    notice(g, 'No Room', `${a.name} already has as many key people as it can use (${maxKeyStaff(b)}). Open more locations to grow the leadership team.`, { emoji: '\u{1FA91}' })
    return
  }
  const s: KeyStaff = {
    id: uid(g, 'ks'),
    firstName: str(raw.firstName, 'Alex'),
    lastName: str(raw.lastName, 'Lee'),
    gender: raw.gender === 'female' ? 'female' : 'male',
    age: num(raw.age, 35),
    role: roleTitle(g, b.countryId, role.title),
    focus: role.focus,
    skill: clampN(num(raw.skill, 50), 0, 100),
    salary: Math.max(0, num(raw.salary)),
    trait: str(raw.trait, 'steady'),
    morale: randInt(g, 65, 85),
    years: 0,
  }
  b.staff.push(s)
  count(g, 'businessHires')
  log(g, `I hired ${s.firstName} ${s.lastName} as ${s.role} at ${a.name}.`, 'good')
  notice(
    g,
    'Hired!',
    `${s.firstName} ${s.lastName} accepted your offer to become ${a.name}'s ${s.role} for ${formatMoney(s.salary)} a year. ${s.gender === 'female' ? 'She' : 'He'} starts Monday.`,
    { emoji: '\u{1F91D}', tone: 'good' },
  )
})

/**
 * A headhunter's fee for one round of interviews: 6% of the role's local pay, half as much again
 * for every round already held this year (k), so interviewing all day is possible but dear.
 */
export function interviewFee(b: BizState, role: RoleDef, k: number): number {
  return Math.round(localPay(b.countryId, role.pay) * 0.06 * (1 + 0.5 * Math.max(0, k)))
}

function interviewAction(a: Asset, role: RoleDef, g0: GameState): MenuAction {
  return {
    type: 'action',
    id: `biz.hire.${a.id}.${role.title}`,
    label: roleTitle(g0, readBiz(g0, a).countryId, role.title),
    emoji: role.focus === 'quality' ? '\u{1F9D1}\u{200D}\u{1F373}' : role.focus === 'sales' ? '\u{1F4E3}' : role.focus === 'finance' ? '\u{1F9EE}' : '\u{1F4CB}',
    subtitle: (g) => {
      const b = readBiz(g, a)
      return `${roleBlurb(b, role)} · about ${money(localPay(b.countryId, role.pay))}/yr · headhunter ${money(interviewFee(b, role, yearActionsUsed(g, `biz.interview.${a.id}`)))}`
    },
    disabledReason: (g) => {
      const block = manageBlock(g, a)
      if (block) return block
      const b = readBiz(g, a)
      if (b.staff.length >= maxKeyStaff(b)) return `Your leadership team is full (${maxKeyStaff(b)}). Open more locations or let someone go.`
      if (b.staff.some((s) => sameRole(s.role, role.title))) return `You already have a ${roleTitle(g, b.countryId, role.title)}.`
      return null
    },
    hint: (g) => {
      if (!hasTalent(g, 'Business')) return null
      const b = readBiz(g, a)
      if (b.staff.length >= maxKeyStaff(b)) return null
      const best = bestRole(g, b)
      return best && best.role.title === role.title ? talentHint(g, 'Business', `Hire this role first: a good one adds about ${money(best.value / LASTING_YEARS)} a year after pay`) : null
    },
    run: (g) => {
      const cur = findBusiness(g, a.id)
      if (!cur || manageBlock(g, cur)) return
      const b = bizOf(g, cur)
      if (b.staff.length >= maxKeyStaff(b) || b.staff.some((s) => sameRole(s.role, role.title))) return
      // No calendar cap: every round costs a headhunter's fee, dearer each time this year.
      const fee = interviewFee(b, role, yearActionsUsed(g, `biz.interview.${a.id}`))
      if (b.cash < fee) return noCash(g, cur, fee, 'a headhunter')
      useYearAction(g, `biz.interview.${a.id}`, Number.MAX_SAFE_INTEGER)
      b.cash -= fee
      b.yearCosts += fee
      const list = candidatesFor(g, b, role)
      const lines = list.map((c) => `• ${c.firstName} ${c.lastName}, ${c.age}: skill ${c.skill}/100, asks ${formatMoney(c.salary)}, ${traitOf(c.trait).label.toLowerCase()}.`)
      const choices: ChoiceOption[] = [
        ...list.map((c, i) => ({ id: `c${i}`, label: `${c.firstName} ${c.lastName} · ${c.skill}/100 · ${money(c.salary)}`, emoji: c.gender === 'female' ? '\u{1F469}' : '\u{1F468}' })),
        { id: 'none', label: 'Hire nobody', emoji: '\u{2716}\u{FE0F}' },
      ]
      if (hasTalent(g, 'Business')) {
        const w = bizWorth(g, b)
        const values = list.map((c) => hireValue(g, b, w, role.focus, c))
        markBest(g, choices, (id) => (id === 'none' ? 0 : (values[Number(id.slice(1))] ?? null)), (id, margin) =>
          id === 'none' ? 'Best move: none of them would earn their salary' : `Best hire: worth about ${money(values[Number(id.slice(1))] / LASTING_YEARS)} a year after pay${margin < 500 ? ' (a close call)' : ''}`,
        )
      }
      const title = roleTitle(g, b.countryId, role.title)
      scriptChoice(g, HIRE, `Hiring a ${title}`, `You interviewed ${list.length} candidates in ${b.city}:\n${lines.join('\n')}`, choices, {
        emoji: '\u{1F4BC}',
        data: { assetId: cur.id, role: title, focus: role.focus, candidates: toJson(list) },
      })
    },
  }
}

export function hireMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.hireMenu.${a.id}`,
    label: 'Hire Key Staff',
    emoji: '\u{1F91D}',
    subtitle: (g) => {
      const b = readBiz(g, a)
      const roles = industryDef(b.industry).roles.length
      return `${b.staff.length}/${maxKeyStaff(b)} seats filled${maxKeyStaff(b) < roles ? ` · ${roles} roles to choose from (more seats with more locations)` : ''}`
    },
    disabledReason: (g) => manageBlock(g, a),
    hint: (g) => {
      if (!hasTalent(g, 'Business')) return null
      const b = readBiz(g, a)
      if (b.staff.length >= maxKeyStaff(b)) return null
      const best = bestRole(g, b)
      return talentHint(g, 'Business', best ? `Start with a ${roleTitle(g, b.countryId, best.role.title)}` : 'No open role would earn its salary right now')
    },
    header: (g) => {
      const b = readBiz(g, a)
      const e = localEcon(b.industry, b.countryId, b.city)
      return `Interview candidates for a key role. Salaries follow ${getCountry(b.countryId).name}'s market (a regular employee here costs about ${money(e.wage)} a year${e.m.minWage > 0 ? `; minimum wage is ${money(e.m.minWage)}` : ''}).\n\n${leadershipSummary(b)}`
    },
    children: (g) => {
      const b = readBiz(g, a)
      return industryDef(b.industry).roles.map((r) => interviewAction(a, r, g))
    },
  }
}

// ---------------------------------------------------------------------------
// One key employee

function staffOf(g: GameState, a: Asset, id: string): { b: BizState; s: KeyStaff } | null {
  const cur = findBusiness(g, a.id)
  if (!cur) return null
  const b = bizOf(g, cur)
  const s = b.staff.find((x) => x.id === id)
  return s ? { b, s } : null
}

function fullName(s: KeyStaff): string {
  return `${s.firstName} ${s.lastName}`
}

function they(s: KeyStaff): string {
  return s.gender === 'female' ? 'she' : 'he'
}

function staffAction(a: Asset, id: string, key: string, label: string, emoji: string, sub: string, run: (g: GameState, b: BizState, s: KeyStaff) => void, confirm?: (g: GameState) => string | null): MenuAction {
  return {
    type: 'action',
    id: `biz.staff.${a.id}.${id}.${key}`,
    label,
    emoji,
    subtitle: sub,
    disabledReason: (g) => manageBlock(g, a),
    confirm,
    run: (g) => {
      const x = staffOf(g, a, id)
      if (x) run(g, x.b, x.s)
    },
  }
}

export function fireStaff(g: GameState, a: Asset, b: BizState, s: KeyStaff, why = 'fired'): void {
  const sev = Math.round((s.salary * severanceMonths(b.countryId)) / 12)
  b.staff = b.staff.filter((x) => x.id !== s.id)
  b.cash -= sev
  b.yearCosts += sev
  b.morale = clampN(b.morale - 4, 0, 100)
  const country = getCountry(b.countryId).name
  let text = `You ${why} ${fullName(s)}, ${a.name}'s ${s.role}.`
  text += sev > 0 ? ` Labor law in ${country} meant ${formatMoney(sev)} in severance.` : ` In ${country} that took one awkward meeting and a cardboard box.`
  if (chance(g, laborProtection(b.countryId) * 0.25 + (s.trait === 'shady' ? 0.1 : 0))) {
    const cost = Math.round(s.salary * (0.5 + rand(g)))
    b.cash -= cost
    b.yearCosts += cost
    text += ` ${they(s).charAt(0).toUpperCase() + they(s).slice(1)} sued for wrongful dismissal and the company settled for ${formatMoney(cost)}.`
  }
  log(g, `I let ${fullName(s)} go from ${a.name}.`, 'neutral')
  notice(g, 'Let Go', text, { emoji: '\u{1F4E6}' })
}

function staffGroup(a: Asset, s: KeyStaff): MenuGroup {
  const id = s.id
  return {
    type: 'menu',
    id: `biz.staffMember.${a.id}.${id}`,
    label: `${s.firstName} ${s.lastName}`,
    emoji: s.gender === 'female' ? '\u{1F469}\u{200D}\u{1F4BC}' : '\u{1F468}\u{200D}\u{1F4BC}',
    subtitle: `${s.role} · skill ${s.skill} · morale ${s.morale}%`,
    header: g => {
      const b = readBiz(g, a), live = b.staff.find(x => x.id === id)
      if (!live) return 'This leader no longer works here.'
      const contribution = leadershipPower(b, live.focus) - leadershipPower({ ...b, staff: b.staff.filter(x => x.id !== id) }, live.focus)
      const pct = (factor: number) => (100 * contribution * factor).toFixed(1)
      const impact = live.focus === 'sales' ? `+${pct(LEADERSHIP.sales)} percentage points of customer demand` : live.focus === 'finance' ? `−${pct(LEADERSHIP.overhead)} percentage points of operating overhead` : live.focus === 'ops' ? `+${pct(LEADERSHIP.capacity)} percentage points of capacity and −${pct(LEADERSHIP.unitCost)} of unit costs` : `+${(contribution * LEADERSHIP.quality).toFixed(1)} points toward the quality target`
      return `${live.firstName} ${live.lastName}, ${live.age} · ${live.role}\nSkill ${live.skill}/100 · ${traitOf(live.trait).label} · Morale ${live.morale}% · ${formatMoney(live.salary)}/yr.\n${b.industry === 'bank' || b.industry === 'onlineBank' || b.industry === 'investmentFirm' ? 'Their specialty directly improves financial operations and the strength of private models.' : `Their current contribution: ${impact}.`} Training and morale improve their contribution.\n\n${leadershipSummary(b)}`
    },
    children: (): MenuNode[] => [
      staffAction(a, id, 'compliment', 'Compliment', '\u{1F44F}', 'Tell them they are doing great', (g, _b, x) => {
        if (!useYearAction(g, `biz.compliment.${id}`, 1)) return tooBusy(g, `complimented ${x.firstName}`)
        x.morale = clampN(x.morale + randInt(g, 6, 14), 0, 100)
        notice(g, 'Compliment', pickSite(g, [`You told ${x.firstName} the whole company runs on their work. ${x.firstName} pretended not to care and then told everyone.`, `You praised ${x.firstName} in front of the team. ${x.firstName} is glowing.`], 0xeb2c789a), { emoji: '\u{1F44F}', tone: 'good' })
      }),
      staffAction(a, id, 'raise', 'Give a Raise', '\u{1F4B5}', `10% more (${formatMoney(Math.round(s.salary * 0.1))}/yr)`, (g, _b, x) => {
        if (!useYearAction(g, `biz.raise.${id}`, 1)) return tooBusy(g, `given ${x.firstName} a raise`)
        x.salary = Math.round(x.salary * 1.1)
        x.morale = clampN(x.morale + randInt(g, 12, 20), 0, 100)
        log(g, `I gave ${fullName(x)} a raise.`, 'good')
        notice(g, 'Raise', `${x.firstName} now earns ${formatMoney(x.salary)} a year and has stopped updating their résumé.`, { emoji: '\u{1F4B5}', tone: 'good' })
      }),
      staffAction(a, id, 'train', 'Send to Training', '\u{1F393}', `Course fees about ${formatMoney(Math.round(s.salary * 0.08))}`, (g, b, x) => {
        const cost = Math.round(x.salary * 0.08)
        const cur = findBusiness(g, a.id)
        if (!cur) return
        if (b.cash < cost) return noCash(g, cur, cost, 'the course')
        if (!useYearAction(g, `biz.train.${id}`, 1)) return tooBusy(g, `sent ${x.firstName} to training`)
        b.cash -= cost
        b.yearCosts += cost
        const gain = traitOf(x.trait).id === 'lazy' ? randInt(g, 0, 2) : randInt(g, 3, 8)
        x.skill = clampN(x.skill + gain, 0, 100)
        notice(g, 'Training', gain > 0 ? `${x.firstName} came back from the course with new skills (skill ${x.skill}) and a branded tote bag.` : `${x.firstName} mostly attended the free lunch. Skill unchanged.`, { emoji: '\u{1F393}' })
      }),
      staffAction(a, id, 'yell', 'Yell At', '\u{1F92C}', 'Let them have it', (g, b, x) => {
        if (!useYearAction(g, `biz.yell.${id}`, 1)) return tooBusy(g, `yelled at ${x.firstName}`)
        x.morale = clampN(x.morale - randInt(g, 15, 28), 0, 100)
        b.morale = clampN(b.morale - 3, 0, 100)
        addHidden(g, 'karma', -2)
        const cur = findBusiness(g, a.id)
        if (!cur) return
        if (chance(g, 0.08 + laborProtection(b.countryId) * 0.08)) {
          const cost = Math.round(x.salary * (0.3 + rand(g) * 0.5))
          b.cash -= cost
          b.yearCosts += cost
          b.staff = b.staff.filter((y) => y.id !== x.id)
          log(g, `${fullName(x)} sued ${cur.name} after I screamed at them.`, 'bad')
          notice(g, 'Lawsuit', `You yelled at ${x.firstName}, who recorded it, quit and sued for a hostile workplace. ${cur.name} settled for ${formatMoney(cost)}.`, { emoji: '\u{2696}\u{FE0F}', tone: 'bad' })
          return
        }
        if (x.morale < 25 && chance(g, 0.4)) {
          b.staff = b.staff.filter((y) => y.id !== x.id)
          log(g, `${fullName(x)} quit after I yelled at them.`, 'bad')
          notice(g, 'Quit', `${x.firstName} threw ${x.gender === 'female' ? 'her' : 'his'} badge on your desk and walked out. Rumor has it a competitor hired ${x.gender === 'female' ? 'her' : 'him'} by lunch.`, { emoji: '\u{1F6AA}', tone: 'bad' })
          return
        }
        notice(g, 'You Yelled', pickSite(g, [`You yelled at ${x.firstName} about missed targets. The whole floor went silent. Morale took a hit.`, `You lost it at ${x.firstName} in the break room. ${x.firstName} spat out ${x.gender === 'female' ? 'her' : 'his'} coffee. Nobody won.`], 0xa7e8a66c), { emoji: '\u{1F92C}', tone: 'bad' })
      }),
      {
        ...staffAction(
          a,
          id,
          'fire',
          'Fire',
          '\u{1F525}',
          'Let them go (severance follows local labor law)',
          (g, b, x) => {
            const cur = findBusiness(g, a.id)
            if (cur) fireStaff(g, cur, b, x)
          },
          () => `Fire ${s.firstName} ${s.lastName}?`,
        ),
        hint: (g: GameState) => {
          if (!hasTalent(g, 'Business')) return null
          const b = readBiz(g, a)
          const x = b.staff.find((y) => y.id === id)
          if (!x) return null
          const net = staffNet(g, b, bizWorth(g, b), x)
          const severance = (x.salary * severanceMonths(b.countryId)) / 12
          return net * LASTING_YEARS + severance < 0 ? talentHint(g, 'Business', `${x.firstName} costs about ${money(-net)} a year more than they bring in`) : null
        },
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// The whole workforce

const PAY_LEVELS: { level: number; label: string; note: string }[] = [
  { level: 0.85, label: 'Lean', note: 'Below the going rate: cheaper, grumpier.' },
  { level: 1, label: 'Market rate', note: 'What everyone else pays.' },
  { level: 1.15, label: 'Generous', note: 'Above market: happier, more loyal staff.' },
  { level: 1.3, label: 'Best in town', note: 'People queue to work for you.' },
]

function payLabel(level: number): string {
  let best = PAY_LEVELS[1]
  for (const p of PAY_LEVELS) if (Math.abs(p.level - level) < Math.abs(best.level - level)) best = p
  return best.label
}

export function teamBuildingCost(b: BizState): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  return Math.round(Math.max(1, b.employees + b.staff.length) * 120 * e.level + 300 * e.level)
}

export function staffMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.staffMenu.${a.id}`,
    label: 'Employees',
    emoji: '\u{1F465}',
    subtitle: (g) => {
      const b = readBiz(g, a)
      return `${b.employees + b.staff.length} staff · morale ${b.morale}%`
    },
    header: (g) => {
      const b = readBiz(g, a)
      const e = localEcon(b.industry, b.countryId, b.city)
      const strike = unionStrength(b.countryId)
      return [
        `${b.employees} employees on ${payLabel(b.wageLevel).toLowerCase()} pay (about ${money(e.wage * b.wageLevel)} each a year). ${industryDef(b.industry).model === 'finance' ? 'Head count follows the size of the business.' : 'Head count follows your production plan.'}`,
        `Morale ${b.morale}%. ${strike >= 0.5 ? 'Unions are strong here: unhappy staff strike.' : strike >= 0.3 ? 'Unhappy staff here can and do walk out.' : 'Unions are weak here, but unhappy staff still quit.'}`,
      ].join('\n')
    },
    children: (g) => {
      const b = readBiz(g, a)
      const nodes: MenuNode[] = [{ type: 'heading', id: `biz.keyStaffH.${a.id}`, label: `Leadership team (${b.staff.length}/${maxKeyStaff(b)})` }]
      if (b.staff.length === 0) {
        const titles = industryDef(b.industry).roles.slice(0, 3).map((r) => roleTitle(g, b.countryId, r.title).toLowerCase())
        const list = titles.length > 1 ? `${titles.slice(0, -1).join(', ')} or ${titles[titles.length - 1]}` : titles[0] ?? 'manager'
        nodes.push({ type: 'info', id: `biz.noStaff.${a.id}`, emoji: '\u{1FA91}', text: `No key staff yet. A good ${list} makes a real difference.` })
      }
      for (const s of b.staff) nodes.push(staffGroup(a, s))
      nodes.push(hireMenu(a))
      const family = familyStaffLine(g, a)
      if (family) nodes.push({ type: 'info', id: `biz.familyStaff.${a.id}`, emoji: '\u{1F46A}', text: family })
      nodes.push({ type: 'heading', id: `biz.teamH.${a.id}`, label: 'Everyone' })
      nodes.push(teamBuildingAction(a), raiseAllAction(a), payPolicyAction(a))
      return nodes
    },
  }
}

/** Team building: 82% of outings lift morale 8-16 points; the rest cost 2-6. */
const OUTING_GOOD = 0.82

/** Morale value of a pay level (immediate mood swing plus the lasting change), for the hints. */
function payValue(g: GameState, b: BizState, w: Worth, level: number): number {
  const prev = b.wageLevel
  return fxValue(g, b, w, { wage: level - prev, morale: payMood(prev, level) })
}

function teamBuildingAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `biz.team.${a.id}`,
    label: 'Team Building',
    emoji: '\u{1F389}',
    hint: (g) => {
      if (!hasTalent(g, 'Business')) return null
      const b = readBiz(g, a)
      const w = bizWorth(g, b)
      const mood = OUTING_GOOD * 12 - (1 - OUTING_GOOD) * 4
      const v = fxValue(g, b, w, { cash: -teamBuildingCost(b), morale: mood })
      return talentHint(g, 'Business', v > 0 ? `Worth it: about ${money(v)} in happier, harder-working staff` : 'Not worth it right now: it costs more than the mood is worth')
    },
    subtitle: (g) => {
      const b = readBiz(g, a)
      return `${localOuting(b.countryId, 0).name.replace(/^a(n)? /, '').replace(/^\w/, (x) => x.toUpperCase())}... · about ${money(teamBuildingCost(b))}`
    },
    disabledReason: (g) => manageBlock(g, a),
    run: (g) => {
      const cur = findBusiness(g, a.id)
      if (!cur) return
      const b = bizOf(g, cur)
      const cost = teamBuildingCost(b)
      if (b.cash < cost) return noCash(g, cur, cost, 'a team outing')
      if (!useYearAction(g, `biz.team.${a.id}`, 1)) return tooBusy(g, 'organized a team outing')
      b.cash -= cost
      b.yearCosts += cost
      const outing = localOuting(b.countryId, rand(g))
      const good = chance(g, OUTING_GOOD)
      const delta = good ? randInt(g, 8, 16) : -randInt(g, 2, 6)
      b.morale = clampN(b.morale + delta, 0, 100)
      for (const s of b.staff) s.morale = clampN(s.morale + delta, 0, 100)
      addStat(g, 'happiness', good ? 3 : -1)
      log(g, `I took the ${cur.name} team out for ${outing.name}.`, good ? 'good' : 'neutral')
      notice(g, 'Team Building', `You took everyone at ${cur.name} out for ${outing.name} (${formatMoney(cost)} on the company). ${good ? outing.good : outing.bad} Morale is now ${b.morale}%.`, {
        emoji: '\u{1F389}',
        tone: good ? 'good' : 'neutral',
      })
    },
  }
}

function raiseAllAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `biz.raiseAll.${a.id}`,
    label: 'Give Everyone a Raise',
    emoji: '\u{1F4B0}',
    subtitle: 'Pay up 5% for good (keeps up with inflation)',
    disabledReason: (g) => manageBlock(g, a),
    hint: (g) => {
      if (!hasTalent(g, 'Business')) return null
      const b = readBiz(g, a)
      const inflation = localEcon(b.industry, b.countryId, b.city).m.inflation
      const relief = inflation >= 0.08 && b.raiseYear < g.year ? Math.min(18, inflation * 30) * 0.4 : 0
      const v = fxValue(g, b, bizWorth(g, b), { wage: clampN(Math.round((b.wageLevel + 0.05) * 100) / 100, 0.7, 1.5) - b.wageLevel, morale: 9 + relief })
      return v > 0 ? talentHint(g, 'Business', `Worth it: the morale pays for the raise (about ${money(v)})`) : null
    },
    run: (g) => {
      const cur = findBusiness(g, a.id)
      if (!cur) return
      if (!useYearAction(g, `biz.raiseAll.${a.id}`, 1)) return tooBusy(g, 'given everyone a raise')
      const b = bizOf(g, cur)
      b.wageLevel = clampN(Math.round((b.wageLevel + 0.05) * 100) / 100, 0.7, 1.5)
      b.raiseYear = g.year
      b.morale = clampN(b.morale + randInt(g, 6, 12), 0, 100)
      log(g, `I gave everyone at ${cur.name} a raise.`, 'good')
      notice(g, 'Raises All Round', `Every employee at ${cur.name} got a 5% raise. The break room erupted in polite applause. Morale: ${b.morale}%.`, { emoji: '\u{1F4B0}', tone: 'good' })
    },
  }
}

/** Pay levels the Business talent compares (the slider allows anything from 70% to 150%). */
const PAY_GRID = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5]

/** The pay level worth the most to this company (morale against the wage bill), for the hint. */
export function bestPay(g: GameState, b: BizState): number {
  const w = bizWorth(g, b)
  let best = b.wageLevel
  let top = payValue(g, b, w, b.wageLevel)
  for (const level of PAY_GRID) {
    // Within half a slider step of today's pay is "keep it" (the slider can't land there).
    if (Math.abs(level - b.wageLevel) < 0.025) continue
    const v = payValue(g, b, w, level)
    if (v > top + 1) {
      top = v
      best = level
    }
  }
  return best
}

/** Morale swing of moving pay from `prev` to `level` (cuts sting more than raises please). */
function payMood(prev: number, level: number): number {
  return level < prev ? -Math.round((prev - level) * 60) : level > prev ? Math.round((level - prev) * 40) : 0
}

function payPolicyAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `biz.pay.${a.id}`,
    label: 'Pay Policy',
    emoji: '\u{1F9FE}',
    subtitle: (g) => {
      const b = readBiz(g, a)
      return `${payLabel(b.wageLevel)} pay (${Math.round(b.wageLevel * 100)}% of the going rate)`
    },
    disabledReason: (g) => manageBlock(g, a),
    hint: (g) => {
      if (!hasTalent(g, 'Business') || manageBlock(g, a)) return null
      const b = readBiz(g, a)
      const best = bestPay(g, b)
      return talentHint(g, 'Business', Math.abs(best - b.wageLevel) < 0.001 ? 'Best pay level: keep it here' : `Best pay level for this company right now: about ${Math.round(best * 100)}% of the going rate`)
    },
    input: {
      kind: 'slider',
      label: 'Pay (% of the going local wage)',
      unit: '%',
      min: 70,
      max: 150,
      step: 5,
      defaultValue: (g) => String(Math.round(readBiz(g, a).wageLevel * 100)),
      preview: (g, v) => {
        const b = readBiz(g, a)
        const level = clampN(Math.round(v) / 100, 0.7, 1.5)
        const e = localEcon(b.industry, b.countryId, b.city)
        const mood = payMood(b.wageLevel, level)
        const bill = (b.employees * e.wage * (level - b.wageLevel))
        const label = PAY_LEVELS.find((p) => p.label === payLabel(level))
        return [
          `${Math.round(level * 100)}% of the going rate (${payLabel(level).toLowerCase()}): about ${money(e.wage * level)} per employee a year`,
          bill !== 0 && b.employees > 0 ? `${bill > 0 ? '+' : '-'}${money(Math.abs(bill))} a year on the wage bill` : '',
          mood !== 0 ? `morale ${mood > 0 ? '+' : ''}${mood} now` : '',
          label?.note ?? '',
        ].filter(Boolean).join(' · ')
      },
    },
    run: (g, input) => {
      const cur = findBusiness(g, a.id)
      if (!cur || manageBlock(g, cur)) return
      const bb = bizOf(g, cur)
      const level = clampN(Math.round(clampN(Number(input) || bb.wageLevel * 100, 70, 150) / 5) * 0.05, 0.7, 1.5)
      const next = Math.round(level * 100) / 100
      const prev = bb.wageLevel
      // Events can leave pay off the slider's 5% grid (a 108% raise): confirming the slider where
      // it opened (snapped to 110%) is not a decision to change pay.
      if (Math.abs(next - prev) < 0.025) return
      bb.wageLevel = next
      bb.morale = clampN(bb.morale + payMood(prev, next), 0, 100)
      // A raise keeps up with inflation this year; a cut takes that back (no raise-then-cut trick).
      if (next > prev) bb.raiseYear = g.year
      else if (bb.raiseYear >= g.year) bb.raiseYear = g.year - 1
      notice(g, 'Pay Policy', `${cur.name} now pays ${payLabel(next).toLowerCase()} wages (${Math.round(next * 100)}% of the going rate). ${PAY_LEVELS.find((p) => p.label === payLabel(next))?.note ?? ''}`.trim(), { emoji: '\u{1F9FE}' })
    },
  }
}

/** Morale-driven quitting at year end (a key person with very low morale may leave). */
export function staffTurnover(g: GameState, a: Asset, b: BizState): void {
  for (const s of [...b.staff]) {
    if (s.morale >= 30 || !chance(g, 0.35)) continue
    b.staff = b.staff.filter((x) => x.id !== s.id)
    log(g, `${fullName(s)}, our ${s.role}, quit ${a.name}.`, 'bad')
  }
}
