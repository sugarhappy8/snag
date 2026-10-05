import type { ReactNode } from 'react'

export interface SheetProps {
  title: string
  emoji?: string
  /** Close the whole sheet (X button / backdrop). */
  onClose: () => void
  /** Show a back arrow (for nested menus). */
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
}

/** Bottom sheet over the game screen, used for menus, people, profile, chat. */
export function Sheet({ title, emoji, onClose, onBack, children, footer }: SheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          {onBack ? (
            <button className="sheet-nav" onClick={onBack} aria-label="Back">
              ‹
            </button>
          ) : (
            <span className="sheet-nav-spacer" />
          )}
          <h2 className="sheet-title">
            {emoji ? <span className="sheet-emoji">{emoji}</span> : null}
            {title}
          </h2>
          <button className="sheet-nav" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <footer className="sheet-footer">{footer}</footer> : null}
      </div>
    </div>
  )
}
