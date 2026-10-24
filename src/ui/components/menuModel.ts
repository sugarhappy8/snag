// Pure helpers for evaluating menu nodes safely (no React, no store), shared by the menu
// UI and unit-tested on their own. A bug in one feature menu must not take the UI down,
// so every callback is wrapped.
import { readChartSpec, type ChartSpec } from '../../game/charts/spec'
import { FLAGS } from '../../game/flags'
import { HUB_PREFIX } from '../../game/hubs/company'
import { badgeText } from '../../game/hubs/needs'
import { HINT_EMOJI } from '../../game/talents'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuInput, MenuNode } from '../../game/types'

export function report(where: string, err: unknown): void {
  console.error(`[menu] ${where} failed:`, err)
}

export function nodeVisible(node: MenuNode, g: GameState): boolean {
  if (!node.visible) return true
  try {
    return node.visible(g)
  } catch (err) {
    report(`visible(${node.id})`, err)
    return false
  }
}

export function nodeDisabled(node: MenuAction | MenuGroup, g: GameState): string | null {
  if (!node.disabledReason) return null
  try {
    return node.disabledReason(g) || null
  } catch (err) {
    report(`disabledReason(${node.id})`, err)
    return null
  }
}

export function nodeSubtitle(node: MenuAction | MenuGroup, g: GameState): string | null {
  const s = node.subtitle
  if (!s) return null
  if (typeof s === 'string') return s
  try {
    return s(g) || null
  } catch (err) {
    report(`subtitle(${node.id})`, err)
    return null
  }
}

/** Longest talent hint we show; anything longer is cut with an ellipsis (hints are one-liners). */
export const HINT_MAX = 220

const LEADING_HINT_EMOJI = new RegExp(`^(?:\\s|${HINT_EMOJI}|\\u{FE0F})+`, 'u')

/**
 * Talent hint text ready to show: '' for anything that isn't a non-empty string. Strips the
 * leading 🔮 (TalentHint draws its own), collapses whitespace and caps the length.
 */
export function cleanHint(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const text = raw.replace(LEADING_HINT_EMOJI, '').replace(/\s+/g, ' ').trim()
  if (text.length <= HINT_MAX) return text
  // Cut by code points so an emoji (a surrogate pair) is never split into a broken "�".
  const points = Array.from(text)
  if (points.length <= HINT_MAX) return text
  return `${points.slice(0, HINT_MAX - 1).join('').trimEnd()}…`
}

/** The purple talent hint under a row (MenuBase.hint), cleaned up; null when there is none. */
export function nodeHint(node: MenuAction | MenuGroup, g: GameState): string | null {
  const h = node.hint
  if (typeof h !== 'function') return null
  try {
    return cleanHint(h(g)) || null
  } catch (err) {
    report(`hint(${node.id})`, err)
    return null
  }
}

/** A reading shows its year ("as of 2023") from this many years back; a fresher one is just "now". */
export const CONF_ASOF_YEARS = 2

/**
 * The confidence chip of a row (MenuBase.conf, MenuInfo.conf): `conf` is its dots and `asOf` the year to print, which is
 * null for a reading that is under two years old. Null (no chip, the row is drawn as it always was) for a row with no
 * conf, a conf that is not an integer 0 to 3, and an asOf that is not a whole year or is later than g.year: a reading from
 * a year that has not happened is never shown. Pure; a getter that throws is reported like a subtitle that throws.
 */
export function nodeConf(node: MenuAction | MenuGroup | MenuInfo, g: GameState): { conf: 0 | 1 | 2 | 3; asOf: number | null } | null {
  try {
    const conf: unknown = node.conf
    if (typeof conf !== 'number' || !Number.isInteger(conf) || conf < 0 || conf > 3) return null
    const asOf: unknown = node.asOf
    if (asOf === undefined || asOf === null) return { conf: conf as 0 | 1 | 2 | 3, asOf: null }
    if (typeof asOf !== 'number' || !Number.isInteger(asOf) || !(asOf <= g.year)) return null
    return { conf: conf as 0 | 1 | 2 | 3, asOf: g.year - asOf >= CONF_ASOF_YEARS ? asOf : null }
  } catch (err) {
    report(`conf(${node.id})`, err)
    return null
  }
}

export function infoText(node: MenuInfo, g: GameState): string {
  if (typeof node.text === 'string') return node.text
  try {
    return node.text(g)
  } catch (err) {
    report(`info(${node.id})`, err)
    return ''
  }
}

/**
 * The chart an info row carries, ready to draw: null for a row with no chart, a builder with nothing to draw, a builder
 * that throws (reported, like infoText) and a spec the reader refuses (a NaN, a too-long text). The text of the row stays
 * the way to read it, so a null here only means the row is drawn as words.
 */
export function infoChart(node: MenuInfo, g: GameState): ChartSpec | null {
  if (typeof node.chart !== 'function') return null
  try {
    return readChartSpec(node.chart(g))
  } catch (err) {
    report(`chart(${node.id})`, err)
    return null
  }
}

export function groupChildren(group: MenuGroup, g: GameState): MenuNode[] {
  try {
    return group.children(g)
  } catch (err) {
    report(`children(${group.id})`, err)
    return [{ type: 'info', id: `${group.id}.error`, emoji: '⚠️', text: "This menu couldn't be loaded right now." }]
  }
}

export function groupHeader(group: MenuGroup, g: GameState): string | null {
  if (!group.header) return null
  try {
    return group.header(g) || null
  } catch (err) {
    report(`header(${group.id})`, err)
    return null
  }
}

export function confirmText(action: MenuAction, g: GameState, input?: string): string | null {
  if (!action.confirm) return null
  try {
    return action.confirm(g, input) || null
  } catch (err) {
    report(`confirm(${action.id})`, err)
    return null
  }
}

/**
 * Follow a path of group ids from the root list, re-resolving every level from the
 * latest state. Stops early when a group disappeared or became hidden/locked.
 */
export function resolveTrail(g: GameState, rootNodes: MenuNode[], path: string[]): MenuGroup[] {
  const trail: MenuGroup[] = []
  let nodes = rootNodes
  for (const id of path) {
    const next = nodes.find((n): n is MenuGroup => n.type === 'menu' && n.id === id && nodeVisible(n, g))
    if (!next || nodeDisabled(next, g)) break
    trail.push(next)
    nodes = groupChildren(next, g)
  }
  return trail
}

// ---------------------------------------------------------------------------
// Sliders (MenuInput / InputModal kind 'slider'): pure math shared by the Slider component.
//
// Narrow ranges are linear: every step is one notch of the native range input. Wide ranges
// ($1K to $50M, 1 to 5,000 stores) use a log-like curve over 1,000 notches so both ends are
// reachable with a thumb, and the value under the thumb snaps to a round number in the
// currency the player reads. Whatever the curve, a value is always exact and inside [min, max].

/** Most notches a linear slider gets before it switches to the log-like curve. */
export const SLIDER_LINEAR_MAX = 400
/** Notches of a log-like slider. */
export const SLIDER_NOTCHES = 1000

export interface SliderScale {
  min: number
  max: number
  step: number
  /** Log-like curve (wide ranges) instead of one notch per step. */
  log: boolean
  /** Notches of the native range input (0..notches). */
  notches: number
  /** Display units per internal unit (money: the player's currency; counts: 1). */
  display: number
}

function finiteOr(n: number | undefined, d: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : d
}

/**
 * The scale of a slider from its bounds. `display` converts internal values to what the player
 * reads (core.moneyScale() for money) so round numbers are round in their currency.
 */
export function sliderScale(min: number, max: number, step = 1, display = 1): SliderScale {
  const lo = finiteOr(min, 0)
  const hi = Math.max(lo, finiteOr(max, lo))
  const st = finiteOr(step, 1) > 0 ? finiteOr(step, 1) : 1
  const span = hi - lo
  const steps = span / st
  const log = steps > SLIDER_LINEAR_MAX
  return { min: lo, max: hi, step: st, log, notches: log ? SLIDER_NOTCHES : Math.max(0, Math.ceil(steps - 1e-9)), display: finiteOr(display, 1) > 0 ? finiteOr(display, 1) : 1 }
}

/** Keep a value inside the bounds and on the step grid (the top bound itself always counts). */
export function sliderClamp(s: SliderScale, value: number): number {
  const v = finiteOr(value, s.min)
  if (v <= s.min) return s.min
  if (v >= s.max) return s.max
  // Wide money ranges shown in another currency keep the round amounts their notches and buttons
  // land on in that currency (¥16,000, not the ¥15,999.98 a whole-dollar grid makes of it); the
  // amount handed over is still whole dollars (sliderOutput).
  if (s.log && s.display !== 1) return v
  const k = Math.round((v - s.min) / s.step)
  const out = s.min + k * s.step
  // A top bound off the step grid is a value of its own (1, 5, 9 and 10 for 1-10 in fours).
  if (s.max - v < Math.abs(v - out)) return s.max
  // Steps like 0.05 drift in floating point: trim to the step's own precision.
  const digits = Math.min(10, Math.max(0, -Math.floor(Math.log10(s.step)) + 2))
  const trimmed = Number(out.toFixed(digits))
  return Math.min(s.max, Math.max(s.min, trimmed))
}

/** 10^(digits of |d|) / 10: the size of the second significant digit (1 for 10-99, 100 for 1,000-9,999...). */
function secondDigit(d: number): number {
  const a = Math.abs(d)
  if (!(a >= 1)) return 0
  return Math.pow(10, Math.floor(Math.log10(a)) - 1)
}

/** Round to two significant digits in display units (12,345 → 12,000), then back. */
function niceValue(s: SliderScale, v: number): number {
  const d = v * s.display
  const mag = secondDigit(d)
  if (mag <= 0) return v
  return (Math.round(d / mag) * mag) / s.display
}

/**
 * Where a log-like curve is anchored: distances from the bottom of the range are measured in
 * these units. Anchoring at the bottom value itself makes a range like $100K-$80M geometric
 * (each stretch of the track multiplies the value by the same factor) instead of spending half
 * the track between $100K and $109K; a range that starts at 0 or 1 is anchored at a hundred-
 * thousandth of its span (or its step), so $1K is still a short drag from $0.
 */
function logPivot(s: SliderScale): number {
  const span = s.max - s.min
  const p = Math.max(s.step, Math.abs(s.min), span / 1e5)
  return Number.isFinite(p) && p > 0 ? p : 1
}

/** The value at a notch of the native range input. */
export function sliderValueAt(s: SliderScale, notch: number): number {
  const n = Math.max(0, Math.min(s.notches, Math.round(finiteOr(notch, 0))))
  if (n <= 0) return s.min
  if (n >= s.notches) return s.max
  if (!s.log) return sliderClamp(s, s.min + n * s.step)
  const span = s.max - s.min
  const t = n / s.notches
  const c = logPivot(s)
  const raw = s.min + c * (Math.exp(t * Math.log1p(span / c)) - 1)
  return sliderClamp(s, niceValue(s, raw))
}

/** The notch that shows a value. */
export function sliderNotchOf(s: SliderScale, value: number): number {
  const v = sliderClamp(s, value)
  if (s.notches <= 0) return 0
  if (!s.log) return Math.max(0, Math.min(s.notches, Math.round((v - s.min) / s.step)))
  const span = s.max - s.min
  const c = logPivot(s)
  const t = Math.log1p((v - s.min) / c) / Math.log1p(span / c)
  return Math.max(0, Math.min(s.notches, Math.round(t * s.notches)))
}

/**
 * The next value up (dir 1) or down (dir -1) for the -/+ buttons and arrow keys: one step on a
 * linear slider, the next round number on a log-like one (12,000 → 13,000; 10,000 → 9,900).
 */
export function sliderNudge(s: SliderScale, value: number, dir: 1 | -1): number {
  const v = sliderClamp(s, value)
  if (!s.log) return sliderClamp(s, v + dir * s.step)
  const d = v * s.display
  // Going down from a round 10,000 the next value is 9,900: size the step from just below.
  const mag = Math.max(secondDigit(dir > 0 ? d : d * 0.999), s.step * s.display)
  let next = (Math.round(d / mag) * mag + dir * mag) / s.display
  next = sliderClamp(s, next)
  if (next === v) next = sliderClamp(s, v + dir * s.step)
  return next
}

/** A value as the string run()/scripts receive, like a number field would hand it over. */
export function sliderOutput(s: SliderScale, value: number, money = false): string {
  const v = sliderClamp(s, value)
  if (money) {
    const whole = Math.min(Math.floor(s.max), Math.max(Math.ceil(s.min), Math.round(v)))
    return String(Number.isFinite(whole) ? whole : Math.round(s.min))
  }
  if (Number.isInteger(s.step) && Number.isInteger(s.min)) return String(Math.round(v))
  return String(Number(v.toFixed(6)))
}

/**
 * The prefilled value of a slider (a default from the engine, else the bottom of the range).
 * `round`: the default is only a suggestion, so it opens on two significant digits in the
 * player's currency (¥440,000 for a ¥441,326.96 budget).
 */
export function sliderStart(s: SliderScale, raw: string | undefined, round = false): number {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw)
  if (!Number.isFinite(n)) return sliderClamp(s, s.min)
  return sliderClamp(s, round ? niceValue(s, n) : n)
}

/** True when a MenuInput / InputModal can show a slider (it needs finite bounds). */
export function canSlide(min: number | undefined, max: number | undefined): boolean {
  return typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max) && max >= min
}

/** Longest live caption under a slider. */
export const PREVIEW_MAX = 240

/** A slider's live caption (MenuInput.preview), safely: null on a crash or an empty caption. */
export function sliderPreview(input: MenuInput, g: GameState, value: number): string | null {
  if (typeof input.preview !== 'function') return null
  try {
    const raw = input.preview(g, value)
    if (typeof raw !== 'string') return null
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text) return null
    const points = Array.from(text)
    return points.length <= PREVIEW_MAX ? text : `${points.slice(0, PREVIEW_MAX - 1).join('').trimEnd()}…`
  } catch (err) {
    report('preview', err)
    return null
  }
}

/** Long-form text inputs (e.g. "Do Anything") get a multi-line field. */
export function isMultiline(action: MenuAction): boolean {
  const input = action.input
  if (!input || input.kind !== 'text') return false
  return action.id === 'doAnything' || (input.placeholder?.length ?? 0) > 36 || input.label.length > 40
}

/** Where a "Back to …" chip leads: the deepest menu of a saved path that still exists. */
export interface ReturnTarget {
  /** Group ids that still resolve, root first (may be shorter than the saved path). */
  path: string[]
  /** Labels from the sheet's root down to the target, e.g. Activities › Computer › Ventures. */
  crumbs: string[]
  /** The menu the chip reopens. */
  label: string
  emoji: string
  /** The whole saved path still exists (otherwise this is its deepest valid ancestor). */
  exact: boolean
}

/**
 * What the chip and the cockpit strips call a place: its own name, except at or under a cockpit tile. "Run", "Money" and
 * "Exit" say nothing about which company they belong to, so the group the tile sits in leads ("Test Co · Money"). A tile
 * straight under the root has nothing above it to name. Without cockpits there are no tiles and the name is unchanged.
 */
function landingLabel(trail: readonly MenuGroup[]): string {
  const last = trail[trail.length - 1]
  if (!last) return ''
  const tile = trail.findIndex((t) => typeof t.id === 'string' && t.id.startsWith(HUB_PREFIX))
  const owner = tile > 0 ? trail[tile - 1] : undefined
  return owner && owner.label ? `${owner.label} \u00B7 ${last.label}` : last.label
}

/**
 * Resolve a saved menu path against the latest state. Groups that vanished, became hidden
 * or locked are dropped together with everything below them, so the target is always a
 * menu the player can actually open.
 */
export function returnTarget(
  g: GameState,
  root: { label: string; emoji: string; nodes: MenuNode[] },
  path: string[],
): ReturnTarget {
  const trail = resolveTrail(g, root.nodes, path)
  const last = trail[trail.length - 1]
  return {
    path: trail.map((t) => t.id),
    crumbs: [root.label, ...trail.map((t) => t.label)],
    label: last ? landingLabel(trail) : root.label,
    emoji: last ? last.emoji : root.emoji,
    exact: trail.length === path.length,
  }
}

/** The "Needs you" pill of a row (G.8): its badge text, or null. Dark unless FLAGS.navRegroup is on; a locked row shows none (the caller checks). */
export function nodeBadge(node: MenuAction | MenuGroup, g: GameState): string | null {
  return FLAGS.navRegroup ? badgeText(node, g) : null
}

// Paths in a sheet's menu tree (R1-N5). useMenuNav builds its path changes from these, so they are testable without a
// renderer. `path` is the stored group ids, `depth` the number of them that still resolve (the stored path can be longer
// when a group has vanished since).

/** A group opened from the list at `depth`: the ids above that list, then the group. */
export function pathAfterPush(path: string[], depth: number, id: string): string[] {
  return [...path.slice(0, depth), id]
}

/** Back to the list at `n` (0 is the root list): the first `n` ids. An `n` outside 0 to depth - 1 returns `path` itself. */
export function pathAfterPopTo(path: string[], depth: number, n: number): string[] {
  if (!Number.isInteger(n) || n < 0 || n >= depth) return path
  return path.slice(0, n)
}

/** The most group ids a sheet is opened on at once. */
const MAX_OPEN_DEPTH = 12

/** A path to open a sheet on: the non-empty strings of `ids`, at most 12. Anything else is dropped. */
export function pathAfterOpen(ids: readonly string[]): string[] {
  const out: string[] = []
  if (!Array.isArray(ids)) return out
  for (const id of ids) {
    if (typeof id === 'string' && id !== '') out.push(id)
    if (out.length >= MAX_OPEN_DEPTH) break
  }
  return out
}
