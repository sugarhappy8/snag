// The range slider for "how many / how much" choices (MenuInput / InputModal kind 'slider'):
// a big touch-friendly thumb, the chosen value written large, min/max labels, -/+ buttons that
// repeat while held, keyboard arrows, and a live caption under it (MenuInput.preview). Money
// sliders keep internal dollars as their value and show them in the player's display currency
// with the same helpers the money number field uses. The math lives in menuModel.ts.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { formatMoney, moneyScale, shortMoney, showMoney } from '../../game/core'
import { sliderClamp, sliderNotchOf, sliderNudge, sliderScale, sliderValueAt, type SliderScale } from './menuModel'
import '../styles/slider.css'

export interface SliderFieldProps {
  /** What is being chosen ('How many new stores?'). */
  label: string
  min: number
  max: number
  step?: number
  /** Internal dollars shown in the player's currency. */
  money?: boolean
  /** A unit written after the number ('%'); ignored for money. */
  unit?: string
  value: number
  onChange: (value: number) => void
  /** Enter on the slider confirms. */
  onSubmit?: () => void
  /** The live caption for a value (already bound to the game; null for none). */
  preview?: (value: number) => string | null
  autoFocus?: boolean
}

/** A slider value as the player reads it: compact money, whole units for counts. */
export function sliderText(value: number, money: boolean, step = 1, compact = true, unit = ''): string {
  if (!Number.isFinite(value)) return money ? formatMoney(0) : `0${unit}`
  if (money) return compact ? shortMoney(value) : formatMoney(value)
  const digits = step >= 1 || !Number.isFinite(step) ? 0 : Math.min(4, Math.max(0, -Math.floor(Math.log10(step))))
  return `${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit}`
}

/**
 * What the "Exact" field shows for a value: money in the display currency to its own cents
 * (225000000.94, never 750978.787879), whole yen and rupiah; anything else as a plain number.
 */
export function exactText(value: number, display: number, money: boolean): string {
  const shown = value * display
  if (!Number.isFinite(shown)) return '0'
  if (!money) return String(Number(shown.toPrecision(12)))
  const decimals = showMoney(1).decimals ?? 2
  return String(Number(shown.toFixed(Math.max(0, Math.min(2, decimals)))))
}

/** The scale a slider uses (money sliders snap to round numbers in the display currency). */
export function useSliderScale(min: number, max: number, step: number | undefined, money: boolean): SliderScale {
  const display = money ? moneyScale() : 1
  return useMemo(() => sliderScale(min, max, step ?? 1, display), [min, max, step, display])
}

const REPEAT_DELAY = 380
const REPEAT_EVERY = 70

export function SliderField({ label, min, max, step, money = false, unit = '', value, onChange, onSubmit, preview, autoFocus }: SliderFieldProps) {
  const s = useSliderScale(min, max, step, money)
  const v = sliderClamp(s, value)
  const displayScale = money ? moneyScale() : 1
  const [exact, setExact] = useState(exactText(v, displayScale, money))
  useEffect(() => setExact(exactText(v, displayScale, money)), [v, displayScale, money])
  const valueRef = useRef(v)
  valueRef.current = v
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const timer = useRef<{ delay: ReturnType<typeof setTimeout> | null; every: ReturnType<typeof setInterval> | null; pointer: boolean }>({ delay: null, every: null, pointer: false })

  const stopRepeat = () => {
    const t = timer.current
    if (t.delay) clearTimeout(t.delay)
    if (t.every) clearInterval(t.every)
    t.delay = null
    t.every = null
  }
  useEffect(() => stopRepeat, [])

  const nudge = (dir: 1 | -1) => {
    const next = sliderNudge(s, valueRef.current, dir)
    if (next === valueRef.current) {
      // At the end of the range: a held button stops repeating.
      stopRepeat()
      return
    }
    valueRef.current = next
    changeRef.current(next)
  }

  const startRepeat = (dir: 1 | -1) => {
    stopRepeat()
    timer.current.pointer = true
    nudge(dir)
    timer.current.delay = setTimeout(() => {
      timer.current.every = setInterval(() => nudge(dir), REPEAT_EVERY)
    }, REPEAT_DELAY)
  }

  const set = (next: number) => {
    const c = sliderClamp(s, next)
    if (c !== valueRef.current) {
      valueRef.current = c
      changeRef.current(c)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const big = Math.max(1, Math.round(s.notches / 10))
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        nudge(1)
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        nudge(-1)
        break
      case 'PageUp':
        set(sliderValueAt(s, Math.min(s.notches, sliderNotchOf(s, valueRef.current) + big)))
        break
      case 'PageDown':
        set(sliderValueAt(s, Math.max(0, sliderNotchOf(s, valueRef.current) - big)))
        break
      case 'Home':
        set(s.min)
        break
      case 'End':
        set(s.max)
        break
      case 'Enter':
        if (onSubmit) onSubmit()
        break
      default:
        return
    }
    e.preventDefault()
  }

  const notch = sliderNotchOf(s, v)
  const fill = s.notches > 0 ? (notch / s.notches) * 100 : 100
  const fixed = s.max <= s.min
  const caption = useMemo(() => (preview ? preview(v) : null), [preview, v])
  const full = sliderText(v, money, s.step, false, unit)
  const style = { '--slider-fill': `${fill}%` } as CSSProperties

  const stepButton = (dir: 1 | -1) => {
    const atEdge = dir > 0 ? v >= s.max : v <= s.min
    return (
      <button
        type="button"
        className="slider-step"
        aria-label={dir > 0 ? `More (${label})` : `Less (${label})`}
        disabled={fixed || atEdge}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          startRepeat(dir)
        }}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        onKeyDown={() => {
          timer.current.pointer = false
        }}
        onClick={() => {
          // Pointer presses were handled on pointer-down; this is the keyboard (Enter/Space).
          if (timer.current.pointer) {
            timer.current.pointer = false
            return
          }
          nudge(dir)
        }}
      >
        <span aria-hidden>{dir > 0 ? '+' : '−'}</span>
      </button>
    )
  }

  return (
    <div className="slider-field">
      <output className="slider-value" aria-hidden>
        {sliderText(v, money, s.step, true, unit)}
      </output>
      <div className="slider-row">
        {stepButton(-1)}
        <input
          type="range"
          className="slider-range"
          style={style}
          min={s.log ? 0 : s.min}
          max={s.log ? s.notches : s.max}
          step={s.log ? 1 : s.step}
          value={s.log ? notch : v}
          disabled={fixed}
          aria-label={label}
          aria-valuetext={full}
          autoFocus={autoFocus}
          onKeyDown={onKey}
          onChange={(e) => {
            const raw = Number(e.target.value)
            set(s.log ? sliderValueAt(s, raw) : raw)
          }}
        />
        {stepButton(1)}
      </div>
      <div className="slider-bounds" aria-hidden>
        <span>{sliderText(s.min, money, s.step, true, unit)}</span>
        <span>{sliderText(s.max, money, s.step, true, unit)}</span>
      </div>
      <label className="al-field">
        <span>Exact {money ? `amount (${showMoney(1).symbol})` : 'value'}</span>
        <input type="number" aria-label={`Exact ${label}`} min={s.min * (money ? moneyScale() : 1)} max={s.max * (money ? moneyScale() : 1)} step="any"
          value={exact} onChange={e => setExact(e.target.value)} />
        <button type="button" className="btn" onClick={() => { const n = Number(exact); if (exact.trim() && Number.isFinite(n)) set(n / displayScale) }}>Apply exact value</button>
      </label>
      {caption ? (
        <p className="slider-preview" aria-live="polite">
          {caption}
        </p>
      ) : null}
    </div>
  )
}
