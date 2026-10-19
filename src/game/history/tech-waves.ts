// History waves: the real technology episodes that have no company story in MARKET_EVENTS (the
// dot-com boom and crash, the 2020 digital shift and the AI boom are events there and are not
// repeated here). A pure table, beside market-events.ts: no state, no RNG, no flags.
//
// A row is a list of [year, hype, delivery] control points, joined by straight lines.
//   hype      what investors expect, 0-1.
//   delivery  how fast the roll-out is really happening (new units, new customers), 0-1. It is
//             bell-shaped: the permanent level of a trade after the episode is already in its own
//             market-size curve (business/competition-data.ts MARKETS), so the wave carries only the
//             boom and ends with the first zero.
// The first point is the first year of the episode (delivery at most 0.2). The last point is the year
// AFTER the last active year and is exactly [year, 0, 0], so the effect eases out instead of
// stopping with a cliff, and every year outside first..last is neutral.
import type { WaveKind } from '../business/tech-wave-data'

export type WavePoint = readonly [year: number, hype: number, delivery: number]

export interface HistoryWave {
  /** `hist:<kind>`. */
  id: string
  kind: WaveKind
  /** News name. */
  name: string
  /** 0-1, how disruptive (the same scale as TechWave.size). */
  size: number
  points: readonly WavePoint[]
  /** Countries where it hits at full reach. */
  home: readonly string[]
  /** Reach elsewhere (0-1). Omitted: 0.35 + 0.4 x delivery, the dynamic-wave rule. */
  abroad?: number
  /** high: both ends of the years are documented milestones. medium: an end year or the shape is judgment. */
  confidence: 'high' | 'medium'
  /** One line: where the years come from. */
  source: string
}

export const HISTORY_WAVES: readonly HistoryWave[] = [
  {
    id: 'hist:transistor', kind: 'transistor', name: 'The transistor', size: 0.65,
    points: [[1947, 0.2, 0], [1951, 0.4, 0.05], [1954, 0.6, 0.2], [1957, 0.8, 0.5], [1959, 0.4, 0.3], [1960, 0.2, 0.15], [1961, 0, 0]],
    home: ['us', 'gb', 'jp'],
    confidence: 'medium', source: 'Bell Labs, Dec 1947; Regency TR-1 and Sony radios 1954-55; Fairchild and the integrated circuit 1957-59. The end year is a convention.',
  },
  {
    id: 'hist:television', kind: 'television', name: 'Television', size: 0.5,
    points: [[1946, 0.25, 0], [1948, 0.5, 0.15], [1950, 0.65, 0.5], [1953, 0.65, 0.9], [1957, 0.4, 0.55], [1959, 0.2, 0.25], [1960, 0.1, 0.1], [1961, 0, 0]],
    home: ['us', 'gb', 'ca'], abroad: 0.25,
    confidence: 'high', source: 'timeline.ts TECH.tv invented 1946, mainstream 1955. US homes with a set: 9% in 1950, 56% in 1954, 87% in 1960.',
  },
  {
    id: 'hist:microcomputer', kind: 'microcomputer', name: 'The microprocessor and home computers', size: 0.6,
    points: [[1975, 0.35, 0], [1977, 0.55, 0.2], [1979, 0.65, 0.45], [1981, 0.8, 0.7], [1983, 0.85, 0.85], [1984, 0.5, 0.65], [1985, 0.25, 0.35], [1986, 0, 0]],
    home: ['us', 'gb', 'jp'], abroad: 0.4,
    confidence: 'high', source: 'Altair 8800 and Microsoft 1975; Apple II, PET and TRS-80 1977; IBM PC 1981; home computer shakeout 1983-84; Macintosh 1984.',
  },
  // Hype stays at 0.7 or less after 1997: the dot-com boom event already lifts telecom.
  {
    id: 'hist:mobilephone', kind: 'mobilephone', name: 'Mobile phones', size: 0.65,
    points: [[1983, 0.3, 0], [1987, 0.4, 0.1], [1991, 0.5, 0.25], [1994, 0.6, 0.45], [1997, 0.7, 0.75], [1998, 0.65, 0.8], [1999, 0.5, 0.55], [2000, 0.25, 0.3], [2001, 0, 0]],
    home: ['us', 'fi', 'se', 'jp', 'gb', 'kr'],
    confidence: 'high', source: 'DynaTAC and AMPS 1983, GSM 1991, Nokia 6110 1997; timeline.ts TECH.mobilePhone invented 1983, mainstream 2000.',
  },
  {
    id: 'hist:smartphone', kind: 'smartphone', name: 'Smartphones', size: 0.7,
    points: [[2007, 0.55, 0], [2009, 0.7, 0.35], [2011, 0.8, 0.85], [2012, 0.5, 0.65], [2013, 0.25, 0.35], [2014, 0, 0]],
    home: ['us', 'kr', 'jp', 'gb'],
    confidence: 'high', source: 'iPhone Jun 2007, App Store Jul 2008, Android Oct 2008; timeline.ts TECH.smartphone invented 2007, mainstream 2013.',
  },
  {
    id: 'hist:cloud', kind: 'cloud', name: 'Cloud computing', size: 0.6,
    points: [[2006, 0.3, 0], [2008, 0.45, 0.1], [2010, 0.6, 0.35], [2012, 0.7, 0.65], [2013, 0.65, 0.7], [2014, 0.45, 0.5], [2015, 0.2, 0.25], [2016, 0, 0]],
    home: ['us', 'ie', 'gb', 'sg'],
    confidence: 'medium', source: 'Amazon S3 Mar 2006 and EC2 Aug 2006; Azure 2010; Google Cloud 2011-13. The end year is a convention.',
  },
  {
    id: 'hist:solarbattery', kind: 'solarbattery', name: 'The solar and battery cost collapse', size: 0.5,
    points: [[2010, 0.5, 0.1], [2012, 0.35, 0.3], [2014, 0.4, 0.5], [2016, 0.55, 0.7], [2017, 0.6, 0.8], [2019, 0.35, 0.5], [2020, 0.2, 0.25], [2021, 0, 0]],
    home: ['de', 'cn', 'us', 'jp', 'it', 'in'],
    confidence: 'medium', source: 'BloombergNEF: module prices and lithium-ion pack prices both fell about 90% from 2010 to 2020; the 2011-13 solar glut is the dip.',
  },
  {
    id: 'hist:reusablerocket', kind: 'reusablerocket', name: 'Reusable rockets', size: 0.5,
    points: [[2015, 0.4, 0], [2017, 0.5, 0.2], [2019, 0.55, 0.4], [2021, 0.8, 0.7], [2022, 0.4, 0.55], [2023, 0, 0]],
    home: ['us', 'nz'], abroad: 0.3,
    confidence: 'medium', source: 'First Falcon 9 landing Dec 2015, first reflight Mar 2017, Starlink from 2019, space listings boom 2021 and bust 2022.',
  },
  {
    id: 'hist:evboom', kind: 'evboom', name: 'The EV boom', size: 0.55,
    points: [[2019, 0.45, 0.1], [2020, 0.8, 0.3], [2021, 0.95, 0.6], [2022, 0.4, 0.5], [2023, 0, 0]],
    home: ['us', 'cn', 'de', 'no'],
    confidence: 'high', source: 'Model 3 ramp 2019; Tesla up about 740% in 2020; Rivian listing Nov 2021; EV listings bust 2022. IEA global EV sales about 2m (2019), 6.6m (2021), 10m (2022).',
  },
  {
    id: 'hist:mrna', kind: 'mrna', name: 'mRNA vaccines', size: 0.55,
    points: [[2020, 0.55, 0.2], [2021, 0.6, 0.5], [2022, 0, 0]],
    home: ['us', 'de'], abroad: 0.8,
    confidence: 'high', source: 'Pfizer-BioNTech and Moderna results Nov 2020, first doses Dec 2020, Moderna share peak Aug 2021. Sales stayed high in 2022, so the exit is steep by design.',
  },
  {
    id: 'hist:glp1', kind: 'glp1', name: 'GLP-1 weight-loss drugs', size: 0.4,
    points: [[2021, 0.35, 0.05], [2022, 0.55, 0.2], [2023, 0.85, 0.5], [2024, 0.5, 0.55], [2025, 0, 0]],
    home: ['us', 'dk'],
    confidence: 'medium', source: 'Wegovy approved Jun 2021, Mounjaro May 2022, Zepbound Nov 2023; Novo and Lilly shares peaked mid-2024. The boom ran on past 2024; the end year is the table window.',
  },
]

const round = (n: number) => Math.round(n * 1e4) / 1e4

/** The wave's hype and delivery in a year, or null outside its years. Linear between control points. */
export function waveAt(w: HistoryWave, year: number): { hype: number; delivery: number } | null {
  const y = Math.round(year)
  const p = w.points
  if (!Number.isFinite(y) || y < p[0][0] || y > p[p.length - 1][0]) return null
  for (let i = 1; i < p.length; i++) {
    if (y > p[i][0]) continue
    const [y0, h0, d0] = p[i - 1], [y1, h1, d1] = p[i]
    const t = y1 === y0 ? 1 : (y - y0) / (y1 - y0)
    return { hype: round(h0 + (h1 - h0) * t), delivery: round(d0 + (d1 - d0) * t) }
  }
  return null
}

/** A wave live in a country and year, ready for the shared reaction formula (business/tech-waves.ts waveFactors). */
export interface HistoryWaveState {
  id: string
  kind: WaveKind
  /** The row's news name. */
  name: string
  size: number
  hype: number
  delivery: number
  /** 1 at home and in the world market; elsewhere `abroad`, or 0.35 + 0.4 x delivery. */
  reach: number
}

/** The history waves at work in a country this year; `country` may be the market key 'world', which sees every row at full reach. Pure; the table is small, so no cache is needed. */
export function historyWaveStates(country: string, year: number): HistoryWaveState[] {
  const out: HistoryWaveState[] = []
  for (const w of HISTORY_WAVES) {
    const a = waveAt(w, year)
    if (!a || (a.hype === 0 && a.delivery === 0)) continue
    const reach = country === 'world' || w.home.includes(country) ? 1 : w.abroad ?? 0.35 + 0.4 * a.delivery
    out.push({ id: w.id, kind: w.kind, name: w.name, size: w.size, hype: a.hype, delivery: a.delivery, reach })
  }
  return out
}

/** True when a row of this kind is live in the year with hype or delivery above 0. Any string is safe: an unknown kind is false. */
export function historyKindActive(kind: string, year: number): boolean {
  for (const w of HISTORY_WAVES) {
    if (w.kind !== kind) continue
    const a = waveAt(w, year)
    if (a && (a.hype > 0 || a.delivery > 0)) return true
  }
  return false
}
