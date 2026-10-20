// Chart geometry: scales, ticks, paths and layouts. Pure and total. No React and no game imports, so every
// chart component and every test can use it, and no input (empty, one point, constant, null, NaN, 1e15, 1e-9)
// can make it return a number that is not finite.

export type Scale = (v: number) => number

/** The biggest magnitude any helper works with; past it a value is clamped, so spans and sums stay finite. */
const LIM = 1e300
/** Pixel coordinates are clamped to this, so a path never carries an exponent. */
const PX_LIM = 1e6

function fin(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback
}

function clampLim(n: number): number {
  return n > LIM ? LIM : n < -LIM ? -LIM : n
}

/** A pixel coordinate as short text: two decimals at most, no negative zero, no exponent. */
function px(n: number): string {
  const c = Math.max(-PX_LIM, Math.min(PX_LIM, fin(n)))
  const r = Math.round(c * 100) / 100
  return String(r === 0 ? 0 : r)
}

/**
 * A straight map from the domain [d0, d1] to the range [r0, r1]. It does not clamp, so a value outside the domain
 * lands outside the range. A degenerate or non-finite domain maps everything to the middle of the range; a
 * non-finite input maps to r0.
 */
export function linearScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const a = fin(r0)
  const b = fin(r1)
  const mid = (a + b) / 2
  const span = d1 - d0
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || !Number.isFinite(span) || span === 0) return () => mid
  return (v: number) => {
    if (!Number.isFinite(v)) return a
    const out = a + ((v - d0) / span) * (b - a)
    return Number.isFinite(out) ? out : a
  }
}

/**
 * The [low, high] a chart should draw for these values. Null, undefined and non-finite entries are ignored; nothing
 * left gives [0, 1]. `zero` makes the range include 0, `pad` adds that fraction of the span on both sides. A
 * constant series is widened so the span is never 0.
 */
export function extentOf(values: readonly (number | null | undefined)[], opts?: { zero?: boolean; pad?: number }): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const c = clampLim(v)
    if (c < lo) lo = c
    if (c > hi) hi = c
  }
  if (lo > hi) return [0, 1]
  if (opts?.zero) {
    if (lo > 0) lo = 0
    if (hi < 0) hi = 0
  }
  if (!(hi > lo)) {
    if (lo === 0) return [0, 1]
    const d = Math.abs(lo) * 0.5
    lo -= d
    hi += d
  }
  const pad = opts?.pad !== undefined && Number.isFinite(opts.pad) ? Math.max(0, Math.min(1, opts.pad)) : 0
  if (pad > 0) {
    const p = (hi - lo) * pad
    lo = clampLim(lo - p)
    hi = clampLim(hi + p)
  }
  return [lo, hi]
}

/** One notch smaller on the 1, 2, 5 ladder: 5e3 -> 2e3 -> 1e3 -> 5e2. */
function smaller(mant: number, exp: number): [number, number] {
  if (mant === 5) return [2, exp]
  if (mant === 2) return [1, exp]
  return [5, exp - 1]
}

/** k steps of mant * 10^exp, written so a decimal step gives the closest number, not 0.30000000000000004. */
function tickAt(k: number, mant: number, exp: number): number {
  const whole = k * mant
  const v = exp >= 0 ? whole * 10 ** exp : whole / 10 ** -exp
  return v + 0
}

function ticksFor(da: number, db: number, mant: number, exp: number): number[] {
  const step = mant * 10 ** exp
  if (!(step > 0) || !Number.isFinite(step)) return []
  const first = Math.ceil(da / step - 1e-9)
  const last = Math.floor(db / step + 1e-9)
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first > 60) return []
  const out: number[] = []
  for (let k = first; k <= last; k++) out.push(tickAt(k, mant, exp))
  return out
}

/**
 * Round axis ticks inside [lo, hi], ascending, on a 1, 2, 5 step, at most `count` + 2 of them. 0 is a tick whenever
 * the range crosses it. `unitScale` is display units per internal unit (150 for yen): the steps are chosen in
 * display units, so the labels read as round numbers in the player's currency, then converted back.
 */
export function niceTicks(lo: number, hi: number, count = 5, unitScale = 1): number[] {
  let a = clampLim(fin(lo))
  let b = clampLim(fin(hi))
  if (a > b) [a, b] = [b, a]
  const want = Number.isFinite(count) ? Math.min(20, Math.max(1, Math.round(count))) : 5
  let u = Number.isFinite(unitScale) && unitScale > 0 ? unitScale : 1
  let da = a * u
  let db = b * u
  if (!Number.isFinite(da) || !Number.isFinite(db) || Math.abs(da) > LIM || Math.abs(db) > LIM) {
    u = 1
    da = a
    db = b
  }
  const span = db - da
  if (!(span > 0) || !Number.isFinite(span)) return [a]

  const raw = span / want
  let exp = Math.floor(Math.log10(raw))
  const f = raw / 10 ** exp
  let mant = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  if (mant === 10) {
    mant = 1
    exp += 1
  }
  let ticks = ticksFor(da, db, mant, exp)
  for (let tries = 0; ticks.length < 2 && tries < 8; tries++) {
    // Fewer than two ticks fit: try the next smaller step, unless that would put too many on a short axis (count 1 or 2).
    const [m2, e2] = smaller(mant, exp)
    const next = ticksFor(da, db, m2, e2)
    if (next.length > want + 2 && ticks.length >= 1) break
    mant = m2
    exp = e2
    ticks = next
  }

  const out: number[] = []
  for (const t of ticks) {
    const v = Math.min(b, Math.max(a, t / u)) + 0
    if (Number.isFinite(v) && (out.length === 0 || v > out[out.length - 1]!)) out.push(v)
  }
  return out.length > 0 ? out : a < b ? [a, b] : [a]
}

/**
 * An SVG path through the points, 'M x y L x y M x y'. A null or non-finite value (or a point whose scaled position is
 * not finite) lifts the pen, so the line breaks there. A lone point is a single 'M'. No point at all is ''.
 */
export function linePath(xs: readonly number[], ys: readonly (number | null)[], sx: Scale, sy: Scale): string {
  const n = Math.min(xs.length, ys.length)
  const parts: string[] = []
  let pen = false
  for (let i = 0; i < n; i++) {
    const x = xs[i]
    const y = ys[i]
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      pen = false
      continue
    }
    const cx = sx(x)
    const cy = sy(y)
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      pen = false
      continue
    }
    parts.push(`${pen ? 'L' : 'M'}${px(cx)} ${px(cy)}`)
    pen = true
  }
  return parts.join(' ')
}

/**
 * Stacked bars. `series[s][i]` is series s at column i. Positive values stack up from 0 in series order and negative
 * values stack down, so for each cell `lo <= hi` and `hi - lo` is the size of the value (0 for null or non-finite).
 * `min` and `max` bound every cell and include 0.
 */
export function stackLayout(series: readonly (readonly (number | null)[])[]): { lo: number[][]; hi: number[][]; min: number; max: number } {
  const cols = series.reduce((m, s) => Math.max(m, s.length), 0)
  const lo = series.map(() => new Array<number>(cols).fill(0))
  const hi = series.map(() => new Array<number>(cols).fill(0))
  let min = 0
  let max = 0
  for (let i = 0; i < cols; i++) {
    let pos = 0
    let neg = 0
    for (let s = 0; s < series.length; s++) {
      const raw = series[s]![i]
      const v = typeof raw === 'number' && Number.isFinite(raw) ? clampLim(raw) : 0
      if (v > 0) {
        lo[s]![i] = pos
        pos = clampLim(pos + v)
        hi[s]![i] = pos
      } else if (v < 0) {
        hi[s]![i] = neg
        neg = clampLim(neg + v)
        lo[s]![i] = neg
      }
    }
    if (pos > max) max = pos
    if (neg < min) min = neg
  }
  return { lo, hi, min, max }
}

export interface WaterfallBar {
  start: number
  end: number
  /** The running level after this bar. */
  level: number
  kind: 'total' | 'delta'
}

/**
 * Waterfall bars on one scale. A total stands on 0 and resets the running level to its value; a delta hangs from the
 * running level and moves it. `min` and `max` bound every bar and include 0.
 */
export function waterfallLayout(steps: readonly { value: number; kind: 'total' | 'delta' }[]): { bars: WaterfallBar[]; min: number; max: number } {
  const bars: WaterfallBar[] = []
  let level = 0
  let min = 0
  let max = 0
  for (const s of steps) {
    const v = clampLim(fin(s.value))
    let start: number
    let end: number
    if (s.kind === 'total') {
      start = 0
      end = v
    } else {
      start = level
      end = clampLim(level + v)
    }
    level = end
    bars.push({ start, end, level, kind: s.kind })
    min = Math.min(min, start, end)
    max = Math.max(max, start, end)
  }
  return { bars, min, max }
}

/**
 * The point nearest to a pointer: points sit at left, left + width / (n - 1), ... left + width. Clamped to 0..n-1;
 * -1 when there are no points, and 0 when the box has no width or the pointer is not a number.
 */
export function indexAt(pointer: number, left: number, width: number, n: number): number {
  if (!(n >= 1)) return -1
  const count = Math.floor(n)
  if (count <= 1) return 0
  if (!Number.isFinite(left) || !Number.isFinite(width) || !(width > 0) || Number.isNaN(pointer)) return 0
  const t = Math.round(((pointer - left) / width) * (count - 1))
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.min(count - 1, t))
}

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'star'

/** One marker shape per series, so a line is never told apart by colour alone: series i uses MARKER_SHAPES[i % 6]. */
export const MARKER_SHAPES: readonly MarkerShape[] = ['circle', 'square', 'triangle', 'diamond', 'cross', 'star']

function polygon(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${px(x)} ${px(y)}`).join(' ') + ' Z'
}

/** A closed path for a marker of radius r centred at (cx, cy). */
export function markerPath(shape: MarkerShape, cx: number, cy: number, r: number): string {
  const x = fin(cx)
  const y = fin(cy)
  const R = Math.max(0, Math.min(PX_LIM, fin(r)))
  switch (shape) {
    case 'square':
      return polygon([[x - R, y - R], [x + R, y - R], [x + R, y + R], [x - R, y + R]])
    case 'triangle':
      return polygon([[x, y - R], [x + R * 0.9, y + R * 0.7], [x - R * 0.9, y + R * 0.7]])
    case 'diamond':
      return polygon([[x, y - R], [x + R, y], [x, y + R], [x - R, y]])
    case 'cross': {
      const t = R / 3
      return polygon([
        [x - t, y - R], [x + t, y - R], [x + t, y - t], [x + R, y - t], [x + R, y + t], [x + t, y + t],
        [x + t, y + R], [x - t, y + R], [x - t, y + t], [x - R, y + t], [x - R, y - t], [x - t, y - t],
      ])
    }
    case 'star': {
      const pts: [number, number][] = []
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5
        const rad = i % 2 === 0 ? R : R * 0.45
        pts.push([x + Math.cos(ang) * rad, y + Math.sin(ang) * rad])
      }
      return polygon(pts)
    }
    default:
      return `M${px(x - R)} ${px(y)} A${px(R)} ${px(R)} 0 1 0 ${px(x + R)} ${px(y)} A${px(R)} ${px(R)} 0 1 0 ${px(x - R)} ${px(y)} Z`
  }
}

/** The indexes to label on an x axis: evenly spread, at most maxTicks (but never fewer than 2), always the first and the last. */
export function xTicks(x: readonly (number | string)[], maxTicks: number): number[] {
  const n = x.length
  if (n <= 0) return []
  if (n === 1) return [0]
  const want = Number.isFinite(maxTicks) ? Math.max(2, Math.floor(maxTicks)) : 2
  const k = Math.min(n, want)
  const out: number[] = []
  for (let i = 0; i < k; i++) {
    const idx = Math.round((i * (n - 1)) / (k - 1))
    if (out.length === 0 || idx > out[out.length - 1]!) out.push(idx)
  }
  return out
}

/**
 * Label positions pushed apart so two labels never overprint. Same order in and out. Each position is at least
 * `minGap` from the next and inside [lo, hi]; when the box is too small for that, the labels are spread evenly across
 * it. A set that already fits comes back unchanged.
 */
export function dodgeLabels(ys: readonly number[], minGap: number, lo: number, hi: number): number[] {
  const n = ys.length
  if (n === 0) return []
  let a = fin(lo)
  let b = fin(hi)
  if (a > b) [a, b] = [b, a]
  const gap = Number.isFinite(minGap) && minGap > 0 ? minGap : 0
  const raw = ys.map((v) => fin(v, a))
  const y = raw.map((v) => Math.min(b, Math.max(a, v)))
  const order = y.map((_, i) => i).sort((p, q) => y[p]! - y[q]! || raw[p]! - raw[q]! || p - q)

  let fits = true
  for (let k = 0; k < n && fits; k++) {
    const i = order[k]!
    if (raw[i] !== y[i] || !Number.isFinite(ys[i]!)) fits = false
    else if (k > 0 && y[i]! - y[order[k - 1]!]! < gap - 1e-9) fits = false
  }
  if (fits) return ys.slice()

  const pos = new Array<number>(n)
  if ((n - 1) * gap > b - a) {
    for (let k = 0; k < n; k++) pos[order[k]!] = n === 1 ? y[order[0]!]! : a + (k * (b - a)) / (n - 1)
    return pos
  }
  let prev = -Infinity
  for (let k = 0; k < n; k++) {
    const i = order[k]!
    prev = Math.max(y[i]!, prev + gap)
    pos[i] = prev
  }
  let next = Infinity
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k]!
    next = Math.min(pos[i]!, k === n - 1 ? b : next - gap)
    pos[i] = next
  }
  return pos
}
