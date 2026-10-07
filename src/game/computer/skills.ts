// Coding skill and related at-home computer stats (plain JSON in g.flags). Owned by the dev
// side (computer/dev.ts); the money side reads it (a better coder writes a slicker scam site).
//
// - g.flags.codingSkill: overall coding skill 0-100.
// - g.flags.codingLangs: { python: 42, scratch: 80, ... } per-language level 0-100.
// - g.flags.lastCodedAge: the last age you wrote code (skill rusts after a few idle years).
// - g.flags.screenTime: { age, hours } computer sessions this year (parents notice; grades suffer).
//   Anything done at the computer (either side) can call addScreenTime.
import type { GameState, Json } from '../types'
import { eraOpen, type EraGate } from './era'

const KEY = 'codingSkill'
const LANGS_KEY = 'codingLangs'
const CODED_KEY = 'lastCodedAge'
const SCREEN_KEY = 'screenTime'

/** Coding skill 0-100 (0 = has never written a line). */
export function codingSkill(g: GameState): number {
  const v = g.flags[KEY]
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0
}

/** Add (or remove) coding skill, clamped to 0-100. Returns the new value. */
export function addCodingSkill(g: GameState, delta: number): number {
  const next = Math.max(0, Math.min(100, Math.round(codingSkill(g) + (Number.isFinite(delta) ? delta : 0))))
  g.flags[KEY] = next
  return next
}

/** "Newbie", "Beginner", "Intermediate", "Advanced", "Expert", "Wizard". */
export function codingSkillLabel(skill: number): string {
  if (skill >= 90) return 'Wizard'
  if (skill >= 72) return 'Expert'
  if (skill >= 52) return 'Advanced'
  if (skill >= 30) return 'Intermediate'
  if (skill >= 10) return 'Beginner'
  return 'Newbie'
}

/** How good a coder can get by this age: a 9-year-old is not shipping compilers yet. */
export function codingCeiling(age: number): number {
  if (age >= 18) return 100
  return Math.max(15, Math.min(100, 12 + (age - 8) * 9))
}

// ---------------------------------------------------------------------------
// Programming languages

export interface CodingLanguage {
  id: string
  label: string
  emoji: string
  /** Youngest age it's offered at. */
  minAge: number
  /** Oldest age it's offered at (Scratch is for kids). */
  maxAge?: number
  /** 0-1: harder languages teach slower but impress more. */
  difficulty: number
  /** What it's good for (menu subtitle). */
  good: string
  /** What it unlocks: 'web', 'apps', 'games', 'data', 'systems', 'mods', 'kids'. */
  uses: string[]
  /** When you can learn it at home (BASIC on an 80s micro, Swift once phones run apps...). */
  era?: EraGate
  /** The blurb before phones ran apps (JavaScript was for web pages, Java for applets). */
  goodBeforeApps?: string
}

export const CODING_LANGUAGES: CodingLanguage[] = [
  { id: 'scratch', label: 'Scratch', emoji: '\u{1F431}', minAge: 8, maxAge: 14, difficulty: 0.05, good: 'Drag-and-drop blocks and a cartoon cat', uses: ['kids'], era: { tech: 'internet', from: 2007 } },
  { id: 'html', label: 'HTML & CSS', emoji: '\u{1F310}', minAge: 9, difficulty: 0.15, good: 'Websites (technically not programming, says everyone)', uses: ['web'], era: { tech: 'internet', from: 1993 } },
  { id: 'python', label: 'Python', emoji: '\u{1F40D}', minAge: 9, difficulty: 0.3, good: 'Scripts, bots, data and nearly everything', uses: ['data', 'web', 'bots'], era: { tech: 'internet', from: 1995 } },
  { id: 'javascript', label: 'JavaScript', emoji: '\u{1F7E8}', minAge: 10, difficulty: 0.4, good: 'Web apps, browser extensions, chaos', goodBeforeApps: 'Web pages that blink, pop up and occasionally work', uses: ['web', 'apps', 'bots', 'browser'], era: { tech: 'internet', from: 1996 } },
  { id: 'lua', label: 'Lua', emoji: '\u{1F319}', minAge: 10, difficulty: 0.3, good: 'Game mods and scripting', uses: ['mods', 'games'], era: { from: 2003 } },
  { id: 'sql', label: 'SQL', emoji: '\u{1F5C4}\u{FE0F}', minAge: 12, difficulty: 0.35, good: 'Databases (every business runs on one)', uses: ['data'], era: { from: 1986 } },
  { id: 'swift', label: 'Swift', emoji: '\u{1F426}', minAge: 12, difficulty: 0.5, good: 'Phone apps', uses: ['apps'], era: { tech: 'smartphone', from: 2014 } },
  { id: 'cpp', label: 'C++', emoji: '\u{2699}\u{FE0F}', minAge: 13, difficulty: 0.75, good: 'Games and engines (and segfaults)', uses: ['games', 'systems'], era: { from: 1987 } },
  { id: 'rust', label: 'Rust', emoji: '\u{1F980}', minAge: 14, difficulty: 0.85, good: 'Fast, safe systems code; you will mention it often', uses: ['systems', 'web'], era: { from: 2015 } },
  // The languages of earlier home computers (appended so old saves keep their ids).
  { id: 'basic', label: 'BASIC', emoji: '\u{1F4DF}', minAge: 8, difficulty: 0.1, good: 'Type-in games from magazines; 10 PRINT "HELLO"', uses: ['kids', 'games'], era: { tech: 'homeComputer', until: 1999 } },
  { id: 'logo', label: 'Logo', emoji: '\u{1F422}', minAge: 7, maxAge: 13, difficulty: 0.05, good: 'Steer a little turtle that draws shapes', uses: ['kids'], era: { tech: 'homeComputer', from: 1980, until: 2006 } },
  { id: 'pascal', label: 'Pascal', emoji: '\u{1F4D8}', minAge: 12, difficulty: 0.4, good: 'Tidy, structured programs (your teacher insists)', uses: ['systems', 'data'], era: { tech: 'homeComputer', until: 2005 } },
  { id: 'assembly', label: 'Assembly', emoji: '\u{1F9EE}', minAge: 13, difficulty: 0.8, good: 'Talking straight to the chip: fast games, demos, headaches', uses: ['games', 'systems'], era: { tech: 'homeComputer', until: 1998 } },
  { id: 'c', label: 'C', emoji: '\u{1F523}', minAge: 13, difficulty: 0.7, good: 'Operating systems, games and pointers to pointers', uses: ['systems', 'games', 'data'], era: { tech: 'homeComputer', from: 1980 } },
  { id: 'java', label: 'Java', emoji: '\u{2615}', minAge: 13, difficulty: 0.5, good: 'Business software, phone apps, enterprise everything', goodBeforeApps: 'Business software, web applets, enterprise everything', uses: ['apps', 'web', 'data'], era: { from: 1996 } },
]

/** What a language is good for, in words of the year (no "phone apps" in 1998). */
export function languageBlurb(g: GameState, lang: CodingLanguage, year = g.year): string {
  return lang.goodBeforeApps && !eraOpen(g, { tech: 'smartphone' }, year) ? lang.goodBeforeApps : lang.good
}

/** Languages a beginner could pick up at home in that year (the rest are on the CODING_LANGUAGES list for old skills). */
export function languagesInEra(g: GameState, year = g.year): CodingLanguage[] {
  return CODING_LANGUAGES.filter((l) => eraOpen(g, l.era, year))
}

/** True when the language can be learned at home this year. */
export function languageInEra(g: GameState, id: string, year = g.year): boolean {
  const l = getLanguage(id)
  return !!l && eraOpen(g, l.era, year)
}

/** The language a curious kid starts with at home this year (BASIC in 1984, HTML in 1999, Scratch in 2015). */
export function kidLanguage(g: GameState, year = g.year): string {
  const ok = (id: string) => languageInEra(g, id, year)
  if (ok('scratch')) return 'scratch'
  if (year >= 1997 && ok('html')) return 'html'
  if (ok('basic')) return 'basic'
  if (ok('html')) return 'html'
  if (ok('logo')) return 'logo'
  if (ok('python')) return 'python'
  return languagesInEra(g, year)[0]?.id ?? 'scratch'
}

export function getLanguage(id: string): CodingLanguage | undefined {
  return CODING_LANGUAGES.find((l) => l.id === id)
}

/** Per-language levels 0-100 (validated; old saves have none). */
export function codingLanguages(g: GameState): Record<string, number> {
  const raw = g.flags[LANGS_KEY]
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && getLanguage(k)) out[k] = Math.max(0, Math.min(100, Math.round(v)))
  }
  return out
}

export function languageLevel(g: GameState, id: string): number {
  return codingLanguages(g)[id] ?? 0
}

/** Add language practice, clamped 0-100. Returns the new level. */
export function addLanguageXp(g: GameState, id: string, delta: number): number {
  if (!getLanguage(id)) return 0
  const langs = codingLanguages(g)
  const next = Math.max(0, Math.min(100, Math.round((langs[id] ?? 0) + (Number.isFinite(delta) ? delta : 0))))
  if (next > 0) langs[id] = next
  else delete langs[id]
  g.flags[LANGS_KEY] = langs as Json
  return next
}

/** Language labels you actually know (level >= min), best first. */
export function knownLanguages(g: GameState, min = 10): string[] {
  return Object.entries(codingLanguages(g))
    .filter(([, v]) => v >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => getLanguage(id)?.label ?? id)
}

/** The best level among languages that are good for `use` ('web', 'apps', 'games'...). */
export function bestLanguageFor(g: GameState, use: string): { id: string; level: number } | null {
  let best: { id: string; level: number } | null = null
  for (const [id, level] of Object.entries(codingLanguages(g))) {
    const lang = getLanguage(id)
    if (!lang || !lang.uses.includes(use)) continue
    if (!best || level > best.level) best = { id, level }
  }
  return best
}

// ---------------------------------------------------------------------------
// Practice, rust and screen time

/** Record that you wrote code this year (skill rusts after a few idle years). */
export function markCoded(g: GameState): void {
  g.flags[CODED_KEY] = g.character.age
}

/** Age you last wrote code, or null if never. */
export function lastCodedAge(g: GameState): number | null {
  const v = g.flags[CODED_KEY]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Computer sessions logged at `age` (defaults to this year). */
export function screenTime(g: GameState, age = g.character.age): number {
  const v = g.flags[SCREEN_KEY]
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 0
  const a = v.age
  const h = v.hours
  return typeof a === 'number' && a === age && typeof h === 'number' && Number.isFinite(h) ? Math.max(0, h) : 0
}

/** Log computer sessions for this year. Returns this year's total. */
export function addScreenTime(g: GameState, sessions = 1): number {
  const total = screenTime(g) + (Number.isFinite(sessions) ? Math.max(0, sessions) : 0)
  g.flags[SCREEN_KEY] = { age: g.character.age, hours: Math.round(total) }
  return Math.round(total)
}

/** Sessions in a year past which parents, grades and eyeballs start to complain. */
export const SCREEN_LIMIT = 9
