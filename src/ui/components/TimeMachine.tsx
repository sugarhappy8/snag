// The Time Machine (BitLife-style "go back a few years"): the sheet that lists the years you can
// go back to, the ⏳ button on the game screen, the Death screen's "Use the Time Machine", and
// the little warp the game screen plays when you arrive. Rules live in game/timeMachine.ts;
// snapshots and travel in the store.
import { useEffect, useState } from 'react'
import { formatMoney, withMoneyContext } from '../../game/core'
import {
  availableStops,
  isRestart,
  jumpsLeft,
  jumpsText,
  sandboxTimeMachine,
  stopLabel,
  TIME_MACHINE_JUMPS,
  TIME_MACHINE_STOPS,
  travelBlock,
  type TimeStop,
} from '../../game/timeMachine'
import type { GameState } from '../../game/types'
import { clearTimeTravelError, travelBack, useApp, type TimeTravelState } from '../store'
import { ConfirmDialog } from './Dialogs'
import { Sheet } from './Sheet'
import '../styles/timemachine.css'

const NO_STOPS: readonly TimeStop[] = []

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)

export interface TimeMachineRow {
  stop: TimeStop
  emoji: string
  label: string
  sub: string
  /** Why it can't be picked ('' when it can). */
  disabled: string
}

/**
 * A stop's balance as you saw it back then: that year's prices, in the money of the country you
 * lived in (a 1990 balance in 1990 yen, not 2000 yen; pesos before you emigrated, not dollars).
 */
export function moneyThen(g: GameState, stop: TimeStop): string {
  return withMoneyContext({ countryId: stop.countryId || g.character.countryId, year: stop.year }, () => formatMoney(stop.money))
}

/** One row per year you can go back to, newest first. */
export function timeMachineRows(g: GameState, stops: readonly TimeStop[] | undefined, unlimited: boolean): TimeMachineRow[] {
  return availableStops(g, stops ?? NO_STOPS).map((stop) => {
    const restart = isRestart(g, stop)
    const then = `${stop.role || 'Living'} · ${moneyThen(g, stop)} in the bank`
    return {
      stop,
      emoji: restart ? '🔁' : stop.age === 0 ? '👶' : '⏪',
      label: stopLabel(g, stop),
      sub: restart ? `Start this year over · ${then}` : then,
      disabled: travelBlock(g, stop, unlimited),
    }
  })
}

/** Whether the game screen should offer the Time Machine: a past year to go back to. */
export function canOfferTimeMachine(g: GameState, stops: readonly TimeStop[] | undefined): boolean {
  if (!g.character.alive) return availableStops(g, stops ?? NO_STOPS).length > 0
  return availableStops(g, stops ?? NO_STOPS).some((s) => s.age < g.character.age)
}

/** What the confirm dialog says before a jump. */
export function confirmTravelText(g: GameState, stop: TimeStop, unlimited: boolean): string {
  const c = g.character
  let what: string
  const wake = stop.age === 0 ? `You'll be a newborn again in ${stop.year}` : `You'll wake up at age ${stop.age} in ${stop.year}`
  if (!c.alive) {
    what = `${wake}, alive and well. Your death in ${g.year} never happens (but you'll remember it).`
  } else if (isRestart(g, stop)) {
    what = `This year starts over from your birthday in ${stop.year}. Everything you did since never happened.`
  } else {
    const years = g.year - stop.year
    what = `${wake}. ${years === 1 ? 'The last year' : `The last ${years} years`} never happened, but you'll know what's coming.`
  }
  if (unlimited) return `${what} Sandbox mode: this jump is free.`
  const after = jumpsLeft(g, false) - 1
  return `${what} ${after <= 0 ? 'This is your last jump this life.' : `You'll have ${after} jump${after === 1 ? '' : 's'} left.`}`
}

/** "2 jumps left" as a short badge: '∞' in sandbox mode. */
export function jumpsBadge(g: GameState, unlimited: boolean): string {
  return unlimited ? '∞' : String(jumpsLeft(g, false))
}

// ---------------------------------------------------------------------------
// The sheet

export interface TimeMachineSheetProps {
  g: GameState
  onClose: () => void
}

export function TimeMachineSheet({ g, onClose }: TimeMachineSheetProps) {
  const stops = useApp((s) => s.timeStops)
  const settings = useApp((s) => s.settings)
  const travel = useApp((s) => s.timeTravel) as TimeTravelState | undefined
  const [picked, setPicked] = useState<TimeStop | null>(null)
  const unlimited = sandboxTimeMachine(settings)
  const rows = timeMachineRows(g, stops, unlimited)
  const busy = travel?.busy ?? false
  const error = travel?.error ?? ''
  const used = Math.max(0, TIME_MACHINE_JUMPS - jumpsLeft(g, false))
  const outOfFuel = !unlimited && jumpsLeft(g, false) <= 0

  const close = () => {
    clearTimeTravelError()
    onClose()
  }
  const go = (stop: TimeStop) => {
    setPicked(null)
    void travelBack(stop.age).then((ok) => {
      if (ok) onClose()
    })
  }

  return (
    <Sheet title="Time Machine" emoji="⏳" onClose={close}>
      <div className="tm-intro">
        <div className="tm-dial" aria-hidden="true">
          ⏳
        </div>
        <p className="tm-blurb">
          Go back to the start of one of your last {TIME_MACHINE_STOPS} years. Everything after it never happens, except in your
          memory.
        </p>
        <div className="tm-fuel" role="status" aria-label={jumpsText(g, unlimited)}>
          {unlimited ? (
            <span className="tm-fuel-cell is-full tm-fuel-inf" aria-hidden="true">
              ∞
            </span>
          ) : (
            Array.from({ length: TIME_MACHINE_JUMPS }, (_, i) => (
              <span key={i} className={i < TIME_MACHINE_JUMPS - used ? 'tm-fuel-cell is-full' : 'tm-fuel-cell'} aria-hidden="true">
                ⏳
              </span>
            ))
          )}
          <span className="tm-fuel-text">{jumpsText(g, unlimited)}</span>
        </div>
      </div>

      {error ? (
        <div className="menu-info tm-note is-error" role="alert">
          <span className="menu-info-emoji">⚠️</span>
          <span>{error}</span>
        </div>
      ) : null}
      {outOfFuel ? (
        <div className="menu-info tm-note">
          <span className="menu-info-emoji">🪫</span>
          <span>
            The Time Machine is out of fuel for this life ({TIME_MACHINE_JUMPS} jumps used). Turn on Sandbox: unlimited Time Machine in
            Settings to keep jumping.
          </span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="menu-empty tm-empty">
          No years saved yet. The Time Machine keeps the start of each birthday, so age up once and you'll have somewhere to go back
          to.
        </div>
      ) : (
        <div className="menu-list tm-list">
          {rows.map((row) => (
            <button
              key={row.stop.age}
              type="button"
              className={row.disabled || busy ? 'menu-row tm-row is-disabled' : 'menu-row tm-row'}
              aria-disabled={row.disabled || busy ? true : undefined}
              title={row.disabled || undefined}
              onClick={() => {
                if (!row.disabled && !busy) setPicked(row.stop)
              }}
            >
              <span className="menu-row-icon" aria-hidden="true">
                {row.emoji}
              </span>
              <span className="menu-row-text">
                <span className="menu-row-label">{row.label}</span>
                <span className="menu-row-sub">{row.sub}</span>
              </span>
              <span className="menu-row-end" aria-hidden="true">
                {row.disabled ? <span className="menu-row-lock">🔒</span> : <span className="menu-row-chevron">›</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {busy ? (
        <div className="tm-busy" role="status">
          <span className="tm-busy-spin" aria-hidden="true">
            ⏳
          </span>
          Spinning up the Time Machine…
        </div>
      ) : null}

      {picked ? (
        <ConfirmDialog
          title={picked.age === 0 ? `Back to ${picked.year}?` : `Back to age ${picked.age}?`}
          emoji="⏳"
          text={confirmTravelText(g, picked, unlimited)}
          confirmLabel="⏳ Go back"
          cancelLabel="Stay"
          onConfirm={() => go(picked)}
          onCancel={() => setPicked(null)}
        />
      ) : null}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Entry points

/** The ⏳ button floating on the game screen (above the bottom bar, left of the "+ Age" bulge). */
export function TimeMachineButton({ g, onOpen }: { g: GameState; onOpen: () => void }) {
  const settings = useApp((s) => s.settings)
  const unlimited = sandboxTimeMachine(settings)
  const badge = jumpsBadge(g, unlimited)
  const empty = !unlimited && jumpsLeft(g, false) <= 0
  return (
    <button
      type="button"
      className={empty ? 'tm-fab is-empty' : 'tm-fab'}
      onClick={onOpen}
      aria-label={`Time Machine: ${jumpsText(g, unlimited)}`}
      title={`Time Machine · ${jumpsText(g, unlimited)}`}
    >
      <span className="tm-fab-icon" aria-hidden="true">
        ⏳
      </span>
      <span className="tm-fab-badge" aria-hidden="true">
        {badge}
      </span>
    </button>
  )
}

/** The Death screen's big "Use the Time Machine" button. */
export function TimeMachineDeathButton({ g, onOpen }: { g: GameState; onOpen: () => void }) {
  const stops = useApp((s) => s.timeStops)
  const settings = useApp((s) => s.settings)
  const unlimited = sandboxTimeMachine(settings)
  const available = availableStops(g, stops ?? NO_STOPS)
  if (available.length === 0) return null
  const oldest = available[available.length - 1]
  const left = jumpsLeft(g, false)
  const empty = !unlimited && left <= 0
  const jumps = unlimited ? 'Unlimited jumps' : `${left} jump${left === 1 ? '' : 's'} left`
  const sub = empty ? 'Out of jumps this life' : `${jumps} · back as far as ${oldest.year}`
  return (
    <div className="tm-revive">
      <p className="al-section-title">Not ready to go?</p>
      <button type="button" className={empty ? 'al-bigbtn tm-bigbtn is-empty' : 'al-bigbtn tm-bigbtn'} onClick={onOpen}>
        <span className="al-bigbtn-emoji" aria-hidden="true">
          ⏳
        </span>
        <span className="al-bigbtn-text">
          <span>Use the Time Machine</span>
          <span className="al-bigbtn-sub">{sub}</span>
        </span>
        <span className="al-bigbtn-chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </div>
  )
}

/** The warp the game screen shows for a moment after a jump. */
export function TimeTravelArrival({ year, age }: { year: number; age: number }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 2200)
    return () => clearTimeout(t)
  }, [])
  if (done) return null
  return (
    <div className="tm-arrive" aria-hidden="true">
      <div className="tm-arrive-ring" />
      <div className="tm-arrive-card">
        <span className="tm-arrive-emoji">⏳</span>
        <span className="tm-arrive-year">{year}</span>
        <span className="tm-arrive-age">{age === 0 ? 'Day one' : `Age ${age}`}</span>
      </div>
    </div>
  )
}
