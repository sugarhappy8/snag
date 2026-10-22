// The main game screen: header, life log, bottom bar with the "+ Age" button and the
// stat bars. Menus open as bottom sheets; popups from the queue show above everything.
// After an action closes a sheet, a "↩ Back to <menu>" chip reopens it where you left off.
// Once there's a past year to go back to, a ⏳ button opens the Time Machine.
import { useEffect, useRef, useState } from 'react'
import { FLAGS, flagOn } from '../../game/flags'
import { inboxUnread } from '../../game/inbox'
import type { GameState } from '../../game/types'
import { isModalOpen } from '../a11y/modal'
import type { MenuSpot } from '../components/MenuList'
import { BottomBar, type BottomTab } from '../components/BottomBar'
import { Header } from '../components/Header'
import { InboxSheet } from '../components/InboxSheet'
import { LifeLog } from '../components/LifeLog'
import { MenuSheet } from '../components/MenuSheet'
import { ModalHost } from '../components/ModalHost'
import { ProfileSheet } from '../components/ProfileSheet'
import { RelationshipsSheet } from '../components/RelationshipsSheet'
import { MENU_SHEETS, openingClearsReturn, resolveReturnPoint, ReturnChip, type ResolvedReturn } from '../components/ReturnChip'
import { PaletteGate } from '../nav/lazy'
import { recentFromSpot } from '../nav/place'
import { recordRecent } from '../nav/prefs'
import { placeOfLink, placeToReopen, type OpenablePlace } from '../nav/reopen'
import { SHORTCUTS_OFF, useGlobalShortcuts } from '../nav/shortcuts'
import { StatPanel } from '../components/StatPanel'
import { YearCardInline } from '../components/YearCard'
import { inlineCard } from '../components/yearCardModel'
import { canOfferTimeMachine, TimeMachineButton, TimeMachineSheet, TimeTravelArrival } from '../components/TimeMachine'
import { ageUpAction, clearReturnPoint, goTo, returnChipVisible, returnPointLive, setReturnPoint, useApp, type ReturnSheet } from '../store'
import { DeathScreen } from './DeathScreen'

type SheetKind = BottomTab | 'profile' | 'inbox'

/**
 * The open sheet; `reopen` is set when the "Back to …" chip or the palette opened it. `nonce` counts the places the palette
 * or an inbox link has opened, so a sheet that is already up on that tab starts over at the new place.
 */
export type OpenSheet = { kind: SheetKind; reopen?: ResolvedReturn; nonce?: number } | null

/** The sheet a place opens: its tab, with the spot resolved against the latest state (a vanished group trims to its parent). */
export function placeSheet(g: GameState, p: OpenablePlace, nonce: number): NonNullable<OpenSheet> {
  return { kind: p.tab, reopen: placeToReopen(g, p), nonce }
}

/** The sheet an inbox link opens, or null when the link is not a place. */
export function linkSheet(g: GameState, link: string, nonce: number): NonNullable<OpenSheet> | null {
  const place = placeOfLink(link)
  return place === null ? null : placeSheet(g, place, nonce)
}

/**
 * What leaving a sheet remembers: the spot for the "Back to" chip, and (G.9) the same place as a recent. The chip goes
 * when it is dismissed or the year turns; the recent stays, which is how the chip's place "becomes the newest recent".
 */
export function rememberSpot(g: GameState, kind: ReturnSheet, spot: MenuSpot): void {
  setReturnPoint({ sheet: kind, path: spot.path, scrolls: spot.scrolls })
  recordRecent(g.lifeId, recentFromSpot(kind, spot))
}

export interface GameScreenProps {
  /** Test seam: start with this sheet open. Nothing in the app passes it. */
  initialSheet?: OpenSheet
}

export function GameScreen({ initialSheet }: GameScreenProps) {
  const g = useApp((s) => s.game)
  const returnPoint = useApp((s) => s.returnPoint)
  const timeStops = useApp((s) => s.timeStops)
  const arrived = useApp((s) => s.timeTravel?.arrived ?? null)
  const [sheet, setSheet] = useState<OpenSheet>(initialSheet ?? null)
  const [timeMachineOpen, setTimeMachineOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const [warp, setWarp] = useState<{ id: number; year: number; age: number } | null>(null)
  const seenArrival = useRef(arrived?.id ?? 0)
  const lifeId = g?.lifeId
  const alive = g?.character.alive ?? false

  // A new life (or continuing as your child) starts with everything closed.
  useEffect(() => {
    setSheet(null)
    setTimeMachineOpen(false)
    setPalette(false)
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

  // The palette goes with the menus when the life ends.
  useEffect(() => {
    if (!alive) setPalette(false)
  }, [alive])

  // A birthday, death or another life makes the remembered menu stale.
  useEffect(() => {
    if (returnPoint && !returnPointLive(returnPoint, g)) clearReturnPoint()
  }, [returnPoint, g])

  const close = () => setSheet(null)
  // Opening a menu yourself means you've moved on from the old spot (a profile or inbox peek doesn't).
  const open = (kind: SheetKind) => {
    if (openingClearsReturn(kind)) clearReturnPoint()
    setSheet({ kind })
  }

  // The keyboard (G.9). The hook has to run before the early return below, so the numbers come from `g?`; GameScreen
  // fills the context from its own state and from the open dialogs, and the listener reads the focused element itself.
  const waiting = (g?.queue.length ?? 0) > 0
  useGlobalShortcuts(
    FLAGS.navPalette
      ? {
          typing: false,
          queueBusy: waiting,
          dead: !alive,
          sheetOpen: sheet !== null || timeMachineOpen || isModalOpen(),
          paletteOpen: palette,
          popupOpen: waiting || isModalOpen(),
        }
      : SHORTCUTS_OFF,
    (action) => {
      if (action.type === 'palette') setPalette(true)
      else if (action.type === 'tab') open(action.tab)
      else ageUpAction()
    },
  )

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
  // What the palette and an inbox link open: any sheet that is up gives way, and the Back to chip is spent.
  const nextNonce = (sheet?.nonce ?? 0) + 1
  const openPlace = (p: OpenablePlace) => {
    clearReturnPoint()
    setSheet(placeSheet(g, p, nextNonce))
  }
  const openLink = (link: string) => {
    const next = linkSheet(g, link, nextNonce)
    if (next === null) {
      close()
      return
    }
    clearReturnPoint()
    setSheet(next)
  }
  const remember = (kind: ReturnSheet) => (spot: MenuSpot) => rememberSpot(g, kind, spot)

  const target = !sheet && !showDeath && returnChipVisible(returnPoint, g) ? resolveReturnPoint(g, returnPoint) : null
  // The ⏳ button: alive, nothing on screen, and a past year to go back to.
  const showTimeMachine = !showDeath && g.character.alive && !queueBusy && canOfferTimeMachine(g, timeStops)
  const goBackThere = () => {
    if (!target) return
    clearReturnPoint()
    setSheet({ kind: target.sheet, reopen: target })
  }

  // The year card of a year whose popup has been shown ten times (R3-Q6). It is a block of the feed, right above the newest year, and goes
  // with the year: the feed scrolls with it, so it never shares the screen's height with the log (LifeLog.tsx, the lead slot).
  const yearCard = <YearCardInline card={inlineCard(g.flags.yearBook, g.year)} />

  const kind = sheet?.kind ?? null
  const reopen = sheet?.reopen
  const sheetKey = `${kind}:${sheet?.nonce ?? 0}`
  const canSearch = FLAGS.navPalette && g.character.alive && !queueBusy
  const spot: MenuSpot | null = reopen ? { path: reopen.path, scrolls: reopen.scrolls } : null

  return (
    <div className="game">
      <Header
        g={g}
        onProfile={() => open('profile')}
        onSearch={canSearch ? () => setPalette(true) : undefined}
        inbox={flagOn('quietInbox') ? { count: inboxUnread(g), onOpen: () => open('inbox') } : undefined}
      />
      {showDeath ? (
        <div className="game-death">
          <DeathScreen />
        </div>
      ) : (
        <>
          <LifeLog key={g.lifeId} log={g.log} reserveBottom={target !== null || showTimeMachine} lead={yearCard} leadKey={g.year} />
          <div className={showTimeMachine ? 'return-dock has-tm' : 'return-dock'}>
            {target ? <ReturnChip key={`${target.sheet}:${target.personId ?? ''}`} target={target} onReturn={goBackThere} onDismiss={clearReturnPoint} /> : null}
            {showTimeMachine ? <TimeMachineButton g={g} onOpen={() => setTimeMachineOpen(true)} /> : null}
          </div>
          <BottomBar disabled={queueBusy || !g.character.alive} onOpen={open} onAge={ageUpAction} />
          <StatPanel character={g.character} />
        </>
      )}

      {kind === 'occupation' || kind === 'assets' || kind === 'activities' ? (
        <MenuSheet key={sheetKey} root={MENU_SHEETS[kind]} onClose={close} initial={spot} onLeave={remember(kind)} />
      ) : null}
      {kind === 'relationships' ? (
        <RelationshipsSheet
          key={sheetKey}
          onClose={close}
          initial={reopen ? { personId: reopen.personId, spot } : null}
          onLeave={(personId, s) => setReturnPoint({ sheet: 'relationships', personId, path: s.path, scrolls: s.scrolls })}
        />
      ) : null}
      {kind === 'profile' ? <ProfileSheet onClose={close} /> : null}
      {kind === 'inbox' ? <InboxSheet onClose={close} onOpenLink={openLink} /> : null}
      {timeMachineOpen && !showDeath ? <TimeMachineSheet g={g} onClose={() => setTimeMachineOpen(false)} /> : null}
      {warp ? <TimeTravelArrival key={warp.id} year={warp.year} age={warp.age} /> : null}
      {palette ? <PaletteGate g={g} onClose={() => setPalette(false)} onOpenPlace={openPlace} /> : null}

      <ModalHost />
    </div>
  )
}
