// These are fictional, alternate-history research projects, not scientific recipes.
import type { InventionTier } from './business/inventions'

export type InventionField = 'energy' | 'materials' | 'computing' | 'health' | 'food' | 'transport' | 'consumer'
export interface InventionTopic { id: string; name: string; field: InventionField; tier: InventionTier; note: string }
export const INVENTION_TOPICS: InventionTopic[] = [
  { id: 'heat-recovery', name: 'Waste-heat recovery cartridge', field: 'energy', tier: 'small', note: 'Capture otherwise wasted industrial heat.' },
  { id: 'solar-film', name: 'Flexible solar window film', field: 'energy', tier: 'middle', note: 'Turn ordinary windows into a useful power source.' },
  { id: 'solid-battery', name: 'Solid-state storage module', field: 'energy', tier: 'big', note: 'A high-density, long-lived storage product.' },
  { id: 'cold-fusion', name: 'Stable cold-fusion power cell', field: 'energy', tier: 'generational', note: 'Speculative alternate-history breakthrough, not established science.' },
  { id: 'smart-coating', name: 'Self-cleaning protective coating', field: 'materials', tier: 'small', note: 'A practical new surface-treatment product.' },
  { id: 'repair-polymer', name: 'Self-repairing structural polymer', field: 'materials', tier: 'middle', note: 'A material that closes small defects before failure.' },
  { id: 'carbon-fabric', name: 'Programmable carbon fabric', field: 'materials', tier: 'big', note: 'Reconfigurable lightweight industrial material.' },
  { id: 'matter-fabricator', name: 'Programmable matter fabricator', field: 'materials', tier: 'generational', note: 'A wholly fictional manufacturing breakthrough.' },
  { id: 'adaptive-chip', name: 'Low-power adaptive sensor chip', field: 'computing', tier: 'small', note: 'A focused processor for inexpensive sensors.' },
  { id: 'optical-link', name: 'Optical computing interconnect', field: 'computing', tier: 'middle', note: 'Move information with less heat and energy.' },
  { id: 'quantum-interface', name: 'Fault-tolerant quantum interface', field: 'computing', tier: 'big', note: 'A commercial component for reliable quantum systems.' },
  { id: 'cognitive-substrate', name: 'Self-organizing cognitive substrate', field: 'computing', tier: 'generational', note: 'Fictional computing technology beyond conventional processors.' },
  { id: 'diagnostic-patch', name: 'Non-invasive diagnostic patch', field: 'health', tier: 'small', note: 'An invented monitoring product, not medical instructions.' },
  { id: 'precision-capsule', name: 'Precision therapeutic capsule', field: 'health', tier: 'middle', note: 'A fictional targeted healthcare platform.' },
  { id: 'organ-scaffold', name: 'Regenerative organ scaffold', field: 'health', tier: 'big', note: 'A speculative regenerative product.' },
  { id: 'tissue-platform', name: 'Universal tissue-repair platform', field: 'health', tier: 'generational', note: 'Alternate-history medicine, not a real treatment claim.' },
  { id: 'freshness-sensor', name: 'Food freshness indicator membrane', field: 'food', tier: 'small', note: 'A new packaging product that detects spoilage.' },
  { id: 'nutrient-cultivator', name: 'Precision nutrient cultivator', field: 'food', tier: 'middle', note: 'A closed-loop growing appliance.' },
  { id: 'climate-crop', name: 'Climate-resilient growing system', field: 'food', tier: 'big', note: 'A high-efficiency agricultural product.' },
  { id: 'nutrition-synth', name: 'Molecular nutrition synthesizer', field: 'food', tier: 'generational', note: 'A fictional new way to manufacture food.' },
  { id: 'routing-sensor', name: 'Predictive routing sensor', field: 'transport', tier: 'small', note: 'A sensor module that reduces wasted travel.' },
  { id: 'autonomous-controller', name: 'Autonomous transport controller', field: 'transport', tier: 'middle', note: 'A controller sold to transport operators.' },
  { id: 'light-propulsion', name: 'Ultralight electric propulsion unit', field: 'transport', tier: 'big', note: 'An advanced propulsion product.' },
  { id: 'inertial-drive', name: 'Inertial transport drive', field: 'transport', tier: 'generational', note: 'An intentionally fictional transport breakthrough.' },
  { id: 'water-filter', name: 'Reusable clean-water filter', field: 'consumer', tier: 'small', note: 'A practical household filtration product.' },
  { id: 'adaptive-cloth', name: 'Temperature-adaptive clothing fibre', field: 'consumer', tier: 'middle', note: 'A wearable material with a useful new property.' },
  { id: 'home-recycler', name: 'Closed-loop home recycling appliance', field: 'consumer', tier: 'big', note: 'A durable appliance for recovering useful materials.' },
  { id: 'personal-climate', name: 'Personal climate envelope projector', field: 'consumer', tier: 'generational', note: 'A wholly fictional consumer product category.' },
]

export function inventionTopic(id: string): InventionTopic | undefined { return INVENTION_TOPICS.find(topic => topic.id === id) }
export function isInventionField(value: unknown): value is InventionField { return typeof value === 'string' && ['energy', 'materials', 'computing', 'health', 'food', 'transport', 'consumer'].includes(value) }

/** A real production business is needed, not a financial vehicle or unrelated storefront. */
export function inventionIndustryCompatible(field: InventionField, industry: string): boolean {
  if (/^(bank|onlineBank|investmentFirm)$/.test(industry)) return false
  if (industry === 'manufacturing') return true
  const families: Record<InventionField, RegExp> = {
    energy: /energy|solar|battery|fusion|electricVehicles/,
    materials: /construction|fashion|robotics|electricVehicles|spaceTech/,
    computing: /software|semiconductor|aiLab|quantum|robotics|cybersecurity|telecom|dataCenter|gameStudio/,
    health: /biotech|pharma|clinic|medical/,
    food: /farm|food|restaurant|bakery|grocery|cafe/,
    transport: /logistics|autoShop|electricVehicles|spaceTech|aero|travel/,
    consumer: /fashion|beauty|ecommerce|grocery/,
  }
  return families[field].test(industry)
}

export const PRODUCT_SPECS: Record<InventionTier, { price: number; cost: number; demand: number }> = {
  small: { price: 100, cost: 55, demand: 300 },
  middle: { price: 350, cost: 200, demand: 2_000 },
  big: { price: 1_500, cost: 900, demand: 10_000 },
  generational: { price: 5_000, cost: 3_200, demand: 50_000 },
}
