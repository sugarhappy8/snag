// The home computer: once you own a computer (a laptop or gaming PC from the Electronics Store,
// or one your parents buy you), Activities › Computer opens at-home ways to learn and earn,
// even before 18: learn to code, build a SaaS, freelance (computer/dev.ts), and the riskier side,
// crypto pump-and-dumps, options trading and online scams (computer/money.ts).
import { devNodes, noComputerNodes, yearlyDev } from './computer/dev'
import { moneyNodes, yearlyMoney } from './computer/money'
import { cafeAvailable } from './activities/pastimes'
import { onlineNodes, yearlyOnline } from './computer/online'
import { codingSkill } from './computer/skills'
import { computerAsset, computerLocked, ownsComputer } from './computer/access'
import type { GameState, MenuGroup } from './types'

export { canUseComputer, computerAsset, computerLocked, isComputer, ownsComputer } from './computer/access'

/** Activities › Computer. */
export const computerMenu: MenuGroup = {
  type: 'menu',
  id: 'computer',
  label: 'Computer',
  emoji: '\u{1F4BB}',
  subtitle: (g) => {
    const a = computerAsset(g)
    if (!a) return 'Get a laptop or gaming PC to unlock'
    if (computerLocked(g)) return 'Confiscated'
    const skill = codingSkill(g)
    return `${a.name}${skill > 0 ? ` · coding ${skill}/100` : ''}`
  },
  visible: (g) => g.character.alive && g.character.age >= 8 && !g.character.prison,

  header: (g) => {
    const a = computerAsset(g)
    return a ? `${a.emoji} Your ${a.name.toLowerCase()} hums to life. What will you do?` : ''
  },
  children: (g) => {
    const locked = computerLocked(g)
    if (locked && ownsComputer(g)) return [{ type: 'info', id: 'computer.locked', emoji: '\u{1F512}', text: locked }]
    if (!ownsComputer(g)) {
      return [
        { type: 'info', id: 'computer.none', emoji: '\u{1F50C}', text: "You don't have a computer. Buy a laptop or gaming PC at the Electronics Store (Activities › Shopping)." },
        ...(cafeAvailable(g) ? [{ type: 'info' as const, id: 'computer.cafe', emoji: '\u{2615}', text: 'A cyber cafe in town rents computers by the hour (Activities \u203A Hang Out \u203A Cyber Cafe).' }] : []),
        ...noComputerNodes(g),
      ]
    }
    return [...devNodes(g), ...moneyNodes(g), ...onlineNodes(g)]
  },
}

/** Yearly hook (aging.ts, after shops, before finance). */
export function yearlyComputer(g: GameState): void {
  yearlyDev(g)
  if (!g.character.alive) return
  yearlyMoney(g)
  if (!g.character.alive) return
  yearlyOnline(g)
}

