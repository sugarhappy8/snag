// Slot machine: the engine already picked the three reel symbols; pull the lever to watch
// the reels spin and land on them one by one, then report 'done'.
import { useEffect, useRef, useState } from 'react'
import type { Json } from '../../game/types'
import type { MinigameProps } from './types'

interface SlotData {
  bet: number
  reels: string[]
  payout: number
  symbols: string[]
  paytable: { emoji: string; three: number; two: number }[]
  mixedPrecious: number
}

function readData(data: Json): SlotData {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const strs = (v: Json | undefined) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const symbols = strs(d.symbols)
  const reels = strs(d.reels)
  const paytable = (Array.isArray(d.paytable) ? d.paytable : []).flatMap((p) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return []
    return [{ emoji: typeof p.emoji === 'string' ? p.emoji : '?', three: typeof p.three === 'number' ? p.three : 0, two: typeof p.two === 'number' ? p.two : 0 }]
  })
  return {
    bet: typeof d.bet === 'number' ? d.bet : 0,
    reels: reels.length === 3 ? reels : ['🍋', '🍉', '🍇'],
    payout: typeof d.payout === 'number' ? d.payout : 0,
    symbols: symbols.length ? symbols : ['⭐', '💎', '🪙', '🍇', '🍉', '🍋'],
    paytable,
    mixedPrecious: typeof d.mixedPrecious === 'number' ? d.mixedPrecious : 0,
  }
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

const STOP_MS = [1100, 1700, 2300]

function randomSymbol(symbols: string[]): string {
  return symbols[Math.floor(Math.random() * symbols.length)]
}

export function Slots({ modal, onDone }: MinigameProps) {
  const [data] = useState(() => readData(modal.data))
  const [stage, setStage] = useState<'ready' | 'spinning' | 'done'>('ready')
  const [display, setDisplay] = useState<string[][]>(() =>
    [0, 1, 2].map(() => [randomSymbol(data.symbols), randomSymbol(data.symbols), randomSymbol(data.symbols)]),
  )
  const [stopped, setStopped] = useState<boolean[]>([false, false, false])
  const timers = useRef<number[]>([])

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t)
      timers.current = []
    },
    [],
  )

  useEffect(() => {
    if (stage !== 'spinning') return
    const interval = window.setInterval(() => {
      setDisplay((prev) => prev.map((col, i) => (stopped[i] ? col : [randomSymbol(data.symbols), randomSymbol(data.symbols), randomSymbol(data.symbols)])))
    }, 70)
    return () => clearInterval(interval)
  }, [stage, stopped, data.symbols])

  const spin = () => {
    if (stage !== 'ready') return
    setStage('spinning')
    STOP_MS.forEach((ms, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setStopped((s) => s.map((v, j) => (j === i ? true : v)))
          setDisplay((prev) => prev.map((col, j) => (j === i ? [randomSymbol(data.symbols), data.reels[i], randomSymbol(data.symbols)] : col)))
          if (i === STOP_MS.length - 1) setStage('done')
        }, ms),
      )
    })
  }

  const win = Math.round(data.bet * data.payout)
  const net = win - data.bet
  const done = stage === 'done'

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'center' }}>
        <span className="pill">💵 Bet {formatMoney(data.bet)}</span>
      </div>

      <div
        style={{
          background: 'linear-gradient(180deg, #c62828, #8e1b1b)',
          borderRadius: 20,
          padding: 12,
          border: '4px solid #f7c51e',
          boxShadow: '0 6px 18px rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.25)',
        }}
      >
        <div style={{ textAlign: 'center', color: '#ffe082', fontWeight: 900, letterSpacing: 2, fontSize: 14, marginBottom: 8, textShadow: '0 2px 0 rgba(0,0,0,0.3)' }}>
          {done && data.payout >= 20 ? '★ JACKPOT ★' : '★ LUCKY STARS ★'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, background: '#2b0d0d', padding: 8, borderRadius: 12, position: 'relative' }}>
          {display.map((col, i) => (
            <div
              key={i}
              style={{
                background: 'linear-gradient(180deg, #d9d9d9 0%, #fff 30%, #fff 70%, #d9d9d9 100%)',
                borderRadius: 8,
                height: 150,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-around',
                overflow: 'hidden',
                filter: stage === 'spinning' && !stopped[i] ? 'blur(1.5px)' : 'none',
              }}
            >
              {col.map((sym, r) => (
                <div key={r} style={{ fontSize: r === 1 ? 42 : 26, opacity: r === 1 ? 1 : 0.45, lineHeight: 1, transform: stage === 'spinning' && !stopped[i] ? `translateY(${r === 1 ? 4 : -4}px)` : 'none' }}>
                  {sym}
                </div>
              ))}
            </div>
          ))}
          {/* Pay line */}
          <div style={{ position: 'absolute', left: 4, right: 4, top: '50%', height: 3, marginTop: -1, background: done && data.payout > 0 ? '#ffd54a' : 'rgba(255,213,74,0.45)', borderRadius: 2, pointerEvents: 'none', boxShadow: done && data.payout > 0 ? '0 0 10px #ffd54a' : 'none' }} />
        </div>
      </div>

      {done ? (
        <div role="status" className="center" style={{ fontWeight: 900, fontSize: 20, color: net > 0 ? 'var(--green)' : net === 0 ? 'var(--text)' : 'var(--red)' }}>
          {net > 0 ? `You won ${formatMoney(win)}!` : net === 0 ? 'You got your bet back.' : `No luck. You lost ${formatMoney(data.bet)}.`}
        </div>
      ) : null}

      {stage === 'ready' ? (
        <button className="btn btn-danger btn-block" onClick={spin} style={{ fontSize: 17 }}>
          🎰 Pull the Lever
        </button>
      ) : done ? (
        <button className="btn btn-primary btn-block" onClick={() => onDone('done')}>
          {net > 0 ? 'Collect Winnings' : 'Continue'}
        </button>
      ) : (
        <button className="btn btn-block" disabled>
          Spinning…
        </button>
      )}

      {data.paytable.length ? (
        <details className="muted" style={{ fontSize: 13 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Paytable (× your bet)</summary>
          <div className="grid-2" style={{ marginTop: 6, gap: 4 }}>
            {data.paytable.map((p) => (
              <div key={p.emoji}>
                {p.emoji}
                {p.emoji}
                {p.emoji} ×{p.three}
                {p.two ? ` · ${p.emoji}${p.emoji} ×${p.two}` : ''}
              </div>
            ))}
            {data.mixedPrecious ? <div>Any 3 of ⭐💎🪙 ×{data.mixedPrecious}</div> : null}
          </div>
        </details>
      ) : null}
    </div>
  )
}
