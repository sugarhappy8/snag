// The narrator persona, style guide and a compact game-state serializer for prompts.
//
// Local models have small context windows, so everything here is terse: the whole
// prompt (system + context + task) stays well under ~2,500 tokens. Nothing in this file
// mutates the game state — it only reads the frozen snapshot from the store.
import { businessSummary } from '../game/business'
import { computerSummary } from '../game/computer'
import { gameDevSummary } from '../game/special/gamedev'
import { abuseSummary } from '../game/special/politics'
import { sportsSummary } from '../game/special/sports'
import { formatMoney, fullName, lifeStage, netWorth, relationLabel, roleLabel, shortMoney } from '../game/core'
import { cvPromptLines, cvSummary, graduateTarget, jobTarget, rankLabel, rankOf, universityTarget, type CvTarget } from '../game/cv'
import { getJobDef, type GradKey } from '../game/data/jobs'
import { localeOf, type LocaleProfile } from '../game/data/locales'
import { marketOf } from '../game/data/markets'
import { investmentsSummary } from '../game/investments'
import { luxurySummary } from '../game/shops/luxury'
import { talentsSummary } from '../game/talents'
import { getCountry } from '../game/world'
import type { ChoiceModal, GameState, InterviewJob, LifeStage, NoticeModal, Person, RelationKind, SchoolLevel, ScreeningApp } from '../game/types'
import type { ContentRating, Settings } from '../settings'
import { truncate } from './schemas'

// ---------------------------------------------------------------------------
// Persona & rules

const RATING_RULES: Record<ContentRating, string> = {
  family:
    'Content: FAMILY-FRIENDLY. Gentle humor. No drugs, alcohol, gore, crime glorification or romance beyond a crush; deaths happen off-screen and gently.',
  teen:
    'Content: TEEN, like the classic mobile life sims. Dark humor is welcome; crime, alcohol, dating, breakups and accidents are fine; violence is never graphic and romance fades to black.',
  mature:
    'Content: MATURE. Edgier dark humor, drugs, crime and blunt language are allowed, but nothing graphic.',
}

export function ratingRule(rating: ContentRating): string {
  return `${RATING_RULES[rating] ?? RATING_RULES.teen} Never sexually explicit. No slurs or hate. Never mention real game brands.`
}

/** The narrator persona shared by every task. */
export function narratorSystem(settings: Settings): string {
  return [
    'You are the narrator of AnotherLife, a darkly funny text life simulator where one person lives from birth to death a year at a time.',
    'VOICE:',
    '- Popups talk to the player in second person ("You..."): witty, punchy, specific, 1-3 short sentences.',
    '- Life-log lines are first person, past tense, max 15 words: "I got my head stuck in the stair railing." "I got food poisoning from week-old leftovers."',
    '- Choices are 2-4 short imperative labels, max 6 words ("Ignore them", "Call the cops", "Lick it"), an emoji only sometimes.',
    '- Use real names from the context; invent believable new names that fit their country.',
    '- SETTING: their country (PLACE; the new one after emigrating) and its culture (LOCAL LIFE) for places, schools, institutions, holidays, food, weather, faith and money. Nothing American unless they live in the US.',
    '- Never contradict the facts in the context. Keep it plausible for the character\'s age and situation.',
    `- ${ratingRule(settings.contentRating)}`,
    'OUTPUT: reply with ONE JSON object only. No markdown, no code fences, no commentary.',
  ].join('\n')
}

/** What kind of events suit each stage of life (keeps toddlers away from tax fraud). {high} is the local name of high school. */
export const STAGE_RULES: Record<LifeStage | 'prison', string> = {
  baby: 'They are a baby: only baby things (feeding, crying, toys, bath time, pets, visitors, first words). Choices are baby actions like "Cry", "Giggle", "Bite it".',
  toddler: 'They are a toddler: simple kid things (playground, tantrums, pets, siblings, preschool, food, bedtime). Choices are toddler actions.',
  child: 'They are a child: school, playground, siblings, pets, classmates, bullies, field trips, hobbies. No romance, alcohol, drugs or jobs.',
  teen: 'They are a teenager: {high} drama, crushes, parties, peer pressure, part-time jobs, driving, social media, family fights.',
  adult: 'They are an adult: work, money, dating, family, neighbors, strangers, health, opportunities and temptations.',
  elder: 'They are elderly: grandkids, retirement, health, scams, old friends, nostalgia, legacy.',
  prison: 'They are IN PRISON: everything happens inside prison (cellmates, guards, gangs, riots, contraband, the yard, visitors, prison jobs).',
}

/** The stage rule with the local school words filled in. */
export function stageRule(g: GameState, stage: LifeStage | 'prison' = stageOf(g)): string {
  return STAGE_RULES[stage].replace('{high}', localeOf(g.character.countryId).terms.high || 'school')
}

/**
 * Theme suggestions for random events, by stage. The director picks one per year and fills
 * the {tokens} from the player's locale with localizeTheme (deterministically, no RNG).
 */
export const EVENT_THEMES: Record<LifeStage | 'prison', string[]> = {
  baby: ['mealtime', 'a new toy', 'bath time', 'a doctor visit', 'the family pet', 'a stranger at the park', 'first words', 'bedtime', 'a car ride', 'a visiting relative', 'the noise of {holiday}'],
  toddler: ['the playground', 'a pet', 'a sibling squabble', 'a tantrum at the store', 'preschool', 'a family trip', 'a scary noise at night', 'vegetables', 'drawing on the walls', 'a birthday party', 'a bug in the yard', 'a ride on {transport}'],
  child: ['a classmate', 'a bully', 'a field trip to {landmark}', 'a pet', 'a sibling', 'a lost wallet', 'a dare', 'a {sport} tryout', 'a school play', 'a neighbor', 'a family trip to {getaway}', 'an animal encounter', 'a talent show', 'breaking something at home', '{kidStand}', 'a substitute teacher', '{holiday} with the family', '{weather}'],
  teen: ['a crush', 'a house party', 'peer pressure', 'a part-time job', 'a driving lesson', 'social media drama', 'a sibling', 'a teacher', '{schoolDance}', 'studying for {finalExam}', 'a stranger', 'the {sport} team', 'a school club', 'a rebellious idea', 'a family argument', 'a viral video', 'a cheating scandal', 'hanging out at {hangout}'],
  adult: ['a coworker', 'the boss', 'a neighbor', 'a stranger encounter', 'an animal encounter', 'a money opportunity', 'a scam', 'a friend in trouble', 'romance', 'a family member', 'a health scare', 'witnessing a crime', 'a lucky find', 'a celebrity sighting', 'a road-rage incident', 'a wedding invitation', 'a mysterious package', 'someone in danger', 'a home repair disaster', 'a protest', 'a pyramid scheme pitch', 'plans for {holiday}', 'a big {sport} match', 'a commute on {transport}'],
  elder: ['grandchildren', 'retirement life', 'a health scare', 'a scam phone call', 'an old friend', 'a reunion', 'a hobby', 'a neighbor', 'a stranger', 'technology trouble', 'a long-lost relative', 'a doctor visit', '{holiday} with the family'],
  prison: ['a cellmate', 'a guard', 'gang recruitment', 'contraband', 'a riot brewing', 'the prison yard', 'cafeteria food', 'a visitor', 'a snitch', 'a prison job', 'a fight', 'a parole rumor', 'the prison library'],
}

/** Theme token → locale list, and the word used when a country has no data for it. */
const THEME_FIELDS: Record<string, [keyof LocaleProfile, string]> = {
  holiday: ['holidays', 'the holidays'],
  sport: ['sports', 'sports'],
  getaway: ['getaways', 'the countryside'],
  landmark: ['landmarks', 'a museum'],
  hangout: ['hangouts', 'the park'],
  transport: ['transport', 'the bus'],
  food: ['foods', 'dinner'],
}

/**
 * Fill a theme's {tokens} with the player's local words. Pure: `r` (0-1) picks the word, so the
 * same roll always gives the same theme.
 */
export function localizeTheme(theme: string, countryId: string, r = 0): string {
  const loc = localeOf(countryId)
  return theme
    .replace(/\{(\w+)\}/g, (whole, key: string) => {
      if (key === 'schoolDance') return loc.terms.schoolDance || 'the end-of-year party'
      if (key === 'finalExam') return loc.terms.finalExam || 'the final exams'
      if (key === 'kidStand') return countryId === 'us' ? 'a lemonade stand' : 'selling snacks to the neighbors'
      if (key === 'weather') return loc.snow ? 'a snow day' : loc.climate === 'tropical' ? 'a rainy-season downpour' : loc.climate === 'arid' ? 'a scorching heatwave' : 'a wild storm'
      const spec = THEME_FIELDS[key]
      if (!spec) return whole
      const raw = loc[spec[0]]
      const list = Array.isArray(raw) ? raw.filter((w): w is string => typeof w === 'string' && w.length > 0) : []
      return list.length ? list[Math.floor(r * 7919) % list.length] : spec[1]
    })
    .replace(/\s*\{\w+\}/g, '')
}

export function stageOf(g: GameState): LifeStage | 'prison' {
  return g.character.prison ? 'prison' : lifeStage(g.character.age)
}

/** Situational themes that suit this life right now (weighted into the pick). */
export function situationalThemes(g: GameState): string[] {
  const c = g.character
  if (c.prison) return []
  const out: string[] = []
  const alive = g.people.filter((p) => p.alive)
  if (c.job) out.push(`work as a ${c.job.title}`)
  if (c.education.current && c.age >= 5) out.push('school')
  if (alive.some((p) => p.relation === 'partner' || p.relation === 'spouse' || p.relation === 'fiance')) out.push('their partner')
  if (alive.some((p) => p.relation === 'child') && c.age >= 18) out.push('their kids')
  if (alive.some((p) => p.relation === 'pet')) out.push('their pet')
  if (c.money > 100_000) out.push('being rich')
  if (c.money < 0 || c.residence.status === 'homeless') out.push('being broke')
  if (c.hidden.fame > 50) out.push('fame')
  return out
}

/** Guidance for the effects object (shared by outcome-style tasks). */
export function effectsGuide(g: GameState): string {
  const cash = g.character.money
  const typical = Math.max(50, Math.min(25_000, Math.round(Math.abs(cash) * 0.05 + 100)))
  return [
    'EFFECTS (integers, 0 = no change):',
    '- happiness/health/smarts/looks/karma: usually ±2 to ±15 (±20 only for huge moments). fame: 0 unless it would make news.',
    `- money in dollars: negative = cost/loss, positive = gain. Keep it small relative to their cash (${formatMoney(cash)}); around ±${formatMoney(typical)} is typical. Never cost more than they have.`,
    '- relationships: [{"name","delta"}] only for people listed in PEOPLE (delta ±2 to ±20).',
    '- newPerson.relation "none" unless someone new enters their life (friend, enemy, partner, lover, pet, coworker, classmate); give a first name.',
    '- condition.kind "none" unless they get hurt, sick, addicted or traumatized (severity 5-60).',
    '- arrest.crime "" unless they are caught committing a crime (severity 1 petty ... 5 murder).',
    '- death "" unless the choice was truly lethal; then a short cause like "Shark Attack". Very rare.',
    '- memory: one short NEW line worth remembering for years (not already in MEMORIES), or "".',
  ].join('\n')
}

const EFFECTS_EXAMPLE =
  '{"happiness":0,"health":0,"smarts":0,"looks":0,"karma":0,"fame":0,"money":0,"relationships":[],"newPerson":{"relation":"none","name":"","gender":"any","age":0,"species":""},"condition":{"name":"","kind":"none","severity":0},"arrest":{"crime":"","severity":0},"death":"","memory":""}'

// ---------------------------------------------------------------------------
// Context serializer

function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\p{Ll})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
}

/** What each school level is called where the player lives ("Elementary School" in the US, "Primary School" elsewhere...). */
export function schoolLabels(countryId: string): Record<SchoolLevel, string> {
  const t = localeOf(countryId).terms
  return {
    preschool: 'Preschool',
    elementary: titleCase(t.primary || 'primary school'),
    middle: titleCase(t.middle || 'middle school'),
    high: titleCase(t.high || 'secondary school'),
    community: countryId === 'us' ? 'Community College' : 'Vocational College',
    university: titleCase(t.university || 'university'),
    graduate: 'Graduate School',
  }
}

const PROGRAM_LABELS: Record<string, string> = {
  law: 'Law School',
  medical: 'Medical School',
  business: 'Business School',
  dental: 'Dental School',
  nursing: 'Nursing School',
  pharmacy: 'Pharmacy School',
  veterinary: 'Vet School',
  phd: 'PhD Program',
}

const HOME_LABELS: Record<string, string> = {
  parents: 'lives with their parents',
  owned: 'owns their home',
  renting: 'rents a place',
  homeless: 'HOMELESS',
  dorm: 'lives in a student dorm',
  prison: 'lives in a prison cell',
  military: 'lives on a military base',
  partner: "lives at their partner's place",
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function schoolLine(g: GameState): string | null {
  const e = g.character.education.current
  if (!e) return null
  const labels = schoolLabels(g.character.countryId)
  const level = e.level === 'graduate' && e.program ? (PROGRAM_LABELS[e.program] ?? labels.graduate) : (labels[e.level] ?? e.level)
  const major = e.major ? `, major ${e.major}` : ''
  return `SCHOOL: ${level} year ${e.year}/${e.totalYears} at ${e.school}${major}, grades ${Math.round(e.grades)}%`
}

/** The faith most people here share ("mostly Islam", "Christianity/Islam", "mostly not religious"). */
function mainFaith(religions: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const r of religions) counts.set(r, (counts.get(r) ?? 0) + 1)
  const ranked = [...counts].sort((a, b) => b[1] - a[1])
  if (!ranked.length) return ''
  const [top, n] = ranked[0]
  const second = ranked.find(([name]) => name !== top && name !== 'None')
  if (top === 'None') return second && second[1] >= n * 0.6 ? `mixed: not religious/${second[0]}` : 'mostly not religious'
  return second && second[1] >= n * 0.6 ? `${top}/${second[0]}` : `mostly ${top}`
}

function firstFew(list: readonly string[] | undefined, n: number): string {
  return Array.isArray(list) ? list.filter(Boolean).slice(0, n).join(', ') : ''
}

/**
 * One compact line about everyday life in the player's country (from data/locales.ts), so the
 * narrator writes an Indonesian childhood with SD and Eid, not an American one with prom and
 * Thanksgiving. School words only while school matters to them.
 */
export function localLifeLine(g: GameState): string {
  const c = g.character
  const country = getCountry(c.countryId)
  const loc = localeOf(c.countryId)
  const t = loc.terms
  const parts: string[] = []
  const add = (label: string, list: readonly string[] | undefined, n: number) => {
    const words = firstFew(list, n)
    if (words) parts.push(`${label} ${words}`)
  }
  const faith = mainFaith(country.religions)
  if (c.prison) {
    // Inside, only the calendar and the food from home still matter.
    add('holidays', loc.holidays, 2)
    add('food from home', loc.foods, 2)
    if (faith) parts.push(faith)
    return `LOCAL LIFE (${country.name}): ${parts.join('; ')}`
  }
  const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild' || p.relation === 'grandchild'))
  if (c.age < 26 || kids.some((k) => k.age >= 4 && k.age <= 18)) {
    const stages = [t.primary, t.middle, t.high, t.university].filter(Boolean).join(' > ')
    // The exam and the dance only while someone is about to face them.
    const teen = (c.age >= 11 && c.age <= 20) || kids.some((k) => k.age >= 13 && k.age <= 18)
    const school = [stages && `school ${stages}`, teen && t.finalExam && `big exam ${t.finalExam}`, teen && t.schoolDance].filter(Boolean)
    if (school.length) parts.push(school.join(', '))
  }
  add('holidays', loc.holidays, 3)
  add('food', loc.foods, 3)
  add('sports', loc.sports, 2)
  add('transport', loc.transport, 2)
  add('hangouts', loc.hangouts, 2)
  parts.push(`${loc.climate}, ${loc.snow ? 'snowy winters' : 'no snow'}`)
  if (faith) parts.push(faith)
  parts.push(`${country.universalHealthcare ? 'public healthcare' : 'healthcare costs money'}; uni ${country.freeUniversity ? 'free' : 'tuition'}${t.emergencyNumber ? `; emergency ${t.emergencyNumber}` : ''}`)
  return `LOCAL LIFE (${country.name}): ${parts.join('; ')}`
}

/** The character sheet: who they are and their situation right now. */
export function describeCharacter(g: GameState): string {
  const c = g.character
  const country = getCountry(c.countryId)
  const lines: string[] = []
  const stage = lifeStage(c.age)
  const sexuality = c.age >= 13 ? `, ${c.sexuality}` : ''
  lines.push(`NAME: ${fullName(c)} (${c.gender}, age ${c.age}, ${stage}${sexuality})${c.alive ? '' : ' — DECEASED'}`)
  const born = c.birthCountryId && c.birthCountryId !== c.countryId ? ` (born in ${getCountry(c.birthCountryId).name})` : ''
  lines.push(`PLACE: ${c.city}, ${country.name}${born} · year ${g.year} · ${c.zodiac}${c.religion ? ` · ${c.religion}` : ''}`)
  lines.push(localLifeLine(g))
  const s = c.stats
  lines.push(`STATS: Happiness ${s.happiness}, Health ${s.health}, Smarts ${s.smarts}, Looks ${s.looks}`)
  const h = c.hidden
  lines.push(
    `HIDDEN: Karma ${h.karma}, Craziness ${h.craziness}, Willpower ${h.willpower}, Discipline ${h.discipline}, Athleticism ${h.athleticism}, Fame ${h.fame}, Notoriety ${h.notoriety}, Religiousness ${h.religiousness}`,
  )
  const debt = c.loans.reduce((sum, l) => sum + l.balance, 0)
  lines.push(`MONEY: ${formatMoney(c.money)} cash, net worth ${shortMoney(netWorth(g))}${debt > 0 ? `, debts ${shortMoney(debt)}` : ''}`)
  lines.push(`ROLE: ${roleLabel(g)}`)

  if (c.prison) {
    const p = c.prison
    const term = p.deathRow ? 'on DEATH ROW' : p.life ? 'serving LIFE' : `serving ${p.sentenceYears} yrs (${p.yearsServed} served)`
    lines.push(`PRISON: ${term} for ${p.crime} at ${p.name} (${p.security} security), respect ${p.respect}%${p.gang ? `, gang: ${p.gang}` : ''}`)
  }
  const school = schoolLine(g)
  if (school) lines.push(school)
  const job = c.job
  if (job) lines.push(`JOB: ${job.title} at ${job.company}, ${formatMoney(job.salary)}/yr, performance ${Math.round(job.performance)}%, ${job.yearsAtCompany} yrs there`)
  const pt = c.partTimeJob
  if (pt) lines.push(`PART-TIME JOB: ${pt.title} at ${pt.company}, ${formatMoney(pt.salary)}/yr`)
  if (!job && c.retired) lines.push(`RETIRED${c.pension > 0 ? `, pension ${formatMoney(c.pension)}/yr` : ''}`)
  if (c.careerHistory.length > 0 && !job) {
    const last = c.careerHistory[c.careerHistory.length - 1]
    lines.push(`LAST JOB: ${last.title} at ${last.company} (${last.reason})`)
  }
  const degrees = c.education.degrees.map((d) => d.name)
  if (degrees.length) lines.push(`EDUCATION: ${degrees.slice(-3).join('; ')}`)
  else if (c.education.droppedOut.length && c.age >= 16) lines.push(`EDUCATION: dropped out of ${c.education.droppedOut.map((l) => schoolLabels(c.countryId)[l] ?? l).join(', ')}`)

  let home = HOME_LABELS[c.residence.status] ?? c.residence.status
  if (c.residence.status === 'renting' && c.residence.rent) home += ` (${formatMoney(c.residence.rent)}/yr)`
  if (c.residence.description) home += ` — ${c.residence.description}`
  if (!c.prison) lines.push(`HOME: ${home}`)

  const conditions = c.conditions.filter((x) => x.diagnosed).map((x) => `${x.name} (${x.kind})`)
  const hidden = c.conditions.filter((x) => !x.diagnosed).length
  if (conditions.length || hidden) lines.push(`HEALTH ISSUES: ${[...conditions, hidden ? 'feels unwell lately' : ''].filter(Boolean).join(', ')}`)
  if (c.licenses.length) lines.push(`LICENSES: ${c.licenses.join(', ')}`)
  else if (c.age >= 15) lines.push('LICENSES: none (no driver\'s license)')
  const talents = talentsSummary(g)
  if (talents) lines.push(talents)
  if (c.age >= 12) {
    const cv = cvSummary(g, 5)
    if (cv) lines.push(`CV HIGHLIGHTS: ${cv}`)
  }
  if (c.social) lines.push(`SOCIAL MEDIA: @${c.social.handle} on ${c.social.platform}, ${c.social.followers.toLocaleString('en-US')} followers${c.social.verified ? ', verified' : ''}`)
  if (g.assets.length) {
    const assets = [...g.assets].sort((a, b) => b.value - a.value).slice(0, 5)
    lines.push(`ASSETS: ${assets.map((a) => `${a.name} (${shortMoney(a.value)})`).join(', ')}`)
  }
  const business = businessSummary(g)
  if (business) lines.push(`BUSINESS: ${business}`)
  const portfolio = investmentsSummary(g)
  if (portfolio) lines.push(`INVESTMENTS: ${portfolio}`)
  const gamedev = gameDevSummary(g)
  if (gamedev) lines.push(`GAME INDUSTRY: ${gamedev}`)
  const sports = sportsSummary(g)
  if (sports) lines.push(`SPORTS: ${sports}`)
  const abuse = abuseSummary(g)
  if (abuse) lines.push(abuse)
  const computer = computerSummary(g)
  if (computer) lines.push(`AT THE COMPUTER: ${computer}`)
  const luxury = luxurySummary(g)
  if (luxury) lines.push(`LUXURY LIFESTYLE: ${luxury}`)
  if (c.age >= 16 && !c.prison) {
    const m = marketOf(c.countryId)
    lines.push(`LOCAL ECONOMY: ${m.currencyName}, ${m.salesTaxName} ${Math.round(m.salesTax * 100)}%, inflation ${Math.round(m.inflation * 100)}%. ${m.businessNote}`)
  }
  if (c.criminalRecord.length) {
    const crimes = c.criminalRecord.slice(-3).map((r) => `${r.crime}${r.convicted ? ' (convicted)' : r.caught ? ' (arrested)' : ''}`)
    lines.push(`CRIMINAL RECORD: ${c.criminalRecord.length} crime(s): ${crimes.join(', ')}`)
  }
  if (c.wantedLevel > 0) lines.push(`WANTED by police (level ${c.wantedLevel})`)
  return lines.join('\n')
}

const RELATION_WEIGHT: Partial<Record<RelationKind, number>> = {
  spouse: 100,
  fiance: 98,
  partner: 96,
  parent: 88,
  child: 86,
  stepparent: 70,
  bestFriend: 78,
  sibling: 72,
  lover: 70,
  pet: 62,
  boss: 58,
  cellmate: 60,
  enemy: 50,
  friend: 52,
  grandparent: 45,
  halfSibling: 50,
  stepsibling: 40,
  stepchild: 70,
  grandchild: 55,
  teacher: 30,
  coworker: 34,
  classmate: 32,
  ex: 26,
  exSpouse: 30,
}

const GROUP_OF: Partial<Record<RelationKind, string>> = { classmate: 'school', teacher: 'school', coworker: 'work', boss: 'work', friend: 'friends', cellmate: 'prison', ex: 'exes', exSpouse: 'exes' }
const GROUP_CAP: Record<string, number> = { school: 3, work: 3, friends: 4, prison: 3, exes: 2 }

function personScore(g: GameState, p: Person, recentText: string): number {
  let score = RELATION_WEIGHT[p.relation] ?? 20
  if (!p.alive) score = 6
  if (p.livesWithPlayer) score += 8
  if (p.relationship >= 90 || p.relationship <= 15) score += 6
  if (recentText.includes(p.firstName.toLowerCase())) score += 18
  if (g.character.prison && p.relation === 'cellmate') score += 20
  if ((p.relation === 'classmate' || p.relation === 'teacher') && !g.character.education.current) score -= 20
  if ((p.relation === 'coworker' || p.relation === 'boss') && !g.character.job) score -= 20
  return score
}

/** The most relevant people for the prompt (alive first; a couple of dead relatives at most). */
export function selectPeople(g: GameState, max = 12, focusId?: string): Person[] {
  const recent = recentLogLines(g, 8).join(' ').toLowerCase()
  const ranked = [...g.people]
    .map((p) => ({ p, s: p.id === focusId ? 1000 : personScore(g, p, recent) }))
    .sort((a, b) => b.s - a.s)
  const out: Person[] = []
  const perGroup = new Map<string, number>()
  let dead = 0
  for (const { p } of ranked) {
    const focus = p.id === focusId
    if (!p.alive) {
      if (dead >= 2 && !focus) continue
      dead++
    }
    // Don't let a class of 25 crowd out the family.
    const group = GROUP_OF[p.relation] ?? p.relation
    const used = perGroup.get(group) ?? 0
    if (!focus && p.alive && used >= (GROUP_CAP[group] ?? 99)) continue
    perGroup.set(group, used + 1)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}

/** The name the AI should use for this person (first name unless ambiguous). */
export function personHandle(p: Person, among: Person[]): string {
  if (p.relation === 'pet' || !p.lastName) return p.firstName
  const clash = among.some((o) => o.id !== p.id && o.firstName.toLowerCase() === p.firstName.toLowerCase())
  return clash ? fullName(p) : p.firstName
}

function moodWord(rel: number): string {
  if (rel >= 85) return 'adores you'
  if (rel >= 65) return 'likes you'
  if (rel >= 40) return 'so-so'
  if (rel >= 20) return 'dislikes you'
  return 'hates you'
}

/** One compact line per person. */
export function describePerson(p: Person, among: Person[], withNotes = true): string {
  const handle = personHandle(p, among)
  const name = p.relation === 'pet' ? `${p.firstName} (${[p.breed, p.species].filter(Boolean).join(' ') || 'pet'})` : fullName(p)
  const rel = relationLabel(p)
  if (!p.alive) return `- ${handle}: ${name}, your ${rel}, DEAD${p.causeOfDeath ? ` (${p.causeOfDeath})` : ''}`
  const parts = [`- ${handle}: ${name}, your ${rel}, ${p.gender === 'male' ? 'M' : 'F'} ${p.age}`, `relationship ${p.relationship}% (${moodWord(p.relationship)})`]
  if (p.traits.length) parts.push(p.traits.slice(0, 3).join('/'))
  if (p.relation !== 'pet' && p.occupation && p.occupation !== 'None') parts.push(p.occupation)
  if (p.livesWithPlayer) parts.push('lives with you')
  if (p.pregnant) parts.push('pregnant')
  if (withNotes && p.notes.length) parts.push(`notes: ${p.notes.slice(-2).map((n) => truncate(n, 70)).join('; ')}`)
  return parts.join(', ')
}

export function describePeople(g: GameState, max = 12, focusId?: string): string {
  const people = selectPeople(g, max, focusId)
  if (people.length === 0) return 'PEOPLE: nobody yet'
  const lines = people.map((p) => describePerson(p, people))
  const more = g.people.filter((p) => p.alive).length - people.filter((p) => p.alive).length
  return `PEOPLE (use these names):\n${lines.join('\n')}${more > 0 ? `\n(+${more} others)` : ''}`
}

/** The last `max` life-log lines, oldest first, prefixed with the age. */
export function recentLogLines(g: GameState, max = 15): string[] {
  const out: string[] = []
  for (let y = g.log.length - 1; y >= 0 && out.length < max; y--) {
    const year = g.log[y]
    for (let e = year.entries.length - 1; e >= 0 && out.length < max; e--) {
      out.push(`Age ${year.age}: ${truncate(year.entries[e].text, 110)}`)
    }
  }
  return out.reverse()
}

/**
 * g.flags.eventMemory: the last popups the game threw at the player (AI and offline), newest
 * last, so neither source repeats an event (or the same kind of event about the same person)
 * within a few years. game/events.ts appends offline events in the same shape.
 */
export const EVENT_MEMORY_FLAG = 'eventMemory'
export const EVENT_MEMORY_MAX = 16

export interface EventMemo {
  title: string
  /** Age when it fired. */
  age: number
  /** Person it was about ('' if nobody) and their first name for the prompt. */
  personId: string
  person: string
  /** AI: the suggested theme; offline: the event kind or id. */
  kind: string
  source: 'ai' | 'offline'
  /** g.generation when it fired: a parent's events don't count for the child who carries on. */
  gen: number
}

/** This generation's remembered events, oldest first. */
export function eventMemory(g: GameState): EventMemo[] {
  const raw = g.flags[EVENT_MEMORY_FLAG]
  if (!Array.isArray(raw)) return []
  const out: EventMemo[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const o = v as Record<string, unknown>
    if (typeof o.title !== 'string' || typeof o.age !== 'number') continue
    if (typeof o.gen === 'number' && o.gen !== g.generation) continue
    out.push({
      title: o.title,
      age: o.age,
      personId: typeof o.personId === 'string' ? o.personId : '',
      person: typeof o.person === 'string' ? o.person : '',
      kind: typeof o.kind === 'string' ? o.kind : '',
      source: o.source === 'offline' ? 'offline' : 'ai',
      gen: g.generation,
    })
  }
  return out
}

/** Titles of recent events (AI and offline, "Title (Name)") to avoid repeats. Old saves: the AI titles. */
export function recentAiEvents(g: GameState): string[] {
  if (Array.isArray(g.flags[EVENT_MEMORY_FLAG])) {
    const memo = eventMemory(g).filter((m) => m.age <= g.character.age && m.age >= g.character.age - 8)
    return memo.slice(-8).map((m) => (m.person ? `${m.title} (${m.person})` : m.title))
  }
  const v = g.flags.aiRecentEvents
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-12) : []
}

export interface ContextOptions {
  people?: number
  log?: number
  memories?: number
  focusPersonId?: string
}

/** Full compact context: character sheet, people, recent log and memories. */
export function gameContext(g: GameState, opts: ContextOptions = {}): string {
  const parts = [describeCharacter(g), describePeople(g, opts.people ?? 12, opts.focusPersonId)]
  const mems = g.character.memories.slice(-(opts.memories ?? 10)).map((m) => `- ${truncate(m, 100)}`)
  if (mems.length) parts.push(`MEMORIES:\n${mems.join('\n')}`)
  const logLines = recentLogLines(g, opts.log ?? 15).map((l) => `- ${l}`)
  if (logLines.length) parts.push(`RECENT LOG (already happened):\n${logLines.join('\n')}`)
  let text = parts.join('\n\n')
  // Hard cap (~2,000 tokens) in case of very long names/notes.
  if (text.length > 8000) text = `${text.slice(0, 8000)}\n…`
  return text
}

// ---------------------------------------------------------------------------
// Task prompts

export interface YearEventsPromptOptions {
  wantEvent: boolean
  theme: string
  logLines: string
}

export function yearEventsPrompt(g: GameState, o: YearEventsPromptOptions): string {
  const c = g.character
  const stage = stageOf(g)
  const recent = recentAiEvents(g)
  const lines = [
    gameContext(g),
    '',
    `TASK: Write ${c.firstName}'s year at age ${c.age}.`,
    stageRule(g, stage),
    `- "log": ${o.logLines} NEW small moments from this year (first person, past tense, max 15 words each).`,
    `- Never repeat or reword RECENT LOG or MEMORIES. Log lines never have ${c.firstName} do anything big the player didn't choose (attack someone, a crime, quit, break up, date, buy something big, move).`,
  ]
  if (o.wantEvent) {
    lines.push(
      '- "event": one random situation that needs a decision NOW. "text" is second person, 1-3 sentences, ending with a question like "What will you do?". "title" max 4 words, "emoji" one emoji.',
      '- "choices": 2-4 different options, short imperative labels (max 6 words), at least one risky or funny option; "emoji" is "" or one emoji.',
      '- "person": the name of someone from PEOPLE involved in the event, or "".',
      `- Suggested theme: ${o.theme}.${recent.length ? ` Must differ from recent events: ${recent.join('; ')}.` : ''}`,
      'Reply with JSON like: {"log":["I ..."],"event":{"title":"...","emoji":"<one emoji>","text":"You ... What will you do?","person":"","choices":[{"label":"...","emoji":""},{"label":"...","emoji":""},{"label":"...","emoji":""}]}}',
    )
  } else {
    lines.push('Reply with JSON like: {"log":["I ..."]}')
  }
  return lines.join('\n')
}

function choiceList(event: ChoiceModal): string {
  return event.choices.map((ch) => `${ch.id}) ${ch.label}`).join('; ')
}

export function resolveChoicePrompt(g: GameState, event: ChoiceModal, choiceLabel: string): string {
  const c = g.character
  return [
    gameContext(g, { focusPersonId: event.personId }),
    '',
    `EVENT "${event.title}": ${event.text}`,
    `OPTIONS: ${choiceList(event)}`,
    `${c.firstName.toUpperCase()} CHOSE: "${choiceLabel}"`,
    '',
    `TASK: Decide what happens because of that choice. Realistic for a ${c.age}-year-old in this situation; it can go well, badly or absurdly (risky choices often backfire, kind ones usually pay off a little).`,
    '- "title": 1-4 word outcome title. "emoji": one emoji.',
    '- "text": second person, 1-3 punchy sentences describing the result.',
    '- "log": first person, past tense, max 15 words, about this outcome (not a line from RECENT LOG), e.g. "I bit the doctor during my vaccination."',
    effectsGuide(g),
    `Reply with JSON like: {"title":"...","emoji":"<one emoji>","text":"You ...","log":"I ...","effects":${EFFECTS_EXAMPLE}}`,
  ].join('\n')
}

export function customActionPrompt(g: GameState, action: string): string {
  const c = g.character
  const stage = stageOf(g)
  const country = getCountry(c.countryId)
  return [
    gameContext(g),
    '',
    `${c.firstName.toUpperCase()} WANTS TO: "${action}"`,
    '',
    'TASK: You are the game master. Decide whether they can do this right now, and what happens.',
    `- Legal ages in ${country.name}: driving ${country.drivingAge}, drinking ${country.drinkingAge}, adult 18.`,
    `- possible=false if it's impossible for them now: too young (age ${c.age}), ${c.prison ? 'they are locked in prison, ' : ''}can't afford it (${formatMoney(c.money)} cash), physically impossible, or it needs a license/degree they don't have. Then "text" says why, wittily, and all effects are 0.`,
    '- If possible: describe the attempt and its immediate result. Not always a success: luck, stats and karma matter. Crimes may get them arrested (arrest). Purchases cost money (negative money).',
    '- The game can only change stats, money, relationships, add one new person, add a condition, arrest them or (rarely) kill them. Never claim other permanent changes (a new job, marriage, a degree, moving home, escaping prison); those happen through the game menus.',
    stageRule(g, stage),
    '- "title": 1-4 words. "text": second person, 1-3 sentences. "log": first person, past tense, max 15 words ("" if impossible).',
    effectsGuide(g),
    `Reply with JSON like: {"possible":true,"title":"...","emoji":"<one emoji>","text":"You ...","log":"I ...","effects":${EFFECTS_EXAMPLE}}`,
  ].join('\n')
}

export function interviewPrompt(g: GameState, job: InterviewJob): string {
  const c = g.character
  const degrees = c.education.degrees.map((d) => d.name).join('; ') || 'no degree'
  const lastJob = c.job ? `${c.job.title} at ${c.job.company}` : c.careerHistory.length ? c.careerHistory[c.careerHistory.length - 1].title : 'none'
  return [
    `CANDIDATE: ${fullName(c)}, ${c.gender}, age ${c.age}, smarts ${c.stats.smarts}, looks ${c.stats.looks}; education: ${degrees}; current/last job: ${lastJob}; criminal record: ${c.criminalRecord.length ? 'yes' : 'none'}.`,
    `JOB: ${job.title} at ${job.company} (${job.category}, ${formatMoney(job.salary)}/yr), ${getCountry(c.countryId).name}.`,
    '',
    `TASK: Write ONE question the interviewer at ${job.company} asks in the job interview: specific to this job, a bit witty, like a life-sim game.`,
    `Then 3-4 answers ${c.firstName} could give (first person, max 14 words each) with a "score" 0-100 for how well each one would land with this interviewer: exactly one great answer (75-95), one terrible or weird one (0-25), the rest in between. Mix up the order.`,
    'Reply with JSON like: {"question":"...","answers":[{"label":"...","score":40},{"label":"...","score":90},{"label":"...","score":10}]}',
  ].join('\n')
}

function screeningTarget(app: ScreeningApp): CvTarget {
  if (app.kind === 'university') return universityTarget(app.major)
  if (app.kind === 'graduate') return graduateTarget((app.program ?? 'master') as GradKey)
  const def = app.job ? getJobDef(app.job.defId) : undefined
  return def ? jobTarget(def) : { kind: 'job' }
}

/** CV screening: the AI decides whether the applicant gets an interview (and, for schools, asks the first question). */
export function screenApplicationPrompt(g: GameState, app: ScreeningApp): string {
  const c = g.character
  const country = getCountry(c.countryId)
  const school = app.kind !== 'job'
  const lines: string[] = [`APPLICANT: ${fullName(c)}, ${c.gender}, age ${c.age}, ${country.name}; smarts ${c.stats.smarts}/100.`]
  if (school) {
    const cur = c.education.current
    const grades = cur && cur.level === 'high' ? cur.grades : typeof g.flags.lastGrades === 'number' ? g.flags.lastGrades : null
    const exam = typeof g.flags.examScore === 'number' ? g.flags.examScore : null
    const hs = cur && cur.level === 'high' ? cur.school : c.education.degrees.find((d) => d.kind === 'highschool')?.school
    const parts = [grades !== null ? `grades ${Math.round(grades)}%` : '', exam !== null && app.kind === 'university' ? `${localeOf(c.countryId).terms.finalExam || 'final exam'} ${Math.round(exam)}/100` : '', hs ? `${schoolLabels(c.countryId).high} ${hs} (${rankLabel(rankOf(g, 'high', hs))})` : '']
    lines.push(`RECORD: ${parts.filter(Boolean).join('; ') || 'nothing notable'}`)
    if (app.kind === 'graduate') lines.push(`DEGREES: ${c.education.degrees.map((d) => `${d.name}${d.honors ? ' (honors)' : ''}`).join('; ') || 'none'}`)
  } else {
    lines.push(`EDUCATION: ${c.education.degrees.map((d) => d.name).join('; ') || 'no degree'}; criminal record: ${c.criminalRecord.some((r) => r.convicted) ? 'yes' : 'none'}`)
  }
  const cv = cvPromptLines(g, screeningTarget(app), 8)
  lines.push('CV (most relevant first; [n/10] = how impressive):', ...(cv.length ? cv : ['- (empty)']))
  if (app.kind === 'job' && app.job) {
    const def = getJobDef(app.job.defId)
    lines.push(`JOB: ${app.job.title} at ${app.job.company} (${app.job.category}, ${formatMoney(app.job.salary)}/yr${def ? `, needs ${def.edu === 'none' ? 'no particular education' : def.edu}` : ''}).`)
    if (app.market) lines.push(`MARKET: ${app.market}.`)
  } else {
    const what = app.kind === 'graduate' ? `the ${app.program ?? 'graduate'} program` : `a degree in ${app.major ?? 'an undecided major'}`
    lines.push(`APPLYING TO: ${app.org}${app.rankLabel ? ` (${app.rankLabel}${app.tier ? `, ${app.tier}` : ''})` : ''} for ${what}.`)
  }
  lines.push(`GAME ESTIMATE: CV fit ${app.fit}/100; about ${Math.round(app.chance * 100)}% of applicants like this get an interview.`)
  lines.push(
    '',
    `TASK: You are ${school ? `the admissions committee at ${app.org}` : `the recruiter at ${app.job?.company ?? app.org}`}. Decide whether ${c.firstName} gets an interview.`,
    '- Be realistic and fair. Judge only the facts and CV above; never invent CV items, schools, jobs or awards that are not listed.',
    '- Use the game estimate as a guide: above ~65% usually invite, below ~25% usually not. A tough market or a very selective school turns most people away; strong, relevant entries (clubs, leadership, volunteering, projects, awards, experience) count, irrelevant ones count little.',
    `- "reason": ONE short sentence (max 20 words) to ${c.firstName} in second person, naming a real CV item${app.kind === 'job' ? ' or the job market' : ''}; witty but kind.`,
  )
  if (school) {
    lines.push(
      `- If "invite" is true, also write ONE admissions interview question (specific to ${app.org}, the field, or an item on the CV) and 3-4 answers ${c.firstName} could give (first person, max 14 words each) with "score" 0-100: exactly one great answer (75-95), one terrible or weird one (0-25). If "invite" is false: "question" is "" and "answers" is [].`,
      'Reply with JSON like: {"invite":true,"reason":"Your robotics captaincy stood out.","question":"...","answers":[{"label":"...","score":85},{"label":"...","score":40},{"label":"...","score":10}]}',
    )
  } else {
    lines.push('Reply with JSON like: {"invite":false,"reason":"With 300 applicants per opening, we needed more hands-on experience."}')
  }
  return lines.join('\n')
}

/** Life summary for the obituary. */
export function obituaryPrompt(g: GameState): string {
  const c = g.character
  const country = getCountry(c.birthCountryId)
  const alive = (rels: RelationKind[]) => g.people.filter((p) => rels.includes(p.relation))
  const spouse = alive(['spouse']).find((p) => p.alive)
  const kids = alive(['child', 'stepchild'])
  const parentsList = alive(['parent'])
  const occupation = typeof g.flags.finalOccupation === 'string' ? g.flags.finalOccupation : roleLabel(g)
  const careers = c.careerHistory.slice(-3).map((r) => `${r.title} at ${r.company}`)
  const lines = [
    `NAME: ${fullName(c)} (${c.gender}), born ${g.year - c.age} in ${c.city}, ${country.name}; died ${g.year} at age ${c.age}. Cause of death: ${c.causeOfDeath ?? 'unknown'}.`,
    `OCCUPATION AT DEATH: ${occupation}${careers.length ? `; career: ${careers.join(', ')}` : ''}${c.retired ? ' (retired)' : ''}`,
    `EDUCATION: ${c.education.degrees.map((d) => d.name).join('; ') || 'no degrees'}`,
    `NET WORTH: ${shortMoney(netWorth(g))}`,
    `FAMILY: ${spouse ? `married to ${fullName(spouse)}` : 'no spouse'}; ${kids.length ? `children: ${kids.map((k) => k.firstName).join(', ')}` : 'no children'}; parents: ${parentsList.map((p) => `${p.firstName}${p.alive ? '' : ' (late)'}`).join(', ') || 'unknown'}`,
    `STATS: happiness ${c.stats.happiness}, smarts ${c.stats.smarts}, looks ${c.stats.looks}, karma ${c.hidden.karma}, fame ${c.hidden.fame}`,
  ]
  if (c.criminalRecord.length) lines.push(`CRIMES: ${c.criminalRecord.slice(-4).map((r) => r.crime).join(', ')}${c.prison ? ' (died in prison)' : ''}`)
  const talents = talentsSummary(g)
  if (talents) lines.push(talents)
  const pets = g.people.filter((p) => p.relation === 'pet' && p.alive)
  if (pets.length) lines.push(`PETS: ${pets.map((p) => `${p.firstName} the ${p.species ?? 'pet'}`).join(', ')}`)
  const mems = c.memories.slice(-12).map((m) => `- ${truncate(m, 100)}`)
  if (mems.length) lines.push(`LIFE HIGHLIGHTS:\n${mems.join('\n')}`)
  const logLines = recentLogLines(g, 6).map((l) => `- ${l}`)
  if (logLines.length) lines.push(`FINAL YEAR:\n${logLines.join('\n')}`)
  lines.push(
    '',
    `TASK: Write ${c.firstName}'s newspaper obituary: 3-5 sentences (60-110 words), third person, past tense. Start with their full name and age. Witty but warm, built from the real details above (family, career, scandals, quirks). End with who survives them or a memorable line.`,
    'Reply with JSON like: {"text":"..."}',
  )
  return lines.join('\n')
}

export function narratePrompt(g: GameState, n: NoticeModal, person: Person | undefined): string {
  const c = g.character
  const lines = [`PLAYER: ${fullName(c)}, ${c.gender}, age ${c.age}, ${roleLabel(g)}. PLACE: ${c.city}, ${getCountry(c.countryId).name}.`]
  if (person) lines.push(`OTHER PERSON: ${describePerson(person, [person]).slice(2)}`)
  lines.push(
    `POPUP TITLE: ${n.title}`,
    `ORIGINAL TEXT: ${n.text}`,
    `FACTS TO KEEP: ${n.ai?.facts || n.text}`,
    '',
    'TASK: Rewrite the popup text in your narrator voice: second person, 1-3 sentences, witty and specific. Keep every fact exactly (names, numbers, money amounts and the outcome). Do not invent new consequences.',
    'Reply with JSON like: {"text":"You ..."}',
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Conversations

export interface ChatLine {
  from: 'player' | 'npc'
  text: string
}

function speakerStyle(p: Person): string {
  if (p.relation === 'pet') {
    return `You are ${p.firstName}, ${cap(p.species ?? 'pet')}${p.breed ? ` (${p.breed})` : ''}. You are an animal and cannot talk: reply only with animal noises and actions in *asterisks*, e.g. "*wags tail* Woof!" or "*knocks your glass off the table*".`
  }
  if (p.age < 2) return `You are ${p.firstName}, a baby. Reply only with baby noises and actions in *asterisks*, e.g. "*giggles* Ba-ba!".`
  if (p.age < 6) return `You are ${p.firstName}, a ${p.age}-year-old little kid: short, simple, cute sentences.`
  if (p.age < 13) return `You are ${p.firstName}, a ${p.age}-year-old kid.`
  return `You are ${fullName(p)}, ${p.age} years old.`
}

export function chatSystemPrompt(g: GameState, p: Person, settings: Settings): string {
  const c = g.character
  const rel = relationLabel(p)
  const traits = p.traits.length ? `Personality: ${p.traits.join(', ')}.` : ''
  return [
    `${speakerStyle(p)} You are ${c.firstName}'s ${rel.toLowerCase()} in the life simulator AnotherLife. ${traits}`,
    p.relation === 'pet' || p.age < 6 ? '' : `You live in ${getCountry(c.countryId).name}: your references (places, food, holidays, money talk) are local, never American unless that is where you live.`,
    `How you feel about ${c.firstName}: relationship ${p.relationship}% (${moodWord(p.relationship)}). Stay in character: warm if close, cold or snippy if not; your traits color everything you say.`,
    `Reply to ${c.firstName}'s latest message in 1-3 short sentences, speaking directly to them. No narration about yourself in third person.`,
    'Also rate how their message landed with you: relationshipDelta from -5 (insulting, creepy, cruel) to +5 (kind, funny, thoughtful); 0 for small talk. mood is one word for how you feel now.',
    ratingRule(settings.contentRating),
    'OUTPUT: one JSON object only: {"reply":"...","relationshipDelta":0,"mood":"..."}',
  ]
    .filter(Boolean)
    .join('\n')
}

export function chatUserPrompt(g: GameState, p: Person, history: ChatLine[], message: string): string {
  const c = g.character
  const facts = [
    p.relation === 'pet' ? `${p.firstName}, ${[p.breed, p.species].filter(Boolean).join(' ') || 'pet'}, age ${p.age}` : `${fullName(p)}, ${p.gender}, age ${p.age}`,
    `${c.firstName}'s ${relationLabel(p).toLowerCase()}`,
    `relationship with ${c.firstName}: ${p.relationship}%`,
  ]
  if (p.relation !== 'pet' && p.occupation && p.occupation !== 'None') facts.push(p.occupation)
  if (p.traits.length) facts.push(p.traits.join('/'))
  if (p.livesWithPlayer) facts.push(`lives with ${c.firstName}`)
  if (p.notes.length) facts.push(`shared history: ${p.notes.slice(-3).map((n) => truncate(n, 70)).join('; ')}`)
  const lines = [
    `ABOUT YOU: ${facts.join(', ')}`,
    `ABOUT ${c.firstName.toUpperCase()}: ${fullName(c)}, ${c.gender}, age ${c.age}, ${roleLabel(g)}, ${c.city}, ${getCountry(c.countryId).name}; happiness ${c.stats.happiness}, looks ${c.stats.looks}, money ${shortMoney(c.money)}${c.prison ? ', currently in prison' : ''}.`,
  ]
  const recent = recentLogLines(g, 5)
  if (recent.length) lines.push(`${c.firstName.toUpperCase()}'S RECENT LIFE: ${recent.join(' | ')}`)
  const turns = history.slice(-12)
  if (turns.length) {
    lines.push('CONVERSATION SO FAR:')
    for (const t of turns) lines.push(`${t.from === 'player' ? c.firstName : p.firstName}: ${truncate(t.text, 280)}`)
  }
  lines.push(`${c.firstName} now says: "${truncate(message, 400)}"`, '', `Reply as ${p.firstName} with JSON only.`)
  return lines.join('\n')
}

/** The follow-up message after a reply that couldn't be parsed or validated. */
export function correctionPrompt(problem: string): string {
  return `That reply could not be used: ${problem}. Reply again with ONLY the JSON object in exactly the requested format — no markdown, no explanations.`
}

/** Rough token estimate (≈4 characters per token) for budgeting prompts. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
