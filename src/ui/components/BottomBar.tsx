// The bottom navigation: Occupation, Assets, the big green "+ Age" button,
// Relationships and Activities.
export type BottomTab = 'occupation' | 'assets' | 'relationships' | 'activities'

export interface BottomBarProps {
  /** A popup is waiting (the queue isn't empty) — nothing can be tapped. */
  disabled: boolean
  onOpen: (tab: BottomTab) => void
  onAge: () => void
}

const LEFT: { tab: BottomTab; label: string; emoji: string }[] = [
  { tab: 'occupation', label: 'Occupation', emoji: '💼' },
  { tab: 'assets', label: 'Assets', emoji: '🏠' },
]

const RIGHT: { tab: BottomTab; label: string; emoji: string }[] = [
  { tab: 'relationships', label: 'Relationships', emoji: '❤️' },
  { tab: 'activities', label: 'Activities', emoji: '⭐' },
]

export function BottomBar({ disabled, onOpen, onAge }: BottomBarProps) {
  const tabButton = ({ tab, label, emoji }: { tab: BottomTab; label: string; emoji: string }) => (
    <button key={tab} type="button" className="bb-btn" disabled={disabled} onClick={() => onOpen(tab)} aria-label={label}>
      <span className={`bb-icon c-${tab}`} aria-hidden>
        {emoji}
      </span>
      <span className="bb-label">{label}</span>
    </button>
  )
  return (
    <nav className="bottombar" aria-label="Main menu">
      {LEFT.map(tabButton)}
      <button type="button" className="bb-age" data-focus-home disabled={disabled} onClick={onAge} aria-label="Age up one year">
        <span className="bb-age-plus" aria-hidden>
          +
        </span>
        <span className="bb-age-label">Age</span>
      </button>
      {RIGHT.map(tabButton)}
    </nav>
  )
}
