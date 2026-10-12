// Shared fixtures for the Inventor's Workshop review tests.
import { expect } from 'vitest'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { becomeCeo } from '../src/game/business/career'
import { bizOf } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { Asset, GameState, MenuGroup, MenuNode } from '../src/game/types'
import { catalogIdea } from '../src/game/workshop/catalog'
import { addIdea, mutWorkshop } from '../src/game/workshop/notebook'
import { workshopMenu } from '../src/game/workshop/menu'
import { makeTestGame } from './helpers'

export interface InventorOpts { genius?: boolean; age?: number; money?: number; year?: number; seed?: number; talents?: string[] }

/** A US character at a desk in the Workshop (a genius with `genius`). */
export function inventor(opts: InventorOpts = {}): GameState {
  const g = makeTestGame(opts.seed ?? 11, { age: opts.age ?? 30, money: opts.money ?? 5_000_000, talents: opts.talents ?? (opts.genius ? ['Inventor'] : []), countryId: 'us' })
  g.year = opts.year ?? 2026
  g.lifeId = `ws-review-${opts.seed ?? 11}`
  return g
}

/** Put a catalog idea in the notebook with a prototype of quality `q`. */
export function give(g: GameState, id: string, q = 0): void {
  const ws = mutWorkshop(g)
  expect(addIdea(g, ws, catalogIdea(id)!)).toBe(true)
  ws.ideas.find((i) => i.id === id)!.q = q
}

export const idea = (id: string) => ({ kind: 'idea' as const, id })

/** The calendar moves on a year (no hooks). */
export function nextYear(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.queue = []
}

/** Render every row of a menu tree (labels, hints, previews), as the UI would. */
export function walk(g: GameState, nodes: MenuNode[], depth = 0): number {
  let n = 0
  for (const node of nodes) {
    n++
    if (node.type === 'heading') continue
    if (node.type === 'info') { if (typeof node.text === 'function') node.text(g); continue }
    if (typeof node.subtitle === 'function') node.subtitle(g)
    node.visible?.(g)
    node.disabledReason?.(g)
    node.hint?.(g)
    if (node.type === 'action') { node.confirm?.(g); node.input?.defaultValue?.(g) }
    if (node.type === 'menu' && depth < 7) { node.header?.(g); n += walk(g, node.children(g), depth + 1) }
  }
  return n
}

/** A notebook idea's row in the Workshop. */
export function ideaMenu(g: GameState, id: string): MenuGroup {
  return workshopMenu.children(g).find((n) => n.id === `ws.idea.${id}`) as MenuGroup
}

export function inSchool(g: GameState, level: 'elementary' | 'middle' | 'high'): void {
  g.character.education.current = { level, school: 'Test School', year: 1, totalYears: 4, grades: 70, data: {} }
}

/** A manufacturing company the character owns and runs. */
export function company(g: GameState, industry: Industry = 'manufacturing'): Asset {
  const b0 = newBiz(g, industry, 'us', g.character.city, { cash: 5_000_000, founded: g.year - 5 })
  const c = createBusinessAsset(g, 'Gadget Works', b0, 1_000_000)
  g.assets.push(c)
  becomeCeo(g, c, bizOf(g, c))
  g.queue = []
  return c
}
