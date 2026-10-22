// Table-driven events of the sector families: at most one a company-year, answered through one script
// that checks a token, rolls the branches of the chosen option and applies them inside fixed bounds.
// The only g.rng draws of this file are the event roll and pick (maybeSectorEvent) and the branch roll
// (the sector.event script); hints and the table checks never draw.
import { notice, scriptChoice } from '../core'
import { isIndustryLegal } from '../data/markets'
import { chance, rand, uid, weightedPick } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, ChoiceOption, GameState } from '../types'
import { bizWorth, expectedFx, fxValue, LASTING_YEARS, type BizFx, type Worth } from './economy'
import { eraFits } from './era'
import { manageBlock } from './gate'
import { bookCost, bookIncome, sectorEffects, sectorValue } from './sector-core'
import { modelOf, sectorCtx, sectorText, type SecFx, type SectorEvent } from './sector-kit'
import { addDiary, clampRecord, familyOf, readSector, saveSector, SEC_KEYS, type SectorState } from './sector-state'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { clampN, markBest, rec, str } from './util'

export const SECTOR_EVENT_SCRIPT = 'sector.event'

/** The yearly chance of a family event: with the generic roll behind it the load stays under .45 a company-year. */
export const SECTOR_EVENT_P = { owner: .14, managed: .09 } as const

// ---------------------------------------------------------------------------
// What an outcome may do

/** The record's own numbers: the `add` deltas, then the `set` values, on the family's keys only, then clamped. Pure. */
export function applySec(st: SectorState, sec?: SecFx): SectorState {
  if (!sec) return clampRecord(st)
  const keys = SEC_KEYS[st.family]
  const next: Record<string, unknown> = { ...st }
  const usable = (k: string, v: number): boolean => keys.includes(k) && typeof next[k] === 'number' && Number.isFinite(v)
  for (const [k, v] of Object.entries(sec.add ?? {})) if (usable(k, v)) next[k] = (next[k] as number) + v
  for (const [k, v] of Object.entries(sec.set ?? {})) if (usable(k, v)) next[k] = v
  return clampRecord(next as unknown as SectorState)
}

/**
 * One outcome on the company: cash through the two booking forms, brand, quality and morale added and
 * clamped, the pay level, and the moves fxValue prices (demand, capacity and unit cost). Returns the record.
 */
export function applySectorFx(g: GameState, b: BizState, st: SectorState, fx: BizFx, sec?: SecFx): SectorState {
  const cash = fx.cash ?? 0
  if (cash > 0) bookIncome(g, b, cash)
  else if (cash < 0) bookCost(g, b, -cash)
  if (fx.brand) b.brand = clampN(b.brand + fx.brand, 0, 100)
  if (fx.quality) b.quality = clampN(b.quality + fx.quality, 0, 100)
  if (fx.morale) b.morale = clampN(b.morale + fx.morale, 0, 100)
  if (fx.wage) b.wageLevel = clampN(Math.round((b.wageLevel + fx.wage) * 100) / 100, .7, 1.5)
  if (fx.demandTo !== undefined && Number.isFinite(fx.demandTo)) b.demandShock = clampN(fx.demandTo < 1 ? Math.min(b.demandShock, fx.demandTo) : Math.max(b.demandShock, fx.demandTo), .3, 2)
  if (fx.capacityTo !== undefined && Number.isFinite(fx.capacityTo)) b.capacityLoss = Math.max(b.capacityLoss, clampN(fx.capacityTo, 0, 1))
  if (fx.costTo !== undefined && Number.isFinite(fx.costTo)) b.costShock = Math.max(b.costShock, clampN(fx.costTo, .9, 1.12))
  return applySec(st, sec)
}

// ---------------------------------------------------------------------------
// What an outcome is worth (hints and checks, never a draw)

/** LASTING_YEARS times what the record change adds to a year, with every draw at its mean, for the year being lived. */
function secValue(g: GameState, a: Asset, b: BizState, st: SectorState, sec: SecFx, w: Worth, base: number): number {
  const after = sectorValue(g, b, w, sectorEffects(g, a, b, applySec(st, sec), g.year, 'expected', sectorCtx(g, b, g.year)))
  return LASTING_YEARS * (after - base)
}

/** The expected value of a choice: p times (fxValue plus secValue) over the same branches the resolver rolls. */
export function choiceValue(g: GameState, a: Asset, b: BizState, st: SectorState, ev: SectorEvent, choiceId: string, w?: Worth): number {
  const choice = ev.choices(g, b, st).find((c) => c.id === choiceId)
  if (!choice) return 0
  const worth = w ?? bizWorth(g, b)
  const branches = choice.branches(g, b, st)
  let v = expectedFx(g, b, worth, branches)
  const secs = branches.filter((x) => x.p > 0 && x.sec)
  if (secs.length) {
    const base = sectorValue(g, b, worth, sectorEffects(g, a, b, st, g.year, 'expected', sectorCtx(g, b, g.year)))
    for (const x of secs) if (x.sec) v += x.p * secValue(g, a, b, st, x.sec, worth, base)
  }
  return Number.isFinite(v) ? v : 0
}

// ---------------------------------------------------------------------------
// The table check (tests and Task 9 run every family event through it)

const FX_KEYS: ReadonlySet<string> = new Set(['cash', 'brand', 'quality', 'morale', 'demandTo', 'capacityTo', 'costTo', 'wage'])

/** What is wrong with an event definition (empty: nothing). Reads the family copy table and the company; never draws. */
export function eventProblems(ev: SectorEvent, g: GameState, a: Asset, b: BizState, st: SectorState): string[] {
  const out: string[] = []
  const copy = modelOf(ev.family)?.copy ?? {}
  const cx = sectorCtx(g, b, g.year)
  const cashMax = Math.max(.12 * cx.base, 3000 * cx.level)
  if (!ev.scene(g, a, b, st).trim().endsWith('What will you do?')) out.push(`${ev.id}: scene does not end with What will you do?`)
  const choices = ev.choices(g, b, st)
  if (choices.length < 2) out.push(`${ev.id}: needs at least 2 choices, has ${choices.length}`)
  for (const c of choices) {
    const at = `${ev.id}.${c.id}`
    const words = c.label.trim().split(/\s+/).filter(Boolean).length
    if (words < 1 || words > 5) out.push(`${at}: label has ${words} words`)
    const branches = c.branches(g, b, st)
    if (!branches.length) out.push(`${at}: has no branches`)
    let sum = 0
    branches.forEach((br, i) => {
      const where = `${at}.${i}`
      if (!Number.isFinite(br.p) || br.p < 0 || br.p > 1) out.push(`${where}: odds ${br.p} outside 0 to 1`)
      else sum += br.p
      if (!Object.prototype.hasOwnProperty.call(copy, br.text)) out.push(`${where}: text key ${br.text} is not in the copy table`)
      for (const [k, v] of Object.entries(br.fx)) {
        if (v === undefined) continue
        if (!FX_KEYS.has(k)) out.push(`${where}: fx key ${k} is not allowed`)
        else if (typeof v !== 'number' || !Number.isFinite(v)) out.push(`${where}: ${k} is not finite`)
        else if (!inBounds(k, v, cashMax)) out.push(`${where}: ${k} ${v} is out of bounds`)
      }
      for (const part of [br.sec?.add, br.sec?.set]) {
        for (const [k, v] of Object.entries(part ?? {})) {
          if (!SEC_KEYS[ev.family].includes(k)) out.push(`${where}: sec key ${k} is not allowed for ${ev.family}`)
          else if (!Number.isFinite(v)) out.push(`${where}: sec ${k} is not finite`)
        }
      }
    })
    if (branches.length && Math.abs(sum - 1) > 1e-9) out.push(`${at}: odds sum to ${sum}`)
  }
  return out
}

function inBounds(key: string, v: number, cashMax: number): boolean {
  switch (key) {
    case 'cash': return Math.abs(v) <= cashMax
    case 'brand':
    case 'quality':
    case 'morale': return Math.abs(v) <= 12
    case 'demandTo': return v >= .85 && v <= 1.15
    case 'capacityTo': return v >= 0 && v <= .35
    case 'costTo': return v >= .9 && v <= 1.12
    case 'wage': return Math.abs(v) <= .08
    default: return false
  }
}

// ---------------------------------------------------------------------------
// The roll

/**
 * Maybe queue one family event for this company (true when one was queued). Never in the observation
 * year, never twice in a year, and only for an owner who could answer it.
 */
export function maybeSectorEvent(g: GameState, a: Asset, b: BizState, year: number, managed: boolean): boolean {
  if (manageBlock(g, a) || !familyOf(b.industry) || !isIndustryLegal(b.countryId, b.industry, g)) return false
  const st = readSector(b)
  const model = st ? modelOf(st.family) : null
  if (!st || !model || st.since >= year || st.lastEvent >= year) return false
  if (st.pending) {
    if (st.pending.year >= g.year) return false
    st.pending = null
    addDiary(st, `${g.year}: An old request lapsed.`)
    saveSector(b, st)
  }
  if (!chance(g, managed ? SECTOR_EVENT_P.managed : SECTOR_EVENT_P.owner)) return false
  const options = model.events.filter((e) => e.weight(g, b, st) > 0 && eraFits(g, b.countryId, e.scene(g, a, b, st)))
  if (!options.length) return false
  const ev = weightedPick(g, options, (e) => e.weight(g, b, st))
  const token = uid(g, 'secEv')
  b.lastEvent = year
  st.lastEvent = year
  st.pending = { token, id: ev.id, year: g.year }
  saveSector(b, st)
  let worth: Worth | undefined
  const choices: ChoiceOption[] = ev.choices(g, b, st).map((c) => ({ id: c.id, label: c.label }))
  markBest(g, choices, (id) => choiceValue(g, a, b, st, ev, id, (worth ??= bizWorth(g, b))))
  scriptChoice(g, SECTOR_EVENT_SCRIPT, ev.title, `${a.name}\n\n${ev.scene(g, a, b, st)}`, choices, { emoji: ev.emoji, data: { assetId: a.id, token } })
  return true
}

defineScript(SECTOR_EVENT_SCRIPT, (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || manageBlock(g, a)) return
  const read = readSector(readBiz(g, a))
  const model = read ? modelOf(read.family) : null
  const p = read?.pending
  if (!read || !model || !p || p.token !== str(d?.token) || p.year !== g.year) return
  const ev = model.events.find((e) => e.id === p.id)
  const b = bizOf(g, a)
  const st = readSector(b)
  const picked = st && ev ? ev.choices(g, b, st).find((c) => c.id === choice) : undefined
  if (!st || !ev || !picked) return
  const branches = picked.branches(g, b, st)
  if (!branches.length) return
  let roll = rand(g)
  let branch = branches[branches.length - 1]
  for (const x of branches) {
    roll -= x.p
    if (roll < 0) {
      branch = x
      break
    }
  }
  const value = fxValue(g, b, bizWorth(g, b), branch.fx)
  const next = applySectorFx(g, b, st, branch.fx, branch.sec)
  next.pending = null
  addDiary(next, `${g.year} ${ev.title}. ${picked.label}.`)
  saveSector(b, next)
  notice(g, ev.title, sectorText(model.copy, branch.text, branch.vals), { emoji: ev.emoji, tone: value > 0 ? 'good' : value < 0 ? 'bad' : 'neutral' })
})
