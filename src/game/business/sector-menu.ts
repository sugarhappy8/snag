// The Operations Desk menu and its one write path. applyLever is the only way a lever changes: the menu
// and the hired CEO both call it, so a direct call or a restored menu cannot skip a check. Menus,
// headers and hints are pure: they read readBiz and never write state, draw g.rng or take an id.
import { notice, useYearAction, yearActionsUsed } from '../core'
import { isIndustryLegal } from '../data/markets'
import { hasTalent } from '../talents'
import type { Asset, ChoiceOption, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { boardOf, boardView } from './board-state'
import { boardAllows, capexLeft, noteSpend, reserveDollars } from './board-vote'
import { SMART_SKILL } from './career'
import { bizWorth, LASTING_YEARS, type Worth } from './economy'
import { manageBlock } from './gate'
import { bookCost, sectorEffects, sectorValue, seedSector } from './sector-core'
import { modelOf, sectorCtx, sectorText, type CopyTable, type FamilyModel, type LeverDef, type SectorCtx } from './sector-kit'
import { addDiary, familyOf, readSector, saveSector, sectorSlot, type FamilyId, type SectorState } from './sector-state'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { markBest, money } from './util'

export type LeverResult = { ok: true; paid: number } | { ok: false; why: string }

/** The desk's own words (menu rows, headers, refusals). The key suffix gives the voice role. */
export const MENU_COPY: CopyTable = {
  'menu.desk.head': 'Operations Desk',
  'menu.name.food.label': 'Kitchen and Floor',
  'menu.name.care.label': 'Clients and Standards',
  'menu.name.util.label': 'Plant and Network',
  'menu.desk.sub.tip': 'One change per lever each year. Paid levers book their cost at once.',
  'menu.desk.wait.tip': 'The desk opens at the next year end.',
  'menu.desk.foreign.tip': 'A newer version saved this desk, so it stays off here.',
  'menu.desk.ceo.tip': 'Your CEO adjusts these levers at skill ${need} or more.',
  'menu.lever.now.tip': 'Now: ${setting}.',
  'menu.lever.done.tip': 'Done this year: ${setting}.',
  'menu.lever.todo.tip': 'Not done this year.',
  'menu.confirm.tip': '${lever} costs ${cost} from company cash and books at once.',
  'menu.hint.keep.tip': 'This setting is the best one now.',
  'menu.hint.best.tip': 'Best setting: worth about ${gain} over three years.',
  'menu.hint.even.tip': 'Best setting, though the options are nearly even.',
  'menu.vote.out': 'Spend ${cost} on ${lever}',
  'menu.set.log': '${year}: ${lever} now ${setting}.',
  'menu.paid.log': '${year}: ${lever} done for ${cost}.',
  'menu.no.gone.out': 'You no longer own this business.',
  'menu.no.ceo.out': 'No hired CEO of skill ${need} or more runs this company.',
  'menu.no.desk.out': 'This trade has no desk here.',
  'menu.no.foreign.out': 'A newer version saved this desk, so it stays untouched.',
  'menu.no.lever.out': "That lever isn't on this desk.",
  'menu.no.option.out': "That setting isn't on offer.",
  'menu.no.same.out': 'That is already the setting.',
  'menu.no.used.out': 'You changed ${lever} this year already.',
  'menu.no.cash.out': "The company can't pay ${cost} for that.",
  'menu.no.board.out': 'The board turned down ${cost} for ${lever}.',
  'menu.no.budget.out': '${cost} for ${lever} is more than the budget and reserve allow.',
}

const copy = (key: string, vals?: Record<string, string | number>): string => sectorText(MENU_COPY, key, vals)
const refuse = (key: string, vals?: Record<string, string | number>): LeverResult => ({ ok: false, why: copy(key, vals) })
const EPS = 1e-9
const same = (x: number, y: number): boolean => Math.abs(x - y) < EPS
const yearKey = (lever: string, assetId: string): string => `sector.${lever}.${assetId}`
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1)

// ---------------------------------------------------------------------------
// The one write path

/**
 * Change one lever of a company's desk. Order: the gate for `by`, the record slot, the lever and its
 * option, the once-a-year key, the cash, then the board (owner) or the CEO's budget and reserve, the
 * key itself and the payment. Every refusal returns before anything is written.
 */
export function applyLever(g: GameState, a: Asset, lever: string, option: number, by: 'owner' | 'ceo'): LeverResult {
  const cur = findBusiness(g, a.id)
  if (!cur) return refuse('menu.no.gone.out')
  const read = readBiz(g, cur)
  if (by === 'owner') {
    const block = manageBlock(g, cur)
    if (block) return { ok: false, why: block }
  } else if (!g.character.alive || read.ceo !== 'manager' || !read.manager || read.manager.skill <= SMART_SKILL) {
    return refuse('menu.no.ceo.out', { need: SMART_SKILL + 1 })
  }
  const family = familyOf(read.industry)
  const model = family ? modelOf(family) : null
  if (!family || !model || !isIndustryLegal(read.countryId, read.industry, g)) return refuse('menu.no.desk.out')
  if (sectorSlot(read) === 'foreign') return refuse('menu.no.foreign.out')
  const def = model.levers.find((l) => l.id === lever)
  if (!def) return refuse('menu.no.lever.out')
  const stored = readSector(read)
  const st = stored ?? model.seed(g, cur, read, g.year - 1)
  const opt = Number.isFinite(option) ? def.options(g, read, st).find((o) => same(o.value, option)) : undefined
  if (!opt) return refuse('menu.no.option.out')
  if (same(def.current(st, g.year), opt.value)) return refuse('menu.no.same.out')
  const name = lower(def.label)
  if (yearActionsUsed(g, yearKey(def.id, cur.id)) >= 1) return refuse('menu.no.used.out', { lever: name })
  const cx = sectorCtx(g, read, g.year)
  const cost = Math.max(0, Math.round(def.cost(g, read, st, opt.value, cx)))
  if (!Number.isFinite(cost) || cost > read.cash) return refuse('menu.no.cash.out', { cost: money(cost) })

  if (cost > 0) {
    if (by === 'owner') {
      const value = leverValue(g, cur, read, st, def, opt.value, undefined, cx)
      const gain = Number.isFinite(value) ? Math.max(0, value / LASTING_YEARS) : 0
      const label = copy('menu.vote.out', { cost: money(cost), lever: name })
      if (!boardAllows(g, cur, bizOf(g, cur), { kind: 'capex', by: 'owner', amount: cost, gain, label })) return refuse('menu.no.board.out', { cost: money(cost), lever: name })
    } else {
      const board = boardView(g, cur, read)
      if (cost > capexLeft(g, read, board) || read.cash - cost < reserveDollars(read, board)) return refuse('menu.no.budget.out', { cost: money(cost), lever: name })
    }
  }

  // Past every check: the record (live this year when this makes it), the key, the money, the change.
  const b = bizOf(g, cur)
  const rec = readSector(b) ?? seedSector(g, cur, b, g.year - 1)
  if (!rec) return refuse('menu.no.desk.out')
  if (!useYearAction(g, yearKey(def.id, cur.id), 1)) return refuse('menu.no.used.out', { lever: name })
  const paid = bookCost(b, cost)
  if (by === 'ceo' && paid > 0) noteSpend(g, boardOf(b), paid)
  const next = def.apply(rec, opt.value, g.year)
  addDiary(next, def.paid ? copy('menu.paid.log', { year: g.year, lever: def.label, cost: money(paid) }) : copy('menu.set.log', { year: g.year, lever: def.label, setting: opt.label }))
  saveSector(b, next)
  return { ok: true, paid }
}

// ---------------------------------------------------------------------------
// What a change is worth (hints and the CEO, never a draw)

const YEAR_WEIGHTS = [1, 1, .7] as const

/**
 * The value of an option against the current setting: the record rolled three years forward (weights
 * 1, 1 and .7, every draw at its mean, from the year being lived) under both, minus the price. All
 * three years share one context, so nothing past g.year is read.
 */
export function leverValue(g: GameState, a: Asset, b: BizState, st: SectorState, lever: LeverDef, option: number, w?: Worth, cx?: SectorCtx): number {
  const worth = w ?? bizWorth(g, b)
  const ctx = cx ?? sectorCtx(g, b, g.year)
  const roll = (start: SectorState): number => {
    let s = start
    let total = 0
    YEAR_WEIGHTS.forEach((weight, k) => {
      const fx = sectorEffects(g, a, b, s, g.year + k, 'expected', ctx)
      total += weight * sectorValue(g, b, worth, fx)
      s = fx.next
    })
    return total
  }
  const price = lever.cost(g, b, st, option, ctx)
  const v = roll(lever.apply(st, option, g.year)) - roll(st) - (Number.isFinite(price) ? Math.max(0, price) : 0)
  return Number.isFinite(v) ? v : 0
}

const hintMemo = new Map<string, Map<number, string>>()

/** The purple hint of each option of a lever (only the best one has one), memoised per company state. */
function hintsFor(g: GameState, a: Asset, b: BizState, st: SectorState, lever: LeverDef): Map<number, string> {
  const key = `${g.lifeId}|${a.id}|${g.year}|${lever.id}|${JSON.stringify(a.details)}`
  const hit = hintMemo.get(key)
  if (hit) return hit
  const opts = lever.options(g, b, st)
  const now = lever.current(st, g.year)
  const worth = bizWorth(g, b)
  const cx = sectorCtx(g, b, g.year)
  const values = new Map<string, number>(opts.map((o, i) => [String(i), leverValue(g, a, b, st, lever, o.value, worth, cx)]))
  // A setting nobody can pick (a paid action not done yet) still competes as "do nothing".
  const rows: ChoiceOption[] = opts.map((o, i) => ({ id: String(i), label: o.label }))
  if (!opts.some((o) => same(o.value, now))) {
    rows.push({ id: 'stay', label: '' })
    values.set('stay', 0)
  }
  markBest(g, rows, (id) => values.get(id) ?? null, (id) => {
    const here = opts.findIndex((o) => same(o.value, now))
    if (id === 'stay' || id === String(here)) return copy('menu.hint.keep.tip')
    const gain = values.get(id) ?? 0
    return gain < 500 ? copy('menu.hint.even.tip') : copy('menu.hint.best.tip', { gain: money(gain) })
  })
  const out = new Map<number, string>()
  rows.forEach((r, i) => {
    if (r.hint && i < opts.length) out.set(opts[i].value, r.hint)
  })
  hintMemo.set(key, out)
  if (hintMemo.size > 32) {
    const first = hintMemo.keys().next().value
    if (first !== undefined) hintMemo.delete(first)
  }
  return out
}

// ---------------------------------------------------------------------------
// The menu

interface Desk {
  cur: Asset
  b: BizState
  family: FamilyId
  model: FamilyModel
  foreign: boolean
  /** The saved record, or the one the first change would start from (null: a newer version's record). */
  st: SectorState | null
  saved: SectorState | null
}

function deskOf(g: GameState, a: Asset): Desk | null {
  const cur = findBusiness(g, a.id)
  if (!cur) return null
  const b = readBiz(g, cur)
  const family = familyOf(b.industry)
  const model = family ? modelOf(family) : null
  if (!family || !model) return null
  const foreign = sectorSlot(b) === 'foreign'
  const saved = foreign ? null : readSector(b)
  return { cur, b, family, model, foreign, saved, st: foreign ? null : saved ?? model.seed(g, cur, b, g.year - 1) }
}

/** The lines at the top of the desk: the family's own header (or when the desk opens), the CEO note, the last two diary lines. Pure. */
export function deskLines(g: GameState, a: Asset): string[] {
  const d = deskOf(g, a)
  if (!d) return findBusiness(g, a.id) ? [] : [copy('menu.no.gone.out')]
  const lines: string[] = []
  if (d.foreign) lines.push(copy('menu.desk.foreign.tip'))
  else if (d.saved) lines.push(...d.model.header(g, d.b, d.saved))
  else lines.push(...d.model.header(g, d.b, null), copy('menu.desk.wait.tip'))
  if (d.b.ceo === 'manager' && d.b.manager && d.b.manager.skill <= SMART_SKILL) lines.push(copy('menu.desk.ceo.tip', { need: SMART_SKILL + 1 }))
  if (d.saved) lines.push(...d.saved.diary.slice(-2))
  return lines
}

function leverMenu(a: Asset, lever: LeverDef): MenuGroup {
  const rowsOf = (g: GameState): { d: Desk; st: SectorState; cx: SectorCtx } | null => {
    const d = deskOf(g, a)
    return d?.st ? { d, st: d.st, cx: sectorCtx(g, d.b, g.year) } : null
  }
  return {
    type: 'menu', id: `sector.lever.${lever.id}.${a.id}`, label: lever.label, emoji: '\u{1F39B}\u{FE0F}',
    subtitle: (g) => {
      const x = rowsOf(g)
      if (!x) return ''
      const now = lever.current(x.st, g.year)
      const at = lever.options(g, x.d.b, x.st).find((o) => same(o.value, now))
      if (!at) return copy('menu.lever.todo.tip')
      return copy(lever.paid ? 'menu.lever.done.tip' : 'menu.lever.now.tip', { setting: at.label })
    },
    // A lever a trade can't use (no options) shows no row.
    visible: (g) => {
      const x = rowsOf(g)
      return !!x && lever.options(g, x.d.b, x.st).length > 0
    },
    disabledReason: (g) => manageBlock(g, a),
    children: (g): MenuNode[] => {
      const x = rowsOf(g)
      if (!x) return []
      const now = lever.current(x.st, g.year)
      return lever.options(g, x.d.b, x.st).map((o): MenuAction => {
        const price = Math.max(0, Math.round(lever.cost(g, x.d.b, x.st, o.value, x.cx)))
        const here = same(o.value, now)
        return {
          type: 'action', id: `sector.opt.${lever.id}.${o.value}.${a.id}`, label: `${here ? '✓ ' : ''}${o.label}`, emoji: '\u{1F527}',
          subtitle: price > 0 ? `${money(price)}. ${o.tip}` : o.tip,
          disabledReason: (gg) => {
            const block = manageBlock(gg, a)
            if (block) return block
            if (yearActionsUsed(gg, yearKey(lever.id, a.id)) >= 1) return copy('menu.no.used.out', { lever: lower(lever.label) })
            const d = deskOf(gg, a)
            return d && price > d.b.cash ? copy('menu.no.cash.out', { cost: money(price) }) : null
          },
          hint: (gg) => {
            const cur = findBusiness(gg, a.id)
            if (!cur || !hasTalent(gg, 'Business') || manageBlock(gg, a)) return null
            const d = deskOf(gg, a)
            return d?.st ? hintsFor(gg, cur, d.b, d.st, lever).get(o.value) ?? null : null
          },
          confirm: price > 0 ? () => copy('menu.confirm.tip', { lever: lever.label, cost: money(price) }) : undefined,
          run: (gg) => {
            const r = applyLever(gg, a, lever.id, o.value, 'owner')
            if (!r.ok) notice(gg, copy('menu.desk.head'), r.why, { emoji: a.emoji })
          },
        }
      })
    },
  }
}

/** The Operations Desk of a company with a family: the header, then one submenu per lever. */
export function sectorMenu(a: Asset): MenuGroup {
  return {
    type: 'menu', id: `sector.desk.${a.id}`, label: copy('menu.desk.head'), emoji: '\u{1F6E0}\u{FE0F}',
    subtitle: (g) => {
      const d = deskOf(g, a)
      return d ? `${copy(`menu.name.${d.family}.label`)}. ${copy('menu.desk.sub.tip')}` : ''
    },
    visible: (g) => !!deskOf(g, a),
    disabledReason: (g) => manageBlock(g, a),
    header: (g) => deskLines(g, a).join('\n'),
    children: (g): MenuNode[] => {
      const d = deskOf(g, a)
      if (!d) return []
      if (d.foreign) return [{ type: 'info', id: `sector.foreign.${a.id}`, text: copy('menu.desk.foreign.tip'), emoji: '\u{1F6E0}\u{FE0F}' }]
      return d.model.levers.map((l) => leverMenu(a, l))
    },
  }
}

