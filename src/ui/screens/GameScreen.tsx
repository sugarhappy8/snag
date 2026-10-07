// The main game screen: header, life log, bottom bar with the "+ Age" button and the
// stat bars. Menus open as bottom sheets; popups from the queue show above everything.
// After an action closes a sheet, a "↩ Back to <menu>" chip reopens it where you left off.
// Once there's a past year to go back to, a ⏳ button opens the Time Machine.
import { useEffect, useRef, useState } from 'react'
import type { MenuSpot } from '../components/MenuList'
import { BottomBar, type BottomTab } from '../components/BottomBar'
import { Header } from '../components/Header'
import { LifeLog } from '../components/LifeLog'
import { MenuSheet } from '../components/MenuSheet'
import { ModalHost } from '../components/ModalHost'
import { ProfileSheet } from '../components/ProfileSheet'
import { RelationshipsSheet } from '../components/RelationshipsSheet'
import { MENU_SHEETS, openingClearsReturn, resolveReturnPoint, ReturnChip, type ResolvedReturn } from '../components/ReturnChip'
import { StatPanel } from '../components/StatPanel'
import { canOfferTimeMachine, TimeMachineButton, TimeMachineSheet, TimeTravelArrival } from '../components/TimeMachine'
import { ageUpAction, clearReturnPoint, goTo, returnChipVisible, returnPointLive, setReturnPoint, useApp, type ReturnSheet } from '../store'
import { DeathScreen } from './DeathScreen'

type SheetKind = BottomTab | 'profile'

/** The open sheet; `reopen` is set when the "Back to …" chip opened it. */
type OpenSheet = { kind: SheetKind; reopen?: ResolvedReturn } | null

export function GameScreen() {
  const g = useApp((s) => s.game)
  const busy = useApp((s) => s.ai !== null)
  const returnPoint = useApp((s) => s.returnPoint)
  const timeStops = useApp((s) => s.timeStops)
  const arrived = useApp((s) => s.timeTravel?.arrived ?? null)
  const [sheet, setSheet] = useState<OpenSheet>(null)
  const [timeMachineOpen, setTimeMachineOpen] = useState(false)
  const [warp, setWarp] = useState<{ id: number; year: number; age: number } | null>(null)
  const seenArrival = useRef(arrived?.id ?? 0)
  const lifeId = g?.lifeId
  const alive = g?.character.alive ?? false

  // A new life (or continuing as your child) starts with everything closed.
  useEffect(() => {
    setSheet(null)
    setTimeMachineOpen(false)
  }, [lifeId])

  // Just arrived from the Time Machine: play the warp once.
  useEffect(() => {
    if (arrived && arrived.id !== seenArrival.current) {
      seenArrival.current = arrived.id
      setSheet(null)
      setWarp(arrived)
    }
  }, [arrived])

  // Dying closes the menus (the profile can stay open).
  useEffect(() => {
    if (!alive) setSheet((s) => (s?.kind === 'profile' ? s : null))
  }, [alive])

  // A birthday, death or another life makes the remembered menu stale.
  useEffect(() => {
    if (returnPoint && !returnPointLive(returnPoint, g)) clearReturnPoint()
  }, [returnPoint, g])

  if (!g) {
    return (
      <div className="game-empty">
        <div style={{ fontSize: 56 }}>🌱</div>
        <h2>No life in progress</h2>
        <p className="muted">Start a new life from the main menu.</p>
        <button className="btn btn-primary" onClick={() => goTo('home')}>
          Main menu
        </button>
      </div>
    )
  }

  const queueBusy = g.queue.length > 0
  const showDeath = !g.character.alive && !queueBusy
  const close = () => setSheet(null)
  // Opening a menu yourself means you've moved on from the old spot (a profile peek doesn't).
  const open = (kind: SheetKind) => {
    if (openingClearsReturn(kind)) clearReturnPoint()
    setSheet({ kind })
  }
  const remember = (kind: ReturnSheet) => (spot: MenuSpot) => setReturnPoint({ sheet: kind, path: spot.path, scrolls: spot.scrolls })

  const target = !sheet && !showDeath && returnChipVisible(returnPoint, g) ? resolveReturnPoint(g, returnPoint) : null
  // The ⏳ button: alive, nothing on screen, and a past year to go back to.
  const showTimeMachine = !showDeath && g.character.alive && !queueBusy && canOfferTimeMachine(g, timeStops)
  const goBackThere = () => {
    if (!target) return
    clearReturnPoint()
    setSheet({ kind: target.sheet, reopen: target })
  }

  const kind = sheet?.kind ?? null
  const reopen = sheet?.reopen
  const spot: MenuSpot | null = reopen ? { path: reopen.path, scrolls: reopen.scrolls } : null

  return (
    <div className="game">
      <Header g={g} onProfile={() => open('profile')} />
      {showDeath ? (
        <div className="game-death">
          <DeathScreen />
        </div>
      ) : (
        <>
          <LifeLog key={g.lifeId} log={g.log} reserveBottom={target !== null || showTimeMachine} />
          <div className={showTimeMachine ? 'return-dock has-tm' : 'return-dock'}>
            {target ? <ReturnChip key={`${target.sheet}:${target.personId ?? ''}`} target={target} onReturn={goBackThere} onDismiss={clearReturnPoint} /> : null}
            {showTimeMachine ? <TimeMachineButton g={g} onOpen={() => setTimeMachineOpen(true)} /> : null}
          </div>
          <BottomBar disabled={queueBusy || !g.character.alive} busy={busy} onOpen={open} onAge={ageUpAction} />
          <StatPanel character={g.character} />
        </>
      )}

      {kind === 'occupation' || kind === 'assets' || kind === 'activities' ? (
        <MenuSheet key={kind} root={MENU_SHEETS[kind]} onClose={close} initial={spot} onLeave={remember(kind)} />
      ) : null}
      {kind === 'relationships' ? (
        <RelationshipsSheet
          onClose={close}
          initial={reopen ? { personId: reopen.personId, spot } : null}
          onLeave={(personId, s) => setReturnPoint({ sheet: 'relationships', personId, path: s.path, scrolls: s.scrolls })}
        />
      ) : null}
      {kind === 'profile' ? <ProfileSheet onClose={close} /> : null}
      {timeMachineOpen && !showDeath ? <TimeMachineSheet g={g} onClose={() => setTimeMachineOpen(false)} /> : null}
      {warp ? <TimeTravelArrival key={warp.id} year={warp.year} age={warp.age} /> : null}

      <ModalHost />
    </div>
  )
}
