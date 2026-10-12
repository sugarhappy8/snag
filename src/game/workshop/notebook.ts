// Workshop access: the owner's record (pure read, mutable write with a one-time migration),
// the invention assets, which ideas can strike now (era, technology, history race) and the
// companies that can make a given invention.
import { count, log } from '../core'
import { anachronistic } from '../events/era'
import { hasTech } from '../history/timeline'
import { pick, rand } from '../rng'
import { blocked, ownerKey } from '../special/common'
import { hasTalent } from '../talents'
import type { Asset, GameState, Json } from '../types'
import { ownerControls } from '../business/board'
import { isFinanceFirm } from '../business/finance-firm-state'
import { manageBlock } from '../business/gate'
import { businessAssets, readBiz } from '../business/state'
import { ALL_IDEAS, CATEGORIES, isHistory, type Category, type IdeaDef } from './catalog'
import { inventionValue } from './market'
import { legacyProfile, migrateLegacy, readInv, workshopFromLegacy } from './migrate'
import { FLAG, NOTEBOOK_MAX, SEEN_MAX, emptyWorkshop, invDef, normalizeWorkshop, ownsWorkshop, saveInv, type Inv, type MadeEntry, type NoteIdea, type Workshop } from './state'

export const MIN_AGE = 8

export function isGenius(g: GameState): boolean {
  return hasTalent(g, 'Inventor')
}

/** The current character's workshop. Pure: safe in menus (old saves are read, not written). */
export function readWorkshop(g: GameState): Workshop {
  const raw = g.flags[FLAG]
  if (raw && ownsWorkshop(g, raw)) return normalizeWorkshop(g, raw)
  const old = legacyProfile(g)
  return old ? workshopFromLegacy(g, old) : emptyWorkshop(g)
}

/** Mutable workshop for actions and hooks; writes it (and any pending migration) first. */
export function mutWorkshop(g: GameState, settled = g.year - 1): Workshop {
  migrateLegacy(g, settled)
  const ws = readWorkshop(g)
  ws.owner = ownerKey(g)
  g.flags[FLAG] = ws as unknown as Json
  return ws
}

export function workshopBlock(g: GameState, minAge = MIN_AGE): string | null {
  return blocked(g, minAge)
}

/** Reputation (0-100): gains shrink near the top (Legendary takes legendary deeds), losses don't. */
export function addRep(ws: Workshop, delta: number): void {
  const d = delta > 0 ? delta * Math.max(0.1, 1 - ws.rep / 110) : delta
  ws.rep = Math.max(0, Math.min(100, Math.round((ws.rep + d) * 10) / 10))
}

export function remember(ws: Workshop, entry: MadeEntry): void {
  ws.made = [...ws.made, entry].slice(-60)
}

export interface Owned { a: Asset; inv: Inv; def: IdeaDef }

/** The player's invention assets (new or old format). Pure. */
export function inventions(g: GameState): Owned[] {
  const out: Owned[] = []
  for (const a of g.assets) {
    if (a.kind !== 'invention') continue
    const inv = readInv(g, a)
    if (inv) out.push({ a, inv, def: invDef(inv) })
  }
  return out
}

export function findInvention(g: GameState, id: string): Owned | null {
  return inventions(g).find((o) => o.a.id === id) ?? null
}

/** Recompute an invention asset's value and store its record. */
export function storeInv(g: GameState, a: Asset, inv: Inv, rep = readWorkshop(g).rep): void {
  saveInv(a, inv)
  a.value = inventionValue(g, inv, invDef(inv), rep)
  a.upkeep = 0
}

// ---------------------------------------------------------------------------
// Which ideas can strike

/** The history race is open to geniuses, or to anyone with skill 80+. */
export function racesHistory(g: GameState, ws: Workshop): boolean {
  return isGenius(g) || ws.skill >= 80
}

export function historyOpen(def: IdeaDef, year: number): boolean {
  return typeof def.real === 'number' && year >= def.real - 25 && year <= def.real
}

/** True when the idea's own words fit this year and country (the anachronism lint's view). Pure. */
export function eraFits(g: GameState, def: IdeaDef): boolean {
  if (def.tech && !hasTech(g, def.tech)) return false
  return !anachronistic(g, `${def.name}. ${def.blurb}`)
}

/** The blurb if its words fit the year, else a plain line. Pure. */
export function blurbOf(g: GameState, def: IdeaDef): string {
  return anachronistic(g, def.blurb) ? `A ${CATEGORIES[def.cat].label.toLowerCase()} idea ahead of its time.` : def.blurb
}

/** Ideas already in the notebook, already made, or owned as an invention. */
export function takenIds(g: GameState, ws: Workshop): Set<string> {
  const out = new Set<string>([...ws.ideas.map((i) => i.id), ...ws.made.map((m) => m.id)])
  for (const o of inventions(g)) out.add(o.inv.idea)
  return out
}

/** Ideas that could strike this year. Pure. */
export function candidates(g: GameState, ws: Workshop): IdeaDef[] {
  const taken = takenIds(g, ws)
  const race = racesHistory(g, ws)
  return ALL_IDEAS.filter((d) => {
    if (taken.has(d.id)) return false
    if (isHistory(d)) return race && historyOpen(d, g.year) && eraFits(g, d)
    return g.year >= d.from && (d.to === undefined || g.year <= d.to) && eraFits(g, d)
  })
}

/** How often a history-race idea strikes compared with an everyday one. */
export const HISTORY_WEIGHT = 0.12

/** Remember that an idea was offered (bounded, newest last). */
export function markSeen(ws: Workshop, id: string): void {
  ws.seen = [...ws.seen.filter((x) => x !== id), id].slice(-SEEN_MAX)
}

/**
 * Draw a new idea (actions and hooks only: uses g's RNG). History ideas are rarer than everyday
 * ones, and ideas offered recently (forgotten, scrapped) wait their turn while fresh ones remain.
 */
export function drawIdea(g: GameState, ws: Workshop): IdeaDef | null {
  const all = candidates(g, ws)
  if (!all.length) return null
  // First the kind (a history-race idea at HISTORY_WEIGHT the odds of an everyday one, as if
  // nothing had been seen), then an idea of that kind, the freshest available.
  const race = all.filter(isHistory)
  const everyday = all.filter((d) => !isHistory(d))
  const raceWeight = race.length * HISTORY_WEIGHT
  const group = race.length && rand(g) * (raceWeight + everyday.length) < raceWeight ? race : everyday.length ? everyday : race
  const age = new Map(ws.seen.map((id, i) => [id, i]))
  const fresh = group.filter((d) => !age.has(d.id))
  // Everything of that kind was offered lately: the one offered longest ago comes back first.
  const def = fresh.length ? pick(g, fresh) : group.reduce((x, y) => ((age.get(y.id) ?? 0) < (age.get(x.id) ?? 0) ? y : x))
  markSeen(ws, def.id)
  return def
}

export function addIdea(g: GameState, ws: Workshop, def: IdeaDef): boolean {
  if (ws.ideas.length >= NOTEBOOK_MAX || ws.ideas.some((i) => i.id === def.id)) return false
  const note: NoteIdea = { id: def.id, got: g.year, q: 0, builds: 0 }
  ws.ideas.push(note)
  count(g, 'ideas')
  return true
}

export function findIdea(ws: Workshop, id: string): NoteIdea | null {
  return ws.ideas.find((i) => i.id === id) ?? null
}

export function dropIdea(ws: Workshop, id: string): void {
  ws.ideas = ws.ideas.filter((i) => i.id !== id)
}

// ---------------------------------------------------------------------------
// Companies that can make it

export function companyFits(industry: string, cat: Category): boolean {
  return !isFinanceFirm({ industry }) && CATEGORIES[cat].industries.test(industry)
}

/** Why this company can't make the invention now, or null. Pure. */
export function companyBlock(g: GameState, a: Asset, cat: Category): string | null {
  const live = businessAssets(g).find((x) => x.id === a.id)
  if (!live) return 'You no longer own this company.'
  const reason = manageBlock(g, live)
  if (reason) return reason
  if (!companyFits(readBiz(g, live).industry, cat)) return "This company can't make that kind of thing."
  if (!ownerControls(g, live)) return "You don't control its board."
  return null
}

/** Companies you own that could make an invention of this category. Pure. */
export function fittingCompanies(g: GameState, cat: Category): Asset[] {
  return businessAssets(g).filter((a) => companyFits(readBiz(g, a).industry, cat))
}

export function logIdea(g: GameState, def: IdeaDef): void {
  log(g, `I had an idea: the ${def.name}. ${def.emoji}`, 'good')
}
