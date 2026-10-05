// Small centered dialogs used by the menus (confirm / input / locked-row reasons) and the
// popup frame shared with ModalHost.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface PopupFrameProps {
  children: ReactNode
  /** Wider card (minigames). */
  wide?: boolean
  /** Extra class on the card (e.g. tone-good). */
  className?: string
  /** Dialogs from menus sit just below queue popups. */
  dialog?: boolean
  /** Tap outside the card. Omit to make the popup modal (must be answered). */
  onBackdrop?: () => void
  label?: string
}

/** Dimmed backdrop + centered card (BitLife-style popup). */
export function PopupFrame({ children, wide, className, dialog, onBackdrop, label }: PopupFrameProps) {
  return (
    <div className={dialog ? 'popup-backdrop is-dialog' : 'popup-backdrop'} onClick={onBackdrop}>
      <div
        className={['popup', wide ? 'is-wide' : '', className ?? ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="popup-scroll">{children}</div>
      </div>
    </div>
  )
}

/** Escape closes a cancellable dialog. */
function useEscape(onEscape: (() => void) | undefined): void {
  const ref = useRef(onEscape)
  ref.current = onEscape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current) {
        e.preventDefault()
        ref.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export interface ConfirmDialogProps {
  title?: string
  emoji?: string
  text: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title = 'Are you sure?',
  emoji = '🤔',
  text,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEscape(onCancel)
  return (
    <PopupFrame dialog onBackdrop={onCancel} label={title}>
      <span className="popup-emoji" aria-hidden>
        {emoji}
      </span>
      <h2 className="popup-title">{title}</h2>
      <p className="popup-text">{text}</p>
      <div className="popup-actions">
        <button className={danger ? 'btn btn-danger btn-block' : 'btn btn-primary btn-block'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </PopupFrame>
  )
}

export interface AlertDialogProps {
  title: string
  emoji?: string
  text: string
  onClose: () => void
}

export function AlertDialog({ title, emoji = 'ℹ️', text, onClose }: AlertDialogProps) {
  useEscape(onClose)
  return (
    <PopupFrame dialog onBackdrop={onClose} label={title}>
      <span className="popup-emoji" aria-hidden>
        {emoji}
      </span>
      <h2 className="popup-title">{title}</h2>
      <p className="popup-text">{text}</p>
      <div className="popup-actions">
        <button className="btn btn-primary btn-block" onClick={onClose} autoFocus>
          OK
        </button>
      </div>
    </PopupFrame>
  )
}

/** Parse a typed number leniently: "$1,500" -> 1500. Returns null when not a number. */
export function parseNumberInput(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s_]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Returns an error message for an invalid value, or null when OK. */
export function validateInput(kind: 'text' | 'number', raw: string, min?: number, max?: number): string | null {
  if (kind === 'text') {
    return raw.trim() ? null : 'Please type something first.'
  }
  const n = parseNumberInput(raw)
  if (n === null) return 'Please enter a number.'
  if (min !== undefined && n < min) return `The minimum is ${min.toLocaleString('en-US')}.`
  if (max !== undefined && n > max) return `The maximum is ${max.toLocaleString('en-US')}.`
  return null
}

/** Normalizes the value handed to scripts/menu actions (numbers without commas or $). */
export function normalizeInput(kind: 'text' | 'number', raw: string): string {
  if (kind === 'text') return raw.trim()
  const n = parseNumberInput(raw)
  return n === null ? '' : String(Math.round(n))
}

export interface InputFieldProps {
  kind: 'text' | 'number'
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  multiline?: boolean
  label?: string
}

/** Text / number field that submits on Enter (Shift+Enter makes a newline in multiline mode). */
export function InputField({ kind, value, onChange, onSubmit, placeholder, multiline, label }: InputFieldProps) {
  if (kind === 'text' && multiline) {
    return (
      <textarea
        value={value}
        placeholder={placeholder}
        aria-label={label}
        rows={3}
        maxLength={300}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
      />
    )
  }
  return (
    <input
      type="text"
      inputMode={kind === 'number' ? 'numeric' : 'text'}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      maxLength={kind === 'number' ? 18 : 120}
      autoFocus
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onSubmit()
        }
      }}
    />
  )
}

export function rangeHint(kind: 'text' | 'number', min?: number, max?: number): string | null {
  if (kind !== 'number') return null
  const f = (n: number) => n.toLocaleString('en-US')
  if (min !== undefined && max !== undefined) return `Between ${f(min)} and ${f(max)}`
  if (min !== undefined) return `At least ${f(min)}`
  if (max !== undefined) return `At most ${f(max)}`
  return null
}

export interface InputDialogProps {
  title: string
  emoji?: string
  label: string
  kind: 'text' | 'number'
  placeholder?: string
  defaultValue?: string
  min?: number
  max?: number
  multiline?: boolean
  submitLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function InputDialog({
  title,
  emoji,
  label,
  kind,
  placeholder,
  defaultValue,
  min,
  max,
  multiline,
  submitLabel = 'Done',
  onSubmit,
  onCancel,
}: InputDialogProps) {
  const [value, setValue] = useState(defaultValue ?? '')
  const [error, setError] = useState<string | null>(null)
  useEscape(onCancel)
  const submit = () => {
    const err = validateInput(kind, value, min, max)
    if (err) {
      setError(err)
      return
    }
    onSubmit(normalizeInput(kind, value))
  }
  const hint = rangeHint(kind, min, max)
  return (
    <PopupFrame dialog onBackdrop={onCancel} label={title}>
      {emoji ? (
        <span className="popup-emoji" aria-hidden>
          {emoji}
        </span>
      ) : null}
      <h2 className="popup-title">{title}</h2>
      <div className="popup-field">
        <span className="popup-field-label">{label}</span>
        <InputField
          kind={kind}
          value={value}
          onChange={(v) => {
            setValue(v)
            if (error) setError(null)
          }}
          onSubmit={submit}
          placeholder={placeholder}
          multiline={multiline}
          label={label}
        />
        {error ? <span className="popup-error">{error}</span> : hint ? <span className="popup-hint">{hint}</span> : null}
      </div>
      <div className="popup-actions">
        <button className="btn btn-primary btn-block" onClick={submit}>
          {submitLabel}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </PopupFrame>
  )
}

export interface ToastProps {
  message: string
  onDone: () => void
  /** Auto-hide after this many ms. */
  ms?: number
}

/** Small transient message near the bottom of the screen; tap to dismiss. */
export function Toast({ message, onDone, ms = 2800 }: ToastProps) {
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const t = setTimeout(() => done.current(), ms)
    return () => clearTimeout(t)
  }, [message, ms])
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className="toast" onClick={() => done.current()}>
        {message}
      </div>
    </div>
  )
}
