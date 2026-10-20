// The surface of a dialog: the element that has role="dialog" (or alertdialog) and aria-modal. Any new dialog in the
// game renders through this, so it traps Tab, makes the page behind it inert and gives focus back on close (see
// modal.ts). The click stops here, as it did on Sheet, PopupFrame and the screen dialogs, so a tap inside the card
// does not reach the backdrop's close handler.
import { useRef, type ReactElement, type ReactNode } from 'react'
import { useModal } from './modal'

export interface ModalSurfaceProps {
  role: 'dialog' | 'alertdialog'
  label?: string
  className?: string
  children: ReactNode
}

export function ModalSurface({ role, label, className, children }: ModalSurfaceProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useModal(ref)
  return (
    <div ref={ref} className={className} role={role} aria-modal="true" aria-label={label} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  )
}
