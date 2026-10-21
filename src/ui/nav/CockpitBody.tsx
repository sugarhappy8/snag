// What a cockpit shows (G.5): the tiles, the net-worth chart, a card for each company and the Pinned and recent strip.
// Static and hook-free, so a test can call it as a function and read the element tree. Only the chart kit is lazy, through
// kit.ts: until a chunk is ready each tile, card and chart shows its text, so the screen is never blank and the words are
// there for a test to read. A tile or card with a screen is a button that hands the path to `onOpen`, which opens it the way
// a breadcrumb does.
import type { ReactElement } from 'react'
import { shortMoney } from '../../game/core'
import type { CockpitModel, CockpitTab, CockpitTile } from '../../game/hubs/cockpit'
import { personIdOf } from '../../game/hubs/people'
import type { CompanyCard } from '../../game/hubs/wealth'
import type { GameState } from '../../game/types'
import { JumpStrip, MAX_JUMP, type JumpLink } from './JumpStrip'
import { LazyChartView, LazyKpiTile, LazySparkline } from './kit'
import { placeKey, type PlaceRef } from './place'
import { lifeOf, type UiPrefs } from './prefs'
import { placeToReopen, type OpenablePlace } from './reopen'
import '../styles/nav.css'

export type { JumpLink } from './JumpStrip'

export interface CockpitBodyProps {
  model: CockpitModel
  jump: readonly JumpLink[]
  /** Open a screen: the group ids below the tab's root. */
  onOpen: (path: string[]) => void
}

// ---------------------------------------------------------------------------
// Pinned and recent

/** The place as the sheets open it: on Relationships the first id names the person, who is split off. Null when it cannot be one. */
function openable(ref: PlaceRef): OpenablePlace | null {
  if (ref.tab !== 'relationships') return ref
  const person = ref.path.length > 0 ? personIdOf(ref.path[0]!) : null
  return person === null ? null : { tab: ref.tab, path: ref.path.slice(1), personId: person }
}

/**
 * The pins and then the recents of this tab for this life, each checked against the latest state with placeToReopen (the way
 * the "Back to" chip is): a place that has vanished is left out, and so is one that would open on a shallower group than it
 * names. A group shows once however it was kept, and a place at the tab's root is not a shortcut. At most `max` (default 4).
 * Pure: it reads the state and the prefs and changes neither.
 */
export function jumpLinks(g: GameState, prefs: UiPrefs, tab: CockpitTab, max: number = MAX_JUMP): JumpLink[] {
  const cap = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : MAX_JUMP
  const out: JumpLink[] = []
  if (cap === 0) return out
  const life = lifeOf(prefs, g.lifeId)
  const seen = new Set<string>()
  for (const ref of [...life.pins, ...life.recents]) {
    if (out.length >= cap) break
    if (ref.tab !== tab || ref.path.length === 0) continue
    const group = ref.path.join('\u0000')
    if (seen.has(group)) continue
    const place = openable(ref)
    if (place === null) continue
    try {
      const at = placeToReopen(g, place)
      if (!at.exact) continue
      seen.add(group)
      out.push({ key: placeKey(ref), label: at.label, emoji: at.emoji, crumbs: at.crumbs, place: ref })
    } catch (err) {
      console.error(`[cockpit] placeToReopen(${placeKey(ref)}) failed:`, err)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The tiles

function Meter({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <span className="cockpit-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span style={{ width: `${value}%` }} />
    </span>
  )
}

/** The text a tile shows before the kit is ready: the same words as the real tile, in the same shape (a button when it opens a screen). */
function tileText(t: CockpitTile, press: (() => void) | undefined): ReactElement {
  const inside = (
    <>
      <span className="ch-kpi-label">{t.label}</span>
      <span className="ch-kpi-value">{t.value}</span>
      {t.note ? <span className="ch-kpi-note">{t.note}</span> : null}
    </>
  )
  return press ? (
    <button type="button" className="ch-kpi ch-kpi-press cockpit-kpi-fallback" onClick={press}>
      {inside}
    </button>
  ) : (
    <div className="ch-kpi cockpit-kpi-fallback">{inside}</div>
  )
}

function tileView(t: CockpitTile, onOpen: (path: string[]) => void): ReactElement {
  const open = t.open
  const press = open ? () => onOpen([...open]) : undefined
  return (
    <div className="cockpit-tile" key={t.id}>
      <LazyKpiTile label={t.label} value={t.value} note={t.note} tone={t.tone} values={t.spark} fmt={t.spark ? shortMoney : undefined} onPress={press} fallback={tileText(t, press)} />
      {t.meter !== undefined ? <Meter label={t.label} value={t.meter} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The company cards

function realCount(values: readonly (number | null)[]): number {
  return values.reduce<number>((n, v) => (typeof v === 'number' && Number.isFinite(v) ? n + 1 : n), 0)
}

function netText(net: number | null): string {
  if (net === null) return 'No year closed yet'
  if (net === 0) return 'Broke even'
  return net < 0 ? `Loss ${shortMoney(-net)}` : `Profit ${shortMoney(net)}`
}

function runwayText(years: number): string {
  const n = years < 10 ? String(Math.round(years * 10) / 10) : years >= 99 ? '99+' : String(Math.round(years))
  return `Runway ${n} ${n === '1' ? 'year' : 'years'}`
}

function cardView(c: CompanyCard, onOpen: (path: string[]) => void): ReactElement {
  return (
    <button type="button" className="cockpit-card" key={c.assetId} onClick={() => onOpen([...c.open])}>
      <span className="cockpit-card-head">
        <span className="cockpit-card-emoji" aria-hidden>
          {c.emoji}
        </span>
        <span className="cockpit-card-name">{c.name}</span>
        <span className={`cockpit-chip cockpit-chip-${c.health.id}`}>
          <span aria-hidden>{c.health.emoji}</span> {c.health.label}
        </span>
      </span>
      <span className="cockpit-card-sub">{c.industry}</span>
      {realCount(c.sales) >= 2 ? <LazySparkline values={c.sales} tone="c1" label={`Sales, last ${c.sales.length} years`} fmt={shortMoney} fallback={null} /> : null}
      <span className="cockpit-card-line">{`Worth ${shortMoney(c.valuation)} · ${netText(c.net)}`}</span>
      {c.runwayYears !== null ? <span className="cockpit-card-line">{runwayText(c.runwayYears)}</span> : null}
    </button>
  )
}

// ---------------------------------------------------------------------------

export function CockpitBody({ model, jump, onOpen }: CockpitBodyProps): ReactElement {
  const { tiles, chart, cards, moreCards } = model
  return (
    <div className="cockpit-body">
      {tiles.length === 0 ? <p className="cockpit-summary">{model.summary}</p> : <div className="cockpit-tiles">{tiles.map((t) => tileView(t, onOpen))}</div>}
      {chart ? (
        <div className="cockpit-chart">
          <LazyChartView spec={chart} fallback={<p className="cockpit-chart-fallback">{chart.summary}</p>} />
        </div>
      ) : null}
      {cards.length > 0 ? (
        <section className="cockpit-cards" aria-label="Your companies">
          <div className="menu-heading">Companies</div>
          {cards.map((c) => cardView(c, onOpen))}
          {moreCards > 0 ? (
            <button type="button" className="cockpit-more" aria-label={`Show ${moreCards} more ${moreCards === 1 ? 'company' : 'companies'}`} onClick={() => onOpen(['businesses'])}>
              {`+${moreCards} more`}
            </button>
          ) : null}
        </section>
      ) : null}
      <JumpStrip links={jump} onOpen={onOpen} />
    </div>
  )
}
