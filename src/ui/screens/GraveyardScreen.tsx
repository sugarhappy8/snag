// Graveyard: every past life with its ribbon, years, cause of death and net worth. Tap a grave
// to read the obituary; sort like the original's cemetery; bulldoze graves you'd rather forget.
import { useMemo, useState } from 'react'
import { formatMoney, shortMoney } from '../../game/core'
import { getRibbon } from '../../game/ribbons'
import { loadGraveyard, type GraveyardEntry } from '../../game/save'
import { goBack, goTo } from '../store'
import '../styles/screens.css'
import { ConfirmDialog, Flash, ScreenHeader, useFlash } from './SettingsScreen'

const GRAVEYARD_KEY = 'anotherlife.graveyard.v1'

export type GraveSort = 'recent' | 'netWorth' | 'age' | 'name'

const SORTS: { id: GraveSort; label: string }[] = [
  { id: 'recent', label: 'Most recent' },
  { id: 'netWorth', label: 'Net worth' },
  { id: 'age', label: 'Age' },
  { id: 'name', label: 'Name' },
]

/** Sorted copy of the graveyard (it is stored newest first). */
export function sortGraves(entries: readonly GraveyardEntry[], sort: GraveSort): GraveyardEntry[] {
  const list = [...entries]
  switch (sort) {
    case 'netWorth':
      return list.sort((a, b) => (b.netWorth ?? 0) - (a.netWorth ?? 0))
    case 'age':
      return list.sort((a, b) => b.age - a.age)
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name))
    case 'recent':
      return list
  }
}

export interface GraveStats {
  lives: number
  oldest: GraveyardEntry | null
  richest: GraveyardEntry | null
}

export function graveStats(entries: readonly GraveyardEntry[]): GraveStats {
  let oldest: GraveyardEntry | null = null
  let richest: GraveyardEntry | null = null
  for (const e of entries) {
    if (!oldest || e.age > oldest.age) oldest = e
    if (!richest || e.netWorth > richest.netWorth) richest = e
  }
  return { lives: entries.length, oldest, richest }
}

/** Remove one grave from storage. Returns the remaining list. */
export function bulldozeGrave(lifeId: string): GraveyardEntry[] {
  const rest = loadGraveyard().filter((e) => e.lifeId !== lifeId)
  try {
    localStorage.setItem(GRAVEYARD_KEY, JSON.stringify(rest))
  } catch {
    // storage blocked: the grave reappears next visit
  }
  return rest
}

export function GraveyardScreen() {
  const [entries, setEntries] = useState<GraveyardEntry[]>(() => loadGraveyard())
  const [sort, setSort] = useState<GraveSort>('recent')
  const [open, setOpen] = useState<string | null>(null)
  const [doomed, setDoomed] = useState<GraveyardEntry | null>(null)
  const [flash, showFlash] = useFlash()

  const sorted = useMemo(() => sortGraves(entries, sort), [entries, sort])
  const stats = useMemo(() => graveStats(entries), [entries])

  const confirmBulldoze = () => {
    if (!doomed) return
    const name = doomed.name
    setEntries(bulldozeGrave(doomed.lifeId))
    setDoomed(null)
    setOpen(null)
    showFlash(`🚜 ${name}'s grave was bulldozed. A parking lot is coming soon.`)
  }

  return (
    <div className="al-screen graveyard">
      <ScreenHeader title="Graveyard" emoji="🪦" onBack={goBack} />

      {entries.length === 0 ? (
        <div className="al-card al-empty">
          <span className="al-empty-emoji">🌱</span>
          <h2 style={{ margin: '0 0 6px' }}>No graves yet</h2>
          <p className="al-muted">Everyone you’ve ever been is still alive… for now. Finished lives rest here with their ribbons and obituaries.</p>
          <button type="button" className="al-btn green" onClick={() => goTo('newLife')} style={{ marginTop: 8 }}>
            👶 Start a life
          </button>
        </div>
      ) : (
        <>
          <section className="al-card grave-summary">
            <div>
              <strong>{stats.lives}</strong>
              <span>{stats.lives === 1 ? 'life lived' : 'lives lived'}</span>
            </div>
            <div>
              <strong>{stats.oldest ? stats.oldest.age : '–'}</strong>
              <span>oldest age</span>
            </div>
            <div>
              <strong>{stats.richest ? shortMoney(stats.richest.netWorth) : '–'}</strong>
              <span>richest</span>
            </div>
          </section>

          <label className="al-field">
            <span className="al-label">Sort by</span>
            <select className="al-select" value={sort} onChange={(e) => setSort(e.target.value as GraveSort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grave-list">
            {sorted.map((e) => {
              const key = e.lifeId
              const ribbon = e.ribbon ? getRibbon(e.ribbon) : undefined
              const isOpen = open === key
              return (
                <article key={key} className="al-card grave-card">
                  <button type="button" className="grave-head" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                    <span className="grave-stone" aria-hidden="true">
                      {e.gender === 'female' ? '👩' : '👨'}
                      <span className="grave-stone-ribbon">{ribbon?.emoji ?? '🪦'}</span>
                    </span>
                    <span className="grave-info">
                      <span className="grave-name" style={{ display: 'block' }}>
                        {e.name}
                      </span>
                      <span className="grave-sub" style={{ display: 'block' }}>
                        {e.bornYear}–{e.diedYear} · age {e.age} · {e.causeOfDeath}
                      </span>
                    </span>
                    <span className={`grave-worth ${e.netWorth < 0 ? 'neg' : ''}`}>{shortMoney(e.netWorth)}</span>
                  </button>
                  {isOpen ? (
                    <div className="grave-body">
                      <div className="grave-tags">
                        {ribbon ? (
                          <span className="grave-tag">
                            {ribbon.emoji} {ribbon.name}
                          </span>
                        ) : null}
                        <span className="grave-tag">💼 {e.occupation || 'Unemployed'}</span>
                        <span className="grave-tag">💰 {formatMoney(e.netWorth)}</span>
                        {e.generation > 1 ? <span className="grave-tag">🌳 Generation {e.generation}</span> : null}
                      </div>
                      <p className="grave-obit">{e.obituary?.trim() || `${e.name} died of ${e.causeOfDeath.toLowerCase()} at ${e.age}. No obituary was written.`}</p>
                      <button type="button" className="al-btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setDoomed(e)}>
                        🚜 Bulldoze grave
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </>
      )}

      {doomed ? (
        <ConfirmDialog
          emoji="🚜"
          title={`Bulldoze ${doomed.name}'s grave?`}
          text="Their grave and obituary will be gone forever. Ribbons you earned stay in your collection."
          confirmLabel="Bulldoze it"
          danger
          onConfirm={confirmBulldoze}
          onCancel={() => setDoomed(null)}
        />
      ) : null}
      <Flash message={flash} />
    </div>
  )
}

export default GraveyardScreen
