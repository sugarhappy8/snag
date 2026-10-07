// Immigration: passports, visas, residency and citizenship. Where you can move depends on the
// passport(s) you hold, your net worth, your CV, your family and the era (free-movement blocs,
// golden visas, quotas and backlogs, exit restrictions). Activities › Emigrate
// (activities/emigrate.ts) is the menu; this module owns the yearly status clock: visas expire
// or renew, years add up to permanent residency and citizenship (test, oath, dual-citizenship
// rules), asylum decisions, amnesties, raids and deportation, unions breaking up, locked
// golden-visa money, and the family's passports. State helpers live in
// activities/immigration-state.ts; routes in immigration-routes.ts; moves in immigration-move.ts.
import { addMoney, addStat, count, currentPartner, endJob, log, notice, remember, scriptChoice } from './core'
import { AMNESTIES, GUEST_PROGRAMS, INVESTOR_PROGRAMS, REMOTE_PROGRAMS, RETIRE_PROGRAMS, UNIONS, dualRule, enforcement, lawOf, type InvestKind } from './data/immigration'
import { bell, chance, randInt } from './rng'
import { defineScript } from './scripts'
import { hasTalent, talentHint } from './talents'
import { getCountry } from './world'
import type { Asset, GameState, ImmigrationStatus, Json } from './types'
import { money } from './activities/common'
import { resolvePending } from './activities/immigration-apply'
import { COLLAPSE_KEEP, LOCK_DRIFT, RETIRE_DEPOSIT_YEARS, backlogYears, programMoney, destWealth, investKindWord, natzYearsFor, remoteJobIncome } from './activities/immigration-routes'
import {
  acquireCitizenship,
  deport,
  familyNaturalizes,
  homeCountryFor,
  inflationErosion,
  leaveFor,
  lockAssets,
  passportsLostBy,
  stampFamily,
} from './activities/immigration-move'
import {
  an,
  blocAccess,
  cap,
  citizenshipsOf,
  expandCitizenships,
  grantCitizenship,
  heirCitizenships,
  immState,
  isCitizenOf,
  languageLevel,
  personCitizenships,
  place,
  setStatus,
  statusOf,
  unionName,
  updateImm,
  visaLabel,
  type ImmState,
} from './activities/immigration-state'

export { citizenshipsOf, grantCitizenship, heirCitizenships, isCitizenOf, passportsLostBy, statusOf }

function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function nice(n: number): number {
  const a = Math.abs(n)
  const step = a < 1_000 ? 10 : a < 10_000 ? 50 : 500
  return Math.max(0, Math.round(n / step) * step)
}

function demonymOf(id: string): string {
  return getCountry(id).demonym
}

// ---------------------------------------------------------------------------
// Old saves and missing records

function migrate(g: GameState): void {
  const c = g.character
  const fresh = !g.flags.imm
  if (!Array.isArray(c.citizenships) || c.citizenships.length === 0) c.citizenships = citizenshipsOf(g)
  if (fresh) {
    const citizen = isCitizenOf(g, c.countryId)
    updateImm(g, (s) => {
      s.arrived = citizen ? g.year - c.age : g.year
      s.convictionsSeen = c.criminalRecord.filter((r) => r.convicted).length
    })
  }
  const s = statusOf(g)
  if (s.status === 'citizen') {
    if (c.immigration) delete c.immigration
  } else if (!c.immigration || c.immigration.countryId !== c.countryId) {
    setStatus(g, { status: s.status, visa: s.visa, since: s.since, expires: s.expires })
    if (s.status === 'permanent') updateImm(g, (st) => (st.prSince = st.prSince ?? g.year))
  }
}

// ---------------------------------------------------------------------------
// Unions breaking up (the USSR in 1991, Yugoslavia, Czechoslovakia...)

function dissolveUnions(g: GameState): void {
  const c = g.character
  const st = immState(g)
  const held = citizenshipsOf(g)
  for (const u of UNIONS) {
    const m = u.members.find((x) => x.id === c.countryId && x.to !== undefined && g.year > x.to && g.year <= x.to + 30)
    if (!m || m.to === undefined) continue
    const tag = `${u.id}:${m.to}`
    if (st.unions.includes(tag)) continue
    updateImm(g, (s) => s.unions.push(tag))
    if (held.includes(c.countryId)) continue
    if (!expandCitizenships(held, m.to).includes(c.countryId)) continue
    const name = unionName(u, m.to)
    const country = getCountry(c.countryId)
    if (u.zeroOption?.[c.countryId] === false && c.birthCountryId !== c.countryId) {
      setStatus(g, { status: 'permanent', since: g.year })
      updateImm(g, (s) => (s.prSince = g.year))
      notice(g, 'A New Country', `When ${name} broke apart, ${place(country)} only gave citizenship to people with roots there. You became a permanent resident with a "non-citizen" passport.`, { emoji: country.flag })
      log(g, `After ${name} broke up, I became a non-citizen resident of ${place(country)}.`, 'event')
      continue
    }
    grantCitizenship(g, c.countryId)
    setStatus(g, { status: 'citizen', since: g.year })
    notice(g, 'A New Passport', `When ${name} broke apart, you became a citizen of ${place(country)}, where you lived.`, { emoji: country.flag })
    log(g, `After ${name} broke up, I became ${an(country.demonym)} citizen.`, 'event')
    remember(g, `Became a citizen of ${place(country)} when ${name} broke up.`)
  }
}

// ---------------------------------------------------------------------------
// Golden-visa money: drifts with its market, unlocks when the lock ends

function updateLocks(g: GameState): void {
  const c = g.character
  for (const a of lockAssets(g)) {
    const d = a.details
    const kind = (typeof d.investKind === 'string' && d.investKind in LOCK_DRIFT ? d.investKind : 'fund') as InvestKind
    const until = num(d.until, g.year)
    if (d.holder !== c.id) {
      redeem(g, a, `The ${a.name} you inherited was cashed out: ${money(Math.max(0, a.value))} went into your account.`)
      continue
    }
    const p = LOCK_DRIFT[kind]
    if (p.inflation) a.value = Math.round(a.value * inflationErosion(g.year, p.inflation))
    else if (p.lo !== p.hi) a.value = Math.round(a.value * (1 + bell(g, p.lo, p.hi) / 1000))
    if (p.fail && chance(g, p.fail)) {
      a.value = Math.round(a.value * COLLAPSE_KEEP)
      log(g, `The project behind my ${a.name.toLowerCase()} went bust.`, 'bad')
      notice(g, 'Project Collapsed', `The project behind your ${a.name.toLowerCase()} went bust. Your stake is now worth ${money(a.value)}.`, { emoji: '\u{1F4C9}', tone: 'bad' })
    }
    a.value = Math.max(0, a.value)
    if (g.year >= until) redeem(g, a, `The lock on your ${a.name.toLowerCase()} (${investKindWord(kind)}) ended: ${money(a.value)} came back to you.`)
  }
}

function redeem(g: GameState, a: Asset, text: string): void {
  g.assets = g.assets.filter((x) => x.id !== a.id)
  addMoney(g, Math.max(0, a.value))
  log(g, `I cashed out ${money(Math.max(0, a.value))} from my visa investment.`, 'neutral')
  notice(g, 'Investment Unlocked', text, { emoji: '\u{1F513}' })
}

function programLock(program: string | undefined): number {
  return INVESTOR_PROGRAMS.find((p) => p.id === program)?.lock ?? 0
}

// ---------------------------------------------------------------------------
// Convictions and deportation

function seriousConvictionWithin(g: GameState, years: number): boolean {
  const c = g.character
  return c.criminalRecord.some((r) => r.convicted && (r.sentenceYears ?? 0) >= 1 && c.age - r.age < years)
}

/** Weigh new convictions; returns true when the character is (or will be) deported. */
function noteConvictions(g: GameState): boolean {
  const c = g.character
  const conv = c.criminalRecord.filter((r) => r.convicted)
  const st = immState(g)
  if (conv.length <= st.convictionsSeen) return false
  const fresh = conv.slice(st.convictionsSeen)
  updateImm(g, (s) => (s.convictionsSeen = conv.length))
  const s = statusOf(g)
  if (s.status === 'citizen' || !fresh.some((r) => (r.sentenceYears ?? 0) >= 1)) return false
  const country = getCountry(c.countryId)
  const p = s.status === 'permanent' ? 0.6 : s.status === 'asylum' && s.visa !== 'pending' ? 0.35 : 1
  if (!chance(g, p)) {
    notice(g, 'Close Call', `After your conviction, ${place(country)} tried to deport you, but an immigration judge let you keep your status. Barely.`, { emoji: '\u{2696}\u{FE0F}' })
    return false
  }
  if (c.prison) {
    updateImm(g, (st2) => (st2.deportAfterRelease = true))
    notice(g, 'Deportation Order', `Because of your conviction, ${place(country)} will deport you as soon as your sentence ends.`, { emoji: '\u{2696}\u{FE0F}', tone: 'bad' })
    return true
  }
  deport(g, 'After your conviction, an immigration judge ordered you removed.', 10)
  return true
}

// ---------------------------------------------------------------------------
// The status clock

function prYearsFor(g: GameState, s: ImmigrationStatus, st: ImmState): number | null {
  const dest = s.countryId
  const law = lawOf(dest)
  const visa = s.visa ?? 'work'
  switch (visa) {
    case 'free':
      return blocAccess(citizenshipsOf(g), dest, g.year).some((b) => b.bloc.id === 'gcc') ? null : 5
    case 'tasman':
      return g.year >= 2023 ? 4 : null
    case 'bloc':
      return 2
    case 'student':
    case 'graduate':
    case 'whv':
    case 'fiance':
    case 'jobseeker':
    case 'pending':
    case 'daca':
      return null
    case 'investor': {
      const p = INVESTOR_PROGRAMS.find((x) => x.id === st.program)
      return p ? (p.prYears === undefined ? law.pr : p.prYears) : law.pr
    }
    case 'retire':
      return RETIRE_PROGRAMS.find((x) => x.id === st.program)?.prYears ?? null
    case 'remote':
      return REMOTE_PROGRAMS.find((x) => x.id === st.program)?.prYears ?? null
    case 'guest': {
      const p = GUEST_PROGRAMS.find((x) => x.id === st.program)
      return p ? p.prYears : law.pr
    }
    case 'spouse':
      return law.pr === null ? (dest === 'il' ? 4 : null) : Math.min(law.pr, 3)
    case 'bno':
      return 5
    case 'protection':
    case 'refugee':
      return Math.min(law.pr ?? 5, 5)
    default:
      return law.pr === null ? null : law.pr + backlogYears(dest, g.character.birthCountryId, g.year)
  }
}

function hasJob(g: GameState): boolean {
  const j = g.character.job
  return !!j && j.category !== 'military'
}

function married(g: GameState): boolean {
  const p = currentPartner(g)
  return !!p && p.relation === 'spouse'
}

interface Renewal {
  ok: boolean
  term?: number
  visa?: string
  reason?: string
  /** The visa changed type: the permanent-residency clock starts now. */
  restart?: boolean
}

function renewal(g: GameState, s: ImmigrationStatus, st: ImmState): Renewal {
  const c = g.character
  const visa = s.visa ?? 'work'
  const capped = st.maxUntil !== undefined && g.year >= st.maxUntil
  switch (visa) {
    case 'work':
    case 'skilled':
      return hasJob(g) ? { ok: true, term: 3 } : { ok: false, reason: `Without a job, your ${visaLabel(visa)} couldn't be renewed.` }
    case 'guest':
      if (capped) return { ok: false, reason: 'Your guest-worker permit reached its maximum length.' }
      return hasJob(g) ? { ok: true, term: 2 } : { ok: false, reason: 'Without a job, your guest-worker permit lapsed.' }
    case 'jobseeker':
      return hasJob(g) ? { ok: true, term: 3, visa: 'work', restart: true } : { ok: false, reason: "You didn't find a job before your job-seeker visa ran out." }
    case 'student': {
      const lvl = c.education.current?.level
      if (lvl === 'university' || lvl === 'graduate' || lvl === 'community') return { ok: true, term: 1 }
      if (c.education.degrees.length > (st.degreesAtVisa ?? c.education.degrees.length)) return { ok: true, term: 2, visa: 'graduate', restart: true }
      return { ok: false, reason: "You weren't enrolled at a university, so your student visa wasn't renewed." }
    }
    case 'graduate':
      return hasJob(g) ? { ok: true, term: 3, visa: 'work', restart: true } : { ok: false, reason: 'Your graduate work visa ran out before you found a job.' }
    case 'whv': {
      const def = c.job ? c.job.defId : ''
      const skilled = !!c.job && c.job.category === 'fulltime' && !['factory_worker', 'janitor', 'farmer', 'housekeeper', 'construction', 'fast_food', 'cashier'].includes(def)
      return skilled ? { ok: true, term: 3, visa: 'work', restart: true } : { ok: false, reason: 'Your working holiday is over.' }
    }
    case 'spouse':
      return married(g) ? { ok: true, term: 2 } : { ok: false, reason: 'Your marriage ended, and so did your spouse visa.' }
    case 'fiance':
      return married(g) ? { ok: true, term: 2, visa: 'spouse' } : { ok: false, reason: "You didn't marry within the year, so your fiancé(e) visa expired." }
    case 'investor': {
      const lock = lockAssets(g).find((a) => a.details.program === st.program)
      const done = (st.visaSince ?? s.since) + programLock(st.program) <= g.year
      return lock || done || !st.program ? { ok: true, term: 5 } : { ok: false, reason: 'You pulled your money out early, so your investor visa was revoked.' }
    }
    case 'retire': {
      const p = RETIRE_PROGRAMS.find((x) => x.id === st.program)
      const need = p ? programMoney(p.income, g.year) : 0
      if (p?.deposit && (st.visaSince ?? s.since) + RETIRE_DEPOSIT_YEARS > g.year && !lockAssets(g).some((a) => a.details.program === p.id)) return { ok: false, reason: 'You withdrew the bank deposit your retirement visa required.' }
      return c.pension >= need || netWorthish(g) >= need * 15 ? { ok: true, term: 1 } : { ok: false, reason: 'You no longer meet the income requirement for your retirement visa.' }
    }
    case 'remote': {
      const p = REMOTE_PROGRAMS.find((x) => x.id === st.program)
      const need = p ? programMoney(p.income, g.year) : 0
      if (capped) return { ok: false, reason: 'Your remote-worker visa reached its maximum length.' }
      return remoteJobIncome(g) >= need ? { ok: true, term: p?.term ?? 1 } : { ok: false, reason: 'Without a remote job paying enough, your remote-worker visa lapsed.' }
    }
    case 'bno':
      return { ok: true, term: 5 }
    default:
      return { ok: true, term: 2 }
  }
}

function netWorthish(g: GameState): number {
  const assets = g.assets.reduce((s, a) => s + a.value - (a.mortgage?.balance ?? 0), 0)
  return g.character.money + assets - g.character.loans.reduce((s, l) => s + l.balance, 0)
}

function visaAllowsPr(g: GameState, s: ImmigrationStatus, st: ImmState): boolean {
  const visa = s.visa ?? 'work'
  if (visa === 'work' || visa === 'skilled' || visa === 'guest') return hasJob(g)
  if (visa === 'spouse') return married(g)
  if (visa === 'investor') return !!lockAssets(g).find((a) => a.details.program === st.program) || (st.visaSince ?? s.since) + programLock(st.program) <= g.year
  return true
}

function grantPr(g: GameState, why: string): void {
  const country = getCountry(g.character.countryId)
  setStatus(g, { status: 'permanent', since: g.year })
  updateImm(g, (s) => {
    s.prSince = g.year
    s.prDeferred = undefined
    s.maxUntil = undefined
  })
  count(g, 'permanentResidencies')
  log(g, `I became a permanent resident of ${place(country)}.`, 'good')
  remember(g, `Became a permanent resident of ${place(country)}.`)
  addStat(g, 'happiness', randInt(g, 3, 7))
  notice(g, 'Permanent Resident!', `${why} You're now a permanent resident of ${place(country)}: no more renewals, and citizenship is the next step.`, { emoji: '\u{1FAAA}', tone: 'good' })
}

function visaClock(g: GameState, s: ImmigrationStatus, st: ImmState): void {
  const c = g.character
  const since = st.visaSince ?? s.since
  const years = g.year - since
  // Investor visas hold only while the money stays in.
  if (s.visa === 'investor' && st.program && since + programLock(st.program) > g.year && !lockAssets(g).some((a) => a.details.program === st.program)) {
    if (c.age >= 18) {
      lapse(g, 'You pulled your money out of the investment early, so your investor visa was revoked.')
      return
    }
  }
  const toPr = prYearsFor(g, s, st)
  if (toPr !== null && years >= toPr && visaAllowsPr(g, s, st) && (st.prDeferred ?? 0) < g.year) {
    const free = s.visa === 'free' || s.visa === 'bloc' || s.visa === 'tasman'
    const fee = free ? 0 : nice(1_200 * destWealth(c.countryId))
    if (c.age >= 18 && c.money < fee) {
      updateImm(g, (x) => (x.prDeferred = g.year))
      notice(g, 'Permanent Residency', `You qualify for permanent residency, but you couldn't pay the ${money(fee)} application fee. Try again next year.`, { emoji: '\u{1F4B8}' })
    } else {
      if (fee > 0 && c.age >= 18) c.money = Math.round(c.money - fee)
      grantPr(g, free ? `After ${years} years of living there, the right to stay became permanent.` : `After ${years} years on ${an(visaLabel(s.visa))}, your application${fee > 0 ? ` (${money(fee)})` : ''} was approved.`)
      return
    }
  }
  if (s.expires === undefined || g.year < s.expires) return
  if (c.age < 18) {
    setStatus(g, { status: 'visa', visa: s.visa, since: s.since, expires: g.year + 2 })
    return
  }
  const r = renewal(g, s, st)
  if (!r.ok && s.visa !== 'spouse' && s.visa !== 'fiance' && married(g) && isCitizenOfCountry(g, c.countryId)) {
    spouseSponsors(g, s)
    return
  }
  if (r.ok) {
    const visa = r.visa ?? s.visa
    setStatus(g, { status: 'visa', visa, since: r.restart ? g.year : s.since, expires: g.year + (r.term ?? 2) })
    if (r.restart) updateImm(g, (x) => (x.visaSince = g.year))
    log(g, r.visa && r.visa !== s.visa ? `My ${visaLabel(s.visa)} became ${an(visaLabel(r.visa))}.` : `I renewed my ${visaLabel(visa)}.`, 'neutral')
    if (r.visa && r.visa !== s.visa) notice(g, 'Visa Upgraded', `Your ${visaLabel(s.visa)} became ${an(visaLabel(r.visa))}, valid until ${g.year + (r.term ?? 2)}.`, { emoji: '\u{1F6C2}', tone: 'good' })
    return
  }
  lapse(g, r.reason ?? 'Your visa ran out.')
}

/** A visa that couldn't be renewed, rescued by a citizen spouse's sponsorship. */
function spouseSponsors(g: GameState, s: ImmigrationStatus): void {
  const c = g.character
  const p = currentPartner(g)
  const name = p ? p.firstName : 'your spouse'
  if (['us', 'pr', 'ca', 'nz'].includes(c.countryId)) {
    grantPr(g, `When your ${visaLabel(s.visa)} ran out, ${name} sponsored you as a spouse.`)
    return
  }
  setStatus(g, { status: 'visa', visa: 'spouse', since: g.year, expires: g.year + 2 })
  updateImm(g, (x) => {
    x.visaSince = g.year
    x.program = undefined
    x.maxUntil = undefined
  })
  log(g, `${name} sponsored me for a spouse visa when my ${visaLabel(s.visa)} ran out.`, 'neutral')
  notice(g, 'Spouse Visa', `Your ${visaLabel(s.visa)} couldn't be renewed, but ${name} sponsored you: you're now on a spouse visa, valid until ${g.year + 2}.`, { emoji: '\u{1F48D}', tone: 'good' })
}

/** The visa is gone: leave, or stay without papers (the character is undocumented until they go). */
function lapse(g: GameState, reason: string): void {
  const c = g.character
  const country = getCountry(c.countryId)
  const home = homeCountryFor(g)
  setStatus(g, { status: 'undocumented', since: g.year })
  updateImm(g, (s) => {
    s.entry = 'overstay'
    s.program = undefined
  })
  log(g, `I lost my legal status in ${place(country)}.`, 'bad')
  scriptChoice(g, LAPSE, 'Visa Expired', `${country.flag} ${reason}\n\nYou can go home to ${place(getCountry(home))}, or stay in ${place(country)} without papers (no legal job, and the risk of deportation every year).`, [
    { id: 'leave', label: `Move to ${place(getCountry(home))}`, emoji: getCountry(home).flag },
    { id: 'stay', label: 'Stay without papers', emoji: '\u{1F648}' },
  ], { emoji: '\u{1F6C2}', data: { home } })
}

const LAPSE = defineScript('imm.lapse', (g, choice, data) => {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, Json>) : {}
  const home = typeof d.home === 'string' ? d.home : homeCountryFor(g)
  const c = g.character
  if (!c.alive || c.prison || home === c.countryId) return
  if (choice === 'leave') {
    leaveFor(g, home, `You left ${place(getCountry(c.countryId))} before anyone made you.`)
    return
  }
  log(g, `I stayed in ${place(getCountry(c.countryId))} without papers.`, 'bad')
})

// --- citizenship -------------------------------------------------------------

export function citizenshipTestOdds(g: GameState, studied: boolean): number {
  const c = g.character
  const lang = languageLevel(g, lawOf(c.countryId).lang)
  let p = 0.5 + c.stats.smarts / 250 + (lang >= 2 ? 0.15 : lang === 0 ? -0.15 : 0) + (studied ? 0.2 : 0)
  if (hasTalent(g, 'Academics')) p += 0.1
  return Math.max(0.15, Math.min(0.97, p))
}

function citizenshipFee(g: GameState): number {
  return nice(800 * destWealth(g.character.countryId))
}

/** Years until citizenship can be applied for here (0 = now, null = never). */
export function yearsToCitizenship(g: GameState): number | null {
  const c = g.character
  const s = statusOf(g)
  if (s.status === 'citizen') return 0
  const natz = natzYearsFor(g, c.countryId)
  if (natz === null) return null
  const st = immState(g)
  if (s.status !== 'permanent') {
    const toPr = prYearsFor(g, s, st)
    if (toPr === null) return null
    const prIn = Math.max(0, (st.visaSince ?? s.since) + toPr - g.year)
    return lawOf(c.countryId).natzFrom === 'pr' ? prIn + natz : Math.max(prIn, st.arrived + natz - g.year)
  }
  const start = lawOf(c.countryId).natzFrom === 'pr' ? (st.prSince ?? s.since) : st.arrived
  return Math.max(0, start + natz - g.year)
}

function citizenshipClock(g: GameState, st: ImmState): void {
  const c = g.character
  if (c.age < 18) return
  const wait = yearsToCitizenship(g)
  if (wait === null || wait > 0) return
  if (st.citizenAsk !== undefined && g.year < st.citizenAsk) return
  if (seriousConvictionWithin(g, 5)) return
  offerCitizenship(g)
}

export function offerCitizenship(g: GameState): void {
  const c = g.character
  const country = getCountry(c.countryId)
  const lost = passportsLostBy(g, c.countryId)
  const fee = citizenshipFee(g)
  const warn = lost.length ? `\n\nHeads up: taking ${country.demonym} citizenship means giving up your ${lost.map(demonymOf).join(' and ')} passport${lost.length > 1 ? 's' : ''}.` : ''
  scriptChoice(g, CITIZENSHIP, 'Citizenship', `${country.flag} You've lived in ${place(country)} long enough to become a citizen. Pass the citizenship test and take the oath. The application costs ${money(fee)}.${warn}`, [
    { id: 'study', label: 'Study hard and take the test', emoji: '\u{1F4DA}', hint: talentHint(g, 'Academics', `Your odds of passing: about ${Math.round(citizenshipTestOdds(g, true) * 100)}%.`) || undefined },
    { id: 'wing', label: 'Wing it', emoji: '\u{1F3B2}' },
    { id: 'later', label: 'Not now', emoji: '\u{23F3}' },
  ], { emoji: '\u{1F5F3}\u{FE0F}' })
}

const CITIZENSHIP = defineScript('imm.citizenship', (g, choice) => {
  const c = g.character
  if (!c.alive || c.prison || isCitizenOf(g, c.countryId)) return
  const country = getCountry(c.countryId)
  if (choice === 'later') {
    updateImm(g, (s) => (s.citizenAsk = g.year + 2))
    log(g, `I put off applying for ${country.demonym} citizenship.`, 'neutral')
    return
  }
  const fee = citizenshipFee(g)
  if (c.money < fee) {
    updateImm(g, (s) => (s.citizenAsk = g.year + 1))
    notice(g, 'Citizenship', `You couldn't afford the ${money(fee)} application fee. Maybe next year.`, { emoji: '\u{1F4B8}' })
    return
  }
  c.money = Math.round(c.money - fee)
  if (!chance(g, citizenshipTestOdds(g, choice === 'study'))) {
    updateImm(g, (s) => (s.citizenAsk = g.year + 1))
    log(g, `I failed the ${country.demonym} citizenship test.`, 'bad')
    addStat(g, 'happiness', -randInt(g, 2, 5))
    notice(g, 'Test Failed', `You failed the citizenship test. You confidently named the wrong national bird, the wrong founding year and, somehow, the wrong country. You can try again next year.`, { emoji: '\u{1F4DD}', tone: 'bad' })
    return
  }
  const lost = passportsLostBy(g, c.countryId)
  if (lost.length) {
    scriptChoice(g, OATH, 'One Passport Too Many', `${country.flag} You passed the test! But taking ${country.demonym} citizenship means giving up your ${lost.map(demonymOf).join(' and ')} citizenship.`, [
      { id: 'oath', label: `Take the oath and give up ${lost.length > 1 ? 'the others' : `your ${demonymOf(lost[0])} passport`}`, emoji: '\u{1F91A}' },
      { id: 'keep', label: 'Keep my passport (stay a permanent resident)', emoji: '\u{1F6C2}' },
    ], { emoji: '\u{1F5F3}\u{FE0F}' })
    return
  }
  takeOath(g)
})

const OATH = defineScript('imm.oath', (g, choice) => {
  const c = g.character
  if (!c.alive || c.prison || isCitizenOf(g, c.countryId)) return
  if (choice !== 'oath') {
    updateImm(g, (s) => (s.citizenAsk = g.year + 5))
    log(g, `I decided to keep my ${citizenshipsOf(g).map(demonymOf).join(' and ')} passport instead of naturalizing.`, 'neutral')
    return
  }
  takeOath(g)
})

function takeOath(g: GameState): void {
  const c = g.character
  const dest = c.countryId
  const country = getCountry(dest)
  const res = acquireCitizenship(g, dest)
  setStatus(g, { status: 'citizen', since: g.year })
  const fam = familyNaturalizes(g, dest)
  count(g, 'naturalizations')
  addStat(g, 'happiness', randInt(g, 5, 10))
  log(g, `I took the oath and became ${an(country.demonym)} citizen.`, 'good')
  remember(g, `Became a naturalized citizen of ${place(country)}.`)
  const lines = [`You raised your right hand, took the oath and walked out ${an(country.demonym)} citizen, passport and all.`]
  if (res.lost.length) lines.push(`You gave up your ${res.lost.map(demonymOf).join(' and ')} citizenship.`)
  if (res.tax > 0) lines.push(`${res.taxName[0].toUpperCase()}${res.taxName.slice(1)} took ${money(res.tax)} on the way out.`)
  lines.push(...fam)
  notice(g, 'New Citizen!', lines.join('\n\n'), { emoji: country.flag, tone: 'good' })
}

// --- asylum ------------------------------------------------------------------

function asylumClock(g: GameState, s: ImmigrationStatus, st: ImmState): void {
  const c = g.character
  const country = getCountry(c.countryId)
  if (s.visa === 'pending') {
    if (st.asylumDecide !== undefined && g.year < st.asylumDecide) return
    if (st.program === 'cuban') {
      grantPr(g, 'Under the Cuban Adjustment Act, your green card came through after a year.')
      return
    }
    if (chance(g, st.asylumOdds ?? 0.4)) {
      setStatus(g, { status: 'asylum', visa: 'refugee', since: g.year })
      updateImm(g, (x) => {
        x.visaSince = g.year
        x.asylumDecide = undefined
        x.asylumOdds = undefined
      })
      count(g, 'asylumGranted')
      log(g, `My asylum claim in ${place(country)} was accepted.`, 'good')
      notice(g, 'Asylum Granted', `${cap(place(country))} recognized you as a refugee. You can stay, work, and eventually settle for good.`, { emoji: '\u{1F54A}\u{FE0F}', tone: 'good' })
      return
    }
    lapse(g, `${cap(place(country))} rejected your asylum claim.`)
    return
  }
  const toPr = prYearsFor(g, s, st)
  const since = st.visaSince ?? s.since
  if (toPr !== null && g.year - since >= toPr) grantPr(g, `After ${g.year - since} years of protection, you were allowed to settle for good.`)
}

// --- life without papers ----------------------------------------------------------

function undocClock(g: GameState, st: ImmState): void {
  const c = g.character
  const country = getCountry(c.countryId)
  const yrs = g.year - st.arrived
  const held = citizenshipsOf(g)
  if (c.age < 18) return
  const am = AMNESTIES.find((a) => a.country === c.countryId && a.year === g.year && yrs >= a.minYears && (!a.origins || a.origins.some((o) => held.includes(o))) && (a.arrivedUnder === undefined || (st.arrivalAge ?? 99) < a.arrivedUnder))
  if (am) {
    const fee = nice(500 * destWealth(c.countryId))
    scriptChoice(g, AMNESTY, 'Amnesty!', `${country.flag} ${cap(place(country))} announced ${am.label}. People like you can come forward and get papers for ${money(fee)}.`, [
      { id: 'apply', label: 'Come forward and apply', emoji: '\u{1F4DD}' },
      { id: 'hide', label: 'Stay in the shadows', emoji: '\u{1F648}' },
    ], { emoji: '\u{1F4DC}', data: { result: am.result, label: am.label, fee, daca: am.arrivedUnder !== undefined } })
    return
  }
  if ((c.countryId === 'us' || c.countryId === 'pr') && held.includes('cu') && g.year >= 1966 && g.year <= 2016 && yrs >= 1) {
    grantPr(g, 'Under the Cuban Adjustment Act, Cubans who reach the US can settle after a year.')
    return
  }
  if (c.prison) return
  if (c.job && c.job.category === 'fulltime' && chance(g, 0.1)) {
    const title = c.job.title
    endJob(g, 'job', 'fired')
    log(g, `Immigration agents raided my workplace and I lost my job as ${title}.`, 'bad')
    if (chance(g, 0.4)) {
      deport(g, `Immigration agents raided your workplace and found you had no papers.`, 10)
      return
    }
    notice(g, 'Workplace Raid', `Immigration agents raided your workplace. You slipped out the back, but your boss let you go: no papers, no job.`, { emoji: '\u{1F6A8}', tone: 'bad' })
    return
  }
  let p = enforcement(c.countryId, g.year)
  if (c.criminalRecord.some((r) => r.convicted)) p *= 2.5
  if (married(g) && isCitizenOfCountry(g, c.countryId)) p *= 0.6
  if (chance(g, p)) deport(g, `Immigration agents caught up with you after ${yrs} year${yrs === 1 ? '' : 's'} without papers.`, 10)
}

function isCitizenOfCountry(g: GameState, countryId: string): boolean {
  const p = currentPartner(g)
  return !!p && expandCitizenships(personCitizenships(g, p), g.year).includes(countryId)
}

const AMNESTY = defineScript('imm.amnesty', (g, choice, data) => {
  const c = g.character
  const d = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, Json>) : {}
  if (!c.alive || c.prison || statusOf(g).status !== 'undocumented') return
  const country = getCountry(c.countryId)
  if (choice !== 'apply') {
    log(g, `I stayed hidden instead of applying for the amnesty in ${place(country)}.`, 'neutral')
    return
  }
  const fee = Math.max(0, num(d.fee))
  if (c.money < fee) {
    notice(g, 'Amnesty', `You couldn't scrape together the ${money(fee)} fee in time.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  c.money = Math.round(c.money - fee)
  const label = typeof d.label === 'string' ? d.label : 'the amnesty'
  if (d.result === 'permanent') {
    grantPr(g, `Thanks to ${label}, you finally have papers.`)
    return
  }
  const daca = d.daca === true
  setStatus(g, { status: 'visa', visa: daca ? 'daca' : 'amnesty', since: g.year, expires: g.year + 2 })
  updateImm(g, (s) => {
    s.visaSince = g.year
    s.entry = undefined
  })
  log(g, `I got papers in ${place(country)} through ${label}.`, 'good')
  notice(g, 'Papers at Last', `Thanks to ${label}, you have a residence permit${daca ? ' and a work permit (renewable every two years, though no path to a green card)' : ''}. No more looking over your shoulder.`, { emoji: '\u{1F4DC}', tone: 'good' })
})

// --- passports picked at adulthood -------------------------------------------------

function adultDualChoice(g: GameState, st: ImmState): void {
  const c = g.character
  if (st.dualDone || c.age < 18) return
  const held = citizenshipsOf(g)
  if (held.length < 2) return
  const strict = held.find((id) => dualRule(id, g.year) === 'no')
  if (!strict) return
  const deadline = strict === 'jp' ? 20 : 18
  if (c.age < deadline) return
  updateImm(g, (s) => (s.dualDone = true))
  const others = held.filter((id) => id !== strict).slice(0, 3)
  scriptChoice(g, DUAL, 'Pick a Passport', `${getCountry(strict).flag} ${cap(place(getCountry(strict)))} doesn't let adults keep two citizenships. Which passport do you keep?`, [
    { id: strict, label: `${getCountry(strict).demonym} (give up the rest)`, emoji: getCountry(strict).flag },
    ...others.map((id) => ({ id, label: `${getCountry(id).demonym} (give up ${getCountry(strict).demonym})`, emoji: getCountry(id).flag })),
  ], { emoji: '\u{1F6C2}', data: { strict } })
}

const DUAL = defineScript('imm.dual', (g, choice, data) => {
  const c = g.character
  const d = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, Json>) : {}
  const strict = typeof d.strict === 'string' ? d.strict : ''
  const held = citizenshipsOf(g)
  if (!strict || !held.includes(strict) || !held.includes(choice)) return
  c.citizenships = choice === strict ? [strict] : held.filter((id) => id !== strict)
  log(g, `I chose to keep my ${getCountry(choice).demonym} passport.`, 'neutral')
  remember(g, `Chose ${getCountry(choice).demonym} citizenship over the other.`)
  const s = statusOf(g)
  if (s.status !== 'citizen' && (!c.immigration || c.immigration.countryId !== c.countryId)) setStatus(g, { status: 'permanent', since: g.year })
})

// ---------------------------------------------------------------------------
// The yearly hook

/** Yearly hook (aging.ts, after finance): visas expire or renew, residency → citizenship. */
export function yearlyImmigration(g: GameState): void {
  const c = g.character
  migrate(g)
  if (!c.alive) return
  stampFamily(g)
  dissolveUnions(g)
  updateLocks(g)
  if (c.prison) {
    noteConvictions(g)
    return
  }
  const st0 = immState(g)
  if (st0.deportAfterRelease) {
    if (statusOf(g).status === 'citizen') updateImm(g, (s) => (s.deportAfterRelease = undefined))
    else {
      deport(g, 'Straight out of prison, immigration officers were waiting at the gate.', 10)
      return
    }
  }
  if (noteConvictions(g)) return
  for (const app of immState(g).apps.filter((a) => a.decide <= g.year)) resolvePending(g, app)
  const s = statusOf(g)
  const st = immState(g)
  if (s.status === 'visa') visaClock(g, s, st)
  else if (s.status === 'permanent') citizenshipClock(g, st)
  else if (s.status === 'asylum') asylumClock(g, s, st)
  else if (s.status === 'undocumented') undocClock(g, st)
  adultDualChoice(g, immState(g))
}

// ---------------------------------------------------------------------------
// For other modules

/** Why a job is off-limits to this character's immigration status (null when fine). */
export function legalWorkProblem(g: GameState, job: { category: string; edu?: string }): string | null {
  const s = statusOf(g)
  if (s.status === 'citizen' || s.status === 'permanent') return null
  const full = job.category === 'fulltime'
  if (s.status === 'undocumented') return full && job.edu !== undefined && job.edu !== 'none' ? 'Without papers, employers who check can\'t hire you. Only cash-in-hand work is open.' : null
  if (s.status === 'asylum' && s.visa === 'pending') return full ? 'Asylum seekers can only take part-time work while their claim is decided.' : null
  if (s.visa === 'student') return full ? 'Your student visa only allows part-time work.' : null
  if (s.visa === 'retire') return 'Your retirement visa doesn\'t allow you to work here.'
  return null
}
