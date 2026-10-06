// Individual sports on one tour engine: tennis, golf, track & field, swimming, cycling, motor
// racing, skiing, snowboarding, surfing, skateboarding, gymnastics, figure skating, badminton,
// table tennis, darts, and the Olympic combat sports judo and wrestling.
//
// Skills live in a persistent per-sport record (g.flags 'special.sports.ind'), so junior years,
// amateur practice and comebacks all build on the same numbers. The current pro career is a
// Job (defId 'sports.ind') holding the circuit, ranking points, prize money and season results.
// Players can enter the marquee events of the calendar themselves (with a decisive-moment
// choice); everything they skip is simulated at the end of the season.
import { addHidden, addStat, count, earnIncome, log, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { chance, pick, rand, randInt, bell } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry, randomCity, COUNTRIES } from '../world'
import { addFame, fameToward, hire, leave, money, myJob, ordinal, peek, prof, quitNote, say, short, syncTenure, talentMatches, tell, view } from './common'
import {
  addBuzz,
  addHeadTrauma,
  ageDecline,
  countryName,
  hasCoast,
  hasRink,
  hasSnowHere,
  healInjury,
  honor,
  injure,
  localFee,
  logistic,
  payFee,
  plural,
  popularTag,
  rankFromPoints,
  rankLabel,
  recordCareer,
  sportsBan,
  sportsGate,
  tidy,
  trainGain,
  wealth,
  worldAthlete,
} from './sports-core'
import { BRACKET_POINTS, BRACKET_ROUND, BRACKET_SHARE, IND_SPORTS, MOTOR_POINTS, indSport, placePoints, placeShare, type IndEvent, type IndSport, type IndTier } from './sports-data'

// ---------------------------------------------------------------------------
// State

export interface IndRecord {
  attrs: Record<string, number>
  fitness: number
  discipline: string | null
  bestRank: number | null
  titles: number
  majors: number
  majorList: string[]
  earnings: number
  seasons: number
  startAge: number
  retiredAge: number | null
  /** Motor racing: championships won. */
  crowns: number
  /** Attributes drilled this season (unpracticed ones fade). */
  practiced: string[]
}

interface IndProfile {
  sports: Record<string, IndRecord>
}

interface IndJob {
  sport: string
  disc: string
  tier: number
  team: string
  teamStrength: number
  contractYears: number
  funded: boolean
  season: number
  carry: number
  rank: number | null
  earned: number
  played: string[]
  titles: string[]
  results: string[]
  injured: number
  doping: boolean
  coach: number
  standing: number
  lastPos: number
  /** Contract wage from the team (cycling, motor racing); job.salary shows total yearly income. */
  wage: number
  /** This season's named events (built on first use each year). */
  cal: CalEntry[]
  calAge: number
}

const initProfile = (): IndProfile => ({ sports: {} })

function indProfile(g: GameState): IndProfile {
  return prof(g, 'sports.ind', initProfile)
}

function viewProfile(g: GameState): IndProfile {
  return peek<IndProfile>(g, 'sports.ind') ?? initProfile()
}

/** Read-only record for a sport (menus). */
export function viewRecord(g: GameState, sportId: string): IndRecord | null {
  return viewProfile(g).sports[sportId] ?? null
}

function startingAttr(g: GameState, sport: IndSport): number {
  const c = g.character
  const talent = talentMatches(g, /athlet|sport/i) ? 8 : 0
  const kid = c.age < 12 ? -8 : 0
  return Math.max(5, Math.min(60, Math.round(c.hidden.athleticism * (0.2 + sport.athletic * 0.5) + 15 + talent + kid + randInt(g, 0, 10))))
}

/** Mutable record for a sport, created with starting attributes on first use. */
export function sportRecord(g: GameState, sport: IndSport): IndRecord {
  const p = indProfile(g)
  let rec = p.sports[sport.id]
  if (!rec) {
    const attrs: Record<string, number> = {}
    for (const a of sport.attrs) attrs[a] = startingAttr(g, sport)
    rec = { attrs, fitness: Math.max(20, Math.min(80, g.character.hidden.athleticism * 0.7 + 10)), discipline: null, bestRank: null, titles: 0, majors: 0, majorList: [], earnings: 0, seasons: 0, startAge: g.character.age, retiredAge: null, crowns: 0, practiced: [] }
    p.sports[sport.id] = rec
  }
  for (const a of sport.attrs) if (typeof rec.attrs[a] !== 'number') rec.attrs[a] = startingAttr(g, sport)
  if (!Array.isArray(rec.practiced)) rec.practiced = []
  return rec
}

export function indJob(g: GameState): Job | null {
  return myJob(g, 'sports.ind')
}

function jd(job: Job): IndJob {
  return view<IndJob>(job.data)
}

function sportOfJob(job: Job): IndSport {
  return indSport(jd(job).sport) ?? IND_SPORTS[0]
}

function avgAttr(sport: IndSport, rec: IndRecord): number {
  const vals = sport.attrs.map((a) => rec.attrs[a] ?? 0)
  return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)
}

/** Overall level 0-100: skills, fitness, natural athleticism, coaching, health and luck. */
export function indRating(g: GameState, sport: IndSport, rec: IndRecord, job?: Job | null): number {
  const c = g.character
  const a = sport.athletic
  let r = avgAttr(sport, rec) * (0.8 - a) + rec.fitness * 0.2 + c.hidden.athleticism * a
  if (talentMatches(g, /athlet|sport/i)) r += 3
  if (job) {
    const d = jd(job)
    r += d.coach * 2
    if (d.doping) r += 6
    if (d.injured > 0) r -= 12
  }
  if (c.stats.health < 50) r -= (50 - c.stats.health) / 5
  return Math.max(1, Math.min(99, Math.round(r)))
}

// ---------------------------------------------------------------------------
// Where a sport can be played

export function placeReason(g: GameState, sport: IndSport): string | null {
  if (sport.needs === 'snow' && !hasSnowHere(g)) return `There's no snow in ${countryName(g)}. Move somewhere with real winters to train for ${sport.name.toLowerCase()}.`
  if (sport.needs === 'coast' && !hasCoast(g)) return `${countryName(g)} has no coastline. Surfers need waves; move somewhere by the sea.`
  if (sport.needs === 'rink' && !hasRink(g)) return `There are no proper ice rinks near you in ${countryName(g)}. Move somewhere colder or richer to skate.`
  return null
}

// ---------------------------------------------------------------------------
// Calendar

interface CalEntry {
  id: string
  name: string
}

function fillName(g: GameState, template: string): string {
  const c = g.character
  const country = getCountry(c.countryId)
  let out = template.replace('{demonym}', country.demonym)
  if (out.includes('{city}')) {
    const home = chance(g, 0.35)
    const where = home ? country : pick(g, COUNTRIES)
    out = out.replace('{city}', randomCity(g, where))
  }
  return out
}

/**
 * This season's named events (host cities fixed for the season). Stored in the job so the
 * end-of-season simulation (which runs after the birthday) uses the same names.
 */
function calendar(g: GameState, sport: IndSport, job: Job, endOfSeason = false): CalEntry[] {
  const d = jd(job)
  const age = g.character.age - (endOfSeason ? 1 : 0)
  if (Array.isArray(d.cal) && d.cal.length && d.calAge === age) return d.cal
  d.cal = sport.events.map((e) => ({ id: e.id, name: fillName(g, e.name) }))
  d.calAge = age
  return d.cal
}

type Entry = 'direct' | 'qualify' | null

function entryFor(g: GameState, sport: IndSport, job: Job, ev: IndEvent): Entry {
  const d = jd(job)
  if (ev.onlyTier !== undefined && d.tier !== ev.onlyTier) return null
  if (ev.minTier !== undefined && d.tier < ev.minTier) return null
  if (ev.years === 'odd' && g.year % 2 === 0) return null
  if (ev.years === 'even' && g.year % 2 === 1) return null
  if (ev.disc && d.disc && !ev.disc.includes(d.disc)) return null
  if (ev.minRank === undefined || sport.format === 'race') return 'direct'
  const rank = d.rank
  if (rank !== null && rank <= ev.minRank) return 'direct'
  if (ev.tier === 'major' && rank !== null && rank <= ev.minRank * 2) return 'qualify'
  return null
}

function eventLevel(sport: IndSport, job: Job, ev: { tier: IndEvent['tier'] }): number {
  const d = jd(job)
  const tier = sport.tiers[Math.min(d.tier, sport.tiers.length - 1)]
  const top = sport.tiers[sport.tiers.length - 1].level
  switch (ev.tier) {
    case 'minor':
      return sport.tiers[0].level
    case 'tour':
      return sport.format === 'race' ? tier.level : Math.max(tier.level, top - 2)
    case 'major':
      return sport.format === 'race' ? tier.level + 3 : top + 7
    case 'finals':
      return sport.format === 'race' ? tier.level + 1 : top + 11
  }
}

// ---------------------------------------------------------------------------
// Simulation

interface Outcome {
  /** bracket: rounds from the end (0 = champion); field/race: finishing place (0 = DNF). */
  pos: number
  prize: number
  pts: number
  label: string
  won: boolean
  qualifyingLoss?: boolean
}

interface PivotData {
  sport: string
  evId: string
  evName: string
  tier: IndEvent['tier']
  prize: number
  pts: number
  field: number
  perf: number
  level: number
  /** bracket: chance to win the final; field/race: current place. */
  base: number
  opp: string
}

function performance(g: GameState, sport: IndSport, job: Job, rec: IndRecord): number {
  const r = indRating(g, sport, rec, job)
  if (sport.format === 'race') return jd(job).teamStrength * 0.55 + r * 0.45
  return r
}

function bracketResult(ev: PivotLike, roundsFromEnd: number): Outcome {
  const i = Math.max(0, Math.min(BRACKET_SHARE.length - 1, roundsFromEnd))
  const prize = tidy(ev.prize * BRACKET_SHARE[i])
  const pts = Math.round(ev.pts * BRACKET_POINTS[i])
  return { pos: roundsFromEnd, prize, pts, label: BRACKET_ROUND[i] ?? 'lost early', won: roundsFromEnd === 0 }
}

interface PivotLike {
  prize: number
  pts: number
  field: number
}

function fieldResult(sport: IndSport, ev: PivotLike, place: number): Outcome {
  if (sport.format === 'race') {
    if (place <= 0) return { pos: 0, prize: 0, pts: 0, label: 'did not finish', won: false }
    const pts = MOTOR_POINTS[place - 1] ?? 0
    const prize = place === 1 ? ev.prize : place <= 3 ? tidy(ev.prize * 0.3) : 0
    return { pos: place, prize, pts, label: place === 1 ? 'won' : `finished ${ordinal(place)}`, won: place === 1 }
  }
  const prize = tidy(ev.prize * placeShare(place, sport.paid))
  const pts = Math.round(ev.pts * placePoints(place))
  const cut = sport.id === 'golf' && place > sport.paid
  return { pos: place, prize, pts, label: cut ? 'missed the cut' : place === 1 ? 'won' : `finished ${ordinal(place)}`, won: place === 1 }
}

function placeFor(g: GameState, perf: number, level: number, field: number, race: boolean): number {
  const mu = level - (race ? 10 : 12)
  const count = (field - 1) / (1 + Math.exp((perf - mu) / 3.6))
  return Math.max(1, Math.min(field, 1 + Math.round(count * (0.8 + rand(g) * 0.4))))
}

/**
 * Play one event. With `manual`, a final/podium moment is returned as a pivot (no outcome yet);
 * otherwise everything is resolved here.
 */
function playEvent(g: GameState, sport: IndSport, job: Job, rec: IndRecord, ev: IndEvent, name: string, entry: Entry, manual: boolean): { outcome?: Outcome; pivot?: PivotData; note?: string } {
  const level = eventLevel(sport, job, ev)
  const form = bell(g, -7, 7)
  const perf = performance(g, sport, job, rec) + form
  let note = ''
  if (entry === 'qualify') {
    for (let q = 0; q < 3; q++) {
      if (!chance(g, logistic((perf - (level - 14)) / 6))) {
        return { outcome: { pos: 99, prize: tidy(ev.prize * 0.006), pts: Math.round(ev.pts * 0.005), label: 'lost in qualifying', won: false, qualifyingLoss: true } }
      }
    }
    note = 'You came through qualifying. '
  }
  if (sport.format === 'bracket') {
    const rounds = Math.max(1, Math.ceil(Math.log2(ev.field)))
    const rank = jd(job).rank
    for (let k = rounds; k >= 2; k--) {
      const seedBonus = rank !== null && rank <= 16 && k >= 4 ? 4 : 0
      const opp = level - (k - 1) * 3.5 - seedBonus
      if (!chance(g, logistic((perf - opp) / 6))) return { outcome: bracketResult(ev, k), note }
    }
    const p = logistic((perf - level) / 6)
    const opp = worldAthlete(g, g.character.gender)
    if (manual) return { pivot: { sport: sport.id, evId: ev.id, evName: name, tier: ev.tier, prize: ev.prize, pts: ev.pts, field: ev.field, perf, level, base: p, opp: `${opp.flag} ${opp.name}` }, note }
    return { outcome: bracketResult(ev, chance(g, p) ? 0 : 1), note }
  }
  const race = sport.format === 'race'
  if (race && chance(g, 0.06)) return { outcome: fieldResult(sport, ev, 0), note: pick(g, ['Your engine let go in a cloud of smoke. ', 'Someone punted you into the gravel on lap one. ', 'A hydraulics failure ended your race early. ']) }
  const place = placeFor(g, perf, level, ev.field, race)
  if (manual && place <= 3) {
    const opp = worldAthlete(g, g.character.gender)
    return { pivot: { sport: sport.id, evId: ev.id, evName: name, tier: ev.tier, prize: ev.prize, pts: ev.pts, field: ev.field, perf, level, base: place, opp: `${opp.flag} ${opp.name}` }, note }
  }
  return { outcome: fieldResult(sport, ev, place), note }
}

// ---------------------------------------------------------------------------
// Applying results

function bookResult(g: GameState, sport: IndSport, job: Job, rec: IndRecord, ev: { id: string; tier: IndEvent['tier'] }, name: string, o: Outcome, auto: boolean): string {
  const d = jd(job)
  if (o.prize > 0) {
    earnIncome(g, o.prize)
    d.earned += o.prize
    rec.earnings += o.prize
  }
  if (sport.format === 'race') d.standing += o.pts
  else d.season += o.pts
  let line = `${o.label} at the ${name}`
  if (o.won) {
    rec.titles += 1
    d.titles.push(name)
    count(g, 'sportsTitles')
    if (ev.tier === 'major' || ev.tier === 'finals') {
      if (ev.tier === 'major') rec.majors += 1
      rec.majorList.push(`${name} ${g.year}`)
      if (rec.majorList.length > 30) rec.majorList.splice(0, rec.majorList.length - 30)
      count(g, 'championships')
      addFame(g, ev.tier === 'major' ? 4 : 3)
      addBuzz(g, 15)
      addStat(g, 'happiness', 12)
      honor(g, `Won the ${name} (${sport.name}).`, `${name} champion`, sport.name, ev.tier === 'major' ? 8 : 7)
    } else {
      if (chance(g, 0.3)) addFame(g, 1)
      addBuzz(g, 4)
      addStat(g, 'happiness', 5)
    }
    line = `won the ${name}`
  } else if ((ev.tier === 'major' || ev.tier === 'finals') && sport.format === 'bracket' && o.pos <= 2) addBuzz(g, 5)
  if (!auto || o.won || ev.tier === 'major') {
    d.results.push(`${line}${o.prize > 0 ? ` (${short(o.prize)})` : ''}`)
    if (d.results.length > 10) d.results.splice(0, d.results.length - 10)
  }
  if (!d.played.includes(ev.id)) d.played.push(ev.id)
  updateRank(g, sport, job, auto)
  return line
}

function updateRank(g: GameState, sport: IndSport, job: Job, quiet: boolean): void {
  if (sport.format === 'race') return
  const d = jd(job)
  d.rank = rankFromPoints(d.season + d.carry)
  const rec = sportRecord(g, sport)
  if (d.rank !== null && (rec.bestRank === null || d.rank < rec.bestRank)) rec.bestRank = d.rank
  const next = sport.tiers[d.tier + 1]
  if (next && next.enterRank && d.rank !== null && d.rank <= next.enterRank && !next.salary) {
    d.tier += 1
    job.company = next.name
    addFame(g, 2)
    log(g, `I made it onto the ${next.name}.`, 'good')
    if (!quiet) say(g, next.name, `Your ranking (${rankLabel(d.rank)}) earned you a place on the ${next.name}. Bigger events, bigger prize money, nicer hotels.`, sport.emoji, 'good')
  }
}

function riskInjury(g: GameState, sport: IndSport, job: Job, extra = 0): string {
  if (!chance(g, sport.risk + extra)) return ''
  const name = pick(g, sport.injuries)
  injure(g, name, randInt(g, 10, 28))
  jd(job).injured = 1
  if (/concussion/i.test(name)) addHeadTrauma(g, 3, true)
  log(g, `I suffered a ${name.toLowerCase()} competing in ${sport.name.toLowerCase()}.`, 'bad')
  return ` You also suffered a ${name.toLowerCase()} and will need time to recover.`
}

function resultNotice(g: GameState, sport: IndSport, job: Job, name: string, o: Outcome, lead: string): void {
  const d = jd(job)
  const rank = sport.format === 'race' ? `${d.standing} championship points so far.` : `${rankLabel(d.rank)}.`
  const money = o.prize > 0 ? ` Prize money: ${short(o.prize)}.` : ''
  const hurt = riskInjury(g, sport, job, o.won ? 0 : 0.01)
  if (o.won) {
    log(g, `I won the ${name}!`, 'good')
    say(g, 'Champion!', `${lead}You won the ${name}!${money} ${rank}${hurt}`, '\u{1F3C6}', 'good')
  } else {
    log(g, `I ${o.label} at the ${name}.`, o.pos <= 3 && o.pos > 0 ? 'good' : 'neutral')
    say(g, name, `${lead}You ${o.label}.${money} ${rank}${hurt}`, sport.emoji, o.pos > 0 && o.pos <= 3 ? 'good' : 'neutral')
  }
}

// ---------------------------------------------------------------------------
// Scripts: entering events and decisive moments

const pivotScript = defineScript('sports.ind.pivot', (g, choice, data) => {
  const p = data as unknown as PivotData
  const job = indJob(g)
  if (!job || !p) return
  const sport = sportOfJob(job)
  if (sport.id !== p.sport) return
  const rec = sportRecord(g, sport)
  const mental = rec.attrs[sport.mental] ?? 50
  let o: Outcome
  let lead = ''
  if (sport.format === 'bracket') {
    let prob = p.base
    if (choice === 'attack') prob += p.perf >= p.level - 4 ? 0.12 : 0.02
    else if (choice === 'steady') prob += 0.04
    else prob += (mental - 55) / 250 + 0.03
    const won = chance(g, Math.max(0.03, Math.min(0.97, prob)))
    if (!won && choice === 'attack') lead = `${sport.pivot.fail} `
    lead += won ? `You beat ${p.opp} in the final. ` : `${p.opp} beat you in the final. `
    o = bracketResult(p, won ? 0 : 1)
  } else {
    let place = p.base
    if (choice === 'attack') {
      const s = Math.max(0.1, Math.min(0.8, 0.42 + (p.perf - p.level) / 40))
      if (chance(g, s)) place = 1
      else {
        lead = `${sport.pivot.fail} `
        if (sport.format === 'race' && chance(g, 0.35)) place = 0
        else place = Math.min(p.field, place + randInt(g, 2, 6))
      }
    } else if (choice === 'steady') {
      const r = rand(g)
      place = r < 0.15 ? Math.max(1, place - 1) : r < 0.3 ? Math.min(p.field, place + 1) : place
    } else {
      const r = rand(g)
      place = r < 0.25 + mental / 250 ? Math.max(1, place - 1) : r > 0.9 ? Math.min(p.field, place + 1) : place
    }
    if (place === 1 && p.base !== 1) lead += `You snatched it from ${p.opp} at the very end. `
    else if (place > 1 && p.base === 1) lead += `${p.opp} pipped you at the end. `
    o = fieldResult(sport, p, place)
  }
  bookResult(g, sport, job, rec, { id: p.evId, tier: p.tier }, p.evName, o, false)
  if (choice === 'attack' && !o.won && sport.risk >= 0.05) riskInjury(g, sport, job, 0.1)
  resultNotice(g, sport, job, p.evName, o, lead)
})

const enterScript = defineScript('sports.ind.enter', (g, choice) => {
  if (choice === 'cancel') return
  const job = indJob(g)
  if (!job) return
  const sport = sportOfJob(job)
  const d = jd(job)
  if (d.injured > 0) return tell(g, 'Injured', "You're still injured. Your physio confiscated your gear.", '\u{1F915}')
  if (d.played.includes(choice)) return tell(g, 'Already Played', `You already played that ${sport.eventWord} this season.`, sport.emoji)
  const ev = sport.events.find((e) => e.id === choice)
  if (!ev) return
  const entry = entryFor(g, sport, job, ev)
  if (!entry) return tell(g, 'Not Eligible', `You're not eligible for that ${sport.eventWord} right now.`, sport.emoji)
  const name = calendar(g, sport, job).find((e) => e.id === ev.id)?.name ?? ev.name
  const rec = sportRecord(g, sport)
  const r = playEvent(g, sport, job, rec, ev, name, entry, true)
  if (r.pivot) {
    const p = r.pivot
    const where = sport.format === 'bracket' ? `You reached the final of the ${p.evName} against ${p.opp}.` : `You're in ${ordinal(p.base)} place at the ${p.evName}, with ${p.opp} ${p.base === 1 ? 'right behind you' : 'just ahead'}.`
    scriptChoice(
      g,
      pivotScript,
      sport.pivot.title,
      `${r.note ?? ''}${where} What's the plan?`,
      [
        { id: 'attack', label: sport.pivot.attack, emoji: '\u{1F525}' },
        { id: 'steady', label: sport.pivot.steady, emoji: '\u{1F9CA}' },
        { id: 'mind', label: sport.pivot.mind, emoji: '\u{1F9E0}' },
      ],
      { emoji: sport.emoji, data: p as unknown as Json },
    )
    return
  }
  if (r.outcome) {
    bookResult(g, sport, job, rec, ev, name, r.outcome, false)
    resultNotice(g, sport, job, name, r.outcome, r.note ?? '')
  }
})

function competeAction(): MenuAction {
  return {
    type: 'action',
    id: 'sports.ind.compete',
    label: 'Compete',
    emoji: '\u{1F3C6}',
    subtitle: (g) => {
      const j = indJob(g)
      return j ? `Enter an event on the ${sportOfJob(j).name.toLowerCase()} calendar` : ''
    },
    disabledReason: (g) => {
      const j = indJob(g)
      if (!j) return 'You are not competing.'
      if (jd(j).injured > 0) return "You're injured. Rehab first."
      return sportsGate(g, 0)
    },
    run: (g) => {
      const job = indJob(g)
      if (!job) return
      const sport = sportOfJob(job)
      const d = jd(job)
      const cal = calendar(g, sport, job)
      const options = sport.events
        .map((ev) => ({ ev, entry: entryFor(g, sport, job, ev), name: cal.find((c) => c.id === ev.id)?.name ?? ev.name }))
        .filter((x) => x.entry && !d.played.includes(x.ev.id))
      if (!options.length) return tell(g, 'Season Calendar', `You've played every ${sport.eventWord} you're eligible for this season. The rest of the season plays out at the end of the year.`, sport.emoji)
      const tierWord: Record<IndEvent['tier'], string> = { minor: '', tour: '', major: 'Major · ', finals: 'Finals · ' }
      scriptChoice(
        g,
        enterScript,
        'Season Calendar',
        `${rankLabel(d.rank)}. Which ${sport.eventWord} do you want to enter? (Events you skip are played at the end of the season.)`,
        [
          ...options.map((x) => ({
            id: x.ev.id,
            label: `${x.name} · ${tierWord[x.ev.tier]}${sport.format === 'race' ? (x.ev.prize ? `${short(x.ev.prize)} win bonus` : 'race') : `${short(x.ev.prize)} to the winner`}${x.entry === 'qualify' ? ' (qualifying)' : ''}`,
            emoji: x.ev.tier === 'major' ? '\u{1F31F}' : x.ev.tier === 'finals' ? '\u{1F3C6}' : sport.emoji,
          })),
          { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
        ],
        { emoji: sport.emoji },
      )
    },
  }
}

// ---------------------------------------------------------------------------
// Training

const practiceScript = defineScript('sports.ind.practice', (g, choice, data) => {
  if (choice === 'cancel') return
  const sportId = String((data as { sport?: string } | undefined)?.sport ?? '')
  const sport = indSport(sportId)
  if (!sport || !sport.attrs.includes(choice)) return
  const job = indJob(g)
  const pro = job && jd(job).sport === sport.id
  if (!useYearAction(g, `sports.ind.practice.${sport.id}.${choice}`, 1)) return tell(g, 'Practice', `You've already drilled your ${choice.toLowerCase()} this year.`, '\u{1F971}')
  if (!pro) {
    const fee = localFee(g, 60)
    const paid = payFee(g, fee)
    if (!paid) return tell(g, 'Practice', `A session with a ${sport.name.toLowerCase()} coach costs ${money(fee)}. You can't afford it.`, '\u{1F4B8}')
  }
  const rec = sportRecord(g, sport)
  const coach = job && pro ? jd(job).coach : 0
  const youth = g.character.age < 22 ? 1.2 : g.character.age > sport.peak[1] ? 0.6 : 1
  const gain = trainGain(g, rec.attrs[choice] ?? 0, 3, 7, (1 + coach * 0.25) * youth * (talentMatches(g, /athlet|sport/i) ? 1.2 : 1))
  rec.attrs[choice] = Math.min(100, (rec.attrs[choice] ?? 0) + gain)
  if (!rec.practiced.includes(choice)) rec.practiced.push(choice)
  addHidden(g, 'discipline', 1)
  log(g, `I worked on my ${choice.toLowerCase()} in ${sport.name.toLowerCase()}.`)
  say(g, 'Practice', `${pick(g, ['Your coach made you repeat it until you did it in your sleep.', 'Hours of drills. Blisters in places you forgot you had.', 'It finally clicked halfway through the session.'])} ${choice}: ${rec.attrs[choice]}%.`, sport.emoji, 'good')
})

function practiceAction(sport: IndSport, id: string, minAge: number): MenuAction {
  return {
    type: 'action',
    id,
    label: 'Practice',
    emoji: '\u{1F3AF}',
    subtitle: 'Work on a skill (each once a year)',
    disabledReason: (g) => sportsGate(g, minAge) ?? placeReason(g, sport),
    run: (g) => {
      const rec = viewRecord(g, sport.id)
      scriptChoice(
        g,
        practiceScript,
        `${sport.name} Practice`,
        'Which part of your game do you want to work on?',
        [
          ...sport.attrs.map((a) => ({ id: a, label: `${a}${rec ? ` (${Math.round(rec.attrs[a] ?? 0)}%)` : ''}${yearActionsUsed(g, `sports.ind.practice.${sport.id}.${a}`) ? ' · done' : ''}`, emoji: '\u{1F3AF}' })),
          { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
        ],
        { emoji: sport.emoji, data: { sport: sport.id } },
      )
    },
  }
}

/** Exposed for youth programs: train one attribute of a sport (no fee, no limit check). */
export function youthTrain(g: GameState, sportId: string, boost: number): string {
  const sport = indSport(sportId)
  if (!sport) return ''
  const rec = sportRecord(g, sport)
  const attr = [...sport.attrs].sort((a, b) => (rec.attrs[a] ?? 0) - (rec.attrs[b] ?? 0))[0]
  const gain = trainGain(g, rec.attrs[attr] ?? 0, 2, 5, boost)
  rec.attrs[attr] = Math.min(100, (rec.attrs[attr] ?? 0) + gain)
  return attr
}

/** Youth/junior level for a sport (0-100), or 0 when never played. */
export function juniorLevel(g: GameState, sportId: string): number {
  const sport = indSport(sportId)
  const rec = viewRecord(g, sportId)
  if (!sport || !rec) return 0
  return Math.round(avgAttr(sport, rec) * 0.8 + rec.fitness * 0.2)
}

// ---------------------------------------------------------------------------
// Turning pro

function teamFor(g: GameState, sport: IndSport, tierIdx: number): { team: string; strength: number } {
  const tier = sport.tiers[tierIdx]
  const team = tier.teams?.length ? pick(g, tier.teams) : `${randomCity(g, getCountry(g.character.countryId))} Velo`
  return { team, strength: randInt(g, 40, 90) }
}

function salaryFor(tier: IndTier, rating: number, strength: number): number {
  if (!tier.salary) return 0
  const [lo, hi] = tier.salary
  const t = Math.max(0, Math.min(1, (rating - 55) / 40))
  return tidy(lo + (hi - lo) * t ** 3 * (0.8 + strength / 300))
}

function startCareer(g: GameState, sport: IndSport, disc: string, opts: { tier?: number; team?: string; strength?: number; funded?: boolean } = {}): void {
  const rec = sportRecord(g, sport)
  if (disc) rec.discipline = disc
  rec.retiredAge = null
  const tierIdx = opts.tier ?? 0
  const tier = sport.tiers[tierIdx]
  const t = opts.team ? { team: opts.team, strength: opts.strength ?? 60 } : tier.salary || tier.seatCost ? teamFor(g, sport, tierIdx) : { team: '', strength: 0 }
  const rating = indRating(g, sport, rec)
  const salary = salaryFor(tier, rating, t.strength)
  const { quit } = hire(g, {
    defId: 'sports.ind',
    title: disc && sport.id !== 'cycling' ? `${sport.title} (${disc})` : sport.title,
    company: t.team || tier.name,
    salary,
    data: { sport: sport.id, disc, tier: tierIdx, team: t.team, teamStrength: t.strength, contractYears: t.team ? randInt(g, 1, 3) : 0, funded: !!opts.funded, season: 0, carry: 0, rank: null, earned: 0, played: [], titles: [], results: [], injured: 0, doping: false, coach: 0, standing: 0, lastPos: 0, wage: salary, cal: [], calAge: -1 },
  })
  if (rec.seasons === 0) rec.startAge = g.character.age
  addStat(g, 'happiness', 10)
  log(g, `I turned pro in ${sport.name.toLowerCase()}${t.team ? ` with ${t.team}` : ''}.`, 'good')
  const where = t.team ? `You signed with ${t.team} in ${tier.name}${salary ? ` for ${money(salary)} a year` : ''}.` : `You're starting out on the ${tier.name}, chasing ranking points and prize money.`
  say(g, 'Turned Pro', `${where} Your level: ${rating}/100.${quitNote(quit)}`, sport.emoji, 'good')
}

const motorSeatScript = defineScript('sports.ind.motorSeat', (g, choice, data) => {
  const o = data as unknown as { disc: string; team: string; strength: number; cost: number; funded: boolean }
  if (choice !== 'sign') return
  const sport = indSport('motor')
  if (!sport || !o) return
  if (!o.funded) {
    const paid = payFee(g, o.cost)
    if (!paid) return tell(g, 'Seat', `The seat costs ${money(o.cost)} and you can't raise it. Motor racing: the only sport where the athlete pays to play.`, '\u{1F4B8}')
    if (paid === 'parent') log(g, `My parents paid ${short(o.cost)} for my racing seat.`)
  }
  startCareer(g, sport, o.disc, { tier: 0, team: o.team, strength: o.strength, funded: o.funded })
})

const discScript = defineScript('sports.ind.disc', (g, choice, data) => {
  if (choice === 'cancel') return
  const sportId = String((data as { sport?: string } | undefined)?.sport ?? '')
  const sport = indSport(sportId)
  if (!sport) return
  const disc = sport.disciplines?.includes(choice) ? choice : ''
  turnPro(g, sport, disc)
})

function turnPro(g: GameState, sport: IndSport, disc: string): void {
  const why = proReason(g, sport)
  if (why) return tell(g, 'Turn Pro', why, sport.emoji)
  const rec = sportRecord(g, sport)
  const rating = indRating(g, sport, rec)
  if (rating < 30) {
    log(g, `I tried to turn pro in ${sport.name.toLowerCase()} and got humiliated.`, 'bad')
    return say(g, 'Not Ready', `You entered your first pro ${sport.eventWord} and lost to someone who looked twelve. Your level (${rating}/100) isn't there yet. Practice more first.`, sport.emoji, 'bad')
  }
  if (sport.id === 'motor') {
    const tier = sport.tiers[0]
    const funded = rating >= 68
    const { team, strength } = teamFor(g, sport, 0)
    const cost = funded ? 0 : tidy((tier.seatCost ?? 0) * (0.7 + strength / 200))
    return scriptChoice(
      g,
      motorSeatScript,
      tier.name,
      funded ? `${team} saw your karting results and offered you a fully funded seat in ${tier.name} (car rating ${strength}%).` : `${team} (car rating ${strength}%) will give you a ${tier.name} seat for ${money(cost)} for the season. In racing, drivers bring the money.`,
      [
        { id: 'sign', label: funded ? 'Sign' : `Pay ${short(cost)} and sign`, emoji: '\u{270D}\u{FE0F}' },
        { id: 'no', label: 'Not now', emoji: '\u{274C}' },
      ],
      { emoji: sport.emoji, data: { disc, team, strength, cost, funded } },
    )
  }
  startCareer(g, sport, disc)
}

export function proReason(g: GameState, sport: IndSport): string | null {
  const gate = sportsGate(g, sport.proAge)
  if (gate) return gate
  const place = placeReason(g, sport)
  if (place) return place
  const j = indJob(g)
  if (j && jd(j).sport === sport.id) return `You're already a pro in ${sport.name.toLowerCase()}.`
  const rec = viewRecord(g, sport.id)
  const comeback = !!rec && rec.seasons > 0
  if (!comeback && g.character.age > sport.maxStartAge) return `At ${g.character.age} you're too old to start a pro ${sport.name.toLowerCase()} career from scratch.`
  if (comeback && g.character.age > sport.retire + 5) return `At ${g.character.age}, a comeback in ${sport.name.toLowerCase()} would be a medical event, not a sporting one.`
  return null
}

/** Start the turn-pro flow for a sport (discipline choice first when it has events to pick). */
export function offerTurnPro(g: GameState, sportId: string): void {
  const sport = indSport(sportId)
  if (!sport) return
  if (sport.disciplines?.length) {
    const list = sport.id === 'wrestling' && g.character.gender === 'female' ? ['Freestyle'] : sport.disciplines
    scriptChoice(g, discScript, sport.name, 'Which event will you specialize in as a pro?', [...list.map((d) => ({ id: d, label: d, emoji: sport.emoji })), { id: 'cancel', label: 'Not now', emoji: '\u{274C}' }], { emoji: sport.emoji, data: { sport: sport.id } })
    return
  }
  turnPro(g, sport, '')
}

function turnProAction(sport: IndSport): MenuAction {
  return {
    type: 'action',
    id: `sports.ind.${sport.id}.pro`,
    label: sport.id === 'motor' ? 'Find a Race Seat' : sport.id === 'cycling' ? 'Join a Pro Team' : 'Turn Pro',
    emoji: '\u{1F31F}',
    subtitle: (g) => {
      const rec = viewRecord(g, sport.id)
      return rec && rec.seasons > 0 ? 'Make a comeback' : `Start on the ${sport.tiers[0].name} (age ${sport.proAge}+)`
    },
    disabledReason: (g) => proReason(g, sport),
    confirm: (g) => (g.character.job ? `Going pro means quitting your job as ${g.character.job.title}. Continue?` : null),
    run: (g) => offerTurnPro(g, sport.id),
  }
}

// ---------------------------------------------------------------------------
// Career actions

const coachScript = defineScript('sports.ind.coach', (g, choice) => {
  const job = indJob(g)
  if (!job || choice === 'cancel') return
  const d = jd(job)
  const level = Number(choice)
  if (!Number.isFinite(level) || level < 0 || level > 2) return
  if (level === d.coach) return
  if (level > 0) {
    const fee = coachFee(g, level)
    if (!payFee(g, fee)) return tell(g, 'Coach', `That coach costs ${money(fee)} a year. You can't afford them.`, '\u{1F4B8}')
  }
  d.coach = level
  if (level === 0) {
    log(g, 'I fired my coach.')
    return say(g, 'Coach', 'You fired your coach. They took the stopwatch with them.', '\u{1F4CB}')
  }
  log(g, `I hired ${level === 2 ? 'an elite' : 'a full-time'} coach.`, 'good')
  say(g, 'Coach', level === 2 ? 'You hired a legendary coach who has produced three world champions and zero compliments.' : 'You hired a full-time coach. They believe in you. They are also on your payroll.', '\u{1F4CB}', 'good')
})

function coachFee(g: GameState, level: number): number {
  return level === 2 ? tidy(150_000 * Math.max(0.5, wealth(g))) : tidy(25_000 * Math.max(0.4, wealth(g)))
}

const fitnessAction: MenuAction = {
  type: 'action',
  id: 'sports.ind.fitness',
  label: 'Strength & Conditioning',
  emoji: '\u{1F4AA}',
  subtitle: 'Improve your fitness (once a year)',
  disabledReason: (g) => sportsGate(g, 0),
  run: (g) => {
    const job = indJob(g)
    if (!job) return
    if (!useYearAction(g, 'sports.ind.fitness', 1)) return tell(g, 'Conditioning', "You've already done your conditioning block this year. Your legs filed a complaint.", '\u{1F971}')
    const sport = sportOfJob(job)
    const rec = sportRecord(g, sport)
    rec.fitness = Math.min(100, rec.fitness + trainGain(g, rec.fitness, 3, 7))
    addStat(g, 'health', 2)
    addHidden(g, 'athleticism', 1)
    log(g, 'I did a brutal strength and conditioning block.')
    say(g, 'Conditioning', `${pick(g, ['Hill sprints at dawn. Your trainer called it "fun".', 'You lifted, ran, stretched and cried, in that order.', 'Ice baths, sled pushes and a lot of oatmeal.'])} Fitness: ${rec.fitness}%.`, '\u{1F4AA}', 'good')
  },
}

const rehabAction: MenuAction = {
  type: 'action',
  id: 'sports.ind.rehab',
  label: 'Rehab',
  emoji: '\u{1FA7A}',
  subtitle: 'Work with the physio to heal faster',
  visible: (g) => {
    const j = indJob(g)
    return !!j && jd(j).injured > 0
  },
  disabledReason: (g) => sportsGate(g, 0),
  run: (g) => {
    const job = indJob(g)
    if (!job) return
    if (!useYearAction(g, 'sports.ind.rehab', 1)) return tell(g, 'Rehab', 'Your physio says more rehab this year would just be expensive stretching.', '\u{1FA7A}')
    const sport = sportOfJob(job)
    if (chance(g, 0.6)) {
      jd(job).injured = 0
      for (const inj of sport.injuries) healInjury(g, inj)
      log(g, 'Rehab got me back to full fitness.', 'good')
      return say(g, 'Rehab', 'Months of rehab paid off. You are cleared to compete again.', '\u{1FA7A}', 'good')
    }
    say(g, 'Rehab', "Rehab is going slowly. You'll have to sit out more of the season.", '\u{1FA7A}', 'bad')
  },
}

const dopeAction: MenuAction = {
  type: 'action',
  id: 'sports.ind.dope',
  label: 'Performance Enhancers',
  emoji: '\u{1F489}',
  subtitle: 'A chemical shortcut',
  visible: (g) => {
    const j = indJob(g)
    return !!j && !jd(j).doping
  },
  disabledReason: (g) => sportsGate(g, 0),
  confirm: () => 'Doping can get you banned and stripped of your results. Do it anyway?',
  run: (g) => {
    const job = indJob(g)
    if (!job) return
    jd(job).doping = true
    addHidden(g, 'karma', -5)
    addStat(g, 'health', -3)
    log(g, 'I started taking performance enhancers.', 'bad')
    say(g, 'Performance Enhancers', pick(g, ['A "sports nutritionist" with no website sold you a fridge full of tiny bottles. You feel incredible.', 'You started a "recovery protocol" your federation would not approve of.']), '\u{1F489}', 'bad')
  },
}

function retireInd(g: GameState, forced: boolean): void {
  const job = indJob(g)
  if (!job) return
  const sport = sportOfJob(job)
  const rec = sportRecord(g, sport)
  rec.retiredAge = g.character.age
  const best = rec.majors ? `${plural(rec.majors, 'major')}` : rec.bestRank ? `best ranking No. ${rec.bestRank}` : `${plural(rec.titles, 'title')}`
  const legacy = Math.min(100, rec.majors * 9 + rec.titles * 1.5 + rec.crowns * 15 + (rec.bestRank !== null ? Math.max(0, 40 - rec.bestRank / 2) : 0))
  recordCareer(g, { sport: sport.name, kind: sport.group === 'combat' ? 'combat' : 'individual', from: rec.startAge, best, legacy })
  leave(g, 'retired')
  log(g, `I retired from professional ${sport.name.toLowerCase()}.`, 'event')
  say(g, 'Retired', `${forced ? 'Your body made the decision for you. ' : ''}You retired from ${sport.name.toLowerCase()} after ${plural(rec.seasons, 'season')}: ${plural(rec.titles, 'title')}${rec.majors ? `, ${plural(rec.majors, 'major')}` : ''}${rec.crowns ? `, ${plural(rec.crowns, 'championship')}` : ''}, ${short(rec.earnings)} in prize money${rec.bestRank ? `, best ranking No. ${rec.bestRank}` : ''}.`, '\u{1F3C5}', 'good')
}

function statsMenu(sport: IndSport, id: string): MenuGroup {
  return {
    type: 'menu',
    id,
    label: 'Stats & Titles',
    emoji: '\u{1F4C8}',
    subtitle: (g) => {
      const rec = viewRecord(g, sport.id)
      return rec ? `${plural(rec.titles, 'title')} · ${plural(rec.majors, 'major')} · best ${rec.bestRank ? `No. ${rec.bestRank}` : 'unranked'}` : 'No record yet'
    },
    children: (g): MenuNode[] => {
      const rec = viewRecord(g, sport.id)
      if (!rec) return [{ type: 'info', id: `${id}.none`, text: `You haven't played ${sport.name.toLowerCase()} seriously yet.`, emoji: sport.emoji }]
      const job = indJob(g)
      const nodes: MenuNode[] = [{ type: 'info', id: `${id}.lvl`, emoji: '\u{2B50}', text: `Level ${indRating(g, sport, rec, job && jd(job).sport === sport.id ? job : null)}/100 · Fitness ${Math.round(rec.fitness)}%` }]
      for (const a of sport.attrs) nodes.push({ type: 'info', id: `${id}.a.${a}`, emoji: '\u{1F3AF}', text: `${a}: ${Math.round(rec.attrs[a] ?? 0)}%` })
      nodes.push({ type: 'info', id: `${id}.career`, emoji: '\u{1F3C6}', text: `${plural(rec.seasons, 'season')} · ${plural(rec.titles, 'title')} · ${short(rec.earnings)} prize money` })
      rec.majorList.slice(-8).forEach((m, i) => nodes.push({ type: 'info', id: `${id}.m${i}`, emoji: '\u{1F31F}', text: m }))
      if (job && jd(job).sport === sport.id) jd(job).results.slice(-6).forEach((r, i) => nodes.push({ type: 'info', id: `${id}.r${i}`, emoji: '\u{1F4CB}', text: `This season: ${r}` }))
      return nodes
    },
  }
}

export function individualJobNodes(g: GameState): MenuNode[] {
  const job = indJob(g)
  if (!job) return []
  const sport = sportOfJob(job)
  const d = jd(job)
  const tier = sport.tiers[Math.min(d.tier, sport.tiers.length - 1)]
  const standing = sport.format === 'race' ? `${d.standing} pts this season` : rankLabel(d.rank)
  return [
    { type: 'info', id: 'sports.ind.status', emoji: sport.emoji, text: `${job.title} · ${d.team ? `${d.team}, ` : ''}${tier.name} · ${standing} · ${short(d.earned)} won this season${d.injured > 0 ? ' · INJURED' : ''}` },
    competeAction(),
    practiceAction(sport, 'sports.ind.practice', 0),
    fitnessAction,
    rehabAction,
    {
      type: 'action',
      id: 'sports.ind.coachHire',
      label: 'Coaching Team',
      emoji: '\u{1F4CB}',
      subtitle: () => (d.coach === 2 ? 'Elite coach' : d.coach === 1 ? 'Full-time coach' : 'No coach'),
      disabledReason: (gg) => sportsGate(gg, 0),
      run: (gg) =>
        scriptChoice(
          gg,
          coachScript,
          'Coaching Team',
          'Coaches speed up your practice and add a little to every performance. Their fee is paid up front for the year.',
          [
            { id: '1', label: `Full-time coach (${short(coachFee(gg, 1))}/yr)`, emoji: '\u{1F4CB}' },
            { id: '2', label: `Elite coach (${short(coachFee(gg, 2))}/yr)`, emoji: '\u{1F451}' },
            { id: '0', label: 'Fire the coach', emoji: '\u{1F6AA}' },
            { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
          ],
          { emoji: '\u{1F4CB}' },
        ),
    },
    statsMenu(sport, 'sports.ind.stats'),
    dopeAction,
    {
      type: 'action',
      id: 'sports.ind.retire',
      label: 'Retire',
      emoji: '\u{1F3D6}\u{FE0F}',
      subtitle: `Retire from ${sport.name.toLowerCase()}`,
      confirm: () => `Retire from professional ${sport.name.toLowerCase()}?`,
      run: (gg) => retireInd(gg, false),
    },
  ]
}

/** One sport's row in Sports › Individual Sports (or Combat Sports for judo/wrestling). */
export function sportMenu(sport: IndSport): MenuGroup {
  return {
    type: 'menu',
    id: `sports.ind.${sport.id}`,
    label: sport.name,
    emoji: sport.emoji,
    subtitle: (g) => {
      const j = indJob(g)
      if (j && jd(j).sport === sport.id) return `Pro · ${sport.format === 'race' ? `${jd(j).standing} pts` : rankLabel(jd(j).rank)}`
      const where = placeReason(g, sport)
      if (where) return 'Not available where you live'
      return popularTag(g, sport.locale) || `${sport.tiers[sport.tiers.length - 1].name}${sport.olympic ? ' · Olympic sport' : ''}`
    },
    header: (g) => {
      const majors = sport.events.filter((e) => e.tier === 'major').map((e) => e.name.replace('{demonym}', getCountry(g.character.countryId).demonym))
      const rec = viewRecord(g, sport.id)
      const lvl = rec ? ` Your level: ${indRating(g, sport, rec)}/100.` : ''
      return `${sport.tiers.map((t) => t.name).join(' → ')}.${majors.length ? ` The big ones: ${majors.join(', ')}.` : ''}${sport.olympic ? ` Olympic sport (${sport.olympic} Games).` : ''} Pros from age ${sport.proAge}.${lvl}${placeReason(g, sport) ? ` ${placeReason(g, sport)}` : ''}`
    },
    children: (g): MenuNode[] => {
      const j = indJob(g)
      if (j && jd(j).sport === sport.id) return [{ type: 'info', id: `sports.ind.${sport.id}.pro.info`, emoji: sport.emoji, text: `You're a pro. Manage your career from Occupation › My Work.` }, statsMenu(sport, `sports.ind.${sport.id}.stats`)]
      const nodes: MenuNode[] = [turnProAction(sport)]
      if (g.character.age >= 16) nodes.push(practiceAction(sport, `sports.ind.${sport.id}.practice`, 16))
      else nodes.push({ type: 'info', id: `sports.ind.${sport.id}.kids`, emoji: '\u{1F9D2}', text: 'Kids learn through Sports › Youth Sports (junior programs and academies).' })
      if (viewRecord(g, sport.id)) nodes.push(statsMenu(sport, `sports.ind.${sport.id}.stats`))
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// The season (yearly)

function simulateRestOfSeason(g: GameState, sport: IndSport, job: Job, rec: IndRecord, scale: number): { titles: string[]; majorsBest: string[] } {
  const d = jd(job)
  const titles: string[] = []
  const majorsBest: string[] = []
  if (d.injured > 0) scale *= 0.4
  const cal = calendar(g, sport, job, true)
  for (const ev of sport.events) {
    if (d.played.includes(ev.id)) continue
    const entry = entryFor(g, sport, job, ev)
    if (!entry) continue
    if (scale < 1 && ev.tier !== 'major' && !chance(g, scale)) continue
    const name = cal.find((c) => c.id === ev.id)?.name ?? ev.name
    const r = playEvent(g, sport, job, rec, ev, name, entry, false)
    if (!r.outcome) continue
    const line = bookResult(g, sport, job, rec, ev, name, r.outcome, true)
    if (r.outcome.won) titles.push(name)
    else if (ev.tier === 'major' && !r.outcome.qualifyingLoss) majorsBest.push(line)
  }
  const tier = sport.tiers[Math.min(d.tier, sport.tiers.length - 1)]
  const n = Math.round(tier.auto * scale)
  let autoWins = 0
  for (let i = 0; i < n; i++) {
    const ev: IndEvent = { id: `auto${i}`, name: tier.autoName, tier: d.tier === 0 ? 'minor' : 'tour', prize: tier.autoPrize, pts: tier.autoPts, field: tier.autoField }
    const r = playEvent(g, sport, job, rec, ev, tier.autoName, 'direct', false)
    if (!r.outcome) continue
    const o = r.outcome
    if (o.prize > 0) {
      earnIncome(g, o.prize)
      d.earned += o.prize
      rec.earnings += o.prize
    }
    if (sport.format === 'race') d.standing += o.pts
    else d.season += o.pts
    if (o.won) {
      autoWins += 1
      rec.titles += 1
    }
  }
  if (autoWins) titles.push(`${plural(autoWins, 'smaller event')}`)
  updateRank(g, sport, job, true)
  return { titles, majorsBest }
}

/** Motor racing: where your points put you in the championship. */
function championshipPosition(g: GameState, points: number, tierLevel: number): number {
  const leader = 330 + tierLevel * 1.2
  let ahead = 0
  for (let i = 0; i < 19; i++) {
    const rival = leader * 0.84 ** i * (0.85 + rand(g) * 0.3)
    if (rival > points) ahead += 1
  }
  return ahead + 1
}

const nextTierScript = defineScript('sports.ind.nextTier', (g, choice, data) => {
  const job = indJob(g)
  const o = data as unknown as { tier: number; team: string; strength: number; salary: number }
  if (!job || !o || choice !== 'accept') return
  const sport = sportOfJob(job)
  const d = jd(job)
  const tier = sport.tiers[o.tier]
  if (!tier) return
  d.tier = o.tier
  d.team = o.team
  d.teamStrength = o.strength
  d.contractYears = randInt(g, 2, 3)
  d.funded = true
  job.company = o.team
  job.salary = o.salary
  d.wage = o.salary
  addFame(g, 4)
  log(g, `I signed with ${o.team} in ${tier.name}.`, 'good')
  say(g, tier.name, `You signed with ${o.team} in ${tier.name}${o.salary ? ` for ${money(o.salary)} a year` : ' with a funded seat'}.`, sport.emoji, 'good')
})

const retireAskScript = defineScript('sports.ind.retireAsk', (g, choice) => {
  if (choice === 'retire') retireInd(g, false)
  else log(g, 'I decided to keep competing for another season.')
})

export function yearlyIndividual(g: GameState): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const job = indJob(g)
  if (!job) return
  syncTenure(g, job)
  const sport = sportOfJob(job)
  const d = jd(job)
  const rec = sportRecord(g, sport)
  let tierIdx = Math.min(d.tier, sport.tiers.length - 1)
  const tier = sport.tiers[tierIdx]

  // Paying for the season: coaching, travel, entry fees (lower circuits hurt).
  const costs = tierIdx === 0 ? tidy(sport.costs * Math.max(0.5, Math.min(1, wealth(g) + 0.2))) : tidy(sport.costs * 1.5)
  const coach = d.coach ? coachFee(g, d.coach) : 0
  let scale = 1
  if (costs > 0) {
    const payer = payFee(g, costs)
    if (!payer) {
      // Spend what you have on the half-season you can afford.
      if (c.money > 0) c.money = 0
      scale = 0.5
      log(g, "I couldn't afford a full season of travel, so I skipped half the schedule.", 'bad')
    } else if (payer === 'parent') log(g, 'My parents paid for my season on tour.')
  }
  if (coach > 0 && !payFee(g, coach)) {
    d.coach = 0
    log(g, "I couldn't afford my coach anymore.", 'bad')
  }

  const { titles, majorsBest } = simulateRestOfSeason(g, sport, job, rec, scale)
  rec.seasons += 1

  // Salaries, stipends and appearance fees.
  let pay = 0
  const wage = typeof d.wage === 'number' && Number.isFinite(d.wage) ? d.wage : 0
  if (tier.salary && wage > 0) pay += wage
  const rankNow = d.rank
  if (sport.stipend && rankNow !== null && rankNow <= 60) pay += tidy(sport.stipend * Math.max(0.3, wealth(g)))
  if (sport.appearance && c.hidden.fame >= 20 && d.injured === 0) pay += tidy((c.hidden.fame / 100) ** 2 * sport.appearance * (0.7 + rand(g) * 0.6))
  if (pay > 0) earnIncome(g, pay)

  // Standings / ranking.
  let summary: string
  let offer: { tier: number; team: string; strength: number; salary: number } | null = null
  if (sport.format === 'race') {
    const pos = championshipPosition(g, d.standing, tier.level)
    d.lastPos = pos
    summary = `You finished ${ordinal(pos)} in the ${tier.name} championship with ${d.standing} points.`
    if (pos === 1) {
      rec.crowns += 1
      count(g, 'championships')
      addFame(g, tierIdx === 2 ? 15 : 5)
      addBuzz(g, tierIdx === 2 ? 30 : 10)
      honor(g, `Won the ${tier.name} drivers' championship.`, `${tier.name} Champion`, sport.name, tierIdx === 2 ? 10 : 6)
      summary = `You're the ${tier.name} champion! ${d.standing} points.`
    }
    if (tierIdx < sport.tiers.length - 1 && (pos <= 3 || (pos <= 6 && indRating(g, sport, rec) >= 75))) {
      const nt = sport.tiers[tierIdx + 1]
      const t = teamFor(g, sport, tierIdx + 1)
      offer = { tier: tierIdx + 1, team: t.team, strength: t.strength, salary: salaryFor(nt, indRating(g, sport, rec), t.strength) }
    }
    d.standing = 0
  } else {
    summary = `You finished the season ${rankNow === null ? 'unranked' : `ranked ${rankLabel(rankNow)}`}.`
    if (sport.id === 'cycling' && tierIdx === 0 && rankNow !== null && rankNow <= (sport.tiers[1].enterRank ?? 150)) {
      const t = teamFor(g, sport, 1)
      offer = { tier: 1, team: t.team, strength: t.strength, salary: salaryFor(sport.tiers[1], indRating(g, sport, rec), t.strength) }
    }
    // Drop back to the lower circuit after a bad year.
    if (tierIdx > 0 && !tier.salary && (rankNow === null || rankNow > (tier.enterRank ?? 100) * 2.2)) {
      d.tier = tierIdx - 1
      tierIdx = d.tier
      job.company = sport.tiers[d.tier].name
      log(g, `I lost my place on the ${tier.name}.`, 'bad')
      summary += ` Your ranking dropped you back to the ${sport.tiers[d.tier].name}.`
    }
    d.carry = Math.round(d.season * 0.4)
    d.season = 0
  }
  const earned = d.earned
  // How famous a world No. 1 gets depends on how much the world cares about the sport.
  const reach = 0.55 + sport.appeal * 0.45
  if (rankNow !== null) fameToward(g, (rankNow <= 1 ? 85 : rankNow <= 5 ? 65 : rankNow <= 20 ? 45 : rankNow <= 60 ? 25 : 10) * reach, 5)
  if (sport.format === 'race' && d.lastPos) fameToward(g, (tierIdx === 2 ? (d.lastPos <= 3 ? 80 : 50) : 15) * reach, 5)

  // Show the season.
  const titleLine = titles.length ? ` Titles: ${titles.join(', ')}.` : ''
  const majorLine = majorsBest.length ? ` Majors: ${majorsBest.slice(0, 3).join('; ')}.` : ''
  log(g, `My ${ordinal(rec.seasons)} ${sport.name.toLowerCase()} season: ${short(earned)} won${titles.length ? `, ${titles.length} title${titles.length === 1 ? '' : 's'}` : ''}.`, titles.length ? 'good' : 'neutral')
  say(g, `${sport.name} Season`, `${summary}${titleLine}${majorLine} Prize money: ${short(earned)}${pay > 0 ? `, plus ${short(pay)} in salary, funding and appearance fees` : ''}.`, sport.emoji, titles.length ? 'good' : 'neutral')
  job.salary = tidy(earned + pay)
  d.earned = 0
  d.played = []
  d.titles = []
  d.results = []
  d.cal = []

  // Bodies age; skills you don't use fade.
  for (const a of sport.attrs) {
    let delta = 0
    if (c.age < sport.peak[0]) delta += randInt(g, 1, 3)
    delta -= ageDecline(c.age, sport.peak[1]) > 0 ? randInt(g, 1, 2) + Math.floor(ageDecline(c.age, sport.peak[1]) / 3) : rec.practiced.includes(a) ? 0 : randInt(g, 0, 1)
    rec.attrs[a] = Math.max(1, Math.min(100, (rec.attrs[a] ?? 0) + delta))
  }
  rec.practiced = []
  if (c.age > sport.peak[1]) rec.fitness = Math.max(10, rec.fitness - randInt(g, 1, 3))
  if (d.injured > 0) d.injured -= 1
  if (sport.knocks) addHeadTrauma(g, sport.knocks)

  // Doping control.
  const wasDoping = d.doping
  d.doping = false
  if (chance(g, wasDoping ? 0.33 : 0.03)) {
    if (wasDoping) {
      sportsBan(g, 2, 'a failed drug test')
      rec.retiredAge = c.age
      leave(g, 'fired')
      log(g, 'I failed a drug test and was banned from competition.', 'bad')
      return say(g, 'Positive Test', `An out-of-competition test caught you. You were banned for two years and stripped of this season's results. Your sponsors issued statements using the word "disappointed".`, '\u{1F9EA}', 'bad')
    }
    log(g, 'I passed a random drug test.')
  }

  // Contracts (teams), the next step up, and retirement.
  if (offer) {
    const nt = sport.tiers[offer.tier]
    scriptChoice(
      g,
      nextTierScript,
      nt.name,
      `${offer.team} (car/team rating ${offer.strength}%) wants you in ${nt.name}${offer.salary ? ` for ${money(offer.salary)} a year` : ' with a fully funded seat'}.`,
      [
        { id: 'accept', label: 'Sign', emoji: '\u{270D}\u{FE0F}' },
        { id: 'no', label: 'Stay where you are', emoji: '\u{1F6AB}' },
      ],
      { emoji: sport.emoji, data: offer as unknown as Json },
    )
    return
  }
  if (d.team) {
    d.contractYears -= 1
    if (d.contractYears <= 0) {
      const t = sport.tiers[d.tier]
      if (t.seatCost && !d.funded) {
        const cost = tidy(t.seatCost * (0.7 + d.teamStrength / 200))
        if (!payFee(g, cost)) {
          rec.retiredAge = c.age
          leave(g, 'other')
          log(g, `I lost my ${t.name} seat because I couldn't pay for it.`, 'bad')
          return say(g, 'Seat Lost', `Your seat at ${d.team} was up for renewal and you couldn't find the ${money(cost)} it costs. Someone with a richer uncle has it now.`, sport.emoji, 'bad')
        }
      }
      if (t.salary && indRating(g, sport, rec) < t.level - 18) {
        retireInd(g, true)
        return
      }
      d.contractYears = randInt(g, 1, 3)
      if (t.salary) d.wage = salaryFor(t, indRating(g, sport, rec), d.teamStrength)
      log(g, `I signed a new contract with ${d.team}.`)
    }
  }
  if (c.age >= sport.retire + 4 || (c.age >= sport.retire && indRating(g, sport, rec) < 40)) {
    retireInd(g, true)
    return
  }
  if (c.age >= sport.retire) {
    scriptChoice(
      g,
      retireAskScript,
      'Retirement?',
      `You're ${c.age}. Your body creaks in ways it didn't used to. Is it time to hang it up?`,
      [
        { id: 'retire', label: 'Retire', emoji: '\u{1F3D6}\u{FE0F}' },
        { id: 'keep', label: 'One more season', emoji: '\u{1F4AA}' },
      ],
      { emoji: sport.emoji },
    )
  }
}

/** Status for the Olympics and the AI: sport, rating, ranking (or null when not competing). */
export function individualStatus(g: GameState): { sport: IndSport; rating: number; rank: number | null; disc: string } | null {
  const job = indJob(g)
  if (!job) return null
  const sport = sportOfJob(job)
  const rec = viewRecord(g, sport.id)
  if (!rec) return null
  return { sport, rating: indRating(g, sport, rec, job), rank: sport.format === 'race' ? null : jd(job).rank, disc: jd(job).disc }
}

export function individualSummary(g: GameState): string {
  const job = indJob(g)
  if (!job) return ''
  const sport = sportOfJob(job)
  const d = jd(job)
  const rec = viewRecord(g, sport.id)
  return `${sport.name}${d.disc ? ` (${d.disc})` : ''}, ${sport.tiers[d.tier]?.name ?? ''}, ${sport.format === 'race' ? `${d.standing} pts` : rankLabel(d.rank)}${rec ? `, ${rec.titles} titles, ${rec.majors} majors` : ''}`
}
