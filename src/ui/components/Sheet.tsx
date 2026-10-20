import type { ReactNode } from 'react'
import { ModalSurface } from '../a11y/ModalSurface'

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

/** Bottom sheet over the game screen, used for menus, people and the profile. */
export function Sheet({ title, emoji, onClose, onBack, children, footer }: SheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <ModalSurface role="dialog" label={title} className="sheet">
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
      </ModalSurface>
    </div>
  )
}
