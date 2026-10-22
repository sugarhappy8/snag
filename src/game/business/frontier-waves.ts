// The frontier side of the tech waves (R3-F3): which wave kind a research field belongs to. A leaf: it imports types only, so it stays
// out of the 59-module business cycle. R3-F4 adds the push into the frontier shard here.
import type { WaveKind } from './tech-wave-data'

/** The 12 future-facing wave kinds (the kinds no history row uses), which are also the 12 non-AI-capability field ids of world/frontier-fields.ts. test/tech-waves-effort.test.ts keeps the list equal to the data. */
const FUTURE_KINDS: readonly WaveKind[] = ['ai', 'chips', 'drug', 'space', 'ev', 'automation', 'quantum', 'security', 'fusion', 'neuro', 'drones', 'carbon']
/** The 8 AI capabilities (ai-bench-data.ts CAP_IDS), the `ai.<cap>` fields: each is a part of the `ai` kind. */
const AI_CAPS: readonly string[] = ['language', 'coding', 'vision', 'speech', 'reasoning', 'agents', 'robotics', 'science']

/**
 * The wave kind a research field writes, or null: the 12 future-facing kinds map to themselves, an `ai.<capability>` field to `ai`.
 * A history kind (`cloud`), an unknown field and junk (`constructor`, `__proto__`, a non-string) are null. Pure.
 */
export function kindOfField(field: string): WaveKind | null {
  if (typeof field !== 'string') return null
  const head = field.startsWith('ai.') && AI_CAPS.includes(field.slice(3)) ? 'ai' : field
  const i = FUTURE_KINDS.indexOf(head as WaveKind)
  return i < 0 ? null : FUTURE_KINDS[i]
}
