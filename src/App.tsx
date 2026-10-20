// App shell: routes between screens. Everything runs on the device: there is no setup step and
// nothing to connect to, so the main menu is the first thing a player sees.
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { prefetchLazyViews } from './ui/lazy/lazyView'
import { GameScreen } from './ui/screens/GameScreen'
import { GraveyardScreen } from './ui/screens/GraveyardScreen'
import { HomeScreen } from './ui/screens/HomeScreen'
import { NewLifeScreen } from './ui/screens/NewLifeScreen'
import { RibbonsScreen } from './ui/screens/RibbonsScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { getApp, goTo, hasSavedGame, retrySave, useApp, type Screen } from './ui/store'

let started = false

/** One-time startup work (guarded so React StrictMode's double effects don't repeat it). */
function startup(): void {
  if (started) return
  started = true
  // A saved life is offered as "Continue" on the home screen rather than auto-resumed.
  if (hasSavedGame() && getApp().screen !== 'home') goTo('home')
  // Fetch the lazy views (charts, search) while the browser is idle, so the first open is usually instant.
  prefetchLazyViews()
}

export function App() {
  const screen: Screen = useApp((s) => s.screen)
  const hasGame = useApp((s) => s.game !== null)
  const saveError = useApp((s) => s.saveError)

  useEffect(() => {
    if (!saveError) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveError])

  useEffect(() => {
    startup()
  }, [])

  // Scroll page-style screens back to the top when switching screens.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  return (
    <div className="app">
      {saveError && <aside className="save-warning" role="alert" data-modal-exempt>
        <p>Progress isn’t saved. Keep this tab open. Free some browser storage or allow site storage, then retry.</p>
        <button className="btn" onClick={retrySave}>Retry save</button>
      </aside>}
      <ErrorBoundary screen={screen}>{renderScreen(screen, hasGame)}</ErrorBoundary>
    </div>
  )
}

function renderScreen(screen: Screen, hasGame: boolean): ReactNode {
  switch (screen) {
    case 'home':
      return <HomeScreen />
    case 'newLife':
      return <NewLifeScreen />
    case 'game':
      return hasGame ? <GameScreen /> : <HomeScreen />
    case 'settings':
      return <SettingsScreen />
    case 'ribbons':
      return <RibbonsScreen />
    case 'graveyard':
      return <GraveyardScreen />
    default:
      return <HomeScreen />
  }
}

interface BoundaryProps {
  screen: Screen
  children: ReactNode
}

interface BoundaryState {
  error: Error | null
  screen: Screen
}

/** Catches render errors so one broken menu doesn't blank the whole game. */
class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, screen: this.props.screen }

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    // Navigating to another screen clears the error.
    if (props.screen !== state.screen) return { screen: props.screen, error: null }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('AnotherLife crashed while rendering:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash">
        <div style={{ fontSize: 56 }}>🫠</div>
        <h2>Well, that wasn't supposed to happen.</h2>
        <p className="muted">Something broke while drawing this screen. Try again or head back to the main menu. Keep this tab open if a save warning is showing.</p>
        <pre>{error.message}</pre>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button
            className="btn"
            onClick={() => {
              this.setState({ error: null })
              goTo('home')
            }}
          >
            Main menu
          </button>
        </div>
      </div>
    )
  }
}
