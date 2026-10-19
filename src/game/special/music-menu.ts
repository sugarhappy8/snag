// Music 2.0 menus: the report card, Label & Contract, Charts & Finances and the master buy-back. Every row
// reads the record through `view`, `standingOf`, `activeField` and `formatMix`, so a render never writes and
// never draws g.rng (a `mut` in a render throws under the fuzzer's deepFreeze). The one row that acts, the
// buy-back, is a kit `gatedAction`: its gate and its price are checked again inside `run`, it pays first
// through `c.pay`, and the master it creates is an asset an heir can inherit. This file imports the music
// data, job, state, market, label and rights modules, never music.ts (music.ts imports it).
import { economyOf } from '../economy/model'
import { hasTalent } from '../talents'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../types'
import { compact, money } from './common'
import { gatedAction, reportLines, standingMenu } from './kit/menu'
import { activeField, standingOf } from './kit/rivals'
import { KIT_LIMITS } from './kit/state'
import { careerLog, careerSay, fit } from './kit/year'
import type { FormatId } from './music-data'
import { attentionOf, planRow } from './music-label'
import { MUSIC_SPEC, UNSIGNED_RATE, formatMix, genreAt, nextNet } from './music-market'
import { adoptMaster } from './music-rights'
import { dealOf, musicScore, musicStore, type LedgerRow, type MusicState } from './music-state'

const LINE = KIT_LIMITS.line
/** A subtitle or a hint reads up to this many characters. */
const SUB = 120
/** The acts the Charts menu lists, and the releases it shows under them. */
const TOP = 10
const RECENT = 6

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const pct = (share: number): number => Math.round(share * 100)
const yearsLeft = (n: number): string => `${n} year${n === 1 ? '' : 's'} left`

function info(id: string, text: string, emoji?: string): MenuInfo {
  return { type: 'info', id, text: fit(text, LINE), ...(emoji ? { emoji } : {}) }
}

// ---------------------------------------------------------------------------
// Report card

/** The report card: chart standing, the last five years of royalties, the top peers and the acts that remember you. */
export const musicStanding: MenuGroup = standingMenu<MusicState>({
  id: 'music.standing',
  label: 'Chart standing',
  emoji: '\u{1F4C8}',
  store: musicStore,
  standingLabel: 'Chart standing',
  incomeLabel: 'Royalties',
  peers: { spec: MUSIC_SPEC, score: musicScore },
})

// ---------------------------------------------------------------------------
// Buy-back

/** The cash a bought-back master is priced at: the label's take of the row's last statement, at least this much. */
const BUYBACK_MIN = 2_000

/**
 * Whether the label or distributor still holds a row the player could buy back: not adopted already, not a
 * legacy row (those never settled through the ledger), two or more years old, and still selling 50 or more
 * units next year. Pure.
 */
export function buybackListed(g: GameState, row: LedgerRow): boolean {
  if (row.adopted || row.legacy || g.year - row.year < 2) return false
  return Math.round(row.units0 * row.k ** (g.year + 1 - row.year)) >= 50
}

/**
 * What a buy-back costs and brings, from one function so the row, the run and the tests agree. The price is
 * the label's last take (at least $2,000); the master's audience is 1.6 times next year's net; the first
 * payment is the 75% share of the average year (the rights roll copies between 0.6 and 1.2 of the audience,
 * 0.9 on average) at the home country's leisure demand. Pure.
 */
export function buybackTerms(g: GameState, row: LedgerRow): { price: number; audience: number; firstPayment: number } {
  const price = Math.max(BUYBACK_MIN, Math.round(row.lastLabel))
  const audience = Math.min(1e8, Math.round(1.6 * nextNet(g, row)))
  const demand = economyOf(g, g.character.countryId)?.sectors?.leisure?.demand
  const leisure = typeof demand === 'number' && Number.isFinite(demand) ? clamp(demand, 0.2, 1.5) : 1
  return { price, audience, firstPayment: Math.round(0.75 * 0.9 * audience * leisure) }
}

/** Why a row cannot be bought back right now, else null. Reads the record and the cash only. */
function buybackGate(g: GameState, s: MusicState, id: string): string | null {
  const row = s.ledger.find((r) => r.id === id)
  if (!row) return "That release isn't in your catalogue."
  if (row.adopted) return 'You already own that master.'
  if (!buybackListed(g, row)) return "The label won't sell that one."
  const { price } = buybackTerms(g, row)
  return g.character.money >= price ? null : `You need ${money(price)} to buy it back.`
}

const MASTER = '\u{1F3BC}'

/**
 * The buy-back row of a release. It re-reads the row by id from the record, never from the closure it was
 * built with, so a stale row prices and refuses on the live numbers. It pays first (`c.pay`), then makes the
 * master, then marks the row adopted so the ledger stops paying it.
 */
export function buybackAction(row: LedgerRow): MenuAction {
  const id = row.id
  const cut = row.title.length > 40 ? fit(row.title, 40) : row.title
  const live = (s: MusicState): LedgerRow | undefined => s.ledger.find((r) => r.id === id)
  return gatedAction<MusicState>({
    id: `music.buyback.${id}`,
    label: `Buy Back "${cut}"`,
    emoji: MASTER,
    career: 'music',
    store: musicStore,
    subtitle: (g) => {
      const r = live(musicStore.view(g))
      if (!r || !buybackListed(g, r)) return 'Not for sale'
      const t = buybackTerms(g, r)
      return fit(`Price ${money(t.price)}, first payment about ${money(t.firstPayment)}`, SUB)
    },
    confirm: (g) => {
      const r = live(musicStore.view(g))
      return r && buybackListed(g, r) ? fit(`Pay ${money(buybackTerms(g, r).price)} to own this master? The label stops collecting on it.`, SUB) : null
    },
    gate: (g, s) => buybackGate(g, s, id),
    run: (c) => {
      const { g, s } = c
      const reason = buybackGate(g, s, id)
      if (reason) {
        careerSay(c, 'Master Buy-Back', reason, MASTER)
        return
      }
      const target = live(s)
      if (!target) return
      const t = buybackTerms(g, target)
      if (!c.pay('Master buy-back', t.price)) {
        careerSay(c, 'Master Buy-Back', `You need ${money(t.price)} to buy it back.`, MASTER)
        return
      }
      adoptMaster(g, { title: target.title, quality: target.quality, audience: t.audience }, t.price)
      target.adopted = true
      careerLog(c, `I bought back my master "${cut}".`, 'good')
      careerSay(c, 'Master Buy-Back', `You own "${cut}" now. About ${money(t.firstPayment)} should come in next year.`, MASTER, 'good')
    },
  })
}

// ---------------------------------------------------------------------------
// Label & Contract

/** Label, years left, royalty, advance paid, unrecouped, trust, attention, past deals and a buy-back row per release the label holds. */
export function labelMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'music.label',
    label: 'Label & Contract',
    emoji: '\u{1F3E2}',
    subtitle: (g) => {
      const deal = dealOf(g, musicStore.view(g))
      return deal ? fit(`${deal.label}, ${yearsLeft(deal.years)}`, SUB) : 'No label deal'
    },
    children: (g): MenuNode[] => {
      const s = musicStore.view(g)
      const deal = dealOf(g, s)
      const out: MenuNode[] = []
      if (!deal) {
        out.push(info('music.label.none', `No label deal. Releases pay ${pct(UNSIGNED_RATE)}% of net.`))
      } else {
        out.push(info('music.label.deal', `${deal.label}, ${yearsLeft(deal.years)}.`))
        if (deal.legacy) {
          out.push(info('music.label.legacy', `Legacy terms hold until the term ends. You keep the old salary and ${money(1)} a copy.`))
        } else {
          const paid = Math.min(deal.advance, deal.perYear * Math.max(0, deal.term - deal.years))
          out.push(info('music.label.royalty', `Royalty ${pct(deal.royalty)}% of net.`))
          out.push(info('music.label.advance', `Advance paid ${money(paid)} of ${money(deal.advance)}.`))
          out.push(info('music.label.unrecouped', `Unrecouped ${money(deal.unrecouped)}.`))
        }
        out.push(info('music.label.trust', `Label trust ${deal.trust} of 100.`))
        out.push(info('music.label.attention', `Label attention ${attentionOf(g, s, deal).toFixed(2)}.`))
        out.push(info('music.label.masters', 'Masters stay with the label.'))
      }
      if (s.history.length > 0) {
        out.push({ type: 'heading', id: 'music.label.past', label: 'Past deals' })
        s.history
          .slice()
          .reverse()
          .forEach((h, i) => out.push(info(`music.label.past.${i}`, `${h.label}, ${h.from} to ${h.to}, ${h.ended}.`)))
      }
      const listed = s.ledger.filter((r) => buybackListed(g, r)).reverse()
      if (listed.length > 0) {
        out.push({ type: 'heading', id: 'music.label.buyback', label: 'Buy back a master' })
        for (const r of listed) out.push(buybackAction(r))
      }
      return out
    },
  }
}

// ---------------------------------------------------------------------------
// Charts & Finances

const FORMAT_ORDER: readonly FormatId[] = ['shellac', 'vinyl', 'tape', 'cd', 'download', 'stream']
const FORMAT_NAME: Record<FormatId, string> = { shellac: 'shellac', vinyl: 'vinyl', tape: 'tape', cd: 'CD', download: 'download', stream: 'stream' }

/** This year's formats as `60% CD, 20% tape`, largest first (ties oldest first), every share of 1% or more. Pure. */
function formatLine(g: GameState): string {
  const mix = formatMix(g.character.countryId, g.year)
  return FORMAT_ORDER.map((f) => ({ f, p: pct(mix[f]) }))
    .filter((x) => x.p >= 1)
    .sort((a, b) => b.p - a.p)
    .map((x) => `${x.p}% ${FORMAT_NAME[x.f]}`)
    .join(', ')
}

/** This year's top ten, your rank, your last peak, the format mix, the last statement and your newest releases. */
export function chartsMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'music.charts',
    label: 'Charts & Finances',
    emoji: '\u{1F4CA}',
    subtitle: (g) => {
      const s = musicStore.view(g)
      const st = standingOf(g, MUSIC_SPEC, musicScore(g, s), s.memory)
      return st.top.length > 0 ? `You chart about #${st.rank} today` : 'No chart yet'
    },
    children: (g): MenuNode[] => {
      const s = musicStore.view(g)
      const field = activeField(g, MUSIC_SPEC, s.memory)
      const out: MenuNode[] = []
      if (field.length === 0) {
        out.push(info('music.charts.none', 'No chart exists yet.'))
      } else {
        out.push({ type: 'heading', id: 'music.charts.top', label: 'Top 10 this year' })
        field.slice(0, TOP).forEach((f, i) => out.push(info(`music.charts.top.${i}`, `${i + 1}. ${f.rival.name}, ${genreAt(f.rival.edge, g.year)}, score ${f.score}`)))
        const st = standingOf(g, MUSIC_SPEC, musicScore(g, s), s.memory)
        out.push(info('music.charts.rank', `You chart about #${st.rank} today.`))
        const near = field[st.rank - 1]
        // The act at your rank is the Music talent's read: no hint without it.
        if (near && hasTalent(g, 'Music')) out.push(info('music.charts.near', `The act at #${st.rank} sits near ${near.score}.`, '\u{1F31F}'))
      }
      const charted = s.ledger.filter((r) => r.peak > 0).at(-1)
      out.push(info('music.charts.peak', charted ? `Your last peak: #${charted.peak}.` : 'No chart entry yet.'))
      out.push(info('music.charts.formats', `Formats: ${formatLine(g)}.`))
      out.push({ type: 'heading', id: 'music.charts.statement', label: 'Last statement' })
      const last = s.rows.at(-1)
      if (last) reportLines(last, 'Royalties').forEach((line, i) => out.push(info(`music.charts.statement.${i}`, line)))
      else out.push(info('music.charts.statement.none', 'No statement yet.'))
      const recent = s.ledger.slice(-RECENT).reverse()
      if (recent.length > 0) {
        out.push({ type: 'heading', id: 'music.charts.ledger', label: 'Your releases' })
        recent.forEach((r, i) => out.push(info(`music.charts.ledger.${i}`, `${r.year} "${r.title}": ${compact(r.units0)} units, paid ${money(r.paid)}, label share ${money(r.lastLabel)}.`)))
      }
      return out
    },
  }
}

// ---------------------------------------------------------------------------
// The nodes music.ts spreads into the job menu

/** The report card, the label, the charts and the Release Plan row. A render of these reads and never writes. */
export function musicNodes(_g: GameState): MenuNode[] {
  return [musicStanding, labelMenu(), chartsMenu(), planRow]
}
