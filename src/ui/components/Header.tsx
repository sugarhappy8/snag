// Top of the game screen: avatar, name, role, bank balance, AI status and settings.
import { characterAvatar, formatMoney, fullName, moneyContextOf, roleLabel, shortMoney, showMoney, withMoneyContext } from '../../game/core'
import { getCountry } from '../../game/world'
import type { GameState } from '../../game/types'
import { providerFor } from '../../ai/providers'
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
  const def = providerFor({ provider: useApp((s) => s.settings.provider) })
  const model = useApp((s) => s.settings.model)
  if (level === 'off') return { dot: 'off', label: 'AI off', title: 'AI narration is off. Tap to choose an AI.' }
  if (busy) return { dot: 'busy', label: 'Writing', title: `${def.name}${model ? ` (${model})` : ''} is writing…` }
  if (status === 'online') return { dot: 'online', label: 'AI', title: message || `Connected to ${def.name}${model ? ` · ${model}` : ''}.` }
  if (status === 'checking' || status === 'unknown') return { dot: 'checking', label: 'AI', title: `Connecting to ${def.name}…` }
  return {
    dot: 'offline',
    label: 'Offline',
    title: (message || `Can't reach ${def.name}.`) + ' Tap to retry. The built-in story library is used meanwhile.',
  }
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
  // In the currency and prices of this life (Settings › Money); compact once it gets long
  // (a billion of anything, or rupiah-sized numbers).
  const ctx = moneyContextOf(g)
  const shown = withMoneyContext(ctx, () => showMoney(c.money))
  const full = withMoneyContext(ctx, () => formatMoney(c.money))
  const money = Math.abs(shown.amount) >= 1e9 || full.length > 16 ? withMoneyContext(ctx, () => shortMoney(c.money)) : full
  const title = shown.converted ? `${full} (${withMoneyContext(null, () => formatMoney(c.money))} in today's US dollars)` : full

  return (
    <header className="hdr">
      <div className="hdr-top">
        {/* Main menu (New Life, Ribbons, Graveyard): the life is saved and waits under "Continue Life". */}
        <button className="hdr-icon hdr-menu" aria-label="Main menu" title="Main menu" onClick={() => goTo('home')}>
          ☰
        </button>
        <div className="hdr-brand">
          AnotherLife<span className="hdr-brand-year">{g.year}</span>
        </div>
        <button
          className="hdr-ai"
          title={ai.title}
          aria-label={`AI status: ${ai.title}`}
          onClick={() => (ai.dot === 'off' ? goTo('aiSetup') : ai.dot === 'busy' ? undefined : void checkAi())}
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
          <div className={c.money < 0 ? 'hdr-money-value is-negative' : 'hdr-money-value'} title={title}>
            {money}
          </div>
        </div>
      </div>
    </header>
  )
}
