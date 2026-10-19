// The hired CEO's step on the Operations Desk. Above skill 75 a hired CEO scores every option of every
// lever, changes at most two a year inside the board's budget and the cash reserve, and reports each
// change as one short line of the yearly letter. Every change goes through applyLever, so the same
// checks hold as for the owner. board-ceo.ts imports this file, so it takes its own turn type and the
// payback limit as arguments instead of importing them back.
import { yearActionsUsed } from '../core'
import type { Asset, GameState } from '../types'
import type { BoardState } from './board-state'
import { capexLeft, reserveDollars } from './board-vote'
import { LETTER_WORDS, letterWords, SMART_SKILL } from './career'
import { bizWorth, LASTING_YEARS } from './economy'
import { modelOf, sectorCtx, sectorText, type CopyTable, type LeverDef, type LeverOption } from './sector-kit'
import { applyLever, leverValue } from './sector-menu'
import { familyOf, readSector } from './sector-state'
import type { BizState, Manager } from './state'
import { money } from './util'

/** The most levers a hired CEO changes in a year. */
export const SECTOR_MAX_CHANGES = 2

/** The letter lines, longest form first. None starts with Cut, Let, Closed, Retired, Opened or Built (the CEO's coda goes there). */
export const CEO_COPY: CopyTable = {
  'ceo.set.log': 'Set ${lever} to ${setting}, worth ${gain} a year.',
  'ceo.setShort.log': 'Set ${lever}, worth ${gain} a year.',
  'ceo.buy.log': 'Spent ${cost} on ${lever}, worth ${gain} a year.',
  'ceo.buyShort.log': 'Spent ${cost}, worth ${gain} a year.',
  'ceo.fallback.log': 'Changed a lever, worth ${gain} a year.',
}

/** The part of board-ceo's turn this step uses (its own Turn is passed as is; it mutates `lines` and `moved`). */
export interface SectorTurn {
  g: GameState
  a: Asset
  b: BizState
  m: Manager
  st: BoardState
  judge: (v: number) => number
  lines: string[]
  moved: number
  reserved: number
}

/** Audits, programs and overhauls skip the payback test: any positive value will do (the budget and the reserve still bind). */
const PAYBACK_EXEMPT: ReadonlySet<string> = new Set(['audit', 'program', 'overhaul'])

interface Move {
  lever: LeverDef
  option: LeverOption
  cost: number
  /** What the CEO believes the change is worth, after the price. */
  value: number
}

const same = (x: number, y: number): boolean => Math.abs(x - y) < 1e-9

function letterLine(m: Move, gain: number): string {
  const vals = { lever: m.lever.label.charAt(0).toLowerCase() + m.lever.label.slice(1), setting: m.option.label, cost: money(m.cost), gain: money(gain) }
  const keys = m.cost > 0 ? ['ceo.buy.log', 'ceo.buyShort.log'] : ['ceo.set.log', 'ceo.setShort.log']
  for (const key of keys) {
    const line = sectorText(CEO_COPY, key, vals)
    if (letterWords(line) <= LETTER_WORDS) return line
  }
  return sectorText(CEO_COPY, 'ceo.fallback.log', vals)
}

/** The best option of each lever the CEO may still change this year, by what they believe it is worth. */
function candidates(t: SectorTurn, levers: readonly LeverDef[], cash: boolean): Move[] {
  const { g, a, b } = t
  const st = readSector(b)
  if (!st) return []
  const worth = bizWorth(g, b)
  const cx = sectorCtx(g, b, g.year)
  const out: Move[] = []
  for (const lever of levers) {
    if (yearActionsUsed(g, `sector.${lever.id}.${a.id}`) >= 1) continue
    const now = lever.current(st, g.year)
    const scored = lever.options(g, b, st)
      .filter((o) => !same(o.value, now))
      .map((option): Move => ({
        lever, option, cost: Math.max(0, Math.round(lever.cost(g, b, st, option.value, cx))), value: t.judge(leverValue(g, a, b, st, lever, option.value, worth, cx)),
      }))
      .filter((x) => Number.isFinite(x.value))
    let best = scored.reduce<Move | null>((top, x) => (!top || x.value > top.value ? x : top), null)
    if (best && cash && best.value > 0) {
      // A cash mandate takes the cheaper option when it is within 5% of the best.
      const top = best
      const cheaper = scored.filter((x) => x.cost < top.cost && x.value >= top.value * .95).sort((x, y) => x.cost - y.cost)[0]
      if (cheaper) best = cheaper
    }
    if (best && best.value > 0) out.push(best)
  }
  return out.sort((x, y) => y.value - x.value)
}

/**
 * One year of the CEO's work on the desk. Does nothing at skill 75 or below or without a record. Each
 * change needs a positive value and a price inside what the budget and the reserve leave; a paid
 * lever also has to pay back within `maxPayback` years, except an audit, a program or an overhaul.
 */
export function sectorTurn(t: SectorTurn, maxPayback: number): void {
  const { g, a, b } = t
  if (t.m.skill <= SMART_SKILL || !readSector(b)) return
  const family = familyOf(b.industry)
  const model = family ? modelOf(family) : null
  if (!model) return
  let changes = 0
  for (const move of candidates(t, model.levers, t.st.mandate === 'cash')) {
    if (changes >= SECTOR_MAX_CHANGES) break
    const room = Math.max(0, Math.min(capexLeft(g, b, t.st), b.cash - reserveDollars(b, t.st) - t.reserved))
    if (move.cost > room) continue
    const gain = (move.value + move.cost) / LASTING_YEARS
    if (move.cost > 0 && !PAYBACK_EXEMPT.has(move.lever.id) && (gain <= 0 || move.cost / gain > maxPayback)) continue
    const r = applyLever(g, a, move.lever.id, move.option.value, 'ceo')
    if (!r.ok) continue
    changes++
    t.moved += r.paid
    t.lines.push(letterLine(move, Math.round(gain)))
  }
}
