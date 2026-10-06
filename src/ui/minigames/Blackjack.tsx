// Blackjack: a real hand against the dealer. Deal, hit, stand, double down; the dealer
// draws to 17. Five cards without busting is a "Five Card Charlie" (automatic win).
// Reports 'win' | 'lose' | 'push' | 'blackjack' (+ ':double', ':charlie', ':bust').
import { useEffect, useState, type CSSProperties } from 'react'
import { formatMoney } from '../../game/core'
import type { Json } from '../../game/types'
import type { MinigameProps } from './types'

type Suit = '♠️' | '♥️' | '♦️' | '♣️'

interface Card {
  id: number
  rank: string
  suit: Suit
}

type Phase = 'player' | 'dealer' | 'done'

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS: Suit[] = ['♠️', '♥️', '♦️', '♣️']

function readData(data: Json): { bet: number; canDouble: boolean; casino: string } {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const bet = typeof d.bet === 'number' && Number.isFinite(d.bet) ? d.bet : 0
  return { bet, canDouble: d.canDouble === true, casino: typeof d.casino === 'string' ? d.casino : 'the casino' }
}

let nextCardId = 0

/** A six-deck shoe, shuffled. Card ids are unique across reshuffles (React keys). */
function newShoe(): Card[] {
  const cards: Card[] = []
  for (let d = 0; d < 6; d++) for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: nextCardId++, rank, suit })
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

function cardValue(rank: string): number {
  if (rank === 'A') return 11
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10
  return Number(rank)
}

export function handValue(cards: { rank: string }[]): { total: number; soft: boolean } {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += cardValue(c.rank)
    if (c.rank === 'A') aces++
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21
}

const KEYFRAMES = `
@keyframes bj-deal { from { opacity: 0; transform: translate(40px, -30px) rotate(12deg) scale(.85); } to { opacity: 1; transform: none; } }
@keyframes bj-banner { 0% { opacity: 0; transform: scale(.7); } 70% { transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
`

function CardView({ card, hidden, index }: { card: Card; hidden?: boolean; index: number }) {
  const red = card.suit === '♥️' || card.suit === '♦️'
  const base: CSSProperties = {
    width: 54,
    height: 78,
    borderRadius: 8,
    marginLeft: index === 0 ? 0 : -18,
    boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
    flex: '0 0 auto',
    position: 'relative',
    animation: 'bj-deal .28s ease-out both',
  }
  if (hidden) {
    return (
      <div
        aria-label="Face-down card"
        style={{
          ...base,
          border: '3px solid #fff',
          background: 'repeating-linear-gradient(45deg, #b3261e 0 6px, #d9453a 6px 12px)',
        }}
      />
    )
  }
  return (
    <div
      aria-label={`${card.rank} of ${card.suit}`}
      style={{
        ...base,
        background: '#fff',
        color: red ? '#c62828' : '#1b1b1b',
        border: '1px solid #d6d6d6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
      }}
    >
      <span style={{ position: 'absolute', top: 3, left: 5, fontSize: 15, lineHeight: 1 }}>{card.rank}</span>
      <span style={{ fontSize: 26, lineHeight: 1 }}>{card.suit}</span>
      <span style={{ position: 'absolute', bottom: 3, right: 5, fontSize: 15, lineHeight: 1, transform: 'rotate(180deg)' }}>{card.rank}</span>
    </div>
  )
}

function Hand({ label, cards, hideHole, total }: { label: string; cards: Card[]; hideHole?: boolean; total: string }) {
  return (
    <div className="stack" style={{ gap: 6, alignItems: 'center' }}>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        <span style={{ color: '#e8f5e9', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
        <span className="pill" style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
          {total}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', minHeight: 80, padding: '0 6px' }}>
        {cards.map((c, i) => (
          <CardView key={c.id} card={c} index={i} hidden={hideHole && i === 1} />
        ))}
      </div>
    </div>
  )
}

interface Game {
  shoe: Card[]
  player: Card[]
  dealer: Card[]
  phase: Phase
  doubled: boolean
  result: string | null
  message: string
}

function drawFrom(shoe: Card[]): [Card, Card[]] {
  const s = shoe.length < 10 ? newShoe() : shoe
  return [s[s.length - 1], s.slice(0, -1)]
}

/** Deal two cards each; settle immediately on a natural blackjack (the dealer peeks). */
function initialGame(): Game {
  let shoe = newShoe()
  const take = (): Card => {
    const [c, rest] = drawFrom(shoe)
    shoe = rest
    return c
  }
  const p1 = take()
  const d1 = take()
  const p2 = take()
  const d2 = take()
  const player = [p1, p2]
  const dealer = [d1, d2]
  const game: Game = { shoe, player, dealer, phase: 'player', doubled: false, result: null, message: '' }
  const pBJ = isBlackjack(player)
  const dBJ = isBlackjack(dealer)
  if (pBJ && dBJ) return { ...game, phase: 'done', result: 'push', message: 'You both have blackjack. Push.' }
  if (pBJ) return { ...game, phase: 'done', result: 'blackjack', message: 'A natural 21!' }
  if (dBJ) return { ...game, phase: 'done', result: 'lose', message: 'The dealer peeks... blackjack.' }
  return game
}

/** After the player takes a card: bust, Five Card Charlie, auto-stand on 21 / double, or keep playing. */
function afterPlayerCard(game: Game): Game {
  const v = handValue(game.player).total
  const suffix = game.doubled ? ':double' : ''
  if (v > 21) return { ...game, phase: 'done', result: `lose${suffix}:bust`, message: `Bust! You went over with ${v}.` }
  if (game.player.length >= 5) return { ...game, phase: 'done', result: `win${suffix}:charlie`, message: 'Five Card Charlie! Five cards without busting.' }
  if (v === 21 || game.doubled) return { ...game, phase: 'dealer' }
  return game
}

/** Compare hands once the dealer stands. */
function settle(game: Game): Game {
  const pv = handValue(game.player).total
  const dv = handValue(game.dealer).total
  const suffix = game.doubled ? ':double' : ''
  if (dv > 21) return { ...game, phase: 'done', result: `win${suffix}`, message: `The dealer busts with ${dv}!` }
  if (pv > dv) return { ...game, phase: 'done', result: `win${suffix}`, message: `Your ${pv} beats the dealer's ${dv}.` }
  if (pv < dv) return { ...game, phase: 'done', result: `lose${suffix}`, message: `The dealer's ${dv} beats your ${pv}.` }
  return { ...game, phase: 'done', result: `push${suffix}`, message: `Both ${pv}. Push.` }
}

export function Blackjack({ modal, onDone }: MinigameProps) {
  const { bet, canDouble } = readData(modal.data)
  const [game, setGame] = useState<Game>(initialGame)
  const { player, dealer, phase, doubled, result, message } = game

  // The dealer plays out the hand one card at a time, standing on 17.
  useEffect(() => {
    if (phase !== 'dealer') return
    const dv = handValue(dealer).total
    const t = setTimeout(
      () =>
        setGame((gm) => {
          if (gm.phase !== 'dealer') return gm
          if (handValue(gm.dealer).total < 17) {
            const [c, shoe] = drawFrom(gm.shoe)
            return { ...gm, shoe, dealer: [...gm.dealer, c] }
          }
          return settle(gm)
        }),
      dv < 17 ? 650 : 450,
    )
    return () => clearTimeout(t)
  }, [phase, dealer])

  const hit = () =>
    setGame((gm) => {
      if (gm.phase !== 'player') return gm
      const [c, shoe] = drawFrom(gm.shoe)
      return afterPlayerCard({ ...gm, shoe, player: [...gm.player, c] })
    })

  const stand = () => setGame((gm) => (gm.phase === 'player' ? { ...gm, phase: 'dealer' } : gm))

  const doubleDown = () =>
    setGame((gm) => {
      if (gm.phase !== 'player' || gm.player.length !== 2 || !canDouble) return gm
      const [c, shoe] = drawFrom(gm.shoe)
      return afterPlayerCard({ ...gm, shoe, doubled: true, player: [...gm.player, c] })
    })

  const pv = handValue(player)
  const dealerShown = phase === 'player' ? dealer.slice(0, 1) : dealer
  const dv = handValue(dealerShown)
  const stake = bet * (doubled ? 2 : 1)
  const outcome = result?.split(':')[0]
  const net = outcome === 'blackjack' ? bet * 2 : outcome === 'win' ? stake : outcome === 'lose' ? -stake : 0
  const bannerColor = outcome === 'lose' ? 'var(--red)' : outcome === 'push' ? 'var(--orange)' : 'var(--green)'
  return (
    <div className="stack" style={{ gap: 12 }}>
      <style>{KEYFRAMES}</style>
      <div className="row" style={{ justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="pill">💵 Bet {formatMoney(stake)}</span>
        {doubled ? <span className="pill">✌️ Doubled</span> : null}
      </div>
      <div
        style={{
          background: 'radial-gradient(ellipse at center, #1f8a4c 0%, #146b39 70%, #0f5a30 100%)',
          border: '6px solid #6d4423',
          borderRadius: 18,
          padding: '14px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.35)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Hand label="Dealer" cards={dealer} hideHole={phase === 'player'} total={phase === 'player' ? `${dv.total} + ?` : String(dv.total)} />
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>BLACKJACK PAYS 2 TO 1 · DEALER STANDS ON 17</div>
        <Hand label="You" cards={player} total={`${pv.total}${pv.soft && pv.total < 21 ? ' (soft)' : ''}`} />
        {phase === 'done' && result ? (
          <div
            role="status"
            style={{
              alignSelf: 'center',
              background: bannerColor,
              color: '#fff',
              fontWeight: 800,
              borderRadius: 12,
              padding: '8px 16px',
              textAlign: 'center',
              animation: 'bj-banner .35s ease-out both',
              boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ fontSize: 18 }}>{outcome === 'blackjack' ? 'BLACKJACK!' : outcome === 'win' ? 'YOU WIN!' : outcome === 'push' ? 'PUSH' : 'DEALER WINS'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.95 }}>{message}</div>
            <div style={{ fontSize: 15 }}>{net > 0 ? `+${formatMoney(net)}` : net < 0 ? `-${formatMoney(-net)}` : 'Bet returned'}</div>
          </div>
        ) : null}
        {phase === 'dealer' ? <div style={{ textAlign: 'center', color: '#fff', fontWeight: 700 }}>Dealer's turn…</div> : null}
      </div>

      {phase === 'player' ? (
        <div className="grid-3">
          <button className="btn btn-primary" onClick={hit}>
            Hit
          </button>
          <button className="btn btn-success" onClick={stand}>
            Stand
          </button>
          <button className="btn" onClick={doubleDown} disabled={player.length !== 2 || !canDouble} title={canDouble ? 'Double your bet, take exactly one more card' : "You can't cover a doubled bet"}>
            Double
          </button>
        </div>
      ) : phase === 'done' && result ? (
        <button className="btn btn-primary btn-block" onClick={() => onDone(result)}>
          {net > 0 ? 'Collect Winnings' : 'Continue'}
        </button>
      ) : (
        <button className="btn btn-block" disabled>
          Dealer is playing…
        </button>
      )}
    </div>
  )
}
