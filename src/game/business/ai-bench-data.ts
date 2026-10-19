// AI Lab 2.0 data leaf: the eight capabilities a model is rated on. No imports, so any layer may read it.
// A rating is an integer; 100 points is one doubling of odds against a test. The anchors are stylized
// history (modeled, not measured): [year, best rating in the world] control points up to 2026.

export const CAP_IDS = ['language', 'coding', 'vision', 'speech', 'reasoning', 'agents', 'robotics', 'science'] as const
export type CapId = (typeof CAP_IDS)[number]
/** Rating per capability. A capability that isn't open yet, or isn't rated, is missing. */
export type CapMap = Partial<Record<CapId, number>>
/** A key of TECH in history/timeline.ts. */
export type CapEra = 'deepLearning' | 'aiAssistants'

export interface CapDef {
  id: CapId
  label: string
  emoji: string
  /** Share of the composite; the eight sum to 1. */
  weight: number
  era: CapEra
  /** Years after TECH[era].invented that the capability opens (can be negative). */
  delay: number
  /** [year, best rating] control points, sorted, from the opening year to 2026. */
  anchors: readonly (readonly [number, number])[]
}

export const CAPS: Readonly<Record<CapId, CapDef>> = {
  language: {
    id: 'language', label: 'Language', emoji: '\u{1F4AC}', weight: 0.26, era: 'deepLearning', delay: 0,
    anchors: [[2012, 200], [2015, 300], [2017, 420], [2018, 500], [2020, 740], [2022, 960], [2023, 1060], [2024, 1140], [2026, 1260]],
  },
  coding: {
    id: 'coding', label: 'Coding', emoji: '\u{1F4BB}', weight: 0.16, era: 'aiAssistants', delay: -1,
    anchors: [[2021, 300], [2022, 500], [2023, 800], [2024, 1040], [2025, 1200], [2026, 1320]],
  },
  vision: {
    id: 'vision', label: 'Vision', emoji: '\u{1F441}\u{FE0F}', weight: 0.14, era: 'deepLearning', delay: 0,
    anchors: [[2012, 300], [2015, 500], [2017, 600], [2020, 750], [2022, 900], [2024, 1100], [2026, 1240]],
  },
  speech: {
    id: 'speech', label: 'Speech', emoji: '\u{1F399}\u{FE0F}', weight: 0.1, era: 'deepLearning', delay: 0,
    anchors: [[2012, 300], [2015, 480], [2017, 600], [2020, 740], [2022, 940], [2024, 1080], [2026, 1180]],
  },
  reasoning: {
    id: 'reasoning', label: 'Reasoning and math', emoji: '\u{1F9EE}', weight: 0.14, era: 'deepLearning', delay: 2,
    anchors: [[2014, 100], [2016, 240], [2020, 340], [2022, 460], [2023, 620], [2024, 900], [2025, 1120], [2026, 1260]],
  },
  agents: {
    id: 'agents', label: 'Agents', emoji: '\u{1F916}', weight: 0.1, era: 'aiAssistants', delay: 0,
    anchors: [[2022, 200], [2023, 300], [2024, 540], [2025, 840], [2026, 1100]],
  },
  robotics: {
    id: 'robotics', label: 'Robotics control', emoji: '\u{1F9BE}', weight: 0.04, era: 'deepLearning', delay: 4,
    anchors: [[2016, 100], [2019, 220], [2022, 360], [2024, 540], [2026, 740]],
  },
  science: {
    id: 'science', label: 'Science', emoji: '\u{1F52C}', weight: 0.06, era: 'deepLearning', delay: 5,
    anchors: [[2017, 100], [2020, 340], [2022, 520], [2024, 740], [2026, 960]],
  },
}

/** True for one of the eight ids (own keys only, so 'constructor' and '__proto__' are not ids). */
export function isCapId(x: unknown): x is CapId {
  return typeof x === 'string' && (CAP_IDS as readonly string[]).includes(x)
}
