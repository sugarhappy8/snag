// Burglary: the engine generated the house (floor plan, loot, owner, dog, alarm and pre-rolled
// luck). Tap rooms to search them; every search makes more noise, and rooms with the sleeping
// owner or the dog are extra risky. Leave whenever you like. Reports JSON
// {"loot": number, "caught": boolean, "rooms": string[], "by"?: "owner" | "dog" | "alarm"}.
import { useEffect, useRef, useState } from 'react'
import { burglaryCatcher, burglaryRisk, type BurglaryData, type BurglaryLoot, type BurglaryRoom } from '../../game/crime'
import type { Json } from '../../game/types'
import type { MinigameProps } from './types'

type Stage = 'sneak' | 'searching' | 'caught'
type Catcher = 'owner' | 'dog' | 'alarm'

function isObj(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function numOr(v: Json | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function readLoot(v: Json): BurglaryLoot | null {
  if (!isObj(v) || typeof v.name !== 'string') return null
  return { name: v.name, emoji: typeof v.emoji === 'string' ? v.emoji : '📦', value: Math.max(0, Math.round(numOr(v.value, 0))) }
}

function readRoom(v: Json, i: number): BurglaryRoom | null {
  if (!isObj(v) || typeof v.name !== 'string') return null
  return {
    id: typeof v.id === 'string' ? v.id : `r${i}`,
    name: v.name,
    emoji: typeof v.emoji === 'string' ? v.emoji : '🚪',
    x: Math.max(0, Math.round(numOr(v.x, 0))),
    y: Math.max(0, Math.round(numOr(v.y, i))),
    w: Math.max(1, Math.round(numOr(v.w, 1))),
    h: Math.max(1, Math.round(numOr(v.h, 1))),
    loot: (Array.isArray(v.loot) ? v.loot : []).map(readLoot).filter((x): x is BurglaryLoot => x !== null),
    hazard: v.hazard === 'owner' || v.hazard === 'dog' ? v.hazard : null,
  }
}

/** Validate the engine's house (saved JSON could be stale or hand-edited). */
export function readBurglaryHouse(data: Json): BurglaryData | null {
  if (!isObj(data) || !Array.isArray(data.rooms)) return null
  const rooms = data.rooms.map(readRoom).filter((r): r is BurglaryRoom => r !== null)
  if (rooms.length === 0) return null
  const cols = Math.max(1, Math.round(numOr(data.cols, Math.max(...rooms.map((r) => r.x + r.w)))))
  const rows = Math.max(1, Math.round(numOr(data.rows, Math.max(...rooms.map((r) => r.y + r.h)))))
  return {
    house: typeof data.house === 'string' ? data.house : 'a quiet house',
    tier: Math.min(3, Math.max(1, Math.round(numOr(data.tier, 1)))),
    owner: typeof data.owner === 'string' ? data.owner : 'The homeowner',
    ownerHome: data.ownerHome === true,
    dog: typeof data.dog === 'string' ? data.dog : null,
    alarm: data.alarm === true,
    cols,
    rows,
    rooms,
    baseRisk: Math.min(0.9, Math.max(0, numOr(data.baseRisk, 0.06))),
    riskStep: Math.min(0.5, Math.max(0, numOr(data.riskStep, 0.05))),
    rolls: (Array.isArray(data.rolls) ? data.rolls : []).map((r) => numOr(r, 0.5)),
  }
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const NOTHING = [
  'Nothing worth taking.',
  'Just dust bunnies.',
  'A sad, empty room.',
  'Only coupons and lint.',
  'Nothing but regrets.',
]

const SEARCH_MS = 650

export function Burglary({ modal, onDone }: MinigameProps) {
  const [house] = useState(() => readBurglaryHouse(modal.data))
  const [searched, setSearched] = useState<string[]>([])
  const [found, setFound] = useState<BurglaryLoot[]>([])
  const [stage, setStage] = useState<Stage>('sneak')
  const [active, setActive] = useState<string | null>(null)
  const [catcher, setCatcher] = useState<Catcher | null>(null)
  const [lastFind, setLastFind] = useState<string | null>(null)
  const timers = useRef<number[]>([])

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t)
      timers.current = []
    },
    [],
  )

  if (!house) {
    return (
      <div className="stack center" style={{ gap: 12 }}>
        <p className="popup-text">You got to the house, but the lights were on and a party was going. Not tonight.</p>
        <button className="btn btn-primary btn-block" onClick={() => onDone(JSON.stringify({ loot: 0, caught: false, rooms: [] }))}>
          Walk away
        </button>
      </div>
    )
  }

  const total = found.reduce((s, it) => s + it.value, 0)
  const noise = Math.min(0.95, house.baseRisk + searched.length * house.riskStep)
  const noiseColor = noise < 0.2 ? 'var(--green)' : noise < 0.4 ? 'var(--yellow)' : noise < 0.6 ? 'var(--orange)' : 'var(--red)'

  const report = (caught: boolean, by?: Catcher) => {
    const payload: { loot: number; caught: boolean; rooms: string[]; by?: Catcher } = { loot: total, caught, rooms: searched }
    if (by) payload.by = by
    onDone(JSON.stringify(payload))
  }

  const search = (room: BurglaryRoom) => {
    if (stage !== 'sneak' || searched.includes(room.id)) return
    const k = searched.length
    const risk = burglaryRisk(house, k, room)
    const roll = house.rolls[k] ?? 0.5
    setActive(room.id)
    setStage('searching')
    setLastFind(null)
    timers.current.push(
      window.setTimeout(() => {
        setActive(null)
        setSearched((s) => [...s, room.id])
        if (roll < risk) {
          setCatcher(burglaryCatcher(house, room))
          setStage('caught')
          return
        }
        setFound((f) => [...f, ...room.loot])
        setLastFind(
          room.loot.length
            ? `${room.name}: found ${room.loot.map((it) => `${it.emoji} ${it.name.toLowerCase()}`).join(' and ')}!`
            : `${room.name}: ${NOTHING[(k + room.name.length) % NOTHING.length]}`,
        )
        setStage('sneak')
      }, SEARCH_MS),
    )
  }

  const hints: string[] = []
  if (house.alarm) hints.push('🚨 A keypad by the door is blinking red.')
  if (house.dog) hints.push(`🐕 A dog bowl by the door says "${house.dog}".`)
  if (house.ownerHome) hints.push('💤 You can hear snoring somewhere in the house.')
  if (hints.length === 0) hints.push('🌙 The house is dark and quiet.')

  const caughtText =
    catcher === 'alarm'
      ? 'The alarm started screaming! Sirens in the distance…'
      : catcher === 'dog'
        ? `${house.dog ?? 'The dog'} found you and is barking like crazy!`
        : `The lights flicked on. ${house.owner} is standing in the doorway!`

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="center" style={{ fontWeight: 800 }}>
        {capitalize(house.house)}
      </div>
      <div className="stack" style={{ gap: 2, fontSize: 13 }}>
        {hints.map((h) => (
          <div key={h} className="muted">
            {h}
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
          <span>🔊 Noise</span>
          <span style={{ color: noiseColor }}>{noise < 0.2 ? 'Quiet' : noise < 0.4 ? 'Careful' : noise < 0.6 ? 'Risky' : 'Very risky'}</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(noise * 100)}%`, height: '100%', background: noiseColor, transition: 'width 300ms ease' }} />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${house.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${house.rows}, minmax(74px, auto))`,
          gap: 4,
          padding: 6,
          background: '#5b4636',
          borderRadius: 10,
          boxShadow: 'inset 0 0 0 3px #3e2f24',
        }}
      >
        {house.rooms.map((room) => {
          const done = searched.includes(room.id)
          const isActive = active === room.id
          const caughtRoom = stage === 'caught' && searched[searched.length - 1] === room.id
          return (
            <button
              key={room.id}
              onClick={() => search(room)}
              disabled={stage !== 'sneak' || done}
              aria-label={done ? `${room.name}, searched` : `Search the ${room.name}`}
              style={{
                gridColumn: `${room.x + 1} / span ${room.w}`,
                gridRow: `${room.y + 1} / span ${room.h}`,
                border: 'none',
                borderRadius: 6,
                padding: 6,
                cursor: stage === 'sneak' && !done ? 'pointer' : 'default',
                background: caughtRoom ? '#ffcdd2' : isActive ? '#fff3c4' : done ? '#d9d4cc' : '#f4ede2',
                color: '#2a2a2a',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                minHeight: 74,
                opacity: done && !caughtRoom ? 0.85 : 1,
                boxShadow: isActive ? '0 0 0 3px var(--yellow)' : 'none',
                transition: 'background 200ms ease',
                font: 'inherit',
              }}
            >
              <span style={{ fontSize: 24, lineHeight: 1 }}>{isActive ? '🔦' : caughtRoom ? '🚨' : room.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>{room.name}</span>
              {done && !caughtRoom ? (
                <span style={{ fontSize: 13, minHeight: 16 }}>{room.loot.length ? room.loot.map((it) => it.emoji).join(' ') : '—'}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="row" style={{ justifyContent: 'space-between', fontWeight: 800 }}>
        <span>💰 Loot bag</span>
        <span style={{ color: total > 0 ? 'var(--green)' : 'var(--muted)' }}>{formatMoney(total)}</span>
      </div>
      {found.length ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 4, fontSize: 13 }}>
          {found.map((it, i) => (
            <span key={`${it.name}-${i}`} className="pill">
              {it.emoji} {it.name}
            </span>
          ))}
        </div>
      ) : null}

      <div
        role="status"
        className="center"
        style={{ minHeight: 20, fontWeight: stage === 'caught' ? 900 : 600, fontSize: stage === 'caught' ? 16 : 14, color: stage === 'caught' ? 'var(--red)' : 'var(--text)' }}
      >
        {stage === 'caught' ? caughtText : stage === 'searching' ? 'Searching…' : lastFind ?? 'Tap a room to search it. Leave before your luck runs out.'}
      </div>

      {stage === 'caught' ? (
        <button className="btn btn-danger btn-block" onClick={() => report(true, catcher ?? 'owner')} style={{ fontSize: 17 }}>
          🏃 Run!
        </button>
      ) : (
        <button className={`btn btn-block ${searched.length ? 'btn-success' : 'btn-ghost'}`} onClick={() => report(false)} disabled={stage === 'searching'}>
          {searched.length === 0 ? 'Chicken out and go home' : total > 0 ? `Leave with the loot (${formatMoney(total)})` : 'Leave empty-handed'}
        </button>
      )}
    </div>
  )
}
