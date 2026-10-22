// The fields of the world frontier (R3-F1, C.6): what a disclosure can move. 20 of them today, and room for 32 (FRONTIER_CAPS.fields):
// the 12 future-facing wave kinds (the kinds of business/tech-wave-data.ts that have no row in history/tech-waves.ts, so their waves
// all come after 2026) and the 8 AI capabilities (business/ai-bench-data.ts CAP_IDS).
//
// A field with `lead` can be ahead of the calendar path: a disclosure there adds years to the world's lead. The 8 AI capabilities
// are spill only (`lead: false`): research in one gives public research and rival pressure, to itself and, through `parent`, to
// the `ai` field above it, and never a lead (the AI market keeps its calendar drift in R3).
//
// This file is the one table the frontier's later tasks extend (medicine, software, weapons and finance come with C.8 and C.9). It is
// a literal on purpose: it sits in layer 2, which may not import business/, so test/world-frontier-fields.test.ts is what keeps it
// equal to the wave kinds and the capability ids it mirrors. Every lookup takes own keys only, so a saved "constructor" or
// "__proto__" is nothing. It imports nothing and draws no random number.

export type FieldId =
  | 'ai'
  | 'chips'
  | 'drug'
  | 'space'
  | 'ev'
  | 'automation'
  | 'quantum'
  | 'security'
  | 'fusion'
  | 'neuro'
  | 'drones'
  | 'carbon'
  | 'ai.language'
  | 'ai.coding'
  | 'ai.vision'
  | 'ai.speech'
  | 'ai.reasoning'
  | 'ai.agents'
  | 'ai.robotics'
  | 'ai.science'

export interface FieldDef {
  id: FieldId
  /** What the player reads: lower case ("fusion power"), except where a word is always capitalized ("AI reasoning"). At most 30 characters. */
  label: string
  /** False for the 8 AI capabilities: spill only, no lead. */
  lead: boolean
  /** The field whose public research and rival pressure this one shares: `ai` for an AI capability. */
  parent?: FieldId
}

const def = (id: FieldId, label: string, lead = true, parent?: FieldId): FieldDef => (parent === undefined ? { id, label, lead } : { id, label, lead, parent })

/** The fields, in the order a shard keeps them. */
export const FIELD_IDS: readonly FieldId[] = Object.freeze([
  'ai',
  'chips',
  'drug',
  'space',
  'ev',
  'automation',
  'quantum',
  'security',
  'fusion',
  'neuro',
  'drones',
  'carbon',
  'ai.language',
  'ai.coding',
  'ai.vision',
  'ai.speech',
  'ai.reasoning',
  'ai.agents',
  'ai.robotics',
  'ai.science',
] as const)

export const FIELDS: Readonly<Record<FieldId, FieldDef>> = Object.freeze({
  ai: def('ai', 'frontier AI'),
  chips: def('chips', 'chip design'),
  drug: def('drug', 'new drugs'),
  space: def('space', 'spaceflight'),
  ev: def('ev', 'electric cars'),
  automation: def('automation', 'automation'),
  quantum: def('quantum', 'quantum computing'),
  security: def('security', 'cybersecurity'),
  fusion: def('fusion', 'fusion power'),
  neuro: def('neuro', 'brain interfaces'),
  drones: def('drones', 'drones'),
  carbon: def('carbon', 'carbon removal'),
  'ai.language': def('ai.language', 'AI language', false, 'ai'),
  'ai.coding': def('ai.coding', 'AI coding', false, 'ai'),
  'ai.vision': def('ai.vision', 'AI vision', false, 'ai'),
  'ai.speech': def('ai.speech', 'AI speech', false, 'ai'),
  'ai.reasoning': def('ai.reasoning', 'AI reasoning', false, 'ai'),
  'ai.agents': def('ai.agents', 'AI agents', false, 'ai'),
  'ai.robotics': def('ai.robotics', 'AI robotics', false, 'ai'),
  'ai.science': def('ai.science', 'AI science', false, 'ai'),
})

/** The deep-tech trade that sells each future-facing kind's breakthrough (WAVE_KINDS[kind].core[0]): a trade is in one field at most. */
const TRADE_FIELD: Readonly<Record<string, FieldId>> = Object.freeze({
  aiLab: 'ai',
  semiconductor: 'chips',
  biotech: 'drug',
  spaceTech: 'space',
  electricVehicles: 'ev',
  robotics: 'automation',
  quantum: 'quantum',
  cybersecurity: 'security',
  fusion: 'fusion',
  neurotech: 'neuro',
  drones: 'drones',
  carbonCapture: 'carbon',
})

const own = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key)

/** True for one of the 20 ids. Own keys only: a saved "constructor" or "__proto__" is not a field. */
export function isFieldId(x: unknown): x is FieldId {
  return typeof x === 'string' && own(FIELDS, x)
}

/** What the player reads for a field ("fusion power", "AI reasoning"). At most 30 characters. */
export function fieldLabel(f: FieldId): string {
  return isFieldId(f) ? FIELDS[f].label : ''
}

/** The field this one shares public research and rival pressure with: `ai` for an AI capability, null for the rest. */
export function parentField(f: FieldId): FieldId | null {
  return isFieldId(f) ? FIELDS[f].parent ?? null : null
}

/** The field of a wave kind: the 12 future-facing kinds map to the field of the same name; a history kind or junk is null. */
export function fieldOfKind(kind: string): FieldId | null {
  return isFieldId(kind) && !kind.includes('.') ? kind : null
}

/** The field of a deep-tech trade (aiLab to ai, semiconductor to chips and so on); any other trade is null. */
export function fieldOfTrade(trade: string): FieldId | null {
  return typeof trade === 'string' && own(TRADE_FIELD, trade) ? TRADE_FIELD[trade]! : null
}

/** The field of an AI capability id ('reasoning' to 'ai.reasoning'); anything else is null. */
export function fieldOfCap(cap: string): FieldId | null {
  if (typeof cap !== 'string' || cap.includes('.')) return null
  const id = `ai.${cap}`
  return isFieldId(id) ? id : null
}
