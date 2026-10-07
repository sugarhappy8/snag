// Immigration state: passports, legal status where the character lives, the bookkeeping the
// yearly clock needs (arrival year, permanent-residency year, pending applications, bans,
// locked golden-visa money) and the family's citizenships. Reads are pure (safe in menus);
// writers mutate a draft. Everything lives in plain JSON: Character.citizenships,
// Character.immigration, Person.data.citizenships and g.flags.imm.
import { cvEntries } from '../cv'
import {
  BLOCS,
  ENGLISH_WORKPLACES,
  CRISES,
  EXIT_REGIMES,
  SCHENGEN,
  passportStrength,
  UNIONS,
  lawOf,
  stepAt,
  type Bloc,
  type Crisis,
  type ExitRegime,
  type ExitWindow,
  type Union,
} from '../data/immigration'
import { COUNTRIES, countryLabel, getCountry, type Continent, type Country } from '../world'
import type { Character, GameState, ImmigrationStatus, Json, Person } from '../types'

// ---------------------------------------------------------------------------
// Small JSON helpers

function rec(v: Json | undefined): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {}
}

function num(v: Json | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function optNum(v: Json | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function str(v: Json | undefined): string {
  return typeof v === 'string' ? v : ''
}

export function strList(v: Json | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
}

function isCountryId(id: string): boolean {
  return COUNTRIES.some((c) => c.id === id)
}

// ---------------------------------------------------------------------------
// Bookkeeping in g.flags.imm

export interface PendingApp {
  id: string
  dest: string
  /** Route key from immigration-routes (e.g. 'spouse', 'lottery:us-dv', 'family'). */
  key: string
  label: string
  filed: number
  decide: number
  odds: number
}

export interface ImmLock {
  assetId: string
  until: number
  program: string
  country: string
}

export interface ImmState {
  /** Year legal (or, for the undocumented, physical) residence began in the current country. */
  arrived: number
  /** Year permanent residency was granted here. */
  prSince?: number
  /** Year the current visa began. */
  visaSince?: number
  /** Program behind the current visa (investor, retirement, remote, guest...). */
  program?: string
  /** Last year a capped visa (guest worker, nomad, working holiday) can be renewed to. */
  maxUntil?: number
  /** How an undocumented resident got in. */
  entry?: 'border' | 'overstay'
  /** Age on arrival (DACA asks who came as a child). */
  arrivalAge?: number
  /** Asylum: the decision year and its odds. */
  asylumDecide?: number
  asylumOdds?: number
  apps: PendingApp[]
  /** Re-entry bans: country id → last banned year. */
  bans: Record<string, number>
  /** Convictions already weighed for deportation. */
  convictionsSeen: number
  deportAfterRelease?: boolean
  /** Don't offer citizenship again before this year. */
  citizenAsk?: number
  /** Last year an exit visa was granted (valid that year). */
  exitPermit?: number
  /** An exit visa stays good until this year for an application filed while it was valid. */
  exitUntil?: number
  /** Countries whose working holiday was used (once each). */
  whvUsed: string[]
  /** Unions whose break-up was processed. */
  unions: string[]
  /** The adult "pick one passport" question was settled. */
  dualDone?: boolean
  /** Degrees held when a student visa began (to spot graduation). */
  degreesAtVisa?: number
  /** Year the PR fee couldn't be paid (retry next year). */
  prDeferred?: number
}

const IMM_KEY = 'imm'

export function immState(g: GameState): ImmState {
  const r = rec(g.flags[IMM_KEY])
  const apps: PendingApp[] = []
  if (Array.isArray(r.apps)) {
    for (const a of r.apps) {
      const o = rec(a)
      const dest = str(o.dest)
      const key = str(o.key)
      if (!dest || !key) continue
      apps.push({ id: str(o.id) || `${dest}:${key}`, dest, key, label: str(o.label) || key, filed: num(o.filed, g.year), decide: num(o.decide, g.year), odds: Math.max(0, Math.min(1, num(o.odds, 0.5))) })
    }
  }
  const bans: Record<string, number> = {}
  for (const [k, v] of Object.entries(rec(r.bans))) if (typeof v === 'number' && Number.isFinite(v)) bans[k] = v
  const entry = str(r.entry)
  return {
    arrived: num(r.arrived, g.year - Math.max(0, g.character.age)),
    prSince: optNum(r.prSince),
    visaSince: optNum(r.visaSince),
    program: str(r.program) || undefined,
    maxUntil: optNum(r.maxUntil),
    entry: entry === 'border' || entry === 'overstay' ? entry : undefined,
    arrivalAge: optNum(r.arrivalAge),
    asylumDecide: optNum(r.asylumDecide),
    asylumOdds: optNum(r.asylumOdds),
    apps,
    bans,
    convictionsSeen: num(r.convictionsSeen, 0),
    deportAfterRelease: r.deportAfterRelease === true || undefined,
    citizenAsk: optNum(r.citizenAsk),
    exitPermit: optNum(r.exitPermit),
    exitUntil: optNum(r.exitUntil),
    whvUsed: strList(r.whvUsed),
    unions: strList(r.unions),
    dualDone: r.dualDone === true || undefined,
    degreesAtVisa: optNum(r.degreesAtVisa),
    prDeferred: optNum(r.prDeferred),
  }
}

export function saveImm(g: GameState, s: ImmState): void {
  const out: Record<string, Json> = {
    arrived: s.arrived,
    apps: s.apps.map((a) => ({ id: a.id, dest: a.dest, key: a.key, label: a.label, filed: a.filed, decide: a.decide, odds: a.odds })),
    bans: { ...s.bans },
    convictionsSeen: s.convictionsSeen,
    whvUsed: [...s.whvUsed],
    unions: [...s.unions],
  }
  const opt: [keyof ImmState, Json | undefined][] = [
    ['prSince', s.prSince],
    ['visaSince', s.visaSince],
    ['program', s.program],
    ['maxUntil', s.maxUntil],
    ['entry', s.entry],
    ['arrivalAge', s.arrivalAge],
    ['asylumDecide', s.asylumDecide],
    ['asylumOdds', s.asylumOdds],
    ['deportAfterRelease', s.deportAfterRelease],
    ['citizenAsk', s.citizenAsk],
    ['exitPermit', s.exitPermit],
    ['exitUntil', s.exitUntil],
    ['dualDone', s.dualDone],
    ['degreesAtVisa', s.degreesAtVisa],
    ['prDeferred', s.prDeferred],
  ]
  for (const [k, v] of opt) if (v !== undefined) out[k] = v
  g.flags[IMM_KEY] = out
}

export function updateImm(g: GameState, fn: (s: ImmState) => void): ImmState {
  const s = immState(g)
  fn(s)
  saveImm(g, s)
  return s
}

// ---------------------------------------------------------------------------
// Passports

/** Passports the character holds. Old saves: the birth country, plus where they live unless they snuck in. */
export function citizenshipsOf(g: GameState): string[] {
  const c = g.character
  const held = strList(c.citizenships as Json | undefined).filter(isCountryId)
  if (held.length) return [...new Set(held)]
  const birth = c.birthCountryId && isCountryId(c.birthCountryId) ? c.birthCountryId : c.countryId
  const out = [birth]
  if (c.countryId !== birth && g.flags.illegalImmigrant !== c.countryId) out.push(c.countryId)
  return out
}

function unionActive(u: Union, id: string, year: number): boolean {
  return u.members.some((m) => m.id === id && year >= m.from && (m.to === undefined || year <= m.to))
}

/** Held passports plus the countries they make you a citizen of that year (unions, territories). */
export function expandCitizenships(list: readonly string[], year: number): string[] {
  const out = new Set(list)
  for (const u of UNIONS) {
    if (!list.some((id) => unionActive(u, id, year))) continue
    for (const m of u.members) if (unionActive(u, m.id, year)) out.add(m.id)
  }
  return [...out]
}

/** The union two countries share in a year (null when none). */
export function unionBetween(a: string, b: string, year: number): Union | null {
  return UNIONS.find((u) => unionActive(u, a, year) && unionActive(u, b, year)) ?? null
}

export function unionName(u: Union, year: number): string {
  return stepAt(u.names, year)
}

export function isCitizenOf(g: GameState, countryId: string, year = g.year): boolean {
  return expandCitizenships(citizenshipsOf(g), year).includes(countryId)
}

/** Add a passport (mutates). */
export function grantCitizenship(g: GameState, countryId: string): void {
  if (!isCountryId(countryId)) return
  const list = citizenshipsOf(g)
  if (!list.includes(countryId)) list.push(countryId)
  g.character.citizenships = list
}

/** Give one up (mutates). Never leaves the character stateless. */
export function loseCitizenship(g: GameState, countryId: string): boolean {
  const list = citizenshipsOf(g)
  if (list.length <= 1 || !list.includes(countryId)) return false
  g.character.citizenships = list.filter((x) => x !== countryId)
  return true
}

/** The strongest passport held (the one you'd apply with). */
export function bestPassport(g: GameState, year = g.year): { id: string; strength: number } {
  let best = { id: citizenshipsOf(g)[0], strength: 0 }
  for (const id of expandCitizenships(citizenshipsOf(g), year)) {
    const s = passportStrength(id, year)
    if (s > best.strength) best = { id, strength: s }
  }
  return best
}

// ---------------------------------------------------------------------------
// Status where the character lives

export type StatusKind = ImmigrationStatus['status']

/** Legal status in the current country (citizen when the passport covers it). Pure. */
export function statusOf(g: GameState): ImmigrationStatus {
  const c = g.character
  if (isCitizenOf(g, c.countryId)) return { countryId: c.countryId, status: 'citizen', since: c.immigration?.countryId === c.countryId ? c.immigration.since : g.year - c.age }
  const s = c.immigration
  if (s && s.countryId === c.countryId) {
    if (s.status === 'citizen') return { countryId: c.countryId, status: 'citizen', since: s.since }
    return s
  }
  const st = immState(g)
  if (g.flags.illegalImmigrant === c.countryId) return { countryId: c.countryId, status: 'undocumented', since: st.arrived }
  // Old saves, heirs raised abroad, witness protection: settled residents.
  return { countryId: c.countryId, status: 'permanent', since: st.arrived }
}

/** Set the status in the current country (mutates); citizens carry no status record. */
export function setStatus(g: GameState, status: Omit<ImmigrationStatus, 'countryId'>): void {
  const c = g.character
  if (status.status === 'citizen') {
    delete c.immigration
    return
  }
  const s: ImmigrationStatus = { countryId: c.countryId, status: status.status, since: status.since }
  if (status.visa) s.visa = status.visa
  if (typeof status.expires === 'number') s.expires = status.expires
  c.immigration = s
  if (status.status === 'undocumented') g.flags.illegalImmigrant = c.countryId
  else if (g.flags.illegalImmigrant === c.countryId) delete g.flags.illegalImmigrant
}

export function yearsHere(g: GameState): number {
  return Math.max(0, g.year - immState(g).arrived)
}

export function isBanned(g: GameState, countryId: string): number | null {
  const until = immState(g).bans[countryId]
  return typeof until === 'number' && until >= g.year ? until : null
}

// ---------------------------------------------------------------------------
// The family's passports

/** A person's citizenships (stamped in Person.data.citizenships, else a sensible guess). */
export function personCitizenships(g: GameState, p: Person): string[] {
  const held = strList(p.data.citizenships).filter(isCountryId)
  if (held.length) return held
  const where = typeof p.data.countryId === 'string' && isCountryId(p.data.countryId) ? p.data.countryId : g.character.countryId
  if (p.relation === 'parent' || p.relation === 'sibling' || p.relation === 'grandparent' || p.relation === 'halfSibling') {
    const birth = g.character.birthCountryId
    return [birth && isCountryId(birth) ? birth : where]
  }
  if (p.relation === 'child' || p.relation === 'stepchild' || p.relation === 'grandchild') return childCitizenships(g, p, where)
  return [where]
}

/** Citizenship by descent from the player (and the other parent) plus birthright where born. */
export function childCitizenships(g: GameState, p: Person, bornIn: string): string[] {
  const out = new Set<string>()
  // Children (adopted ones too) and grandchildren inherit the player's passports by descent.
  if (p.relation === 'child' || p.relation === 'grandchild') for (const id of citizenshipsOf(g)) out.add(id)
  const other = p.otherParentId ? g.people.find((x) => x.id === p.otherParentId) : undefined
  if (other) for (const id of strList(other.data.citizenships)) if (isCountryId(id)) out.add(id)
  const rule = stepAt(lawOf(bornIn).soli, g.year - Math.max(0, p.age))
  const settled = isCitizenOf(g, bornIn) || statusOf(g).status === 'permanent'
  if (rule === 0 || (rule !== null && settled && yearsHere(g) >= rule) || isCitizenOf(g, bornIn)) out.add(bornIn)
  if (out.size === 0) out.add(bornIn)
  return [...out]
}

export function stampPerson(p: Person, list: string[]): void {
  p.data.citizenships = [...new Set(list.filter(isCountryId))]
}

/** Passports an heir inherits from the late player (life.ts continueAsChild). */
export function heirCitizenships(g: GameState, child: Person): string[] {
  const stamped = strList(child.data.citizenships).filter(isCountryId)
  if (stamped.length) return stamped
  const where = typeof child.data.countryId === 'string' && isCountryId(child.data.countryId) ? child.data.countryId : g.character.countryId
  return childCitizenships(g, child, where)
}

// ---------------------------------------------------------------------------
// Blocs, unions, exit regimes, crises

export function blocName(b: Bloc, year: number): string {
  return stepAt(b.names, year)
}

function memberIn(b: Bloc, id: string, year: number): boolean {
  return b.members.some((m) => m.id === id && year >= m.from && (m.to === undefined || year <= m.to))
}

export interface BlocAccess {
  bloc: Bloc
  /** First year the destination opens to this passport, when transitional rules still apply. */
  limitedUntil?: number
  via: string
}

/** Blocs that let these passports move to `dest` this year. */
export function blocAccess(passports: readonly string[], dest: string, year: number): BlocAccess[] {
  const out: BlocAccess[] = []
  for (const b of BLOCS) {
    if (b.into) {
      // Directional blocs: members may move INTO these countries only.
      if (!b.into.includes(dest)) continue
      const via = passports.find((p) => p !== dest && memberIn(b, p, year))
      if (via) out.push({ bloc: b, via })
      continue
    }
    if (!memberIn(b, dest, year)) continue
    const vias = passports.filter((p) => p !== dest && memberIn(b, p, year))
    if (!vias.length) continue
    // Transitional limits bite only when every qualifying passport is still limited here.
    const limits = vias.map((p) => (b.transitions ?? []).find((t) => t[0] === p && t[1] === dest && t[2] > year))
    const limitedUntil = limits.every((t) => !!t) ? Math.min(...limits.map((t) => (t ? t[2] : year))) : undefined
    out.push({ bloc: b, via: vias[0], limitedUntil })
  }
  return out
}

export function inSchengen(countryId: string, year: number): boolean {
  return SCHENGEN.some(([id, from]) => id === countryId && year >= from)
}

export function exitRegime(countryId: string, year: number): ExitRegime | null {
  return EXIT_REGIMES.find((r) => r.countries.includes(countryId) && year >= r.from && year <= r.to) ?? null
}

/** Holds a valid exit visa this year (granted this year, or kept alive by a pending application). */
export function hasExitPermit(g: GameState): boolean {
  const st = immState(g)
  return st.exitPermit === g.year || (st.exitUntil !== undefined && st.exitUntil >= g.year)
}

/** Can't leave without an exit visa (and doesn't have one). */
export function exitBlocked(g: GameState): boolean {
  return !!exitRegime(g.character.countryId, g.year) && !hasExitPermit(g)
}

export function exitWindow(r: ExitRegime, year: number): ExitWindow | null {
  return r.windows?.find((w) => year >= w.from && year <= w.to) ?? null
}

/** The worst crisis in a country this year (null when calm). */
export function crisisIn(countryId: string, year: number): Crisis | null {
  let worst: Crisis | null = null
  for (const c of CRISES) if (c.country === countryId && year >= c.from && year <= c.to && (!worst || c.severity > worst.severity)) worst = c
  return worst
}

export function continentOf(countryId: string): Continent {
  return getCountry(countryId).continent
}

// ---------------------------------------------------------------------------
// Languages

const LEVEL_WORDS = ['Beginner', 'Elementary', 'Conversational', 'Fluent']

/** 0 none … 3 fluent/native. */
export function languageLevel(g: GameState, lang: string): number {
  const c: Character = g.character
  let best = 0
  if (lawOf(c.birthCountryId || c.countryId).lang === lang) return 3
  for (const id of citizenshipsOf(g)) if (lawOf(id).lang === lang) best = Math.max(best, 2)
  // Where English is the language of school and work (India, Nigeria, the Philippines...), people grow up with it.
  if (lang === 'English' && [c.birthCountryId, ...citizenshipsOf(g)].some((id) => !!id && ENGLISH_WORKPLACES.includes(id))) best = Math.max(best, 2)
  if (lawOf(c.countryId).lang === lang) {
    const yrs = yearsHere(g)
    if (yrs >= 6) best = Math.max(best, 3)
    else if (yrs >= 3) best = Math.max(best, 2)
    else if (yrs >= 1) best = Math.max(best, 1)
  }
  for (const e of cvEntries(g)) {
    if (e.source !== `language:${lang}`) continue
    const i = LEVEL_WORDS.findIndex((w) => e.title.endsWith(`(${w})`))
    best = Math.max(best, i >= 2 ? i : 1)
  }
  return best
}

// ---------------------------------------------------------------------------
// Words

/** A country as it reads mid-sentence: "the United States", "France". */
export function place(country: Country): string {
  return countryLabel(country)
}

/** "an investor visa", "a Ukrainian citizen", "an American". */
export function an(word: string): string {
  return `${/^[aeiou]/i.test(word) && !/^(eu|uk|ug|ur|uni|use)/i.test(word) ? 'an' : 'a'} ${word}`
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export const VISA_LABELS: Record<string, string> = {
  work: 'work visa',
  skilled: 'skilled migrant visa',
  jobseeker: 'job-seeker visa',
  guest: 'guest-worker permit',
  student: 'student visa',
  graduate: 'graduate work visa',
  whv: 'working holiday visa',
  spouse: 'spouse visa',
  fiance: 'fiancé(e) visa',
  family: 'family visa',
  investor: 'investor visa',
  retire: 'retirement visa',
  remote: 'remote-worker visa',
  free: 'free-movement residence',
  bloc: 'regional residence permit',
  tasman: 'special category visa',
  bno: 'BN(O) visa',
  amnesty: 'regularized residence permit',
  daca: 'DACA permit',
  protection: 'temporary protection',
  refugee: 'refugee status',
  pending: 'pending asylum claim',
}

export function visaLabel(visa: string | undefined): string {
  return (visa && VISA_LABELS[visa]) || 'visa'
}

/** "work visa (renew in 2031)", "permanent resident", "undocumented"... */
export function statusLabel(s: ImmigrationStatus): string {
  switch (s.status) {
    case 'citizen':
      return 'citizen'
    case 'permanent':
      return 'permanent resident'
    case 'asylum':
      return s.visa === 'pending' ? 'asylum seeker' : visaLabel(s.visa)
    case 'undocumented':
      return 'undocumented'
    default:
      return `${visaLabel(s.visa)}${typeof s.expires === 'number' ? ` (renew in ${s.expires})` : ''}`
  }
}
