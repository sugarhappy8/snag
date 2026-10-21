// Top of the game screen: main menu, year, settings, avatar, name, role and bank balance.
import { characterAvatar, formatMoney, fullName, moneyContextOf, roleLabel, shortMoney, showMoney, withMoneyContext } from '../../game/core'
import { getCountry } from '../../game/world'
import type { GameState } from '../../game/types'
import { goTo } from '../store'
import '../styles/nav.css'

export interface HeaderProps {
  g: GameState
  onProfile: () => void
  /** The search button (G.9): given only while the palette is on and can open. */
  onSearch?: () => void
  /** The inbox bell (G.11): `count` is how many rows the player has not seen. Given only while Quiet Mode is built in. */
  inbox?: { count: number; onOpen: () => void }
}

/** The number on the bell: a whole number, never below zero. A count that is not a number is none. */
function bellCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
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

/** The bell: "Inbox" for none, "Inbox, 3 new" otherwise, with the count in a pill that reads "9+" from ten. */
function InboxBell({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button type="button" className="hdr-icon hdr-bell" aria-label={count > 0 ? `Inbox, ${count} new` : 'Inbox'} title="Inbox" onClick={onOpen}>
      🔔
      {count > 0 ? (
        <span className="hdr-bell-count" aria-hidden>
          {count > 9 ? '9+' : count}
        </span>
      ) : null}
    </button>
  )
}

export function Header({ g, onProfile, onSearch, inbox }: HeaderProps) {
  const c = g.character
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
        {onSearch ? (
          <button type="button" className="hdr-icon" aria-label="Search" title="Search (Ctrl+K or /)" aria-keyshortcuts="Control+K /" onClick={onSearch}>
            🔍
          </button>
        ) : null}
        {inbox ? <InboxBell count={bellCount(inbox.count)} onOpen={inbox.onOpen} /> : null}
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
          <div className="hdr-money-label">Bank Balance · {shown.code}</div>
          <div className={c.money < 0 ? 'hdr-money-value is-negative' : 'hdr-money-value'} title={title}>
            {money}
          </div>
        </div>
      </div>
    </header>
  )
}
