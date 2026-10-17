// Shared fixtures for the Investment Firms 2.0 tests.
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { initFund } from '../src/game/business/fund'
import type { FundType } from '../src/game/business/fund-state'
import { installManager, managerCandidate } from '../src/game/business/career'
import { bizOf, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

export interface FirmOpts { year?: number; countryId?: string; city?: string; cash?: number; skill?: number; money?: number; lifeId?: string; talent?: string }

/** A fresh investment firm of a type, run by its owner unless `skill` hires a CEO. */
export function firm(type: FundType, o: FirmOpts = {}): { g: GameState; a: Asset; b: BizState } {
  const countryId = o.countryId ?? 'us'
  const g = makeTestGame(11, { age: 35, money: o.money ?? 5_000_000, countryId, city: o.city ?? 'Chicago' })
  g.year = o.year ?? 2026
  g.lifeId = o.lifeId ?? 'fund-life'
  g.log = [{ age: 35, year: g.year, entries: [] }]
  if (o.talent) g.character.talent = o.talent as never
  const b0 = newBiz(g, 'investmentFirm', countryId, o.city ?? 'Chicago', { cash: o.cash ?? 2_000_000, founded: g.year })
  initFund(g, b0, type)
  if (o.skill !== undefined) { installManager(g, b0, managerCandidate(g, b0, o.skill)); b0.manager!.skill = o.skill }
  const a = createBusinessAsset(g, 'Test Capital', b0, 1_000_000)
  g.assets.push(a)
  const b = bizOf(g, a)
  return { g, a, b }
}

/** Answer every queued popup with a policy (default: the first choice), like a player would. */
export function drain(g: GameState, choose: (m: { scriptId?: string; choices: { id: string }[] }) => string = m => m.choices[0].id, limit = 60): string[] {
  const seen: string[] = []
  for (let i = 0; i < limit && g.queue.length; i++) {
    const m = g.queue.shift()!
    if (m.kind === 'notice') { seen.push(`${m.title}\n${m.text}`); continue }
    if (m.kind === 'choice' && m.source === 'script' && m.scriptId) { seen.push(`${m.title}\n${m.text}\n${m.choices.map(c => c.label).join(' | ')}`); runScript(g, m.scriptId, choose(m), m.data, m); continue }
    if (m.kind === 'input' && m.scriptId) { runScript(g, m.scriptId, m.defaultValue ?? '0', m.data, m); continue }
    if (m.kind === 'minigame') { runScript(g, m.scriptId, 'skip', m.data, m); continue }
  }
  return seen
}

/** One birthday for the business side of the game. */
export function ageBusinessYear(g: GameState): void {
  g.year++; g.character.age++; g.yearActions = {}
  g.log.push({ age: g.character.age, year: g.year, entries: [] })
  yearlyBusinessImpl(g)
}

/** Visit every node, calling every pure callback a renderer would (hints, previews, children). */
export function walk(g: GameState, nodes: MenuNode[], depth = 0): number {
  let n = 0
  for (const node of nodes) {
    n++
    node.visible?.(g)
    if (node.type === 'info') { if (typeof node.text === 'function') node.text(g); continue }
    if (node.type === 'heading') continue
    if (typeof node.subtitle === 'function') node.subtitle(g)
    node.disabledReason?.(g)
    node.hint?.(g)
    if (node.type === 'action') {
      node.confirm?.(g)
      const input = node.input
      if (input) {
        input.defaultValue?.(g)
        for (const v of [input.min ?? 0, input.max ?? 1, ((input.min ?? 0) + (input.max ?? 1)) / 2]) input.preview?.(g, v)
      }
    } else if (depth < 6) { node.header?.(g); n += walk(g, node.children(g), depth + 1) }
  }
  return n
}

/** Every line of text a renderer would show (labels, subtitles, info, headers, hints, previews). */
export function menuText(g: GameState, nodes: MenuNode[], depth = 0, out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'info') { out.push(typeof node.text === 'function' ? node.text(g) : node.text); continue }
    if (node.type === 'heading') { out.push(node.label); continue }
    out.push(node.label)
    if (node.subtitle) out.push(typeof node.subtitle === 'function' ? node.subtitle(g) : node.subtitle)
    const hint = node.hint?.(g)
    if (hint) out.push(hint)
    if (node.type === 'action') {
      const input = node.input
      if (input?.preview) for (const v of [input.min ?? 0, input.max ?? 1]) out.push(input.preview(g, v))
    } else if (depth < 6) {
      if (node.header) out.push(...node.header(g).split('\n'))
      menuText(g, node.children(g), depth + 1, out)
    }
  }
  return out
}

/** Every number in a JSON value is finite. */
export function allFinite(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  if (Array.isArray(v)) return v.every(allFinite)
  if (v && typeof v === 'object') return Object.values(v).every(allFinite)
  return true
}
