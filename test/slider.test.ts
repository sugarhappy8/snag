// The slider control for "how many / how much" choices: exact values inside [min, max] on any
// curve, both ends of a wide money range reachable, round numbers in the player's currency,
// -/+ steps, the string handed to run() and scripts, the live caption (safe and pure), and the
// rendered markup (accessible, with the Confirm/Cancel dialog and the queued popup card).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InputModal, MenuInput } from '../src/game/types'
import { makeTestGame } from './helpers'

const offline = vi.hoisted(() => {
  const resolve = vi.fn()
  return { applyFallback: resolve, resolveTask: resolve, MAX_CUSTOM_ACTIONS_PER_YEAR: 5, CUSTOM_ACTION_KEY: 'doAnything' }
})
vi.mock('../src/game/offline', () => offline)

const { bindMoneyContext, formatMoney, moneyScale, setMoneyDisplay } = await import('../src/game/core')
const {
  PREVIEW_MAX,
  SLIDER_LINEAR_MAX,
  SLIDER_NOTCHES,
  canSlide,
  sliderClamp,
  sliderNotchOf,
  sliderNudge,
  sliderOutput,
  sliderPreview,
  sliderScale,
  sliderStart,
  sliderValueAt,
} = await import('../src/ui/components/menuModel')
const { SliderField, sliderText } = await import('../src/ui/components/Slider')
const { InputDialog } = await import('../src/ui/components/Dialogs')
const { SliderInputCard } = await import('../src/ui/components/SliderCard')

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

afterEach(() => {
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

describe('slider math', () => {
  it('is linear for narrow ranges and log-like for wide ones', () => {
    const narrow = sliderScale(1, 25)
    expect(narrow.log).toBe(false)
    expect(narrow.notches).toBe(24)
    expect(sliderValueAt(narrow, 0)).toBe(1)
    expect(sliderValueAt(narrow, 24)).toBe(25)
    expect(sliderValueAt(narrow, 9)).toBe(10)
    const wide = sliderScale(1_000, 50_000_000)
    expect(wide.log).toBe(true)
    expect(wide.notches).toBe(SLIDER_NOTCHES)
    expect(sliderScale(0, SLIDER_LINEAR_MAX).log).toBe(false)
    expect(sliderScale(0, SLIDER_LINEAR_MAX + 1).log).toBe(true)
  })

  it('reaches both ends of a wide money range and stays exact inside it', () => {
    const s = sliderScale(1_000, 50_000_000)
    expect(sliderValueAt(s, 0)).toBe(1_000)
    expect(sliderValueAt(s, SLIDER_NOTCHES)).toBe(50_000_000)
    // A thousand dollars, tens of thousands and millions are all a thumb-width apart.
    const values = Array.from({ length: SLIDER_NOTCHES + 1 }, (_, i) => sliderValueAt(s, i))
    expect(values.some((v) => v > 1_000 && v <= 2_000)).toBe(true)
    expect(values.some((v) => v >= 20_000 && v <= 60_000)).toBe(true)
    expect(values.some((v) => v >= 1_000_000 && v <= 3_000_000)).toBe(true)
    for (let i = 1; i < values.length; i++) {
      const v = values[i]
      expect(v).toBeGreaterThanOrEqual(1_000)
      expect(v).toBeLessThanOrEqual(50_000_000)
      expect(Number.isInteger(v)).toBe(true)
      // Monotonic, and round (two significant digits) in between the ends.
      expect(v).toBeGreaterThanOrEqual(values[i - 1])
      if (i < SLIDER_NOTCHES) {
        const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1)
        expect(v % mag).toBe(0)
      }
    }
    // The notch of a value maps back to (about) the same value.
    for (const v of [1_000, 12_000, 450_000, 7_000_000, 50_000_000]) {
      const back = sliderValueAt(s, sliderNotchOf(s, v))
      expect(Math.abs(back - v) / v).toBeLessThan(0.05)
    }
  })

  it('spreads a range that starts high evenly (review: half the track sat between $100K and $109K)', () => {
    // An R&D budget slider: $100K up to the company's $80M of cash.
    const s = sliderScale(100_000, 80_000_000)
    expect(s.log).toBe(true)
    const mid = sliderValueAt(s, SLIDER_NOTCHES / 2)
    // Geometric: the middle of the track is near the geometric mean (~$2.8M), not $109K.
    expect(mid).toBeGreaterThan(1_500_000)
    expect(mid).toBeLessThan(5_000_000)
    // Each tenth of the track multiplies the value by about the same factor.
    const at = (f: number) => sliderValueAt(s, Math.round(SLIDER_NOTCHES * f))
    const r1 = at(0.2) / at(0.1)
    const r2 = at(0.9) / at(0.8)
    expect(Math.abs(Math.log(r1) - Math.log(r2))).toBeLessThan(0.15)
    // The default ($8M) shows near the right place, and maps back.
    const back = sliderValueAt(s, sliderNotchOf(s, 8_000_000))
    expect(Math.abs(back - 8_000_000) / 8_000_000).toBeLessThan(0.05)
    expect(sliderNotchOf(s, 8_000_000) / SLIDER_NOTCHES).toBeGreaterThan(0.6)
    expect(sliderNotchOf(s, 8_000_000) / SLIDER_NOTCHES).toBeLessThan(0.75)
    // From zero, $1K is still a short drag and $50M the far end.
    const z = sliderScale(0, 50_000_000)
    const firstK = Array.from({ length: SLIDER_NOTCHES + 1 }, (_, i) => sliderValueAt(z, i)).findIndex((v) => v >= 1_000)
    expect(firstK).toBeGreaterThan(0)
    expect(firstK / SLIDER_NOTCHES).toBeLessThan(0.35)
    expect(sliderValueAt(z, SLIDER_NOTCHES)).toBe(50_000_000)
  })

  it('rounds to round numbers in the display currency', () => {
    // ¥150 to the dollar: the values are round in yen, give or take a dollar of rounding.
    const s = sliderScale(1, 10_000_000, 1, 150)
    for (const n of [250, 500, 750]) {
      const yen = sliderValueAt(s, n) * 150
      const mag = Math.pow(10, Math.floor(Math.log10(yen)) - 1)
      const off = Math.abs(yen - Math.round(yen / mag) * mag)
      expect(off).toBeLessThanOrEqual(150)
    }
  })

  it('steps with -/+ by one step, or to the next round number on a wide range', () => {
    const lin = sliderScale(0, 300, 5)
    expect(sliderNudge(lin, 100, 1)).toBe(105)
    expect(sliderNudge(lin, 100, -1)).toBe(95)
    expect(sliderNudge(lin, 300, 1)).toBe(300)
    expect(sliderNudge(lin, 0, -1)).toBe(0)
    const log = sliderScale(1, 5_000)
    expect(sliderNudge(log, 1, 1)).toBe(2)
    expect(sliderNudge(log, 150, 1)).toBe(160)
    expect(sliderNudge(log, 1_000, -1)).toBe(990)
    expect(sliderNudge(log, 5_000, 1)).toBe(5_000)
    const money = sliderScale(1_000, 50_000_000)
    expect(sliderNudge(money, 12_000, 1)).toBe(13_000)
    expect(sliderNudge(money, 10_000, -1)).toBe(9_900)
  })

  it('honors fractional steps and clamps anything out of range', () => {
    const s = sliderScale(0.7, 1.5, 0.05)
    expect(sliderClamp(s, 1.0749)).toBe(1.05)
    expect(sliderClamp(s, 1.076)).toBe(1.1)
    expect(sliderClamp(s, 9)).toBe(1.5)
    expect(sliderClamp(s, -9)).toBe(0.7)
    expect(sliderClamp(s, NaN)).toBe(0.7)
    expect(sliderOutput(s, 1.05)).toBe('1.05')
    // A top bound off the step grid is still reachable exactly.
    const odd = sliderScale(1, 10, 4)
    expect(sliderValueAt(odd, odd.notches)).toBe(10)
    expect(sliderClamp(odd, 9.9)).toBe(10)
  })

  it('hands back the same string a number field would', () => {
    const counts = sliderScale(1, 5_000)
    expect(sliderOutput(counts, 37.4)).toBe('37')
    const money = sliderScale(1_000.4, 49_999.6)
    expect(sliderOutput(money, 1_000.4, true)).toBe('1001')
    expect(sliderOutput(money, 49_999.6, true)).toBe('49999')
    expect(sliderStart(counts, '12')).toBe(12)
    expect(sliderStart(counts, 'abc')).toBe(1)
    expect(sliderStart(counts, '999999')).toBe(5_000)
    expect(sliderStart(counts, undefined)).toBe(1)
    // A broken range collapses to a single value instead of NaN.
    const broken = sliderScale(10, 5)
    expect(broken.max).toBe(10)
    expect(sliderValueAt(broken, 7)).toBe(10)
    expect(canSlide(1, 5)).toBe(true)
    expect(canSlide(undefined, 5)).toBe(false)
    expect(canSlide(1, Infinity)).toBe(false)
    expect(canSlide(5, 1)).toBe(false)
  })
})

describe('slider preview captions', () => {
  it('are shown safely: crashes, non-strings and blanks show nothing; long ones are cut', () => {
    const g = makeTestGame()
    const input = (preview: MenuInput['preview']): MenuInput => ({ kind: 'slider', label: 'How many?', min: 1, max: 9, preview })
    expect(sliderPreview(input((_g, v) => `${v} trucks`), g, 3)).toBe('3 trucks')
    expect(sliderPreview(input(() => '   '), g, 3)).toBeNull()
    expect(sliderPreview(input(() => 42 as unknown as string), g, 3)).toBeNull()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(sliderPreview(input(() => { throw new Error('boom') }), g, 3)).toBeNull()
    spy.mockRestore()
    const long = sliderPreview(input(() => 'x'.repeat(1_000)), g, 3)!
    expect(Array.from(long).length).toBe(PREVIEW_MAX)
    expect(long.endsWith('…')).toBe(true)
    expect(sliderPreview({ kind: 'slider', label: 'x', min: 1, max: 2 }, g, 1)).toBeNull()
  })
})

describe('slider markup', () => {
  it('renders a big value, a range input with a readable value, -/+ buttons, bounds and the caption', () => {
    const html = render(createElement(SliderField, { label: 'R&D budget', min: 1_000, max: 50_000_000, money: true, value: 250_000, onChange: () => {}, preview: (v: number) => `About ${v} spent` }))
    expect(html).toContain('type="range"')
    expect(html).toContain('aria-label="R&amp;D budget"')
    expect(html).toContain(`aria-valuetext="${formatMoney(250_000)}"`)
    expect(html).toContain('class="slider-value"')
    expect(html).toContain('aria-label="Less (R&amp;D budget)"')
    expect(html).toContain('aria-label="More (R&amp;D budget)"')
    expect(html).toContain('About 250000 spent')
    expect(html).toContain('slider-bounds')
    // A count slider shows whole units.
    const counts = render(createElement(SliderField, { label: 'Trucks', min: 1, max: 40, value: 7, onChange: () => {} }))
    expect(counts).toContain('aria-valuetext="7"')
    expect(counts).toMatch(/min="1"[^>]*max="40"/)
    expect(sliderText(1_234, false)).toBe('1,234')
    expect(sliderText(1.05, false, 0.05)).toBe('1.05')
  })

  it('shows money in the player currency, converting exactly once', () => {
    const g = makeTestGame(1, { countryId: 'jp', age: 30 })
    g.year = 2026
    setMoneyDisplay({ mode: 'local', nominal: true })
    bindMoneyContext(g)
    const html = render(createElement(SliderField, { label: 'Budget', min: 1_000, max: 1_000_000, money: true, value: 10_000, onChange: () => {} }))
    expect(moneyScale()).toBeGreaterThan(10)
    expect(html).toContain(`aria-valuetext="${formatMoney(10_000)}"`)
    expect(formatMoney(10_000)).not.toContain('$')
  })

  it('puts the slider in a Confirm/Cancel dialog, and falls back to a number field without bounds', () => {
    const dialog = render(createElement(InputDialog, { title: 'Open Stores', label: 'How many?', kind: 'slider', min: 1, max: 30, defaultValue: '4', onSubmit: () => {}, onCancel: () => {} }))
    expect(dialog).toContain('type="range"')
    expect(dialog).toContain('Confirm')
    expect(dialog).toContain('Cancel')
    expect(dialog).toContain('aria-valuetext="4"')
    const fallback = render(createElement(InputDialog, { title: 'Open Stores', label: 'How many?', kind: 'slider', onSubmit: () => {}, onCancel: () => {} }))
    expect(fallback).not.toContain('type="range"')
    expect(fallback).toMatch(/inputmode="numeric"/i)
  })

  it('shows a queued slider prompt as a card that must be answered', () => {
    const modal: InputModal = { kind: 'input', id: 'm1', title: 'Pocket Money', text: 'How much a week?', input: 'slider', money: true, min: 0, max: 200, step: 5, defaultValue: '20', scriptId: 'x' }
    const html = render(createElement(SliderInputCard, { modal }))
    expect(html).toContain('type="range"')
    expect(html).toContain('How much a week?')
    expect(html).toContain(`aria-valuetext="${formatMoney(20)}"`)
    expect(html).toContain('Confirm')
    expect(html).not.toContain('Cancel')
  })
})
