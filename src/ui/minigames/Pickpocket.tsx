// Pickpocket: a marker sweeps back and forth along a bar. Stop it inside the green zone to lift
// the wallet without being noticed. Reports 'success' or 'fail' ('cancel' if you walk away).
import { useEffect, useRef, useState } from 'react'
import type { Json } from '../../game/types'
import type { MinigameProps } from './types'

interface PickData {
  target: string
  emoji: string
  speed: number
  zoneStart: number
  zoneWidth: number
}

type Stage = 'ready' | 'moving' | 'success' | 'fail'

function readData(data: Json): PickData {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const n = (v: Json | undefined, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const zoneWidth = Math.min(0.6, Math.max(0.04, n(d.zoneWidth, 0.2)))
  const zoneStart = Math.min(1 - zoneWidth, Math.max(0, n(d.zoneStart, 0.4)))
  return {
    target: typeof d.target === 'string' ? d.target : 'A distracted stranger',
    emoji: typeof d.emoji === 'string' ? d.emoji : '🚶',
    speed: Math.min(3, Math.max(0.3, n(d.speed, 1))),
    zoneStart,
    zoneWidth,
  }
}

/** Triangle wave: position 0-1 after `t` seconds at `speed` sweeps per second, starting at `offset`. */
export function markerPosition(t: number, speed: number, offset = 0): number {
  const phase = (((t * speed + offset) % 2) + 2) % 2
  return phase <= 1 ? phase : 2 - phase
}

export function inZone(pos: number, zoneStart: number, zoneWidth: number): boolean {
  return pos >= zoneStart && pos <= zoneStart + zoneWidth
}

const WIN_LINES = ['Got it! Smooth as silk.', 'Nailed it. They felt nothing.', 'Clean lift!']
const FAIL_LINES = ['Fumbled it! They felt that.', 'Too slow. They turned around!', 'Clumsy! The mark noticed.']

export function Pickpocket({ modal, onDone }: MinigameProps) {
  const [data] = useState(() => readData(modal.data))
  const [stage, setStage] = useState<Stage>('ready')
  const [pos, setPos] = useState(0)
  const posRef = useRef(0)
  const frame = useRef<number | null>(null)
  const startedAt = useRef(0)
  const offset = useRef(0)
  const lineIndex = useRef(0)

  useEffect(() => {
    if (stage !== 'moving') return
    const tick = (now: number) => {
      const p = markerPosition((now - startedAt.current) / 1000, data.speed, offset.current)
      posRef.current = p
      setPos(p)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [stage, data.speed])

  const start = () => {
    if (stage !== 'ready') return
    offset.current = Math.random() * 2
    startedAt.current = performance.now()
    lineIndex.current = Math.floor(Math.random() * 3)
    setStage('moving')
  }

  const grab = () => {
    if (stage !== 'moving') return
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    const p = posRef.current
    setPos(p)
    setStage(inZone(p, data.zoneStart, data.zoneWidth) ? 'success' : 'fail')
  }

  // Space / Enter also grab (or start).
  const actRef = useRef<() => void>(() => {})
  useEffect(() => {
    actRef.current = stage === 'ready' ? start : stage === 'moving' ? grab : () => {}
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      e.preventDefault()
      actRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const finished = stage === 'success' || stage === 'fail'
  const markerColor = finished ? (stage === 'success' ? 'var(--green-dark)' : 'var(--red)') : '#222'

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
        <span style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">
          {stage === 'fail' ? '😠' : data.emoji}
        </span>
        <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">
          {stage === 'success' ? '👛' : stage === 'fail' ? '✋' : '🤏'}
        </span>
      </div>
      <div className="center" style={{ fontWeight: 700 }}>
        {data.target}
      </div>
      <p className="muted center" style={{ margin: 0, fontSize: 13 }}>
        Stop the marker inside the green zone to lift the wallet unnoticed.
      </p>

      <div
        role="meter"
        aria-label="Timing bar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos * 100)}
        onClick={stage === 'moving' ? grab : undefined}
        style={{
          position: 'relative',
          height: 44,
          borderRadius: 12,
          background: 'linear-gradient(90deg, #f28b82, #fbbc04 35%, #fbbc04 65%, #f28b82)',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          cursor: stage === 'moving' ? 'pointer' : 'default',
          touchAction: 'manipulation',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${data.zoneStart * 100}%`,
            width: `${data.zoneWidth * 100}%`,
            background: 'var(--green)',
            boxShadow: '0 0 0 2px rgba(255,255,255,0.7) inset',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -2,
            bottom: -2,
            left: `calc(${pos * 100}% - 3px)`,
            width: 6,
            borderRadius: 3,
            background: markerColor,
            boxShadow: '0 0 6px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      <div
        role="status"
        className="center"
        style={{ minHeight: 24, fontWeight: 900, fontSize: 18, color: stage === 'success' ? 'var(--green)' : stage === 'fail' ? 'var(--red)' : 'var(--muted)' }}
      >
        {stage === 'success' ? WIN_LINES[lineIndex.current] : stage === 'fail' ? FAIL_LINES[lineIndex.current] : stage === 'moving' ? 'Wait for it…' : ''}
      </div>

      {stage === 'ready' ? (
        <>
          <button className="btn btn-primary btn-block" onClick={start} style={{ fontSize: 17 }}>
            🤏 Reach for the wallet
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => onDone('cancel')}>
            Walk away
          </button>
        </>
      ) : stage === 'moving' ? (
        <button className="btn btn-success btn-block" onClick={grab} style={{ fontSize: 18, minHeight: 56 }}>
          ✋ Grab it!
        </button>
      ) : (
        <button className={`btn btn-block ${stage === 'success' ? 'btn-success' : 'btn-danger'}`} onClick={() => onDone(stage)}>
          {stage === 'success' ? 'Walk away casually' : 'Uh oh…'}
        </button>
      )}
    </div>
  )
}
