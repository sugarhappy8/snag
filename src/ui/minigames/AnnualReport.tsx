// Business annual report, like the original's yearly business review: last year's statement
// for one company, a read on the local market, then next year's plan. Set a price and a
// production run, watch the projection, and approve it (JSON AnnualReportResult) or keep
// last year's plan ('skip'). The engine (business.ts) clamps whatever comes back again.
import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { formatMoney, moneyWith, shortMoney } from '../../game/core'
import { HINT_EMOJI } from '../../game/talents'
import type { AnnualReportResult, Json } from '../../game/types'
import { cleanHint } from '../components/TalentHint'
import type { MinigameProps } from './types'
import '../styles/business.css'

export type ReportTone = 'good' | 'bad' | 'neutral'

export interface ReportLine {
  label: string
  value: string
  tone: ReportTone
}

/** AnnualReportData after defensive parsing: every number finite, ranges ordered, no gaps. */
export interface ReportView {
  businessName: string
  emoji: string
  industryLabel: string
  location: string
  /** null when the data had no usable year. */
  year: number | null
  unitLabel: string
  unitCost: number
  price: number
  minPrice: number
  maxPrice: number
  suggestedPrice: number
  production: number
  maxProduction: number
  inventory: number
  expectedDemand: number
  marketNote: string
  lines: ReportLine[]
  /** Business talent: the plan that should earn the most next year (null without the talent). */
  talentHint: TalentPlan | null
}

/** AnnualReportData.talentHint after parsing; `plan` is null when its numbers were unusable. */
export interface TalentPlan {
  text: string
  plan: { price: number; production: number } | null
}

export interface Projection {
  productionCost: number
  available: number
  sold: number
  revenue: number
  margin: number
  leftover: number
  shortfall: number
}

/** What "Keep last year's plan" reports. */
export const SKIP_RESULT = 'skip'

const MAX_LINES = 24

// ---------------------------------------------------------------------------
// Parsing

function record(v: Json | undefined): { [key: string]: Json } {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function text(v: Json | undefined, fallback: string, max = 120): string {
  if (typeof v !== 'string') return fallback
  const s = v.replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : fallback
}

function num(v: Json | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Whole cents, without float noise (4.300000000001 → 4.3). */
export function cents(n: number): number {
  return Math.round(n * 100) / 100
}

function readLines(v: Json | undefined): ReportLine[] {
  if (!Array.isArray(v)) return []
  const out: ReportLine[] = []
  for (const item of v) {
    const r = record(item)
    const label = text(r.label, '', 60)
    if (!label) continue
    const value = typeof r.value === 'number' && Number.isFinite(r.value) ? formatMoney(r.value) : text(r.value, '—', 40)
    const tone: ReportTone = r.tone === 'good' || r.tone === 'bad' ? r.tone : 'neutral'
    out.push({ label, value, tone })
    if (out.length >= MAX_LINES) break
  }
  return out
}

/** Read modal.data. Malformed, partial or old data never throws; it falls back to a sane plan. */
export function readReportData(data: Json): ReportView {
  const d = record(data)
  const unitCost = Math.max(0, num(d.unitCost) ?? 0)
  const positive = (v: Json | undefined) => {
    const n = num(v)
    return n !== null && n > 0 ? n : null
  }
  const rawPrice = positive(d.price)
  const rawSuggested = positive(d.suggestedPrice)
  const base = rawSuggested ?? rawPrice ?? (unitCost > 0 ? unitCost * 2 : 10)

  const rawMin = num(d.minPrice)
  let minPrice = rawMin !== null && rawMin >= 0 ? rawMin : cents(base * 0.25)
  let maxPrice = positive(d.maxPrice) ?? cents(base * 4)
  if (minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice]
  if (maxPrice - minPrice < 0.01) maxPrice = cents(Math.max(minPrice * 2, minPrice + 1))
  const suggestedPrice = clamp(rawSuggested ?? rawPrice ?? base, minPrice, maxPrice)
  const price = clamp(rawPrice ?? suggestedPrice, minPrice, maxPrice)

  const whole = (v: Json | undefined) => Math.max(0, Math.round(num(v) ?? 0))
  const inventory = whole(d.inventory)
  const expectedDemand = whole(d.expectedDemand)
  const rawProduction = whole(d.production)
  const declaredMax = num(d.maxProduction)
  const maxProduction =
    declaredMax !== null && declaredMax >= 0 ? Math.floor(declaredMax) : Math.max(rawProduction, expectedDemand * 2)
  const production = clamp(rawProduction, 0, maxProduction)

  const year = num(d.year)
  const talentHint = readTalentHint(d.talentHint, { minPrice, maxPrice, maxProduction })
  return {
    businessName: text(d.businessName, 'Your Company', 80),
    emoji: text(d.emoji, '🏢', 16),
    industryLabel: text(d.industryLabel, '', 60),
    location: text(d.location, '', 80),
    year: year !== null && year >= 1 && year <= 99999 ? Math.round(year) : null,
    unitLabel: text(d.unitLabel, 'units', 40),
    unitCost,
    price,
    minPrice,
    maxPrice,
    suggestedPrice,
    production,
    maxProduction,
    inventory,
    expectedDemand,
    marketNote: text(d.marketNote, '', 400),
    lines: readLines(d.lines),
    talentHint,
  }
}

/**
 * The Business talent's purple hint: its text plus a plan clamped to this report's ranges.
 * No text means no hint; bad numbers keep the text but drop the "Use this plan" button.
 */
export function readTalentHint(v: Json | undefined, r: Pick<ReportView, 'minPrice' | 'maxPrice' | 'maxProduction'>): TalentPlan | null {
  const h = record(v)
  const hintText = cleanHint(h.text)
  if (!hintText) return null
  const price = num(h.price)
  const production = num(h.production)
  const plan =
    price !== null && price > 0 && production !== null && production >= 0
      ? { price: cents(clamp(price, r.minPrice, r.maxPrice)), production: clamp(Math.round(production), 0, r.maxProduction) }
      : null
  return { text: hintText, plan }
}

// ---------------------------------------------------------------------------
// Plan math

/** A round slider step (1, 2 or 5 × 10^k) of about `raw`, never below one cent. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0.01) return 0.01
  const exp = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return Number((nice * exp).toPrecision(2))
}

/** About 100 stops across the price range. */
export function priceStep(r: Pick<ReportView, 'minPrice' | 'maxPrice'>): number {
  return niceStep((r.maxPrice - r.minPrice) / 100)
}

/** Whole units; fine-grained for small runs, about 250 stops for big factories. */
export function productionStep(r: Pick<ReportView, 'maxProduction'>): number {
  if (r.maxProduction <= 500) return 1
  return Math.max(1, Math.round(niceStep(r.maxProduction / 250)))
}

/** Snap to the slider grid (anchored at `min`, like a range input) inside [min, max]. */
export function snap(v: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(v)) return min
  const k = Math.round((v - min) / step)
  return cents(clamp(min + k * step, min, max))
}

/**
 * The native range input's top: the first grid stop at or above `max`. A browser only lets the
 * thumb land on min + k·step, so with `max` itself off the grid the far right would stop one
 * step short (scale says Kz 42,999, slider tops out at Kz 42,647); snap() clamps this back to max.
 */
export function gridTop(min: number, max: number, step: number): number {
  if (!(max > min) || !(step > 0)) return max
  return cents(min + Math.ceil((max - min) / step - 1e-9) * step)
}

/** Move one step from `v`: off-grid values first land on the neighbouring grid stop. */
export function nudge(v: number, dir: 1 | -1, min: number, max: number, step: number): number {
  const k = (v - min) / step
  const next = dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1
  return cents(clamp(min + next * step, min, max))
}

/** Units to make so that stock on hand covers expected demand. */
export function unitsToMeetDemand(r: Pick<ReportView, 'expectedDemand' | 'inventory' | 'maxProduction'>): number {
  return clamp(r.expectedDemand - r.inventory, 0, r.maxProduction)
}

/** Estimate for next year: everything sells up to expected demand at the chosen price. */
export function projectPlan(
  r: Pick<ReportView, 'unitCost' | 'inventory' | 'expectedDemand'>,
  price: number,
  production: number,
): Projection {
  const productionCost = production * r.unitCost
  const available = production + r.inventory
  const sold = Math.min(available, r.expectedDemand)
  const revenue = sold * price
  return {
    productionCost,
    available,
    sold,
    revenue,
    margin: revenue - productionCost,
    leftover: Math.max(0, available - r.expectedDemand),
    shortfall: Math.max(0, r.expectedDemand - available),
  }
}

/** The result string for 'Approve plan'. */
export function planResult(r: Pick<ReportView, 'minPrice' | 'maxPrice' | 'maxProduction'>, price: number, production: number): string {
  const plan: AnnualReportResult = {
    price: cents(clamp(Number.isFinite(price) ? price : r.minPrice, r.minPrice, r.maxPrice)),
    production: clamp(Math.round(Number.isFinite(production) ? production : 0), 0, r.maxProduction),
  }
  return JSON.stringify(plan)
}

// ---------------------------------------------------------------------------
// Copy helpers

function plainCount(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** 1.2M, 45K, 980: for the slider scale ends. */
function compactCount(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (a >= 1e4) return `${Math.round(n / 1e3)}K`
  return plainCount(n)
}

/**
 * Unit prices: $3.50 below $100 (or when the price grid works in cents), $1,200 above. The slider
 * works in internal dollars; this shows the price in the player's currency and year (¥525).
 */
export function formatPrice(n: number, step: number): string {
  const a = Math.abs(n)
  if (a >= 10000 || (a >= 100 && step >= 1)) return formatMoney(n)
  return moneyWith(n, (x) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
}

function shortPrice(n: number, step: number): string {
  return Math.abs(n) >= 10000 ? shortMoney(n) : formatPrice(n, step)
}

/** 'meals' → 'meal', 'bottles of wine' → 'bottle of wine', 'kg' stays 'kg'. */
export function singularUnit(label: string): string {
  const [head, ...rest] = label.split(' ')
  let one = head
  if (head.length > 3 && /^[a-z]+$/i.test(head)) {
    if (/ies$/i.test(head)) one = `${head.slice(0, -3)}y`
    else if (/(ches|shes|sses|xes)$/i.test(head)) one = head.slice(0, -2)
    else if (/[^su]s$/i.test(head)) one = head.slice(0, -1)
  }
  return [one, ...rest].join(' ')
}

function unitsText(n: number, unitLabel: string): string {
  return `${plainCount(n)} ${n === 1 ? singularUnit(unitLabel) : unitLabel}`
}

function priceTip(r: ReportView, price: number, step: number): { tone: ReportTone; text: string } {
  if (r.unitCost > 0 && price < r.unitCost)
    return { tone: 'bad', text: `That's below your ${formatPrice(r.unitCost, step)} cost per ${singularUnit(r.unitLabel)}. Every sale loses money.` }
  if (r.suggestedPrice > 0 && price <= r.suggestedPrice * 0.85)
    return { tone: 'neutral', text: "Bargain pricing. Customers will love you; your accountant won't." }
  if (r.suggestedPrice > 0 && price >= r.suggestedPrice * 1.5)
    return { tone: 'bad', text: 'Luxury pricing. A few big spenders, a lot of window shoppers.' }
  if (r.suggestedPrice > 0 && price >= r.suggestedPrice * 1.15)
    return { tone: 'neutral', text: 'Premium pricing. Fewer buyers, fatter margins.' }
  return { tone: 'good', text: 'Right around the going rate here.' }
}

function productionTip(r: ReportView, p: Projection, production: number): { tone: ReportTone; text: string } {
  if (r.maxProduction <= 0 && r.inventory <= 0) return { tone: 'bad', text: 'No production capacity this year, and nothing in stock to sell.' }
  if (r.maxProduction <= 0) return { tone: 'neutral', text: "No production capacity this year. You'll sell what's in stock." }
  if (p.available <= 0) return { tone: 'bad', text: 'Nothing to sell next year. Bold strategy.' }
  if (r.expectedDemand <= 0) return { tone: 'bad', text: 'Nobody is expected to buy. Anything you make goes straight to storage.' }
  if (p.shortfall > 0)
    return { tone: 'neutral', text: `You'll sell out early: about ${unitsText(p.shortfall, r.unitLabel)} of demand goes to your competitors.` }
  if (p.leftover > Math.max(1, r.expectedDemand * 0.1))
    return {
      tone: 'bad',
      text: `About ${unitsText(p.leftover, r.unitLabel)} would be left over${production > 0 ? ". Storage isn't free, and some of it won't keep." : ' from stock already on hand.'}`,
    }
  return { tone: 'good', text: 'Supply lines up with expected demand.' }
}

function sliderPct(v: number, min: number, max: number): number {
  return max > min ? clamp((v - min) / (max - min), 0, 1) : 0
}

// ---------------------------------------------------------------------------
// UI

interface PlanSliderProps {
  id: string
  label: string
  valueText: string
  min: number
  max: number
  step: number
  value: number
  disabled?: boolean
  onChange: (v: number) => void
  decLabel: string
  incLabel: string
  onDec: () => void
  onInc: () => void
  /** Position (0..1) and description of the hint marker under the track. */
  marker?: { at: number; label: string }
  scaleMin: string
  scaleMax: string
  describedBy: string
  children?: ReactNode
}

function PlanSlider(props: PlanSliderProps) {
  const { id, label, valueText, min, max, step, value, disabled, marker } = props
  // The fill follows the thumb, which the browser places on the native range (up to gridTop).
  const top = gridTop(min, max, step)
  const pct = sliderPct(value, min, top)
  // At a limit the nudge stays focusable (aria-disabled) so keyboard focus isn't dropped.
  const atMin = value <= min
  const atMax = value >= max
  return (
    <div className={disabled ? 'ar-control is-disabled' : 'ar-control'}>
      <div className="ar-control-head">
        <label htmlFor={id} className="ar-control-label">
          {label}
        </label>
        <output htmlFor={id} className="ar-control-value">
          {valueText}
        </output>
      </div>
      <div className="ar-slider-row">
        <button
          type="button"
          className="ar-nudge"
          aria-label={props.decLabel}
          aria-controls={id}
          aria-disabled={atMin || undefined}
          disabled={disabled}
          onClick={() => {
            if (!atMin) props.onDec()
          }}
        >
          −
        </button>
        <div className="ar-track">
          <input
            id={id}
            className="ar-range"
            type="range"
            min={min}
            max={top}
            step={step}
            value={value}
            disabled={disabled}
            aria-valuetext={valueText}
            aria-describedby={props.describedBy}
            style={{ '--pct': pct } as CSSProperties}
            onChange={(e) => props.onChange(Number(e.currentTarget.value))}
          />
          {marker ? (
            <span className="ar-marker" style={{ '--at': clamp(marker.at, 0, 1) } as CSSProperties} title={marker.label} aria-hidden />
          ) : null}
        </div>
        <button
          type="button"
          className="ar-nudge"
          aria-label={props.incLabel}
          aria-controls={id}
          aria-disabled={atMax || undefined}
          disabled={disabled}
          onClick={() => {
            if (!atMax) props.onInc()
          }}
        >
          +
        </button>
      </div>
      <div className="ar-scale" aria-hidden>
        <span>{props.scaleMin}</span>
        <span>{props.scaleMax}</span>
      </div>
      {props.children}
    </div>
  )
}

interface TalentInstinctProps {
  id: string
  hint: TalentPlan
  unitLabel: string
  priceStep: number
  /** The sliders already match the hinted plan. */
  using: boolean
  onUse: (plan: { price: number; production: number }) => void
}

/** The purple "Business instinct" box: what the talent reads in the market, and a one-tap plan. */
function TalentInstinct({ id, hint, unitLabel, priceStep: step, using, onUse }: TalentInstinctProps) {
  const plan = hint.plan
  return (
    <section className="ar-instinct" aria-labelledby={id}>
      <h3 className="ar-instinct-head" id={id}>
        <span className="ar-instinct-icon" aria-hidden>
          {HINT_EMOJI}
        </span>
        Business instinct
      </h3>
      <p className="ar-instinct-text">{hint.text}</p>
      {plan ? (
        <div className="ar-instinct-plan">
          <span className="ar-instinct-figures">
            {formatPrice(plan.price, step)} each · make {unitsText(plan.production, unitLabel)}
          </span>
          <button type="button" className={using ? 'ar-instinct-use is-on' : 'ar-instinct-use'} aria-pressed={using} onClick={() => onUse(plan)}>
            {using ? '✓ Using this plan' : 'Use this plan'}
          </button>
        </div>
      ) : null}
    </section>
  )
}

export function AnnualReport({ modal, onDone }: MinigameProps) {
  const [r] = useState(() => readReportData(modal.data))
  const [price, setPrice] = useState(r.price)
  const [production, setProduction] = useState(r.production)
  const uid = useId()
  const ids = {
    instinct: `${uid}-instinct`,
    price: `${uid}-price`,
    priceTip: `${uid}-price-tip`,
    production: `${uid}-production`,
    productionTip: `${uid}-production-tip`,
    results: `${uid}-results`,
    plan: `${uid}-plan`,
  }

  const pStep = priceStep(r)
  const qStep = productionStep(r)
  const unitOne = singularUnit(r.unitLabel)
  const p = projectPlan(r, price, production)
  const pTip = priceTip(r, price, pStep)
  const qTip = productionTip(r, p, production)
  const target = unitsToMeetDemand(r)
  const canProduce = r.maxProduction > 0
  const subtitle = [r.industryLabel, r.location].filter(Boolean).join(' · ')
  const lastIndex = r.lines.length - 1
  const isTotal = (label: string, i: number) => i === lastIndex && i > 0 && /\b(net|profit|loss)\b/i.test(label)

  const approve = () => onDone(planResult(r, price, production))
  const keep = () => onDone(SKIP_RESULT)

  return (
    <div className="annual-report">
      <header className="ar-head">
        <span className="ar-emoji" aria-hidden>
          {r.emoji}
        </span>
        <div className="ar-id">
          {r.year !== null ? <div className="ar-year">Fiscal year {r.year}</div> : null}
          <div className="ar-name">{r.businessName}</div>
          {subtitle ? <div className="ar-sub">{subtitle}</div> : null}
        </div>
      </header>

      <section className="ar-section" aria-labelledby={ids.results}>
        <h3 className="ar-heading" id={ids.results}>
          {r.year !== null ? `${r.year} results` : "Last year's results"}
        </h3>
        {r.lines.length > 0 ? (
          <dl className="ar-statement">
            {r.lines.map((l, i) => (
              <div key={`${i}-${l.label}`} className={`ar-line is-${l.tone}${isTotal(l.label, i) ? ' is-total' : ''}`}>
                <dt>{l.label}</dt>
                <dd>{l.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="ar-empty">No trading figures yet. Next year is the first real test.</p>
        )}
      </section>

      {r.marketNote ? (
        <p className="ar-note">
          <span className="ar-note-icon" aria-hidden>
            🌍
          </span>
          <span>{r.marketNote}</span>
        </p>
      ) : null}

      {r.talentHint ? (
        <TalentInstinct
          id={ids.instinct}
          hint={r.talentHint}
          unitLabel={r.unitLabel}
          priceStep={pStep}
          using={r.talentHint.plan !== null && price === r.talentHint.plan.price && production === r.talentHint.plan.production}
          onUse={(plan) => {
            setPrice(plan.price)
            setProduction(plan.production)
          }}
        />
      ) : null}

      <section className="ar-section" aria-labelledby={ids.plan}>
        <h3 className="ar-heading" id={ids.plan}>
          {r.year !== null ? `Plan for ${r.year + 1}` : "Next year's plan"}
        </h3>

        <PlanSlider
          id={ids.price}
          label={`Price per ${unitOne}`}
          valueText={formatPrice(price, pStep)}
          min={r.minPrice}
          max={r.maxPrice}
          step={pStep}
          value={price}
          onChange={(v) => setPrice(snap(v, r.minPrice, r.maxPrice, pStep))}
          decLabel="Lower the price"
          incLabel="Raise the price"
          onDec={() => setPrice((v) => nudge(v, -1, r.minPrice, r.maxPrice, pStep))}
          onInc={() => setPrice((v) => nudge(v, 1, r.minPrice, r.maxPrice, pStep))}
          marker={{ at: sliderPct(r.suggestedPrice, r.minPrice, r.maxPrice), label: `Suggested price ${formatPrice(r.suggestedPrice, pStep)}` }}
          scaleMin={shortPrice(r.minPrice, pStep)}
          scaleMax={shortPrice(r.maxPrice, pStep)}
          describedBy={ids.priceTip}
        >
          <div className="ar-chips">
            <button
              type="button"
              className={price === r.suggestedPrice ? 'ar-chip is-on' : 'ar-chip'}
              onClick={() => setPrice(r.suggestedPrice)}
              title="Use the suggested price for this market"
            >
              <span className="ar-chip-dot" aria-hidden />
              Suggested {formatPrice(r.suggestedPrice, pStep)}
            </button>
            {r.unitCost > 0 ? <span className="ar-chip">Cost {formatPrice(r.unitCost, pStep)}</span> : null}
          </div>
          <p className={`ar-tip is-${pTip.tone}`} id={ids.priceTip}>
            {pTip.text}
          </p>
        </PlanSlider>

        <PlanSlider
          id={ids.production}
          label="Production"
          valueText={unitsText(production, r.unitLabel)}
          min={0}
          max={Math.max(r.maxProduction, 0)}
          step={qStep}
          value={production}
          disabled={!canProduce}
          onChange={(v) => setProduction(Math.round(snap(v, 0, r.maxProduction, qStep)))}
          decLabel="Make fewer"
          incLabel="Make more"
          onDec={() => setProduction((v) => Math.round(nudge(v, -1, 0, r.maxProduction, qStep)))}
          onInc={() => setProduction((v) => Math.round(nudge(v, 1, 0, r.maxProduction, qStep)))}
          marker={canProduce && r.expectedDemand > 0 ? { at: target / r.maxProduction, label: `Meets expected demand at ${plainCount(target)}` } : undefined}
          scaleMin="0"
          scaleMax={`${compactCount(r.maxProduction)} max`}
          describedBy={ids.productionTip}
        >
          <div className="ar-chips">
            <span className="ar-chip">📈 Demand ~{plainCount(r.expectedDemand)}</span>
            <span className="ar-chip">📦 In stock {plainCount(r.inventory)}</span>
            {canProduce && r.expectedDemand > 0 ? (
              <button
                type="button"
                className={production === target ? 'ar-chip is-on' : 'ar-chip'}
                onClick={() => setProduction(target)}
                title={`Make ${unitsText(target, r.unitLabel)}: stock on hand plus production covers expected demand`}
              >
                <span className="ar-chip-dot" aria-hidden />
                Match demand
              </button>
            ) : null}
          </div>
          <p className={`ar-tip is-${qTip.tone}`} id={ids.productionTip}>
            {qTip.text}
          </p>
        </PlanSlider>
      </section>

      <section className="ar-projection" aria-label="Projection for next year (estimate)">
        <div className="ar-projection-head">
          <span>Projection</span>
          <span className="ar-badge">Estimate</span>
        </div>
        <dl className="ar-statement is-compact">
          <div className="ar-line is-neutral">
            <dt>
              Production cost
              <small>
                {plainCount(production)} × {formatPrice(r.unitCost, pStep)}
              </small>
            </dt>
            <dd>{p.productionCost > 0 ? `-${formatMoney(p.productionCost)}` : formatMoney(0)}</dd>
          </div>
          <div className="ar-line is-neutral">
            <dt>
              Revenue if it sells
              <small>
                {plainCount(p.sold)} × {formatPrice(price, pStep)}
              </small>
            </dt>
            <dd>{formatMoney(p.revenue)}</dd>
          </div>
          <div className={`ar-line is-total is-${p.margin > 0 ? 'good' : p.margin < 0 ? 'bad' : 'neutral'}`}>
            <dt>Gross margin</dt>
            <dd>{formatMoney(p.margin)}</dd>
          </div>
        </dl>
        <p className="ar-fineprint">
          Demand is quoted at the suggested price. Before rent, wages and taxes; markets don't read projections.
        </p>
      </section>

      <div className="ar-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={approve}>
          ✅ Approve plan
        </button>
        <button type="button" className="btn btn-block" onClick={keep}>
          Keep last year's plan
        </button>
      </div>
    </div>
  )
}
