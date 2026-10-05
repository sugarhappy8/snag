// Prison escape: the engine-made tile maze (always solvable). Each step you take, every guard
// takes two steps toward you (horizontal first, blocked by walls). Reach the open gate to escape;
// share a tile with a guard and you're caught. Arrow keys / WASD, the D-pad, or swipe the board.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import { playerMove, type EscapeDir, type EscapeMaze, type MazePoint } from '../../game/prison'
import type { Json } from '../../game/types'
import type { MinigameProps } from './types'

type Stage = 'play' | 'escaped' | 'caught'

function isObj(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readPoint(v: Json | undefined, w: number, h: number): MazePoint | null {
  if (!isObj(v)) return null
  const x = v.x
  const y = v.y
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) return null
  return { x, y }
}

/** Validate the engine's maze (never trust saved JSON blindly). */
export function readEscapeMaze(data: Json): EscapeMaze | null {
  if (!isObj(data)) return null
  const w = data.w
  const h = data.h
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isInteger(w) || !Number.isInteger(h)) return null
  if (w < 2 || h < 2 || w > 15 || h > 15) return null
  const rawWalls = data.walls
  if (!Array.isArray(rawWalls) || rawWalls.length !== w * h) return null
  const walls = rawWalls.map((n) => (typeof n === 'number' ? n & 3 : 0))
  const exit = readPoint(data.exit, w, h)
  const player = readPoint(data.player, w, h)
  if (!exit || !player || (exit.x === player.x && exit.y === player.y)) return null
  const guards = (Array.isArray(data.guards) ? data.guards : []).map((q) => readPoint(q, w, h)).filter((q): q is MazePoint => q !== null)
  const speed = typeof data.guardSpeed === 'number' ? Math.round(data.guardSpeed) : 2
  const security = data.security === 'minimum' || data.security === 'medium' || data.security === 'maximum' ? data.security : 'medium'
  return {
    w,
    h,
    walls,
    exit,
    player,
    guards,
    guardSpeed: Math.min(3, Math.max(1, speed)),
    minMoves: typeof data.minMoves === 'number' ? data.minMoves : 0,
    prison: typeof data.prison === 'string' ? data.prison : 'Prison',
    security,
  }
}

/** Which border the exit gate opens through. */
function exitSide(m: EscapeMaze): EscapeDir {
  if (m.exit.y === 0) return 'N'
  if (m.exit.y === m.h - 1) return 'S'
  if (m.exit.x === 0) return 'W'
  return 'E'
}

const KEY_DIRS: Record<string, EscapeDir> = {
  ArrowUp: 'N',
  ArrowDown: 'S',
  ArrowLeft: 'W',
  ArrowRight: 'E',
  w: 'N',
  W: 'N',
  s: 'S',
  S: 'S',
  a: 'W',
  A: 'W',
  d: 'E',
  D: 'E',
}

const STEP_MS = 190
const BUMPS = ['Bonk. That\'s a wall.', 'Solid concrete. Try another way.', 'You can\'t walk through walls. Yet.']
const SECURITY_LABEL = { minimum: 'Minimum security', medium: 'Medium security', maximum: 'Maximum security' } as const

const WALL = '#1f232b'
const FLOOR_A = '#c9c4b8'
const FLOOR_B = '#bfb9ac'
const GATE = '#2fbf5b'
const BORDER = 5

export function PrisonEscape({ modal, onDone }: MinigameProps) {
  const [maze] = useState(() => readEscapeMaze(modal.data))
  const [player, setPlayer] = useState<MazePoint>(() => maze?.player ?? { x: 0, y: 0 })
  const [guards, setGuards] = useState<MazePoint[]>(() => maze?.guards ?? [])
  const [moves, setMoves] = useState(0)
  const [stage, setStage] = useState<Stage>('play')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const timers = useRef<number[]>([])
  const touch = useRef<{ x: number; y: number } | null>(null)
  const bumps = useRef(0)

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t)
      timers.current = []
    },
    [],
  )

  const move = useCallback(
    (d: EscapeDir) => {
      if (!maze || stage !== 'play' || busy) return
      const res = playerMove(maze, player, guards, d)
      if (res.result === 'blocked') {
        setMessage(BUMPS[bumps.current++ % BUMPS.length])
        return
      }
      setMessage(null)
      setMoves((n) => n + 1)
      setPlayer(res.player)
      if (res.result === 'escaped') {
        setStage('escaped')
        return
      }
      if (res.result === 'caught' && res.frames.length === 0) {
        setStage('caught')
        return
      }
      // Animate the guards one step at a time.
      setBusy(true)
      res.frames.forEach((frame, i) => {
        timers.current.push(window.setTimeout(() => setGuards(frame), STEP_MS * (i + 1)))
      })
      timers.current.push(
        window.setTimeout(() => {
          setBusy(false)
          if (res.result === 'caught') setStage('caught')
        }, STEP_MS * res.frames.length + 60),
      )
    },
    [maze, stage, busy, player, guards],
  )

  // Keyboard controls (always call the latest `move`).
  const moveRef = useRef(move)
  useEffect(() => {
    moveRef.current = move
  }, [move])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = KEY_DIRS[e.key]
      if (!d) return
      e.preventDefault()
      moveRef.current(d)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!maze) {
    return (
      <div className="stack center" style={{ gap: 12 }}>
        <p className="popup-text">The guards changed shifts before you could make your move. Maybe another time.</p>
        <button className="btn btn-primary btn-block" onClick={() => onDone('quit')}>
          Back to my cell
        </button>
      </div>
    )
  }

  const onTouchStart = (e: ReactTouchEvent) => {
    const t = e.touches[0]
    if (t) touch.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touch.current
    touch.current = null
    const t = e.changedTouches[0]
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N')
  }

  const { w, h } = maze
  const cw = 100 / w
  const ch = 100 / h
  const side = exitSide(maze)
  const caughtHere = stage === 'caught'
  const pieceFont = `min(${Math.round(250 / w)}px, ${Math.round(62 / w)}vw)`

  const wallBars: { key: string; left: string; top: string; width: string; height: string }[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bits = maze.walls[y * w + x]
      if (bits & 1 && x + 1 < w) {
        wallBars.push({ key: `e${x}-${y}`, left: `calc(${(x + 1) * cw}% - 3px)`, top: `calc(${y * ch}% - 3px)`, width: '6px', height: `calc(${ch}% + 6px)` })
      }
      if (bits & 2 && y + 1 < h) {
        wallBars.push({ key: `s${x}-${y}`, left: `calc(${x * cw}% - 3px)`, top: `calc(${(y + 1) * ch}% - 3px)`, width: `calc(${cw}% + 6px)`, height: '6px' })
      }
    }
  }

  // The open gate in the outer wall.
  const gate =
    side === 'N'
      ? { left: `${maze.exit.x * cw}%`, top: `-${BORDER}px`, width: `${cw}%`, height: `${BORDER}px` }
      : side === 'S'
        ? { left: `${maze.exit.x * cw}%`, top: '100%', width: `${cw}%`, height: `${BORDER}px` }
        : side === 'W'
          ? { left: `-${BORDER}px`, top: `${maze.exit.y * ch}%`, width: `${BORDER}px`, height: `${ch}%` }
          : { left: '100%', top: `${maze.exit.y * ch}%`, width: `${BORDER}px`, height: `${ch}%` }

  const piece = (p: MazePoint) => ({
    position: 'absolute' as const,
    left: `${p.x * cw}%`,
    top: `${p.y * ch}%`,
    width: `${cw}%`,
    height: `${ch}%`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: pieceFont,
    lineHeight: 1,
    transition: `left ${STEP_MS - 30}ms ease-out, top ${STEP_MS - 30}ms ease-out`,
    pointerEvents: 'none' as const,
  })

  const status =
    stage === 'escaped'
      ? 'You made it to the gate!'
      : stage === 'caught'
        ? 'A guard grabbed you!'
        : message ?? (moves === 0 ? 'Get to the open gate. Guards take two steps for every step you take.' : busy ? 'The guards are moving…' : 'Your move.')

  const padBtn = (d: EscapeDir, label: string, aria: string) => (
    <button
      className="btn"
      aria-label={aria}
      onClick={() => move(d)}
      disabled={stage !== 'play' || busy}
      style={{ width: 58, height: 52, padding: 0, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {label}
    </button>
  )

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
        <span className="pill">🏛️ {SECURITY_LABEL[maze.security]}</span>
        <span className="pill">👮 ×{maze.guards.length}</span>
        <span className="pill">👣 {moves}</span>
      </div>

      <div
        style={{
          width: `min(100%, ${Math.min(370, w * 52 + BORDER * 2)}px)`,
          margin: '0 auto',
          padding: BORDER,
          boxSizing: 'border-box',
          background: WALL,
          borderRadius: 6,
          boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
        }}
      >
        <div
          role="application"
          aria-label={`Prison escape maze, ${w} by ${h}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: `${w} / ${h}`,
            background: FLOOR_A,
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          {/* Floor tiles */}
          {Array.from({ length: w * h }, (_, i) => {
            const x = i % w
            const y = Math.floor(i / w)
            const isExit = x === maze.exit.x && y === maze.exit.y
            return (
              <div
                key={`f${i}`}
                style={{
                  position: 'absolute',
                  left: `${x * cw}%`,
                  top: `${y * ch}%`,
                  width: `${cw}%`,
                  height: `${ch}%`,
                  background: isExit ? 'rgba(47,191,91,0.35)' : (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B,
                }}
              />
            )
          })}

          {/* Exit gate */}
          <div style={{ position: 'absolute', ...gate, background: GATE, boxShadow: `0 0 10px ${GATE}` }} />
          <div style={{ ...piece(maze.exit), opacity: stage === 'escaped' ? 0 : 0.9 }}>🚪</div>

          {/* Inner walls */}
          {wallBars.map((b) => (
            <div key={b.key} style={{ position: 'absolute', left: b.left, top: b.top, width: b.width, height: b.height, background: WALL, borderRadius: 3 }} />
          ))}

          {/* Guards and the player */}
          {guards.map((q, i) => (
            <div key={`g${i}`} style={piece(q)} aria-label="guard">
              👮
            </div>
          ))}
          <div style={{ ...piece(player), filter: caughtHere ? 'grayscale(0.6)' : 'none' }} aria-label="you">
            {stage === 'escaped' ? '🎉' : caughtHere ? '🚨' : '🏃'}
          </div>
        </div>
      </div>

      <div
        role="status"
        className="center"
        style={{
          minHeight: 22,
          fontWeight: stage === 'play' ? 600 : 900,
          fontSize: stage === 'play' ? 14 : 18,
          color: stage === 'escaped' ? 'var(--green)' : stage === 'caught' ? 'var(--red)' : message ? 'var(--orange)' : 'var(--muted)',
        }}
      >
        {status}
      </div>

      {stage === 'play' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 58px)', gridTemplateRows: 'repeat(3, 52px)', gap: 6, justifyContent: 'center' }}>
            <span />
            {padBtn('N', '▲', 'Move up')}
            <span />
            {padBtn('W', '◀', 'Move left')}
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }} aria-hidden="true">
              🧭
            </span>
            {padBtn('E', '▶', 'Move right')}
            <span />
            {padBtn('S', '▼', 'Move down')}
            <span />
          </div>
          {moves === 0 ? (
            <button className="btn btn-ghost btn-block" onClick={() => onDone('quit')}>
              Lose my nerve and stay put
            </button>
          ) : (
            <button className="btn btn-ghost btn-block" onClick={() => onDone('caught')} disabled={busy}>
              Surrender to the guards
            </button>
          )}
        </>
      ) : stage === 'escaped' ? (
        <button className="btn btn-success btn-block" onClick={() => onDone('escaped')} style={{ fontSize: 17 }}>
          🏃 Run for it!
        </button>
      ) : (
        <button className="btn btn-danger btn-block" onClick={() => onDone('caught')} style={{ fontSize: 17 }}>
          Face the music
        </button>
      )}
    </div>
  )
}
