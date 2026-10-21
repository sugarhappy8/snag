// Ribbon collection: every ribbon, with how many times you've earned it. Unearned ones are
// greyed out with a "?" medal; tap any ribbon to read what it's for.
import { useMemo, useState } from 'react'
import { RIBBONS, type RibbonDef } from '../../game/ribbons'
import { loadRibbons } from '../../game/save'
import { ModalSurface } from '../a11y/ModalSurface'
import { goBack } from '../store'
import '../styles/screens.css'
import { ScreenHeader } from './SettingsScreen'

type Filter = 'all' | 'earned' | 'missing'

/** Secret ribbons keep their name and requirement hidden until earned. */
export function isSecretRibbon(r: RibbonDef): boolean {
  return r.secret === true
}

export interface RibbonTile {
  def: RibbonDef
  count: number
  earned: boolean
  /** Name shown on the tile ("???" for unearned secret ribbons). */
  name: string
  description: string
}

/** Collection view model: every ribbon with its earned count, in definition order. */
export function ribbonTiles(earned: Record<string, number>, defs: readonly RibbonDef[] = RIBBONS): RibbonTile[] {
  return defs.map((def) => {
    const count = Math.max(0, Math.floor(earned[def.id] ?? 0))
    const hidden = count === 0 && isSecretRibbon(def)
    return {
      def,
      count,
      earned: count > 0,
      name: hidden ? '???' : def.name,
      description: hidden ? 'A secret ribbon. Live a very particular kind of life to reveal it.' : def.description,
    }
  })
}

export function RibbonsScreen() {
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<RibbonTile | null>(null)
  const tiles = useMemo(() => ribbonTiles(loadRibbons()), [])
  const earnedCount = tiles.filter((t) => t.earned).length
  const totalEarned = tiles.reduce((sum, t) => sum + t.count, 0)
  const pct = tiles.length > 0 ? Math.round((earnedCount / tiles.length) * 100) : 0
  const shown = tiles.filter((t) => (filter === 'earned' ? t.earned : filter === 'missing' ? !t.earned : true))

  return (
    <div className="al-screen ribbons">
      <ScreenHeader title="Ribbons" emoji="🎗️" onBack={goBack} />

      <section className="al-card">
        <div className="rib-progress">
          <strong>
            {earnedCount} / {tiles.length}
          </strong>
          <div className="rib-progress-track" aria-hidden="true">
            <div className="rib-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="al-muted al-small">{pct}%</span>
        </div>
        <p className="al-muted al-small" style={{ margin: '8px 0 0' }}>
          {earnedCount === 0
            ? 'Every life ends with a ribbon that sums it up. Die creatively to collect them all.'
            : earnedCount === tiles.length
              ? 'You’ve collected every ribbon. There’s nothing left to prove. Except everything.'
              : `${totalEarned} ${totalEarned === 1 ? 'ribbon' : 'ribbons'} awarded across all your lives. ${tiles.length - earnedCount} still out there.`}
        </p>
      </section>

      <div className="al-seg" role="tablist" aria-label="Filter ribbons">
        {(
          [
            ['all', 'All'],
            ['earned', 'Earned'],
            ['missing', 'Missing'],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="al-card al-empty">
          <span className="al-empty-emoji">{filter === 'earned' ? '🫥' : '🏆'}</span>
          <p className="al-muted">{filter === 'earned' ? 'No ribbons yet. Go live (and die) a little.' : 'Nothing missing. You got them all!'}</p>
        </div>
      ) : (
        <div className="rib-grid">
          {shown.map((t) => (
            <button
              key={t.def.id}
              type="button"
              className={`rib-tile ${t.earned ? '' : 'locked'}`}
              onClick={() => setSelected(t)}
              aria-label={`${t.name}${t.earned ? `, earned ${t.count} times` : ', not earned yet'}`}
            >
              {t.count > 1 ? <span className="rib-count">×{t.count}</span> : null}
              <span className="rib-medal" aria-hidden="true">
                {t.earned ? t.def.emoji : '?'}
              </span>
              <span className="rib-name">{t.name}</span>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div className="al-dialog-backdrop" onClick={() => setSelected(null)}>
          <ModalSurface role="dialog" label={selected.name} className="al-dialog">
            <div className={`rib-tile ${selected.earned ? '' : 'locked'}`} style={{ border: 0, background: 'transparent', cursor: 'default' }}>
              <span className="rib-medal rib-detail-medal" aria-hidden="true">
                {selected.earned ? selected.def.emoji : '?'}
              </span>
            </div>
            <h2>{selected.name}</h2>
            <p>{selected.description}</p>
            <p style={{ fontWeight: 800, color: selected.earned ? 'var(--green-dark, #1f8a39)' : 'var(--muted, #6b7685)' }}>
              {selected.earned ? `Earned ${selected.count === 1 ? 'once' : `${selected.count} times`} 🎉` : 'Not earned yet'}
            </p>
            <div className="al-dialog-actions">
              <button type="button" className="al-btn block" onClick={() => setSelected(null)} autoFocus>
                OK
              </button>
            </div>
          </ModalSurface>
        </div>
      ) : null}
    </div>
  )
}

export default RibbonsScreen
