// Tech waves: what each kind of breakthrough does to which trades. Pure data, no state, no RNG.
//
// Roles are per trade and the trade lists are typed, so a wrong id fails the typecheck. A trade is in
// at most one role of one kind. Core: the trades that sell the breakthrough. Supply: suppliers and
// complements that sell more because of it. Disrupted: incumbents it takes customers from.
// Disrupted lists are short on purpose: a trade is only there when the loss was real (or is a
// well-known risk) and the effect is meant to be light.
import type { Industry } from '../data/markets'

export interface WaveKindDef {
  /** Plain noun phrase used in news and report lines ("Frontier AI wave: ..."). */
  label: string
  emoji: string
  core: readonly Industry[]
  supply: readonly Industry[]
  disrupted: readonly Industry[]
}

export const WAVE_KINDS = {
  // Deep tech: the twelve deep-tech trades' own breakthrough-class milestones.
  ai: { label: 'Frontier AI', emoji: '\u{1F916}', core: ['aiLab'], supply: ['semiconductor', 'dataCenter'], disrupted: ['software', 'marketing', 'education'] },
  chips: { label: 'Chip leap', emoji: '\u{1F4BE}', core: ['semiconductor'], supply: ['dataCenter', 'aiLab', 'robotics'], disrupted: [] },
  drug: { label: 'Breakthrough drug', emoji: '\u{1F48A}', core: ['biotech'], supply: ['clinic'], disrupted: ['homeCare'] },
  space: { label: 'Space leap', emoji: '\u{1F6F0}\u{FE0F}', core: ['spaceTech'], supply: ['manufacturing', 'semiconductor', 'telecom'], disrupted: [] },
  ev: { label: 'Electric cars', emoji: '\u{1F697}', core: ['electricVehicles'], supply: ['battery', 'solar', 'semiconductor'], disrupted: ['autoShop', 'energy'] },
  automation: { label: 'Automation', emoji: '\u{2699}\u{FE0F}', core: ['robotics'], supply: ['semiconductor', 'battery', 'manufacturing'], disrupted: [] },
  quantum: { label: 'Quantum computing', emoji: '\u{269B}\u{FE0F}', core: ['quantum'], supply: ['semiconductor', 'dataCenter', 'cybersecurity'], disrupted: [] },
  security: { label: 'Cybersecurity', emoji: '\u{1F6E1}\u{FE0F}', core: ['cybersecurity'], supply: ['software', 'dataCenter'], disrupted: [] },
  fusion: { label: 'Fusion power', emoji: '\u{1F31F}', core: ['fusion'], supply: ['manufacturing', 'construction'], disrupted: ['energy', 'solar'] },
  neuro: { label: 'Brain interfaces', emoji: '\u{1F9E0}', core: ['neurotech'], supply: ['semiconductor', 'clinic', 'aiLab'], disrupted: [] },
  drones: { label: 'Drones', emoji: '\u{1F681}', core: ['drones'], supply: ['battery', 'semiconductor', 'manufacturing'], disrupted: ['logistics'] },
  carbon: { label: 'Carbon removal', emoji: '\u{1F331}', core: ['carbonCapture'], supply: ['energy', 'construction'], disrupted: [] },

  // History: episodes with a company story the market events don't tell (history/tech-waves.ts).
  // The game has no media or devices trade, so television's winner is advertising and the handset
  // and phone waves are carried by telecom, software and chips.
  transistor: { label: 'The transistor', emoji: '\u{1F4FB}', core: ['semiconductor'], supply: ['manufacturing', 'software'], disrupted: [] },
  television: { label: 'Television', emoji: '\u{1F4FA}', core: ['marketing'], supply: ['manufacturing', 'telecom'], disrupted: ['entertainment', 'nightclub'] },
  microcomputer: { label: 'Home computers', emoji: '\u{1F5A5}\u{FE0F}', core: ['semiconductor', 'software'], supply: ['manufacturing', 'gameStudio'], disrupted: [] },
  mobilephone: { label: 'Mobile phones', emoji: '\u{1F4DE}', core: ['telecom'], supply: ['semiconductor', 'manufacturing', 'battery'], disrupted: [] },
  smartphone: { label: 'Smartphones', emoji: '\u{1F4F1}', core: ['software'], supply: ['semiconductor', 'telecom', 'gameStudio', 'ecommerce', 'battery'], disrupted: [] },
  cloud: { label: 'Cloud computing', emoji: '\u{2601}\u{FE0F}', core: ['dataCenter'], supply: ['software', 'semiconductor', 'telecom', 'cybersecurity'], disrupted: [] },
  solarbattery: { label: 'Cheap solar and batteries', emoji: '\u{2600}\u{FE0F}', core: ['solar', 'battery'], supply: ['electricVehicles', 'construction', 'manufacturing'], disrupted: ['energy'] },
  reusablerocket: { label: 'Reusable rockets', emoji: '\u{1F680}', core: ['spaceTech'], supply: ['manufacturing', 'semiconductor', 'telecom'], disrupted: [] },
  evboom: { label: 'The EV boom', emoji: '\u{26A1}', core: ['electricVehicles'], supply: ['battery', 'semiconductor', 'solar'], disrupted: [] },
  mrna: { label: 'mRNA vaccines', emoji: '\u{1F489}', core: ['biotech'], supply: ['clinic', 'logistics'], disrupted: [] },
  glp1: { label: 'GLP-1 drugs', emoji: '\u{1F9EA}', core: ['biotech'], supply: ['clinic'], disrupted: ['bakery', 'brewery'] },
} as const satisfies Record<string, WaveKindDef>

export type WaveKind = keyof typeof WAVE_KINDS

/** True for a real kind. Own keys only: a saved "constructor" or "__proto__" must not pass an `in` test. */
export function isWaveKind(k: unknown): k is WaveKind {
  return typeof k === 'string' && Object.hasOwn(WAVE_KINDS, k)
}
