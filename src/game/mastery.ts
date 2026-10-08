// Main Character Syndrome (talents.ts MainCharacter): the character has every talent, and anything
// they do, learn, train for or practice for the first time jumps straight to mastery.
//
// Mastery, precisely: the FIRST time a main character does a thing (a craft, an instrument, a
// language, a sport or martial art, a school subject, a job, a driving test...), the thing's level
// is lifted to the top of its scale, or to the practical top where age or the body sets a ceiling
// (a nine-year-old still can't write a novel; a toddler still can't pilot a plane). Later practice
// keeps it at the ceiling of the day (so a kid's mastery grows to the adult top as they age) and
// the skill does not decay. Everything else stays as it was: access rules, age gates, licenses,
// money and health requirements, luck (casino, lottery, scratch cards, coin flips, chance of being
// caught) and the world's answer (a master still meets other masters; fame, contracts and wins
// stay probabilistic; an 80-year-old master sprinter is still 80).
//
// Surfaces: one short funny line the first time per thing, as a log line, and as a bundled popup
// at most once a year (the rest are log lines only). The record is plain JSON in
// g.flags['mcs.mastered'], tagged with the character so an heir starts clean.
//
// Never call these from menu renderers (subtitles, hints, previews): they write state. Call them
// from actions and yearly hooks only. Non-main characters never reach any of this code's effects
// and never consume g's RNG here.
import { addRelationship, addStat, getPerson, log, notice, peopleBy, remember, scriptChoice } from './core'
import { chance, pick, randInt } from './rng'
import { defineScript } from './scripts'
import { hasMainCharacter } from './talents'
import type { GameState, Json } from './types'

/** What kind of thing was mastered (picks the wording of the first-time line). */
export type MasteryFamily =
  | 'creative'
  | 'instrument'
  | 'stage'
  | 'coding'
  | 'language'
  | 'sport'
  | 'martial'
  | 'esports'
  | 'driving'
  | 'school'
  | 'job'
  | 'crime'
  | 'craft'
  | 'business'
  | 'trading'

interface MasteryRecord {
  owner: string
  /** Mastered keys, with the age they were mastered at. */
  done: Record<string, number>
  /** Calendar year of the last first-time popup (one popup a year at most). */
  noticeYear: number
  /** Age at the last friend moment (no two within three years); missing on early records. */
  momentAge?: number
}

const FLAG = 'mcs.mastered'

/** The record belongs to one character (an heir has another id); a new name or a move changes nothing. */
function ownerOf(g: GameState): string {
  const c = g.character
  return `${c.id}:${g.year - c.age}`
}

function recordOf(g: GameState, create: boolean): MasteryRecord | null {
  const v = g.flags[FLAG] as unknown
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const r = v as Partial<MasteryRecord>
    if (r.owner === ownerOf(g) && r.done && typeof r.done === 'object' && !Array.isArray(r.done)) return r as MasteryRecord
  }
  if (!create) return null
  const fresh: MasteryRecord = { owner: ownerOf(g), done: {}, noticeYear: -1 }
  g.flags[FLAG] = fresh as unknown as Json
  return fresh
}

/** True when this thing was already mastered by the (main) character. Pure; safe in menus. */
export function isMastered(g: GameState, key: string): boolean {
  return masteredAt(g, key) !== null
}

/** The age at which a thing was mastered, or null. Pure. */
export function masteredAt(g: GameState, key: string): number | null {
  const v = recordOf(g, false)?.done[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** How many things the main character has mastered so far. Pure. */
export function masteredCount(g: GameState): number {
  return masteredKeys(g).length
}

/** The mastered keys (for the profile line and tests). Pure. */
export function masteredKeys(g: GameState): string[] {
  const r = recordOf(g, false)
  return r ? Object.keys(r.done).filter((key) => typeof r.done[key] === 'number' && Number.isFinite(r.done[key])) : []
}

/** Skills do not rust for a main character once the thing is mastered. Pure. */
export function keepsSkill(g: GameState, key?: string): boolean {
  return hasMainCharacter(g) && (key === undefined ? masteredCount(g) > 0 : isMastered(g, key))
}

// ---------------------------------------------------------------------------
// The first-time line

const YOU: Record<MasteryFamily, string[]> = {
  creative: [
    'You tried {s} for the first time and it came out like a prizewinner. Critics, who did not exist yet, were stunned. You were not.',
    'You started {s} with no experience and finished with something that looked like it belonged in a museum gift shop. A good one.',
    'You sat down to try {s} "just to see" and made it look like the easiest thing in the world. A few people left the room quietly.',
  ],
  craft: [
    'You tried {s} for the first time and had the touch of someone with thirty years behind them. The instructions looked embarrassed.',
    'You gave {s} a go with no experience. It turned out perfectly. The experts nearby suddenly remembered errands.',
    'You picked up {s} like you had always known how. Nobody asked how. Everybody wanted to.',
  ],
  instrument: [
    'You picked up the {s} for the first time and played like you had been touring for twenty years. The room clapped. You were not surprised.',
    'You touched the {s} for the first time and a song just happened. The music teacher asked if you were secretly a professional. You said "kind of."',
    'Your first ever go on the {s} sounded like a live album. A neighbor started crying. It was the good kind.',
  ],
  stage: [
    'You tried {s} for the first time and the room went quiet in the right way. Somebody whispered "who is that?" You smiled like the answer was obvious.',
    'You stepped into {s} with zero training and absolutely owned it. The coach checked the paperwork twice.',
    'Your first {s} lesson ended with the teacher asking if you could teach the class. You could.',
  ],
  coding: [
    'You wrote {s} for the first time and it ran on the first try. The bugs checked their calendars and left.',
    'You sat down with {s} on a whim and finished the whole tutorial in one go, with notes on how to improve it. The documentation owes you an apology.',
    'You typed your first ever lines of {s}. Every bug lined up and surrendered. Experienced programmers get tired just hearing about it.',
  ],
  language: [
    'You spent one day with {s} and now you dream in it. Waiters have started reading the menu to you slowly and then stopped.',
    'You said your first sentence in {s} and a stranger asked which town you grew up in. Nowhere near it, you said, in perfect {s}.',
    'You opened the {s} lesson for the first time and finished the course by dinner. Your tutor wrote you a congratulations note, then a slightly concerned one.',
  ],
  sport: [
    'You tried {s} for the first time and played like you had done it for years. The coach checked your birth certificate to be sure you were new.',
    'Your first practice of {s} ended with a standing ovation from people who were supposed to be your opponents. The scouts started making calls.',
    'You walked into {s} with no experience and the whole room recalibrated. Even the mascot looked nervous.',
  ],
  martial: [
    'You stepped onto the mat for {s} for the first time and moved like the instructor in your head. The sensei bowed. You bowed back, politely.',
    'Your first {s} class ended with the instructor asking where you trained before. "Nowhere," you said, and made him sit down.',
    'You tried {s} for the first time and the senior students quietly rearranged the line so you would not be in front of them.',
  ],
  esports: [
    'You booted up {s} for the first time and the leaderboard held a quiet moment. Then it reshuffled.',
    'You played {s} for the first time and your opponents typed "is this a smurf?" You were just yourself.',
    'Your first ever match of {s} ended in a clean sweep. Chat was divided between awe and demanding a refund.',
  ],
  driving: [
    'You took the {s} like you had been born holding a steering wheel. The examiner checked the paperwork, then asked for a ride home.',
    'The {s} was supposed to be nerve-racking. You parallel parked on the first try, in one move, and the examiner applauded quietly into the clipboard.',
    'Your {s} went so well the examiner stopped writing notes and just watched. You were not surprised.',
  ],
  school: [
    'You opened {s} for the first time and the exam felt like a formality. Your classmates started a support group.',
    'You sat through your first {s} class and corrected the teacher, politely, three times. The teacher took notes.',
    'You approached {s} for the first time like a final boss you had already beaten once in a dream. Your textbook seems relieved to be understood.',
  ],
  job: [
    'You started as {s} on day one and by lunch you were fixing problems nobody had reported. HR is still working out what to put in your review.',
    'It was your first day as {s} and you already knew where everything was. Even the printer behaved. Coworkers have begun to talk.',
    'Your first week as {s} ended with a handshake from the person in the corner office, who asked what you were doing next. You had an answer ready.',
  ],
  crime: [
    'You tried {s} for the first time and had the quick hands of a veteran. Your conscience, if you are curious, said "oh no" in a very quiet voice.',
    'Your first ever attempt at {s} went off without a hitch. You were not sure if you should feel proud or concerned. Both, probably.',
    'You approached {s} like you had planned it for years. You had not. The plan just showed up in your head, fully formed.',
  ],
  business: [
    'You ran {s} for the first time and the numbers lined up like they had been waiting for you. The accountant asked if you had a twin.',
    'You made your first move in {s} and it landed. Your competitors started updating their résumés as a precaution.',
    'You studied {s} for exactly one afternoon and walked out with a plan that mostly made sense. Mostly was enough.',
  ],
  trading: [
    'You placed your first options trade like someone who had read every book on it. The market, as always, had not read the book.',
    'You sized your first trade with the calm of a veteran and a stop you actually respected. The market remained the market.',
    'You studied the order book once and made every sensible decision on the list. Luck was invited, and did not RSVP.',
  ],
}

const ME: Record<MasteryFamily, string[]> = {
  creative: ['I tried {s} for the first time and it came out like a masterpiece. Naturally.', 'I started {s} and mastered it on the first go.'],
  craft: ['I tried {s} for the first time and mastered it on the spot.', 'I picked up {s} and nailed it immediately. Main character things.'],
  instrument: ['I picked up the {s} for the first time and played like a pro.', 'I mastered the {s} on the first try. The room clapped.'],
  stage: ['I tried {s} for the first time and owned it.', 'I walked into {s} with zero training and the teacher asked for tips.'],
  coding: ['I wrote my first {s} and it ran perfectly the first time.', 'I picked up {s} and mastered it in an afternoon.'],
  language: ['I picked up {s} in a day and dreamed in it that night.', 'I started learning {s} and was fluent before dinner.'],
  sport: ['I tried {s} for the first time and played like a veteran.', 'I took up {s} and the coach asked how long I had been playing. Never.'],
  martial: ['I stepped onto the mat for {s} and moved like a master.', 'My first {s} class ended with the sensei bowing to me.'],
  esports: ['I played {s} for the first time and topped the table.', 'I started {s} and my opponents asked if I was a smurf.'],
  driving: ['I aced my {s} on the first go. The examiner was impressed.', 'My {s} went perfectly. Nobody was surprised.'],
  school: ['I started {s} and it felt like a formality.', 'I picked up {s} and corrected the teacher. Politely.'],
  job: ['I started as {s} and ran the place by lunch.', 'My first day as {s} went suspiciously well.'],
  crime: ['I tried {s} for the first time and had the hands of a veteran.', 'My first attempt at {s} went off without a hitch. Concerning.'],
  business: ['I ran {s} for the first time and it all fit together.', 'I made my first move in {s} and it landed.'],
  trading: ['I placed my first {s} trade with a veteran\'s calm. The market did what markets do.', 'I made every sensible decision in {s}. Luck was not obliged.'],
}

/** Every line this module can write, with a sample subject (for the era lint in tests). */
export function allMasteryTexts(): string[] {
  const out: string[] = []
  for (const list of Object.values(YOU)) for (const t of list) out.push(fill(t, 'the subject'))
  for (const list of Object.values(ME)) for (const t of list) out.push(fill(t, 'the subject'))
  return [...out, ...FLAVOR_QUIET, ...FLAVOR_EYES]
}

/** A stable small number from a string (no RNG: wording must not change anyone's dice). */
function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function fill(template: string, subject: string): string {
  return template.split('{s}').join(subject)
}

/** The second-person line shown in the popup (exported for tests and the profile). */
export function masteryLine(family: MasteryFamily, subject: string, key = subject): string {
  const list = YOU[family]
  return fill(list[hashOf(key) % list.length], subject)
}

/**
 * Note that the main character did `key` for the first time: marks it mastered, writes the funny
 * line to the journal and, once a year at most, shows it as a popup. Returns true on the first
 * time, false when it was already mastered or the character is not a main character.
 */
export function masterFirstTime(g: GameState, key: string, family: MasteryFamily, subject: string, opts: { popup?: boolean } = {}): boolean {
  if (!hasMainCharacter(g) || !g.character.alive) return false
  const rec = recordOf(g, true)!
  if (typeof rec.done[key] === 'number' && Number.isFinite(rec.done[key])) return false
  rec.done[key] = g.character.age
  const mine = ME[family]
  if (opts.popup !== false && rec.noticeYear !== g.year) {
    rec.noticeYear = g.year
    notice(g, 'Instant Mastery', masteryLine(family, subject, key), { emoji: '\u{1F31F}', tone: 'good' })
    log(g, fill(mine[hashOf(key) % mine.length], subject), 'good')
  } else {
    log(g, fill(mine[hashOf(key) % mine.length], subject), 'good')
  }
  if (masteredCount(g) === 1) remember(g, `Mastered ${subject} on the very first try.`)
  return true
}

/**
 * The level a thing should have after the character practiced it: for a main character the first
 * time (and every time after) it is lifted to `top` (the practical top: the age or body ceiling of
 * the day, at most 100); everybody else keeps `current`. Never lowers a value.
 */
export function liftSkill(g: GameState, key: string, family: MasteryFamily, subject: string, current: number, top = 100): number {
  if (!hasMainCharacter(g)) return current
  masterFirstTime(g, key, family, subject)
  const cap = Number.isFinite(top) ? Math.max(0, Math.min(100, top)) : 100
  return Math.max(current, Math.round(cap))
}

/**
 * "A mastered sport still needs the right league and years": the level a main character can show
 * in a competitive field climbs with the years since they first took it up, from the middle of
 * the pack to the top over about ten years (technique is instant; fitness, reputation, chemistry
 * and the other masters in the field are not). 100 (no cap) for everybody else. Pure.
 */
export function experienceCap(g: GameState, startAge: number | null | undefined): number {
  if (!hasMainCharacter(g)) return 100
  const years = typeof startAge === 'number' && Number.isFinite(startAge) ? Math.max(0, g.character.age - startAge) : 0
  return Math.min(100, Math.round(42 + 6 * years))
}

/** experienceCap counted from the year the thing was first done (100 when not mastered or not a main character). Pure. */
export function masteryCap(g: GameState, key: string): number {
  if (!hasMainCharacter(g)) return 100
  return experienceCap(g, masteredAt(g, key))
}

/** Main Character Syndrome for running a company: call when the character takes charge of a company or group. */
export function masterBusiness(g: GameState): void {
  masterFirstTime(g, 'business.run', 'business', 'running a company')
}

/**
 * The floor a mastered owner-CEO's skill (or group chair's capture) never falls below (0 for
 * everybody else). Pure: safe in menus and previews. Bounded at 85 so a hired star CEO is still
 * better, and a kid's is lower.
 */
export function businessFloor(g: GameState): number {
  if (!hasMainCharacter(g) || !isMastered(g, 'business.run')) return 0
  return Math.round(ageCeiling(g.character.age, { from: 12, full: 20, floor: 35 }) * 0.85)
}

/**
 * Cap a freshly grown value at the practical top for a main character (their normal practice gain
 * must not carry a kid's mastery past what a kid can do); everybody else is left alone. Never
 * lowers a value below `prev`.
 */
export function capAt(g: GameState, value: number, top: number, prev: number): number {
  if (!hasMainCharacter(g)) return value
  return Math.max(prev, Math.min(value, Number.isFinite(top) ? top : 100))
}

/**
 * "The world still responds": a master competes against other masters. True when a contest the
 * main character should win on skill alone goes to someone else this time (default one in five).
 * Always false (and no RNG) for everybody else, so ordinary lives roll exactly as before.
 */
export function crowdedField(g: GameState, odds = 0.2): boolean {
  return hasMainCharacter(g) && chance(g, odds)
}

/** True when `key` was mastered by a main character who should now be at the ceiling (pure). */
export function atTop(g: GameState, key: string): boolean {
  return hasMainCharacter(g) && isMastered(g, key)
}

// ---------------------------------------------------------------------------
// Ceilings shared by the sites (age and body)

/**
 * The practical top of a 0-100 skill at this age: a floor for little kids, linear growth between
 * `from` and `full`, then 100. Old age or poor health trims it a little (a body is a body).
 */
export function ageCeiling(age: number, opts: { from?: number; full?: number; floor?: number; slowFrom?: number } = {}): number {
  const from = opts.from ?? 6
  const full = opts.full ?? 18
  const floor = opts.floor ?? 25
  let top = age >= full ? 100 : age <= from ? floor : floor + ((100 - floor) * (age - from)) / Math.max(1, full - from)
  if (opts.slowFrom !== undefined && age > opts.slowFrom) top -= Math.min(30, (age - opts.slowFrom) * 0.9)
  return Math.max(0, Math.min(100, Math.round(top)))
}

/** A physical ceiling that falls with age and low health, for sports and fighting (the world's rivals are not frozen). */
export function bodyCeiling(g: GameState, opts: { peakEnd: number; floor?: number } = { peakEnd: 32 }): number {
  const c = g.character
  const floor = opts.floor ?? 25
  const over = Math.max(0, c.age - opts.peakEnd)
  const age = ageCeiling(c.age, { from: 6, full: 18, floor })
  const health = c.stats.health >= 50 ? 0 : (50 - c.stats.health) * 0.6
  return Math.max(10, Math.min(100, Math.round(age - over * 1.4 - health)))
}

// ---------------------------------------------------------------------------
// The lifestyle: the plot revolves around you

const FLAVOR_QUIET = [
  'A stranger on the bus told me they had just seen their favorite show and I looked exactly like a character in it. I probably do.',
  'I walked into a cafe and the barista said "the usual?" It was my first time there.',
  'The traffic light turned green exactly as I arrived. It does that a lot.',
  'I heard a stranger on the street say "no way, that is the person from my dream." I smiled and kept walking.',
  'Rain started the moment I decided to have a Meaningful Walk. It stopped when I got home.',
  'A song came on in a shop at just the right moment. I did not choose it. The shop did not choose it. I think it was the universe.',
  'I told a story at dinner and everyone stopped chewing to listen. This happens a lot.',
  'The elevator doors opened just as I arrived. I am beginning to suspect they are scripted.',
  'The waiter asked if I wanted dessert and then brought me the exact one I was thinking about.',
]

const FLAVOR_EYES = [
  'I explained to a friend how a bad week worked out well for me. They rolled their eyes so hard I heard it.',
  'I mentioned that things "just tend to work out" for me. A friend very quietly set down their coffee.',
  'My friends threw me a surprise party and I said I already knew. I did not. I should say these things less.',
  'I turned a friend\'s birthday dinner into a story about me by accident. They noticed. They are being good about it.',
  'A friend said "this isn\'t about you." I said "everything is about me, but nicely." They rolled their eyes.',
]

const SPOTLIGHT = defineScript('mcs.spotlight', (g, choice, data) => {
  const id = data && typeof data === 'object' && !Array.isArray(data) && typeof data.personId === 'string' ? data.personId : ''
  const f = getPerson(g, id)
  if (!f || !f.alive) return
  if (choice === 'share') {
    addRelationship(f, 4)
    addStat(g, 'happiness', 1)
    log(g, `I handed the spotlight back to ${f.firstName}. It felt strange. In a good way.`, 'good')
  } else if (choice === 'steal') {
    addRelationship(f, -4)
    addStat(g, 'happiness', 3)
    log(g, `I took the spotlight from ${f.firstName}. It fit perfectly. ${f.firstName} noticed.`, 'neutral')
  } else {
    addRelationship(f, 1)
    addStat(g, 'happiness', 2)
    log(g, `I made a joke about being the main character. ${f.firstName} laughed. Mostly.`, 'neutral')
  }
})

/**
 * A light yearly dose of main-character life: a funny journal line now and then, sometimes a
 * friend rolling their eyes at it, and every few years a small "spotlight" choice. Costs and
 * gains are tiny and bounded (a few relationship points, a few points of happiness), nothing
 * touches money, and a moment never repeats within three years. Consumes RNG only for main
 * characters.
 */
export function yearlyMainCharacter(g: GameState): void {
  const c = g.character
  if (!hasMainCharacter(g) || !c.alive || c.age < 5) return
  if (chance(g, 0.3)) log(g, pick(g, FLAVOR_QUIET), 'good')
  if (c.age < 10 || c.prison) return
  const rec = recordOf(g, true)!
  const last = typeof rec.momentAge === 'number' ? rec.momentAge : -9
  if (c.age - last < 3) return
  const friends = peopleBy(g, ['friend', 'bestFriend'])
  if (friends.length === 0) return
  if (chance(g, 0.12)) {
    const f = pick(g, friends)
    rec.momentAge = c.age
    addRelationship(f, -randInt(g, 1, 3))
    addStat(g, 'happiness', 1)
    log(g, `${pick(g, FLAVOR_EYES)} (${f.firstName} still loves me. Mostly.)`, 'neutral')
  } else if (c.age >= 12 && chance(g, 0.06)) {
    const f = pick(g, friends)
    rec.momentAge = c.age
    scriptChoice(
      g,
      SPOTLIGHT,
      'The Spotlight',
      `${f.firstName} was in the middle of telling everyone some big news when you walked in. The room turned to look at you, like the camera had just cut to the main character. ${f.firstName} paused. What do you do?`,
      [
        { id: 'share', label: `Hand the spotlight back to ${f.firstName}`, emoji: '\u{1F91D}' },
        { id: 'steal', label: 'Accept the spotlight', emoji: '\u{1F31F}' },
        { id: 'joke', label: 'Make a joke about it', emoji: '\u{1F604}' },
      ],
      { emoji: '\u{1F31F}', data: { personId: f.id } },
    )
  }
}
