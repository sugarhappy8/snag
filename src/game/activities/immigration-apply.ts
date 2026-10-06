// Acting on a route: paying, filing, the decision, the move; the illegal ways in (sneaking across,
// overstaying a visit); exit visas and escapes from countries that won't let you leave; and the
// decisions on applications that take years (resolved by the yearly clock). Mutates the draft.
import { arrestPlayer } from '../crime'
import { addStat, count, endJob, log, notice, scriptChoice } from '../core'
import { borderControl, strictness } from '../data/immigration'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import { getCountry } from '../world'
import type { GameState, Json } from '../types'
import { brokeNotice, money, result } from './common'
import { acquireCitizenship, createLock, relocate, relocationCost, type Arrival } from './immigration-move'
import { countryName, exitTaxDue, findRoute, type RouteEval } from './immigration-routes'
import {
  bestPassport,
  exitRegime,
  exitWindow,
  immState,
  inSchengen,
  isBanned,
  updateImm,
  type PendingApp,
} from './immigration-state'

function rec(v: Json | undefined): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {}
}

export function applyKey(dest: string, r: Pick<RouteEval, 'id'>): string {
  return r.id === 'lottery' ? `imm.lottery.${dest}` : `imm.apply.${dest}`
}

/** Already applied to this country this year? */
export function appliedThisYear(g: GameState, dest: string, r: Pick<RouteEval, 'id'>): boolean {
  return (g.yearActions[applyKey(dest, r)] ?? 0) > 0
}

/** Cash needed now: fees, plus the investment, the move and any exit tax when you move this year. */
export function upfrontCost(g: GameState, r: RouteEval): { now: number; reloc: number; tax: number } {
  const movesNow = r.moves && r.wait === 0
  const reloc = movesNow ? relocationCost(g, getCountry(r.dest)) : 0
  const tax = movesNow ? exitTaxDue(g).due : 0
  return { now: r.fee + (movesNow ? r.invest + reloc + tax : 0), reloc, tax }
}

// ---------------------------------------------------------------------------
// Applying

export function applyRoute(g: GameState, dest: string, key: string): void {
  const c = g.character
  const country = getCountry(dest)
  const r = findRoute(g, dest, key)
  if (!r) {
    notice(g, 'Not Available', `That way into ${country.name} isn't open to you anymore.`, { emoji: '\u{1F6AB}' })
    return
  }
  if (!r.ok) {
    notice(g, r.label, r.why, { emoji: '\u{1F6AB}' })
    return
  }
  if (appliedThisYear(g, dest, r)) {
    notice(g, 'Already Applied', `${country.name} already has your paperwork this year.`, { emoji: '\u{1F4C2}' })
    return
  }
  if (c.wantedLevel > 0 && r.id !== 'citizen') {
    g.yearActions[applyKey(dest, r)] = 1
    log(g, `My request to emigrate to ${country.name} was denied.`, 'bad')
    offerSneak(g, dest, 'Request Denied', 'Your background check flagged an outstanding warrant.')
    return
  }
  const cost = upfrontCost(g, r)
  if (c.money < cost.now + r.proof) {
    brokeNotice(g, cost.now + r.proof, r.proof > 0 ? `the ${r.noun} (you must show ${money(r.proof)} you keep)` : `the ${r.noun}`)
    return
  }
  g.yearActions[applyKey(dest, r)] = 1
  if (r.fee > 0) c.money = Math.round(c.money - r.fee)
  count(g, 'visaApplications')

  // Decided later: file it.
  if (r.wait > 0 || !r.moves) {
    const decide = g.year + Math.max(1, r.wait)
    updateImm(g, (s) => {
      s.apps = s.apps.filter((a) => !(a.dest === dest && a.key === key))
      s.apps.push({ id: `${dest}:${key}:${g.year}`, dest, key, label: r.noun, filed: g.year, decide, odds: r.odds })
    })
    if (r.id === 'lottery') {
      log(g, `I entered the ${r.noun}.`, 'neutral')
      notice(g, r.label, `You entered the ${r.noun}. Winners are drawn in ${decide}. Your odds: about ${Math.max(1, Math.round(r.odds * 100))} in 100.`, { emoji: r.emoji })
    } else {
      log(g, `I applied for ${article(r.noun)} ${r.noun} to ${country.name}.`, 'neutral')
      notice(g, 'Application Filed', `You filed your ${r.noun} application with ${country.name}${r.fee > 0 ? ` and paid ${money(r.fee)} in fees` : ''}. A decision is expected in ${decide}.`, { emoji: '\u{1F4E8}' })
    }
    return
  }

  // Asylum: you travel first and wait there for the decision.
  if (r.id === 'asylum') {
    arriveForAsylum(g, r)
    return
  }
  if (chance(g, r.odds)) approve(g, r, 0)
  else deny(g, r)
}

function arrivalOf(r: RouteEval): Arrival {
  return { status: r.result, visa: r.visa, term: r.term, maxYears: r.maxYears, program: r.program, sponsor: r.sponsor, keepJob: r.keepJob }
}

/** The visa came through: pay the rest and move (mutates). `feePaid` notes fees paid at filing. */
export function approve(g: GameState, r: RouteEval, feePaid: number): void {
  const c = g.character
  const country = getCountry(r.dest)
  const reloc = relocationCost(g, country)
  const cash = Math.max(0, c.money)
  const invest = Math.min(r.invest, cash)
  c.money = Math.round(c.money - invest - Math.min(reloc, Math.max(0, c.money - invest)))
  const paid = r.fee + feePaid + invest + reloc
  const extra: string[] = []
  if (r.id === 'whv') updateImm(g, (s) => s.whvUsed.push(r.dest))
  relocate(g, r.dest, 'legal', arrivalOf(r), {
    title: r.result === 'citizen' && r.id !== 'citizen' ? `${country.demonym} Citizen!` : `Welcome to ${country.name}!`,
    opener: approvalOpener(r, paid, country.name),
    extra,
  })
  if (r.invest > 0 && r.investKind) {
    if (r.investKind === 'fee') {
      log(g, `I paid ${money(invest)} for my ${r.noun}.`, 'neutral')
    } else {
      const a = createLock(g, { program: r.program ?? r.key, name: `${r.label} stake`, emoji: r.emoji, kind: r.investKind, amount: invest, years: r.lockYears, country: r.dest })
      updateImm(g, (s) => (s.program = r.program ?? s.program))
      log(g, `I locked ${money(a.value)} into ${country.name} for my visa.`, 'neutral')
    }
  }
  if (r.result === 'citizen' && r.id !== 'citizen') {
    const res = acquireCitizenship(g, r.dest, false)
    count(g, 'naturalizations')
    if (res.lost.length) notice(g, 'Passport Lost', `Taking ${country.demonym} citizenship cost you your ${res.lost.map((id) => getCountry(id).demonym).join(' and ')} citizenship: ${res.lost.length > 1 ? 'those countries don\'t' : 'that country doesn\'t'} allow dual citizenship.${res.tax > 0 ? ` ${cap(res.taxName)} took ${money(res.tax)}.` : ''}`, { emoji: '\u{1F6C2}' })
  }
}

function approvalOpener(r: RouteEval, paid: number, name: string): string {
  const what = r.id === 'citizen' ? `You moved to ${name}` : `Your ${r.noun} was approved! You moved to ${name}`
  const cost = paid > 0 ? ` and paid ${money(paid)} in fees${r.invest > 0 ? ', investment' : ''} and moving costs` : ''
  const status =
    r.result === 'citizen'
      ? r.id === 'citizen'
        ? ''
        : ' You are now a citizen.'
      : r.result === 'permanent'
        ? ' You arrived as a permanent resident.'
        : r.term
          ? ` Your visa runs for ${r.term} year${r.term === 1 ? '' : 's'}.`
          : ''
  return `${what}${cost}.${status}`
}

const DENIALS = [
  '{country}\'s immigration office reviewed your application and decided they\'re full, thanks.',
  'Your application was denied. The officer cited "vibes."',
  '{country} rejected your request. Apparently your paperwork was missing a form that doesn\'t exist.',
  'The consulate turned you down without saying why. The stamp was very red.',
]

function deny(g: GameState, r: RouteEval): void {
  const country = getCountry(r.dest)
  const crimes = g.character.criminalRecord.filter((x) => x.convicted).length
  log(g, `My ${r.noun} application to ${country.name} was denied.`, 'bad')
  const reason =
    crimes > 0
      ? 'Immigration officials took one look at your criminal record and stamped your application DENIED.'
      : r.id === 'work' && r.sponsor
        ? `Your sponsor's paperwork for the ${r.sponsor.title} job didn't make it through the visa office.`
        : r.id === 'student'
          ? 'The universities you applied to said no, and so did the visa office.'
          : pick(g, DENIALS).replace('{country}', country.name)
  offerSneak(g, r.dest, 'Application Denied', reason)
}

function offerSneak(g: GameState, dest: string, title: string, reason: string): void {
  const country = getCountry(dest)
  scriptChoice(g, ILLEGAL, title, `${country.flag} ${reason}\n\nYou could always try to get in without permission...`, [
    { id: 'sneak', label: sneakOdds(g, dest).overstay ? 'Fly in as a tourist and never leave' : 'Sneak across the border', emoji: '\u{1F977}', hint: sneakHint(g, dest) || undefined },
    { id: 'stay', label: 'Accept the decision', emoji: '\u{1F64F}' },
  ], { emoji: '\u{1F6C2}', data: { country: dest } })
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// ---------------------------------------------------------------------------
// Asylum

function arriveForAsylum(g: GameState, r: RouteEval): void {
  const country = getCountry(r.dest)
  const reloc = relocationCost(g, country)
  g.character.money = Math.round(g.character.money - Math.min(reloc, Math.max(0, g.character.money)))
  const protectedNow = r.visa === 'protection'
  const decide = g.year + (protectedNow ? 0 : strictness(r.dest, g.year) > 0.6 ? 2 : 1)
  relocate(g, r.dest, 'asylum', { status: 'asylum', visa: protectedNow ? 'protection' : 'pending' }, {
    title: protectedNow ? 'Safe' : 'Seeking Safety',
    opener: protectedNow
      ? `You reached ${country.name} and were granted protection on arrival.`
      : `You reached ${country.name} and claimed asylum. You can stay while your claim is decided (expected in ${decide}).`,
    emoji: '\u{1F54A}\u{FE0F}',
  })
  if (!protectedNow) updateImm(g, (s) => {
    s.asylumDecide = decide
    s.asylumOdds = r.odds
    s.program = r.key === 'cuban' ? 'cuban' : undefined
  })
  count(g, 'asylumClaims')
}

// ---------------------------------------------------------------------------
// Getting in without permission

export interface SneakOdds {
  odds: number
  overstay: boolean
  /** The way out is blocked by an exit regime: escape instead. */
  blocked: boolean
}

/** Pure: the odds of getting in without a visa (overstaying a visit if your passport lets you visit). */
export function sneakOdds(g: GameState, dest: string): SneakOdds {
  const home = g.character.countryId
  const regime = exitRegime(home, g.year)
  if (regime && immState(g).exitPermit !== g.year) return { odds: 0, overstay: false, blocked: true }
  const pass = bestPassport(g).strength
  const overstay = pass >= 70 && strictness(dest, g.year) < 0.85 && !isBanned(g, dest)
  let p = overstay ? 0.85 : Math.max(0.05, 1 - borderControl(dest, g.year) * 0.9)
  if (inSchengen(home, g.year) && inSchengen(dest, g.year)) p = Math.max(p, 0.9)
  if (hasTalent(g, 'Crime')) p *= 1.15
  return { odds: Math.max(0.03, Math.min(0.95, p)), overstay, blocked: false }
}

export function sneakHint(g: GameState, dest: string): string {
  const s = sneakOdds(g, dest)
  if (s.blocked) return ''
  return talentHint(g, 'Crime', `Your odds of slipping in: about ${Math.round(s.odds * 100)}%.`)
}

export function sneakIn(g: GameState, dest: string): void {
  const country = getCountry(dest)
  if (dest === g.character.countryId) return
  const s = sneakOdds(g, dest)
  if (s.blocked) {
    notice(g, 'Sealed Border', `You'd have to get out of ${getCountry(g.character.countryId).name} first.`, { emoji: '\u{1F6A7}' })
    return
  }
  g.yearActions[`imm.sneak.${dest}`] = 1
  if (chance(g, s.odds)) {
    count(g, 'illegalEmigrations')
    relocate(g, dest, 'illegal', { status: 'undocumented', entry: s.overstay ? 'overstay' : 'border' }, {
      title: 'You Made It!',
      opener: s.overstay
        ? `You flew into ${country.name} as a tourist and simply never left. Try not to get caught.`
        : `You slipped across the border undetected and started a new life in ${country.name}. Try not to get caught.`,
    })
    return
  }
  g.flags.deported = (typeof g.flags.deported === 'number' ? g.flags.deported : 0) + 1
  updateImm(g, (st) => (st.bans[dest] = g.year + 4))
  if (!s.overstay && chance(g, 0.45)) {
    log(g, `I was caught trying to sneak into ${country.name}.`, 'bad')
    notice(g, 'Caught!', `Border agents caught you trying to sneak into ${country.name}. They handed you over to the police.`, { emoji: '\u{1F6A8}', tone: 'bad' })
    arrestPlayer(g, 'Illegal Border Crossing', 1)
    return
  }
  addStat(g, 'happiness', -randInt(g, 5, 10))
  if (s.overstay) {
    log(g, `I was turned away at the airport in ${country.name}.`, 'bad')
    result(g, 'Refused Entry', `The border officer in ${country.name} didn't believe your "two-week vacation" with four suitcases. You were put on the next flight back and banned for five years.`, '\u{1F6EC}', 'bad')
  } else {
    log(g, `I was caught sneaking into ${country.name} and deported.`, 'bad')
    result(g, 'Deported', `You made it ${randInt(g, 2, 40)} miles past the border before you were caught and sent back. You're banned from ${country.name} for five years.`, '\u{1F6EC}', 'bad')
  }
}

// Kept under its original id: old saves may have this popup queued.
export const ILLEGAL = defineScript('act.emigrate.illegal', (g, choice, data) => {
  const d = rec(data)
  const id = typeof d.country === 'string' ? d.country : ''
  if (!id || id === g.character.countryId || !getCountry(id) || getCountry(id).id !== id) return
  if (choice !== 'sneak') {
    log(g, `I gave up on moving to ${getCountry(id).name}.`, 'neutral')
    return
  }
  sneakIn(g, id)
})

// ---------------------------------------------------------------------------
// Exit visas and escapes (the Eastern Bloc, Maoist China, Cuba...)

export function exitPermitOdds(g: GameState): number {
  const regime = exitRegime(g.character.countryId, g.year)
  if (!regime) return 1
  const w = exitWindow(regime, g.year)
  let p = w?.permit ?? regime.permit
  const sp = regime.special
  if (sp && g.character.religion === sp.religion && sp.years.some(([a, b]) => g.year >= a && g.year <= b)) p = Math.max(p, sp.permit)
  return Math.max(0.01, Math.min(0.95, p))
}

export function requestExitPermit(g: GameState): void {
  const c = g.character
  const regime = exitRegime(c.countryId, g.year)
  if (!regime) return
  if ((g.yearActions['imm.exitpermit'] ?? 0) > 0) {
    notice(g, 'Exit Visa', 'The ministry already said no this year. Try again next year.', { emoji: '\u{1F4C2}' })
    return
  }
  g.yearActions['imm.exitpermit'] = 1
  if (chance(g, exitPermitOdds(g))) {
    updateImm(g, (s) => (s.exitPermit = g.year))
    log(g, 'I was granted an exit visa.', 'good')
    notice(g, 'Exit Visa Granted', `Against all odds, the authorities of ${regime.name} stamped your exit visa. It's only good this year: apply to move abroad now.`, { emoji: '\u{1F4DC}', tone: 'good' })
    return
  }
  log(g, 'My application for an exit visa was refused.', 'bad')
  let text = `The authorities of ${regime.name} refused your exit visa. ${regime.note}`
  if (c.job && c.job.category !== 'special' && chance(g, 0.3)) {
    const title = c.job.title
    endJob(g, 'job', 'fired')
    text += ` Worse, your employer found out you'd asked to leave and fired you as a ${title}.`
    log(g, 'I was fired for applying to emigrate.', 'bad')
  }
  addStat(g, 'happiness', -randInt(g, 3, 8))
  notice(g, 'Exit Visa Refused', text, { emoji: '\u{1F6AB}', tone: 'bad' })
}

export function escapeOdds(g: GameState, dest: string): number {
  const regime = exitRegime(g.character.countryId, g.year)
  if (!regime) return 0
  const w = exitWindow(regime, g.year)
  let p = w?.escape !== undefined && (!w.dest || w.dest.includes(dest)) ? w.escape : regime.escape
  if (hasTalent(g, 'Crime')) p *= 1.15
  return Math.max(0.02, Math.min(0.9, p))
}

export function attemptEscape(g: GameState, dest: string): void {
  const c = g.character
  const regime = exitRegime(c.countryId, g.year)
  if (!regime || dest === c.countryId) return
  const country = getCountry(dest)
  g.yearActions[`imm.escape.${dest}`] = 1
  if (chance(g, escapeOdds(g, dest))) {
    count(g, 'escapes')
    const welcome = (strictness(dest, g.year) < 0.95 && country.wealth >= 0.5) || dest === 'us'
    relocate(g, dest, 'escape', welcome ? { status: 'asylum', visa: 'refugee' } : { status: 'undocumented', entry: 'border' }, {
      title: 'Escaped!',
      opener: welcome
        ? `You got out of ${regime.name} and made it to ${country.name}, which granted you refugee status.`
        : `You got out of ${regime.name} and made it to ${country.name}, though nobody there gave you papers.`,
      emoji: '\u{1F3C3}',
    })
    return
  }
  log(g, `I was caught trying to escape from ${getCountry(c.countryId).name}.`, 'bad')
  notice(g, 'Caught at the Border', `Border guards caught you trying to get out of ${regime.name}. You were arrested.`, { emoji: '\u{1F6A8}', tone: 'bad' })
  arrestPlayer(g, regime.id.startsWith('soviet') || ['poland', 'czechoslovakia', 'hungary', 'romania'].includes(regime.id) ? 'Attempted Defection' : 'Illegal Border Crossing', 3)
}

// ---------------------------------------------------------------------------
// Decisions on applications that take years (called by the yearly clock)

export function resolvePending(g: GameState, app: PendingApp): void {
  const country = getCountry(app.dest)
  updateImm(g, (s) => (s.apps = s.apps.filter((a) => a.id !== app.id)))
  const lottery = app.key.startsWith('lottery:')
  if (app.dest === g.character.countryId) return
  const r = findRoute(g, app.dest, app.key)
  if (!r || !r.ok) {
    log(g, `My ${app.label} application to ${country.name} fell through.`, 'bad')
    notice(g, 'Application Closed', `Your ${app.label} application to ${country.name} was closed${r ? `: ${r.why}` : ' because the program no longer exists'}.`, { emoji: '\u{1F4ED}' })
    return
  }
  if (!chance(g, app.odds)) {
    if (lottery) {
      log(g, `I didn't win the ${app.label}.`, 'neutral')
      notice(g, app.label, `Your number didn't come up in the ${app.label}. There's always next year.`, { emoji: '\u{1F3B0}' })
    } else {
      log(g, `My ${app.label} application to ${country.name} was denied.`, 'bad')
      notice(g, 'Application Denied', `After ${g.year - app.filed} year${g.year - app.filed === 1 ? '' : 's'} of waiting, ${country.name} denied your ${app.label} application.`, { emoji: '\u{1F4ED}', tone: 'bad' })
    }
    return
  }
  const fee = lottery ? 330 : 0
  const total = r.invest + relocationCost(g, country) + exitTaxDue(g).due + fee
  log(g, lottery ? `I won the ${app.label}!` : `My ${app.label} application to ${country.name} was approved.`, 'good')
  scriptChoice(g, APPROVED, lottery ? 'You Won!' : 'Visa Approved!', `${country.flag} ${lottery ? `Your number came up in the ${app.label}!` : `${country.name} approved your ${app.label} application.`} Moving there will cost about ${money(total)}${r.invest > 0 ? ' including the investment' : ''}.`, [
    { id: 'move', label: `Move to ${country.name}`, emoji: country.flag },
    { id: 'decline', label: 'Turn it down', emoji: '\u{270B}' },
  ], { emoji: lottery ? '\u{1F3B0}' : '\u{1F4EC}', data: { dest: app.dest, key: app.key, fee } })
}

export const APPROVED = defineScript('imm.approved', (g, choice, data) => {
  const d = rec(data)
  const dest = typeof d.dest === 'string' ? d.dest : ''
  const key = typeof d.key === 'string' ? d.key : ''
  const fee = typeof d.fee === 'number' && Number.isFinite(d.fee) ? Math.max(0, d.fee) : 0
  if (!dest || !key || dest === g.character.countryId || !g.character.alive || g.character.prison) return
  const country = getCountry(dest)
  if (choice !== 'move') {
    log(g, `I turned down my visa to ${country.name}.`, 'neutral')
    return
  }
  const r = findRoute(g, dest, key)
  if (!r || !r.ok) {
    notice(g, 'Visa Lapsed', `The visa to ${country.name} fell through: ${r ? r.why : 'the program is gone'}`, { emoji: '\u{1F4ED}' })
    return
  }
  const total = r.invest + relocationCost(g, country) + exitTaxDue(g).due + fee
  if (g.character.money < total) {
    brokeNotice(g, total, `moving to ${countryName(dest)}`)
    log(g, `I couldn't afford to use my visa to ${country.name}.`, 'bad')
    return
  }
  g.character.money = Math.round(g.character.money - fee)
  approve(g, { ...r, fee: 0 }, fee)
})
