// App shell: routes between screens and checks the LM Studio connection once at startup.
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { GameScreen } from './ui/screens/GameScreen'
import { GraveyardScreen } from './ui/screens/GraveyardScreen'
import { HomeScreen } from './ui/screens/HomeScreen'
import { NewLifeScreen } from './ui/screens/NewLifeScreen'
import { RibbonsScreen } from './ui/screens/RibbonsScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { checkAi, getApp, goTo, hasSavedGame, useApp, type Screen } from './ui/store'

let started = false

/** One-time startup work (guarded so React StrictMode's double effects don't repeat it). */
function startup(): void {
  if (started) return
  started = true
  // A saved life is offered as "Continue" on the home screen rather than auto-resumed.
  if (hasSavedGame() && getApp().screen !== 'home') goTo('home')
  void checkAi()
}

export function App() {
  const screen = useApp((s) => s.screen)
  const hasGame = useApp((s) => s.game !== null)

  useEffect(() => {
    startup()
  }, [])

  // Scroll page-style screens back to the top when switching screens.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  return (
    <div className="app">
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
        <p className="muted">Something broke while drawing this screen. Your life is saved — try again or head back to the main menu.</p>
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
