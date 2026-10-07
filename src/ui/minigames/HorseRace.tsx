// Horse race: the engine already decided the finishing order (and any fall); this
// animates five horses down the track for ~5 seconds so the predetermined winner
// crosses the line first, then reports 'done'.
import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '../../game/core'
import type { Json } from '../../game/types'
import type { MinigameProps } from './types'

interface HorseData {
  name: string
  color: string
  dot: string
  odds: string
  oddsNum: number
  oddsDen: number
}

interface RaceData {
  horses: HorseData[]
  pick: number
  bet: number
  winner: number
  order: number[]
  dnf: number
  track: string
  race: string
  distance: string
}

const FALLBACK_COLORS = ['#e5413a', '#1d6fd8', '#2fbf5b', '#f2b705', '#8a4fd6']

function readData(data: Json): RaceData {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const n = (v: Json | undefined, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f)
  const s = (v: Json | undefined, f: string) => (typeof v === 'string' ? v : f)
  const horses: HorseData[] = (Array.isArray(d.horses) ? d.horses : []).map((h, i) => {
    const o = h && typeof h === 'object' && !Array.isArray(h) ? h : {}
    return { name: s(o.name, `Horse ${i + 1}`), color: s(o.color, FALLBACK_COLORS[i % 5]), dot: s(o.dot, '🐴'), odds: s(o.odds, ''), oddsNum: n(o.oddsNum, 1), oddsDen: n(o.oddsDen, 1) }
  })
  const count = horses.length
  const rawOrder = Array.isArray(d.order) ? d.order.filter((x): x is number => typeof x === 'number' && x >= 0 && x < count) : []
  const order = rawOrder.length === count ? rawOrder : horses.map((_, i) => i)
  const winner = n(d.winner, order[0] ?? 0)
  // The winner always finishes first, whatever the order array says.
  const fixed = [winner, ...order.filter((i) => i !== winner)]
  return {
    horses,
    pick: n(d.pick, -1),
    bet: n(d.bet, 0),
    winner,
    order: fixed,
    dnf: n(d.dnf, -1),
    track: s(d.track, 'the track'),
    race: s(d.race, 'Race'),
    distance: s(d.distance, ''),
  }
}

interface Plan {
  /** Seconds to reach the line. */
  finish: number
  /** Pace shape: < 1 = fast starter, > 1 = closer. */
  shape: number
  wobble: number
  freq: number
  phase: number
  /** Seconds into the race when this horse falls (DNF), or null. */
  fallAt: number | null
}

const RACE_SECONDS = 4.6

function makePlans(data: RaceData): Plan[] {
  const plans: Plan[] = data.horses.map(() => ({ finish: 99, shape: 1, wobble: 0, freq: 1, phase: 0, fallAt: null }))
  let t = RACE_SECONDS + Math.random() * 0.4
  data.order.forEach((idx, place) => {
    if (place > 0) t += 0.12 + Math.random() * 0.3
    plans[idx] = {
      finish: t,
      // Winners often come from behind, so the race stays exciting.
      shape: place === 0 ? 1.05 + Math.random() * 0.25 : 0.8 + Math.random() * 0.4,
      wobble: 0.02 + Math.random() * 0.03,
      freq: 1.5 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      fallAt: idx === data.dnf ? 1.4 + Math.random() * 1.8 : null,
    }
  })
  return plans
}

function progress(plan: Plan, t: number): number {
  const at = plan.fallAt !== null ? Math.min(t, plan.fallAt) : t
  const p = Math.max(0, Math.min(1, at / plan.finish))
  const wob = plan.wobble * p * Math.sin(Math.PI * p) * Math.sin(2 * Math.PI * plan.freq * p + plan.phase)
  return Math.max(0, Math.min(1, Math.pow(p, plan.shape) + wob))
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

const HORSE_W = 34

export function HorseRace({ modal, onDone }: MinigameProps) {
  const [data] = useState(() => readData(modal.data))
  const [plans] = useState(() => makePlans(data))
  const [stage, setStage] = useState<'countdown' | 'racing' | 'finished'>('countdown')
  const [count, setCount] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)
  const endAt = Math.max(...plans.filter((p) => p.fallAt === null).map((p) => p.finish), 0) + 0.5

  // 3... 2... 1... and they're off!
  useEffect(() => {
    if (stage !== 'countdown') return
    const t = setTimeout(() => {
      if (count > 1) setCount(count - 1)
      else {
        startRef.current = performance.now()
        setStage('racing')
      }
    }, 600)
    return () => clearTimeout(t)
  }, [stage, count])

  useEffect(() => {
    if (stage !== 'racing') return
    let raf = 0
    const tick = (now: number) => {
      const secs = (now - startRef.current) / 1000
      setElapsed(secs)
      if (secs >= endAt) {
        setStage('finished')
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stage, endAt])

  const t = stage === 'countdown' ? 0 : stage === 'finished' ? endAt : elapsed
  const finished = stage === 'finished'
  const placeOf = (idx: number) => data.order.indexOf(idx) + 1
  const crossed = (idx: number) => plans[idx].fallAt === null && t >= plans[idx].finish
  const leader = data.horses.length ? data.horses.map((_, i) => i).sort((a, b) => progress(plans[b], t) - progress(plans[a], t))[0] : -1

  const watching = data.pick < 0 || data.bet <= 0
  const myHorse = data.horses[data.pick]
  const won = !watching && data.pick === data.winner
  const payout = won && myHorse ? Math.round((data.bet * myHorse.oddsNum) / Math.max(1, myHorse.oddsDen)) : 0

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span className="pill">🏁 {data.distance || data.race}</span>
        {watching ? <span className="pill">👀 Just watching</span> : <span className="pill">💵 {formatMoney(data.bet)} on {myHorse?.name ?? 'your horse'}</span>}
      </div>

      <div
        style={{
          position: 'relative',
          borderRadius: 14,
          padding: '8px 0',
          background: 'linear-gradient(180deg, #2f8f3e, #24753a)',
          boxShadow: 'inset 0 0 18px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        {data.horses.map((h, i) => {
          const x = progress(plans[i], t)
          const fell = plans[i].fallAt !== null && t >= (plans[i].fallAt ?? 99)
          const mine = i === data.pick
          const place = placeOf(i)
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                height: 46,
                margin: '3px 8px',
                borderRadius: 8,
                background: 'repeating-linear-gradient(90deg, #a87a4d 0 22px, #9c6f43 22px 44px)',
                outline: mine ? '3px solid #ffd54a' : 'none',
                overflow: 'hidden',
              }}
            >
              {/* Finish line */}
              <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, background: 'repeating-linear-gradient(0deg, #111 0 6px, #fff 6px 12px)', opacity: 0.85 }} />
              {/* Trail in the horse's color */}
              <div style={{ position: 'absolute', left: 0, top: 18, height: 10, borderRadius: 5, width: `calc(${x * 100}% - ${x * HORSE_W}px + ${HORSE_W / 2}px)`, background: h.color, opacity: 0.55 }} />
              <div
                style={{
                  position: 'absolute',
                  left: 6,
                  top: 2,
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.7)',
                  maxWidth: '70%',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {h.dot} {mine ? '⭐ ' : ''}
                {h.name}
                {h.odds ? <span style={{ opacity: 0.8, fontWeight: 600 }}> · {h.odds}</span> : null}
              </div>
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: `calc(${x * 100}% - ${x * HORSE_W}px)`,
                  width: HORSE_W,
                  fontSize: 28,
                  lineHeight: '30px',
                  textAlign: 'center',
                  transform: fell ? 'rotate(90deg) translateX(4px)' : `scaleX(-1) translateY(${stage === 'racing' && !crossed(i) ? Math.abs(Math.sin(t * 14 + i)) * -3 : 0}px)`,
                  transition: fell ? 'transform .25s' : undefined,
                }}
              >
                🏇
              </div>
              {fell ? <div style={{ position: 'absolute', bottom: 4, left: `calc(${x * 100}% - ${x * HORSE_W}px + 30px)`, fontSize: 12, fontWeight: 800, color: '#fff', textShadow: '0 1px 2px #000' }}>💥 DNF</div> : null}
              {crossed(i) || (finished && !fell) ? (
                <div style={{ position: 'absolute', right: 12, top: 2, fontSize: 11, fontWeight: 800, color: place === 1 ? '#ffe082' : '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{place === 1 ? '🏆 1st' : ordinal(place)}</div>
              ) : null}
            </div>
          )
        })}

        {stage === 'countdown' ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 56, fontWeight: 900, color: '#fff', textShadow: '0 3px 10px rgba(0,0,0,0.5)' }}>{count}</div>
          </div>
        ) : null}
      </div>

      {stage === 'racing' && leader >= 0 ? (
        <p className="center muted" style={{ margin: 0, fontWeight: 700 }}>
          {data.horses[leader].dot} {data.horses[leader].name} {t < 1.2 ? 'breaks out of the gate!' : t < 3.2 ? 'is in the lead!' : 'leads down the stretch!'}
        </p>
      ) : stage === 'countdown' ? (
        <p className="center muted" style={{ margin: 0, fontWeight: 700 }}>
          The horses are in the gate at {data.track}…
        </p>
      ) : null}

      {finished ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="card" style={{ padding: 10 }}>
            {data.order.map((idx, place) => (
              <div key={idx} className="row" style={{ justifyContent: 'space-between', padding: '3px 2px', fontWeight: idx === data.pick ? 800 : 500 }}>
                <span>
                  {idx === data.dnf ? 'DNF' : ordinal(place + 1)} · {data.horses[idx].dot} {data.horses[idx].name}
                  {idx === data.pick ? ' ⭐' : ''}
                </span>
                <span className="muted">{data.horses[idx].odds}</span>
              </div>
            ))}
          </div>
          <div
            role="status"
            style={{
              textAlign: 'center',
              fontWeight: 900,
              fontSize: 20,
              color: watching ? 'var(--text)' : won ? 'var(--green)' : 'var(--red)',
            }}
          >
            {watching ? `${data.horses[data.winner]?.name ?? 'A long shot'} wins!` : won ? `You won ${formatMoney(payout)}!` : `You lost ${formatMoney(data.bet)}!`}
          </div>
          <button className="btn btn-primary btn-block" onClick={() => onDone('done')}>
            {won ? 'Collect Winnings' : 'Continue'}
          </button>
        </div>
      ) : (
        <button className="btn btn-block" onClick={() => setStage('finished')} disabled={stage === 'countdown'}>
          Skip to the finish
        </button>
      )}
    </div>
  )
}
