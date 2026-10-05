// The main game screen: header, life log, bottom bar with the "+ Age" button and the
// stat bars. Menus open as bottom sheets; popups from the queue show above everything.
import { useEffect, useState } from 'react'
import { activitiesMenu, assetsMenu, occupationMenu } from '../../game/menus'
import { BottomBar, type BottomTab } from '../components/BottomBar'
import { Header } from '../components/Header'
import { LifeLog } from '../components/LifeLog'
import { MenuSheet } from '../components/MenuSheet'
import { ModalHost } from '../components/ModalHost'
import { ProfileSheet } from '../components/ProfileSheet'
import { RelationshipsSheet } from '../components/RelationshipsSheet'
import { StatPanel } from '../components/StatPanel'
import { ageUpAction, goTo, useApp } from '../store'
import { DeathScreen } from './DeathScreen'

type OpenSheet = BottomTab | 'profile' | null

export function GameScreen() {
  const g = useApp((s) => s.game)
  const busy = useApp((s) => s.ai !== null)
  const [sheet, setSheet] = useState<OpenSheet>(null)
  const lifeId = g?.lifeId
  const alive = g?.character.alive ?? false

  // A new life (or continuing as your child) starts with everything closed.
  useEffect(() => {
    setSheet(null)
  }, [lifeId])

  // Dying closes the menus (the profile can stay open).
  useEffect(() => {
    if (!alive) setSheet((s) => (s === 'profile' ? s : null))
  }, [alive])

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

  return (
    <div className="game">
      <Header g={g} onProfile={() => setSheet('profile')} />
      {showDeath ? (
        <div className="game-death">
          <DeathScreen />
        </div>
      ) : (
        <>
          <LifeLog key={g.lifeId} log={g.log} />
          <BottomBar disabled={queueBusy || !g.character.alive} busy={busy} onOpen={setSheet} onAge={ageUpAction} />
          <StatPanel character={g.character} />
        </>
      )}

      {sheet === 'occupation' ? <MenuSheet key="occupation" root={occupationMenu} onClose={close} /> : null}
      {sheet === 'assets' ? <MenuSheet key="assets" root={assetsMenu} onClose={close} /> : null}
      {sheet === 'activities' ? <MenuSheet key="activities" root={activitiesMenu} onClose={close} /> : null}
      {sheet === 'relationships' ? <RelationshipsSheet onClose={close} /> : null}
      {sheet === 'profile' ? <ProfileSheet onClose={close} /> : null}

      <ModalHost />
    </div>
  )
}
