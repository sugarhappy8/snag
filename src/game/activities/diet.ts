// Mind & Body > Diet: pick a diet plan. It costs money every month and changes health,
// looks and happiness every year you stay on it (applied by yearlyDiet / syncDiet).
// Diets are fads of their decade: thorough chewing in the 1900s, grapefruit in the thirties,
// cabbage soup in the fifties, Atkins in the seventies, keto and paleo in the 2010s.
import { addStat, count, log, notice, spend } from '../core'
import { chance, pick, randInt } from '../rng'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { addCondition, gate, localPrice, money, result, stablePick } from './common'

interface DietDef {
  id: string
  name: string
  emoji: string
  /** US list price per month. */
  monthly: number
  health: [number, number]
  looks: [number, number]
  happiness: [number, number]
  /** Yearly chance of malnutrition. */
  malnutrition?: number
  blurb: string
  /** Years the plan was around (first year, and the year it faded). */
  since?: number
  until?: number
}

export const DIETS: DietDef[] = [
  { id: 'atkins', name: 'Atkins', emoji: '\u{1F969}', monthly: 120, health: [-3, 0], looks: [0, 2], happiness: [0, 2], blurb: 'Low carb, lots of meat and eggs', since: 1972 },
  { id: 'highCalorie', name: 'High Calorie', emoji: '\u{1F354}', monthly: 160, health: [-17, -10], looks: [-5, -2], happiness: [3, 7], blurb: 'Eat everything. Always.' },
  { id: 'hotChips', name: 'Spicy Cheese Puff', emoji: '\u{1F336}\u{FE0F}', monthly: 45, health: [-25, -15], looks: [-3, 0], happiness: [2, 6], blurb: 'Nothing but spicy cheese puffs', since: 1990 },
  { id: 'jennyCraig', name: 'Portion Coach', emoji: '\u{1F957}', monthly: 400, health: [2, 4], looks: [1, 2], happiness: [1, 3], blurb: 'Prepackaged meals and a coach', since: 1983 },
  { id: 'keto', name: 'Keto', emoji: '\u{1F951}', monthly: 210, health: [1, 3], looks: [1, 3], happiness: [-3, -1], blurb: 'Fat is your new best friend', since: 2012 },
  { id: 'liquid', name: 'Liquid', emoji: '\u{1F964}', monthly: 150, health: [-6, -2], looks: [-3, -1], happiness: [-5, -2], malnutrition: 0.25, blurb: 'Shakes for breakfast, lunch and dinner', since: 1977 },
  { id: 'mediterranean', name: 'Mediterranean', emoji: '\u{1FAD2}', monthly: 250, health: [3, 6], looks: [1, 2], happiness: [1, 3], blurb: 'Olive oil, fish and vegetables', since: 1975 },
  { id: 'paleo', name: 'Paleo', emoji: '\u{1F356}', monthly: 230, health: [1, 3], looks: [1, 2], happiness: [-3, -1], blurb: 'Eat like a caveman', since: 2010 },
  { id: 'southBeach', name: 'South Beach', emoji: '\u{1F3D6}\u{FE0F}', monthly: 200, health: [2, 4], looks: [1, 3], happiness: [0, 1], blurb: 'Lean protein, good carbs', since: 2003 },
  { id: 'tapeworm', name: 'Tapeworm', emoji: '\u{1FAB1}', monthly: 30, health: [-20, -12], looks: [-6, -2], happiness: [-3, 0], blurb: 'Swallow a parasite. What could go wrong?' },
  { id: 'vegan', name: 'Vegan', emoji: '\u{1F966}', monthly: 180, health: [2, 4], looks: [0, 1], happiness: [-2, 0], malnutrition: 0.08, blurb: 'No animal products whatsoever', since: 1944 },
  { id: 'vegetarian', name: 'Vegetarian', emoji: '\u{1F955}', monthly: 160, health: [2, 5], looks: [0, 1], happiness: [0, 1], malnutrition: 0.05, blurb: 'No meat' },
  { id: 'weightWatchers', name: 'Point Counter', emoji: '\u{2696}\u{FE0F}', monthly: 300, health: [2, 4], looks: [1, 3], happiness: [1, 3], blurb: 'Count points, not calories', since: 1997 },
  { id: 'whole30', name: 'Whole30', emoji: '\u{1F34E}', monthly: 220, health: [2, 5], looks: [1, 2], happiness: [-3, -1], blurb: '30 days of nothing fun, forever', since: 2009 },
  { id: 'fletcher', name: 'Thorough Chewing', emoji: '\u{1F9B7}', monthly: 20, health: [0, 2], looks: [0, 1], happiness: [-3, -1], blurb: 'Chew every bite exactly 32 times', until: 1935 },
  { id: 'grapefruit', name: 'Grapefruit', emoji: '\u{1F34A}', monthly: 60, health: [0, 2], looks: [0, 2], happiness: [-2, 0], blurb: 'Half a grapefruit with every single meal', since: 1930 },
  { id: 'cabbageSoup', name: 'Cabbage Soup', emoji: '\u{1F96C}', monthly: 40, health: [-1, 1], looks: [1, 2], happiness: [-4, -2], blurb: 'Cabbage soup. All week. Every week.', since: 1950 },
  { id: 'calorieCounting', name: 'Calorie Counting', emoji: '\u{1F4DD}', monthly: 30, health: [1, 3], looks: [0, 2], happiness: [-1, 1], blurb: 'Add up every bite in a little notebook', since: 1918 },
]

/** Was this diet around in the current year? */
function dietExists(g: GameState, d: DietDef): boolean {
  return g.year >= (d.since ?? 0) && g.year < (d.until ?? 99999)
}

const DIET_KEY = 'diet'

interface DietState {
  id: string
  startAge: number
  /** Last age at which yearly effects were applied. */
  lastAge: number
}

export function currentDiet(g: GameState): { state: DietState; def: DietDef } | null {
  const raw = g.flags[DIET_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, Json>
  const def = DIETS.find((d) => d.id === o.id)
  if (!def) return null
  const age = g.character.age
  return {
    def,
    state: {
      id: def.id,
      startAge: typeof o.startAge === 'number' ? o.startAge : age,
      lastAge: typeof o.lastAge === 'number' ? o.lastAge : age,
    },
  }
}

function saveDiet(g: GameState, s: DietState | null): void {
  if (!s) delete g.flags[DIET_KEY]
  else g.flags[DIET_KEY] = { id: s.id, startAge: s.startAge, lastAge: s.lastAge }
}

export function yearlyDietCost(g: GameState, def: DietDef): number {
  return localPrice(g, def.monthly * 12)
}

/**
 * Apply one year of diet effects for every year that passed since the last application.
 * Idempotent per age, so it is safe to call from both the yearly hook and activity runs.
 */
export function syncDiet(g: GameState): void {
  const cur = currentDiet(g)
  if (!cur) return
  const c = g.character
  if (!c.alive) return
  let { lastAge } = cur.state
  if (lastAge > c.age) lastAge = c.age
  const def = cur.def
  while (lastAge < c.age) {
    lastAge += 1
    const cost = yearlyDietCost(g, def)
    if (c.prison) {
      // Prison food is its own diet.
      saveDiet(g, null)
      log(g, `I had to give up the ${def.name} diet. Prison food doesn't do substitutions.`, 'neutral')
      return
    }
    if (!spend(g, cost)) {
      saveDiet(g, null)
      log(g, `I couldn't afford the ${def.name} diet anymore, so I quit it.`, 'bad')
      notice(g, 'Diet Over', `You couldn't afford the ${money(cost)} a year for the ${def.name} diet, so you went back to eating whatever was in the fridge.`, { emoji: '\u{1F37D}\u{FE0F}' })
      return
    }
    addStat(g, 'health', randInt(g, def.health[0], def.health[1]))
    addStat(g, 'looks', randInt(g, def.looks[0], def.looks[1]))
    addStat(g, 'happiness', randInt(g, def.happiness[0], def.happiness[1]))
    if (def.malnutrition && chance(g, def.malnutrition)) {
      const { isNew } = addCondition(g, 'Malnutrition', 'disease', randInt(g, 15, 30), { curable: true, diagnosed: true })
      if (isNew) {
        log(g, `My ${def.name} diet left me malnourished.`, 'bad')
        notice(g, 'Malnourished', `Your ${def.name} diet isn't giving your body what it needs. You've developed malnutrition.`, { emoji: '\u{1F915}', tone: 'bad' })
      }
    }
    if (def.id === 'tapeworm' && chance(g, 0.4)) {
      const { isNew } = addCondition(g, 'Tapeworm', 'disease', randInt(g, 20, 35), { curable: true, diagnosed: true })
      if (isNew) log(g, 'My tapeworm diet left me with an actual tapeworm. Who could have seen that coming?', 'bad')
    }
    if (def.id === 'hotChips' && lastAge - cur.state.startAge >= 60) g.flags.dietSurvivor = true
  }
  saveDiet(g, { ...cur.state, lastAge })
}

const START_LINES = [
  "You started the {name} diet. Your fridge doesn't recognize you anymore.",
  'You committed to the {name} diet. Your taste buds have filed a formal complaint.',
  'You are now on the {name} diet. You told three people within the hour.',
]

function startDiet(g: GameState, def: DietDef): void {
  const cur = currentDiet(g)
  if (cur && cur.def.id === def.id) {
    result(g, 'Already Dieting', `You're already on the ${def.name} diet.`, def.emoji)
    return
  }
  const firstMonth = localPrice(g, def.monthly)
  if (!spend(g, firstMonth)) {
    result(g, 'Insufficient Funds', `The ${def.name} diet costs ${money(firstMonth)} a month. You can't afford even the first month.`, '\u{1F4B8}', 'bad')
    return
  }
  syncDiet(g)
  saveDiet(g, { id: def.id, startAge: g.character.age, lastAge: g.character.age })
  count(g, 'diets')
  if (def.id === 'hotChips') g.flags.triedSpicyDiet = true
  log(g, `I started the ${def.name} diet.`, 'neutral')
  result(g, `${def.name} Diet`, pick(g, START_LINES).replace('{name}', def.name), def.emoji)
}

function stopDiet(g: GameState): void {
  const cur = currentDiet(g)
  if (!cur) return
  syncDiet(g)
  saveDiet(g, null)
  log(g, `I quit the ${cur.def.name} diet.`, 'neutral')
  result(g, 'Diet Over', pick(g, [
    `You quit the ${cur.def.name} diet and celebrated with an entire pizza.`,
    `You're officially off the ${cur.def.name} diet. Freedom tastes like fries.`,
  ]), '\u{1F355}')
}

export const dietMenu: MenuGroup = {
  type: 'menu',
  id: 'mb.diet',
  label: 'Diet',
  emoji: '\u{1F957}',
  subtitle: (g) => {
    const cur = currentDiet(g)
    return cur ? `Current: ${cur.def.name}` : 'Go on a diet'
  },
  visible: (g) => !g.character.prison,
  disabledReason: (g) => gate(g, { minAge: 18 }),
  header: (g) => {
    const cur = currentDiet(g)
    return cur
      ? `You are on the ${cur.def.name} diet (${money(yearlyDietCost(g, cur.def))} a year). Pick a new plan or stop dieting.`
      : 'Diets cost money every month and change your health, looks and happiness every year you stay on them.'
  },
  children: (g): MenuNode[] => {
    const cur = currentDiet(g)
    const offered = stablePick(g, 'diets', DIETS.filter((d) => dietExists(g, d)), 8)
    if (cur && !offered.some((d) => d.id === cur.def.id)) offered.unshift(cur.def)
    const nodes: MenuNode[] = []
    if (cur) {
      nodes.push({
        type: 'action',
        id: 'mb.diet.stop',
        label: 'Stop Dieting',
        emoji: '\u{1F6D1}',
        subtitle: `Quit the ${cur.def.name} diet`,
        run: stopDiet,
      })
    }
    for (const def of offered) {
      const action: MenuAction = {
        type: 'action',
        id: `mb.diet.${def.id}`,
        label: `${def.name} Diet`,
        emoji: def.emoji,
        subtitle: (s) => `${def.blurb} · ${money(localPrice(s, def.monthly))}/month${cur?.def.id === def.id ? ' · current' : ''}`,
        disabledReason: (s) => (currentDiet(s)?.def.id === def.id ? `You're already on the ${def.name} diet.` : null),
        run: (draft) => startDiet(draft, def),
      }
      nodes.push(action)
    }
    return nodes
  },
}
