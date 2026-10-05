// Regular careers: job listings, interviews, hiring, yearly pay / performance /
// promotions / firing / retirement, part-time jobs, freelance gigs, and the
// Occupation menu that ties education, jobs, special careers and the military together.
import {
  addHidden,
  addMoney,
  addRelationship,
  addStat,
  article,
  clamp,
  count,
  currentPartner,
  earnIncome,
  endJob,
  formatMoney,
  getPerson,
  log,
  notice,
  pronouns,
  queueAi,
  relationLabel,
  remember,
  scriptChoice,
  shortMoney,
  useYearAction,
  yearActionsUsed,
} from './core'
import { catchEmbellishment, caughtLine, caughtLying, cvMenu, cvScore, embellishedEntries, jobMarket, jobScreenChance, jobTarget, screeningReason, screeningThoroughness } from './cv'
import { COMPANY_WORDS, FULLTIME_JOBS, GIGS, PARTTIME_JOBS, getJobDef, type GigDef, type Industry, type JobDef } from './data/jobs'
import { admissionsBackgroundCheck, educationMenuNodes, educationRequirementLabel, isStudent, meetsEducation, presentAdmissionsInterview, screenedOut } from './education'
import { createPerson, notePerson } from './people'
import { chance, nextRandom, pick, rand, randInt, shuffle, uid } from './rng'
import { defineScript } from './scripts'
import { militaryMenu, specialCareersMenu, specialJobNodes } from './special'
import { getCountry, NAME_POOLS, randomFirstName, randomLastName } from './world'
import type { GameState, InterviewJob, InterviewQuestion, Job, Json, MenuAction, MenuGroup, MenuNode, Person, ScreeningApp, ScreeningDecision } from './types'

type Slot = 'job' | 'partTimeJob'

const STUDENT_LEVELS = ['university', 'community', 'graduate'] as const

// ---------------------------------------------------------------------------
// Small helpers

function num(v: Json | undefined, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt
}

function round100(n: number): number {
  return Math.max(100, Math.round(n / 100) * 100)
}

function wealth(g: GameState): number {
  return Math.max(0.25, getCountry(g.character.countryId).wealth)
}

/** Deterministic pseudo-random stream for derived data (listings must not mutate state). */
function seeded(seed: number): () => number {
  let state = seed | 0
  return () => {
    const [value, next] = nextRandom(state)
    state = next
    return value
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rPick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length]
}

function rShuffle<T>(r: () => number, list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function listingSeed(g: GameState, salt: string): number {
  const base = num(g.flags.jobListingSeed, 0)
  return hashString(`${g.lifeId}|${g.generation}|${g.character.age}|${base}|${salt}`)
}

function stringList(v: Json | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// ---------------------------------------------------------------------------
// Company names

export function companyName(g: GameState, industry: Industry, r: () => number): string {
  const pool = NAME_POOLS[getCountry(g.character.countryId).names] ?? NAME_POOLS.anglo
  const city = g.character.city
  const W = COMPANY_WORDS
  if (industry === 'corporate') return `${rPick(r, W.corpPrefix)} ${rPick(r, W.corpSuffix)}`
  if (industry === 'tech') return `${rPick(r, W.corpPrefix)} ${rPick(r, W.techSuffix)}`
  if (industry === 'finance') return `${rPick(r, W.corpPrefix)} ${rPick(r, W.financeSuffix)}`
  const templates: readonly string[] = W[industry]
  const tpl = rPick(r, templates)
  return tpl
    .replace('{city}', city)
    .replace('{first}', rPick(r, [...pool.male, ...pool.female]))
    .replace('{last3}', rPick(r, pool.last))
    .replace('{last2}', rPick(r, pool.last))
    .replace('{last}', rPick(r, pool.last))
}

// ---------------------------------------------------------------------------
// Requirements

export function totalWorkExperience(g: GameState): number {
  const c = g.character
  const past = c.careerHistory.reduce((s, r) => s + Math.max(0, r.endAge - r.startAge), 0)
  return past + (c.job?.yearsAtCompany ?? 0)
}

function hasConviction(g: GameState): boolean {
  return g.character.criminalRecord.some((r) => r.convicted)
}

const LICENSE_NAMES: Record<string, string> = { driver: "a driver's license", pilot: "a pilot's license", boating: 'a boating license' }

/** Why the player can't be hired for this job (null when qualified). */
export function jobRequirementProblem(g: GameState, def: JobDef): string | null {
  const c = g.character
  const minAge = def.minAge ?? (def.category === 'parttime' ? 14 : 18)
  if (c.age < minAge) return `You must be at least ${minAge} years old.`
  if (def.drinkingAge) {
    const drinking = getCountry(c.countryId).drinkingAge
    if (c.age < drinking) return `You must be at least ${drinking} to serve alcohol.`
  }
  if (def.gender && c.gender !== def.gender) return `This position is only open to ${def.gender === 'male' ? 'men' : 'women'}.`
  if (def.studentOnly && !isStudent(g, [...STUDENT_LEVELS])) return 'This job is only for university students.'
  if (!meetsEducation(g, def.edu, def.majors)) return `This position requires: ${educationRequirementLabel(def.edu, def.majors)}.`
  if (def.experience && totalWorkExperience(g) < def.experience) return `This position requires ${def.experience} years of work experience.`
  if (def.license && !c.licenses.includes(def.license)) return `You need ${LICENSE_NAMES[def.license] ?? `a ${def.license} license`}.`
  if (def.car && !g.assets.some((a) => a.kind === 'car')) return 'You need to own a car.'
  if (def.cleanRecord && hasConviction(g)) return "They don't hire people with a criminal record."
  if (def.minLooks && c.stats.looks < def.minLooks) return "They're looking for someone with a certain... look."
  if (def.minSmarts && c.stats.smarts < def.minSmarts) return "They're looking for someone a little sharper."
  if (def.minAthleticism && c.hidden.athleticism < def.minAthleticism) return "You're not in good enough shape for this job."
  return null
}

function requirementSummary(def: JobDef): string {
  const parts = [`Education: ${educationRequirementLabel(def.edu, def.majors)}`]
  if (def.experience) parts.push(`Experience: ${def.experience} years`)
  if (def.license) parts.push(`License: ${def.license === 'driver' ? "Driver's" : def.license[0].toUpperCase() + def.license.slice(1)}`)
  if (def.car) parts.push('Must own a car')
  if (def.drinkingAge) parts.push('Must be of drinking age')
  if (def.studentOnly) parts.push('University students only')
  if (def.gender) parts.push(def.gender === 'male' ? 'Men only' : 'Women only')
  if (def.minLooks) parts.push('High looks')
  if (def.minSmarts) parts.push('High smarts')
  if (def.minAthleticism) parts.push('Physically fit')
  if (def.cleanRecord) parts.push('No criminal record')
  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Listings (derived from a yearly seed, so they're stable within a year)

export interface JobListing {
  key: string
  def: JobDef
  title: string
  company: string
  salary: number
}

function makeListing(g: GameState, def: JobDef, r: () => number): JobListing {
  const company = companyName(g, def.industry, r)
  const base = def.ladder[0].salary
  const salary = def.category === 'parttime' ? round100(base * wealth(g)) : round100(base * wealth(g) * (0.92 + r() * 0.16))
  return { key: `${def.id}@${company}`, def, title: def.ladder[0].title, company, salary }
}

export function fullTimeListings(g: GameState): JobListing[] {
  const r = seeded(listingSeed(g, 'ft'))
  const shuffled = rShuffle(r, FULLTIME_JOBS)
  const picked = shuffled.slice(0, 24)
  const qualified = shuffled.slice(24).filter((d) => !jobRequirementProblem(g, d))
  const have = picked.filter((d) => !jobRequirementProblem(g, d)).length
  for (let i = 0; i < Math.max(0, 6 - have) && i < qualified.length; i++) picked.push(qualified[i])
  return picked.map((d) => makeListing(g, d, r)).sort((a, b) => a.title.localeCompare(b.title))
}

export function partTimeListings(g: GameState): JobListing[] {
  const r = seeded(listingSeed(g, 'pt'))
  const regular = rShuffle(
    r,
    PARTTIME_JOBS.filter((d) => !d.studentOnly),
  ).slice(0, 14)
  const campus = isStudent(g, [...STUDENT_LEVELS]) ? rShuffle(r, PARTTIME_JOBS.filter((d) => d.studentOnly)).slice(0, 4) : []
  return [...regular, ...campus].map((d) => makeListing(g, d, r)).sort((a, b) => a.title.localeCompare(b.title))
}

// ---------------------------------------------------------------------------
// Interviews

interface QDef {
  q: string
  /** Interviewer's taste is a coin flip: scores are randomized each time. */
  random?: boolean
  a: [string, number][]
}

const QUESTIONS: QDef[] = [
  { q: 'Are you a goal-oriented person?', a: [['I always have long & short-term goals', 90], ['S.M.A.R.T. goals all day long', 85], ['I love working towards team goals', 85], ['Every day!', 70], ['Yeah, I always shoot for the stars', 65], ['Sometimes I am overly ambitious', 60], ['My goal is to set more goals', 40], ['I set goals but achieving them is challenging', 35], ['I tend to fall short of goals', 15], ["I'm too busy to set goals", 10], ['Goals are for trolls if you ask me', 5], ["I'm not a fan of soccer", 10]] },
  { q: 'Do you consider yourself to be a good listener?', a: [['I hear you loud and clear', 85], ['I listen with my ears and my eyes', 80], ['My friends and family tell me I am', 75], ['Yeah, I think so', 60], ["I'm working to be a better listener", 55], ['Yes, but I struggle with body language', 45], ['I need more time to process what you said', 35], ["It depends who's talking", 25], ["I'm better at talking", 15], ['Could you repeat the question?', 10], ["If I don't have earbuds in", 10], ["Yes, I'm a great writer", 15]] },
  { q: 'Do you handle conflict well?', a: [['I am great at conflict resolution', 90], ['I navigate conflict calmly', 85], ['Yes, I am assertive but gentle', 85], ['I think I handle conflict with tact', 80], ["I'm pretty easy to get along with", 65], ["I'm trying to be more assertive", 50], ['I tend to shy away from conflict', 35], ['I avoid conflict at all costs', 30], ['No, I implode', 10], ["I'm always ready for battle", 15], ['Are you coming at me, bro?', 5], ['I excel at physical & verbal altercations', 5]] },
  { q: 'Do you have any plans for future education?', a: [["I'm committed to lifelong learning", 90], ["I'd like to continue professional learning", 85], ['I try to learn new things every day', 80], ["I wouldn't rule it out", 60], ['Ivy League PhD, here I come!', 55], ['Only if the company will pay for it', 45], ["I'm undecided at this point", 40], ["I haven't really considered it", 30], ["I'm enrolled in the school of hard knocks", 30], ['Are you paying?', 20], ["I've attended my last class", 15], ['School is for fools in my opinion', 5]] },
  { q: 'Do you have any questions for us?', a: [['Can you tell me more about the job?', 85], ['What qualities are you looking for?', 85], ['What are your expectations for this role?', 85], ['Can you tell me more about the culture?', 80], ['Where do you see the company in 5 years?', 75], ['How do I compare to other candidates?', 55], ['When do I start?', 45], ['Am I hired?', 30], ['Why should I want to work here?', 20], ['Where is the bathroom?', 15], ['How much do you make?', 10], ['Are you married?', 5]] },
  { q: 'Coffee or tea?', random: true, a: [['Coffee', 0], ['Tea', 0], ['Both', 0], ['Neither', 0]] },
  { q: 'Do you prefer call or text?', random: true, a: [['Call', 0], ['Text', 0], ['I like both', 0], ['I prefer to talk in person', 0]] },
  { q: 'Do you prefer to be liked or to be right?', random: true, a: [["I'd rather be liked", 0], ["I'd rather be right", 0], ['Both', 0], ['Neither', 0]] },
  { q: 'Have you ever stolen a pen from work?', a: [["I don't take things that aren't mine", 85], ['I would never', 80], ['No, I always purchase them', 75], ["I've never stolen a thing in my life", 70], ['Probably, but never intentionally', 55], ['No, only borrowed them', 50], ['I hope not', 40], ["Honestly, I don't know", 35], ['Is this an accusation?', 20], ['Guilty as charged', 15], ['No, I steal them from other places', 10], ["I've already stolen two here today", 5], ["I'm eyeing the one in your hand now", 5]] },
  { q: 'How are you most likely to invest your money?', a: [['Retirement funds', 80], ['Index funds', 80], ['Real estate', 75], ['Mutual funds', 75], ["I'd invest in this organization", 70], ['Bonds', 70], ['Savings account', 65], ["I'm open to suggestions", 55], ['Gold', 50], ['Crypto', 40], ["I'd rather spend it", 20], ['Sports cars', 15], ['Big parties', 10], ["Ain't nobody got money for that", 10]] },
  { q: 'How did you hear about this position?', a: [["I've always wanted to work here", 85], ['Thorough research led me to it', 85], ['I was referred to it while networking', 80], ['A former colleague told me about it', 75], ['A hiring recruiter suggested it', 70], ['I saw a posting online', 60], ['A friend told me about it', 60], ['I saw a "Now Hiring" sign', 45], ['I heard it through the grapevine', 35], ['I just happened to be walking by', 20], ['Which position?', 5]] },
  { q: 'How do you deal with stressful situations?', a: [['I work well under pressure', 85], ['I collect myself & then use logic', 85], ['By focusing on the task at hand', 85], ['Slow down & focus', 75], ['I remove emotion from the situation', 70], ['I meditate', 65], ['One breath at a time', 60], ['I take a yoga break to compose myself', 55], ['I thrive on stress', 55], ["I'm too blessed to be stressed", 35], ['With the help of my therapy dog', 30], ['I avoid stressful situations', 25], ['I prefer to not deal with them', 15], ['Often with an epic meltdown', 5], ['Poorly', 5], ['With a cocktail', 5]] },
  { q: 'If we asked your friends which animal you would be, which would they choose?', a: [['A lion', 70], ['A dolphin', 70], ['An eagle', 70], ['A dog', 65], ['An ox', 65], ['A horse', 60], ['A fox', 55], ['A unicorn', 50], ['A dragon', 50], ['A cat', 45], ['A shark', 40], ['A raccoon', 30], ['A pig', 20], ['A snake', 15], ['A rat', 10], ['A mosquito', 5]] },
  { q: 'If you were 80 years old, what advice would you give to an 18 year old?', random: true, a: [['Be yourself', 0], ['Carpe diem', 0], ['Follow your heart', 0], ['Keep calm and carry on', 0], ['Laughter is the best medicine', 0], ['Everything happens for a reason', 0], ["Don't put all your eggs in one basket", 0], ['What goes around comes around', 0], ["Don't get married! Ever!", 0], ['Make lemonade when given lemons', 0]] },
  { q: 'What are you looking for in a new position?', a: [['A chance to advance my career', 85], ['An opportunity to grow', 85], ['An opportunity to add value somewhere', 85], ['A chance to learn new skills', 80], ['A path toward my professional goals', 80], ['Mentorship from colleagues', 70], ['A fun working environment', 55], ['An awesome salary', 35], ['Something that will pay the bills', 35], ['Something to get me by for now', 20], ["I'm not too sure", 20], ['Lots of vacation time', 20], ['A lenient boss', 15], ['Cute coworkers', 5]] },
  { q: 'What are your salary expectations?', a: [['A competitive wage for the market', 85], ['They align with my experience', 85], ['The right fit is more important', 80], ['Typical pay for the role & responsibilities', 80], ['I expect to be paid fairly', 75], ['The pay is negotiable', 70], ['A fair salary', 70], ['Depends on the benefits', 55], ['Enough to pay my bills', 45], ["What've you got?", 35], ['You can pay me whatever', 30], ['Top dollar', 25], ['The more the merrier', 20], ['I thought this was an unpaid internship', 15], ['Can you pay me in cash?', 10], ['Gimme dat cash', 5]] },
  { q: 'What or who inspires you?', a: [["Nelson Mandela's fortitude", 85], ["Martin Luther King Jr.'s dream", 85], ['The compassion of Mother Teresa', 80], ['Teachers', 75], ['Successful single parents', 75], ["Keanu Reeves' acts of kindness", 70], ["Lionel Messi's talent", 60], ["Tony Robbins' positive attitude", 60], ['The words of Edgar Allan Poe', 45], ["Arnold Schwarzenegger's acting", 40], ["Mick Jagger's moves", 35]] },
  { q: 'What or who motivates you?', a: [['A passion for learning new things', 85], ['Helping others', 85], ['Words of praise from those I respect', 80], ['A burning drive to be successful', 80], ['My previous failures', 70], ['To be remembered after I’m gone', 60], ['Fear of failure', 50], ['Money', 35], ['Fame & fortune', 30], ['The hopes of an early retirement', 25], ['The desire for power', 20], ['A desire to see my enemies fail', 10], ['A desire to control those around me', 5]] },
  { q: 'What type of work environment do you prefer?', a: [['One that embraces teamwork', 85], ['One with strong leadership', 80], ['A highly productive one', 80], ['One full of passionate people', 80], ['One that is competitive & challenging', 75], ['One with a lot of collaboration', 75], ['One that is fast-paced and intense', 70], ['One that is highly flexible', 55], ['One that is very casual', 45], ['I like to work remotely from home', 45], ['I prefer to work alone', 40], ['One with great benefits', 40], ['One with an ocean view', 25], ['One of micro-management', 20], ['The one that pays the most', 20], ['One with lots of eye candy', 5]] },
  { q: "What's the worst thing you've ever done?", a: [['I forged a permission slip', 60], ["I'd rather not say", 55], ["I didn't plunge a toilet I clogged", 40], ["I've never done anything wrong", 35], ['I lied in an interview', 10], ['I stole from a homeless man', 0]] },
  { q: 'What would you do if you won the lottery?', a: [['Keep working here, obviously', 80], ['Invest it', 75], ["Pay off my friends' student loans", 75], ['Donate it to charity', 75], ['Save it for a rainy day', 70], ['Spend more time with family', 70], ['Buy this organization', 55], ['Buy a small country', 30], ['Buy a yacht', 25], ['Buy a helicopter', 25], ['Throw a huge party', 20], ['Buy 100,000 more lottery tickets', 10], ['Retire', 10]] },
  { q: 'Where do you see yourself in 5 years?', a: [['In a leadership role within your company', 85], ['Here, mastering my craft', 85], ['Making important decisions here', 80], ['As a leading expert in your field', 80], ['Collaborating with you', 75], ['Moving on up in the world', 60], ['As your boss', 35], ['One day at a time, my friend', 30], ['Whiling away in a cubicle', 20], ['At the store buying wrinkle cream', 15], ["I can't envision 5 hours from now", 10], ['Golfing and smoking cigars', 10], ['Retired', 10], ['Hopefully not in rehab', 5]] },
  { q: 'Which element do you identify with the most?', random: true, a: [['Air', 0], ['Earth', 0], ['Fire', 0], ['Water', 0]] },
  { q: 'Which of these is your greatest strength professionally?', a: [['I excel at problem solving', 85], ['I have a strong work ethic', 85], ["I'm a team player", 80], ["I'm dependable", 80], ["I'm a good communicator", 80], ["I'm a strong leader", 80], ["I'm very diligent", 75], ['I have strong people skills', 75], ["I'm usually on time", 50], ['Do I have to pick just one?', 40], ['I never steal from my employer', 35], ["I'd have to think about it more", 25], ['I have no weakness', 20], ["I'm not sure I have strengths", 5]] },
  { q: 'Which of these do you consider to be your biggest area of challenge?', a: [['I tend to take on too much', 80], ["I'm too critical of myself", 75], ['I could be more detail oriented', 70], ["Sometimes I don't ask for help", 70], ['I always try to please everyone', 65], ['I can be shy', 55], ["I'm not as organized as I could be", 45], ['I have some anxiety', 45], ["I'm not great with technology", 35], ["I really don't have any weaknesses", 20], ['Answering interview questions', 15], ["I'm a big time procrastinator", 15], ['I crack under pressure', 10], ["That's none of your business", 5]] },
  { q: 'Which of these words best describes you?', a: [['Driven', 85], ['Efficient', 80], ['Analytical', 80], ['Ambitious', 80], ['Compassionate', 75], ['Cheerful', 70], ['Extraordinary', 55], ['Blessed', 50], ['Fabulous', 45], ['Funky', 35], ['Average', 30], ['Entitled', 5], ['Trainwreck', 5], ['Lazy', 0]] },
  { q: 'Why do you want this job?', a: [["I believe I'm the perfect fit", 85], ["I'll be a great asset to this company", 85], ['I want to be a part of your team', 85], ['The organization has a great reputation', 80], ["I've always wanted to work here", 75], ["It'll allow me to achieve my goals", 75], ["It's my dream job", 70], ['It seems fun', 45], ["Because you're a winner and I'm a winner", 30], ["It's close to where I live", 30], ['Because I need a job', 25], ["It's my only option", 20], ['I want that cash', 10], ['It seems easy', 5], ["I'm not really sure I do anymore", 5]] },
  { q: 'Why should we hire you?', a: [['I have the necessary skills', 85], ['I have the right experience', 85], ["I'll be a great addition to the team", 85], ["I'm a hard worker", 80], ["I'll provide great value to you", 80], ["I'm the right fit", 75], ["You don't want me at a competitor", 55], ['Because I need it badly', 20], ["Because I'm a badass", 20], ["Because I'll do ANYTHING to get it", 15], ['Hmmm, good question', 15], ['I was hoping you could tell me', 10], ['Is that a rhetorical question?', 10], ["I'm not sure you should", 5]] },
  { q: 'Which of these is the best superhero?', random: true, a: [['Batman', 0], ['Superman', 0], ['Wonder Woman', 0], ['Spider-Man', 0], ['Captain America', 0], ['Thor', 0], ['Wolverine', 0], ['None: superheroes are ridiculous', 0]] },
  { q: 'If you could only eat one of these desserts for the rest of your life, what would it be?', random: true, a: [['Apple pie', 0], ['Chocolate chip cookies', 0], ['Cinnamon rolls', 0], ['Donuts', 0], ['Hot fudge brownies', 0], ["S'mores", 0], ['Frozen yogurt', 0], ['Carrot cake', 0]] },
  { q: 'Which of these secret powers would you most like to possess?', random: true, a: [['Telepathy', 0], ['Flight', 0], ['Invisibility', 0], ['Time travel', 0], ['Healing', 0], ['Teleportation', 0], ['Immortality', 0], ['Eat sweets without gaining weight', 0]] },
]

/** Offline interview question with 4 scored answers (score 0-100 drives the hire chance). */
export function fallbackInterviewQuestion(g: GameState, job: InterviewJob): InterviewQuestion {
  void job
  const last = num(g.flags.lastInterviewQ, -1)
  let idx = randInt(g, 0, QUESTIONS.length - 1)
  if (idx === last) idx = (idx + 1) % QUESTIONS.length
  g.flags.lastInterviewQ = idx
  const def = QUESTIONS[idx]
  let answers = shuffle(g, def.a).slice(0, 4)
  if (!def.random && !answers.some(([, s]) => s >= 70)) {
    const best = [...def.a].sort((x, y) => y[1] - x[1])[0]
    answers[0] = best
    answers = shuffle(g, answers)
  }
  return {
    question: def.q,
    answers: answers.map(([label, score]) => ({ label, score: def.random ? randInt(g, 30, 85) : score })),
  }
}

function sanitizeQuestion(q: unknown): InterviewQuestion | null {
  if (!q || typeof q !== 'object') return null
  const raw = q as { question?: unknown; answers?: unknown }
  const question = typeof raw.question === 'string' ? raw.question.trim().slice(0, 300) : ''
  if (!question || !Array.isArray(raw.answers)) return null
  const answers: InterviewQuestion['answers'] = []
  for (const a of raw.answers) {
    if (!a || typeof a !== 'object') continue
    const label = typeof (a as { label?: unknown }).label === 'string' ? ((a as { label: string }).label.trim().slice(0, 120)) : ''
    const s = (a as { score?: unknown }).score
    const score = typeof s === 'number' && Number.isFinite(s) ? Math.round(clamp(s)) : 50
    if (label) answers.push({ label, score })
    if (answers.length >= 6) break
  }
  return answers.length >= 2 ? { question, answers } : null
}

function readJob(v: Json | undefined): InterviewJob | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const { defId, title, company, salary, category } = v
  if (typeof defId !== 'string' || typeof title !== 'string' || typeof company !== 'string' || typeof salary !== 'number') return null
  const cat = category === 'parttime' || category === 'fulltime' || category === 'special' || category === 'military' || category === 'freelance' ? category : 'fulltime'
  return { defId, title, company, salary, category: cat }
}

function jobJson(job: InterviewJob): Json {
  return { defId: job.defId, title: job.title, company: job.company, salary: job.salary, category: job.category }
}

/** Show an interview question (from the AI director or the offline pool). */
export function presentInterview(g: GameState, job: InterviewJob, q: InterviewQuestion): void {
  const c = g.character
  if (!c.alive) return
  const safe = sanitizeQuestion(q) ?? fallbackInterviewQuestion(g, job)
  const gender = chance(g, 0.5) ? 'male' : 'female'
  const interviewer = `${randomFirstName(g, c.countryId, gender)} ${randomLastName(g, c.countryId)}`
  const intro = pick(g, [
    `You sat down with ${interviewer}, the hiring manager at ${job.company}, to interview for the ${job.title} position.`,
    `${interviewer} from ${job.company} shook your hand a little too firmly and started your interview for ${job.title}.`,
    `You showed up to ${job.company} ten minutes early for your ${job.title} interview. ${interviewer} called you in.`,
  ])
  scriptChoice(
    g,
    INTERVIEW,
    'Job Interview',
    `${intro}\n\n"${safe.question}"`,
    safe.answers.map((a, i) => ({ id: String(i), label: a.label })),
    { emoji: '\u{1F91D}', data: { job: jobJson(job), scores: safe.answers.map((a) => a.score), interviewer } },
  )
}

function hireChance(g: GameState, job: InterviewJob, score: number): number {
  const c = g.character
  const def = getJobDef(job.defId)
  let p = 0.08 + 0.72 * (clamp(score) / 100)
  p += (c.stats.smarts - 50) / 300
  p += (c.stats.looks - 50) / 500
  if (!def || def.edu === 'none') p += 0.1
  if (job.category === 'parttime') p += 0.08
  if (def && def.edu !== 'none' && def.edu !== 'highschool' && c.education.degrees.some((d) => d.honors)) p += 0.05
  if (hasConviction(g)) p -= 0.2
  if (c.stats.health < 20) p -= 0.1
  return clamp(p, 0.03, 0.95)
}

const INTERVIEW = defineScript('career.interview', (g, choice, data) => {
  const c = g.character
  if (!c.alive || !data || typeof data !== 'object' || Array.isArray(data)) return
  const job = readJob(data.job)
  if (!job) return
  const scores = Array.isArray(data.scores) ? data.scores : []
  const raw = scores[Number(choice)]
  const score = typeof raw === 'number' ? raw : 50
  const interviewer = typeof data.interviewer === 'string' ? data.interviewer : 'The interviewer'
  if (c.prison) return
  const schoolBlock = job.category === 'fulltime' ? fullTimeSchoolBlocker(g) : null
  if (schoolBlock) {
    notice(g, 'Job Interview', `${interviewer} liked you, but ${schoolBlock.charAt(0).toLowerCase()}${schoolBlock.slice(1)}`, { emoji: '\u{1F3EB}' })
    return
  }
  // A sharp interviewer can tell when a CV line is made up.
  const fake = catchEmbellishment(g, 0.08)
  if (fake) {
    caughtLying(g, fake)
    rejectFor(g, job)
    log(g, `I was caught lying on my CV at ${job.company}.`, 'bad')
    notice(g, 'Caught!', `${interviewer} asked you to tell them more about "${fake.title}". You described it in such vivid, contradictory detail that they ended the interview early.`, { emoji: '\u{1F925}', tone: 'bad' })
    return
  }
  if (chance(g, hireChance(g, job, score))) {
    const j = hireForJob(g, job)
    notice(
      g,
      'Hired!',
      pick(g, [
        `${interviewer} was impressed! You got the job as ${j.title} at ${j.company}. Your salary will be ${formatMoney(j.salary)} a year.`,
        `Welcome aboard! ${j.company} hired you as ${article(j.title)} ${j.title}, starting at ${formatMoney(j.salary)} a year.`,
        `${interviewer} called that afternoon: you're the new ${j.title} at ${j.company}! Pay: ${formatMoney(j.salary)} a year.`,
      ]),
      { emoji: '\u{1F389}', tone: 'good', ai: { when: 'full', facts: `The player was hired as ${j.title} at ${j.company} for ${formatMoney(j.salary)} per year.` } },
    )
    return
  }
  rejectFor(g, job)
  addStat(g, 'happiness', -randInt(g, 2, 6))
  log(g, `I was rejected for the ${job.title} job at ${job.company}.`, 'bad')
  notice(
    g,
    'Rejected',
    pick(g, [
      `${job.company} decided to go with another candidate for the ${job.title} position.`,
      `${interviewer} thanked you for your time, which is corporate for "absolutely not."`,
      `You didn't get the ${job.title} job. ${interviewer} said you weren't "the right culture fit."`,
      `${job.company} rejected you. They'll "keep your resume on file," right next to the shredder.`,
    ]),
    { emoji: '\u{1F4E8}', tone: 'bad' },
  )
})

/** Remember a rejection so the same listing can't be spammed this year. */
function rejectFor(g: GameState, job: InterviewJob): void {
  const rejected = stringList(g.flags.jobsRejected)
  rejected.push(`${job.defId}@${job.company}`)
  g.flags.jobsRejected = rejected
}

// ---------------------------------------------------------------------------
// CV screening (before the interview)
//
// Full-time applications go to the AI director (task 'screenApplication'), which reads the CV
// against the job and the job market and decides on an interview; offline, cvScore + the market
// decide. Part-time jobs are screened on the spot. University and graduate school screenings
// (education.ts) come back through here too.

/** The screener's decision is in: background check, then an interview or a polite no. */
export function applyScreening(g: GameState, app: ScreeningApp, decision: ScreeningDecision): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const reason = typeof decision.reason === 'string' ? decision.reason.trim().slice(0, 240) : ''
  if (app.kind !== 'job') {
    if (admissionsBackgroundCheck(g, app)) return
    if (decision.invite) presentAdmissionsInterview(g, app, decision.question)
    else screenedOut(g, app, reason)
    return
  }
  const job = app.job
  if (!job) return
  const fake = catchEmbellishment(g, screeningThoroughness(app))
  if (fake) {
    caughtLying(g, fake)
    rejectFor(g, job)
    log(g, `${job.company} caught a lie on my CV.`, 'bad')
    notice(g, 'Background Check', `${job.company} won't be interviewing you. ${caughtLine(g, fake)}`, { emoji: '\u{1F575}\u{FE0F}', tone: 'bad' })
    return
  }
  if (!decision.invite) {
    rejectFor(g, job)
    addStat(g, 'happiness', -randInt(g, 1, 3))
    log(g, `${job.company} didn't invite me to interview for ${job.title}.`, 'bad')
    notice(g, 'No Interview', `${job.company} passed on your application for ${job.title}. ${reason || screeningReason(g, app, false)}`, { emoji: '\u{1F4ED}', tone: 'bad' })
    return
  }
  log(g, `My CV landed me an interview at ${job.company}.`, 'good')
  queueAi(g, { type: 'interview', job })
}

/** Build the screening request for a listing. */
function screeningFor(g: GameState, def: JobDef, job: InterviewJob): ScreeningApp {
  const market = jobMarket(g, def.industry)
  const fit = cvScore(g, jobTarget(def)).score
  return { kind: 'job', job, org: job.company, fit, chance: jobScreenChance(def, fit, market), market: market.line }
}

// ---------------------------------------------------------------------------
// Hiring

/** Give the job a (new) boss: the person you report to, filed under the company. */
function hireBoss(g: GameState, job: Job): void {
  const c = g.character
  const def = getJobDef(job.defId)
  const pt = job.category === 'parttime'
  let bossTitle = pt ? 'Shift Supervisor' : 'Manager'
  if (def && !pt) {
    const above = def.ladder[Math.min(def.ladder.length - 1, job.level + 2)]
    bossTitle = above && above.title !== job.title ? above.title : `Head of ${job.company}`
  }
  const boss = createPerson(g, {
    relation: 'boss',
    age: Math.max(25, c.age + randInt(g, -3, 22)),
    contextId: job.company,
    occupation: bossTitle,
    relationship: randInt(g, 40, 70),
  })
  job.bossId = boss.id
}

function staffJob(g: GameState, job: Job): void {
  const c = g.character
  const def = getJobDef(job.defId)
  const pt = job.category === 'parttime'
  hireBoss(g, job)
  const coworkers = pt ? randInt(g, 1, 3) : randInt(g, 2, 4)
  for (let i = 0; i < coworkers; i++) {
    const title = def ? def.ladder[Math.min(def.ladder.length - 1, randInt(g, 0, job.level + 1))].title : job.title
    createPerson(g, {
      relation: 'coworker',
      age: Math.max(pt ? 15 : 18, c.age + randInt(g, -8, 14)),
      contextId: job.company,
      occupation: title,
      relationship: randInt(g, 35, 65),
    })
  }
}

/** Give the player this job (quitting any job in the same slot) and staff it with a boss and coworkers. */
export function hireForJob(g: GameState, job: InterviewJob): Job {
  const c = g.character
  const def = getJobDef(job.defId)
  const slot: Slot = job.category === 'parttime' ? 'partTimeJob' : 'job'
  const old = c[slot]
  if (old) {
    endJob(g, slot, 'quit')
    log(g, `I quit my job as ${old.title} at ${old.company}.`, 'neutral')
  }
  const level = def ? Math.max(0, def.ladder.findIndex((r) => r.title === job.title)) : 0
  const j: Job = {
    defId: job.defId,
    title: job.title,
    company: job.company,
    category: job.category,
    salary: Math.max(0, Math.round(job.salary)),
    level,
    performance: randInt(g, 55, 70),
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { industry: def?.industry ?? 'corporate', workedHarder: 0 },
  }
  if (def?.hours) {
    j.data.hours = def.hours
    j.data.hourly = Math.max(1, Math.round(j.salary / (def.hours * 52)))
  }
  if (def?.studentOnly) j.data.studentOnly = true
  c[slot] = j
  if (slot === 'job') c.retired = false
  staffJob(g, j)
  count(g, 'jobs')
  log(g, `I was hired as ${article(j.title)} ${j.title} at ${j.company}.`, 'good')
  remember(g, `Hired as ${j.title} at ${j.company}.`)
  return j
}

/** Why a full-time job is off the table right now (school, a special career or the military), or null. */
function fullTimeSchoolBlocker(g: GameState): string | null {
  const held = g.character.job
  if (held && held.category === 'military') return `You need to be discharged from the military before taking a civilian job.`
  if (held && held.category === 'special') return `You need to leave your career as ${held.title} before taking a regular full-time job.`
  const cur = g.character.education.current
  if (!cur || cur.level === 'preschool') return null
  return ['elementary', 'middle', 'high'].includes(cur.level)
    ? `You need to finish (or drop out of) ${cur.school} before taking a full-time job.`
    : "You can't work full-time while you're a full-time student. Try a part-time job instead."
}

function applyForListing(g: GameState, listing: JobListing): void {
  const c = g.character
  if (!c.alive) return
  const { def, company, title } = listing
  if (c.prison) {
    notice(g, 'Jobs', "You can't apply for jobs from a prison cell.", { emoji: '\u{1F512}' })
    return
  }
  const schoolBlock = def.category === 'fulltime' ? fullTimeSchoolBlocker(g) : null
  if (schoolBlock) {
    notice(g, 'Jobs', schoolBlock, { emoji: '\u{1F3EB}' })
    return
  }
  const held = def.category === 'parttime' ? c.partTimeJob : c.job
  if (held && held.defId === def.id && held.company === company) {
    notice(g, title, `You already work at ${company}.`, { emoji: def.emoji })
    return
  }
  const problem = jobRequirementProblem(g, def)
  if (problem) {
    notice(g, 'Not Qualified', `${company} turned down your application for ${title}. ${problem}`, { emoji: '\u{1F4CB}', tone: 'bad' })
    return
  }
  if (stringList(g.flags.firedJobs).includes(def.id)) {
    notice(g, 'No Interview', `${company} refused to interview you. Word got around about why you were fired from your last ${title.replace(/^(Jr\.|Apprentice) /, '')} job.`, { emoji: '\u{1F6AB}', tone: 'bad' })
    return
  }
  if (stringList(g.flags.jobsRejected).includes(listing.key)) {
    notice(g, 'Rejected', `${company} already turned you down this year. Try again when new listings come out.`, { emoji: '\u{1F4E8}' })
    return
  }
  const job: InterviewJob = { defId: def.id, title, company, salary: listing.salary, category: def.category }
  // Greek life pays off: a fellow member skips the interview entirely.
  if (typeof g.flags.greek === 'string' && def.category === 'fulltime' && chance(g, 0.12)) {
    const j = hireForJob(g, job)
    const house = g.flags.greek
    notice(g, 'Hired!', `Your interviewer at ${company} noticed your ${house} ring and recognized a fellow member. You were hired on the spot as ${j.title}, no questions asked!`, { emoji: '\u{1F91D}', tone: 'good' })
    return
  }
  const app = screeningFor(g, def, job)
  if (def.category === 'parttime') {
    // Hourly jobs skim your CV on the spot.
    const invite = chance(g, app.chance)
    applyScreening(g, app, { invite, reason: screeningReason(g, app, invite) })
    return
  }
  queueAi(g, { type: 'screenApplication', app })
}

function jobRecruiter(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const schoolBlock = fullTimeSchoolBlocker(g)
  if (schoolBlock) {
    notice(g, 'Job Recruiter', schoolBlock, { emoji: '\u{1F3EB}' })
    return
  }
  if (!useYearAction(g, 'recruiter', 1)) {
    notice(g, 'Job Recruiter', 'Your recruiter is "still working on it." Check back next year.', { emoji: '\u{1F575}\u{FE0F}' })
    return
  }
  const fired = stringList(g.flags.firedJobs)
  const options = FULLTIME_JOBS.filter((d) => !jobRequirementProblem(g, d) && !fired.includes(d.id) && d.id !== c.job?.defId)
  if (options.length === 0) {
    notice(g, 'Job Recruiter', "The recruiter looked at your resume, sighed, and said they couldn't find anything you qualify for.", { emoji: '\u{1F575}\u{FE0F}' })
    return
  }
  const top = [...options].sort((a, b) => b.ladder[0].salary - a.ladder[0].salary).slice(0, 6)
  const def = pick(g, top)
  const company = companyName(g, def.industry, () => rand(g))
  const salary = round100(def.ladder[0].salary * wealth(g) * (1.05 + rand(g) * 0.1))
  notice(g, 'Job Recruiter', `A recruiter set you up with an interview for ${article(def.ladder[0].title)} ${def.ladder[0].title} position at ${company} paying ${formatMoney(salary)} a year.`, { emoji: '\u{1F575}\u{FE0F}' })
  queueAi(g, { type: 'interview', job: { defId: def.id, title: def.ladder[0].title, company, salary, category: 'fulltime' } })
}

// ---------------------------------------------------------------------------
// Performance, promotions, firing, retirement

const FIRE_REASONS = [
  'No explanation was given as to why you have been let go.',
  "They say it's because you are not reliable.",
  "They say it's because everyone in the office got food poisoning from the food you brought to the potluck.",
  "They say it's because they're tired of seeing you complain about management on social media.",
  "They tell you it's because they believe you have been stealing office supplies.",
  "They tell you it's because you are always late.",
  "They tell you it's because you're too apathetic, but you don't really care.",
  'They tell you it\'s because you say "YOLO" too much.',
  "They tell you it's not you, it's them.",
  'They tell you that you ask too many questions, to which you reply, "How many questions are too many?"',
  "They say something about you not being a good listener, but you weren't really paying attention.",
  "You are told it's because you spend too much time in the bathroom.",
  'You are told that they want to go in a different direction.',
  "You suspect it's because you took the last cup of coffee and didn't brew a new pot.",
  "You suspect it's because you destroyed the copy machine.",
  "You suspect it's because you keep clogging the only toilet.",
  "You are told it's because your performance just isn't up to the organization's standards.",
  "They tell you it's because you waste too much time messing around on your phone.",
  "You suspect it's because you have been working on your resume at work.",
  "They tell you it's because the office was robbed after you forgot to lock the door.",
  "You are told it's because you cry at work too much.",
  "You are told it's because you cut too many corners.",
]

const BEG_FAILS = [
  "Your boss said they couldn't help you.",
  "Your boss said they couldn't help you, but wished you well in your future endeavors.",
  "Your boss told you not to let the door hit you on the way out.",
  'Your boss slammed the door in your face.',
  'Your boss laughed at you before calling security to escort you out.',
]

function bossName(g: GameState, job: Job): string {
  const boss = getPerson(g, job.bossId)
  return boss ? `${boss.firstName} ${boss.lastName}` : 'Your boss'
}

function firedJobsAdd(g: GameState, defId: string): void {
  const list = stringList(g.flags.firedJobs)
  if (!list.includes(defId)) list.push(defId)
  g.flags.firedJobs = list
}

function fire(g: GameState, slot: Slot, reason: string): void {
  const c = g.character
  const job = c[slot]
  if (!job) return
  const boss = bossName(g, job)
  const saved: Job = structuredClone(job)
  delete saved.bossId
  firedJobsAdd(g, job.defId)
  endJob(g, slot, 'fired')
  count(g, 'fired')
  addStat(g, 'happiness', -randInt(g, 10, 20))
  remember(g, `Fired from ${job.title} at ${job.company}.`)
  log(g, `I was fired from my job as ${job.title} at ${job.company}.`, 'bad')
  const who = boss === 'Your boss' ? 'Your boss' : `Your boss, ${boss},`
  scriptChoice(g, FIRED, "You're Fired!", `${who} called you into the office and fired you from your job as ${job.title}. ${reason}`, [
    { id: 'accept', label: 'Accept it', emoji: '\u{1F614}' },
    { id: 'beg', label: 'Beg for my job back', emoji: '\u{1F64F}' },
    { id: 'tell', label: 'Tell them off', emoji: '\u{1F595}' },
  ], { emoji: '\u{1F525}', data: { job: saved as unknown as Json, slot } })
}

const FIRED = defineScript('career.fired', (g, choice, data) => {
  const c = g.character
  if (!c.alive || !data || typeof data !== 'object' || Array.isArray(data)) return
  const slot: Slot = data.slot === 'partTimeJob' ? 'partTimeJob' : 'job'
  const raw = data.job
  const job = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as unknown as Job) : null
  if (choice === 'beg') {
    if (job && !c[slot] && typeof job.title === 'string' && chance(g, 0.07)) {
      const restored: Job = { ...structuredClone(job), performance: 30, yearsInRole: job.yearsInRole ?? 0, data: { ...(job.data ?? {}) } }
      c[slot] = restored
      staffJob(g, restored)
      g.flags.firedJobs = stringList(g.flags.firedJobs).filter((id) => id !== job.defId)
      for (let i = c.careerHistory.length - 1; i >= 0; i--) {
        const r = c.careerHistory[i]
        if (r.reason === 'fired' && r.company === restored.company && r.title === restored.title) {
          c.careerHistory.splice(i, 1)
          break
        }
      }
      count(g, 'fired', -1)
      log(g, `I begged for my job back as ${restored.title} and somehow it worked.`, 'good')
      notice(g, 'Second Chance', `You got on your knees and begged. Against all odds, your boss gave you one more chance as ${restored.title}. Don't blow it.`, { emoji: '\u{1F64F}', tone: 'good' })
      return
    }
    addStat(g, 'happiness', -3)
    log(g, 'I begged for my job back. It did not work.', 'bad')
    notice(g, 'Begging', pick(g, BEG_FAILS), { emoji: '\u{1F6AA}', tone: 'bad' })
    return
  }
  if (choice === 'tell') {
    addStat(g, 'happiness', randInt(g, 3, 8))
    addHidden(g, 'karma', -2)
    log(g, 'I told my boss off on the way out.', 'neutral')
    notice(g, 'Fired', pick(g, ['You told your boss exactly where to put that pink slip. Security walked you out, but you felt great.', 'You knocked over a potted plant on your way out and told everyone you were "going to be a YouTuber now."']), { emoji: '\u{1F595}' })
    return
  }
  log(g, 'I cleaned out my desk.', 'neutral')
})

function computePension(job: Job): number {
  const pct = clamp(0.1 + job.yearsAtCompany * 0.02, 0.1, 0.7)
  return round100(job.salary * pct)
}

function retire(g: GameState, forced = false): void {
  const c = g.character
  const job = c.job
  if (!job) return
  const pension = computePension(job)
  c.pension = Math.max(c.pension, pension)
  endJob(g, 'job', 'retired')
  c.retired = true
  addStat(g, 'happiness', 8)
  remember(g, `Retired from ${job.company} after ${job.yearsAtCompany} years.`)
  log(g, `I retired from my job as ${job.title} at ${job.company}.`, 'good')
  notice(
    g,
    'Retirement',
    `${forced ? `${job.company} decided it was time. ` : ''}You retired from your job as ${job.title} at ${job.company} after ${job.yearsAtCompany} year${job.yearsAtCompany === 1 ? '' : 's'}. You'll collect a pension of ${formatMoney(c.pension)} a year. Time to take up golf, or complaining.`,
    { emoji: '\u{1F3D6}\u{FE0F}', tone: 'good' },
  )
}

const RETIRE_OFFER = defineScript('career.retirementOffer', (g, choice) => {
  if (!g.character.alive || !g.character.job) return
  if (choice === 'retire') retire(g)
  else log(g, 'I turned down an early retirement package.', 'neutral')
})

function promote(g: GameState, job: Job, def: JobDef): void {
  if (job.level >= def.ladder.length - 1) return
  job.level += 1
  const rung = def.ladder[job.level]
  const oldTitle = job.title
  job.title = rung.title
  job.yearsInRole = 0
  job.salary = Math.max(round100(job.salary * 1.06), round100(rung.salary * wealth(g) * (0.95 + rand(g) * 0.1)))
  job.performance = Math.max(45, job.performance - randInt(g, 5, 12))
  count(g, 'promotions')
  addStat(g, 'happiness', 8)
  remember(g, `Promoted from ${oldTitle} to ${rung.title} at ${job.company}.`)
  log(g, `I was promoted to ${rung.title} at ${job.company}.`, 'good')
  notice(
    g,
    'Promotion!',
    pick(g, [
      `Your hard work paid off! You've been promoted from ${oldTitle} to ${rung.title} at ${job.company}. Your new salary is ${formatMoney(job.salary)} a year.`,
      `Congratulations! ${job.company} promoted you to ${rung.title}. That comes with a bigger salary (${formatMoney(job.salary)}) and a slightly bigger chair.`,
      `You've been promoted to ${rung.title}! Your new salary is ${formatMoney(job.salary)}. Your coworkers are "so happy for you."`,
    ]),
    { emoji: '\u{1F389}', tone: 'good', ai: { when: 'full', facts: `The player was promoted from ${oldTitle} to ${rung.title} at ${job.company}; new salary ${formatMoney(job.salary)}.` } },
  )
}

function injure(g: GameState, job: Job): void {
  const c = g.character
  const injuries = ['Broken Arm', 'Sprained Back', 'Broken Leg', 'Concussion', 'Bruised Ribs']
  const name = pick(g, injuries)
  addStat(g, 'health', -randInt(g, 8, 18))
  if (!c.conditions.some((x) => x.name === name)) {
    c.conditions.push({ id: uid(g, 'c'), name, kind: 'injury', severity: randInt(g, 10, 25), yearsHad: 0, curable: true, diagnosed: true, age: c.age })
  }
  log(g, `I suffered a ${name.toLowerCase()} on the job.`, 'bad')
  notice(g, 'Workplace Injury', `You suffered a ${name.toLowerCase()} while working as ${job.title}. Workers' comp covered the hospital bill, but not your dignity.`, { emoji: '\u{1FA79}', tone: 'bad' })
}

function yearForJob(g: GameState, slot: Slot): void {
  const c = g.character
  const job = c[slot]
  if (!job) return
  const def = getJobDef(job.defId)
  // Campus jobs end with your student status.
  if (job.data.studentOnly === true && !isStudent(g, [...STUDENT_LEVELS])) {
    endJob(g, slot, 'graduated')
    log(g, `My campus job as ${job.title} ended when I left school.`, 'neutral')
    return
  }
  const partner = currentPartner(g)
  if (def?.celibate && partner) {
    fire(g, slot, `Apparently a ${job.title} isn't supposed to have a ${relationLabel(partner).toLowerCase()}. Your vow of celibacy was broken.`)
    return
  }

  earnIncome(g, job.salary)
  job.yearsAtCompany += 1
  job.yearsInRole += 1

  const effort = Math.min(3, num(job.data.workedHarder, 0))
  job.data.workedHarder = 0
  let target = 28 + c.stats.smarts * 0.25 + c.stats.happiness * 0.15 + c.stats.health * 0.1 + effort * 8
  if (c.conditions.some((x) => x.kind === 'addiction')) target -= 12
  if (job.category === 'fulltime' && c.partTimeJob && slot === 'job') target -= 4
  // Your schedule: long weeks impress the boss and wear you down; short ones do the opposite.
  if (slot === 'job') {
    const weekly = weeklyHours(job)
    target += (weekly - STANDARD_HOURS) * 0.6
    if (weekly >= 50) {
      addStat(g, 'happiness', -Math.round((weekly - 45) / 5))
      if (chance(g, (weekly - 45) / 40)) addStat(g, 'health', -randInt(g, 1, 3))
      if (weekly >= 60 && chance(g, 0.3)) log(g, pick(g, ['I basically lived at the office this year.', 'I forgot what my own bed looked like.', 'My coworkers started forwarding my mail to my desk.']), 'neutral')
    } else if (weekly < STANDARD_HOURS) {
      addStat(g, 'happiness', 1)
    }
  }
  job.performance = Math.round(clamp(job.performance + (clamp(target) - job.performance) * 0.35 + randInt(g, -8, 8)))

  if (def?.stress && chance(g, 0.25 * def.stress)) {
    addStat(g, 'health', -randInt(g, 1, def.stress + 1))
    addStat(g, 'happiness', -1)
  }
  if (def?.danger && chance(g, def.danger)) injure(g, job)

  // Fired for poor performance.
  if (job.performance < 25 && chance(g, job.performance < 15 ? 0.6 : 0.3)) {
    fire(g, slot, pick(g, FIRE_REASONS))
    return
  }
  // Lies on your CV can surface years later.
  const fakes = embellishedEntries(g)
  if (fakes.length && (job.category === 'fulltime' || job.category === 'parttime') && chance(g, 0.03 * fakes.length)) {
    const fake = pick(g, fakes)
    caughtLying(g, fake)
    fire(g, slot, `HR re-ran your background check and found that "${fake.title}" never happened. Lying on your CV is a firing offense at ${job.company}.`)
    return
  }
  if (job.performance < 35 && chance(g, 0.4)) {
    notice(g, 'Warning', pick(g, [`${bossName(g, job)} pulled you aside and said your work as ${job.title} needs to improve. Fast.`, `You got a written warning at ${job.company}. Maybe try working harder?`]), { emoji: '\u{26A0}\u{FE0F}', tone: 'bad' })
  }

  // Rare layoffs.
  if (slot === 'job' && chance(g, 0.006)) {
    const severance = round100(job.salary * randInt(g, 5, 20) / 100)
    endJob(g, slot, 'laid off')
    earnIncome(g, severance)
    addStat(g, 'happiness', -10)
    remember(g, `Laid off from ${job.company}.`)
    log(g, `I was laid off from ${job.company}.`, 'bad')
    notice(g, 'Laid Off', `${job.company} is "restructuring" and your position as ${job.title} was eliminated. You received ${formatMoney(severance)} in severance.`, { emoji: '\u{1F4E6}', tone: 'bad' })
    return
  }

  if (slot === 'job' && def) {
    const top = job.level >= def.ladder.length - 1
    const need = 2 + Math.floor(job.level / 3)
    let promoted = false
    if (!top && job.yearsInRole >= need) {
      const p = job.performance >= 85 ? 0.6 : job.performance >= 70 ? 0.35 : job.performance >= 60 ? 0.12 : 0
      if (chance(g, p)) {
        promote(g, job, def)
        promoted = true
      }
    }
    if (!promoted && job.performance >= 60 && chance(g, top ? 0.35 : 0.3)) {
      const pct = randInt(g, 2, top ? 6 : 5)
      job.salary = round100(job.salary * (1 + pct / 100))
      log(g, `I got a ${pct}% raise at ${job.company}.`, 'good')
    }
    // Retirement.
    if (c.age >= 80) {
      retire(g, true)
      return
    }
    if (c.age >= 65 && job.yearsAtCompany >= 5 && chance(g, 0.25)) {
      scriptChoice(
        g,
        RETIRE_OFFER,
        'Retirement Package',
        `${job.company} is offering you an early retirement package. You'd collect a pension of ${formatMoney(Math.max(c.pension, computePension(job)))} a year. Will you take it?`,
        [
          { id: 'retire', label: 'Retire', emoji: '\u{1F3D6}\u{FE0F}' },
          { id: 'stay', label: 'Keep working', emoji: '\u{1F4BC}' },
        ],
        { emoji: '\u{1F474}' },
      )
    }
  } else if (slot === 'partTimeJob' && job.performance >= 65 && chance(g, 0.15)) {
    const hours = num(job.data.hours, 15)
    const hourly = num(job.data.hourly, Math.round(job.salary / (hours * 52))) + 1
    job.data.hourly = hourly
    job.salary = Math.round(hourly * hours * 52)
    log(g, `I got a raise to ${formatMoney(hourly)} an hour at ${job.company}.`, 'good')
  }
}

// Occasional offline workplace events (the AI director writes most job events).
const TEAM_ACTIVITIES = ['an escape room', 'a trust-fall workshop', 'a paintball match', 'a cooking class', 'a ropes course', 'karaoke night', 'a corporate retreat in the woods']

function maybeJobEvent(g: GameState): void {
  const job = g.character.job
  if (!job || job.category !== 'fulltime' || !chance(g, 0.1)) return
  if (chance(g, 0.5)) {
    const activity = pick(g, TEAM_ACTIVITIES)
    scriptChoice(g, JOB_EVENT, 'Team Building', `${job.company} is doing ${activity} as a team-building exercise. Will you participate?`, [
      { id: 'yes', label: 'Participate', emoji: '\u{1F91D}' },
      { id: 'no', label: 'Refuse', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F465}', data: { kind: 'team', activity } })
  } else {
    scriptChoice(g, JOB_EVENT, 'Overtime', `${bossName(g, job)} asked you to put in extra hours at ${job.company} this month. What will you do?`, [
      { id: 'yes', label: 'Work the extra hours', emoji: '\u{23F0}' },
      { id: 'no', label: 'Politely decline', emoji: '\u{1F6AB}' },
    ], { emoji: '\u{1F4BC}', data: { kind: 'overtime' } })
  }
}

const JOB_EVENT = defineScript('career.event', (g, choice, data) => {
  const c = g.character
  const job = c.job
  if (!c.alive || !job || !data || typeof data !== 'object' || Array.isArray(data)) return
  const kind = data.kind
  if (kind === 'team') {
    const activity = typeof data.activity === 'string' ? data.activity : 'the activity'
    if (choice === 'yes') {
      const fun = chance(g, 0.6)
      addStat(g, 'happiness', fun ? 5 : -3)
      for (const p of g.people) if (p.contextId === job.company && (p.relation === 'coworker' || p.relation === 'boss')) addRelationship(p, 3)
      job.performance = Math.round(clamp(job.performance + 2))
      log(g, `I participated in ${activity} with my coworkers.`, 'neutral')
      notice(g, 'Team Building', fun ? `You joined your coworkers for ${activity}. It was actually fun!` : `You joined your coworkers for ${activity}. Two hours you'll never get back.`, { emoji: '\u{1F465}' })
    } else {
      job.performance = Math.round(clamp(job.performance - 5))
      log(g, `I refused to join ${activity} with my coworkers.`, 'neutral')
      notice(g, 'Team Building', "You skipped the team-building exercise. Your boss noticed. Your boss always notices.", { emoji: '\u{1F645}' })
    }
    return
  }
  if (choice === 'yes') {
    const hours = Math.max(weeklyHours(job), randInt(g, 5, 12) * 5)
    job.data.weeklyHours = hours
    job.data.hoursLocked = c.age
    job.performance = Math.round(clamp(job.performance + randInt(g, 4, 8)))
    addStat(g, 'happiness', -4)
    addStat(g, 'health', -1)
    log(g, `I agreed to work ${hours} hours a week at my job.`, 'neutral')
    notice(g, 'Overtime', `You agreed to work ${hours} hours a week for the rest of the year. Your boss is pleased; your couch misses you.`, { emoji: '\u{23F0}' })
  } else {
    job.performance = Math.round(clamp(job.performance - randInt(g, 2, 5)))
    log(g, "I declined my boss's request to work overtime.", 'neutral')
    notice(g, 'Overtime', 'You politely declined. Your boss said "no problem" in a tone that suggested several problems.', { emoji: '\u{1F6AB}' })
  }
})

// ---------------------------------------------------------------------------
// Yearly hook

export function yearlyCareer(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  g.flags.jobListingSeed = randInt(g, 1, 2_000_000_000)
  g.flags.jobsRejected = []

  if (c.prison) {
    for (const slot of ['job', 'partTimeJob'] as Slot[]) {
      const j = c[slot]
      if (j && (j.category === 'fulltime' || j.category === 'parttime')) {
        endJob(g, slot, 'prison')
        log(g, `I lost my job as ${j.title} because I was locked up.`, 'bad')
      }
    }
    return
  }

  // A pension resumes once you stop working again.
  if (!c.retired && c.pension > 0 && !c.job) c.retired = true
  if (c.retired && c.pension > 0 && !c.job) earnIncome(g, c.pension)

  if (c.job && c.job.category === 'fulltime') yearForJob(g, 'job')
  if (!c.alive) return
  if (c.partTimeJob && (c.partTimeJob.category === 'parttime' || c.partTimeJob.category === 'fulltime')) yearForJob(g, 'partTimeJob')
  maybeJobEvent(g)
}

// ---------------------------------------------------------------------------
// Job actions

function blocked(g: GameState): string | null {
  if (!g.character.alive) return 'You are dead.'
  if (g.character.prison) return "You're in prison."
  return null
}

function workHarder(g: GameState, slot: Slot): void {
  const job = g.character[slot]
  if (!job) return
  if (!useYearAction(g, `workHarder:${slot}`, 3)) {
    notice(g, 'Work Harder', pick(g, ["You're already working as hard as humanly possible. Any harder and you'll burst a blood vessel.", 'You tried to work even harder but mostly just stared at your screen. Try again next year.']), { emoji: '\u{1F4A6}' })
    return
  }
  job.performance = Math.round(clamp(job.performance + randInt(g, 3, 7)))
  job.data.workedHarder = num(job.data.workedHarder, 0) + 1
  addStat(g, 'happiness', -1)
  log(g, pick(g, ['I worked harder at my job.', 'I put in some extra effort at work.', 'I stayed late at the office.', 'I was the first one in and the last one out at work.']), 'neutral')
  notice(
    g,
    'Work Harder',
    pick(g, [
      `You worked harder at ${job.company}. Performance: ${job.performance}%.`,
      `You put your nose to the grindstone as ${job.title}. Performance: ${job.performance}%.`,
      `You skipped lunch and crushed your to-do list. Performance: ${job.performance}%.`,
    ]),
    { emoji: '\u{1F4AA}', tone: 'good' },
  )
}

function askRaise(g: GameState, slot: Slot): void {
  const job = g.character[slot]
  if (!job) return
  const boss = bossName(g, job)
  if (!useYearAction(g, `askRaise:${slot}`, 1)) {
    notice(g, 'Ask for a Raise', `You already asked ${boss === 'Your boss' ? 'your boss' : boss} for a raise this year. Pushing it again would be... brave.`, { emoji: '\u{1F4B0}' })
    return
  }
  let p = job.performance >= 80 ? 0.6 : job.performance >= 65 ? 0.35 : job.performance >= 50 ? 0.15 : 0.04
  p += Math.min(0.15, job.yearsInRole * 0.04)
  if (chance(g, p)) {
    const pct = randInt(g, 3, 10)
    if (slot === 'partTimeJob' && typeof job.data.hours === 'number') {
      const hourly = num(job.data.hourly, Math.round(job.salary / (job.data.hours * 52))) + Math.max(1, Math.round(num(job.data.hourly, 10) * pct / 100))
      job.data.hourly = hourly
      job.salary = Math.round(hourly * job.data.hours * 52)
    } else {
      job.salary = round100(job.salary * (1 + pct / 100))
    }
    addStat(g, 'happiness', 5)
    log(g, `I asked for a raise and got it.`, 'good')
    notice(g, 'Raise!', pick(g, [`${boss} agreed to give you a raise! Your new salary is ${formatMoney(job.salary)} a year.`, `You made your case and ${boss === 'Your boss' ? 'your boss' : boss} caved. New salary: ${formatMoney(job.salary)}.`]), { emoji: '\u{1F4B0}', tone: 'good' })
    return
  }
  job.performance = Math.round(clamp(job.performance - randInt(g, 2, 5)))
  addStat(g, 'happiness', -3)
  if (job.performance < 30 && chance(g, 0.15)) {
    fire(g, slot, 'They say anyone with your performance asking for a raise has some nerve.')
    return
  }
  log(g, 'I asked for a raise and was turned down.', 'bad')
  notice(g, 'Ask for a Raise', pick(g, [`${boss} laughed and said "Maybe next year." It was not a nice laugh.`, `${boss} said the budget is "really tight right now," then left for a golf weekend.`, `${boss} told you raises are for people who earn them.`]), { emoji: '\u{1F62C}', tone: 'bad' })
}

function askPromotion(g: GameState): void {
  const job = g.character.job
  const def = job ? getJobDef(job.defId) : undefined
  if (!job || !def) return
  if (job.level >= def.ladder.length - 1) {
    notice(g, 'Promotion', `You're already at the top of the ladder at ${job.company}.`, { emoji: '\u{1F51D}' })
    return
  }
  if (!useYearAction(g, 'askPromotion', 1)) {
    notice(g, 'Promotion', "You already asked for a promotion this year. Give it time.", { emoji: '\u{23F3}' })
    return
  }
  const boss = bossName(g, job)
  const p = job.performance >= 85 && job.yearsInRole >= 1 ? 0.5 : job.performance >= 70 && job.yearsInRole >= 2 ? 0.3 : job.performance >= 55 ? 0.06 : 0.01
  if (chance(g, p)) {
    promote(g, job, def)
    return
  }
  job.performance = Math.round(clamp(job.performance - randInt(g, 1, 4)))
  log(g, 'I asked for a promotion and was turned down.', 'bad')
  notice(g, 'Promotion', pick(g, [`${boss} said you're "not quite ready" for ${def.ladder[job.level + 1].title}.`, `${boss} told you to keep doing what you're doing. Which apparently isn't enough.`, `${boss} gave the promotion to someone's nephew.`]), { emoji: '\u{1F615}', tone: 'bad' })
}

function quitJob(g: GameState, slot: Slot): void {
  const job = g.character[slot]
  if (!job) return
  endJob(g, slot, 'quit')
  addStat(g, 'happiness', randInt(g, -2, 6))
  log(g, `I quit my job as ${job.title} at ${job.company}.`, 'neutral')
  notice(g, 'Quit', pick(g, [`You quit your job as ${job.title} at ${job.company}.`, `You handed in your resignation at ${job.company}. Your stapler is coming with you.`, `You walked out of ${job.company} for the last time as ${job.title}. Freedom smells like a parking lot.`]), { emoji: '\u{1F6AA}' })
}

// Schedule ---------------------------------------------------------------------

const STANDARD_HOURS = 40
const MIN_HOURS = 38
const MAX_HOURS = 70

function weeklyHours(job: Job): number {
  return clamp(num(job.data.weeklyHours, STANDARD_HOURS), MIN_HOURS, MAX_HOURS)
}

function setHours(g: GameState, input?: string): void {
  const c = g.character
  const job = c.job
  if (!c.alive || c.prison || !job || job.category !== 'fulltime') return
  const parsed = Math.round(Number(input))
  if (!Number.isFinite(parsed) || parsed <= 0) {
    notice(g, 'Hours', `Enter how many hours a week you want to work (${MIN_HOURS}-${MAX_HOURS}).`, { emoji: '\u{23F0}' })
    return
  }
  const hours = clamp(parsed, MIN_HOURS, MAX_HOURS)
  const old = weeklyHours(job)
  if (num(job.data.hoursLocked, -1) === c.age) {
    notice(g, 'Hours', `${bossName(g, job)} expects you to keep working ${old} hours a week this year. Take it up with them next year.`, { emoji: '\u{23F0}' })
    return
  }
  if (hours === old) {
    notice(g, 'Hours', `You're already working ${old} hours a week.`, { emoji: '\u{23F0}' })
    return
  }
  job.data.weeklyHours = hours
  if (hours > old) {
    log(g, `I increased my hours at ${job.company} to ${hours} a week.`, 'neutral')
    notice(
      g,
      'Hours',
      pick(g, [
        `You're now working ${hours} hours a week at ${job.company}. Your boss is impressed; your friends have filed a missing person report.`,
        `You bumped your schedule up to ${hours} hours a week. Sleep is for people without ambition, apparently.`,
      ]),
      { emoji: '\u{23F0}' },
    )
  } else {
    log(g, `I cut my hours at ${job.company} to ${hours} a week.`, 'neutral')
    notice(
      g,
      'Hours',
      pick(g, [
        `You cut back to ${hours} hours a week at ${job.company}. Work-life balance: achieved. Promotion odds: shrinking.`,
        `You're down to ${hours} hours a week. Your boss pretended not to notice. Your boss noticed.`,
      ]),
      { emoji: '\u{23F0}' },
    )
  }
}

// Human Resources ----------------------------------------------------------------

const HR_GRIPES = [
  'stealing your lunch from the fridge',
  'taking credit for your work',
  'microwaving fish in the break room',
  'yelling at you in front of everyone',
  'spreading rumors about you',
  'constantly showing up late and leaving you to cover',
  'hogging the printer for personal projects',
  'replying-all to every single email',
]

function hrTargets(g: GameState, job: Job): Person[] {
  return g.people.filter((p) => p.alive && p.contextId === job.company && (p.relation === 'coworker' || p.relation === 'boss'))
}

function reportToHR(g: GameState, personId: string): void {
  const c = g.character
  const job = c.job
  const target = getPerson(g, personId)
  if (!c.alive || c.prison || !job || !target || !target.alive || target.contextId !== job.company) return
  if (!useYearAction(g, 'hr', 3)) {
    notice(g, 'Human Resources', "HR has stopped answering your emails for the rest of the year. Their out-of-office reply is just a picture of a shrug.", { emoji: '\u{1F4C1}' })
    return
  }
  const name = `${target.firstName} ${target.lastName}`
  const isBoss = target.relation === 'boss'
  const complaints = num(job.data.hrComplaints, 0) + 1
  job.data.hrComplaints = complaints
  // Too many complaints and HR turns around and investigates you.
  if (complaints >= 4 && chance(g, 0.15 * (complaints - 2))) {
    job.performance = Math.round(clamp(job.performance - randInt(g, 8, 15)))
    addStat(g, 'happiness', -6)
    log(g, `HR opened an investigation into me for filing too many complaints.`, 'bad')
    notice(g, 'Human Resources', `HR reviewed your ${complaints} complaints and decided the common denominator was you. They've launched an investigation into your conduct. Performance: ${job.performance}%.`, { emoji: '\u{1F50E}', tone: 'bad' })
    if (job.performance < 25 && chance(g, 0.4)) fire(g, 'job', 'They say HR found you "impossible to work with."')
    return
  }
  // You need an actual reason to report someone.
  if (target.relationship >= 55 && chance(g, 0.6)) {
    log(g, `I tried to report ${name} to HR for no real reason.`, 'neutral')
    notice(g, 'Human Resources', `HR asked what exactly ${name} did wrong. You stared at the ceiling for a while and couldn't come up with anything. They told you to get back to work.`, { emoji: '\u{1F4C1}' })
    return
  }
  const gripe = pick(g, HR_GRIPES)
  notePerson(target, 'Was reported to HR by the player.')
  const roll = rand(g)
  if (roll < 0.35) {
    log(g, `I reported ${name} to HR. Nothing happened.`, 'neutral')
    notice(g, 'Human Resources', pick(g, [`You reported ${name} for ${gripe}. HR thanked you for your feedback and filed it directly into the shredder.`, `You reported ${name} for ${gripe}. HR said they'd "look into it." They did not look into it.`]), { emoji: '\u{1F4C1}' })
    if (chance(g, 0.4)) addRelationship(target, -10)
    return
  }
  if (roll < 0.65) {
    addRelationship(target, -randInt(g, 10, 20))
    log(g, `I reported ${name} to HR and they got a warning.`, 'neutral')
    notice(g, 'Human Resources', `You reported ${name} for ${gripe}. HR gave ${pronouns(target.gender).him} a formal warning. ${pronouns(target.gender).He} has been glaring at you over the cubicle wall ever since.`, { emoji: '\u{26A0}\u{FE0F}' })
    return
  }
  if (roll < 0.85) {
    addRelationship(target, -randInt(g, 15, 25))
    target.money = Math.max(0, Math.round(target.money - randInt(g, 200, 1500)))
    log(g, `I reported ${name} to HR and they had their wages docked.`, 'neutral')
    notice(g, 'Human Resources', `You reported ${name} for ${gripe}. HR docked ${pronouns(target.gender).his} wages. Justice is served, lukewarm, like the office coffee.`, { emoji: '\u{1F4B8}' })
    return
  }
  if (roll < 0.95) {
    g.people = g.people.filter((p) => p.id !== target.id)
    addStat(g, 'happiness', 3)
    log(g, `I reported ${name} to HR and ${pronouns(target.gender).he} got fired.`, 'neutral')
    remember(g, `Got ${isBoss ? 'my boss' : 'a coworker'} ${name} fired by reporting them to HR.`)
    if (isBoss) {
      hireBoss(g, job)
      const fresh = getPerson(g, job.bossId)
      notice(g, 'Human Resources', `You reported your boss, ${name}, for ${gripe}. HR fired ${pronouns(target.gender).him} on the spot!${fresh ? ` Your new boss is ${fresh.firstName} ${fresh.lastName}.` : ''}`, { emoji: '\u{1F525}', tone: 'good' })
    } else {
      notice(g, 'Human Resources', `You reported ${name} for ${gripe}. HR fired ${pronouns(target.gender).him}! Security escorted ${pronouns(target.gender).him} out with a sad little box of desk plants.`, { emoji: '\u{1F525}', tone: 'good' })
    }
    return
  }
  // Backfire: HR sides with them.
  addRelationship(target, -25)
  job.performance = Math.round(clamp(job.performance - randInt(g, 4, 8)))
  addStat(g, 'happiness', -4)
  log(g, `I reported ${name} to HR and it backfired.`, 'bad')
  notice(g, 'Human Resources', `You reported ${name} for ${gripe}. HR "investigated" by asking ${name}, who said you were the problem. HR agreed. You got a reprimand instead.`, { emoji: '\u{1F62C}', tone: 'bad' })
}

function hrMenu(job: Job): MenuGroup {
  return {
    type: 'menu',
    id: 'job.hr',
    label: 'Human Resources',
    emoji: '\u{1F4C1}',
    subtitle: 'Report someone to HR',
    disabledReason: blocked,
    header: () => `File a complaint with HR at ${job.company}. File too many and they may start looking at you instead.`,
    children: (gg) => {
      const j = gg.character.job
      if (!j) return []
      const people = hrTargets(gg, j)
      if (!people.length) return [{ type: 'info', id: 'job.hr.none', text: 'There is nobody at work to report.', emoji: '\u{1F937}' }]
      return people.map(
        (p): MenuAction => ({
          type: 'action',
          id: `job.hr.${p.id}`,
          label: `${p.firstName} ${p.lastName}`,
          emoji: p.relation === 'boss' ? '\u{1F9D1}\u{200D}\u{1F4BC}' : '\u{1F9D1}\u{200D}\u{1F4BB}',
          subtitle: `${relationLabel(p)} • ${p.occupation} • Relationship ${p.relationship}%`,
          disabledReason: blocked,
          confirm: () => `Report ${p.firstName} to HR?`,
          run: (x) => reportToHR(x, p.id),
        }),
      )
    },
  }
}

function jobGroup(g: GameState, slot: Slot): MenuGroup | null {
  const job = g.character[slot]
  if (!job) return null
  const def = getJobDef(job.defId)
  const pt = slot === 'partTimeJob'
  const hours = num(job.data.hours, 0)
  const hourly = num(job.data.hourly, 0)
  return {
    type: 'menu',
    id: `job.${slot}`,
    label: job.title,
    emoji: def?.emoji ?? '\u{1F4BC}',
    subtitle: `${job.company} • ${pt && hourly ? `${formatMoney(hourly)}/hr` : `${shortMoney(job.salary)}/yr`}`,
    header: () => `${job.title} at ${job.company}`,
    children: (gg) => {
      const j = gg.character[slot]
      if (!j) return []
      const d = getJobDef(j.defId)
      const nodes: MenuNode[] = [
        { type: 'info', id: `${slot}.salary`, text: pt && hourly ? `Pay: ${formatMoney(num(j.data.hourly, hourly))}/hour • ${hours} hours/week (${formatMoney(j.salary)}/yr)` : `Salary: ${formatMoney(j.salary)} a year`, emoji: '\u{1F4B5}' },
        { type: 'info', id: `${slot}.performance`, text: `Performance: ${j.performance}%`, emoji: j.performance >= 60 ? '\u{1F4C8}' : '\u{1F4C9}' },
        { type: 'info', id: `${slot}.years`, text: `${j.yearsAtCompany} year${j.yearsAtCompany === 1 ? '' : 's'} at ${j.company}${pt ? '' : ` • ${j.yearsInRole} in this role`}`, emoji: '\u{1F4C5}' },
      ]
      if (!pt && d && j.level < d.ladder.length - 1) nodes.push({ type: 'info', id: `${slot}.next`, text: `Next rung: ${d.ladder[j.level + 1].title}`, emoji: '\u{1FA9C}' })
      if (!pt) nodes.push({ type: 'info', id: `${slot}.schedule`, text: `Schedule: ${weeklyHours(j)} hours/week`, emoji: '\u{1F5D3}\u{FE0F}' })
      const boss = getPerson(gg, j.bossId)
      if (boss) nodes.push({ type: 'info', id: `${slot}.boss`, text: `Boss: ${boss.firstName} ${boss.lastName} (${boss.relationship}%) • find coworkers in Relationships`, emoji: '\u{1F9D1}\u{200D}\u{1F4BC}' })
      nodes.push({ type: 'action', id: `${slot}.harder`, label: 'Work Harder', emoji: '\u{1F4AA}', subtitle: 'Put in some extra effort', disabledReason: blocked, run: (x) => workHarder(x, slot) })
      if (!pt) {
        nodes.push({
          type: 'action',
          id: `${slot}.hours`,
          label: 'Hours',
          emoji: '\u{23F0}',
          subtitle: `Adjust your hours (${MIN_HOURS}-${MAX_HOURS} a week)`,
          disabledReason: (x) => blocked(x) ?? (x.character.job && num(x.character.job.data.hoursLocked, -1) === x.character.age ? 'Your boss set your hours for this year.' : null),
          input: { kind: 'number', label: 'Hours per week', min: MIN_HOURS, max: MAX_HOURS, defaultValue: (x) => String(x.character.job ? weeklyHours(x.character.job) : STANDARD_HOURS) },
          run: (x, input) => setHours(x, input),
        })
      }
      nodes.push({ type: 'action', id: `${slot}.raise`, label: 'Ask for a Raise', emoji: '\u{1F4B0}', disabledReason: blocked, run: (x) => askRaise(x, slot) })
      if (!pt) {
        nodes.push(hrMenu(j))
        nodes.push({
          type: 'action',
          id: `${slot}.promotion`,
          label: 'Ask for a Promotion',
          emoji: '\u{1F4C8}',
          disabledReason: (x) => blocked(x) ?? (d && j.level >= d.ladder.length - 1 ? "You're already at the top of the ladder here." : null),
          run: askPromotion,
        })
        nodes.push({
          type: 'action',
          id: `${slot}.retire`,
          label: 'Retire',
          emoji: '\u{1F3D6}\u{FE0F}',
          subtitle: 'Consider retirement',
          disabledReason: (x) => {
            const r = blocked(x)
            if (r) return r
            const jj = x.character.job
            if (!jj) return null
            return x.character.age >= 60 || jj.yearsAtCompany >= 20 ? null : 'You need to be 60 or have worked here 20 years to retire with a pension.'
          },
          confirm: (x) => {
            const jj = x.character.job
            return jj ? `Retire from ${jj.company}? Your pension would be ${formatMoney(Math.max(x.character.pension, computePension(jj)))} a year.` : null
          },
          run: (x) => retire(x),
        })
      }
      nodes.push({ type: 'action', id: `${slot}.quit`, label: 'Resign', emoji: '\u{1F6AA}', subtitle: 'Tender your resignation', disabledReason: blocked, confirm: () => `Are you sure you want to quit your job as ${j.title}?`, run: (x) => quitJob(x, slot) })
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Listings menus

function listingAction(listing: JobListing): MenuAction {
  const { def } = listing
  const pt = def.category === 'parttime'
  const pay = pt ? `${formatMoney(Math.round(listing.salary / ((def.hours ?? 15) * 52)))}/hr • ${def.hours ?? 15} hrs/wk` : `${formatMoney(listing.salary)}/yr`
  return {
    type: 'action',
    id: `listing.${listing.key}`,
    label: listing.title,
    emoji: def.emoji,
    subtitle: (g) => {
      const problem = jobRequirementProblem(g, def)
      return `${pay} • ${listing.company}${problem ? ' • Not qualified' : ''}`
    },
    disabledReason: blocked,
    confirm: (g) => {
      const held = pt ? g.character.partTimeJob : g.character.job
      const quit = held && (held.category === 'fulltime' || held.category === 'parttime') ? `\n\nIf you're hired, you'll quit your job as ${held.title} at ${held.company}.` : ''
      return `${listing.title}\n${listing.company}\n\nPay: ${pt ? pay : formatMoney(listing.salary) + ' a year'}\n${requirementSummary(def)}${quit}\n\nApply for this job?`
    },
    run: (g) => applyForListing(g, listing),
  }
}

const jobsMenu: MenuGroup = {
  type: 'menu',
  id: 'occupation.jobs',
  label: 'Jobs',
  emoji: '\u{1F4BC}',
  subtitle: 'Full-time job listings',
  visible: (g) => g.character.age >= 14,
  disabledReason: (g) => blocked(g) ?? (g.character.age < 18 ? 'You must be 18 to apply for full-time jobs.' : null),
  header: (g) => `New listings are posted every year. Tap a job to see its requirements. Recruiters read your CV before deciding who to interview.\n${jobMarket(g).line}.`,
  children: (g) => {
    const nodes: MenuNode[] = []
    const market = jobMarket(g)
    const mood = market.score >= 58 ? '\u{1F525}' : market.score >= 43 ? '\u{1F4CA}' : '\u{1F9CA}'
    nodes.push({ type: 'info', id: 'jobs.market', text: `${market.line}. Your CV strength for a typical office job: ${cvScore(g, { kind: 'job', edu: 'bachelor' }).score}/100.`, emoji: mood })
    nodes.push({ type: 'heading', id: 'jobs.h', label: `Listings for ${g.year}` })
    for (const l of fullTimeListings(g)) nodes.push(listingAction(l))
    return nodes
  },
}

const recruiterAction: MenuAction = {
  type: 'action',
  id: 'occupation.recruiter',
  label: 'Job Recruiter',
  emoji: '\u{1F575}\u{FE0F}',
  subtitle: 'Get an interview for a random high-paying job',
  visible: (g) => g.character.age >= 18,
  disabledReason: blocked,
  run: jobRecruiter,
}

const partTimeMenu: MenuGroup = {
  type: 'menu',
  id: 'occupation.parttime',
  label: 'Part-Time Jobs',
  emoji: '\u{231A}',
  subtitle: 'Hourly jobs, from age 14',
  visible: (g) => g.character.age >= 13,
  disabledReason: (g) => blocked(g) ?? (g.character.age < 14 ? 'You must be 14 to get a part-time job.' : null),
  header: (g) => `You can hold one part-time job alongside school or a full-time job.\n${jobMarket(g).line}.`,
  children: (g) => partTimeListings(g).map(listingAction),
}

const GIG_OUTCOMES: Record<string, { good: string[]; bad: string[] }> = {
  babysitter: { good: ['The kids went to bed on time and you watched cable all night.', 'You taught the kids a card game and they actually listened to you.'], bad: ['The kids locked you out of the house and ate an entire cake.', 'The baby screamed for six straight hours. Your ears are still ringing.'] },
  dog_walker: { good: ['The dog was a very good boy.', 'You and the pup made a lap around the park. Ten out of ten.'], bad: ['The dog slipped its leash and chased a squirrel across three neighborhoods.', 'The dog rolled in something unspeakable. Twice.'] },
  pet_sitter: { good: ['The cat ignored you completely, which is cat for "thank you."', 'The hamster ran 40 miles on its wheel. Thrilling stuff.'], bad: ['The cat knocked everything off every shelf in the house.', 'The parrot learned a new swear word from you.'] },
  lawn_mower: { good: ['You gave the lawn stripes like a baseball field.', 'The neighbors were so impressed they asked for your number.'], bad: ['You mowed over a garden gnome. Rest in pieces.', 'You ran over a hose and soaked yourself.'] },
  tutor: { good: ['Your student finally understood fractions.', "Your student aced their test and gave you all the credit."], bad: ["Your student asked if you were sure you'd passed this class.", 'You spent the whole session confiscating their phone.'] },
  house_cleaner: { good: ['The house sparkled when you were done.', 'You found $20 under the couch and honestly returned it.'], bad: ['You found three things under the couch you will never speak of.', 'You broke a vase that was "a family heirloom."'] },
  caretaker: { good: ['Grandpa told you stories about the good old days. Some were even true.', 'You played bingo for four hours and loved every second.'], bad: ['Grandpa told you the same story eleven times.', 'Grandma cheated at cards and accused you of cheating.'] },
  handyman: { good: ['You fixed the sink without flooding anything.', 'You built a shelf that is, against all odds, level.'], bad: ['You fixed the sink, then the leak you caused fixing the sink.', 'You hit your thumb with a hammer so hard you saw stars.'] },
}

function doGig(g: GameState, gig: GigDef, input?: string): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const parsed = Math.round(Number(input))
  if (!Number.isFinite(parsed) || parsed <= 0) {
    notice(g, gig.label, 'Enter an hourly rate for your ad.', { emoji: gig.emoji })
    return
  }
  const rate = clamp(parsed, gig.minRate, gig.maxRate)
  if (yearActionsUsed(g, 'gigs') >= 10) {
    notice(g, gig.label, "You've already worked 10 gigs this year. Give the side hustle a rest.", { emoji: gig.emoji })
    return
  }
  const span = Math.max(1, gig.maxRate - gig.minRate)
  let p = 0.9 - 0.75 * Math.pow((rate - gig.minRate) / span, 1.2)
  if (gig.id === 'tutor') p += (c.stats.smarts - 50) / 200
  if (gig.id === 'handyman') p += (c.hidden.athleticism - 50) / 300
  if (!chance(g, clamp(p, 0.05, 0.95))) {
    notice(g, 'No Response', pick(g, [`Nobody responded to your ${gig.noun} ad at ${formatMoney(rate)} an hour. Maybe lower your rate?`, `Your ${gig.noun} flyers at ${formatMoney(rate)}/hour got zero calls. The only response was a pizza menu.`]), { emoji: gig.emoji })
    return
  }
  useYearAction(g, 'gigs', 10)
  count(g, 'gigs')
  const client = `${randomFirstName(g, c.countryId, chance(g, 0.5) ? 'male' : 'female')} ${randomLastName(g, c.countryId)}`
  const hours = randInt(g, gig.hours[0], gig.hours[1])
  const outcomes = GIG_OUTCOMES[gig.id] ?? { good: ['The client was happy.'], bad: ['It did not go smoothly.'] }
  const roll = rand(g)
  if (roll < 0.1) {
    addStat(g, 'happiness', -5)
    log(g, `${client} refused to pay me for ${gig.noun} work.`, 'bad')
    notice(g, 'Stiffed!', `You worked ${hours} hours as a ${gig.noun} for ${client}. ${pick(g, outcomes.bad)} Then ${client} refused to pay you, claiming you did a terrible job.`, { emoji: gig.emoji, tone: 'bad' })
    return
  }
  let pay = rate * hours
  let tip = 0
  if (roll > 0.9) tip = Math.max(5, Math.round(pay * randInt(g, 10, 30) / 100))
  pay += tip
  addMoney(g, pay)
  addStat(g, 'happiness', roll > 0.4 ? 2 : -1)
  log(g, `I ${gig.verbed} ${client} for ${hours} hours and earned ${formatMoney(pay)}.`, 'good')
  const flavor = roll > 0.4 ? pick(g, outcomes.good) : pick(g, outcomes.bad)
  notice(g, gig.label, `${client} hired you as a ${gig.noun} for ${hours} hours at ${formatMoney(rate)} an hour. ${flavor} You earned ${formatMoney(pay)}${tip ? ` (including a ${formatMoney(tip)} tip)` : ''}.`, { emoji: gig.emoji, tone: 'good' })
}

const freelanceMenu: MenuGroup = {
  type: 'menu',
  id: 'occupation.freelance',
  label: 'Freelance Gigs',
  emoji: '\u{1F4CB}',
  subtitle: 'Quick one-off jobs for cash',
  visible: (g) => g.character.age >= 13,
  disabledReason: blocked,
  header: (g) => `Post an ad with your hourly rate. Charge too much and nobody calls. Gigs worked this year: ${yearActionsUsed(g, 'gigs')}/10.`,
  children: () =>
    GIGS.map(
      (gig): MenuAction => ({
        type: 'action',
        id: `gig.${gig.id}`,
        label: gig.label,
        emoji: gig.emoji,
        subtitle: `${formatMoney(gig.minRate)}-${formatMoney(gig.maxRate)}/hr • Age ${gig.minAge}+`,
        visible: (g) => g.character.age >= 13,
        disabledReason: (g) => blocked(g) ?? (g.character.age < gig.minAge ? `You must be ${gig.minAge} to work as a ${gig.noun}.` : yearActionsUsed(g, 'gigs') >= 10 ? "You've worked 10 gigs this year." : null),
        input: { kind: 'number', label: 'Hourly rate ($)', min: gig.minRate, max: gig.maxRate, defaultValue: () => String(Math.round((gig.minRate + gig.maxRate) / 3)) },
        run: (g, input) => doGig(g, gig, input),
      }),
    ),
}

// ---------------------------------------------------------------------------
// The Occupation menu

export const occupationMenu: MenuGroup = {
  type: 'menu',
  id: 'occupation',
  label: 'Occupation',
  emoji: '\u{1F4BC}',
  children: (g: GameState): MenuNode[] => {
    const c = g.character
    if (!c.alive) return [{ type: 'info', id: 'occupation.dead', text: "You're dead. Your career is over.", emoji: '\u{1FAA6}' }]
    if (c.prison) {
      const jail: MenuNode[] = [{ type: 'info', id: 'occupation.prison', text: `You're in prison. Your career will have to wait until you're released${c.prison.life ? '... if that ever happens' : ''}.`, emoji: '\u{1F512}' }]
      if (c.age >= 12) jail.push(cvMenu)
      return jail
    }
    if (c.age < 5 && !c.education.current) {
      return [{ type: 'info', id: 'occupation.young', text: "You're too young to go to school or work. Enjoy nap time while it lasts!", emoji: '\u{1F37C}' }]
    }
    const nodes: MenuNode[] = []
    const edu = educationMenuNodes(g)
    if (edu.length) {
      nodes.push({ type: 'heading', id: 'occupation.h.education', label: 'Education' })
      nodes.push(...edu)
    }
    const job = c.job
    const working: MenuNode[] = []
    if (job) {
      if (job.category === 'special' || job.category === 'military') working.push(...specialJobNodes(g))
      else {
        const grp = jobGroup(g, 'job')
        if (grp) working.push(grp)
      }
    }
    const ptGroup = jobGroup(g, 'partTimeJob')
    if (ptGroup) working.push(ptGroup)
    if (c.retired && !job) working.push({ type: 'info', id: 'occupation.retired', text: `Retired • Pension ${formatMoney(c.pension)} a year`, emoji: '\u{1F3D6}\u{FE0F}' })
    if (working.length) {
      nodes.push({ type: 'heading', id: 'occupation.h.work', label: 'My Work' })
      nodes.push(...working)
    }
    if (c.age >= 12) {
      nodes.push({ type: 'heading', id: 'occupation.h.cv', label: 'Your CV' })
      nodes.push(cvMenu)
    }
    if (c.age >= 13) {
      nodes.push({ type: 'heading', id: 'occupation.h.find', label: 'Find Work' })
      nodes.push(freelanceMenu, recruiterAction, jobsMenu, militaryMenu, partTimeMenu, specialCareersMenu)
    } else {
      nodes.push(specialCareersMenu)
    }
    return nodes
  },
}

export const careerInternals = { fire, promote, retire, computePension, staffJob }
