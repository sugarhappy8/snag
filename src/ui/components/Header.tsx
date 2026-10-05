// Top of the game screen: avatar, name, role, bank balance, AI status and settings.
import { characterAvatar, formatMoney, fullName, roleLabel, shortMoney } from '../../game/core'
import { getCountry } from '../../game/world'
import type { GameState } from '../../game/types'
import { checkAi, goTo, useApp } from '../store'

export interface HeaderProps {
  g: GameState
  onProfile: () => void
}

type DotState = 'online' | 'offline' | 'checking' | 'busy' | 'off'

function useAiBadge(): { dot: DotState; label: string; title: string } {
  const status = useApp((s) => s.aiStatus)
  const level = useApp((s) => s.settings.aiLevel)
  const message = useApp((s) => s.aiMessage)
  const busy = useApp((s) => s.ai !== null)
  if (level === 'off') return { dot: 'off', label: 'AI off', title: 'AI narration is turned off in Settings.' }
  if (busy) return { dot: 'busy', label: 'Writing', title: 'Your local model is writing…' }
  if (status === 'online') return { dot: 'online', label: 'AI', title: message || 'Connected to LM Studio.' }
  if (status === 'checking' || status === 'unknown') return { dot: 'checking', label: 'AI', title: 'Connecting to LM Studio…' }
  return { dot: 'offline', label: 'Offline', title: (message || 'LM Studio is unreachable.') + ' Tap to retry. The built-in story library is used meanwhile.' }
}

/** A small badge on the avatar: prison, fame, royalty-like status. */
function avatarBadge(g: GameState): string | null {
  const c = g.character
  if (!c.alive) return null
  if (c.prison) return '🔒'
  if (c.job?.category === 'military') return '🎖️'
  if (c.hidden.fame >= 50) return '⭐'
  if (c.conditions.some((x) => x.diagnosed && x.severity >= 60)) return '🤒'
  return null
}

export function Header({ g, onProfile }: HeaderProps) {
  const c = g.character
  const ai = useAiBadge()
  const country = getCountry(c.countryId)
  const badge = avatarBadge(g)
  const money = Math.abs(c.money) >= 1e9 ? shortMoney(c.money) : formatMoney(c.money)

  return (
    <header className="hdr">
      <div className="hdr-top">
        <div className="hdr-brand">
          AnotherLife<span className="hdr-brand-year">{g.year}</span>
        </div>
        <button
          className="hdr-ai"
          title={ai.title}
          aria-label={`AI status: ${ai.title}`}
          onClick={() => (ai.dot === 'off' ? goTo('settings') : ai.dot === 'busy' ? undefined : void checkAi())}
        >
          <span className={`ai-dot is-${ai.dot}`} aria-hidden />
          {ai.label}
        </button>
        <button className="hdr-icon" aria-label="Settings" title="Settings" onClick={() => goTo('settings')}>
          ⚙️
        </button>
      </div>
      <div className="hdr-main">
        <button className="hdr-who" onClick={onProfile} aria-label={`Open ${fullName(c)}'s profile`}>
          <span className="hdr-avatar" aria-hidden>
            {characterAvatar(c)}
            {badge ? <span className="hdr-avatar-badge">{badge}</span> : null}
          </span>
          <span className="hdr-text">
            <span className="hdr-name">{fullName(c)}</span>
            <span className="hdr-role">
              {country.flag} {roleLabel(g)}
            </span>
          </span>
        </button>
        <div className="hdr-money">
          <div className="hdr-money-label">Bank Balance</div>
          <div className={c.money < 0 ? 'hdr-money-value is-negative' : 'hdr-money-value'} title={formatMoney(c.money)}>
            {money}
          </div>
        </div>
      </div>
    </header>
  )
}
