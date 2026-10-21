// Career kit, menu: the one way a career offers a paid or risky action, and the report card. A gated
// action enforces its gate and its once-a-year limit inside run(), never only in the menu, so a stale
// row or a replayed tap changes nothing. Everything a menu, hint or subtitle reads comes from `view`
// and `standingOf`, which never write and never draw g.rng: a `mut` in a render throws under the
// fuzzer's deepFreeze.
import { chartInfo, ladderSpec, standingSpec } from '../../charts'
import type { ChartSpec } from '../../charts/spec'
import { useYearAction } from '../../core'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuInput, MenuNode } from '../../types'
import { blocked, money, tell } from '../common'
import { standingOf, type RivalSpec, type Standing } from './rivals'
import { KIT_LIMITS, type CareerBase, type CareerStore, type YearRow } from './state'
import { careerCtx, emitBooks, fit, type CareerCtx } from './year'

const LINE = KIT_LIMITS.line
/** Years the report card lists. */
const CARD_YEARS = 5
/** Peers and remembered rivals the report card lists. */
const CARD_PEERS = 5

// ---------------------------------------------------------------------------
// Actions

/**
 * A menu action that reads the record through `view` and runs through `store.mut`. `disabledReason` is
 * `blocked(g) ?? gate(g, view)`; `run` checks both again (and says why on a refusal), applies `once`
 * through `useYearAction(g, once, 1)`, then runs the body in an action context (3 choices, 6 notices)
 * and emits a `books` audit for the cash that moved.
 */
export function gatedAction<S extends CareerBase>(o: {
  id: string
  label: string
  emoji: string
  career: string
  store: CareerStore<S>
  subtitle?: string | ((g: GameState) => string)
  gate: (g: GameState, s: S) => string | null
  hint?: (g: GameState, s: S) => string | null
  confirm?: (g: GameState) => string | null
  input?: MenuInput
  once?: string
  run: (c: CareerCtx<S>, input?: string) => void
}): MenuAction {
  const why = (g: GameState): string | null => blocked(g) ?? o.gate(g, o.store.view(g))
  const hint = o.hint
  return {
    type: 'action',
    id: o.id,
    label: o.label,
    emoji: o.emoji,
    ...(o.subtitle !== undefined ? { subtitle: o.subtitle } : {}),
    ...(hint ? { hint: (g: GameState) => hint(g, o.store.view(g)) } : {}),
    ...(o.confirm ? { confirm: o.confirm } : {}),
    ...(o.input ? { input: o.input } : {}),
    disabledReason: why,
    run: (g, input) => {
      const reason = why(g)
      if (reason) {
        tell(g, o.label, reason, o.emoji)
        return
      }
      if (o.once && !useYearAction(g, o.once, 1)) {
        tell(g, o.label, "You've already done that this year.", o.emoji)
        return
      }
      const s = o.store.mut(g)
      const c = careerCtx(g, o.career, s)
      const before = g.character.money
      o.run(c, input)
      emitBooks(c, o.id, before)
    },
  }
}

// ---------------------------------------------------------------------------
// Report card

/** One closed year as at most 3 lines of 90: the money, the rank (none for rank 0 of 0), the note. */
export function reportLines(row: YearRow, incomeLabel: string): string[] {
  const lines = [`${row.y} ${incomeLabel} ${money(row.income)}, spent ${money(row.spent)}.`]
  if (row.rank > 0 && row.of > 0) lines.push(`Rank ${row.rank} of ${row.of}.`)
  if (row.note) lines.push(row.note)
  return lines.map((l) => fit(l, LINE))
}

const info = (id: string, text: string): MenuInfo => ({ type: 'info', id, text: fit(text, LINE) })

/**
 * The report card as info rows: the standing, the last 5 years, the top peers and the rivals who
 * remember you. Reads `view` and `standingOf` only.
 */
export function standingMenu<S extends CareerBase>(o: {
  id: string
  label: string
  emoji: string
  store: CareerStore<S>
  standingLabel: string
  incomeLabel: string
  peers?: { spec: RivalSpec; score: (g: GameState, s: S) => number }
}): MenuGroup {
  /** The peer ranking, or null when the career has none or its field does not exist yet. */
  const rank = (g: GameState, s: S): Standing | null => {
    if (!o.peers) return null
    const st = standingOf(g, o.peers.spec, o.peers.score(g, s), s.memory)
    return st.top.length > 0 ? st : null
  }
  /** A chart row's words (R1-C14): the spec's summary, held to the line cap like every other row of the card. */
  const chartText = (_g: GameState, spec: ChartSpec | null): string => fit(spec?.summary ?? '', LINE)
  /** The peer ladder (R1-C14): the top peers and you, by score. */
  const peerLadder = (st: Standing): ChartSpec | null => {
    const spec = ladderSpec({
      title: 'Where you stand among peers',
      unit: 'count',
      rows: [...st.top.map((p) => ({ id: p.id, name: p.name, value: p.score })), { id: 'you', name: 'You', value: st.me, you: true }],
      summary: fit(`You rank ${st.rank} of ${st.of}. ${st.top[0]?.name ?? 'Nobody'} is first with ${st.top[0]?.score ?? 0}.`, 120),
    })
    // Only the top five are listed, so below them you are further down than the ladder's own count says.
    const me = spec?.rows?.find((r) => r.you === true)
    if (me && st.rank > me.rank) me.rank = st.rank
    return spec
  }
  return {
    type: 'menu',
    id: o.id,
    label: o.label,
    emoji: o.emoji,
    subtitle: (g) => {
      const s = o.store.view(g)
      const st = rank(g, s)
      return fit(`${o.standingLabel} ${s.standing} of 100${st ? `, rank ${st.rank} of ${st.of}` : ''}`, LINE)
    },
    children: (g) => {
      const s = o.store.view(g)
      const st = rank(g, s)
      const out: MenuNode[] = [info(`${o.id}.standing`, `${o.standingLabel} ${s.standing} of 100, peak ${s.peak}.`)]
      if (st) out.push(info(`${o.id}.rank`, `Rank ${st.rank} of ${st.of}.`))
      // Charts (R1-C14): only once there are two ranked years to draw, or a peer field to rank in.
      if (s.rows.length >= 2) out.push(...chartInfo(`${o.id}.chart`, '\u{1F4C8}', chartText, (gg) => standingSpec('Your rank by year', o.store.view(gg).rows)))
      if (st) out.push(...chartInfo(`${o.id}.peers.chart`, '\u{1F3C6}', chartText, (gg) => {
        const now = rank(gg, o.store.view(gg))
        return now ? peerLadder(now) : null
      }))
      out.push({ type: 'heading', id: `${o.id}.years`, label: 'Last 5 years' })
      const recent = s.rows.slice(-CARD_YEARS).reverse()
      if (recent.length === 0) out.push(info(`${o.id}.none`, 'No years booked yet.'))
      recent.forEach((row, i) => reportLines(row, o.incomeLabel).forEach((line, j) => out.push(info(`${o.id}.year.${i}.${j}`, line))))
      if (st) {
        out.push({ type: 'heading', id: `${o.id}.peers`, label: 'Top peers' })
        st.top.slice(0, CARD_PEERS).forEach((p, i) => out.push(info(`${o.id}.peer.${i}`, `${i + 1}. ${p.name}, score ${p.score}`)))
      }
      const known = s.memory
        .filter((r) => r.met + r.won + r.lost + r.grudge > 0)
        .sort((a, b) => b.met + 2 * b.grudge - (a.met + 2 * a.grudge) || (a.id < b.id ? -1 : 1))
        .slice(0, CARD_PEERS)
      if (known.length > 0) {
        out.push({ type: 'heading', id: `${o.id}.rivals`, label: 'Who remembers you' })
        known.forEach((r, i) => out.push(info(`${o.id}.rival.${i}`, `${r.name}: beat ${r.won}, lost ${r.lost}${r.grudge >= 1 ? ', holds a grudge' : ''}.`)))
      }
      return out
    },
  }
}
