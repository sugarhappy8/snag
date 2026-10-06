import { it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { DEEP_TECH_EVENT_IDS, presentDeepTechEvent } from '../src/game/business/deeptech-events'
import { deepTechReportImpl } from '../src/game/business/deeptech-sim'
import { readTech } from '../src/game/business/deeptech-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf } from '../src/game/business/state'
import { DEEP_TECH_IDS } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import type { GameState, Json, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

function texts(g: GameState, nodes: MenuNode[], out: string[]): void {
  for (const n of nodes) {
    if (n.type === 'heading') out.push(n.label)
    else if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
    else {
      out.push(n.label)
      const sub = typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle
      if (sub) out.push(sub)
      const h = n.hint?.(g); if (h) out.push(h)
      const d = n.disabledReason?.(g); if (d) out.push(d)
      if (n.type === 'menu') { if (n.header) out.push(n.header(g)); texts(g, n.children(g), out) }
      else if (n.confirm) { const c = n.confirm(g); if (c) out.push(c) }
    }
  }
}
it('loc', () => {
  const US = /\b(FDA|NASA|Pentagon|FTC|SBIR|DARPA|NIH|CHIPS|DOE)\b/
  const bad: string[] = []
  const sample: string[] = []
  for (const cc of ['jp', 'br', 'ng', 'tw', 'kr', 'de', 'in']) {
    for (const ind of DEEP_TECH_IDS) {
      for (const stage of [0, 2, 3]) {
        const g = createNewLife({ seed: 5, year: 2000, countryId: cc })
        g.queue = []; g.character.age = 35; g.character.city = getCountry(cc).cities[0]; g.character.talents = ['Business']
        const b0 = newBiz(g, ind, cc, g.character.city, { cash: 1_000_000 })
        const t = readTech(undefined)
        Object.assign(t, { level: 60, stage, venture: 50_000_000, raised: 50_000_000, series: 2, models: [{ gen: 1, name: 'Nova 1', score: 70, open: false, year: 1999 }], drugs: [{ id: 'd1', name: 'Calavir', area: 'infection', phase: 2, quality: 60, peak: 2, filed: 1998, approved: 0, royalty: 1, partner: '', failed: false }], qubits: 200, logical: 2, autonomy: 1, sats: 1, ipBook: 1_000_000 })
        b0.tech = JSON.parse(JSON.stringify(t)) as Json
        b0.share = 0.6; b0.valuation = 40_000_000
        const a = createBusinessAsset(g, 'Co', b0, 0); g.assets.push(a)
        g.character.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: 35, roleStartAge: 35 } }
        const out: string[] = []
        texts(g, businessAssetView(g, a), out)
        deepTechReportImpl(g, a, bizOf(g, a))
        for (const id of DEEP_TECH_EVENT_IDS) presentDeepTechEvent(g, a, id)
        for (const m of g.queue) { if (m.kind === 'choice') { out.push(m.title, m.text, ...m.choices.map((c) => `${c.label} ${c.hint ?? ''}`)) } else if (m.kind === 'notice') out.push(m.title, m.text) }
        if (cc === 'de' && ind === 'quantum' && stage === 0) sample.push(...out.map((x) => `[${cc}/${ind}] ${x.slice(0, 260)}`))
        for (const x of out) if (US.test(x) || /NaN|undefined|Infinity/.test(x)) bad.push(`${cc} ${ind} s${stage}: ${x.slice(0, 200)}`)
      }
    }
  }
  console.log([...new Set(bad)].slice(0, 40).join('\n') || 'CLEAN')
  console.log(sample.join('\n'))
})
