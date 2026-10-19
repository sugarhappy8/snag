// Tech waves: what each kind of breakthrough does to which trades. Pure data, no state, no RNG.
//
// Roles are per trade and the trade lists are typed, so a wrong id fails the typecheck. A trade is in
// at most one role of one kind. Core: the trades that sell the breakthrough. Supply: suppliers and
// complements that sell more because of it. Disrupted: incumbents it takes customers from.
// Disrupted lists are short on purpose: a trade is only there when the loss was real (or is a
// well-known risk) and the effect is meant to be light.
import type { Industry } from '../data/markets'
import type { Category, IdeaDef } from '../workshop/catalog'

export interface WaveKindDef {
  /** Plain noun phrase used in news and report lines ("Frontier AI wave: ..."). */
  label: string
  /** What a rival or a fast follower lands or chases, as a phrase that reads after "landed" and "to chase" ('a breakthrough drug', 'electric cars at scale'). */
  landed: string
  emoji: string
  core: readonly Industry[]
  supply: readonly Industry[]
  disrupted: readonly Industry[]
}

export const WAVE_KINDS = {
  // Deep tech: the twelve deep-tech trades' own breakthrough-class milestones.
  ai: { label: 'Frontier AI', landed: 'a frontier AI leap', emoji: '\u{1F916}', core: ['aiLab'], supply: ['semiconductor', 'dataCenter'], disrupted: ['software', 'marketing', 'education'] },
  chips: { label: 'Chip leap', landed: 'a chip leap', emoji: '\u{1F4BE}', core: ['semiconductor'], supply: ['dataCenter', 'aiLab', 'robotics'], disrupted: [] },
  drug: { label: 'Breakthrough drug', landed: 'a breakthrough drug', emoji: '\u{1F48A}', core: ['biotech'], supply: ['clinic'], disrupted: ['homeCare'] },
  space: { label: 'Space leap', landed: 'a space leap', emoji: '\u{1F6F0}\u{FE0F}', core: ['spaceTech'], supply: ['manufacturing', 'semiconductor', 'telecom'], disrupted: [] },
  ev: { label: 'Electric cars', landed: 'electric cars at scale', emoji: '\u{1F697}', core: ['electricVehicles'], supply: ['battery', 'solar', 'semiconductor'], disrupted: ['autoShop', 'energy'] },
  automation: { label: 'Automation', landed: 'an automation leap', emoji: '\u{2699}\u{FE0F}', core: ['robotics'], supply: ['semiconductor', 'battery', 'manufacturing'], disrupted: [] },
  quantum: { label: 'Quantum computing', landed: 'a quantum computing leap', emoji: '\u{269B}\u{FE0F}', core: ['quantum'], supply: ['semiconductor', 'dataCenter', 'cybersecurity'], disrupted: [] },
  security: { label: 'Cybersecurity', landed: 'a cybersecurity leap', emoji: '\u{1F6E1}\u{FE0F}', core: ['cybersecurity'], supply: ['software', 'dataCenter'], disrupted: [] },
  fusion: { label: 'Fusion power', landed: 'a fusion power leap', emoji: '\u{1F31F}', core: ['fusion'], supply: ['manufacturing', 'construction'], disrupted: ['energy', 'solar'] },
  neuro: { label: 'Brain interfaces', landed: 'a brain interface leap', emoji: '\u{1F9E0}', core: ['neurotech'], supply: ['semiconductor', 'clinic', 'aiLab'], disrupted: [] },
  drones: { label: 'Drones', landed: 'a drone leap', emoji: '\u{1F681}', core: ['drones'], supply: ['battery', 'semiconductor', 'manufacturing'], disrupted: ['logistics'] },
  carbon: { label: 'Carbon removal', landed: 'a carbon removal leap', emoji: '\u{1F331}', core: ['carbonCapture'], supply: ['energy', 'construction'], disrupted: [] },

  // History: episodes with a company story the market events don't tell (history/tech-waves.ts).
  // The game has no media or devices trade, so television's winner is advertising and the handset
  // and phone waves are carried by telecom, software and chips.
  transistor: { label: 'The transistor', landed: 'the transistor', emoji: '\u{1F4FB}', core: ['semiconductor'], supply: ['manufacturing', 'software'], disrupted: [] },
  television: { label: 'Television', landed: 'television', emoji: '\u{1F4FA}', core: ['marketing'], supply: ['manufacturing', 'telecom'], disrupted: ['entertainment', 'nightclub'] },
  microcomputer: { label: 'Home computers', landed: 'home computers', emoji: '\u{1F5A5}\u{FE0F}', core: ['semiconductor', 'software'], supply: ['manufacturing', 'gameStudio'], disrupted: [] },
  mobilephone: { label: 'Mobile phones', landed: 'mobile phones', emoji: '\u{1F4DE}', core: ['telecom'], supply: ['semiconductor', 'manufacturing', 'battery'], disrupted: [] },
  smartphone: { label: 'Smartphones', landed: 'smartphones', emoji: '\u{1F4F1}', core: ['software'], supply: ['semiconductor', 'telecom', 'gameStudio', 'ecommerce', 'battery'], disrupted: [] },
  cloud: { label: 'Cloud computing', landed: 'cloud computing', emoji: '\u{2601}\u{FE0F}', core: ['dataCenter'], supply: ['software', 'semiconductor', 'telecom', 'cybersecurity'], disrupted: [] },
  solarbattery: { label: 'Cheap solar and batteries', landed: 'cheap solar and batteries', emoji: '\u{2600}\u{FE0F}', core: ['solar', 'battery'], supply: ['electricVehicles', 'construction', 'manufacturing'], disrupted: ['energy'] },
  reusablerocket: { label: 'Reusable rockets', landed: 'reusable rockets', emoji: '\u{1F680}', core: ['spaceTech'], supply: ['manufacturing', 'semiconductor', 'telecom'], disrupted: [] },
  evboom: { label: 'The EV boom', landed: 'the EV boom', emoji: '\u{26A1}', core: ['electricVehicles'], supply: ['battery', 'semiconductor', 'solar'], disrupted: [] },
  mrna: { label: 'mRNA vaccines', landed: 'mRNA vaccines', emoji: '\u{1F489}', core: ['biotech'], supply: ['clinic', 'logistics'], disrupted: [] },
  glp1: { label: 'GLP-1 drugs', landed: 'GLP-1 drugs', emoji: '\u{1F9EA}', core: ['biotech'], supply: ['clinic'], disrupted: ['bakery', 'brewery'] },
} as const satisfies Record<string, WaveKindDef>

export type WaveKind = keyof typeof WAVE_KINDS

/** True for a real kind. Own keys only: a saved "constructor" or "__proto__" must not pass an `in` test. */
export function isWaveKind(k: unknown): k is WaveKind {
  return typeof k === 'string' && Object.hasOwn(WAVE_KINDS, k)
}

// ---------------------------------------------------------------------------
// What writes a wave (Task 5). Flat records, looked up with Object.hasOwn so a saved or typed
// "constructor" finds nothing. Every key is checked against its catalogue by test/tech-wave-data.test.ts.

/** A heavy launch that ripples: the kind it starts and how disruptive it is. */
export interface HeavyWave {
  kind: WaveKind
  size: number
}

/** A heavy pioneer counts as a wave only this many years after the catalogue's first date (a late launch of an old technology is a follower). */
export const HEAVY_WAVE_WINDOW = 10

/** Heavy R&D catalogue entries that start a wave: key `trade|Catalogue Name`, heavy-eligible trades only. */
export const HEAVY_WAVES: Readonly<Record<string, HeavyWave>> = {
  'dataCenter|Liquid-Cooled GPU Hall': { kind: 'ai', size: 0.35 },
  'dataCenter|Hyperscale Cloud Region': { kind: 'cloud', size: 0.5 },
  'software|Autonomous Agent Platform': { kind: 'ai', size: 0.5 },
  'software|Hosted Subscription Platform': { kind: 'cloud', size: 0.4 },
  'energy|Fusion Pilot Plant': { kind: 'fusion', size: 0.6 },
  'energy|Grid-Scale Battery Plant': { kind: 'solarbattery', size: 0.35 },
  'battery|Lithium-Ion Cell Line': { kind: 'solarbattery', size: 0.5 },
  'battery|Solid-State Cell Line': { kind: 'ev', size: 0.5 },
  'solar|Photovoltaic Power Plant': { kind: 'solarbattery', size: 0.4 },
  'solar|Perovskite Tandem Panels': { kind: 'solarbattery', size: 0.35 },
  'manufacturing|Industrial Robot Cell': { kind: 'automation', size: 0.4 },
  'logistics|Driverless Truck Lanes': { kind: 'automation', size: 0.45 },
  'ecommerce|Robotic Warehouse Floor': { kind: 'automation', size: 0.3 },
  'ecommerce|Drone Delivery Hub': { kind: 'drones', size: 0.25 },
  'telecom|Satellite-to-Phone Service': { kind: 'space', size: 0.3 },
  'telecom|Cell Tower Network': { kind: 'mobilephone', size: 0.45 },
  'clinic|AI Scan Reading': { kind: 'ai', size: 0.3 },
  'clinic|Robotic Surgery Theater': { kind: 'automation', size: 0.3 },
  'education|AI Tutor Platform': { kind: 'ai', size: 0.3 },
}

export function heavyWaveFor(trade: string, name: string): HeavyWave | null {
  const key = `${trade}|${name}`
  return Object.hasOwn(HEAVY_WAVES, key) ? HEAVY_WAVES[key] : null
}

/** A deep-tech program (or derived milestone) that starts a wave. */
export interface DeepWave {
  kind: WaveKind
  size: number
  /** The short name the news and report lines use. */
  name: string
  /** Only the first completion of a repeatable program counts. */
  first?: true
  /** Only once the lab's autonomy level is at least this after the win. */
  autonomy?: number
}

/**
 * Deep-tech programs that are breakthrough-class: key `trade:programId` (the PROGRAMS ids). Routine
 * `nextgen` programs never appear. Two more kinds of milestone are derived in code, not listed here:
 * the first frontier model of an AI lab and an approved drug with a big peak.
 */
export const DEEPTECH_WAVES: Readonly<Record<string, DeepWave>> = {
  'semiconductor:euv': { kind: 'chips', size: 0.45, name: 'Leading-edge chips' },
  'semiconductor:aiChip': { kind: 'ai', size: 0.3, name: 'AI accelerators' },
  'aiLab:frontier': { kind: 'ai', size: 0.6, name: 'A new AI architecture' },
  'aiLab:agents': { kind: 'automation', size: 0.3, name: 'AI agents' },
  'robotics:humanoid': { kind: 'automation', size: 0.45, name: 'Humanoid robots' },
  'robotics:brain': { kind: 'ai', size: 0.3, name: 'Robot foundation models' },
  'biotech:platform': { kind: 'drug', size: 0.35, name: 'Platform medicine' },
  'spaceTech:reuse': { kind: 'space', size: 0.5, name: 'Reusable rockets' },
  'spaceTech:crew': { kind: 'space', size: 0.3, name: 'Commercial crewed flight' },
  'electricVehicles:solidState': { kind: 'ev', size: 0.5, name: 'Solid-state batteries' },
  'electricVehicles:selfdrive': { kind: 'automation', size: 0.4, name: 'Self-driving cars', autonomy: 3 },
  'quantum:qec': { kind: 'quantum', size: 0.35, name: 'Error-corrected qubits', first: true },
  'quantum:advantage': { kind: 'quantum', size: 0.6, name: 'Quantum advantage' },
  'cybersecurity:aiSec': { kind: 'security', size: 0.25, name: 'AI security copilots' },
  'fusion:netGain': { kind: 'fusion', size: 0.5, name: 'Fusion net energy gain' },
  'fusion:pilot': { kind: 'fusion', size: 0.6, name: 'Fusion on the grid' },
  'neurotech:firstHuman': { kind: 'neuro', size: 0.4, name: 'Thought-controlled implants' },
  'neurotech:approval': { kind: 'neuro', size: 0.55, name: 'Approved brain implants' },
  'drones:bvlos': { kind: 'drones', size: 0.3, name: 'Beyond-sight drone flights' },
  'drones:typeCert': { kind: 'drones', size: 0.5, name: 'Air taxis' },
  'carbonCapture:demo': { kind: 'carbon', size: 0.25, name: 'Direct air capture' },
  'carbonCapture:storage': { kind: 'carbon', size: 0.3, name: 'Carbon turned to rock' },
}

export function deepWaveFor(trade: string, programId: string): DeepWave | null {
  const key = `${trade}:${programId}`
  return Object.hasOwn(DEEPTECH_WAVES, key) ? DEEPTECH_WAVES[key] : null
}

/**
 * Workshop ideas that ripple, by IdeaDef id. Future-race ideas write 'race' waves, history-race ideas
 * 'workshop' waves. A missing size is 0.1 + 0.1 d (0.2 to 0.6). Four future novelties (the floating
 * skateboard, the force-field umbrella, calorie-free chocolate, never-wash clothes) write nothing.
 */
export const WORKSHOP_WAVES: Readonly<Record<string, { kind: WaveKind; size?: number }>> = {
  'fut-fusion-cell': { kind: 'fusion', size: 0.6 },
  'fut-superwire': { kind: 'fusion', size: 0.4 },
  'fut-dream-recorder': { kind: 'neuro', size: 0.4 },
  'fut-pocket-quantum': { kind: 'quantum', size: 0.6 },
  'fut-organ-printer': { kind: 'drug', size: 0.5 },
  'fut-cold-cure': { kind: 'drug', size: 0.4 },
  'fut-tooth-gel': { kind: 'drug', size: 0.3 },
  'fut-plastic-bin': { kind: 'carbon', size: 0.3 },
  'fut-robot-chef': { kind: 'automation', size: 0.4 },
  'hist-picture-box': { kind: 'television' },
  'hist-crystal-switch': { kind: 'transistor' },
  'hist-thinking-machine': { kind: 'microcomputer' },
  'hist-pocket-telephone': { kind: 'mobilephone' },
  'hist-touch-telephone': { kind: 'smartphone' },
  'hist-touch-slate': { kind: 'smartphone', size: 0.3 },
}

/** History-race ideas with no entry of their own ripple by their category. */
export const CATEGORY_WAVES: Readonly<Partial<Record<Category, WaveKind>>> = {
  computing: 'microcomputer',
  energy: 'solarbattery',
  transport: 'ev',
  health: 'drug',
}

/** The wave a Workshop first starts, or null: the idea's own entry, else (history ideas only) its category. */
export function workshopWaveFor(def: Pick<IdeaDef, 'id' | 'cat' | 'd' | 'future' | 'real'>): { kind: WaveKind; size: number } | null {
  const own = Object.hasOwn(WORKSHOP_WAVES, def.id) ? WORKSHOP_WAVES[def.id] : null
  const kind = own ? own.kind : def.real !== undefined && Object.hasOwn(CATEGORY_WAVES, def.cat) ? CATEGORY_WAVES[def.cat] : undefined
  if (!kind) return null
  return { kind, size: own?.size ?? Math.min(0.6, Math.max(0.2, 0.1 + 0.1 * def.d)) }
}
