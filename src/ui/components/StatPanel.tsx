// The four stat bars pinned under the bottom bar (plus Fame once you're famous).
import type { Character, StatKey } from '../../game/types'
import { StatBar } from './StatBar'

export const STAT_META: { key: StatKey; label: string; emoji: string }[] = [
  { key: 'happiness', label: 'Happiness', emoji: '😊' },
  { key: 'health', label: 'Health', emoji: '❤️' },
  { key: 'smarts', label: 'Smarts', emoji: '🧠' },
  { key: 'looks', label: 'Looks', emoji: '💅' },
]

/** Stats this low show a warning sign instead of their emoji, like the original. */
export const LOW_STAT = 15

export interface StatPanelProps {
  character: Character
}

export function StatPanel({ character }: StatPanelProps) {
  const fame = character.hidden.fame
  return (
    <section className="statpanel" aria-label="Stats">
      {STAT_META.map(({ key, label, emoji }) => {
        const v = character.stats[key]
        return <StatBar key={key} label={label} emoji={v < LOW_STAT ? '⚠️' : emoji} value={v} />
      })}
      {fame >= 10 ? <StatBar label="Fame" emoji="⭐" value={fame} /> : null}
    </section>
  )
}
