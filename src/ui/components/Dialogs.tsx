// Small centered dialogs used by the menus (confirm / input / locked-row reasons) and the
// popup frame shared with ModalHost.
//
// Money inputs (MenuInput.money / InputModal.money): the engine gives min/max/default in internal
// dollars; the player sees and types the display currency (yen, rupiah, 1980 dollars...), and the
// value handed back is converted to internal dollars again (core.ts moneyScale/moneyFromInput),
// rounded and clamped to the engine's bounds so no rounding can ever exceed them.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatMoney, moneyFromInput, moneyScale, showMoney } from '../../game/core'
import { canSlide, sliderOutput, sliderStart } from './menuModel'
import { SliderField, useSliderScale } from './Slider'

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

const MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  mil: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  trillion: 1e12,
  quadrillion: 1e15,
  quintillion: 1e18,
  sextillion: 1e21,
  septillion: 1e24,
  octillion: 1e27,
  nonillion: 1e30,
}

/**
 * Parse a typed amount of money in display units: "¥1,500", "Rp 2.5M", "1.500.000", "12,50 €",
 * "45k". `wholeUnits` (yen, rupiah...): a single "1.500" means fifteen hundred. null when it
 * isn't an amount.
 */
export function parseMoneyInput(raw: string, wholeUnits = false): number | null {
  const s = raw.trim()
  const core = /\d(?:[\d.,\s'_]*\d)?/.exec(s)
  if (!core) return null
  const prefix = s.slice(0, core.index)
  const suffix = s.slice(core.index + core[0].length)
  if (!/^[^\d]{0,8}$/.test(prefix)) return null
  // A multiplier is a whole word ("2.5M", "3 million"), never the start of a symbol ("500 Kč").
  const tail = /^\s*(?:([a-z]+)(?!\p{L}))?\.?\s*([^\d]{0,12})$/iu.exec(suffix)
  if (!tail) return null
  let mult = 1
  let currencyWord = tail[2]
  if (tail[1]) {
    const m = MULTIPLIERS[tail[1].toLowerCase()]
    if (m) mult = m
    else currencyWord = tail[1] + tail[2]
  }
  if (/\d/.test(currencyWord)) return null
  let d = core[0].replace(/[\s'_]/g, '')
  const lastDot = d.lastIndexOf('.')
  const lastComma = d.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // Both marks: the later one is the decimal point (1,234.50 or 1.234,50).
    d = lastDot > lastComma ? d.replace(/,/g, '') : d.replace(/\./g, '').replace(',', '.')
  } else if (lastComma >= 0) {
    const parts = d.split(',')
    // "12,50" is twelve and a half; "1,500" and "1,500,000" are thousands.
    d = parts.length === 2 && parts[1].length <= 2 ? parts.join('.') : parts.join('')
  } else if (lastDot >= 0) {
    const parts = d.split('.')
    // An explicit multiplier makes this a decimal quantity, even for won/yen:
    // "₩1.400M" is 1.4 million won, not 1.4 billion won.
    if (parts.length > 2 || (mult === 1 && wholeUnits && parts[1].length === 3)) d = parts.join('')
  }
  const n = Number(d) * mult
  if (!Number.isFinite(n)) return null
  return /-/.test(prefix) ? -n : n
}

/** True when the display currency has no cents (yen, won, rupiah, lira...). */
function wholeCurrency(): boolean {
  return showMoney(1).decimals === 0
}

/** An internal amount as the number a money field should show ("225000", "12.5"). */
export function moneyFieldValue(internal: number): string {
  if (!Number.isFinite(internal)) return ''
  const d = internal * moneyScale()
  // Hyperinflation amounts (1946 pengő) are written out in full, never as '1e+30'.
  if (Math.abs(d) >= 1e21) return BigInt(Math.round(d)).toString()
  if (Math.abs(d) >= 100 || wholeCurrency()) return String(Math.round(d))
  return String(Math.round(d * 100) / 100)
}

/** A prefilled value or placeholder from the engine (internal dollars) for a money field. */
export function moneyDefault(raw: string | undefined): string {
  if (raw === undefined || raw === '') return raw ?? ''
  const n = Number(raw)
  return Number.isFinite(n) ? moneyFieldValue(n) : raw
}

/** The typed amount in internal dollars (null when it isn't a number). */
function moneyTyped(raw: string): number | null {
  const n = parseMoneyInput(raw, wholeCurrency())
  return n === null ? null : moneyFromInput(n)
}

/** Half a unit of what the field shows, in internal dollars: rounding the shown bound is never an error. */
function moneySlack(bound: number): number {
  const shown = Math.abs(bound * moneyScale())
  const unit = shown >= 100 || wholeCurrency() ? 1 : 0.01
  return moneyFromInput(unit / 2) + Math.abs(bound) * 1e-9
}

/** Returns an error message for an invalid value, or null when OK. Money bounds are internal dollars. */
export function validateInput(kind: 'text' | 'number', raw: string, min?: number, max?: number, money = false): string | null {
  if (kind === 'text') {
    return raw.trim() ? null : 'Please type something first.'
  }
  if (money) {
    const n = moneyTyped(raw)
    if (n === null) return 'Please enter an amount.'
    if (min !== undefined && n < min - moneySlack(min)) return `The minimum is ${formatMoney(min)}.`
    if (max !== undefined && n > max + moneySlack(max)) return `The maximum is ${formatMoney(max)}.`
    return null
  }
  const n = parseNumberInput(raw)
  if (n === null) return 'Please enter a number.'
  if (min !== undefined && n < min) return `The minimum is ${min.toLocaleString('en-US')}.`
  if (max !== undefined && n > max) return `The maximum is ${max.toLocaleString('en-US')}.`
  return null
}

/**
 * Normalizes the value handed to scripts/menu actions (numbers without commas or $). Money:
 * converted back to whole internal dollars and kept inside [min, max].
 */
export function normalizeInput(kind: 'text' | 'number', raw: string, money = false, min?: number, max?: number): string {
  if (kind === 'text') return raw.trim()
  if (money) {
    const n = moneyTyped(raw)
    if (n === null) return ''
    let v = Math.round(n)
    if (max !== undefined) v = Math.min(v, Math.floor(max))
    if (min !== undefined) v = Math.max(v, Math.ceil(min))
    return String(v)
  }
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
  /** An amount of money (the keyboard offers a decimal point and the currency is shown). */
  money?: boolean
}

/** Text / number field that submits on Enter (Shift+Enter makes a newline in multiline mode). */
export function InputField({ kind, value, onChange, onSubmit, placeholder, multiline, label, money }: InputFieldProps) {
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
      inputMode={kind === 'number' ? (money ? 'decimal' : 'numeric') : 'text'}
      value={value}
      placeholder={placeholder}
      aria-label={money && label ? `${label} (${showMoney(1).code})` : label}
      maxLength={kind === 'number' ? (money ? 48 : 18) : 120}
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

export function rangeHint(kind: 'text' | 'number', min?: number, max?: number, money = false): string | null {
  if (kind !== 'number') return null
  if (money && min === undefined && max === undefined) return `Amount in ${showMoney(1).name ?? 'dollars'} (${showMoney(1).symbol})`
  const f = (n: number) => (money ? formatMoney(n) : n.toLocaleString('en-US'))
  if (min !== undefined && max !== undefined) return `Between ${f(min)} and ${f(max)}`
  if (min !== undefined) return `At least ${f(min)}`
  if (max !== undefined) return `At most ${f(max)}`
  return null
}

export interface InputDialogProps {
  title: string
  emoji?: string
  label: string
  /** 'slider' needs finite min and max; without them it falls back to a number field. */
  kind: 'text' | 'number' | 'slider'
  placeholder?: string
  defaultValue?: string
  min?: number
  max?: number
  /** Sliders: distance between values (default 1). */
  step?: number
  /** Sliders: a unit written after the number ('%'). */
  unit?: string
  /** Sliders: the live caption for a value (pure; null for none). */
  preview?: (value: number) => string | null
  multiline?: boolean
  submitLabel?: string
  /** min/max/defaultValue/placeholder are internal dollars; the player types the display currency. */
  money?: boolean
  /** Sliders: open on a round number (the default is a suggestion, MenuInput.roundDefault). */
  roundDefault?: boolean
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function InputDialog(props: InputDialogProps) {
  if (props.kind === 'slider' && canSlide(props.min, props.max)) return <SliderDialog {...props} min={props.min!} max={props.max!} />
  return <FieldDialog {...props} kind={props.kind === 'slider' ? 'number' : props.kind} />
}

/** A slider in a dialog: the value it hands back is a string, exactly like a number field's. */
function SliderDialog({ title, emoji, label, defaultValue, min, max, step, unit, preview, submitLabel = 'Confirm', money = false, roundDefault = false, onSubmit, onCancel }: InputDialogProps & { min: number; max: number }) {
  const s = useSliderScale(min, max, step, money)
  const [value, setValue] = useState(() => sliderStart(s, defaultValue, roundDefault))
  useEscape(onCancel)
  const submit = () => onSubmit(sliderOutput(s, value, money))
  // No tap-outside-to-close: a drag that ends past the card's edge would land on the backdrop
  // and throw the choice away. Cancel and Escape still close it.
  return (
    <PopupFrame dialog label={title}>
      {emoji ? (
        <span className="popup-emoji" aria-hidden>
          {emoji}
        </span>
      ) : null}
      <h2 className="popup-title">{title}</h2>
      <div className="popup-field">
        <span className="popup-field-label">{label}</span>
        <SliderField label={label} min={min} max={max} step={step} unit={unit} money={money} value={value} onChange={setValue} onSubmit={submit} preview={preview} autoFocus />
      </div>
      <div className="popup-actions">
        <button className="btn btn-primary btn-block" onClick={submit}>
          {submitLabel === 'Done' ? 'Confirm' : submitLabel}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </PopupFrame>
  )
}

function FieldDialog({
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
  money = false,
  onSubmit,
  onCancel,
}: InputDialogProps & { kind: 'text' | 'number' }) {
  const isMoney = money && kind === 'number'
  const [value, setValue] = useState(() => (isMoney ? moneyDefault(defaultValue) : (defaultValue ?? '')))
  const [error, setError] = useState<string | null>(null)
  useEscape(onCancel)
  const submit = () => {
    const err = validateInput(kind, value, min, max, isMoney)
    if (err) {
      setError(err)
      return
    }
    onSubmit(normalizeInput(kind, value, isMoney, min, max))
  }
  const hint = rangeHint(kind, min, max, isMoney)
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
          placeholder={isMoney ? moneyDefault(placeholder) : placeholder}
          multiline={multiline}
          label={label}
          money={isMoney}
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
