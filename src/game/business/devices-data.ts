// Ecosystem companies: the pure core of the devices trade. Chip rules, reference prices and the readers that keep a damaged
// save out of the economy. It imports types only, so any module can read these tables without a cycle, and nothing here
// draws a random number or writes state. `costFactor`, `evolve` and `bookYear` (economy.ts) read it as pure functions of one business.
import type { Json } from '../types'

/** Share of a device's unit cost that is chips and memory. */
export const CHIP_SHARE = 0.35
/** Yield of the chips a company buys on the open market. */
export const MARKET_YIELD = 0.7
/** Most chip fabs one company can run. */
export const FAB_MAX = 3
/** Cut of the chip share by own fabs 0, 1, 2 and 3. */
export const FAB_CUT: readonly number[] = [0, 0.15, 0.25, 0.3]
/** Cut of the chip share by the sister's tech stage (2 fabless, 3 own fab, 4 leading edge). */
export const SISTER_CUT: Readonly<Record<number, number>> = { 2: 0.08, 3: 0.18, 4: 0.24 }
/** Share of the sister's revenue a chip contract may use. */
export const CHIP_RESERVE = 0.2
/** Quality points per performance point, and the cap on the lift. */
export const LIFT_K = 0.4
export const LIFT_MAX = 6
/** What a fab costs a company at the unit capital level, how much each further fab adds, and its yearly upkeep share. */
export const FAB_BASE = 150_000_000
export const FAB_STEP = 0.35
export const FAB_MAINT = 0.07
/** The operating system's lock-in: how much the installed base counts at full strength, and the cap on the pull. */
export const OS_BETA = 0.9
export const OS_PULL_CAP = 3
/** Network strength of the devices market. */
export const DEVICE_NETWORK = 1.5
/** The platform kind. It sells no hardware, so it has no reference price and no spec sheet. */
export const OS_FAMILY = 'Device Operating System'
/** The seven hardware kinds, in the order they open. */
export const HARDWARE_FAMILIES: readonly string[] = ['Home Computer', 'Mobile Phone', 'Desktop PC', 'Laptop', 'Smartphone', 'VR Headset', 'AR Glasses']
/** What each sort of line charges against the market's price for its kind. Bundles and add-ons get no sheet. */
export const LINE_PRICE: Readonly<Record<string, number>> = { core: 1, next: 1.05, premium: 1.25, value: 0.7, regional: 0.97, breakthrough: 1.2 }

/** The chips a sister company agreed to supply this fiscal year. One record per buyer, written once a year by Group Services. */
export interface ChipSupply { year: number; from: string; name: string; stage: number; node: number; yield: number; cover: number }
export type ChipSource = 'market' | 'fab' | 'sister'
export interface ChipTerms { src: ChipSource; cut: number; node: number; yield: number; cover: number; perfBump: number; lift: number; from?: string }
/** What the chip rules read of a business. A BizState is assignable to it, so this file needs no runtime import of the state. */
export interface ChipHolder { industry: string; fabs?: number; chips?: ChipSupply }

/** Clamp to [lo, hi]; NaN becomes lo. */
function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

function whole(v: Json | undefined, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
}

function within(v: Json | undefined, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
}

/** Own fabs from a saved value: an integer 1 to 3, else 0. A bad value never reaches the economy. */
export function readFabs(v: Json | undefined): number {
  return whole(v, 1, FAB_MAX) ? v : 0
}

/** A chip record from a saved value, or null when any field is off. Extra keys are dropped and the two names are cut to 60 characters. */
export function readChips(v: Json | undefined): ChipSupply | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const { year, from, name, stage, node, yield: yieldRate, cover } = v
  if (!whole(year, 1900, 2999) || !whole(stage, 2, 4) || !whole(node, 0, 6) || !within(yieldRate, 0.3, 0.97) || !within(cover, 0, 1)) return null
  if (typeof from !== 'string' || from === '' || typeof name !== 'string' || name === '') return null
  return { year, from: from.slice(0, 60), name: name.slice(0, 60), stage, node, yield: yieldRate, cover }
}

/** The mainstream process node of a year, as an index into the lab's node list: 0 to 2010, 1 from 2011, 2 from 2015, 3 from 2018, 4 from 2020, 5 from 2022, 6 from 2030. */
export function marketNode(year: number): number {
  let n = 0
  for (const [from, node] of [[2011, 1], [2015, 2], [2018, 3], [2020, 4], [2022, 5], [2030, 6]]) if (year >= from) n = node
  return n
}

/** How fast chips are on their own, 0 to 50: the process node and the fab's yield. */
export function chipPerf(node: number, yieldRate: number): number {
  return 5 * node + (20 * (yieldRate - 0.3)) / 0.67
}

/** A device's performance, 0 to 100. Silicon 2.0's `chipPerformance` with the line's quality standing in for the tech level. */
export function devicePerf(quality: number, node: number, yieldRate: number): number {
  return Math.round(clamp(0.5 * quality + chipPerf(node, yieldRate), 0, 100))
}

/** Where a business gets its chips. A trade other than devices always buys on the market. */
function pick(b: ChipHolder): { src: ChipSource; cut: number; cover: number; fabs: number; chips: ChipSupply | null } {
  if (b.industry !== 'devices') return { src: 'market', cut: 0, cover: 1, fabs: 0, chips: null }
  const fabs = readFabs(b.fabs)
  const chips = readChips(b.chips as unknown as Json | undefined)
  const own = FAB_CUT[fabs] ?? 0
  const sis = chips ? (SISTER_CUT[chips.stage] ?? 0) * chips.cover : 0
  // One source: the larger cut wins, own fabs on a tie, and the two never add.
  if (chips && sis > own) return { src: 'sister', cut: sis, cover: chips.cover, fabs, chips }
  if (own > 0) return { src: 'fab', cut: own, cover: 1, fabs, chips: null }
  return { src: 'market', cut: 0, cover: 1, fabs, chips: null }
}

export function chipSource(b: ChipHolder): { src: ChipSource; cut: number; cover: number } {
  const { src, cut, cover } = pick(b)
  return { src, cut, cover }
}

/** The chip terms of a business in a year: the process node and yield it gets, how much faster that is than the market's, and the quality it lifts. */
export function chipTerms(b: ChipHolder, year: number): ChipTerms {
  const { src, cut, cover, fabs, chips } = pick(b)
  const base = marketNode(year)
  let node = base
  let yieldRate = MARKET_YIELD
  if (src === 'fab') {
    node = Math.min(6, base + (fabs >= 2 ? 1 : 0))
    yieldRate = Math.round((MARKET_YIELD + 0.05 * fabs) * 100) / 100
  } else if (src === 'sister' && chips) {
    node = Math.max(base, chips.node)
    yieldRate = Math.max(MARKET_YIELD, chips.yield)
  }
  const perfBump = chipPerf(node, yieldRate) - chipPerf(base, MARKET_YIELD)
  const lift = clamp(LIFT_K * perfBump * (src === 'sister' ? cover : 1), 0, LIFT_MAX)
  return { src, cut, node, yield: yieldRate, cover, perfBump, lift, ...(src === 'sister' && chips ? { from: chips.from } : {}) }
}

/** The unit cost multiplier of the chip source. It has no year on purpose, because `costFactor` has none: Group Services keeps a sister's record fresh. */
export function chipCostFactor(b: ChipHolder): number {
  return 1 - CHIP_SHARE * chipSource(b).cut
}

/** Splits a year's cogs into what the cut saved and what the chips still cost, undoing the cut that is already inside `cogs`. */
export function chipBook(cogs: number, cut: number): { saved: number; paid: number } {
  if (!Number.isFinite(cogs) || !(cogs > 0)) return { saved: 0, paid: 0 }
  const c = clamp(cut, 0, 1)
  const f = 1 - CHIP_SHARE * c
  return { saved: (cogs * CHIP_SHARE * c) / f, paid: (cogs * CHIP_SHARE * (1 - c)) / f }
}

type Anchors = readonly (readonly [number, number])[]

// The market's price for a kind, in 2026 dollars, as (year, price) anchors. A private copy: this file imports nothing at runtime.
const DESKTOP: Anchors = [[1977, 6500], [1980, 4500], [1983, 2200], [1986, 1800], [1988, 5000], [1992, 4400], [1996, 3600], [1999, 2400], [2002, 1900], [2006, 1500], [2010, 1300]]
const ANCHORS: Readonly<Record<string, Anchors>> = {
  'Home Computer': [[1977, 6500], [1980, 4500], [1983, 2200], [1986, 1800]],
  'Mobile Phone': [[1983, 6000], [1990, 3000], [1996, 800], [2000, 400], [2008, 300]],
  'Desktop PC': DESKTOP,
  Smartphone: [[2007, 1100], [2010, 1000], [2014, 950], [2026, 900]],
  'VR Headset': [[2016, 700], [2020, 500]],
  'AR Glasses': [[2019, 1500], [2023, 1000], [2026, 800]],
}

/** Linear between anchors, holding the first before and the last after. */
function along(a: Anchors, year: number): number {
  const first = a[0]
  const last = a[a.length - 1]
  if (year <= first[0]) return first[1]
  if (year >= last[0]) return last[1]
  for (let i = 1; i < a.length; i++) {
    const [y1, v1] = a[i]
    if (year <= y1) {
      const [y0, v0] = a[i - 1]
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0)
    }
  }
  return last[1]
}

/** The market's price for a kind in a year, whole 2026 dollars (`LINE_PRICE` scales it per sort of line). The platform and anything unknown give 0. */
export function kindReference(family: string, year: number): number {
  const y = Number.isNaN(year) ? Infinity : year
  if (family === 'Laptop') return y >= 2010 ? 1300 : Math.round(1.4 * along(DESKTOP, y))
  if (!Object.prototype.hasOwnProperty.call(ANCHORS, family)) return 0
  return Math.round(along(ANCHORS[family], y))
}
