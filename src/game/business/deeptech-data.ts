// Deep-tech data: each industry's commercial ladder, R&D programs, funding sizes, founder
// requirements, plus the per-country ecosystem (venture capital, grants, R&D tax credits,
// regulators, space agencies, export controls). Pure data and small pure helpers: no game state
// is touched here. US dollars at US prices; deeptech-core.ts scales them to each market.
import type { DegreeKind } from '../types'
import { CAPS, CAP_IDS, type CapId, type CapMap } from './ai-bench-data'
import { LEAD_ENDING, capWeight, compositeRating, leadTier, modelRating, modelScore, modelSpec, modelStrength, releasedRating, type BestRival } from './ai-bench'
import { CAP_LEVEL_MAX, capTask } from './aicap-effort'
import { MAX_SERIES, nextDrugId, timesDone, type AiModel, type DeepTechIndustry, type TechState } from './deeptech-state'

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
  /**
   * Stage investors want before each series (index = series), instead of the usual ladder and
   * instead of yearly sales: for a trade whose sales stay tiny until its last rungs (a fusion
   * plant is paid for before it sells a watt).
   */
  seriesStage?: readonly number[]
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
    cycle: { amp: 0.12, up: 'electric-vehicle boom', down: 'electric-vehicle slowdown', name: 'electric-vehicle market' },
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
  fusion: {
    stages: [
      s('Plasma physics lab', 0, 0, 1.5, 'A hot plasma that lasts a few milliseconds. Nothing to sell yet.'),
      s('Record plasmas', 0.04, 0.1, 1.4, 'Labs and hospitals rent your neutron sources and magnets.'),
      s('Net energy demonstrated', 0.12, 0.2, 1.3, 'More energy out than in, once. Utilities start returning your calls.'),
      s('Pilot power plant', 1, 1, 1, 'A fusion plant feeding the grid, the first anywhere.'),
      s('Fusion fleet', 4, 1, 0.7, 'Power plants by the dozen, fueled by seawater.'),
    ],
    plantCap: 2,
    plant: ['fusion power plant', 'fusion power plants'],
    salesMult: 10,
    rounds: [0, 14_000_000, 50_000_000, 100_000_000, 250_000_000, 600_000_000, 1_200_000_000],
    // Record plasmas open Series B and C, which pay for the net-energy shot. Net energy opens D and
    // E, which pay for the pilot plant. Sales only start once the plant is on the grid.
    seriesStage: [0, 0, 1, 1, 1, 2, 2],
    req: { majors: ['Physics', 'Engineering', 'Mathematics'], smarts: 86, text: 'a physics, engineering or math degree (or smarts 86+)' },
    expert: 'Chief Plasma Physicist',
    screen: { label: 'Reactor Hall', emoji: '\u{1F31F}', header: 'Hotter plasma, stronger magnets, longer shots. The finish line keeps moving.' },
    cycle: { amp: 0.14, up: 'fusion hype wave', down: 'fusion winter', name: 'fusion funding cycle' },
  },
  neurotech: {
    stages: [
      s('Neuroscience lab', 0, 0, 1.4, 'Electrodes, monkeys and a lot of signal processing. No product yet.'),
      s('Research devices', 0.1, 0.2, 1.3, 'Universities buy your electrodes and recording kits.'),
      s('First human implants', 0.3, 0.4, 1.2, 'Patients in a clinical trial control a cursor with their thoughts.'),
      s('Approved medical device', 1, 1, 1, 'Doctors implant your device in paying patients.'),
      s('Mainstream brain interface', 3.5, 1, 0.75, 'Implants as routine as a pacemaker, and a long waiting list.'),
    ],
    plantCap: 2,
    plant: ['implant factory', 'implant factories'],
    salesMult: 9,
    rounds: [0, 6_000_000, 20_000_000, 70_000_000, 160_000_000, 300_000_000, 600_000_000],
    req: { majors: ['Biology', 'Engineering', 'Psychology', 'Computer Science'], kinds: ['md'], smarts: 84, text: 'a biology, engineering, psychology or CS degree, an MD (or smarts 84+)' },
    expert: 'Chief Neuroscientist',
    screen: { label: 'Neuro Lab', emoji: '\u{1F9E0}', header: 'Electrodes, trials and the regulator. Patients first, cyborgs later.' },
    cycle: { amp: 0.1, up: 'brain-interface hype', down: 'medtech funding drought', name: 'neurotech funding cycle' },
  },
  drones: {
    stages: [
      s('Prototype hangar', 0, 0, 1.5, 'Prototypes that fly, mostly, and land, sometimes.'),
      s('Camera and survey drones', 0.3, 0.4, 1.2, 'Farmers, film crews and surveyors buy your drones.'),
      s('Delivery network', 1, 1, 1, 'Your drones drop parcels and medicine on scheduled routes.'),
      s('Certified air taxis', 3, 1, 0.8, 'Passengers ride your aircraft over the traffic.'),
    ],
    plantCap: 2.5,
    plant: ['aircraft factory', 'aircraft factories'],
    salesMult: 6,
    rounds: [0, 4_000_000, 15_000_000, 50_000_000, 130_000_000, 300_000_000, 600_000_000],
    req: { majors: ['Engineering', 'Computer Science', 'Physics'], coding: 30, smarts: 78, text: 'an engineering, CS or physics degree, coding skill 30+ (or smarts 78+)' },
    expert: 'Chief Aerospace Engineer',
    screen: { label: 'Flight Line', emoji: '\u{1F681}', header: 'Test flights, flight permits and the aviation regulator. Crashes cost more than money.' },
    cycle: { amp: 0.12, up: 'air mobility boom', down: 'air mobility bust', name: 'drone market' },
  },
  carbonCapture: {
    stages: [
      s('Lab sorbent', 0, 0, 1.5, 'A filter that grabs carbon dioxide from the air, in a beaker.'),
      s('Demonstration plant', 0.15, 0.3, 1.4, 'A shipping container of fans removes a few hundred tonnes a year.'),
      s('Commercial plant', 1, 1, 1, 'Airlines and tech companies buy your removal credits by the thousand.'),
      s('Industrial-scale removal', 3.5, 1, 0.7, 'Plants across the world bury hundreds of thousands of tonnes a year.'),
    ],
    plantCap: 2,
    plant: ['capture plant', 'capture plants'],
    salesMult: 7,
    rounds: [0, 4_000_000, 15_000_000, 50_000_000, 120_000_000, 250_000_000, 500_000_000],
    req: { majors: ['Chemistry', 'Engineering', 'Physics', 'Biology'], smarts: 80, text: 'a chemistry, engineering, physics or biology degree (or smarts 80+)' },
    expert: 'Chief Process Chemist',
    screen: { label: 'Capture Plant', emoji: '\u{1F343}', header: 'Tonnes removed, tonnes verified, tonnes paid for. Buyers want proof.' },
    cycle: { amp: 0.12, up: 'climate pledge rush', down: 'carbon credit slump', name: 'carbon credit market' },
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
  { label: 'Phase I trial', years: 1, cost: 4_000_000, odds: 0.62 },
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
  /** AI Lab 2.0: the family id (familyId(g.lifeId)). Without it, or without `rival`, a model is scored the old way. */
  fam?: string
  /** AI Lab 2.0: the best rival lab on a year's board after catch-up from this lab's releases (null when no lab trades). */
  rival?: (year: number) => BestRival | null
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
  /** Share of the spend booked as patents on success (default 1.2; endless programs book less). */
  ipShare?: number
  /**
   * True for a program that moves the company up its commercial ladder, or that the next rung
   * needs first: the manager and the Business talent rank it ahead of the rest. A function when it
   * only counts for a lab that is still small (the first models, the first qubits).
   */
  unlocks?: boolean | ((t: TechState) => boolean)
  /** AI Lab 2.0: a capability research track. It shares the lab's slots under a limit and is never picked automatically. */
  track?: CapId
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
const safe = (t: TechState, n: number) => (t.safety = Math.min(100, t.safety + n))
/** Research in a capability is raised to at least `n`, never lowered. */
const capAtLeast = (t: TechState, cap: CapId, n: number) => (t.caps[cap] = Math.max(t.caps[cap] ?? 0, n))
const clampOdds = (p: number) => Math.max(0.05, Math.min(0.95, p))

/** Countries under export controls for advanced chips, AI compute and quantum hardware. */
export const RESTRICTED = new Set(['cn', 'ru', 'ir', 'sy'])

/** Best node a company in this country can reach without its own toolchain. */
export function nodeCap(t: TechState, countryId: string): number {
  if (!RESTRICTED.has(countryId) || done(t, 'domestic')) return NODES.length - 1
  return 3
}

/** True when a model carries ratings (older saves and models before 2012 don't). */
function isRated(m: AiModel): boolean {
  return m.rating !== undefined && modelStrength(m) > 0
}

/**
 * The strongest of some models: rated models outrank unrated ones and compare by rating strength (scores
 * from different test generations aren't comparable); unrated models compare by score; ties keep the earlier.
 */
function strongest(models: readonly AiModel[]): AiModel | null {
  let best: AiModel | null = null
  let bestStrength = 0
  for (const m of models) {
    const rated = isRated(m)
    const strength = rated ? modelStrength(m) : 0
    if (!best) { best = m; bestStrength = strength; continue }
    const bestRated = isRated(best)
    const beats = rated !== bestRated ? rated : rated ? strength > bestStrength : m.score > best.score
    if (beats) { best = m; bestStrength = strength }
  }
  return best
}

/** The best model a lab has released: held models don't count, so a lab with only held models has none. */
export function bestModel(t: Pick<TechState, 'models'>): AiModel | null {
  return strongest(t.models.filter((m) => !m.held))
}

/** The best released model that existed by `year` (its own `year` is at or before it). */
export function bestModelAsOf(t: Pick<TechState, 'models'>, year: number): AiModel | null {
  return strongest(t.models.filter((m) => !m.held && m.year <= year))
}

export const PROGRAMS: Record<DeepTechIndustry, ProgramDef[]> = {
  semiconductor: [
    {
      id: 'firstChip', label: () => 'First Chip Tape-Out', emoji: '\u{1F4BE}', blurb: 'Send your first design to a foundry on a shared wafer. Does it work?',
      years: 1, cost: fixed(2_500_000), odds: fixed(0.75),
      unlocks: true,
      gate: (t) => once(t, 'firstChip'),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 8), hype(x.t, 8), 'First silicon works! Early customers want samples.'),
      lose: (x) => (lvl(x.t, 2), 'The first chip came back dead on arrival: a timing bug. Back to the drawing board.'),
    },
    {
      id: 'volume', label: () => 'Volume Production Deal', emoji: '\u{1F3ED}', blurb: 'Qualify your chip and book wafer capacity at a big foundry.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.85),
      unlocks: true,
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
      id: 'fab', label: (t) => (t.plant > 0 ? 'Build Another Fab' : 'Build Your Own Fab'), emoji: '\u{1F3D7}\u{FE0F}', blurb: 'Stop renting foundry capacity: build a fab. Cleanrooms are not cheap, and every extra fab is harder to fill.',
      years: 3, cost: (t) => 180_000_000 * (1 + 0.35 * t.plant), odds: fixed(0.88), capex: true,
      gate: (t) => (t.stage < 2 ? 'Needs chips in volume production.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
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
    {
      id: 'photonics', label: () => 'Silicon Photonics Interconnect', emoji: '\u{1F4A1}', blurb: 'Move data between chips with light instead of copper.',
      years: 2, cost: fixed(10_000_000), odds: fixed(0.65),
      gate: (t) => once(t, 'photonics') ?? (t.stage < 2 ? 'Needs chips shipping first.' : null),
      win: (x) => (prem(x.t, 0.1), boost(x.t, 0.15), lvl(x.t, 5), 'Your optical links move data ten times faster. Data centers want them.'),
      lose: (x) => (lvl(x.t, 2), 'The lasers ran too hot to sit next to the chips. Back to the lab bench.'),
    },
    {
      id: 'autoQual', label: () => 'Automotive Safety Qualification', emoji: '\u{1F697}', blurb: 'Years of testing so car makers can trust your chips with the brakes.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'autoQual') ?? (t.stage < 2 ? 'Needs chips shipping first.' : null),
      win: (x) => (boost(x.t, 0.12), safe(x.t, 15), lvl(x.t, 2), 'Your chips passed automotive qualification. Car makers signed ten-year supply deals.'),
    },
    {
      id: 'designAi', label: () => 'AI Chip Design Tools', emoji: '\u{1F9E0}', blurb: 'Software that lays out a chip in days instead of months.',
      years: 1, cost: fixed(6_000_000), odds: fixed(0.7),
      gate: (t) => once(t, 'designAi'),
      win: (x) => (cut(x.t, 0.06), lvl(x.t, 4), 'Your design tools cut the time to tape-out in half.'),
    },
  ],
  aiLab: [
    {
      id: 'train', label: (t) => (t.models.length === 0 ? 'Train Your First Model' : `Train ${modelFamily(t, '')} ${modelGens(t) + 1}`), emoji: '\u{1F9E0}', blurb: 'A training run: weeks of GPUs crunching data. Bigger runs, better models, and every generation costs far more than the last.',
      years: 1, cost: (t) => 1_500_000 * Math.pow(2.6, Math.min(9, modelGens(t))) * Math.pow(1.6, Math.max(0, modelGens(t) - 9)) * (1 - Math.min(0.45, t.plant * 0.12)), odds: fixed(0.82),
      unlocks: (t) => t.models.length < 3,
      gate: (t) => (modelGens(t) >= 3 && t.rented + t.plant < 1 ? 'Runs this big need GPU compute: rent or build a cluster.' : modelGens(t) >= 5 && t.plant < 1 ? 'Frontier-scale runs need your own GPU cluster.' : null),
      win: (x) => trainWin(x),
      lose: (x) => (lvl(x.t, 1), 'The training run diverged halfway through. The loss curve looks like a seismograph.'),
    },
    {
      id: 'api', label: () => 'Developer API & Billing', emoji: '\u{1F50C}', blurb: 'Let developers pay to use your models.',
      years: 1, cost: fixed(2_000_000), odds: fixed(0.9),
      unlocks: true,
      gate: (t) => once(t, 'api') ?? (t.models.length === 0 ? 'Train a model first.' : null),
      win: (x) => (stageAtLeast(x.t, 2), lvl(x.t, 2), 'Your API is live. Developers are building on it.'),
    },
    {
      id: 'enterprise', label: () => 'Enterprise Platform', emoji: '\u{1F3E2}', blurb: 'Security reviews, admin consoles and a sales team in suits.',
      years: 1.5, cost: fixed(12_000_000), odds: fixed(0.7),
      unlocks: true,
      gate: (t) => once(t, 'enterprise') ?? (t.stage < 2 ? 'Needs paying API customers first.' : t.level < 50 ? 'Big companies only buy from labs at tech level 50+.' : null),
      win: (x) => (stageAtLeast(x.t, 3), lvl(x.t, 3), 'Big companies are signing up. Procurement departments everywhere sighed.'),
    },
    {
      id: 'cluster', label: (t) => (t.plant > 0 ? 'Build Another GPU Cluster' : 'Build a GPU Cluster'), emoji: '\u{1F5A5}\u{FE0F}', blurb: 'Own the compute instead of renting it: cheaper training and more capacity.',
      years: 2, cost: (t) => 40_000_000 * (1 + t.plant * 0.25), odds: fixed(0.9), capex: true,
      gate: (t, cid) => (t.models.length === 0 ? 'Train a first model before buying a data center.' : RESTRICTED.has(cid) && t.plant >= 2 ? 'Export controls limit how many top GPUs you can buy.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
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
      win: (x) => (prem(x.t, 0.2), boost(x.t, 0.3), hype(x.t, 20), lvl(x.t, 6), capAtLeast(x.t, 'agents', 3), 'Your agents book meetings, fix bugs and file expenses. Customers are hooked.'),
      lose: (x) => (lvl(x.t, 2), 'The agents kept ordering 400 staplers. The launch was shelved.'),
    },
    {
      id: 'frontier', label: () => 'Frontier Breakthrough', emoji: '\u{1F30C}', blurb: 'A new architecture that leapfrogs everyone. Or a very expensive dead end.',
      years: 3, cost: fixed(120_000_000), odds: fixed(0.4),
      gate: (t) => once(t, 'frontier') ?? (t.stage < 3 ? 'Needs an enterprise platform first.' : t.level < 70 ? 'Needs tech level 70+.' : null),
      win: (x) => (stageAtLeast(x.t, 4), hype(x.t, 30), lvl(x.t, 15), 'Breakthrough! Your lab is now one of the few defining the frontier.'),
      lose: (x) => (lvl(x.t, 4), 'The new architecture plateaued. Three years and a fortune for a great research paper.'),
    },
    {
      id: 'multimodal', label: () => 'Multimodal Models', emoji: '\u{1F441}\u{FE0F}', blurb: 'Models that see, hear and speak, not only read.',
      years: 2, cost: fixed(15_000_000), odds: fixed(0.65),
      gate: (t) => once(t, 'multimodal') ?? (t.stage < 1 ? 'Needs a trained model first.' : null),
      win: (x) => (prem(x.t, 0.1), boost(x.t, 0.2), hype(x.t, 10), lvl(x.t, 5), capAtLeast(x.t, 'vision', 2), capAtLeast(x.t, 'speech', 2), 'Your models now read charts, hear meetings and describe photos. Usage doubled.'),
      lose: (x) => (lvl(x.t, 2), 'The vision model kept calling every dog a muffin. The launch was pulled.'),
    },
    {
      id: 'onDevice', label: () => 'On-Device Models', emoji: '\u{1F4F1}', blurb: 'Small models that run on a phone with no data center.',
      years: 1, cost: fixed(6_000_000), odds: fixed(0.7),
      gate: (t) => once(t, 'onDevice') ?? (t.stage < 1 ? 'Needs a trained model first.' : null),
      win: (x) => (cut(x.t, 0.08), boost(x.t, 0.1), lvl(x.t, 3), 'Phone makers ship your small model on every handset. Serving costs fell.'),
    },
    {
      id: 'dataDeals', label: () => 'Licensed Data Deals', emoji: '\u{1F4DA}', blurb: 'Pay publishers for training data before their lawyers ask.',
      years: 1, cost: fixed(5_000_000), odds: fixed(0.85),
      gate: (t) => once(t, 'dataDeals'),
      win: (x) => (safe(x.t, 15), lvl(x.t, 4), 'Publishers signed data licences. Fewer lawsuits, better training data.'),
    },
  ],
  robotics: [
    {
      id: 'proto', label: () => 'Working Prototype v2', emoji: '\u{1F527}', blurb: 'A robot that works outside the lab, most of the time.',
      years: 1, cost: fixed(1_500_000), odds: fixed(0.78),
      unlocks: true,
      gate: (t) => once(t, 'proto'),
      win: (x) => (lvl(x.t, 8), hype(x.t, 6), 'Prototype v2 walked, grabbed and sorted all day without catching fire.'),
      lose: (x) => (lvl(x.t, 2), 'Prototype v2 kept falling over. The engineers named it "Bambi".'),
    },
    {
      id: 'pilots', label: () => 'Customer Pilot Program', emoji: '\u{1F91D}', blurb: 'Put robots to work at a few real customers.',
      years: 1, cost: fixed(2_500_000), odds: fixed(0.8),
      unlocks: true,
      gate: (t) => once(t, 'pilots') ?? (!done(t, 'proto') ? 'Needs a working prototype.' : null),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 4), 'Pilot customers want to keep the robots. Some want more.'),
    },
    {
      id: 'line', label: () => 'Production Line', emoji: '\u{1F3ED}', blurb: 'Stop building robots by hand.',
      years: 2, cost: fixed(8_000_000), odds: fixed(0.85), capex: true,
      unlocks: true,
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
      id: 'humanoid', label: () => 'Humanoid Robot', emoji: '\u{1F6B6}', blurb: 'Two legs, two arms, one good demo away from fame.',
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
      id: 'gigaline', label: (t) => (done(t, 'gigaline') ? 'Another Gigaline' : 'Mass Production Gigaline'), emoji: '\u{1F3D7}\u{FE0F}', blurb: 'A factory that builds robots by the thousand. Each one after the first costs more to fill.',
      years: 3, cost: (t) => 40_000_000 * (1 + 0.35 * timesDone(t, 'gigaline')), odds: fixed(0.82), capex: true,
      gate: (t) => (t.stage < 2 ? 'Needs a production line first.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
      win: (x) => ((x.t.plant += 2), stageAtLeast(x.t, 3), lvl(x.t, 5), timesDone(x.t, 'gigaline') > 1 ? 'Another gigaline is open and humming.' : 'The gigaline is open. Robots are now a mass-market product.'),
    },
    {
      id: 'brain', label: () => 'Robot Foundation Model', emoji: '\u{1F9E0}', blurb: 'One AI brain that can learn any task from a few demonstrations.',
      years: 2, cost: fixed(15_000_000), odds: fixed(0.55),
      gate: (t) => once(t, 'brain') ?? (t.level < 55 ? 'Needs tech level 55+.' : null),
      win: (x) => (boost(x.t, 0.2), hype(x.t, 15), lvl(x.t, 10), 'Your robots now learn new jobs from a single video. Customers are lining up.'),
    },
    {
      id: 'fleetOs', label: () => 'Fleet Management Software', emoji: '\u{1F4CB}', blurb: 'One screen to watch, update and schedule every robot a customer owns.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'fleetOs') ?? (t.stage < 1 ? 'Needs customer pilots first.' : null),
      win: (x) => (prem(x.t, 0.08), boost(x.t, 0.1), lvl(x.t, 3), 'Customers manage whole fleets from one dashboard and pay a monthly fee for it.'),
    },
    {
      id: 'safetyCert', label: () => 'Human-Safe Certification', emoji: '\u{1F9BA}', blurb: 'Certify your robots to work next to people without a cage.',
      years: 1, cost: fixed(2_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'safetyCert') ?? (!done(t, 'proto') ? 'Needs a working prototype.' : null),
      win: (x) => (safe(x.t, 25), lvl(x.t, 2), 'Your robots are certified to work beside people. Factories took the cages down.'),
    },
    {
      id: 'exo', label: () => 'Industrial Exoskeleton', emoji: '\u{1F9BF}', blurb: 'A powered suit that lets a worker lift twice as much.',
      years: 2, cost: fixed(6_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'exo') ?? (t.level < 30 ? 'Needs tech level 30+.' : null),
      win: (x) => (boost(x.t, 0.15), prem(x.t, 0.05), hype(x.t, 8), lvl(x.t, 5), 'Warehouse workers love the exoskeleton. Back injuries at pilot sites fell by half.'),
      lose: (x) => (lvl(x.t, 2), 'The suit was too heavy to wear for a full shift. Workers took it off at lunch.'),
    },
  ],
  biotech: [
    {
      id: 'discovery', label: () => 'Drug Discovery Program', emoji: '\u{1F52C}', blurb: 'Screen thousands of molecules to find one worth taking into people.',
      years: 2, cost: fixed(2_500_000), odds: (t) => 0.65 + Math.min(0.15, timesDone(t, 'platform') * 0.12),
      unlocks: true,
      gate: (t) => (t.drugs.filter((d) => !d.failed && d.phase < 4).length >= 4 ? 'Your pipeline is full (four candidates).' : null),
      win: (x) => discoveryWin(x),
      lose: (x) => (lvl(x.t, 2), 'Every promising molecule turned out to be toxic to mice. And to the budget.'),
    },
    {
      id: 'platform', label: () => 'Platform Technology', emoji: '\u{1F9EA}', blurb: 'Gene editing, mRNA or AI-designed molecules: better candidates, every time.',
      years: 2, cost: fixed(6_000_000), odds: fixed(0.65),
      unlocks: true,
      gate: (t) => once(t, 'platform'),
      win: (x) => { lvl(x.t, 12); hype(x.t, 10); for (const d of x.t.drugs) if (!d.failed && d.phase < 4) d.quality = Math.min(100, d.quality + 8); return 'Your platform works: every candidate in the pipeline just got better.' },
    },
    {
      id: 'manufacturing', label: (t) => (done(t, 'manufacturing') ? 'Another Biologics Plant' : 'Biologics Plant'), emoji: '\u{1F3ED}', blurb: 'Make your own medicines instead of paying a contract manufacturer. Extra plants add capacity and smaller savings.',
      years: 2, cost: (t) => 35_000_000 * (1 + 0.35 * timesDone(t, 'manufacturing')), odds: fixed(0.85), capex: true,
      gate: (t) => (!t.drugs.some((d) => !d.failed && d.phase >= 3 && d.royalty >= 1) ? 'Needs a drug of your own past Phase III.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
      win: (x) => {
        const n = timesDone(x.t, 'manufacturing')
        x.t.plant += 1
        cut(x.t, 0.3 / Math.max(1, n))
        lvl(x.t, 3)
        return n > 1 ? 'Another biologics plant passed inspection: more capacity, a little cheaper per dose.' : 'Your biologics plant passed inspection. Production costs fell by a third.'
      },
    },
    {
      id: 'diagnostics', label: () => 'Companion Diagnostic', emoji: '\u{1F9EB}', blurb: 'A test that finds the patients your drug works best on.',
      years: 1, cost: fixed(2_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'diagnostics') ?? (!t.drugs.some((d) => !d.failed && d.phase >= 2) ? 'Needs a drug past Phase II.' : null),
      win: (x) => { prem(x.t, 0.1); lvl(x.t, 3); for (const d of x.t.drugs) if (!d.failed && d.phase < 4) d.quality = Math.min(100, d.quality + 5); return 'Your companion test picks the right patients. Trials and doctors love it.' },
    },
    {
      id: 'aiDesign', label: () => 'AI Molecule Design', emoji: '\u{1F916}', blurb: 'Let a model propose molecules before the chemists make them.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.7),
      gate: (t) => once(t, 'aiDesign'),
      win: (x) => { lvl(x.t, 6); for (const d of x.t.drugs) if (!d.failed && d.phase < 4) d.quality = Math.min(100, d.quality + 5); return 'The model found better versions of your candidates. Every one in the pipeline improved.' },
    },
    {
      id: 'orphan', label: () => 'Orphan Drug Designation', emoji: '\u{1F4DC}', blurb: 'Rare-disease status for a candidate: longer exclusivity and better prices.',
      years: 1, cost: fixed(1_500_000), odds: fixed(0.8),
      gate: (t) => once(t, 'orphan') ?? (!t.drugs.some((d) => !d.failed && d.phase >= 1) ? 'Needs a candidate past Phase I.' : null),
      win: (x) => (prem(x.t, 0.1), lvl(x.t, 2), 'The regulator granted orphan status. Your drug gets years of exclusivity.'),
    },
    {
      id: 'biosimilar', label: () => 'Biosimilar Program', emoji: '\u{1F9EB}', blurb: 'Copy a famous biologic the day its patent runs out.',
      years: 2, cost: fixed(5_000_000), odds: fixed(0.7),
      gate: (t) => once(t, 'biosimilar') ?? (t.plant < 1 ? 'Needs your own manufacturing plant.' : null),
      win: (x) => (boost(x.t, 0.12), lvl(x.t, 3), 'Your biosimilar launched at a third of the original price. Hospitals switched.'),
    },
  ],
  spaceTech: [
    {
      id: 'engine', label: () => 'Rocket Engine', emoji: '\u{1F525}', blurb: 'Design, build and static-fire an engine that doesn’t melt.',
      years: 2, cost: fixed(3_000_000), odds: fixed(0.75),
      unlocks: true,
      gate: (t) => once(t, 'engine'),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 10), hype(x.t, 8), 'A full-duration static fire! The neighbors complained about the noise.'),
      lose: (x) => (lvl(x.t, 3), 'The engine blew its turbopump on the test stand. Spectacular. Expensive.'),
    },
    {
      id: 'rocket', label: () => 'Orbital Rocket', emoji: '\u{1F680}', blurb: 'Stack the stages and get the whole thing ready for a first flight.',
      years: 3, cost: fixed(15_000_000), odds: fixed(0.85),
      unlocks: true,
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
      years: 2, cost: fixed(40_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'reuse') ?? (t.stage < 3 ? 'Needs an operational rocket.' : null),
      win: (x) => (stageAtLeast(x.t, 4), hype(x.t, 20), lvl(x.t, 8), 'The booster landed on its legs and flew again a month later. Launch costs collapsed.'),
      lose: (x) => (lvl(x.t, 3), 'Every landing attempt ended as a crater. Still expendable, for now.'),
    },
    {
      id: 'sats', label: (t) => `Satellite Constellation Batch ${t.sats + 1}`, emoji: '\u{1F310}', blurb: 'Your own satellites in orbit, beaming data down to paying customers every month. Each batch lasts about six years.',
      years: 1, cost: (t) => 50_000_000 * (1 + 0.15 * Math.max(0, t.sats - 11)), odds: fixed(0.9), capex: true,
      gate: (t) => (t.stage < 3 ? 'Needs an operational rocket.' : t.sats >= SAT_MAX ? 'Forty batches: the regulators won’t license a single extra orbital slot.' : null),
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
    {
      id: 'tug', label: () => 'Orbital Transfer Vehicle', emoji: '\u{1F6F0}\u{FE0F}', blurb: 'A space tug that drops each satellite into its own orbit.',
      years: 2, cost: fixed(12_000_000), odds: fixed(0.7),
      gate: (t) => once(t, 'tug') ?? (t.stage < 3 ? 'Needs operational launches first.' : null),
      win: (x) => (boost(x.t, 0.15), lvl(x.t, 4), 'Your tug delivered eight satellites to eight orbits on one launch. Customers pay extra for it.'),
    },
    {
      id: 'debris', label: () => 'Debris Removal Mission', emoji: '\u{1F9F9}', blurb: 'Catch a dead satellite and drag it down to burn up.',
      years: 2, cost: fixed(15_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'debris') ?? (t.stage < 3 ? 'Needs operational launches first.' : null),
      win: (x) => (hype(x.t, 15), safe(x.t, 15), lvl(x.t, 4), 'You caught a dead satellite and deorbited it. Space agencies want more.'),
      lose: (x) => (lvl(x.t, 2), 'The capture arm missed and the target tumbled away. It is still up there.'),
    },
    {
      id: 'station', label: () => 'Commercial Space Station Module', emoji: '\u{1F3E0}', blurb: 'A module where astronauts and paying guests live in orbit.',
      years: 3, cost: fixed(60_000_000), odds: fixed(0.5),
      gate: (t) => once(t, 'station') ?? (!done(t, 'crew') ? 'Needs crewed flights first.' : null),
      win: (x) => (boost(x.t, 0.2), prem(x.t, 0.1), hype(x.t, 25), lvl(x.t, 8), 'Your station module is in orbit and fully booked by agencies and tourists.'),
      lose: (x) => (lvl(x.t, 3), 'The module failed its pressure test on the ground. Three years of work, back to welding.'),
    },
  ],
  electricVehicles: [
    {
      id: 'prototype', label: () => 'Drivable Prototype', emoji: '\u{1F697}', blurb: 'A hand-built car that drives well enough for a test drive.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.8),
      unlocks: true,
      gate: (t) => once(t, 'prototype'),
      win: (x) => (lvl(x.t, 8), hype(x.t, 10), 'Your prototype drove onto the stage at its launch party. Preorders opened.'),
      lose: (x) => (lvl(x.t, 2), 'The prototype’s windows shattered at the unveiling. Memes followed.'),
    },
    {
      id: 'lowvol', label: () => 'Low-Volume Assembly Plant', emoji: '\u{1F529}', blurb: 'A small plant to hand-build the first few thousand cars.',
      years: 2, cost: fixed(15_000_000), odds: fixed(0.85), capex: true,
      unlocks: true,
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
      years: 3, cost: (t) => 150_000_000 * (1 + 0.3 * timesDone(t, 'giga')), odds: fixed(0.85), capex: true,
      gate: (t) => (t.stage < 1 ? 'Needs low-volume production first.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
      win: (x) => ((x.t.plant += 3), stageAtLeast(x.t, 2), lvl(x.t, 4), x.t.stage === 2 ? 'The gigafactory is open. Welcome to production hell.' : 'Another gigafactory is open and running.'),
    },
    {
      id: 'ramp', label: () => 'Escape Production Hell', emoji: '\u{1F635}', blurb: 'Fix the line, sleep at the factory, ship the cars.',
      years: 1, cost: fixed(30_000_000), odds: fixed(0.6),
      unlocks: true,
      gate: (t) => (t.stage !== 2 ? 'Only needed in production hell.' : null),
      win: (x) => (stageAtLeast(x.t, 3), hype(x.t, 15), lvl(x.t, 4), 'You escaped production hell. Cars now roll off the line every minute.'),
      lose: (x) => (lvl(x.t, 2), 'The line still jams every hour. Production hell continues.'),
    },
    {
      id: 'selfdrive', label: (t) => `Autopilot Level ${t.autonomy + 2}`, emoji: '\u{1F9ED}', blurb: 'Teach the car to drive itself. Regulators will be watching.',
      years: 2, cost: fixed(20_000_000), odds: fixed(0.5),
      gate: (t) => (t.autonomy >= 3 ? 'Your cars already drive themselves.' : t.level < 45 ? 'Needs tech level 45+.' : null),
      win: (x) => ((x.t.autonomy += 1), prem(x.t, 0.06), hype(x.t, 15), lvl(x.t, 6), `Your cars now handle Level ${x.t.autonomy + 1} driving. Owners brag about "not driving" to anyone who will listen.`),
      lose: (x) => (lvl(x.t, 2), 'The autopilot kept mistaking plastic bags for pedestrians. Back to training.'),
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
    {
      id: 'solidState', label: () => 'Solid-State Battery', emoji: '\u{1F50B}', blurb: 'A battery with no liquid inside: more range, faster charging, no fires.',
      years: 3, cost: fixed(40_000_000), odds: fixed(0.45),
      gate: (t) => once(t, 'solidState') ?? (!done(t, 'battery') ? 'Needs your own battery program first.' : null),
      win: (x) => (prem(x.t, 0.15), cut(x.t, 0.05), boost(x.t, 0.2), hype(x.t, 20), lvl(x.t, 10), 'Solid-state cells in production. Ten-minute charging and half again the range.'),
      lose: (x) => (lvl(x.t, 3), 'The cells cracked after a few hundred charges. The breakthrough is still five years away.'),
    },
    {
      id: 'v2g', label: () => 'Vehicle-to-Grid Software', emoji: '\u{1F50C}', blurb: 'Parked cars sell power back to the grid at the evening peak.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'v2g') ?? (t.stage < 1 ? 'Needs cars on the road first.' : null),
      win: (x) => (boost(x.t, 0.08), lvl(x.t, 2), 'Owners earn money while their cars sit in the driveway. Utilities are signing up.'),
    },
    {
      id: 'semi', label: () => 'Electric Semi Truck', emoji: '\u{1F69B}', blurb: 'A battery truck that hauls a full trailer across a state.',
      years: 2, cost: fixed(30_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'semi') ?? (t.stage < 2 ? 'Needs a gigafactory first.' : null),
      win: (x) => (boost(x.t, 0.25), hype(x.t, 10), lvl(x.t, 4), 'Freight companies ordered your electric semi by the hundred.'),
      lose: (x) => (lvl(x.t, 2), 'The semi ran out of charge halfway up the first mountain pass. Back to the drawing board.'),
    },
  ],
  quantum: [
    {
      id: 'qubits', label: (t) => `Scale to ${nextQubits(t.qubits)} Qubits`, emoji: '\u{269B}\u{FE0F}', blurb: 'More qubits, held stable for longer.',
      years: 2, cost: (t) => 4_000_000 * Math.pow(1.6, timesDone(t, 'qubits')), odds: fixed(0.7),
      unlocks: (t) => t.qubits < 20,
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
      id: 'cloud', label: () => 'Quantum Cloud Platform', emoji: '\u{2601}\u{FE0F}', blurb: 'Let companies rent time on your machine from anywhere.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.85),
      unlocks: true,
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
    {
      id: 'sensing', label: () => 'Quantum Sensing Line', emoji: '\u{1F9ED}', blurb: 'Sensors that measure gravity and magnetism with quantum precision.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'sensing'),
      win: (x) => (boost(x.t, 0.15), lvl(x.t, 3), 'Mining and navigation companies buy your quantum sensors. Real revenue, at last.'),
    },
    {
      id: 'stack', label: () => 'Quantum Software Stack', emoji: '\u{1F4BB}', blurb: 'A compiler and tools so programmers can use the machine without a physics degree.',
      years: 1, cost: fixed(2_000_000), odds: fixed(0.85),
      gate: (t) => once(t, 'stack'),
      win: (x) => (boost(x.t, 0.1), lvl(x.t, 3), 'Developers can program your machine in a familiar language. Cloud usage tripled.'),
    },
    {
      id: 'network', label: () => 'Networked Quantum Modules', emoji: '\u{1F517}', blurb: 'Link several small processors with photons into one big machine.',
      years: 2, cost: fixed(10_000_000), odds: fixed(0.55),
      gate: (t) => once(t, 'network') ?? (t.qubits < 50 ? 'Needs at least 50 qubits.' : null),
      win: (x) => (boost(x.t, 0.1), safe(x.t, 10), lvl(x.t, 8), hype(x.t, 12), 'Two processors now share entangled qubits. Your machine can grow module by module.'),
      lose: (x) => (lvl(x.t, 2), 'The photonic link lost most of its photons on the way. The modules stayed strangers.'),
    },
  ],
  cybersecurity: [
    {
      id: 'detect', label: () => 'Threat Detection Engine', emoji: '\u{1F50E}', blurb: 'Software that spots attackers in a network.',
      years: 1, cost: fixed(1_500_000), odds: fixed(0.8),
      unlocks: true,
      gate: (t) => once(t, 'detect'),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 8), 'Your detection engine caught a real intruder at a pilot customer. Sales are easy now.'),
    },
    {
      id: 'platform', label: () => 'Zero-Trust Platform', emoji: '\u{1F9F1}', blurb: 'Identity, endpoints and network in one platform.',
      years: 2, cost: fixed(5_000_000), odds: fixed(0.75),
      unlocks: true,
      gate: (t) => once(t, 'platform') ?? (t.stage < 1 ? 'Needs a first product.' : null),
      win: (x) => (stageAtLeast(x.t, 2), prem(x.t, 0.1), lvl(x.t, 6), 'Your platform replaces six other vendors. CISOs love fewer logins.'),
    },
    {
      id: 'clearance', label: () => 'Government Security Clearance', emoji: '\u{1F3DB}\u{FE0F}', blurb: 'Audits, background checks and a lot of forms.',
      years: 2, cost: fixed(2_500_000), odds: fixed(0.7),
      unlocks: true,
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
      years: 1, cost: (t) => 6_000_000 * (1 + 0.3 * t.plant), odds: fixed(0.85), capex: true,
      gate: (t) => (t.stage < 1 ? 'Needs a first product.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
      win: (x) => ((x.t.plant += 1), boost(x.t, 0.15 / (1 + 0.5 * Math.max(0, x.t.plant - 1))), lvl(x.t, 2), x.t.plant > 4 ? 'Another SOC is online. You already followed the sun; now you shadow it.' : 'Your new SOC watches client networks around the clock.'),
    },
    {
      id: 'identity', label: () => 'Passwordless Identity', emoji: '\u{1F511}', blurb: 'Sign-ins with keys and faces instead of passwords.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.8),
      gate: (t) => once(t, 'identity') ?? (t.stage < 1 ? 'Needs a first product.' : null),
      win: (x) => (prem(x.t, 0.08), boost(x.t, 0.1), lvl(x.t, 3), 'Your clients retired their passwords. Phishing at your customers fell sharply.'),
    },
    {
      id: 'cloudSec', label: () => 'Cloud Security Scanner', emoji: '\u{2601}\u{FE0F}', blurb: 'Find every open bucket and leaked key across a client cloud.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.75),
      gate: (t) => once(t, 'cloudSec') ?? (t.stage < 1 ? 'Needs a first product.' : null),
      win: (x) => (boost(x.t, 0.15), lvl(x.t, 4), 'Your scanner found 9,000 exposed databases at its first customers. Everyone wants a scan.'),
    },
    {
      id: 'otSec', label: () => 'Industrial Control Security', emoji: '\u{1F3ED}', blurb: 'Protect power plants and factories, where a hack can break machines.',
      years: 2, cost: fixed(5_000_000), odds: fixed(0.7),
      gate: (t) => once(t, 'otSec') ?? (t.stage < 2 ? 'Needs a security platform first.' : null),
      win: (x) => (prem(x.t, 0.1), boost(x.t, 0.1), safe(x.t, 10), lvl(x.t, 4), 'Utilities and factories now run your industrial security. Contracts are long and sticky.'),
    },
  ],
  fusion: [
    {
      id: 'magnets', label: () => 'High-Field Magnets', emoji: '\u{1F9F2}', blurb: 'Superconducting magnets strong enough to squeeze a plasma tight.',
      years: 1, cost: fixed(5_000_000), odds: fixed(0.7),
      unlocks: true,
      gate: (t) => once(t, 'magnets'),
      win: (x) => (lvl(x.t, 10), hype(x.t, 8), 'Your magnet hit a record field strength. Physicists from three continents came to look.'),
      lose: (x) => (lvl(x.t, 3), 'The magnet quenched and cracked during its first full test. Back to winding tape.'),
    },
    {
      id: 'shot', label: () => 'Record Plasma Shot', emoji: '\u{1F525}', blurb: 'Hold a hundred-million-degree plasma longer than anyone has.',
      years: 2, cost: fixed(12_000_000), odds: fixed(0.6),
      unlocks: true,
      gate: (t) => once(t, 'shot') ?? (!done(t, 'magnets') ? 'Needs high-field magnets first.' : null),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 8), hype(x.t, 15), 'A record plasma: hotter than the Sun for a full second. Labs want to rent your machine.'),
      lose: (x) => (lvl(x.t, 2), 'The plasma wobbled and touched the wall within milliseconds. The data is interesting, at least.'),
    },
    {
      id: 'materials', label: () => 'Neutron-Proof Materials', emoji: '\u{1F9F1}', blurb: 'Wall materials that survive years of neutron bombardment.',
      years: 2, cost: fixed(10_000_000), odds: fixed(0.65),
      gate: (t) => once(t, 'materials') ?? (t.stage < 1 ? 'Needs record plasmas first.' : null),
      win: (x) => (cut(x.t, 0.08), safe(x.t, 15), lvl(x.t, 5), 'Your new wall alloy shrugs off neutrons. Plants will need fewer shutdowns.'),
    },
    {
      id: 'netGain', label: () => 'Net Energy Gain', emoji: '\u{26A1}', blurb: 'Get more energy out of the plasma than you put in.',
      years: 3, cost: fixed(40_000_000), odds: fixed(0.4),
      unlocks: true,
      gate: (t) => once(t, 'netGain') ?? (t.stage < 1 ? 'Needs record plasmas first.' : t.level < 40 ? 'Needs tech level 40+.' : null),
      win: (x) => (stageAtLeast(x.t, 2), hype(x.t, 35), lvl(x.t, 12), 'Net energy gain! More power out than in. It is front-page news everywhere.'),
      lose: (x) => (lvl(x.t, 4), 'Close, but the shot gave back only 80% of its energy. Investors asked how long "close" lasts.'),
    },
    {
      id: 'blanket', label: () => 'Tritium Breeding Blanket', emoji: '\u{1F6E1}\u{FE0F}', blurb: 'A lithium blanket that makes the reactor its own fuel.',
      years: 2, cost: fixed(20_000_000), odds: fixed(0.55),
      unlocks: true,
      gate: (t) => once(t, 'blanket') ?? (t.stage < 1 ? 'Needs record plasmas first.' : null),
      win: (x) => (safe(x.t, 20), cut(x.t, 0.05), lvl(x.t, 6), 'Your blanket breeds more tritium than the plasma burns. Fuel is solved.'),
      lose: (x) => (lvl(x.t, 2), 'The blanket bred too little tritium to keep a plant running. Redesign under way.'),
    },
    {
      id: 'pilot', label: () => 'Pilot Power Plant', emoji: '\u{1F3ED}', blurb: 'The first fusion plant to feed electricity into the grid.',
      years: 4, cost: fixed(400_000_000), odds: fixed(0.55), capex: true,
      unlocks: true,
      gate: (t) => once(t, 'pilot') ?? (t.stage < 2 ? 'Needs net energy gain first.' : !done(t, 'blanket') ? 'Needs a tritium breeding blanket.' : null),
      win: (x) => ((x.t.plant += 1), stageAtLeast(x.t, 3), hype(x.t, 25), lvl(x.t, 8), 'Your pilot plant is on the grid. The lights in a city are running on fusion.'),
      lose: (x) => (lvl(x.t, 4), 'The pilot plant ran for six hours before the magnets overheated. Repairs will take years.'),
    },
    {
      id: 'powerPlant', label: (t) => (timesDone(t, 'powerPlant') > 0 ? 'Another Fusion Power Plant' : 'First Commercial Fusion Plant'), emoji: '\u{1F31F}', blurb: 'A full-size fusion plant. Each one after the first is harder to site.',
      years: 3, cost: (t) => 300_000_000 * (1 + 0.35 * timesDone(t, 'powerPlant')), odds: fixed(0.8), capex: true,
      unlocks: true,
      gate: (t) => (t.stage < 3 ? 'Needs a pilot plant on the grid first.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
      win: (x) => ((x.t.plant += 1), stageAtLeast(x.t, 4), lvl(x.t, 4), 'Another fusion plant is running, burning seawater for power.'),
    },
  ],
  neurotech: [
    {
      id: 'electrodes', label: () => 'Flexible Electrode Array', emoji: '\u{1F9F5}', blurb: 'Threads thinner than a hair that listen to a thousand neurons.',
      years: 1, cost: fixed(3_000_000), odds: fixed(0.75),
      unlocks: true,
      gate: (t) => once(t, 'electrodes'),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 8), hype(x.t, 6), 'Your electrode array records a thousand neurons at once. Universities placed orders.'),
      lose: (x) => (lvl(x.t, 2), 'The threads broke during insertion in every test. Back to the materials lab.'),
    },
    {
      id: 'decoder', label: () => 'Neural Decoder', emoji: '\u{1F9EE}', blurb: 'Software that turns brain signals into cursor moves and words.',
      years: 1, cost: fixed(2_500_000), odds: fixed(0.75),
      unlocks: true,
      gate: (t) => once(t, 'decoder'),
      win: (x) => (lvl(x.t, 7), boost(x.t, 0.1), 'Your decoder reads intended movements with 95% accuracy. The demo video is remarkable.'),
    },
    {
      id: 'robot', label: () => 'Surgical Insertion Robot', emoji: '\u{1F916}', blurb: 'A robot that places the threads while avoiding blood vessels.',
      years: 2, cost: fixed(8_000_000), odds: fixed(0.65),
      gate: (t) => once(t, 'robot') ?? (!done(t, 'electrodes') ? 'Needs an electrode array first.' : null),
      win: (x) => (safe(x.t, 20), cut(x.t, 0.08), lvl(x.t, 6), 'Your robot implants a device in under an hour. Surgeons can train on it in a week.'),
    },
    {
      id: 'firstHuman', label: () => 'First-in-Human Trial', emoji: '\u{1F9D1}\u{200D}\u{2695}\u{FE0F}', blurb: 'Implant the device in a few patients who cannot move or speak.',
      years: 3, cost: fixed(25_000_000), odds: (t) => clampOdds(0.4 + t.safety / 250),
      unlocks: true,
      gate: (t) => once(t, 'firstHuman') ?? (t.stage < 1 ? 'Needs research devices first.' : !done(t, 'decoder') ? 'Needs a neural decoder.' : null),
      win: (x) => (stageAtLeast(x.t, 2), hype(x.t, 30), lvl(x.t, 10), 'Your first patient moved a cursor using only their thoughts. The world is watching.'),
      lose: (x) => (lvl(x.t, 3), (x.t.safety = Math.max(0, x.t.safety - 10)), 'The trial was paused after implants stopped working within months. The regulator wants answers.'),
    },
    {
      id: 'approval', label: () => 'Device Approval Filing', emoji: '\u{1F3DB}\u{FE0F}', blurb: 'A pivotal trial and a mountain of paperwork for the medical device regulator.',
      years: 3, cost: fixed(45_000_000), odds: (t) => clampOdds(0.35 + t.safety / 200),
      unlocks: true,
      gate: (t) => once(t, 'approval') ?? (t.stage < 2 ? 'Needs a first-in-human trial first.' : null),
      win: (x) => (stageAtLeast(x.t, 3), hype(x.t, 20), lvl(x.t, 8), 'Approved! Doctors can now implant your device in paying patients.'),
      lose: (x) => (lvl(x.t, 3), 'The regulator asked for two more years of safety data. Approval slipped again.'),
    },
    {
      id: 'wireless', label: () => 'Fully Wireless Implant', emoji: '\u{1F4F6}', blurb: 'No wires through the skin: the implant charges and talks through the scalp.',
      years: 2, cost: fixed(12_000_000), odds: fixed(0.6),
      gate: (t) => once(t, 'wireless') ?? (t.stage < 2 ? 'Needs a first-in-human trial first.' : null),
      win: (x) => (prem(x.t, 0.15), boost(x.t, 0.15), safe(x.t, 10), lvl(x.t, 5), 'Your implant is fully wireless. Patients go home the next day.'),
    },
    {
      id: 'mainstream', label: () => 'Mainstream Brain Interface', emoji: '\u{1F9E0}', blurb: 'A cheaper implant for millions of patients, not dozens.',
      years: 3, cost: fixed(80_000_000), odds: fixed(0.55),
      unlocks: true,
      gate: (t) => once(t, 'mainstream') ?? (t.stage < 3 ? 'Needs an approved device first.' : t.level < 60 ? 'Needs tech level 60+.' : null),
      win: (x) => (stageAtLeast(x.t, 4), boost(x.t, 0.3), hype(x.t, 25), lvl(x.t, 10), 'Hospitals schedule your implant like a pacemaker. The waiting list is two years long.'),
      lose: (x) => (lvl(x.t, 3), 'Costs would not come down far enough for mass use. The plan was shelved.'),
    },
    {
      id: 'implantFactory', label: (t) => (t.plant > 0 ? 'Another Implant Factory' : 'Implant Factory'), emoji: '\u{1F3ED}', blurb: 'Cleanrooms to make implants by the thousand. Each extra one adds less.',
      years: 2, cost: (t) => 20_000_000 * (1 + 0.35 * t.plant), odds: fixed(0.85), capex: true,
      gate: (t) => (t.stage < 3 ? 'Needs an approved device first.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
      win: (x) => ((x.t.plant += 1), lvl(x.t, 2), 'Your new implant factory is running. Waiting lists are getting shorter.'),
    },
  ],
  drones: [
    {
      id: 'autopilot', label: () => 'Autonomous Flight Software', emoji: '\u{1F9ED}', blurb: 'Drones that plan their own route and dodge trees.',
      years: 1, cost: fixed(2_000_000), odds: fixed(0.75),
      unlocks: true,
      gate: (t) => once(t, 'autopilot'),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 8), hype(x.t, 6), 'Your drones fly survey routes on their own. Farmers and film crews are buying.'),
      lose: (x) => (lvl(x.t, 2), 'The autopilot mistook a lake for a field and went for a swim. Back to testing.'),
    },
    {
      id: 'bvlos', label: () => 'Beyond-Sight Flight Permit', emoji: '\u{1F4DC}', blurb: 'Permission to fly where the pilot cannot see the drone.',
      years: 2, cost: fixed(3_000_000), odds: (t) => clampOdds(0.45 + t.safety / 200),
      unlocks: true,
      gate: (t) => once(t, 'bvlos') ?? (t.stage < 1 ? 'Needs drones in the air first.' : null),
      win: (x) => (lvl(x.t, 4), safe(x.t, 10), 'The aviation regulator approved your drones for flights beyond the pilot’s sight.'),
      lose: (x) => (lvl(x.t, 1), 'The regulator wants another year of flight data before it signs off.'),
    },
    {
      id: 'delivery', label: () => 'Drone Delivery Network', emoji: '\u{1F4E6}', blurb: 'Scheduled routes that drop parcels and medicine in the backyard.',
      years: 2, cost: fixed(10_000_000), odds: fixed(0.7),
      unlocks: true,
      gate: (t) => once(t, 'delivery') ?? (!done(t, 'bvlos') ? 'Needs a beyond-sight flight permit.' : null),
      win: (x) => (stageAtLeast(x.t, 2), boost(x.t, 0.15), hype(x.t, 12), lvl(x.t, 6), 'Your drones deliver ten thousand parcels a week. Pizza arrives still hot.'),
      lose: (x) => (lvl(x.t, 2), 'A drone dropped a parcel through a greenhouse roof. The launch was paused.'),
    },
    {
      id: 'avoid', label: () => 'Detect-and-Avoid System', emoji: '\u{1F4E1}', blurb: 'Radar and cameras that spot planes and birds in time to swerve.',
      years: 1, cost: fixed(4_000_000), odds: fixed(0.75),
      gate: (t) => once(t, 'avoid'),
      win: (x) => (safe(x.t, 25), lvl(x.t, 4), 'Your drones now see and avoid other aircraft. The regulator noticed.'),
    },
    {
      id: 'evtol', label: () => 'Air Taxi Prototype', emoji: '\u{1F681}', blurb: 'A battery aircraft that takes off like a helicopter and carries four people.',
      years: 3, cost: fixed(60_000_000), odds: fixed(0.5),
      unlocks: true,
      gate: (t) => once(t, 'evtol') ?? (t.stage < 2 ? 'Needs a delivery network first.' : t.level < 45 ? 'Needs tech level 45+.' : null),
      win: (x) => (lvl(x.t, 10), hype(x.t, 25), 'Your air taxi flew a full circuit over the city with a test pilot aboard.'),
      lose: (x) => (lvl(x.t, 3), 'The prototype’s batteries were too heavy to carry passengers. Back to the drawing board.'),
    },
    {
      id: 'typeCert', label: () => 'Air Taxi Type Certificate', emoji: '\u{2708}\u{FE0F}', blurb: 'The aviation regulator’s full approval to carry paying passengers.',
      years: 3, cost: fixed(40_000_000), odds: (t) => clampOdds(0.35 + t.safety / 200),
      unlocks: true,
      gate: (t) => once(t, 'typeCert') ?? (!done(t, 'evtol') ? 'Needs an air taxi prototype.' : null),
      win: (x) => (stageAtLeast(x.t, 3), prem(x.t, 0.15), hype(x.t, 20), lvl(x.t, 6), 'Certified! Your air taxis carry paying passengers over the traffic.'),
      lose: (x) => (lvl(x.t, 2), 'The regulator found gaps in the safety case. Certification is pushed back again.'),
    },
    {
      id: 'aircraftFactory', label: (t) => (t.plant > 0 ? 'Another Aircraft Factory' : 'Aircraft Factory'), emoji: '\u{1F3ED}', blurb: 'A line that builds drones and aircraft by the thousand. Each extra one adds less.',
      years: 2, cost: (t) => 15_000_000 * (1 + 0.35 * t.plant), odds: fixed(0.85), capex: true,
      gate: (t) => (t.stage < 1 ? 'Needs drones in the air first.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
      win: (x) => ((x.t.plant += 1), lvl(x.t, 2), 'Your new aircraft factory is open and running two shifts.'),
    },
  ],
  carbonCapture: [
    {
      id: 'sorbent', label: () => 'Better Sorbent', emoji: '\u{1F9EA}', blurb: 'A filter material that grabs more carbon dioxide with less heat.',
      years: 1, cost: fixed(2_500_000), odds: fixed(0.75),
      unlocks: true,
      gate: (t) => once(t, 'sorbent'),
      win: (x) => (cut(x.t, 0.08), lvl(x.t, 8), 'Your new sorbent captures twice the carbon dioxide per cycle.'),
      lose: (x) => (lvl(x.t, 2), 'The sorbent worked great in the lab and crumbled in humid air. Back to the beakers.'),
    },
    {
      id: 'demo', label: () => 'Demonstration Plant', emoji: '\u{1F3D7}\u{FE0F}', blurb: 'A container-sized plant that removes a few hundred tonnes a year.',
      years: 1, cost: fixed(5_000_000), odds: fixed(0.75),
      unlocks: true,
      gate: (t) => once(t, 'demo') ?? (!done(t, 'sorbent') ? 'Needs a better sorbent first.' : null),
      win: (x) => (stageAtLeast(x.t, 1), lvl(x.t, 6), hype(x.t, 10), 'Your demonstration plant is pulling carbon out of the air. Early buyers are paying a premium.'),
    },
    {
      id: 'storage', label: () => 'Permanent Underground Storage', emoji: '\u{26F0}\u{FE0F}', blurb: 'Inject the gas into basalt, where it turns to stone within two years.',
      years: 2, cost: fixed(8_000_000), odds: fixed(0.7),
      gate: (t) => once(t, 'storage') ?? (t.stage < 1 ? 'Needs a demonstration plant first.' : null),
      win: (x) => (safe(x.t, 20), prem(x.t, 0.1), lvl(x.t, 5), 'Your carbon now turns to rock underground. Buyers pay more for removals that last.'),
    },
    {
      id: 'mrv', label: () => 'Removal Verification System', emoji: '\u{1F4CF}', blurb: 'Sensors and audits that prove every tonne was really removed.',
      years: 1, cost: fixed(2_000_000), odds: fixed(0.85),
      gate: (t) => once(t, 'mrv'),
      win: (x) => (safe(x.t, 15), boost(x.t, 0.1), lvl(x.t, 3), 'Independent auditors verify every tonne you sell. Credit buyers trust your numbers.'),
    },
    {
      id: 'offtake', label: () => 'Big Buyer Offtake Deal', emoji: '\u{1F91D}', blurb: 'Sign tech companies and airlines to buy removals for ten years.',
      years: 1, cost: fixed(1_500_000), odds: (t) => clampOdds(0.4 + t.safety / 250),
      unlocks: true,
      gate: (t) => once(t, 'offtake') ?? (t.stage < 1 ? 'Needs a demonstration plant first.' : null),
      win: (x) => (stageAtLeast(x.t, 2), boost(x.t, 0.2), hype(x.t, 12), lvl(x.t, 3), 'A group of tech giants agreed to buy your removals for a decade. Lenders are calling.'),
      lose: (x) => (lvl(x.t, 1), 'The buyers want proof your tonnes are permanent before they sign.'),
    },
    {
      id: 'capturePlant', label: (t) => (t.plant > 0 ? 'Another Capture Plant' : 'Commercial Capture Plant'), emoji: '\u{1F3ED}', blurb: 'A plant that removes tens of thousands of tonnes a year. Each extra one adds less.',
      years: 2, cost: (t) => 25_000_000 * (1 + 0.35 * t.plant), odds: fixed(0.82), capex: true,
      unlocks: true,
      gate: (t) => (t.stage < 2 ? 'Needs a big buyer deal first.' : t.plant >= PLANT_MAX ? PLANT_FULL : null),
      win: (x) => ((x.t.plant += 1), lvl(x.t, 3), x.t.plant >= 3 ? stageAtLeast(x.t, 3) : 0, 'Another capture plant is online. The fans never stop.'),
    },
    {
      id: 'geothermal', label: () => 'Geothermal-Powered Capture', emoji: '\u{1F30B}', blurb: 'Run the plants on volcanic heat, so the energy itself is carbon-free.',
      years: 2, cost: fixed(12_000_000), odds: fixed(0.65),
      gate: (t) => once(t, 'geothermal') ?? (t.stage < 2 ? 'Needs a commercial plant first.' : null),
      win: (x) => (cut(x.t, 0.12), lvl(x.t, 4), 'Your plants run on geothermal heat. The cost per tonne dropped sharply.'),
    },
  ],
}

// ---------------------------------------------------------------------------
// Endless next-generation R&D: once a company reaches the top of its ladder it can keep going,
// one generation at a time. Each costs 35% more than the last and gains less (better margins,
// a little more demand, a better tech level); the patents it books are a small share of the
// spend, so the payoff comes from selling better products, never from the books.

/** Plants a company can hold (deeptech-state stores up to 200); rising costs stop growth long before. */
export const PLANT_MAX = 200
export const PLANT_FULL = 'Your plants already cover every site regulators will ever permit.'
/** Satellite batches deeptech-state stores (and orbital slots regulators license). */
export const SAT_MAX = 40

/** Satellite batches in revenue terms: the first dozen sell in full, more saturate the subscriber market. */
export function satUnits(sats: number): number {
  const n = Math.max(0, sats)
  return n <= 12 ? n : 12 + 12 * Math.log(1 + (n - 12) / 12)
}

/** AI model generations trained so far (the stored list keeps only the latest ten). */
export function modelGens(t: TechState): number {
  let gen = 0
  for (const m of t.models) gen = Math.max(gen, m.gen)
  return Math.max(gen, t.models.length)
}

const NEXT_GEN: Record<DeepTechIndustry, { name: (k: number) => string; emoji: string; usd: number; years: number; blurb: string }> = {
  semiconductor: { name: (k) => `Chip Architecture Gen ${k}`, emoji: '\u{1F9EE}', usd: 20_000_000, years: 2, blurb: 'A new core design: faster, cooler, cheaper to make. Each generation is harder to beat.' },
  aiLab: { name: (k) => `Inference Platform Gen ${k}`, emoji: '\u{2699}\u{FE0F}', usd: 25_000_000, years: 2, blurb: 'Faster serving, smarter routing, cheaper tokens. Each generation is harder to beat.' },
  robotics: { name: (k) => `Robot Platform Mk ${k}`, emoji: '\u{1F9BE}', usd: 10_000_000, years: 2, blurb: 'A new generation of robots: stronger, cheaper, fewer dramatic falls.' },
  biotech: { name: (k) => `Next-Generation Formulation ${k}`, emoji: '\u{1F48A}', usd: 8_000_000, years: 2, blurb: 'Better versions of your approved drugs: fewer doses, fewer side effects, longer patents.' },
  spaceTech: { name: (k) => `Launch Vehicle Block ${k}`, emoji: '\u{1F680}', usd: 30_000_000, years: 2, blurb: 'A bigger, more reusable rocket. Each block is harder to improve on.' },
  electricVehicles: { name: (k) => `Vehicle Platform Gen ${k}`, emoji: '\u{1F699}', usd: 25_000_000, years: 2, blurb: 'A new platform: more range, lower cost, nicer cupholders.' },
  quantum: { name: (k) => `Processor Generation ${k}`, emoji: '\u{269B}\u{FE0F}', usd: 15_000_000, years: 2, blurb: 'Cleaner qubits and better control electronics. Each generation is harder to beat.' },
  cybersecurity: { name: (k) => `Security Platform v${k}`, emoji: '\u{1F6E1}\u{FE0F}', usd: 5_000_000, years: 1, blurb: 'A rebuilt platform for the next wave of attacks.' },
  fusion: { name: (k) => `Reactor Design Gen ${k}`, emoji: '\u{1F31F}', usd: 40_000_000, years: 3, blurb: 'A smaller, cheaper reactor that runs longer between shutdowns. Each generation is harder to beat.' },
  neurotech: { name: (k) => `Implant Generation ${k}`, emoji: '\u{1F9E0}', usd: 12_000_000, years: 2, blurb: 'More channels, longer battery life, a smaller scar. Each generation is harder to beat.' },
  drones: { name: (k) => `Airframe Block ${k}`, emoji: '\u{1F681}', usd: 12_000_000, years: 2, blurb: 'Longer range, quieter rotors, more payload. Each block is harder to improve on.' },
  carbonCapture: { name: (k) => `Capture Process Gen ${k}`, emoji: '\u{1F343}', usd: 10_000_000, years: 2, blurb: 'Less energy and less money per tonne. Each generation is harder to beat.' },
}

/** The industry's endless next-generation program. */
function nextGenDef(ind: DeepTechIndustry): ProgramDef {
  const d = NEXT_GEN[ind]
  const n = (t: TechState) => timesDone(t, 'nextgen')
  return {
    id: 'nextgen',
    label: (t) => d.name(n(t) + 2),
    emoji: d.emoji,
    blurb: d.blurb,
    years: d.years,
    cost: (t) => d.usd * Math.pow(1.35, n(t)),
    odds: fixed(0.72),
    ipShare: 0.3,
    gate: (t) => (t.stage < maxStage(ind) ? `Reach the top of the ladder first (${stageName(ind, maxStage(ind))}).` : null),
    win: (x) => {
      // done already counts this one: the first next generation is k = 1.
      const k = Math.max(1, timesDone(x.t, 'nextgen'))
      const fade = 1 / (1 + 0.3 * (k - 1))
      lvl(x.t, Math.max(1, Math.round(6 / (1 + 0.25 * (k - 1)))))
      prem(x.t, 0.06 * fade)
      boost(x.t, 0.08 * fade)
      cut(x.t, 0.03 / (1 + 0.4 * (k - 1)))
      hype(x.t, 6)
      return `${d.name(k + 1)} is done: better margins and a bit more demand. The next one will cost more and gain less.`
    },
    lose: (x) => (lvl(x.t, 2), `${d.name(timesDone(x.t, 'nextgen') + 2)} missed its targets. Back to the whiteboard.`),
  }
}

/**
 * A capability research track (AI Lab 2.0): two years of work that adds one research level in one capability.
 * Every model trained after it rates higher there. It has no `unlocks` flag and a lab's manager never starts one.
 * Its price and its odds are the track's task (aicap-effort.ts): 3M x 1.4^level a year, odds .65 whatever the level.
 */
export function capProgram(cap: CapId): ProgramDef {
  const def = CAPS[cap]
  const levels = (t: TechState) => t.caps[cap] ?? 0
  return {
    id: `cap.${cap}`,
    label: (t) => `${def.label} research level ${levels(t) + 1}`,
    emoji: def.emoji,
    blurb: `Research ${def.label.toLowerCase()}. Each level lifts every model you train after it.`,
    years: 2,
    cost: (t) => capTask(cap, levels(t)).cost,
    odds: (t) => capTask(cap, levels(t)).p0,
    ipShare: 0.3,
    track: cap,
    gate: (t) => (levels(t) >= CAP_LEVEL_MAX ? 'Fully researched.' : t.models.some((m) => (m.rating?.[cap] ?? 0) > 0) ? null : 'Train a model that covers it first.'),
    win: (x) => {
      const n = levels(x.t) + 1
      x.t.caps[cap] = n
      // The first three levels of a capability also teach the lab something general; later ones don't pump the level.
      if (n <= 3) lvl(x.t, 1)
      hype(x.t, 4)
      return `${def.label} research reached level ${n}. Your next model will use it.`
    },
    lose: (x) => (lvl(x.t, 1), `${def.label} research stalled. The same level costs the same again.`),
  }
}

/** The lab's model family name: kept from its first model, else picked from the company name. */
function modelFamily(t: TechState, company: string): string {
  const first = t.models[0]?.name ?? ''
  const fam = first.replace(/\s+\d+$/, '')
  if (fam) return fam
  let h = 0
  for (const ch of company) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return MODEL_FAMILIES[h % MODEL_FAMILIES.length]
}

function trainWin(x: ProgCtx): string {
  const t = x.t
  const gen = modelGens(t) + 1
  const compute = Math.min(12, t.plant * 2 + t.rented * 0.8)
  const name = `${modelFamily(t, x.company)} ${gen}`
  if (x.fam && x.rival && x.year >= 2012) return trainRated(x, gen, compute, name, x.fam, x.rival)
  const frontier = frontierScore(x.year)
  const score = Math.round(Math.max(5, Math.min(99, frontier - 38 + t.level * 0.35 + gen * 2 + compute + (x.roll() - 0.5) * 16)))
  t.models.push({ gen, name, score, open: false, year: x.year })
  if (t.models.length > 10) t.models.splice(0, t.models.length - 10)
  t.stage = Math.max(t.stage, 1)
  t.level = Math.min(100, t.level + 5)
  t.hype = Math.max(0, Math.min(100, t.hype + (score >= frontier ? 20 : score >= frontier - 8 ? 8 : 2)))
  const vs = score >= frontier ? 'a new state of the art' : score >= frontier - 8 ? 'close to the frontier' : 'well behind the frontier'
  return `${name} finished training: benchmark score ${score} (${vs}; the best anyone has is about ${frontier}).`
}

/**
 * Training on the AI Lab 2.0 path: one roll rates every capability open that year, the model keeps its composite
 * score on that year's tests, and hype follows its lead over the best rival. The ratings read the level before the +5.
 */
function trainRated(x: ProgCtx, gen: number, compute: number, name: string, fam: string, rivalOf: (year: number) => BestRival | null): string {
  const t = x.t
  const roll = x.roll()
  const rating: CapMap = {}
  for (const c of CAP_IDS) {
    if (capWeight(c, x.year) <= 0) continue
    rating[c] = modelRating({ cap: c, year: x.year, fam, gen, level: t.level, compute, research: t.caps[c] ?? 0, spec: modelSpec(fam, gen, c), roll, released: releasedRating(t.models, c) })
  }
  const score = Math.max(5, Math.min(99, modelScore(fam, rating, x.year)))
  const rival = rivalOf(x.year)
  const tier = rival ? leadTier(compositeRating(rating, x.year) - rival.composite) : 'close'
  t.models.push({ gen, name, score, open: false, year: x.year, ...(Object.keys(rating).length ? { rating } : {}) })
  if (t.models.length > 10) t.models.splice(0, t.models.length - 10)
  t.stage = Math.max(t.stage, 1)
  t.level = Math.min(100, t.level + 5)
  t.hype = Math.max(0, Math.min(100, t.hype + (tier === 'leads' ? 20 : tier === 'close' ? 8 : 2)))
  return rival ? `${name} finished training and scored ${score}. The best rival scores ${rival.score}. ${LEAD_ENDING[tier]}` : `${name} finished training and scored ${score}.`
}

function discoveryWin(x: ProgCtx): string {
  const t = x.t
  const area = DRUG_AREAS[Math.floor(x.roll() * DRUG_AREAS.length) % DRUG_AREAS.length]
  const name = drugName(area, x.roll(), x.roll(), x.roll())
  const id = nextDrugId(t)
  const quality = Math.round(Math.max(10, Math.min(95, 35 + t.level * 0.4 + (x.roll() - 0.5) * 40 + timesDone(t, 'platform') * 8)))
  const peak = Math.round((area.peak[0] + (area.peak[1] - area.peak[0]) * x.roll()) * 100) / 100
  t.drugs.push({ id, name, area: area.id, phase: 0, quality, peak, filed: x.year, approved: 0, royalty: 1, partner: '', failed: false })
  if (t.drugs.length > 12) t.drugs.splice(0, t.drugs.length - 12)
  t.level = Math.min(100, t.level + 4)
  return `Discovery found ${name}, a candidate for ${area.label} (molecule quality ${quality}/100). It's ready for a Phase I trial.`
}

export function nextQubits(q: number): number {
  const ladder = [5, 10, 20, 50, 100, 250, 1_000, 5_000, 20_000, 100_000]
  for (const n of ladder) if (n > q) return n
  return Math.min(1_000_000, q * 2)
}

for (const ind of Object.keys(PROGRAMS) as DeepTechIndustry[]) PROGRAMS[ind].push(nextGenDef(ind))
for (const cap of CAP_IDS) PROGRAMS.aiLab.push(capProgram(cap))

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
  { id: 'us-darpa', name: 'DARPA Research Contract', where: ['us'], who: ['aiLab', 'robotics', 'quantum', 'spaceTech', 'cybersecurity', 'drones', 'neurotech'], max: 8_000_000, share: 0.6, odds: 0.25, blurb: 'Weird, ambitious research the military might need one day.' },
  { id: 'us-nih', name: 'NIH Research Grant', where: ['us'], who: ['biotech', 'neurotech'], max: 3_000_000, share: 0.5, odds: 0.3, blurb: 'Public money for early medical research.' },
  { id: 'us-doe', name: 'DOE Advanced Manufacturing Grant', where: ['us'], who: ['electricVehicles'], max: 150_000_000, share: 0.25, odds: 0.4, capex: true, blurb: 'Help building battery and electric-vehicle factories.' },
  { id: 'us-fes', name: 'DOE Fusion Milestone Award', where: ['us'], who: ['fusion'], max: 40_000_000, share: 0.5, odds: 0.3, blurb: 'Federal money paid out as private fusion labs hit milestones.' },
  { id: 'us-dac', name: 'Direct Air Capture Hub Award', where: ['us'], who: ['carbonCapture'], max: 100_000_000, share: 0.4, odds: 0.35, capex: true, blurb: 'Federal money for regional carbon removal hubs.' },
  { id: 'eu-eic', name: 'EIC Accelerator', where: 'eu', who: ALL_DT, max: 2_700_000, share: 0.7, odds: 0.18, blurb: 'Europe’s flagship grant for breakthrough startups.' },
  { id: 'eu-ipcei', name: 'IPCEI Strategic Project Aid', where: 'eu', who: ['semiconductor', 'electricVehicles'], max: 300_000_000, share: 0.3, odds: 0.45, capex: true, blurb: 'State aid for projects of common European interest.' },
  { id: 'eu-horizon', name: 'Horizon Europe Research Grant', where: 'eu', who: ['quantum', 'biotech', 'aiLab', 'spaceTech', 'robotics', 'fusion', 'neurotech', 'carbonCapture'], max: 4_000_000, share: 0.6, odds: 0.25, blurb: 'Europe’s big research budget.' },
  { id: 'gb-innovate', name: 'Innovate UK Smart Grant', where: ['gb'], who: ALL_DT, max: 1_200_000, share: 0.6, odds: 0.3, blurb: 'The UK’s workhorse innovation grant.' },
  { id: 'gb-aria', name: 'ARIA Programme', where: ['gb'], who: ['aiLab', 'robotics', 'quantum', 'biotech', 'fusion', 'neurotech'], max: 8_000_000, share: 0.6, odds: 0.15, blurb: 'High-risk, high-reward research funding.' },
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
