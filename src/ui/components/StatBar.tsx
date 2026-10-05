export interface StatBarProps {
  label: string
  value: number
  emoji?: string
  /** Compact variant for person sheets. */
  small?: boolean
}

/** Colored progress bar like the original: green 31-100, orange 13-30, red 0-12. */
export function statColor(value: number): string {
  if (value <= 12) return 'var(--stat-red)'
  if (value <= 30) return 'var(--stat-orange)'
  return 'var(--stat-green)'
}

export function StatBar({ label, value, emoji, small }: StatBarProps) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className={small ? 'statbar statbar-small' : 'statbar'}>
      <span className="statbar-label">
        {emoji ? <span className="statbar-emoji">{emoji}</span> : null}
        {label}
      </span>
      <span className="statbar-track">
        <span className="statbar-fill" style={{ width: `${v}%`, background: statColor(v) }} />
      </span>
      <span className="statbar-value">{v}%</span>
    </div>
  )
}
