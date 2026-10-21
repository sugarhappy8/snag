// Ecosystem companies: the Devices & Chips screen of a device company. Where its chips come from, a fab to build, the platform, and one
// spec sheet per kind of hardware. It reads state and never writes it: no random number is drawn, and no row names a rival.
import { chartInfo, scorecardSpec } from '../charts'
import type { Asset, GameState, Json, MenuGroup, MenuNode } from '../types'
import { chipBook, chipSource, chipTerms, HARDWARE_FAMILIES, OS_FAMILY, OS_PULL_CAP, readChips, readFabs } from './devices-data'
import { specLines, specSheet, type DeviceSpec } from './devices-specs'
import { marketCtxFor, osStrength } from './economy'
import { manageBlock } from './gate'
import { chipResultFor, chipRows } from './group-services'
import { infoOf } from './product-market'
import { findBusiness, readBiz, type BizState } from './state'
import { aPct, money, pct, plural } from './util'

const OPEN_MARKET = 'Chips come from the open market. A fab or a sister chip company would cut their cost.'
const NO_DEVICE = 'No device is on sale yet. Develop one under Products.'

/** A family's name as an id piece: lowercase, every run of other characters one dash. */
function slug(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** The live company behind the screen (menus are built from a snapshot). */
function liveOf(g: GameState, a: Asset): { cur: Asset; b: BizState } {
  const cur = findBusiness(g, a.id) ?? a
  return { cur, b: readBiz(g, cur) }
}

/** The chips row: the source, what it cuts, how much faster and better it makes the devices, and what it saved. */
function chipsText(g: GameState, a: Asset, b: BizState): string {
  const terms = chipTerms(b, g.year)
  if (terms.src === 'market') return OPEN_MARKET
  const lift = terms.lift.toFixed(1)
  if (terms.src === 'sister') {
    const name = readChips(b.chips as unknown as Json)?.name ?? 'A sister company'
    const saved = chipResultFor(g, a.id)?.saved ?? 0
    return `${name} makes your chips. They cost ${pct(terms.cut)} less and lift quality by about ${lift}.${saved >= 1 ? ` It saved about ${money(saved)} last year.` : ''}`
  }
  const own = chipBook(b.last?.cogs ?? 0, terms.cut).saved
  return `You run ${plural(readFabs(b.fabs), 'chip fab')}. Chips cost ${pct(terms.cut)} less and run ${terms.perfBump.toFixed(1)} points faster, which lifts quality by about ${lift}.${own >= 1 ? ` At last year's volume that saves about ${money(own)} a year.` : ''}`
}

/** The platform row: what the operating system does for the installed base. */
function platformText(g: GameState, b: BizState): string {
  if (osStrength(b, g.year) > 0) {
    const ctx = marketCtxFor(g, b, g.year)
    return `Your operating system keeps buyers. Pull is ${ctx.w.toFixed(2)}x at ${aPct(ctx.base)} share, up to ${OS_PULL_CAP.toFixed(1)}x.`
  }
  const has = b.products.some((p) => {
    const info = infoOf(p, b.industry)
    return info.family === OS_FAMILY && info.kind !== 'bundle' && info.kind !== 'addon'
  })
  if (has) return 'Your operating system is too far behind to keep buyers. A newer version would.'
  return `No operating system yet. One would add pull as your share grows, up to ${OS_PULL_CAP.toFixed(1)}x.`
}

/** The sheets of a company, read fresh each time a row is drawn. */
function sheetOf(g: GameState, a: Asset): DeviceSpec[] {
  const { b } = liveOf(g, a)
  return specSheet(g, b, g.year, marketCtxFor(g, b, g.year))
}

function familyMenu(a: Asset, family: string): MenuGroup {
  const find = (g: GameState) => sheetOf(g, a).find((s) => s.family === family)
  return {
    type: 'menu',
    id: `biz.devices.spec.${a.id}.${slug(family)}`,
    label: family,
    emoji: '\u{1F4F1}',
    subtitle: (g) => {
      const s = find(g)
      if (!s) return ''
      const perf = Math.round(s.perf.mine)
      return s.perf.of > 1 ? `Performance ${perf} · rank ${s.perf.rank} of ${s.perf.of}` : `Performance ${perf} · the market has no figures`
    },
    header: (g) => {
      const s = find(g)
      return s ? `Your best line is ${s.line}.` : ''
    },
    children: (g) => {
      const s = find(g)
      if (!s) return []
      const ids = ['perf', 'quality', 'price']
      const lines = specLines(s).map((text, i): MenuNode => ({ type: 'info', id: `biz.devices.spec.${a.id}.${slug(family)}.${ids[i]}`, emoji: '\u{1F4CA}', text }))
      // Price has a negative scale, so the chart holds performance and quality; the price stays a text row (R1-C14).
      lines.push(...chartInfo(`biz.devices.spec.chart.${a.id}.${slug(family)}`, '\u{1F4CA}', (_g, spec) => spec?.summary ?? '', (gg) => {
        const sheet = find(gg)
        return sheet ? scorecardSpec(`${family} against the market`, [sheet.perf, sheet.quality]) : null
      }))
      return lines
    },
  }
}

/** The Devices & Chips screen. `build` is the Build a Chip Fab row, which manage.ts owns. At most 12 rows. */
export function devicesMenu(a: Asset, build: MenuNode): MenuGroup {
  return {
    type: 'menu',
    id: `biz.devices.${a.id}`,
    label: 'Devices & Chips',
    emoji: '\u{1F4F1}',
    subtitle: (g) => {
      const { b } = liveOf(g, a)
      const src = chipSource(b)
      const fabs = readFabs(b.fabs)
      const from = src.src === 'sister' ? `Chips from ${readChips(b.chips as unknown as Json)?.name ?? 'a sister company'}` : src.src === 'fab' ? 'Chips from your own fabs' : 'Open-market chips'
      return `${from} · ${fabs ? plural(fabs, 'fab') : 'no fabs'}`
    },
    disabledReason: (g) => manageBlock(g, a),
    children: (g) => {
      const { cur, b } = liveOf(g, a)
      const nodes: MenuNode[] = [
        { type: 'info', id: `biz.devices.header.${a.id}`, emoji: '\u{1F4CA}', text: 'Specs compare your best line of each kind with rivals that sell one. Better chips raise quality.' },
        { type: 'info', id: `biz.devices.chips.${a.id}`, emoji: '\u{1F4BE}', text: chipsText(g, cur, b) },
        build,
      ]
      const sister = chipRows(g, cur)[0]
      if (sister) nodes.push({ type: 'info', id: `biz.devices.sister.${a.id}`, emoji: '\u{1F517}', text: sister })
      nodes.push({ type: 'info', id: `biz.devices.platform.${a.id}`, emoji: '\u{1F9E9}', text: platformText(g, b) })
      const sheets = sheetOf(g, cur)
      for (const family of HARDWARE_FAMILIES) if (sheets.some((s) => s.family === family)) nodes.push(familyMenu(a, family))
      if (!sheets.length) nodes.push({ type: 'info', id: `biz.devices.none.${a.id}`, emoji: '\u{1F4AD}', text: NO_DEVICE })
      return nodes
    },
  }
}
