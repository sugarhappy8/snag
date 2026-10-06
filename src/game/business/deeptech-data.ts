// Deep-tech data: each industry's commercial ladder, R&D programs, funding sizes, founder
// requirements, plus the per-country ecosystem (venture capital, grants, R&D tax credits,
// regulators, space agencies, export controls). Pure data and small pure helpers: no game state
// is touched here. US dollars at US prices; deeptech-core.ts scales them to each market.
import type { DegreeKind } from '../types'
import { MAX_SERIES, timesDone, type DeepTechIndustry, type TechState } from './deeptech-state'

// ---------------------------------------------------------------------------
// Commercial ladders

export interface StageDef {
  name: string
  /** Demand in "market units" (one unit = what one strong product line sells at home). */
  scale: number
  /** Capacity of each site (lab, design center, launch site...) in market units. */
  siteCap: number
  /** Unit-cost multiplier at this stage (early production is expensive). */
  cost: number
  blurb: string
}

const s = (name: string, scale: number, siteCap: number, cost: number, blurb: string): StageDef => ({ name, scale, siteCap, cost, blurb })

export interface DeepTechDef {
  stages: StageDef[]
  /** Capacity of one unit of plant (fab, gigafactory, GPU cluster...), in market units. */
  plantCap: number
  plant: [string, string]
  /** Price-to-sales multiple investors pay for this industry's revenue. */
  salesMult: number
  /** US round sizes by series index (1 = seed ... 6 = Series E). */
  rounds: number[]
  /** Founder background that lets you skip the technical co-founder. */
  req: { majors: string[]; kinds?: DegreeKind[]; coding?: number; smarts: number; text: string }
  /** The expert you can hire instead (a key-staff role title from industries.ts). */
  expert: string
  /** The industry screen on the company page. */
  screen: { label: string; emoji: string; header: string }
  /** Industry boom/bust cycle: amplitude and the words for each side. */
  cycle: { amp: number; up: string; down: string; name: string }
}

export const DEEP_TECH: Record<DeepTechIndustry, DeepTechDef> = {
  semiconductor: {
    stages: [
      s('Chip design startup', 0, 0, 1.4, 'Designing your first chip. Nothing to sell yet.'),
      s('First silicon', 0.12, 0.2, 1.3, 'Engineering samples and small runs for early customers.'),
      s('Shipping chips (fabless)', 1, 1.3, 1, 'Foundries make your chips; you design and sell them.'),
      s('Running your own fab', 2.4, 1.3, 0.85, 'You make your own chips, and other people’s too.'),
      s('Leading-edge chipmaker', 5, 1.3, 0.78, 'One of a handful of companies on Earth at the cutting edge.'),
    ],
    plantCap: 3,
    plant: ['fab', 'fabs'],
    salesMult: 6,
    rounds: [0, 6_000_000, 20_000_000, 60_000_000, 150_000_000, 350_000_000, 700_000_000],
    req: { majors: ['Engineering', 'Physics', 'Computer Science', 'Chemistry'], smarts: 82, text: 'an engineering, physics, chemistry or CS degree (or smarts 82+)' },
    expert: 'Chief Process Engineer',
    screen: { label: 'Chips & Fabs', emoji: '\u{1F4BE}', header: 'Process node, yields and factories. Smaller nodes sell for more; better yields cost less.' },
    cycle: { amp: 0.2, up: 'chip shortage', down: 'chip glut', name: 'chip cycle' },
  },
  aiLab: {
    stages: [
      s('Research lab', 0, 0, 1.2, 'Researchers, whiteboards and a GPU budget. No product yet.'),
      s('First model released', 0.25, 0.5, 1.2, 'A model people can try. Early adopters only.'),
      s('Paying API customers', 1, 0.5, 1, 'Developers pay to build on your models.'),
      s('Enterprise platform', 3, 0.5, 0.95, 'Big companies run their business on your AI.'),
      s('Frontier lab', 10, 0.5, 0.9, 'One of the labs defining the state of the art.'),
    ],
    plantCap: 4,
    plant: ['GPU cluster', 'GPU clusters'],
    salesMult: 10,
    rounds: [0, 6_000_000, 25_000_000, 100_000_000, 300_000_000, 900_000_000, 2_000_000_000],
    req: { majors: ['Computer Science', 'Mathematics', 'Physics', 'Engineering', 'Information Systems'], coding: 45, smarts: 85, text: 'a CS, math or physics degree, coding skill 45+ (or smarts 85+)' },
    expert: 'Chief Scientist',
    screen: { label: 'Compute & Models', emoji: '\u{1F5A5}\u{FE0F}', header: 'Models are only as good as the compute behind them, and the frontier moves every year.' },
    cycle: { amp: 0.35, up: 'AI boom', down: 'AI winter', name: 'AI hype cycle' },
  },
  robotics: {
    stages: [
      s('Prototype', 0, 0, 1.6, 'A robot that mostly works, on a good day, in the lab.'),
      s('Customer pilots', 0.15, 0.2, 1.4, 'A few robots working at real customers.'),
      s('Production', 1, 1, 1, 'Robots coming off your own production line.'),
      s('Mass production', 3, 1, 0.8, 'Robots by the thousand.'),
    ],
    plantCap: 2.5,
    plant: ['production line', 'production lines'],
    salesMult: 6,
    rounds: [0, 5_000_000, 15_000_000, 50_000_000, 120_000_000, 300_000_000, 600_000_000],
    req: { majors: ['Engineering', 'Computer Science', 'Physics'], coding: 35, smarts: 78, text: 'an engineering, CS or physics degree, coding skill 35+ (or smarts 78+)' },
    expert: 'Head of Robotics',
    screen: { label: 'Robot Lab', emoji: '\u{1F9BE}', header: 'Prototypes, pilots and production. And the occasional live demo.' },
    cycle: { amp: 0.12, up: 'automation boom', down: 'capex freeze', name: 'automation cycle' },
  },
  biotech: {
    stages: [
      s('Drug discovery', 0, 0, 1, 'Looking for molecules worth testing in people.'),
      s('Phase I trials', 0, 0, 1, 'Testing safety in a small group of volunteers.'),
      s('Phase II trials', 0, 0, 1, 'Does it actually work? The make-or-break phase.'),
      s('Phase III trials', 0, 0, 1, 'Big, expensive trials to prove it to the regulator.'),
      s('Approved drug on the market', 1, 0, 1, 'Selling an approved medicine.'),
    ],
    plantCap: 4,
    plant: ['biologics plant', 'biologics plants'],
    salesMult: 6,
    rounds: [0, 7_000_000, 25_000_000, 70_000_000, 150_000_000, 250_000_000, 400_000_000],
    req: { majors: ['Biology', 'Chemistry'], kinds: ['md', 'pharmd'], smarts: 85, text: 'a biology or chemistry degree, an MD or PharmD (or smarts 85+)' },
    expert: 'Chief Medical Officer',
    screen: { label: 'Drug Pipeline', emoji: '\u{1F48A}', header: 'Most drugs fail in trials. The ones that make it pay for all the others.' },
    cycle: { amp: 0.1, up: 'biotech bull market', down: 'biotech funding drought', name: 'biotech funding cycle' },
  },
  spaceTech: {
    stages: [
      s('Engine tests', 0, 0, 1.2, 'Static fires in the desert. Loud, expensive, not yet orbital.'),
      s('Rocket development', 0, 0, 1.2, 'Building a rocket that can reach orbit.'),
      s('Test flights', 0, 0, 1.2, 'The rocket is on the pad. Will it fly, or will it be a fireball?'),
      s('Operational launches', 0.6, 1, 1, 'Paying customers ride your rockets to orbit.'),
      s('Reusable fleet', 2.5, 2.5, 0.55, 'Boosters land themselves and fly again.'),
    ],
    plantCap: 0,
    plant: ['satellite batch', 'satellite batches'],
    salesMult: 8,
    rounds: [0, 9_000_000, 30_000_000, 90_000_000, 250_000_000, 500_000_000, 1_000_000_000],
    req: { majors: ['Engineering', 'Physics', 'Mathematics'], smarts: 82, text: 'an engineering, physics or math degree (or smarts 82+)' },
    expert: 'Chief Engineer',
    screen: { label: 'Launch Control', emoji: '\u{1F680}', header: 'Rockets, satellites and government contracts. Explosions are part of the learning curve.' },
    cycle: { amp: 0.1, up: 'space race', down: 'launch glut', name: 'launch market' },
  },
  electricVehicles: {
    stages: [
      s('Prototype', 0, 0, 1.5, 'A hand-built car that drives. Investors love test drives.'),
      s('Low-volume production', 0.25, 0.08, 1.35, 'Hand-assembled cars for early fans.'),
      s('Production hell', 1.5, 0.08, 1.2, 'The gigafactory is built. Making cars in it is another story.'),
      s('Mass production', 4, 0.08, 0.95, 'Cars rolling off the line by the thousand.'),
    ],
    plantCap: 1.2,
    plant: ['factory', 'factories'],
    salesMult: 3,
    rounds: [0, 8_000_000, 40_000_000, 150_000_000, 400_000_000, 800_000_000, 1_500_000_000],
    req: { majors: ['Engineering', 'Physics'], kinds: ['mba'], smarts: 75, text: 'an engineering or physics degree, an MBA (or smarts 75+)' },
    expert: 'Chief Engineer',
    screen: { label: 'Factory Floor', emoji: '\u{1F3ED}', header: 'Batteries, factories and the long road through production hell.' },
    cycle: { amp: 0.12, up: 'EV boom', down: 'EV slowdown', name: 'EV market' },
  },
  quantum: {
    stages: [
      s('Physics lab', 0, 0, 1, 'Qubits in a fridge colder than deep space. No product yet.'),
      s('Noisy qubits', 0.15, 3, 1, 'Research groups pay to experiment with your machine.'),
      s('Cloud access', 0.6, 3, 1, 'Companies rent time on your quantum computer.'),
      s('Error-corrected machines', 2, 3, 1, 'Logical qubits that don’t forget what they were doing.'),
      s('Quantum advantage', 8, 3, 1, 'Solving problems no supercomputer can.'),
    ],
    plantCap: 0,
    plant: ['quantum system', 'quantum systems'],
    salesMult: 18,
    rounds: [0, 8_000_000, 20_000_000, 60_000_000, 150_000_000, 300_000_000, 500_000_000],
    req: { majors: ['Physics', 'Mathematics'], smarts: 88, text: 'a physics or math degree (or smarts 88+)' },
    expert: 'Chief Physicist',
    screen: { label: 'Qubit Lab', emoji: '\u{269B}\u{FE0F}', header: 'More qubits, fewer errors. The hype runs ahead of the physics.' },
    cycle: { amp: 0.15, up: 'quantum hype wave', down: 'quantum winter', name: 'quantum hype cycle' },
  },
  cybersecurity: {
    stages: [
      s('Security consultancy', 0.25, 0.25, 1.2, 'Pen tests and incident response, billed by the hour.'),
      s('First product', 0.7, 1.2, 1, 'Software that catches attackers while you sleep.'),
      s('Security platform', 1.5, 1.5, 0.9, 'Big companies run their security on your platform.'),
      s('Government-cleared', 2.2, 1.5, 0.85, 'Trusted with secrets. Very lucrative, very boring paperwork.'),
    ],
    plantCap: 1,
    plant: ['security operations center', 'security operations centers'],
    salesMult: 9,
    rounds: [0, 2_500_000, 10_000_000, 30_000_000, 80_000_000, 150_000_000, 300_000_000],
    req: { majors: ['Computer Science', 'Information Systems', 'Mathematics', 'Engineering'], coding: 40, smarts: 75, text: 'a CS or IT degree, coding skill 40+ (or smarts 75+)' },
    expert: 'Chief Security Researcher',
    screen: { label: 'Threat Center', emoji: '\u{1F6E1}\u{FE0F}', header: 'Contracts, breaches and zero-days. Paranoia pays.' },
    cycle: { amp: 0.08, up: 'breach panic', down: 'budget squeeze', name: 'security budget cycle' },
  },
}

export function stageName(ind: DeepTechIndustry, stage: number): string {
  const st = DEEP_TECH[ind].stages
  return st[Math.max(0, Math.min(st.length - 1, stage))].name
}

export function maxStage(ind: DeepTechIndustry): number {
  return DEEP_TECH[ind].stages.length - 1
}

// ---------------------------------------------------------------------------
// Semiconductor nodes, AI frontier, drugs

export const NODES = ['65nm', '28nm', '16nm', '7nm', '5nm', '3nm', '2nm']

/** Best benchmark score anyone has in a year (the frontier keeps moving). */
export function frontierScore(year: number): number {
  return Math.max(40, Math.min(99, 52 + 3 * (year - 2020)))
}

export const MODEL_FAMILIES = ['Atlas', 'Orion', 'Nova', 'Sage', 'Lumen', 'Echo', 'Vega', 'Iris', 'Quill', 'Muse', 'Polaris', 'Cirrus']

export interface DrugArea {
  id: string
  label: string
  suffixes: string[]
  /** Peak sales potential range (market units). */
  peak: [number, number]
  /** Added to trial odds. */
  odds: number
}

export const DRUG_AREAS: DrugArea[] = [
  { id: 'oncology', label: 'cancer', suffixes: ['tinib', 'mab', 'ciclib'], peak: [1, 5], odds: -0.05 },
  { id: 'rare', label: 'a rare genetic disease', suffixes: ['gene', 'ersen', 'sidase'], peak: [0.4, 1.8], odds: 0.1 },
  { id: 'obesity', label: 'obesity', suffixes: ['glutide', 'tide'], peak: [2, 8], odds: 0.03 },
  { id: 'alzheimers', label: 'Alzheimer’s', suffixes: ['mab', 'stat'], peak: [2, 7], odds: -0.15 },
  { id: 'autoimmune', label: 'autoimmune disease', suffixes: ['cept', 'kinra', 'mab'], peak: [1, 4], odds: 0 },
  { id: 'heart', label: 'heart disease', suffixes: ['sartan', 'parin', 'siran'], peak: [1, 4], odds: 0 },
  { id: 'infection', label: 'drug-resistant infections', suffixes: ['vir', 'mycin', 'penem'], peak: [0.5, 2.5], odds: 0.03 },
]

const DRUG_START = ['zor', 'vel', 'tra', 'mex', 'qui', 'dar', 'lum', 'sev', 'pel', 'nor', 'cal', 'fen', 'bri', 'osi', 'ral', 'tez']
const DRUG_MID = ['a', 'e', 'i', 'o', 'u', 'ava', 'eli', 'ono', 'axi']

/** A made-up generic drug name from three rolls (0-1). */
export function drugName(area: DrugArea, r1: number, r2: number, r3: number): string {
  const a = DRUG_START[Math.floor(r1 * DRUG_START.length) % DRUG_START.length]
  const b = DRUG_MID[Math.floor(r2 * DRUG_MID.length) % DRUG_MID.length]
  const c = area.suffixes[Math.floor(r3 * area.suffixes.length) % area.suffixes.length]
  const name = `${a}${b}${c}`
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Clinical development steps by the phase a drug has passed (0 = preclinical). */
export interface TrialStep {
  label: string
  years: number
  /** US dollars a year. */
  cost: number
  odds: number
}

export const TRIALS: TrialStep[] = [
  { label: 'Phase I trial', years: 1, cost: 6_000_000, odds: 0.62 },
  { label: 'Phase II trial', years: 2, cost: 14_000_000, odds: 0.38 },
  { label: 'Phase III trial', years: 3, cost: 45_000_000, odds: 0.6 },
  { label: 'regulatory review', years: 1, cost: 3_000_000, odds: 0.88 },
]

export const PHASE_LABEL = ['Preclinical', 'Passed Phase I', 'Passed Phase II', 'Passed Phase III', 'Approved']

/** Odds a drug that has passed `phase` eventually gets approved (for valuations). */
export const APPROVAL_ODDS = [0, 0.1, 0.25, 0.8, 1]

// ---------------------------------------------------------------------------
// R&D programs

export interface ProgCtx {
  t: TechState
  countryId: string
  year: number
  /** Uniform 0-1 from the engine RNG. */
  roll: () => number
  company: string
}

export interface ProgramDef {
  id: string
  label: (t: TechState) => string
  emoji: string
  blurb: string
  years: number
  /** US dollars a year at a steady pace. */
  cost: (t: TechState) => number
  odds: (t: TechState) => number
  /** A big build-out (plant): priced mostly in global dollars, adds book value. */
  capex?: boolean
  /** Why it can't start (null when it can, money and lab slots aside). */
  gate: (t: TechState, countryId: string) => string | null
  /** Apply a success; returns a short line for the lab report. */
  win: (x: ProgCtx) => string
  /** Apply a failure; returns a short line. */
  lose?: (x: ProgCtx) => string
}

const fixed = (n: number) => () => n
const done = (t: TechState, id: string) => timesDone(t, id) > 0
const lvl = (t: TechState, n: number) => (t.level = Math.min(100, t.level + n))
const stageAtLeast = (t: TechState, n: number) => (t.stage = Math.max(t.stage, n))
const hype = (t: TechState, n: number) => (t.hype = Math.max(0, Math.min(100, t.hype + n)))
const prem = (t: TechState, n: number) => (t.premium = Math.min(1, t.premium + n))
const cut = (t: TechState, n: number) => (t.costCut = Math.min(0.6, t.costCut + n))
const boost = (t: TechState, n: number) => (t.boost = Math.min(1.5, t.boost + n))
const once = (t: TechState, id: string): string | null => (done(t, id) ? 'Already done.' : null)

/** Countries under export controls for advanced chips, AI compute and quantum hardware. */
export const RESTRICTED = new Set(['cn', 'ru', 'ir', 'sy'])

/** Best node a company in this country can reach without its own toolchain. */
export function nodeCap(t: TechState, countryId: string): number {
  if (!RESTRICTED.has(countryId) || done(t, 'domestic')) return NODES.length - 1
  return 3
}

/** The best (highest-scoring) model a lab has. */
export function bestModel(t: TechState): { gen: number; score: number; name: string; open: boolean } | null {
  let best: TechState['models'][number] | null = null
  for (const m of t.models) if (!best || m.score > best.score) best = m
  return best
}

export const PROGRAMS: Record<DeepTechIndustry, ProgramDef[]> = {
  semiconductor: [
    {
      id: 'firstChip', label: () => 'First Chip Tape-Out', emoji: '\u{1F4BE}', blurb: 'Send your first design to a foundry on a shared wafer. Does it work?',
      years: 1, cost: fixed(2_500_000), odds: fixed(0.75),
      gate: (t) => once(t, 'firstChip'),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 8), hype(x.t, 8), 'First silicon works! Early customers want samples.'),
      lose: (x) => (lvl(x.t, 2), 'The first chip came back dead on arrival: a timing bug. Back to the drawing board.'),
    },
    {
      id: 'volume', label: () => 'Volume Production Deal', emoji: '\u{1F3ED}', blurb: 'Qualify your chip and book wafer capacity at a big foundry.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.85),
      gate: (t) => once(t, 'volume') ?? (t.stage < 1 ? 'Needs working first silicon.' : null),
      win: (x) => (stageAtLeast(x.t, 2), lvl(x.t, 4), 'A foundry signed you up for volume production. Chips ship this year.'),
    },
    {
      id: 'node', label: (t) => `Shrink to ${NODES[Math.min(NODES.length - 1, t.node + 1)]}`, emoji: '\u{1F52C}', blurb: 'Port your designs to a smaller, faster, pricier process node.',
      years: 2, cost: (t) => 6_000_000 * Math.pow(1.7, t.node), odds: (t) => 0.78 - 0.04 * t.node,
      gate: (t, cid) => (t.stage < 1 ? 'Ship a first chip before chasing smaller nodes.' : t.node >= NODES.length - 1 ? 'You are already on the most advanced node.' : t.node + 1 > nodeCap(t, cid) ? `Export controls block the tools for ${NODES[t.node + 1]}. Build a domestic toolchain first.` : t.node + 1 >= 5 && t.stage < 4 ? 'Nodes this small need your own leading-edge process.' : null),
      win: (x) => (x.t.node = Math.min(NODES.length - 1, x.t.node + 1), lvl(x.t, 7), hype(x.t, 5), `Your chips now run on the ${NODES[x.t.node]} node: faster, cooler and pricier.`),
      lose: (x) => (lvl(x.t, 2), 'The port to the new node hit yield problems nobody could fix in time.'),
    },
    {
      id: 'yield', label: () => 'Yield Improvement Program', emoji: '\u{1F4C8}', blurb: 'More working chips per wafer: lower costs on every unit.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.8),
      gate: (t) => (t.stage < 2 ? 'Needs chips in volume production.' : timesDone(t, 'yield') >= 3 ? 'Yields are as good as they get.' : null),
      win: (x) => ((x.t.yieldRate = Math.min(0.97, x.t.yieldRate + 0.1)), cut(x.t, 0.05), lvl(x.t, 3), `Yields are up to ${Math.round(x.t.yieldRate * 100)}%. Every wafer is worth more.`),
    },
    {
      id: 'aiChip', label: () => 'AI Accelerator Chip', emoji: '\u{1F9E0}', blurb: 'The chip every AI lab is begging for. Hard to design, easy to sell.',
      years: 2, cost: fixed(15_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'aiChip') ?? (t.stage < 2 ? 'Needs chips in volume production.' : t.node < 2 ? 'Needs at least the 16nm node.' : null),
      win: (x) => (prem(x.t, 0.25), boost(x.t, 0.3), hype(x.t, 15), lvl(x.t, 8), 'Your AI accelerator benchmarks beautifully. Cloud giants are calling.'),
      lose: (x) => (lvl(x.t, 2), 'The AI chip taped out late and slower than the competition.'),
    },
    {
      id: 'packaging', label: () => 'Advanced Packaging', emoji: '\u{1F9E9}', blurb: 'Stack chips on chips. Faster, denser, more expensive.',
      years: 1, cost: fixed(8_000_000), odds: fixed(0.75),
      gate: (t) => once(t, 'packaging') ?? (t.stage < 2 ? 'Needs chips in volume production.' : null),
      win: (x) => (prem(x.t, 0.1), lvl(x.t, 4), 'Your chiplets-on-silicon packaging works. Premium customers noticed.'),
    },
    {
      id: 'fab', label: (t) => (t.plant > 0 ? 'Build Another Fab' : 'Build Your Own Fab'), emoji: '\u{1F3D7}\u{FE0F}', blurb: 'Stop renting foundry capacity: build a fab. Cleanrooms are not cheap.',
      years: 3, cost: fixed(180_000_000), odds: fixed(0.88), capex: true,
      gate: (t) => (t.stage < 2 ? 'Needs chips in volume production.' : t.plant >= 3 ? 'Three fabs is plenty to run.' : null),
      win: (x) => ((x.t.plant += 1), stageAtLeast(x.t, 3), cut(x.t, 0.08), lvl(x.t, 6), 'The fab is running. Your own chips, your own capacity, and foundry customers too.'),
      lose: (x) => (lvl(x.t, 1), 'Construction overran and the cleanroom failed certification. The fab has to be redone.'),
    },
    {
      id: 'euv', label: () => 'Leading-Edge Process (EUV)', emoji: '\u{26A1}', blurb: 'Extreme-ultraviolet lithography: the most complex machines ever built, in your fab.',
      years: 3, cost: fixed(300_000_000), odds: fixed(0.55), capex: true,
      gate: (t, cid) => once(t, 'euv') ?? (t.stage < 3 ? 'Needs your own fab.' : t.node < 4 ? 'Needs the 5nm node first.' : RESTRICTED.has(cid) ? 'EUV machines can’t be exported to this country.' : null),
      win: (x) => (stageAtLeast(x.t, 4), (x.t.node = Math.min(NODES.length - 1, x.t.node + 1)), prem(x.t, 0.15), hype(x.t, 20), lvl(x.t, 12), 'You are now a leading-edge chipmaker. There are only a handful of you on Earth.'),
      lose: (x) => (lvl(x.t, 3), 'The EUV process never reached usable yields. Billions of dollars of lessons learned.'),
    },
    {
      id: 'domestic', label: () => 'Domestic Chip Toolchain', emoji: '\u{1F527}', blurb: 'Export controls block foreign tools. Build your own lithography and design software.',
      years: 3, cost: fixed(60_000_000), odds: fixed(0.5), capex: true,
      gate: (t, cid) => (!RESTRICTED.has(cid) ? 'Only needed under export controls.' : once(t, 'domestic')),
      win: (x) => (lvl(x.t, 8), hype(x.t, 15), 'Your homegrown toolchain works. Export controls can’t cap your node anymore.'),
      lose: (x) => (lvl(x.t, 2), 'The domestic tools are years behind. The node cap stays.'),
    },
  ],
  aiLab: [
    {
      id: 'train', label: (t) => `Train ${modelFamily(t)} ${t.models.length + 1}`, emoji: '\u{1F9E0}', blurb: 'A training run: weeks of GPUs crunching data. Bigger runs, better models.',
      years: 1, cost: (t) => 1_500_000 * Math.pow(2.6, t.models.length) * (1 - Math.min(0.45, t.plant * 0.12)), odds: fixed(0.88),
      gate: (t) => (t.models.length >= 10 ? 'Ten generations is a whole family tree.' : t.models.length >= 3 && t.rented + t.plant < 1 ? 'Runs this big need GPU compute: rent or build a cluster.' : t.models.length >= 5 && t.plant < 1 ? 'Frontier-scale runs need your own GPU cluster.' : null),
      win: (x) => trainWin(x),
      lose: (x) => (lvl(x.t, 1), 'The training run diverged halfway through. The loss curve looks like a seismograph.'),
    },
    {
      id: 'api', label: () => 'Developer API & Billing', emoji: '\u{1F50C}', blurb: 'Let developers pay to use your models.',
      years: 1, cost: fixed(1_200_000), odds: fixed(0.92),
      gate: (t) => once(t, 'api') ?? (t.models.length === 0 ? 'Train a model first.' : null),
      win: (x) => (stageAtLeast(x.t, 2), lvl(x.t, 2), 'Your API is live. Developers are building on it.'),
    },
    {
      id: 'enterprise', label: () => 'Enterprise Platform', emoji: '\u{1F3E2}', blurb: 'Security reviews, admin consoles and a sales team in suits.',
      years: 1.5, cost: fixed(5_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'enterprise') ?? (t.stage < 2 ? 'Needs paying API customers first.' : null),
      win: (x) => (stageAtLeast(x.t, 3), lvl(x.t, 3), 'Big companies are signing up. Procurement departments everywhere sighed.'),
    },
    {
      id: 'cluster', label: (t) => (t.plant > 0 ? 'Build Another GPU Cluster' : 'Build a GPU Cluster'), emoji: '\u{1F5A5}\u{FE0F}', blurb: 'Own the compute instead of renting it: cheaper training and more capacity.',
      years: 2, cost: (t) => 40_000_000 * (1 + t.plant * 0.25), odds: fixed(0.9), capex: true,
      gate: (t, cid) => (t.models.length === 0 ? 'Train a first model before buying a data center.' : t.plant >= 6 ? 'Six clusters: the power company already calls you by name.' : RESTRICTED.has(cid) && t.plant >= 2 ? 'Export controls limit how many top GPUs you can buy.' : null),
      win: (x) => ((x.t.plant += 1), lvl(x.t, 3), 'Your GPU cluster is online. The electricity bill is a war crime.'),
    },
    {
      id: 'efficiency', label: () => 'Inference Efficiency', emoji: '\u{2699}\u{FE0F}', blurb: 'Distillation and better kernels: serve the same answers for less.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.75),
      gate: (t) => (t.stage < 2 ? 'Needs paying customers to serve.' : timesDone(t, 'efficiency') >= 3 ? 'Already squeezed dry.' : null),
      win: (x) => (cut(x.t, 0.12), lvl(x.t, 2), 'Serving costs fell sharply. Every API call is more profitable.'),
    },
    {
      id: 'safety', label: () => 'Safety & Alignment Team', emoji: '\u{1F6E1}\u{FE0F}', blurb: 'Red-teaming, evaluations and guardrails: fewer embarrassing incidents.',
      years: 1, cost: fixed(2_000_000), odds: fixed(0.9),
      gate: (t) => (timesDone(t, 'safety') >= 2 ? 'Your safety team is fully staffed.' : null),
      win: (x) => ((x.t.safety = Math.min(100, x.t.safety + 30)), lvl(x.t, 2), 'Your safety team built evals that catch problems before users do.'),
    },
    {
      id: 'agents', label: () => 'Autonomous Agents', emoji: '\u{1F916}', blurb: 'AI that does the work, not just the talking.',
      years: 2, cost: fixed(12_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'agents') ?? (t.stage < 2 ? 'Needs paying customers first.' : t.level < 50 ? 'Needs tech level 50+.' : null),
      win: (x) => (prem(x.t, 0.2), boost(x.t, 0.3), hype(x.t, 20), lvl(x.t, 6), 'Your agents book meetings, fix bugs and file expenses. Customers are hooked.'),
      lose: (x) => (lvl(x.t, 2), 'The agents kept ordering 400 staplers. The launch was shelved.'),
    },
    {
      id: 'frontier', label: () => 'Frontier Breakthrough', emoji: '\u{1F30C}', blurb: 'A new architecture that leapfrogs everyone. Or a very expensive dead end.',
      years: 3, cost: fixed(120_000_000), odds: fixed(0.4),
      gate: (t) => once(t, 'frontier') ?? (t.stage < 3 ? 'Needs an enterprise platform first.' : t.level < 70 ? 'Needs tech level 70+.' : null),
      win: (x) => (stageAtLeast(x.t, 4), hype(x.t, 30), lvl(x.t, 15), 'Breakthrough! Your lab is now one of the few defining the frontier.'),
      lose: (x) => (lvl(x.t, 4), 'The new architecture plateaued. Three years and a fortune for a great research paper.'),
    },
  ],
  robotics: [
    {
      id: 'proto', label: () => 'Working Prototype v2', emoji: '\u{1F527}', blurb: 'A robot that works outside the lab, most of the time.',
      years: 1, cost: fixed(1_500_000), odds: fixed(0.78),
      gate: (t) => once(t, 'proto'),
      win: (x) => (lvl(x.t, 8), hype(x.t, 6), 'Prototype v2 walked, grabbed and sorted all day without catching fire.'),
      lose: (x) => (lvl(x.t, 2), 'Prototype v2 kept falling over. The engineers named it "Bambi".'),
    },
    {
      id: 'pilots', label: () => 'Customer Pilot Program', emoji: '\u{1F91D}', blurb: 'Put robots to work at a few real customers.',
      years: 1, cost: fixed(2_500_000), odds: fixed(0.8),
      gate: (t) => once(t, 'pilots') ?? (!done(t, 'proto') ? 'Needs a working prototype.' : null),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 4), 'Pilot customers want to keep the robots. Some want more.'),
    },
    {
      id: 'line', label: () => 'Production Line', emoji: '\u{1F3ED}', blurb: 'Stop building robots by hand.',
      years: 2, cost: fixed(15_000_000), odds: fixed(0.85), capex: true,
      gate: (t) => once(t, 'line') ?? (t.stage < 1 ? 'Needs customer pilots first.' : null),
      win: (x) => ((x.t.plant += 1), stageAtLeast(x.t, 2), lvl(x.t, 4), 'Your production line is humming. Robots building robots, sort of.'),
    },
    {
      id: 'dexterity', label: () => 'Dexterous Hands', emoji: '\u{270B}', blurb: 'Hands that can fold laundry and pick a grape without crushing it.',
      years: 2, cost: fixed(4_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'dexterity') ?? (!done(t, 'proto') ? 'Needs a working prototype.' : null),
      win: (x) => (prem(x.t, 0.15), lvl(x.t, 7), 'Your robot hands can now crack an egg into a bowl. Customers pay more for that.'),
    },
    {
      id: 'humanoid', label: () => 'Humanoid Robot', emoji: '\u{1F6B6}', blurb: 'Two legs, two arms, one viral video away from fame.',
      years: 2, cost: fixed(12_000_000), odds: fixed(0.5),
      gate: (t) => once(t, 'humanoid') ?? (!done(t, 'proto') ? 'Needs a working prototype.' : t.level < 40 ? 'Needs tech level 40+.' : null),
      win: (x) => (prem(x.t, 0.2), boost(x.t, 0.25), hype(x.t, 25), lvl(x.t, 8), 'Your humanoid walks, talks and loads a dishwasher. The internet lost its mind.'),
      lose: (x) => (lvl(x.t, 2), 'The humanoid project stalled: it still can’t climb stairs without a dramatic tumble.'),
    },
    {
      id: 'costdown', label: () => 'Cost-Down Redesign', emoji: '\u{1F4B2}', blurb: 'Same robot, half the parts.',
      years: 1, cost: fixed(5_000_000), odds: fixed(0.8),
      gate: (t) => (t.stage < 2 ? 'Needs a production line first.' : timesDone(t, 'costdown') >= 2 ? 'There’s nothing left to cut.' : null),
      win: (x) => (cut(x.t, 0.12), lvl(x.t, 2), 'The redesign cut the bill of materials sharply.'),
    },
    {
      id: 'gigaline', label: () => 'Mass Production Gigaline', emoji: '\u{1F3D7}\u{FE0F}', blurb: 'A factory that builds robots by the thousand.',
      years: 3, cost: fixed(60_000_000), odds: fixed(0.82), capex: true,
      gate: (t) => once(t, 'gigaline') ?? (t.stage < 2 ? 'Needs a production line first.' : null),
      win: (x) => ((x.t.plant += 2), stageAtLeast(x.t, 3), lvl(x.t, 5), 'The gigaline is open. Robots are now a mass-market product.'),
    },
    {
      id: 'brain', label: () => 'Robot Foundation Model', emoji: '\u{1F9E0}', blurb: 'One AI brain that can learn any task from a few demonstrations.',
      years: 2, cost: fixed(15_000_000), odds: fixed(0.55),
      gate: (t) => once(t, 'brain') ?? (t.level < 55 ? 'Needs tech level 55+.' : null),
      win: (x) => (boost(x.t, 0.2), hype(x.t, 15), lvl(x.t, 10), 'Your robots now learn new jobs from a single video. Customers are lining up.'),
    },
  ],
  biotech: [
    {
      id: 'discovery', label: () => 'Drug Discovery Program', emoji: '\u{1F52C}', blurb: 'Screen thousands of molecules to find one worth taking into people.',
      years: 2, cost: fixed(2_500_000), odds: (t) => 0.65 + Math.min(0.15, timesDone(t, 'platform') * 0.12),
      gate: (t) => (t.drugs.filter((d) => !d.failed && d.phase < 4).length >= 4 ? 'Your pipeline is full (four candidates).' : null),
      win: (x) => discoveryWin(x),
      lose: (x) => (lvl(x.t, 2), 'Every promising molecule turned out to be toxic to mice. And to the budget.'),
    },
    {
      id: 'platform', label: () => 'Platform Technology', emoji: '\u{1F9EA}', blurb: 'Gene editing, mRNA or AI-designed molecules: better candidates, every time.',
      years: 2, cost: fixed(6_000_000), odds: fixed(0.65),
      gate: (t) => once(t, 'platform'),
      win: (x) => { lvl(x.t, 12); hype(x.t, 10); for (const d of x.t.drugs) if (!d.failed && d.phase < 4) d.quality = Math.min(100, d.quality + 8); return 'Your platform works: every candidate in the pipeline just got better.' },
    },
    {
      id: 'manufacturing', label: () => 'Biologics Plant', emoji: '\u{1F3ED}', blurb: 'Make your own medicines instead of paying a contract manufacturer.',
      years: 2, cost: fixed(35_000_000), odds: fixed(0.85), capex: true,
      gate: (t) => once(t, 'manufacturing') ?? (!t.drugs.some((d) => !d.failed && d.phase >= 3 && d.royalty >= 1) ? 'Needs a drug of your own past Phase III.' : null),
      win: (x) => ((x.t.plant += 1), cut(x.t, 0.3), lvl(x.t, 3), 'Your biologics plant passed inspection. Production costs fell by a third.'),
    },
    {
      id: 'diagnostics', label: () => 'Companion Diagnostic', emoji: '\u{1F9EB}', blurb: 'A test that finds the patients your drug works best on.',
      years: 1, cost: fixed(2_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'diagnostics') ?? (!t.drugs.some((d) => !d.failed && d.phase >= 2) ? 'Needs a drug past Phase II.' : null),
      win: (x) => { prem(x.t, 0.1); lvl(x.t, 3); for (const d of x.t.drugs) if (!d.failed && d.phase < 4) d.quality = Math.min(100, d.quality + 5); return 'Your companion test picks the right patients. Trials and doctors love it.' },
    },
  ],
  spaceTech: [
    {
      id: 'engine', label: () => 'Rocket Engine', emoji: '\u{1F525}', blurb: 'Design, build and static-fire an engine that doesn’t melt.',
      years: 2, cost: fixed(3_000_000), odds: fixed(0.75),
      gate: (t) => once(t, 'engine'),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 10), hype(x.t, 8), 'A full-duration static fire! The neighbors complained about the noise.'),
      lose: (x) => (lvl(x.t, 3), 'The engine blew its turbopump on the test stand. Spectacular. Expensive.'),
    },
    {
      id: 'rocket', label: () => 'Orbital Rocket', emoji: '\u{1F680}', blurb: 'Stack the stages and get the whole thing ready for a first flight.',
      years: 3, cost: fixed(25_000_000), odds: fixed(0.85),
      gate: (t) => once(t, 'rocket') ?? (t.stage < 1 ? 'Needs a working engine.' : null),
      win: (x) => (stageAtLeast(x.t, 2), lvl(x.t, 8), hype(x.t, 10), 'Your rocket is standing on the pad. Time for a test flight.'),
    },
    {
      id: 'smallsat', label: () => 'Small Satellite Bus', emoji: '\u{1F6F0}\u{FE0F}', blurb: 'Build satellites for other companies while your rocket gets ready.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'smallsat'),
      win: (x) => (lvl(x.t, 4), 'You can build small satellites for paying customers now.'),
    },
    {
      id: 'reuse', label: () => 'Reusable Booster', emoji: '\u{267B}\u{FE0F}', blurb: 'Land the first stage and fly it again. Cuts launch costs nearly in half.',
      years: 2, cost: fixed(50_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'reuse') ?? (t.stage < 3 ? 'Needs an operational rocket.' : null),
      win: (x) => (stageAtLeast(x.t, 4), hype(x.t, 20), lvl(x.t, 8), 'The booster landed on its legs and flew again a month later. Launch costs collapsed.'),
      lose: (x) => (lvl(x.t, 3), 'Every landing attempt ended as a crater. Still expendable, for now.'),
    },
    {
      id: 'sats', label: (t) => `Satellite Constellation Batch ${t.sats + 1}`, emoji: '\u{1F310}', blurb: 'Your own satellites in orbit: internet from space, paid monthly.',
      years: 1, cost: fixed(70_000_000), odds: fixed(0.9), capex: true,
      gate: (t) => (t.stage < 3 ? 'Needs an operational rocket.' : t.sats >= 12 ? 'Twelve batches: astronomers already hate you.' : null),
      win: (x) => ((x.t.sats += 1), lvl(x.t, 2), `Batch ${x.t.sats} is in orbit. Subscribers can see your satellites trail across the night sky.`),
    },
    {
      id: 'crew', label: () => 'Crew Capsule', emoji: '\u{1F469}\u{200D}\u{1F680}', blurb: 'Fly people. Tourists, astronauts, the occasional billionaire.',
      years: 3, cost: fixed(90_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'crew') ?? (t.stage < 3 ? 'Needs an operational rocket.' : t.level < 55 ? 'Needs tech level 55+.' : null),
      win: (x) => (prem(x.t, 0.3), hype(x.t, 30), lvl(x.t, 10), 'Your capsule is human-rated. Astronauts and tourists are booking seats.'),
    },
    {
      id: 'lander', label: () => 'Lunar Lander', emoji: '\u{1F319}', blurb: 'Put a lander on the Moon. Governments pay well for that.',
      years: 3, cost: fixed(80_000_000), odds: fixed(0.5),
      gate: (t) => once(t, 'lander') ?? (t.stage < 3 ? 'Needs an operational rocket.' : t.level < 65 ? 'Needs tech level 65+.' : null),
      win: (x) => (hype(x.t, 40), boost(x.t, 0.2), lvl(x.t, 10), 'Touchdown on the Moon! Your lander sent back a selfie.'),
      lose: (x) => (lvl(x.t, 4), 'The lander made a new crater on the Moon. Close, but no landing.'),
    },
  ],
  electricVehicles: [
    {
      id: 'prototype', label: () => 'Drivable Prototype', emoji: '\u{1F697}', blurb: 'A hand-built car that drives well enough for a test drive.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'prototype'),
      win: (x) => (lvl(x.t, 8), hype(x.t, 10), 'Your prototype drove onto the stage at its launch party. Preorders opened.'),
      lose: (x) => (lvl(x.t, 2), 'The prototype’s windows shattered at the unveiling. Memes followed.'),
    },
    {
      id: 'lowvol', label: () => 'Low-Volume Assembly Plant', emoji: '\u{1F529}', blurb: 'A small plant to hand-build the first few thousand cars.',
      years: 2, cost: fixed(25_000_000), odds: fixed(0.85), capex: true,
      gate: (t) => once(t, 'lowvol') ?? (!done(t, 'prototype') ? 'Needs a drivable prototype.' : null),
      win: (x) => ((x.t.plant += 1), stageAtLeast(x.t, 1), lvl(x.t, 4), 'The first customer cars rolled out. Some of the panel gaps are even consistent.'),
    },
    {
      id: 'battery', label: () => 'Battery Chemistry', emoji: '\u{1F50B}', blurb: 'Cheaper cells, longer range.',
      years: 2, cost: fixed(10_000_000), odds: fixed(0.6),
      gate: (t) => (timesDone(t, 'battery') >= 2 ? 'Your chemists are out of ideas for now.' : null),
      win: (x) => (cut(x.t, 0.08), prem(x.t, 0.05), lvl(x.t, 6), 'New battery cells: more range, lower cost per kWh.'),
    },
    {
      id: 'giga', label: (t) => (t.stage >= 2 ? 'Another Gigafactory' : 'Gigafactory'), emoji: '\u{1F3ED}', blurb: 'A factory big enough to see from space.',
      years: 3, cost: fixed(220_000_000), odds: fixed(0.85), capex: true,
      gate: (t) => (t.stage < 1 ? 'Needs low-volume production first.' : timesDone(t, 'giga') >= 3 ? 'Three gigafactories is an empire.' : null),
      win: (x) => ((x.t.plant += 3), stageAtLeast(x.t, 2), lvl(x.t, 4), x.t.stage === 2 ? 'The gigafactory is open. Welcome to production hell.' : 'Another gigafactory is open and running.'),
    },
    {
      id: 'ramp', label: () => 'Escape Production Hell', emoji: '\u{1F635}', blurb: 'Fix the line, sleep at the factory, ship the cars.',
      years: 1, cost: fixed(30_000_000), odds: fixed(0.6),
      gate: (t) => (t.stage !== 2 ? 'Only needed in production hell.' : null),
      win: (x) => (stageAtLeast(x.t, 3), hype(x.t, 15), lvl(x.t, 4), 'You escaped production hell. Cars now roll off the line every minute.'),
      lose: (x) => (lvl(x.t, 2), 'The line still jams every hour. Production hell continues.'),
    },
    {
      id: 'selfdrive', label: (t) => `Self-Driving Level ${t.autonomy + 2}`, emoji: '\u{1F9ED}', blurb: 'Teach the car to drive itself. Regulators will be watching.',
      years: 2, cost: fixed(20_000_000), odds: fixed(0.5),
      gate: (t) => (t.autonomy >= 3 ? 'Your cars already drive themselves.' : t.level < 45 ? 'Needs tech level 45+.' : null),
      win: (x) => ((x.t.autonomy += 1), prem(x.t, 0.06), hype(x.t, 15), lvl(x.t, 6), `Your cars now handle Level ${x.t.autonomy + 1} driving. Owners post videos of themselves "not driving".`),
      lose: (x) => (lvl(x.t, 2), 'The self-driving system kept mistaking plastic bags for pedestrians. Back to training.'),
    },
    {
      id: 'budget', label: () => 'Budget Model', emoji: '\u{1F4B8}', blurb: 'A car normal people can afford.',
      years: 2, cost: fixed(35_000_000), odds: fixed(0.75),
      gate: (t) => once(t, 'budget') ?? (t.stage < 2 ? 'Needs a gigafactory first.' : null),
      win: (x) => (boost(x.t, 0.4), lvl(x.t, 3), 'Your budget model launched with a waitlist longer than the factory.'),
    },
    {
      id: 'charging', label: () => 'Fast-Charging Network', emoji: '\u{26A1}', blurb: 'Chargers everywhere your customers drive.',
      years: 2, cost: fixed(15_000_000), odds: fixed(0.85),
      gate: (t) => once(t, 'charging') ?? (t.stage < 1 ? 'Needs cars on the road first.' : null),
      win: (x) => (boost(x.t, 0.15), lvl(x.t, 2), 'Your chargers are along every highway. Range anxiety is someone else’s problem.'),
    },
  ],
  quantum: [
    {
      id: 'qubits', label: (t) => `Scale to ${nextQubits(t.qubits)} Qubits`, emoji: '\u{269B}\u{FE0F}', blurb: 'More qubits, held stable for longer.',
      years: 2, cost: (t) => 4_000_000 * Math.pow(1.6, timesDone(t, 'qubits')), odds: fixed(0.7),
      gate: (t) => (t.qubits >= 100_000 ? 'Your fridge is full.' : null),
      win: (x) => { x.t.qubits = nextQubits(x.t.qubits); if (x.t.qubits >= 20) stageAtLeast(x.t, 1); lvl(x.t, 6); hype(x.t, 8); return `Your processor now holds ${x.t.qubits.toLocaleString('en-US')} qubits.` },
      lose: (x) => (lvl(x.t, 2), 'Crosstalk ruined the bigger chip. The qubits decohere faster than you can read them.'),
    },
    {
      id: 'cryo', label: () => 'Better Dilution Fridges', emoji: '\u{2744}\u{FE0F}', blurb: 'Colder, quieter, more reliable fridges.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'cryo'),
      win: (x) => ((x.t.safety = Math.min(100, x.t.safety + 25)), lvl(x.t, 4), 'Your new fridges hold 10 millikelvin for months. Downtime is nearly gone.'),
    },
    {
      id: 'cloud', label: () => 'Quantum Cloud Platform', emoji: '\u{2601}\u{FE0F}', blurb: 'Let companies rent time on your machine over the internet.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.85),
      gate: (t) => once(t, 'cloud') ?? (t.qubits < 20 ? 'Needs at least 20 qubits.' : null),
      win: (x) => (stageAtLeast(x.t, 2), lvl(x.t, 3), 'Your quantum computer is on the cloud. Banks and drug companies are experimenting.'),
    },
    {
      id: 'qec', label: () => 'Error-Correction Milestone', emoji: '\u{1F9EE}', blurb: 'Turn many noisy qubits into a few reliable logical ones.',
      years: 3, cost: fixed(25_000_000), odds: fixed(0.45),
      gate: (t) => (t.qubits < 100 ? 'Needs at least 100 physical qubits.' : timesDone(t, 'qec') >= 4 ? 'Your error correction is state of the art.' : null),
      win: (x) => ((x.t.logical += 2), stageAtLeast(x.t, 3), hype(x.t, 30), lvl(x.t, 10), `Error correction works: ${x.t.logical} logical qubits that stay coherent.`),
      lose: (x) => (lvl(x.t, 3), 'The logical qubits were noisier than the physical ones. Peer reviewers were not kind.'),
    },
    {
      id: 'algorithms', label: () => 'Quantum Algorithms Team', emoji: '\u{1F4D0}', blurb: 'Find problems your machine can actually help with.',
      years: 1, cost: fixed(2_500_000), odds: fixed(0.8),
      gate: (t) => once(t, 'algorithms'),
      win: (x) => (boost(x.t, 0.25), lvl(x.t, 3), 'Your algorithms team found real uses in chemistry and logistics.'),
    },
    {
      id: 'pqc', label: () => 'Post-Quantum Encryption', emoji: '\u{1F510}', blurb: 'Sell banks protection from the computers you are building.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.85),
      gate: (t) => once(t, 'pqc'),
      win: (x) => (lvl(x.t, 2), 'Banks are licensing your quantum-safe encryption. Ironic, and profitable.'),
    },
    {
      id: 'advantage', label: () => 'Practical Quantum Advantage', emoji: '\u{1F3C6}', blurb: 'Solve a real problem no supercomputer can.',
      years: 3, cost: fixed(70_000_000), odds: fixed(0.4),
      gate: (t) => once(t, 'advantage') ?? (t.logical < 4 ? 'Needs at least 4 logical qubits.' : null),
      win: (x) => (stageAtLeast(x.t, 4), hype(x.t, 40), lvl(x.t, 12), 'Quantum advantage! Your machine simulated a molecule no supercomputer could.'),
      lose: (x) => (lvl(x.t, 3), 'A classical algorithm matched your "impossible" result a week later. Ouch.'),
    },
  ],
  cybersecurity: [
    {
      id: 'detect', label: () => 'Threat Detection Engine', emoji: '\u{1F50E}', blurb: 'Software that spots attackers in a network.',
      years: 1, cost: fixed(1_500_000), odds: fixed(0.8),
      gate: (t) => once(t, 'detect'),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 8), 'Your detection engine caught a real intruder at a pilot customer. Sales are easy now.'),
    },
    {
      id: 'platform', label: () => 'Zero-Trust Platform', emoji: '\u{1F9F1}', blurb: 'Identity, endpoints and network in one platform.',
      years: 2, cost: fixed(5_000_000), odds: fixed(0.75),
      gate: (t) => once(t, 'platform') ?? (t.stage < 1 ? 'Needs a first product.' : null),
      win: (x) => (stageAtLeast(x.t, 2), prem(x.t, 0.1), lvl(x.t, 6), 'Your platform replaces six other vendors. CISOs love fewer logins.'),
    },
    {
      id: 'clearance', label: () => 'Government Security Clearance', emoji: '\u{1F3DB}\u{FE0F}', blurb: 'Audits, background checks and a lot of forms.',
      years: 2, cost: fixed(2_500_000), odds: fixed(0.7),
      gate: (t) => once(t, 'clearance') ?? (t.stage < 2 ? 'Needs a security platform first.' : null),
      win: (x) => (stageAtLeast(x.t, 3), lvl(x.t, 3), 'You are cleared to work on classified systems. Government buyers are calling.'),
    },
    {
      id: 'aiSec', label: () => 'AI Security Copilot', emoji: '\u{1F916}', blurb: 'An AI analyst that triages alerts at 3 AM.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.7),
      gate: (t) => once(t, 'aiSec') ?? (t.stage < 1 ? 'Needs a first product.' : t.level < 45 ? 'Needs tech level 45+.' : null),
      win: (x) => (prem(x.t, 0.15), boost(x.t, 0.2), hype(x.t, 15), lvl(x.t, 5), 'Your AI copilot closes alerts faster than a room of analysts.'),
    },
    {
      id: 'redteam', label: () => 'Elite Red Team', emoji: '\u{1F3AF}', blurb: 'Hire hackers to break into your own products first.',
      years: 1, cost: fixed(1_500_000), odds: fixed(0.85),
      gate: (t) => once(t, 'redteam'),
      win: (x) => ((x.t.safety = Math.min(100, x.t.safety + 20)), lvl(x.t, 5), 'Your red team found (and you fixed) a dozen holes before anyone else did.'),
    },
    {
      id: 'bounty', label: () => 'Bug Bounty Program', emoji: '\u{1F41B}', blurb: 'Pay friendly hackers for every bug they find.',
      years: 1, cost: fixed(800_000), odds: fixed(0.9),
      gate: (t) => once(t, 'bounty'),
      win: (x) => ((x.t.safety = Math.min(100, x.t.safety + 15)), hype(x.t, 5), 'Your bug bounty paid out to 140 researchers. Your products are harder to break.'),
    },
    {
      id: 'soc', label: (t) => (t.plant > 0 ? 'Another Security Operations Center' : '24/7 Security Operations Center'), emoji: '\u{1F5A5}\u{FE0F}', blurb: 'Analysts watching client networks around the clock.',
      years: 1, cost: fixed(6_000_000), odds: fixed(0.85), capex: true,
      gate: (t) => (t.stage < 1 ? 'Needs a first product.' : t.plant >= 4 ? 'You already follow the sun.' : null),
      win: (x) => ((x.t.plant += 1), boost(x.t, 0.15), lvl(x.t, 2), 'Your new SOC watches client networks around the clock.'),
    },
  ],
}

function modelFamily(t: TechState): string {
  const first = t.models[0]?.name ?? ''
  const fam = first.replace(/\s+\d+$/, '')
  return fam || MODEL_FAMILIES[t.seq % MODEL_FAMILIES.length]
}

function trainWin(x: ProgCtx): string {
  const t = x.t
  const gen = t.models.length + 1
  const frontier = frontierScore(x.year)
  const compute = Math.min(12, t.plant * 2 + t.rented * 0.8)
  const score = Math.round(Math.max(5, Math.min(99, frontier - 30 + t.level * 0.35 + gen * 2.5 + compute + (x.roll() - 0.5) * 12)))
  const name = `${modelFamily(t)} ${gen}`
  t.models.push({ gen, name, score, open: false, year: x.year })
  if (t.models.length > 10) t.models.splice(0, t.models.length - 10)
  t.stage = Math.max(t.stage, 1)
  t.level = Math.min(100, t.level + 5)
  t.hype = Math.max(0, Math.min(100, t.hype + (score >= frontier ? 20 : score >= frontier - 8 ? 8 : 2)))
  const vs = score >= frontier ? 'a new state of the art' : score >= frontier - 8 ? 'close to the frontier' : 'well behind the frontier'
  return `${name} finished training: benchmark score ${score} (${vs}; the best anyone has is about ${frontier}).`
}

function discoveryWin(x: ProgCtx): string {
  const t = x.t
  const area = DRUG_AREAS[Math.floor(x.roll() * DRUG_AREAS.length) % DRUG_AREAS.length]
  const name = drugName(area, x.roll(), x.roll(), x.roll())
  t.seq += 1
  const quality = Math.round(Math.max(10, Math.min(95, 35 + t.level * 0.4 + (x.roll() - 0.5) * 40 + timesDone(t, 'platform') * 8)))
  const peak = Math.round((area.peak[0] + (area.peak[1] - area.peak[0]) * x.roll()) * 100) / 100
  t.drugs.push({ id: `d${t.seq}`, name, area: area.id, phase: 0, quality, peak, filed: x.year, approved: 0, royalty: 1, partner: '', failed: false })
  if (t.drugs.length > 12) t.drugs.splice(0, t.drugs.length - 12)
  t.level = Math.min(100, t.level + 4)
  return `Discovery found ${name}, a candidate for ${area.label} (molecule quality ${quality}/100). It's ready for a Phase I trial.`
}

export function nextQubits(q: number): number {
  const ladder = [5, 10, 20, 50, 100, 250, 1_000, 5_000, 20_000, 100_000]
  for (const n of ladder) if (n > q) return n
  return Math.min(1_000_000, q * 2)
}

export function programDef(ind: DeepTechIndustry, id: string): ProgramDef | undefined {
  return PROGRAMS[ind].find((p) => p.id === id)
}

// ---------------------------------------------------------------------------
// The ecosystem: venture capital, grants, tax credits, regulators

/** How deep the local venture market is, 0-1 (1 = Silicon Valley money). */
const VC_DEPTH: Record<string, number> = {
  us: 1, cn: 0.75, gb: 0.6, il: 0.6, sg: 0.5, fr: 0.45, de: 0.45, ca: 0.45, ch: 0.45, hk: 0.4, kr: 0.4, se: 0.4, nl: 0.4,
  jp: 0.35, in: 0.35, ae: 0.35, au: 0.35, dk: 0.35, tw: 0.3, ie: 0.3, fi: 0.3, no: 0.3, ee: 0.3, be: 0.3, sa: 0.3,
  es: 0.25, at: 0.25, br: 0.25, it: 0.2, qa: 0.2, pl: 0.15, pt: 0.15, nz: 0.2, cz: 0.12, mx: 0.12, tr: 0.12, id: 0.12,
  my: 0.12, th: 0.1, vn: 0.1, ng: 0.08, ke: 0.08, za: 0.1, eg: 0.06, ar: 0.08, cl: 0.1, co: 0.08, ua: 0.08, ru: 0.12,
}

/** Venture depth for a market: listed hubs, else derived from wealth and ease of doing business. */
export function vcDepth(countryId: string, gdpPerCapita: number, ease: number): number {
  const v = VC_DEPTH[countryId]
  if (v !== undefined) return v
  return Math.max(0.02, Math.min(0.2, 0.25 * Math.min(1, Math.max(0, gdpPerCapita) / 60_000) * (Math.max(0, ease) / 80)))
}

/** Refundable R&D tax credit rate by country (share of R&D spending paid back). */
export const RD_CREDIT: Record<string, number> = {
  us: 0.08, ca: 0.35, au: 0.3, gb: 0.2, fr: 0.3, de: 0.25, nl: 0.3, ie: 0.3, jp: 0.12, kr: 0.25, cn: 0.15, sg: 0.15,
  tw: 0.15, it: 0.2, es: 0.25, be: 0.15, at: 0.14, no: 0.19, pt: 0.3, nz: 0.15, dk: 0.13, fi: 0.1, se: 0.1, cz: 0.1,
  pl: 0.1, hu: 0.1, in: 0.05, br: 0.1, il: 0.05, ch: 0.1,
}

const EU = ['at', 'be', 'hr', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'nl', 'pl', 'pt', 'ro', 'sk', 'es', 'se']

export function inEu(countryId: string): boolean {
  return EU.includes(countryId)
}

const DRUG_REGULATOR: Record<string, string> = {
  us: 'the FDA', gb: 'the MHRA', ca: 'Health Canada', au: 'the TGA', nz: 'Medsafe', jp: 'the PMDA', cn: 'the NMPA', kr: 'the MFDS',
  tw: 'the TFDA', in: 'the CDSCO', br: 'ANVISA', ch: 'Swissmedic', ng: 'NAFDAC', za: 'SAHPRA', ru: 'Roszdravnadzor', mx: 'COFEPRIS',
  ar: 'ANMAT', sg: 'the HSA', sa: 'the SFDA', eg: 'the Egyptian Drug Authority', ke: 'the Pharmacy and Poisons Board', hk: 'the Department of Health',
  tr: 'TİTCK', il: 'the Israeli Ministry of Health', ae: 'the Emirates Drug Establishment', id: 'BPOM', th: 'the Thai FDA', my: 'the NPRA',
  ph: 'the Philippine FDA', vn: 'the Drug Administration of Vietnam', cl: 'the ISP', co: 'INVIMA', pe: 'DIGEMID', no: 'NOMA',
}

/** Who approves new medicines in a country. */
export function drugRegulator(countryId: string): string {
  return DRUG_REGULATOR[countryId] ?? (inEu(countryId) ? 'the EMA' : 'the national medicines regulator')
}

const SPACE_AGENCY: Record<string, string> = {
  us: 'NASA', cn: 'CNSA', ru: 'Roscosmos', in: 'ISRO', jp: 'JAXA', fr: 'CNES', de: 'DLR', gb: 'the UK Space Agency', it: 'ASI',
  ca: 'the Canadian Space Agency', kr: 'KASA', ae: 'the UAE Space Agency', au: 'the Australian Space Agency', br: 'AEB', il: 'the Israel Space Agency',
  nz: 'the NZ Space Agency', sa: 'the Saudi Space Agency', tr: 'TUA', ua: 'the State Space Agency of Ukraine', mx: 'AEM', ar: 'CONAE',
  ng: 'NASRDA', za: 'SANSA', eg: 'the Egyptian Space Agency', ir: 'the Iranian Space Agency', kz: 'Kazcosmos',
}

export function spaceAgency(countryId: string): string {
  return SPACE_AGENCY[countryId] ?? (inEu(countryId) ? 'ESA' : 'the national space agency')
}

const DEFENSE: Record<string, string> = {
  us: 'the Pentagon', gb: 'the Ministry of Defence', fr: 'the Ministry of the Armed Forces', il: 'the Defense Ministry', cn: 'the PLA', ru: 'the Defense Ministry',
  in: 'DRDO', jp: 'the Ministry of Defense', kr: 'the Defense Acquisition Program Administration', de: 'the Bundeswehr', au: 'the Department of Defence',
  ca: 'the Department of National Defence', tw: 'the Ministry of National Defense',
}

/** Who buys security and AI for the military (flavor for government contracts). */
export function defenseBuyer(countryId: string): string {
  return DEFENSE[countryId] ?? 'the defense ministry'
}

const AI_REGULATOR: Record<string, string> = {
  us: 'the FTC', gb: 'the AI Security Institute', cn: 'the Cyberspace Administration', jp: 'the AI Safety Institute', kr: 'the Ministry of Science and ICT',
  ca: 'the AI and Data Commissioner', in: 'MeitY', sg: 'the IMDA', au: 'the eSafety Commissioner', br: 'the ANPD', ae: 'the AI Office',
}

export function aiRegulator(countryId: string): string {
  return AI_REGULATOR[countryId] ?? (inEu(countryId) ? 'the EU AI Office' : 'the digital regulator')
}

// ---------------------------------------------------------------------------
// Grants

export interface GrantDef {
  id: string
  name: string
  /** Country ids, or 'eu' for every EU member. */
  where: string[] | 'eu'
  /** Industries that qualify ('all' for every deep-tech industry). */
  who: DeepTechIndustry[] | 'all'
  /** Largest award in US dollars. */
  max: number
  /** Share of this year's R&D (or of a capital project's cost) it covers. */
  share: number
  odds: number
  /** Only for big capital projects (fabs, gigafactories) that are being built. */
  capex?: boolean
  blurb: string
}

const ALL_DT = 'all' as const

export const GRANTS: GrantDef[] = [
  { id: 'us-sbir', name: 'SBIR Phase II Award', where: ['us'], who: ALL_DT, max: 1_800_000, share: 0.5, odds: 0.35, blurb: 'The government’s seed fund for small tech firms.' },
  { id: 'us-chips', name: 'CHIPS Act Incentive', where: ['us'], who: ['semiconductor'], max: 500_000_000, share: 0.3, odds: 0.5, capex: true, blurb: 'Federal money for fabs built on home soil.' },
  { id: 'us-darpa', name: 'DARPA Research Contract', where: ['us'], who: ['aiLab', 'robotics', 'quantum', 'spaceTech', 'cybersecurity'], max: 8_000_000, share: 0.6, odds: 0.25, blurb: 'Weird, ambitious research the military might need one day.' },
  { id: 'us-nih', name: 'NIH Research Grant', where: ['us'], who: ['biotech'], max: 3_000_000, share: 0.5, odds: 0.3, blurb: 'Public money for early medical research.' },
  { id: 'us-doe', name: 'DOE Advanced Manufacturing Grant', where: ['us'], who: ['electricVehicles'], max: 150_000_000, share: 0.25, odds: 0.4, capex: true, blurb: 'Help building battery and EV factories.' },
  { id: 'eu-eic', name: 'EIC Accelerator', where: 'eu', who: ALL_DT, max: 2_700_000, share: 0.7, odds: 0.18, blurb: 'Europe’s flagship grant for breakthrough startups.' },
  { id: 'eu-ipcei', name: 'IPCEI Strategic Project Aid', where: 'eu', who: ['semiconductor', 'electricVehicles'], max: 300_000_000, share: 0.3, odds: 0.45, capex: true, blurb: 'State aid for projects of common European interest.' },
  { id: 'eu-horizon', name: 'Horizon Europe Research Grant', where: 'eu', who: ['quantum', 'biotech', 'aiLab', 'spaceTech', 'robotics'], max: 4_000_000, share: 0.6, odds: 0.25, blurb: 'Europe’s big research budget.' },
  { id: 'gb-innovate', name: 'Innovate UK Smart Grant', where: ['gb'], who: ALL_DT, max: 1_200_000, share: 0.6, odds: 0.3, blurb: 'The UK’s workhorse innovation grant.' },
  { id: 'gb-aria', name: 'ARIA Programme', where: ['gb'], who: ['aiLab', 'robotics', 'quantum', 'biotech'], max: 8_000_000, share: 0.6, odds: 0.15, blurb: 'High-risk, high-reward research funding.' },
  { id: 'fr-bpi', name: 'Bpifrance Deeptech Grant', where: ['fr', 'mc'], who: ALL_DT, max: 2_500_000, share: 0.5, odds: 0.35, blurb: 'France 2030 money for deep-tech startups.' },
  { id: 'de-sprind', name: 'SPRIND Challenge', where: ['de'], who: ALL_DT, max: 5_000_000, share: 0.6, odds: 0.15, blurb: 'Germany’s agency for leap innovations.' },
  { id: 'jp-nedo', name: 'NEDO Grant', where: ['jp'], who: ALL_DT, max: 5_000_000, share: 0.5, odds: 0.3, blurb: 'Japan’s industrial technology agency.' },
  { id: 'jp-meti', name: 'METI Chip Subsidy', where: ['jp'], who: ['semiconductor'], max: 800_000_000, share: 0.4, odds: 0.5, capex: true, blurb: 'Tokyo pays up to 40% of a new fab.' },
  { id: 'kr-kchips', name: 'K-Chips Act Credit', where: ['kr'], who: ['semiconductor'], max: 300_000_000, share: 0.2, odds: 0.6, capex: true, blurb: 'Seoul’s tax credits for chip investment.' },
  { id: 'kr-iitp', name: 'IITP R&D Grant', where: ['kr'], who: ['aiLab', 'robotics', 'quantum', 'cybersecurity'], max: 3_000_000, share: 0.5, odds: 0.3, blurb: 'Korea’s ICT research fund.' },
  { id: 'tw-aplus', name: 'A+ Industrial Innovation Grant', where: ['tw'], who: ALL_DT, max: 2_500_000, share: 0.5, odds: 0.35, blurb: 'Taiwan’s R&D matching grant.' },
  { id: 'tw-park', name: 'Science Park Fab Incentive', where: ['tw'], who: ['semiconductor'], max: 200_000_000, share: 0.15, odds: 0.55, capex: true, blurb: 'Land, power and tax breaks in a science park.' },
  { id: 'cn-bigfund', name: 'National IC Industry Fund', where: ['cn'], who: ['semiconductor'], max: 600_000_000, share: 0.35, odds: 0.5, capex: true, blurb: 'The "Big Fund" for homegrown chips.' },
  { id: 'cn-guidance', name: 'Local Government Guidance Fund', where: ['cn'], who: ALL_DT, max: 20_000_000, share: 0.4, odds: 0.35, blurb: 'City governments compete to host strategic industries.' },
  { id: 'in-ism', name: 'India Semiconductor Mission', where: ['in'], who: ['semiconductor'], max: 500_000_000, share: 0.5, odds: 0.45, capex: true, blurb: 'New Delhi covers half the cost of a fab.' },
  { id: 'in-birac', name: 'BIRAC Biotech Grant', where: ['in'], who: ['biotech'], max: 1_000_000, share: 0.5, odds: 0.35, blurb: 'Seed money for Indian biotech.' },
  { id: 'in-space', name: 'IN-SPACe Support Program', where: ['in'], who: ['spaceTech'], max: 3_000_000, share: 0.5, odds: 0.35, blurb: 'Help for private space companies.' },
  { id: 'il-iia', name: 'Israel Innovation Authority Grant', where: ['il'], who: ALL_DT, max: 3_000_000, share: 0.5, odds: 0.4, blurb: 'The fund behind the "startup nation".' },
  { id: 'ca-irap', name: 'NRC IRAP Funding', where: ['ca'], who: ALL_DT, max: 1_000_000, share: 0.6, odds: 0.4, blurb: 'Canada’s industrial research assistance.' },
  { id: 'sg-edb', name: 'EDB Research Incentive', where: ['sg'], who: ALL_DT, max: 3_000_000, share: 0.5, odds: 0.35, blurb: 'Singapore pays to host your R&D.' },
  { id: 'ae-ai', name: 'Sovereign AI Fund', where: ['ae'], who: ['aiLab'], max: 50_000_000, share: 0.5, odds: 0.25, blurb: 'Abu Dhabi wants to be an AI superpower.' },
  { id: 'sa-vision', name: 'Vision 2030 Tech Fund', where: ['sa'], who: ALL_DT, max: 20_000_000, share: 0.5, odds: 0.25, blurb: 'Riyadh diversifying away from oil.' },
  { id: 'au-mrff', name: 'Medical Research Future Fund', where: ['au'], who: ['biotech'], max: 3_000_000, share: 0.5, odds: 0.3, blurb: 'Australian money for medical research.' },
  { id: 'nl-invest', name: 'Invest-NL Deep Tech Fund', where: ['nl'], who: ALL_DT, max: 5_000_000, share: 0.5, odds: 0.3, blurb: 'Dutch money for hard tech.' },
  { id: 'ch-innosuisse', name: 'Innosuisse Innovation Project', where: ['ch'], who: ALL_DT, max: 1_500_000, share: 0.5, odds: 0.4, blurb: 'Switzerland’s innovation agency.' },
  { id: 'dk-ifd', name: 'Innovation Fund Denmark', where: ['dk'], who: ALL_DT, max: 2_000_000, share: 0.5, odds: 0.35, blurb: 'Danish money for research-heavy startups.' },
  { id: 'se-vinnova', name: 'Vinnova Grant', where: ['se'], who: ALL_DT, max: 2_000_000, share: 0.5, odds: 0.35, blurb: 'Sweden’s innovation agency.' },
  { id: 'no-innovation', name: 'Innovation Norway Grant', where: ['no'], who: ALL_DT, max: 2_000_000, share: 0.5, odds: 0.35, blurb: 'Oil money, reinvested in tech.' },
  { id: 'fi-bf', name: 'Business Finland Grant', where: ['fi'], who: ALL_DT, max: 2_000_000, share: 0.5, odds: 0.35, blurb: 'Finland’s innovation funding agency.' },
]

/** A grant available anywhere without a named program, sized to the economy. */
export const NATIONAL_GRANT: GrantDef = {
  id: 'national', name: 'National Innovation Grant', where: [], who: ALL_DT, max: 1_500_000, share: 0.4, odds: 0.25, blurb: 'The government’s technology development fund.',
}

/** Grants a company in this country and industry can apply for. */
export function grantsFor(countryId: string, ind: DeepTechIndustry): GrantDef[] {
  const out = GRANTS.filter((gr) => (gr.where === 'eu' ? inEu(countryId) : gr.where.includes(countryId)) && (gr.who === 'all' || gr.who.includes(ind)))
  if (!out.some((gr) => !gr.capex)) out.unshift(NATIONAL_GRANT)
  return out
}

export const MAX_GRANT_AWARDS = 2
export const GRANT_COOLDOWN = 3

/** Seed and later rounds can't exceed Series E; also used by the funding menu. */
export const LAST_SERIES = MAX_SERIES
