// Job catalog for the Occupation menu: full-time career tracks with promotion ladders,
// part-time (hourly) jobs and freelance gigs. Pure data + tiny builders, no game logic.
// Salaries are US dollars per year for an American character; careers.ts scales them by
// the country's wealth.
import type { Gender } from '../types'
import type { Industry as MarketIndustry } from './markets'

/** Education a job asks for. Graduate programs map to the DegreeKind of that program. */
export type EduReq =
  | 'none'
  | 'highschool'
  | 'community'
  | 'bachelor'
  | 'graduate'
  | 'business'
  | 'law'
  | 'medical'
  | 'dental'
  | 'nursing'
  | 'pharmacy'
  | 'veterinary'

export type Industry =
  | 'corporate'
  | 'tech'
  | 'finance'
  | 'bank'
  | 'hospital'
  | 'medical'
  | 'dental'
  | 'vet'
  | 'law'
  | 'municipal'
  | 'police'
  | 'fire'
  | 'school'
  | 'university'
  | 'airline'
  | 'newspaper'
  | 'publisher'
  | 'film'
  | 'record'
  | 'restaurant'
  | 'fastfood'
  | 'retail'
  | 'grocery'
  | 'salon'
  | 'trades'
  | 'smallbiz'
  | 'circus'
  | 'museum'
  | 'realestate'
  | 'travel'
  | 'fishery'
  | 'rideshare'
  | 'trucking'
  | 'mortuary'
  | 'church'
  | 'farm'
  | 'casino'
  | 'gym'
  | 'hotel'
  | 'mall'
  | 'pool'
  | 'cafe'
  | 'nightclub'
  | 'library'
  | 'science'
  | 'design'
  | 'factory'

export interface JobRung {
  title: string
  /** Typical starting salary for this rung (USD/year). */
  salary: number
}

export interface JobDef {
  id: string
  emoji: string
  category: 'fulltime' | 'parttime'
  industry: Industry
  edu: EduReq
  /** Bachelor's majors that qualify (any of). Empty/absent = any major. */
  majors?: string[]
  /** Promotion ladder, entry rung first. */
  ladder: JobRung[]
  /** Minimum age (defaults: 18 full-time, 14 part-time). */
  minAge?: number
  /** Required license id, e.g. 'driver', 'pilot'. */
  license?: string
  /** Must own a car. */
  car?: boolean
  minLooks?: number
  minSmarts?: number
  minAthleticism?: number
  gender?: Gender
  /** Total years of prior work experience. */
  experience?: number
  /** Can't be hired with a criminal conviction. */
  cleanRecord?: boolean
  /** Part-time job reserved for university students; ends when you leave school. */
  studentOnly?: boolean
  /** Must be at least the country's drinking age. */
  drinkingAge?: boolean
  /** Celibate religious jobs: fired for dating. */
  celibate?: boolean
  /** Weekly hours (part-time) . */
  hours?: number
  /** Hourly pay in USD (part-time). */
  hourly?: number
  /** 0-3: how much the job wears on your health. */
  stress?: number
  /** Yearly chance of a workplace injury. */
  danger?: number
}

type Rung = [string, number]

function ladder(rungs: Rung[]): JobRung[] {
  return rungs.map(([title, k]) => ({ title, salary: Math.round(k * 1000) }))
}

function ft(id: string, emoji: string, industry: Industry, edu: EduReq, rungs: Rung[], extra: Partial<JobDef> = {}): JobDef {
  return { id, emoji, category: 'fulltime', industry, edu, ladder: ladder(rungs), ...extra }
}

function pt(id: string, emoji: string, title: string, industry: Industry, hourly: number, hours: number, extra: Partial<JobDef> = {}): JobDef {
  return {
    id,
    emoji,
    category: 'parttime',
    industry,
    edu: 'none',
    hourly,
    hours,
    ladder: [{ title, salary: Math.round(hourly * hours * 52) }],
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// University majors (and which graduate programs each one opens)

export const MAJORS = [
  'Accounting',
  'Anthropology',
  'Archaeology',
  'Architecture',
  'Art History',
  'Biology',
  'Chemistry',
  'Communications',
  'Computer Science',
  'Criminal Justice',
  'Dance',
  'Economics',
  'Education',
  'Engineering',
  'English',
  'Finance',
  'Graphic Design',
  'History',
  'Information Systems',
  'Journalism',
  'Marketing',
  'Mathematics',
  'Music',
  'Nursing',
  'Philosophy',
  'Physics',
  'Political Science',
  'Psychology',
  'Religious Studies',
] as const

export const MAJOR_EMOJI: Record<string, string> = {
  Accounting: '\u{1F4D2}',
  Anthropology: '\u{1F5FF}',
  Archaeology: '\u{1F9B4}',
  Architecture: '\u{1F3DB}\u{FE0F}',
  'Art History': '\u{1F5BC}\u{FE0F}',
  Biology: '\u{1F9EC}',
  Chemistry: '\u{2697}\u{FE0F}',
  Communications: '\u{1F4E2}',
  'Computer Science': '\u{1F4BB}',
  'Criminal Justice': '\u{2696}\u{FE0F}',
  Dance: '\u{1F483}',
  Economics: '\u{1F4C8}',
  Education: '\u{1F34E}',
  Engineering: '\u{2699}\u{FE0F}',
  English: '\u{1F4D6}',
  Finance: '\u{1F4B5}',
  'Graphic Design': '\u{1F3A8}',
  History: '\u{1F4DC}',
  'Information Systems': '\u{1F5A5}\u{FE0F}',
  Journalism: '\u{1F4F0}',
  Marketing: '\u{1F4E3}',
  Mathematics: '\u{2797}',
  Music: '\u{1F3B5}',
  Nursing: '\u{1FA7A}',
  Philosophy: '\u{1F914}',
  Physics: '\u{1F52D}',
  'Political Science': '\u{1F3DB}\u{FE0F}',
  Psychology: '\u{1F9E0}',
  'Religious Studies': '\u{1F64F}',
}

/** Graduate program keys used by GRAD_ELIGIBILITY (match GradProgram + 'master'). */
export type GradKey = 'master' | 'phd' | 'business' | 'dental' | 'law' | 'medical' | 'nursing' | 'pharmacy' | 'veterinary'

const GRAD_OK = ['Accounting', 'Anthropology', 'Archaeology', 'Biology', 'Chemistry', 'Computer Science', 'Criminal Justice', 'Economics', 'Education', 'Engineering', 'English', 'Finance', 'History', 'Information Systems', 'Journalism', 'Marketing', 'Mathematics', 'Music', 'Philosophy', 'Physics', 'Political Science', 'Psychology']

/** Which bachelor's majors qualify for each graduate program. */
export const GRAD_ELIGIBILITY: Record<GradKey, string[]> = {
  master: GRAD_OK,
  phd: GRAD_OK,
  business: ['Accounting', 'Economics', 'English', 'Finance', 'Information Systems', 'Marketing', 'Mathematics'],
  law: ['Criminal Justice', 'English', 'Finance', 'Philosophy', 'Political Science'],
  medical: ['Biology', 'Chemistry', 'Physics', 'Nursing', 'Psychology'],
  dental: ['Biology', 'Chemistry', 'Physics', 'Nursing'],
  nursing: ['Nursing'],
  pharmacy: ['Biology', 'Chemistry', 'Physics'],
  veterinary: ['Biology', 'Chemistry', 'Physics'],
}

// ---------------------------------------------------------------------------
// Full-time careers

export const FULLTIME_JOBS: JobDef[] = [
  // Corporate / finance / tech
  ft('accountant', '\u{1F4D2}', 'corporate', 'bachelor', [['Jr. Accountant', 52], ['Accountant', 60], ['Sr. Accountant', 72], ['Accounting Manager', 95], ['Chief Financial Officer', 185]], { majors: ['Accounting', 'Finance'], cleanRecord: true, stress: 1 }),
  ft('internal_auditor', '\u{1F50E}', 'corporate', 'bachelor', [['Jr. Internal Auditor', 53], ['Internal Auditor', 60], ['Sr. Internal Auditor', 72]], { majors: ['Accounting'], cleanRecord: true }),
  ft('financial_analyst', '\u{1F4C9}', 'finance', 'bachelor', [['Jr. Financial Analyst', 46], ['Financial Analyst', 56], ['Sr. Financial Analyst', 70]], { majors: ['Finance', 'Economics', 'Mathematics'], cleanRecord: true, stress: 1 }),
  ft('financial_advisor', '\u{1F4B5}', 'bank', 'bachelor', [['Jr. Financial Advisor', 45], ['Financial Advisor', 62], ['Sr. Financial Advisor', 85]], { majors: ['Finance', 'Economics'], cleanRecord: true }),
  ft('stockbroker', '\u{1F4C8}', 'finance', 'bachelor', [['Jr. Stockbroker', 45], ['Stockbroker', 70], ['Sr. Stockbroker', 110]], { majors: ['Finance', 'Economics'], cleanRecord: true, stress: 2 }),
  ft('banker', '\u{1F3E6}', 'bank', 'bachelor', [['Jr. Banker', 53], ['Banker', 64], ['Sr. Banker', 78]], { majors: ['Accounting', 'Finance'], cleanRecord: true }),
  ft('business_analyst', '\u{1F4CA}', 'corporate', 'bachelor', [['Jr. Business Analyst', 45], ['Business Analyst', 64], ['Sr. Business Analyst', 75]], { majors: ['Finance', 'Economics', 'Information Systems'], cleanRecord: true }),
  ft('operations_analyst', '\u{1F4CA}', 'corporate', 'bachelor', [['Jr. Operations Analyst', 48], ['Operations Analyst', 60], ['Sr. Operations Analyst', 72]], { majors: ['Information Systems', 'Mathematics'], cleanRecord: true }),
  ft('marketing', '\u{1F4E3}', 'corporate', 'bachelor', [['Marketing Coordinator', 42], ['Marketing Specialist', 54], ['Marketing Manager', 78], ['Director of Marketing', 120], ['Chief Marketing Officer', 175]], { majors: ['Marketing', 'Communications', 'Journalism', 'Economics'], stress: 1 }),
  ft('insurance_agent', '\u{1F4CB}', 'corporate', 'highschool', [['Jr. Insurance Agent', 28], ['Insurance Agent', 38], ['Sr. Insurance Agent', 52]], { cleanRecord: true }),
  ft('lobbyist', '\u{1F5E3}\u{FE0F}', 'corporate', 'bachelor', [['Jr. Lobbyist', 45], ['Lobbyist', 70], ['Sr. Lobbyist', 95]], { majors: ['Political Science'], stress: 1 }),
  ft('policy_analyst', '\u{1F50D}', 'municipal', 'bachelor', [['Jr. Policy Analyst', 45], ['Policy Analyst', 58], ['Sr. Policy Analyst', 72]], { majors: ['Political Science', 'Economics'], cleanRecord: true }),
  ft('executive', '\u{1F4CD}', 'corporate', 'business', [['Assistant Vice President', 105], ['Vice President', 125], ['First Vice President', 140], ['Senior Vice President', 155], ['Executive Vice President', 172], ['Managing Director', 190], ['President', 240], ['Chief Executive Officer', 420]], { experience: 15, cleanRecord: true, stress: 3 }),
  ft('consultant', '\u{1F4BC}', 'corporate', 'business', [['Associate Consultant', 85], ['Consultant', 105], ['Senior Consultant', 130], ['Principal', 165], ['Partner', 260]], { cleanRecord: true, stress: 2 }),
  ft('investment_banker', '\u{1F4B0}', 'finance', 'business', [['Investment Banking Analyst', 95], ['Investment Banking Associate', 140], ['Vice President of Investment Banking', 210], ['Director of Investment Banking', 290], ['Managing Director', 400]], { cleanRecord: true, stress: 3 }),
  ft('computer_programmer', '\u{1F5A5}\u{FE0F}', 'tech', 'bachelor', [['Jr. Computer Programmer', 55], ['Computer Programmer', 75], ['Sr. Computer Programmer', 98], ['Software Architect', 135]], { majors: ['Computer Science', 'Information Systems', 'Mathematics', 'Engineering'] }),
  ft('app_developer', '\u{1F4F2}', 'tech', 'bachelor', [['Jr. Mobile App Developer', 58], ['Mobile App Developer', 80], ['Sr. Mobile App Developer', 108]], { majors: ['Computer Science'] }),
  ft('database_admin', '\u{1F5C4}\u{FE0F}', 'tech', 'bachelor', [['Jr. Database Administrator', 52], ['Database Administrator', 66], ['Sr. Database Administrator', 86]], { majors: ['Computer Science', 'Information Systems'] }),
  ft('it_support', '\u{1F5B1}\u{FE0F}', 'tech', 'bachelor', [['Jr. IT Support', 32], ['IT Support', 40], ['Sr. IT Support', 50], ['Technical Support Specialist', 62]], { majors: ['Computer Science', 'Information Systems'] }),
  ft('engineer', '\u{1F4D0}', 'corporate', 'bachelor', [['Engineer I', 62], ['Engineer II', 72], ['Engineer III', 84], ['Asst. Engineering Manager', 96], ['Engineering Manager', 113], ['Director of Engineering', 135], ['VP of Engineering', 168]], { majors: ['Engineering'] }),
  ft('chemical_engineer', '\u{2697}\u{FE0F}', 'science', 'bachelor', [['Jr. Chemical Engineer', 63], ['Chemical Engineer', 80], ['Sr. Chemical Engineer', 100]], { majors: ['Engineering', 'Chemistry'] }),
  ft('mechanical_engineer', '\u{2699}\u{FE0F}', 'factory', 'bachelor', [['Jr. Mechanical Engineer', 60], ['Mechanical Engineer', 76], ['Sr. Mechanical Engineer', 96]], { majors: ['Engineering', 'Physics'] }),
  ft('architect', '\u{1F3DB}\u{FE0F}', 'design', 'bachelor', [['Jr. Architect', 50], ['Architect', 75], ['Sr. Architect', 96]], { majors: ['Architecture'] }),
  ft('translator', '\u{1F232}', 'corporate', 'bachelor', [['Jr. Translator', 32], ['Translator', 42], ['Sr. Translator', 55]], { majors: ['Communications', 'English'] }),
  ft('telemarketer', '\u{1F4DE}', 'corporate', 'highschool', [['Apprentice Telemarketer', 20], ['Telemarketer', 25]]),
  ft('receptionist', '\u{1F6CE}\u{FE0F}', 'corporate', 'highschool', [['Receptionist', 22]]),
  ft('bill_collector', '\u{1F911}', 'corporate', 'highschool', [['Bill Collector', 31]], { stress: 1 }),
  ft('factory_worker', '\u{1F3ED}', 'factory', 'none', [['Factory Worker', 24]], { danger: 0.03 }),
  ft('janitor', '\u{1F9F9}', 'corporate', 'none', [['Janitor', 19]]),

  // Science
  ft('biotechnologist', '\u{1F331}', 'science', 'bachelor', [['Jr. Biotechnologist', 48], ['Biotechnologist', 62], ['Sr. Biotechnologist', 90]], { majors: ['Biology', 'Chemistry'] }),
  ft('environmental_scientist', '\u{267B}\u{FE0F}', 'science', 'bachelor', [['Jr. Environmental Scientist', 40], ['Environmental Scientist', 48], ['Sr. Environmental Scientist', 60]], { majors: ['Physics', 'Biology', 'Chemistry'] }),
  ft('microbiologist', '\u{1F52C}', 'science', 'bachelor', [['Jr. Microbiologist', 42], ['Microbiologist', 52], ['Sr. Microbiologist', 66]], { majors: ['Biology'] }),
  ft('marine_biologist', '\u{1F991}', 'science', 'graduate', [['Jr. Marine Biologist', 38], ['Marine Biologist', 48], ['Sr. Marine Biologist', 62]], { majors: ['Biology', 'Mathematics'] }),
  ft('archaeologist', '\u{1F480}', 'museum', 'graduate', [['Jr. Archaeologist', 40], ['Archaeologist', 55], ['Sr. Archaeologist', 70]], { majors: ['Archaeology', 'Anthropology', 'History'] }),

  // Medical
  ft('family_physician', '\u{1F3E5}', 'hospital', 'medical', [['Resident Physician', 62], ['Family Physician', 105], ['Chief Physician', 185]], { cleanRecord: true, stress: 2 }),
  ft('brain_surgeon', '\u{1F9E0}', 'hospital', 'medical', [['Surgical Resident', 70], ['Brain Surgeon', 180], ['Head of Neurosurgery', 310]], { cleanRecord: true, minSmarts: 60, stress: 3 }),
  ft('psychiatrist', '\u{1F6CB}\u{FE0F}', 'medical', 'medical', [['Jr. Psychiatrist', 80], ['Psychiatrist', 125], ['Sr. Psychiatrist', 160]], { cleanRecord: true, stress: 1 }),
  ft('chiropractor', '\u{1F9B4}', 'medical', 'medical', [['Jr. Chiropractor', 45], ['Chiropractor', 68]], { cleanRecord: true }),
  ft('physical_therapist', '\u{1F9D8}', 'medical', 'medical', [['Jr. Physical Therapist', 52], ['Physical Therapist', 72]], { cleanRecord: true }),
  ft('pharmacist', '\u{1F48A}', 'medical', 'pharmacy', [['Jr. Pharmacist', 75], ['Pharmacist', 98], ['Sr. Pharmacist', 125]], { cleanRecord: true }),
  ft('nurse', '\u{1FA7A}', 'hospital', 'nursing', [['Associate Nurse', 45], ['Clinical Nurse', 56], ['Advanced Clinician', 68], ['Clinical Nurse Specialist', 84]], { cleanRecord: true, stress: 2 }),
  ft('midwife', '\u{1F6BC}', 'hospital', 'bachelor', [['Apprentice Midwife', 48], ['Midwife', 80]], { majors: ['Nursing'], cleanRecord: true, stress: 1 }),
  ft('dentist', '\u{1F9B7}', 'dental', 'dental', [['Associate Dentist', 115], ['Dentist', 145], ['Head Dentist', 180]], { cleanRecord: true }),
  ft('dental_hygienist', '\u{1F601}', 'dental', 'community', [['Dental Hygienist', 62]], { cleanRecord: true }),
  ft('veterinarian', '\u{1F436}', 'vet', 'veterinary', [['Jr. Veterinarian', 55], ['Veterinarian', 80], ['Sr. Veterinarian', 100]], { cleanRecord: true, stress: 1 }),
  ft('pet_groomer', '\u{1F429}', 'vet', 'none', [['Apprentice Pet Groomer', 22], ['Pet Groomer', 30]]),
  ft('massage_therapist', '\u{1F450}', 'salon', 'community', [['Massage Therapist', 32]]),
  ft('school_psychologist', '\u{1F9E0}', 'school', 'bachelor', [['School Psychologist', 60]], { majors: ['Psychology'], cleanRecord: true }),
  ft('marriage_counselor', '\u{1F492}', 'medical', 'bachelor', [['Marriage Counselor', 54]], { majors: ['Psychology'] }),

  // Law
  ft('lawyer', '\u{2696}\u{FE0F}', 'law', 'law', [['Law Clerk', 75], ['Junior Associate', 110], ['Associate', 134], ['Junior Partner', 188], ['Partner', 260]], { cleanRecord: true, stress: 3 }),
  ft('paralegal', '\u{1F4C1}', 'law', 'community', [['Legal Secretary', 27], ['Legal Records Manager', 33], ['Paralegal', 46]], { cleanRecord: true }),
  ft('judge', '\u{1F9D1}\u{200D}\u{2696}\u{FE0F}', 'municipal', 'law', [['Magistrate', 82], ['Magistrate Court Judge', 130], ['District Court Judge', 152], ['Associate Chief Justice', 175], ['Chief Justice', 218]], { experience: 30, cleanRecord: true, stress: 2 }),

  // Education
  ft('teacher', '\u{1F34E}', 'school', 'bachelor', [['Teacher', 40], ['Senior Teacher', 48], ['Head Teacher', 56]], { majors: ['Education'], cleanRecord: true, stress: 1 }),
  ft('history_teacher', '\u{1F4DA}', 'school', 'bachelor', [['History Teacher', 42], ['Head of History Department', 52]], { majors: ['History'], cleanRecord: true, stress: 1 }),
  ft('school_admin', '\u{1F3EB}', 'school', 'graduate', [['Asst. Principal', 62], ['Principal', 80], ['Asst. Superintendent', 92], ['Superintendent', 118]], { majors: ['Education'], experience: 3, cleanRecord: true, stress: 2 }),
  ft('professor', '\u{1F393}', 'university', 'graduate', [['Adjunct Professor', 45], ['Assistant Professor', 66], ['Associate Professor', 86], ['Professor', 112]], { cleanRecord: true }),
  ft('college_dean', '\u{1F3DB}\u{FE0F}', 'university', 'bachelor', [['College Dean', 182]], { experience: 30, cleanRecord: true, stress: 2 }),
  ft('librarian', '\u{1F4DA}', 'library', 'graduate', [['Library Aide', 37], ['Librarian', 46], ['Sr. Librarian', 56]], { cleanRecord: true }),

  // Police, fire, municipal
  ft('police', '\u{1F693}', 'police', 'highschool', [['Cadet', 30], ['Patrolman', 38], ['Trooper', 45], ['Corporal', 51], ['Sergeant', 57], ['Inspector', 64], ['Lieutenant', 72], ['Chief of Police', 96]], { cleanRecord: true, minAge: 18, stress: 2, danger: 0.04 }),
  ft('detective', '\u{1F575}\u{FE0F}', 'police', 'bachelor', [['Jr. Detective', 45], ['Detective', 62]], { majors: ['Criminal Justice'], experience: 10, cleanRecord: true, stress: 2, danger: 0.02 }),
  ft('forensic', '\u{1F52C}', 'police', 'bachelor', [['Crime Scene Technician', 38], ['Forensic Investigator', 49], ['Forensic Scientist', 64]], { majors: ['Criminal Justice', 'Chemistry', 'Biology'], cleanRecord: true }),
  ft('private_investigator', '\u{1F50D}', 'smallbiz', 'bachelor', [['Jr. Private Investigator', 34], ['Private Investigator', 52]], { majors: ['Criminal Justice'] }),
  ft('firefighter', '\u{1F692}', 'fire', 'highschool', [['Probationary Firefighter', 34], ['Firefighter', 41], ['Fire Equipment Operator', 47], ['Lieutenant', 53], ['Captain', 60], ['Battalion Chief', 68], ['Assistant Chief', 76], ['Fire Chief', 88]], { cleanRecord: true, minAthleticism: 25, stress: 2, danger: 0.05 }),
  ft('mail_carrier', '\u{1F4EB}', 'municipal', 'highschool', [['Jr. Mail Carrier', 36], ['Mail Carrier', 39], ['Sr. Mail Carrier', 42]], { cleanRecord: true }),
  ft('bus_driver', '\u{1F68C}', 'municipal', 'none', [['Bus Driver', 33]], { license: 'driver', cleanRecord: true }),
  ft('waste_collector', '\u{1F5D1}\u{FE0F}', 'municipal', 'none', [['Waste Collector', 36]], { danger: 0.02 }),
  ft('sculptor', '\u{1F5FF}', 'municipal', 'none', [['Sculptor', 25]]),
  ft('security_guard', '\u{1F512}', 'smallbiz', 'none', [['Security Guard', 22], ['Head of Security', 34]], { cleanRecord: true }),
  ft('mall_cop', '\u{1F46E}', 'mall', 'none', [['Mall Cop', 18]], { cleanRecord: true }),

  // Airline & travel
  ft('pilot', '\u{2708}\u{FE0F}', 'airline', 'bachelor', [['Pilot Trainee', 45], ['Co-Pilot', 68], ['Pilot', 98], ['Chief Pilot', 135]], { license: 'pilot', cleanRecord: true, stress: 1 }),
  ft('flight_attendant', '\u{1F4BA}', 'airline', 'highschool', [['Jr. Flight Attendant', 24], ['Flight Attendant', 31], ['Sr. Flight Attendant', 39]], { cleanRecord: true }),
  ft('baggage_handler', '\u{1F6C4}', 'airline', 'none', [['Baggage Handler', 22]]),
  ft('travel_agent', '\u{1F3D6}\u{FE0F}', 'travel', 'highschool', [['Travel Associate', 24], ['Travel Agent', 30], ['Regional Manager', 37], ['Agency Operator', 42]]),

  // Media & arts
  ft('reporter', '\u{1F440}', 'newspaper', 'bachelor', [['Jr. Reporter', 33], ['Reporter', 46], ['Sr. Reporter', 62], ['News Anchor', 95]], { majors: ['Journalism', 'Communications'], stress: 1 }),
  ft('editor', '\u{1F5DE}\u{FE0F}', 'publisher', 'bachelor', [['Jr. Editor', 52], ['Editor', 62], ['Sr. Editor', 76]], { majors: ['English', 'Journalism'], experience: 7 }),
  ft('writer', '\u{1F4DD}', 'publisher', 'highschool', [['Staff Writer', 23], ['Senior Writer', 36]], { minSmarts: 70 }),
  ft('photographer', '\u{1F4F8}', 'newspaper', 'highschool', [['Apprentice Photographer', 31], ['Photographer', 42]]),
  ft('camera_operator', '\u{1F3A5}', 'film', 'highschool', [['Camera Operator', 36], ['Director of Photography', 70]]),
  ft('stunt_performer', '\u{26D1}\u{FE0F}', 'film', 'highschool', [['Stunt Performer', 28], ['Stunt Coordinator', 55]], { minAthleticism: 45, danger: 0.08 }),
  ft('makeup_artist', '\u{1F484}', 'film', 'highschool', [['Apprentice Makeup Artist', 19], ['Makeup Artist', 32]]),
  ft('puppeteer', '\u{1F38E}', 'film', 'none', [['Puppeteer', 22]]),
  ft('dancer', '\u{1F483}', 'film', 'none', [['Backup Dancer', 18], ['Lead Dancer', 34]], { minLooks: 60, minAthleticism: 40 }),
  ft('animator', '\u{1F9DE}', 'film', 'bachelor', [['Jr. Animator', 40], ['Animator', 52], ['Sr. Animator', 64]], { majors: ['Computer Science', 'Graphic Design'] }),
  ft('graphic_designer', '\u{1F3A8}', 'design', 'bachelor', [['Jr. Graphic Designer', 33], ['Graphic Designer', 45], ['Sr. Graphic Designer', 58]], { majors: ['Graphic Design'] }),
  ft('fashion_designer', '\u{1F457}', 'design', 'bachelor', [['Jr. Fashion Designer', 38], ['Fashion Designer', 52], ['Sr. Fashion Designer', 72]], { majors: ['Graphic Design'] }),
  ft('interior_designer', '\u{1F6CB}\u{FE0F}', 'design', 'bachelor', [['Jr. Interior Designer', 36], ['Interior Designer', 52], ['Sr. Interior Designer', 66]], { majors: ['Graphic Design', 'Architecture'] }),
  ft('music_composer', '\u{1F3B9}', 'record', 'bachelor', [['Apprentice Music Composer', 22], ['Music Composer', 50]], { majors: ['Music'] }),
  ft('disc_jockey', '\u{1F3B6}', 'record', 'none', [['Disc Jockey', 24], ['Resident DJ', 40]]),
  ft('dance_instructor', '\u{1FA70}', 'gym', 'bachelor', [['Dance Instructor', 36]], { majors: ['Dance'] }),
  ft('choreographer', '\u{1F3AD}', 'film', 'bachelor', [['Assistant Choreographer', 38], ['Choreographer', 55]], { majors: ['Dance'] }),
  ft('gallery', '\u{1F5BC}\u{FE0F}', 'museum', 'bachelor', [['Gallery Associate', 32], ['Gallery Manager', 48], ['Gallery Director', 72]], { majors: ['Art History'] }),
  ft('curator', '\u{1F3DB}\u{FE0F}', 'museum', 'bachelor', [['Exhibit Associate', 38], ['Assistant Curator', 45], ['Curator', 60]], { majors: ['History', 'Archaeology', 'Anthropology', 'Art History'] }),

  // Hospitality & food
  ft('restaurant', '\u{1F37D}\u{FE0F}', 'restaurant', 'highschool', [['Host', 17], ['Server', 21], ['Head Waiter', 25], ['Expeditor', 29], ['Assistant Manager', 33], ['General Manager', 44]]),
  ft('chef', '\u{1F373}', 'restaurant', 'community', [['Line Cook', 22], ['Short Order Cook', 25], ['Apprentice Chef', 28], ['Chef Tournant', 32], ['Chef Garde Manager', 35], ['Junior Sous Chef', 38], ['Saucier', 41], ['Sous Chef', 47], ['Chef de Cuisine', 54], ['Executive Chef', 64]], { stress: 1 }),
  ft('dishwasher', '\u{1F37D}\u{FE0F}', 'restaurant', 'highschool', [['Dishwasher', 18]]),
  ft('bartender', '\u{1F378}', 'nightclub', 'none', [['Jr. Bartender', 26], ['Bartender', 33], ['Sr. Bartender', 38]], { drinkingAge: true }),
  ft('sommelier', '\u{1F377}', 'restaurant', 'highschool', [['Introductory Sommelier', 48], ['Certified Sommelier', 56], ['Advanced Sommelier', 78], ['Master Sommelier', 92]], { drinkingAge: true }),
  ft('fast_food', '\u{1F354}', 'fastfood', 'none', [['Crew Member', 16], ['Shift Manager', 19], ['Restaurant Manager', 28], ['General Manager', 34]]),
  ft('baker', '\u{1F950}', 'smallbiz', 'none', [['Apprentice Baker', 22], ['Baker', 34]]),
  ft('butcher', '\u{1F969}', 'grocery', 'highschool', [['Apprentice Butcher', 22], ['Butcher', 30]]),
  ft('grocer', '\u{1F966}', 'grocery', 'highschool', [['Apprentice Grocer', 18], ['Grocer', 23]], { cleanRecord: true }),
  ft('cashier', '\u{1F4B3}', 'retail', 'none', [['Cashier', 17]], { cleanRecord: true }),
  ft('retail', '\u{1F6CD}\u{FE0F}', 'retail', 'none', [['Retail Salesperson', 18], ['Assistant Store Manager', 30], ['Store Manager', 45]]),
  ft('casino', '\u{2660}\u{FE0F}', 'casino', 'highschool', [['Casino Dealer', 26], ['Pit Boss', 46]], { minAge: 21, cleanRecord: true }),
  ft('bouncer', '\u{1F4AA}', 'nightclub', 'none', [['Bouncer', 29], ['Head of Door Security', 38]], { minAthleticism: 50 }),

  // Personal services
  ft('hairdresser', '\u{2702}\u{FE0F}', 'salon', 'highschool', [['Apprentice Hairdresser', 18], ['Hairdresser', 27], ['Salon Manager', 38]]),
  ft('nail_technician', '\u{1F485}', 'salon', 'highschool', [['Apprentice Nail Technician', 18], ['Nail Technician', 25]]),
  ft('wedding_planner', '\u{1F492}', 'smallbiz', 'highschool', [['Wedding Planner', 26], ['Sr. Wedding Planner', 36]], { cleanRecord: true }),
  ft('real_estate_agent', '\u{1F3E1}', 'realestate', 'highschool', [['Real Estate Agent', 32], ['Senior Real Estate Agent', 55], ['Real Estate Broker', 82]], { license: 'driver', car: true }),
  ft('housekeeper', '\u{1F9FA}', 'hotel', 'none', [['Housekeeper', 19]]),
  ft('cat_consultant', '\u{1F408}', 'smallbiz', 'none', [['Cat Behavior Consultant', 20]]),
  ft('mortician', '\u{26B0}\u{FE0F}', 'mortuary', 'bachelor', [['Mortician', 32], ['Funeral Director', 46]], { majors: ['Chemistry', 'Biology'] }),

  // Trades & outdoors
  ft('construction', '\u{1F6A7}', 'trades', 'none', [['Construction Worker', 32], ['Site Foreman', 52]], { danger: 0.05 }),
  ft('electrician', '\u{1F4A1}', 'trades', 'none', [['Apprentice Electrician', 28], ['Electrician', 58]], { license: 'driver', danger: 0.03 }),
  ft('plumber', '\u{1F6BF}', 'trades', 'none', [['Apprentice Plumber', 31], ['Plumber', 56]]),
  ft('carpenter', '\u{1FA9A}', 'trades', 'highschool', [['Apprentice Carpenter', 25], ['Carpenter', 44]], { danger: 0.03 }),
  ft('auto_mechanic', '\u{1F527}', 'trades', 'none', [['Apprentice Mechanic', 25], ['Auto Mechanic', 44]]),
  ft('painter', '\u{1F58C}\u{FE0F}', 'trades', 'none', [['Apprentice Painter', 21], ['Painter', 30]]),
  ft('landscaper', '\u{1F333}', 'smallbiz', 'none', [['Apprentice Landscaper', 20], ['Landscaper', 27]]),
  ft('lumberjack', '\u{1F332}', 'smallbiz', 'none', [['Apprentice Lumberjack', 22], ['Lumberjack', 42]], { minAthleticism: 30, danger: 0.07 }),
  ft('chimney_sweep', '\u{1F525}', 'smallbiz', 'none', [['Apprentice Chimney Sweep', 21], ['Chimney Sweep', 28]], { danger: 0.03 }),
  ft('blacksmith', '\u{1F528}', 'smallbiz', 'none', [['Apprentice Blacksmith', 22], ['Blacksmith', 40]]),
  ft('tailor', '\u{1F9F5}', 'smallbiz', 'none', [['Apprentice Tailor', 21], ['Tailor', 33]]),
  ft('jeweler', '\u{1F48E}', 'retail', 'highschool', [['Apprentice Jeweler', 24], ['Jeweler', 42]], { cleanRecord: true }),
  ft('farmer', '\u{1F69C}', 'farm', 'none', [['Farmhand', 22], ['Farmer', 38]]),
  ft('beekeeper', '\u{1F41D}', 'farm', 'none', [['Beekeeper', 30]], { danger: 0.02 }),
  ft('horse_jockey', '\u{1F3C7}', 'smallbiz', 'none', [['Horse Jockey', 32]], { minAthleticism: 40, danger: 0.04 }),
  ft('fisherman', '\u{1F3A3}', 'fishery', 'none', [['Fisherman', 18]]),
  ft('crab_fisherman', '\u{1F980}', 'fishery', 'none', [['Greenhorn', 30], ['Deck Hand', 48], ['Deck Boss', 68], ['Engineer', 92], ['Captain', 125]], { minAthleticism: 35, danger: 0.08 }),
  ft('trucker', '\u{1F69B}', 'trucking', 'highschool', [['Apprentice Trucker', 33], ['Trucker', 44]], { license: 'driver', cleanRecord: true }),
  ft('rideshare', '\u{1F696}', 'rideshare', 'none', [['Driver', 28]], { license: 'driver', car: true, cleanRecord: true }),
  ft('roadkill_remover', '\u{2620}\u{FE0F}', 'municipal', 'none', [['Roadkill Remover', 32]]),
  ft('porta_potty', '\u{1F6BD}', 'smallbiz', 'none', [['Porta Potty Pumper', 34]]),
  ft('water_slide_tester', '\u{1F30A}', 'smallbiz', 'none', [['Water Slide Tester', 29]]),
  ft('worm_picker', '\u{1F41B}', 'farm', 'none', [['Worm Picker', 18]]),
  ft('moonshiner', '\u{1F943}', 'smallbiz', 'none', [['Apprentice Moonshiner', 12], ['Moonshiner', 30]], { drinkingAge: true }),
  ft('zookeeper', '\u{1F992}', 'municipal', 'highschool', [['Zookeeper', 30], ['Head Zookeeper', 44]], { danger: 0.03 }),

  // Circus & oddballs
  ft('magician', '\u{1F3A9}', 'circus', 'none', [['Magician', 15], ['Headlining Magician', 38]]),
  ft('circus_performer', '\u{1F3AA}', 'circus', 'none', [['Circus Performer', 28]], { minAthleticism: 40, danger: 0.04 }),
  ft('clown', '\u{1F921}', 'circus', 'none', [['Clown', 18]]),
  ft('exorcist', '\u{1F47F}', 'church', 'none', [['Exorcist', 36]], { celibate: true }),
  ft('priest', '\u{271D}\u{FE0F}', 'church', 'none', [['Priest', 32]], { gender: 'male', celibate: true }),
  ft('monk', '\u{1F64F}', 'church', 'none', [['Monk', 15]], { gender: 'male', celibate: true }),
  ft('nun', '\u{26EA}', 'church', 'none', [['Nun', 18]], { gender: 'female', celibate: true }),
]

// ---------------------------------------------------------------------------
// Part-time jobs (hourly)

export const PARTTIME_JOBS: JobDef[] = [
  pt('pt_fitness', '\u{1F938}', 'Fitness Instructor', 'gym', 37, 15, { minAge: 18, minAthleticism: 50 }),
  pt('pt_trainer', '\u{1F3CB}\u{FE0F}', 'Personal Trainer', 'gym', 32, 20, { minAge: 18, minAthleticism: 55, cleanRecord: true }),
  pt('pt_beverage_cart', '\u{1F6FA}', 'Beverage Cart Attendant', 'corporate', 30, 15, { minAge: 18 }),
  pt('pt_mystery_shopper', '\u{1F575}\u{FE0F}', 'Mystery Shopper', 'retail', 24, 10, { minAge: 18, cleanRecord: true }),
  pt('pt_dance', '\u{1FA70}', 'Dance Instructor', 'gym', 21, 27, { minAge: 16, minAthleticism: 35 }),
  pt('pt_game_tester', '\u{1F3AE}', 'Video Game Tester', 'tech', 20, 17),
  pt('pt_secretary', '\u{1F4C7}', 'Secretary', 'corporate', 19, 11, { minAge: 16, cleanRecord: true }),
  pt('pt_kiosk', '\u{1F6D2}', 'Mall Kiosk Worker', 'mall', 19, 21),
  pt('pt_mover', '\u{1F4E6}', 'Mover', 'smallbiz', 18, 14, { minAge: 16, cleanRecord: true }),
  pt('pt_valet', '\u{1F697}', 'Valet', 'hotel', 10, 21, { minAge: 16, license: 'driver', cleanRecord: true }),
  pt('pt_brand_ambassador', '\u{1F4E2}', 'Brand Ambassador', 'corporate', 17, 15, { minLooks: 50, cleanRecord: true }),
  pt('pt_swim', '\u{1F3CA}', 'Swim Instructor', 'pool', 17, 15, { minAthleticism: 35, cleanRecord: true }),
  pt('pt_bookkeeper', '\u{1F4D2}', 'Bookkeeper', 'corporate', 17, 17, { minAge: 16, cleanRecord: true }),
  pt('pt_usher', '\u{1F39F}\u{FE0F}', 'Usher', 'hotel', 17, 10, { cleanRecord: true }),
  pt('pt_pool_cleaner', '\u{1F9FD}', 'Pool Cleaner', 'pool', 15, 12),
  pt('pt_dept_store', '\u{1F45A}', 'Department Store Associate', 'retail', 15, 17, { cleanRecord: true }),
  pt('pt_window_cleaner', '\u{1FA9F}', 'Window Cleaner', 'smallbiz', 15, 22),
  pt('pt_florist', '\u{1F490}', 'Flower Shop Assistant', 'smallbiz', 15, 28),
  pt('pt_grocery_bagger', '\u{1F6CD}\u{FE0F}', 'Grocery Bagger', 'grocery', 15, 19),
  pt('pt_collections', '\u{1F4B8}', 'Collections Specialist', 'corporate', 15, 14, { minAge: 18, cleanRecord: true }),
  pt('pt_teachers_aide', '\u{1F34E}', "Teacher's Aide", 'school', 14, 8, { minAge: 16, cleanRecord: true }),
  pt('pt_lifeguard', '\u{1F6DF}', 'Lifeguard', 'pool', 14, 9, { minAthleticism: 40, cleanRecord: true }),
  pt('pt_doorman', '\u{1F6AA}', 'Doorman', 'nightclub', 13, 28, { minAge: 18 }),
  pt('pt_bike_mechanic', '\u{1F6B2}', 'Bike Shop Mechanic', 'smallbiz', 13, 24),
  pt('pt_school_bus', '\u{1F68C}', 'School Bus Driver', 'municipal', 13, 25, { minAge: 18, license: 'driver', cleanRecord: true }),
  pt('pt_street_sweeper', '\u{1F9F9}', 'Street Sweeper', 'municipal', 13, 24),
  pt('pt_arcade', '\u{1F579}\u{FE0F}', 'Arcade Assistant', 'mall', 13, 29),
  pt('pt_bellhop', '\u{1F6CE}\u{FE0F}', 'Bellhop', 'hotel', 12, 14, { cleanRecord: true }),
  pt('pt_barista', '\u{2615}', 'Barista', 'cafe', 12, 29, { cleanRecord: true }),
  pt('pt_concessions', '\u{1F37F}', 'Concessions Attendant', 'mall', 12, 18, { cleanRecord: true }),
  pt('pt_golf_shop', '\u{26F3}', 'Golf Shop Assistant', 'smallbiz', 10, 30),
  pt('pt_library', '\u{1F4DA}', 'Library Assistant', 'library', 10, 10),
  pt('pt_sign_holder', '\u{1FAA7}', 'Sign Holder', 'smallbiz', 10, 11),
  pt('pt_front_desk', '\u{1F3E8}', 'Hotel Front Desk Clerk', 'hotel', 10, 30, { minAge: 16, cleanRecord: true }),
  pt('pt_gym_reception', '\u{1F3CB}\u{FE0F}', 'Gym Receptionist', 'gym', 10, 17, { cleanRecord: true }),
  pt('pt_paperboy', '\u{1F5DE}\u{FE0F}', 'Newspaper Delivery Person', 'newspaper', 10, 12),
  pt('pt_yoga_reception', '\u{1F9D8}', 'Yoga Receptionist', 'gym', 9, 18, { cleanRecord: true }),
  pt('pt_boutique', '\u{1F45C}', 'Boutique Associate', 'retail', 9, 11, { cleanRecord: true }),
  pt('pt_laser_tag', '\u{1F52B}', 'Laser Tag Assistant', 'mall', 8, 21),
  pt('pt_donut', '\u{1F369}', 'Donut Maker', 'cafe', 8, 9),
  pt('pt_car_wash', '\u{1F9FC}', 'Car Wash Attendant', 'smallbiz', 8, 14),
  pt('pt_camp_counselor', '\u{1F3D5}\u{FE0F}', 'Camp Counselor', 'smallbiz', 12, 30, { minAge: 16 }),
  pt('pt_office_assistant', '\u{1F5C2}\u{FE0F}', 'Office Assistant', 'corporate', 13, 30, { minAge: 16, cleanRecord: true }),
  pt('pt_ice_cream', '\u{1F366}', 'Ice Cream Scooper', 'cafe', 8, 19),
  pt('pt_social_media', '\u{1F4F1}', 'Social Media Manager', 'corporate', 18, 12, { minAge: 16 }),
  pt('pt_stocker', '\u{1F4E6}', 'Grocery Store Stocker', 'grocery', 12, 20),
  pt('pt_sandwich', '\u{1F96A}', 'Sandwich Maker', 'fastfood', 11, 20),
  pt('pt_pizza', '\u{1F355}', 'Pizza Maker', 'fastfood', 11, 22),
  pt('pt_towel', '\u{1F9FB}', 'Pool Towel Attendant', 'pool', 9, 15),
  pt('pt_amusement', '\u{1F3A2}', 'Amusement Park Attendant', 'smallbiz', 12, 24),
  pt('pt_bowling', '\u{1F3B3}', 'Bowling Alley Attendant', 'smallbiz', 10, 20),
  pt('pt_tour_guide', '\u{1F5FA}\u{FE0F}', 'Tour Guide', 'travel', 15, 16, { minAge: 16 }),
  pt('pt_mall_santa', '\u{1F385}', 'Mall Santa', 'mall', 20, 25, { minAge: 50, gender: 'male' }),
  // University students only
  pt('pt_research_assistant', '\u{1F9EA}', 'Research Assistant', 'university', 16, 10, { studentOnly: true, minSmarts: 50 }),
  pt('pt_lab_assistant', '\u{1F52C}', 'Lab Assistant', 'university', 15, 15, { studentOnly: true }),
  pt('pt_resident_assistant', '\u{1F3E0}', 'Resident Assistant', 'university', 13, 11, { studentOnly: true, cleanRecord: true }),
  pt('pt_cafeteria', '\u{1F35D}', 'Cafeteria Worker', 'university', 10, 12, { studentOnly: true }),
  pt('pt_admissions', '\u{1F4E8}', 'Admissions Assistant', 'university', 10, 14, { studentOnly: true }),
  pt('pt_campus_tour', '\u{1F6B6}', 'Campus Tour Guide', 'university', 10, 9, { studentOnly: true }),
  pt('pt_grader', '\u{1F4AF}', 'Grader', 'university', 10, 13, { studentOnly: true, minSmarts: 55 }),
]

// ---------------------------------------------------------------------------
// CV relevance and the job market (cv.ts)

/**
 * Topic tags a recruiter in each industry looks for on a CV (shared vocabulary with CvEntry.tags:
 * tech, science, academic, arts, music, media, writing, business, finance, law, health, service,
 * sports, education, trades, hospitality, beauty, animals, government, language).
 */
export const INDUSTRY_TAGS: Record<Industry, string[]> = {
  corporate: ['business', 'finance'],
  tech: ['tech', 'science'],
  finance: ['finance', 'business'],
  bank: ['finance', 'business'],
  hospital: ['health', 'science', 'service'],
  medical: ['health', 'science'],
  dental: ['health', 'science'],
  vet: ['health', 'animals', 'science'],
  law: ['law', 'writing', 'government'],
  municipal: ['government', 'service'],
  police: ['law', 'service', 'sports'],
  fire: ['service', 'sports', 'health'],
  school: ['education', 'service', 'academic'],
  university: ['academic', 'science', 'education'],
  airline: ['hospitality', 'language', 'trades'],
  newspaper: ['media', 'writing'],
  publisher: ['writing', 'media', 'arts'],
  film: ['arts', 'media'],
  record: ['music', 'arts', 'media'],
  restaurant: ['hospitality'],
  fastfood: ['hospitality'],
  retail: ['business', 'hospitality'],
  grocery: ['hospitality'],
  salon: ['beauty', 'arts'],
  trades: ['trades'],
  smallbiz: ['business'],
  circus: ['arts', 'sports'],
  museum: ['arts', 'academic'],
  realestate: ['business', 'finance'],
  travel: ['hospitality', 'language'],
  fishery: ['trades', 'animals'],
  rideshare: ['trades'],
  trucking: ['trades'],
  mortuary: ['health', 'service'],
  church: ['service'],
  farm: ['trades', 'animals'],
  casino: ['hospitality', 'finance'],
  gym: ['sports', 'health'],
  hotel: ['hospitality', 'language'],
  mall: ['business', 'hospitality'],
  pool: ['sports', 'service'],
  cafe: ['hospitality'],
  nightclub: ['hospitality', 'music'],
  library: ['academic', 'writing', 'education'],
  science: ['science', 'academic', 'tech'],
  design: ['arts', 'tech'],
  factory: ['trades'],
}

/** The business-sim industry whose local demand (data/markets.ts) drives hiring in a job industry. */
export const INDUSTRY_MARKET: Partial<Record<Industry, MarketIndustry>> = {
  corporate: 'marketing',
  tech: 'software',
  hospital: 'clinic',
  medical: 'clinic',
  dental: 'clinic',
  vet: 'clinic',
  film: 'entertainment',
  record: 'entertainment',
  circus: 'entertainment',
  casino: 'entertainment',
  restaurant: 'restaurant',
  fastfood: 'restaurant',
  retail: 'fashion',
  mall: 'fashion',
  grocery: 'grocery',
  salon: 'salon',
  trades: 'construction',
  realestate: 'realEstate',
  travel: 'hotel',
  hotel: 'hotel',
  airline: 'hotel',
  fishery: 'farm',
  farm: 'farm',
  rideshare: 'logistics',
  trucking: 'logistics',
  gym: 'gym',
  cafe: 'cafe',
  nightclub: 'bar',
  design: 'marketing',
  factory: 'manufacturing',
  newspaper: 'marketing',
  publisher: 'marketing',
  science: 'energy',
}

/** CV tags for each major (what a degree in it is relevant to). */
export const MAJOR_TAGS: Record<string, string[]> = {
  Accounting: ['finance', 'business'],
  Anthropology: ['academic', 'science'],
  Archaeology: ['academic', 'science'],
  Architecture: ['arts', 'trades', 'tech'],
  'Art History': ['arts', 'academic'],
  Biology: ['science', 'health', 'animals'],
  Chemistry: ['science', 'health'],
  Communications: ['media', 'writing', 'business'],
  'Computer Science': ['tech', 'science'],
  'Criminal Justice': ['law', 'government'],
  Dance: ['arts', 'sports', 'music'],
  Economics: ['finance', 'business', 'academic'],
  Education: ['education', 'service'],
  Engineering: ['tech', 'science', 'trades'],
  English: ['writing', 'media', 'education'],
  Finance: ['finance', 'business'],
  'Graphic Design': ['arts', 'tech', 'media'],
  History: ['academic', 'writing'],
  'Information Systems': ['tech', 'business'],
  Journalism: ['media', 'writing'],
  Marketing: ['business', 'media'],
  Mathematics: ['science', 'tech', 'finance', 'academic'],
  Music: ['music', 'arts'],
  Nursing: ['health', 'service'],
  Philosophy: ['academic', 'writing', 'law'],
  Physics: ['science', 'tech', 'academic'],
  'Political Science': ['government', 'law', 'academic'],
  Psychology: ['health', 'science', 'service'],
  'Religious Studies': ['academic', 'service'],
}

/** CV tags a graduate program cares about. */
export const PROGRAM_TAGS: Record<GradKey, string[]> = {
  master: ['academic'],
  phd: ['academic', 'science'],
  business: ['business', 'finance'],
  law: ['law', 'writing', 'government'],
  medical: ['health', 'science', 'service'],
  dental: ['health', 'science'],
  nursing: ['health', 'service'],
  pharmacy: ['health', 'science'],
  veterinary: ['animals', 'health', 'science'],
}

export const ALL_JOBS: JobDef[] = [...FULLTIME_JOBS, ...PARTTIME_JOBS]

const JOB_INDEX: Record<string, JobDef> = Object.fromEntries(ALL_JOBS.map((j) => [j.id, j]))

export function getJobDef(id: string): JobDef | undefined {
  return JOB_INDEX[id]
}

// ---------------------------------------------------------------------------
// Freelance gigs (one-off, ad-based; minors allowed)

export interface GigDef {
  id: string
  label: string
  emoji: string
  minAge: number
  /** Allowed hourly rates (USD). */
  minRate: number
  maxRate: number
  /** Hours worked when someone answers the ad. */
  hours: [number, number]
  /** What the client calls you, e.g. "babysitter". */
  noun: string
  /** First-person log fragment, e.g. "babysat for". */
  verbed: string
}

export const GIGS: GigDef[] = [
  { id: 'babysitter', label: 'Babysitter', emoji: '\u{1F37C}', minAge: 13, minRate: 1, maxRate: 20, hours: [3, 10], noun: 'babysitter', verbed: 'babysat for' },
  { id: 'dog_walker', label: 'Dog Walker', emoji: '\u{1F415}', minAge: 13, minRate: 1, maxRate: 24, hours: [2, 8], noun: 'dog walker', verbed: 'walked the dog of' },
  { id: 'pet_sitter', label: 'Pet Sitter', emoji: '\u{1F431}', minAge: 13, minRate: 1, maxRate: 20, hours: [3, 12], noun: 'pet sitter', verbed: 'pet sat for' },
  { id: 'lawn_mower', label: 'Lawn Mower', emoji: '\u{1F33F}', minAge: 14, minRate: 2, maxRate: 30, hours: [2, 6], noun: 'lawn mower', verbed: 'mowed the lawn of' },
  { id: 'tutor', label: 'Tutor', emoji: '\u{1F4D8}', minAge: 15, minRate: 4, maxRate: 29, hours: [2, 10], noun: 'tutor', verbed: 'tutored the kid of' },
  { id: 'house_cleaner', label: 'House Cleaner', emoji: '\u{1F9FD}', minAge: 16, minRate: 3, maxRate: 25, hours: [3, 8], noun: 'house cleaner', verbed: 'cleaned the house of' },
  { id: 'caretaker', label: 'Caretaker', emoji: '\u{1F475}', minAge: 18, minRate: 3, maxRate: 20, hours: [4, 16], noun: 'caretaker', verbed: 'looked after the elderly parent of' },
  { id: 'handyman', label: 'Handyman', emoji: '\u{1F6E0}\u{FE0F}', minAge: 18, minRate: 6, maxRate: 40, hours: [2, 10], noun: 'handyman', verbed: 'fixed things around the house of' },
]

// ---------------------------------------------------------------------------
// Company names (combined with a seeded picker in careers.ts)

export const COMPANY_WORDS = {
  corpPrefix: ['Apex', 'Summit', 'Pinnacle', 'Bluefin', 'Nimbus', 'Ironclad', 'Evergreen', 'Quantum', 'Starlight', 'Interstellar', 'Golden Goose', 'Velvet', 'Crimson', 'Northwind', 'Silverline', 'Brightpath', 'Redwood', 'Cobalt', 'Lucky Duck', 'Sunny Side', 'Paperclip', 'Moonbeam', 'Granite', 'Hollow Oak', 'Wobbly Llama', 'Big Cheese', 'Meridian', 'Synergy', 'Vortex', 'Horizon'],
  corpSuffix: ['Holdings', 'Group', 'Partners', 'Industries', 'Solutions', 'Dynamics', 'Enterprises', 'Systems', 'Corp', 'Inc.', 'Worldwide', 'Consolidated', 'Ventures', 'International'],
  techSuffix: ['Labs', 'Software', 'Technologies', 'Digital', 'Data', 'Networks', 'Apps', 'Cloud'],
  financeSuffix: ['Capital', 'Financial', 'Investments', 'Asset Management', 'Securities', 'Wealth Partners'],
  bank: ['First National Bank of {city}', '{city} Savings & Loan', 'Piggy Bank Trust', 'Fort Knocks Bank', 'Golden Vault Credit Union', 'Nest Egg Bank', '{last} Federal Bank', 'Cash Cow Bank'],
  hospital: ['{city} General Hospital', "St. {first}'s Medical Center", 'Mercy Hospital of {city}', '{last} Memorial Hospital', '{city} Regional Medical Center', 'Good Samaritan Hospital'],
  medical: ['{last} Family Practice', '{city} Health Clinic', '{last} Medical Group', 'Wellspring Clinic', '{city} Wellness Center', 'Second Opinion Clinic'],
  dental: ['Bright Smile Dental', '{last} Family Dentistry', 'Pearly Whites Dental', '{city} Dental Care', 'Tooth Hurty Dental'],
  vet: ['{city} Animal Hospital', 'Paws & Claws Vet Clinic', 'Happy Tails Veterinary', '{last} Veterinary Clinic', 'Furry Friends Animal Clinic'],
  law: ['{last} & Associates', '{last}, {last2} & {last3}', '{last} {last2} LLP', '{last} Law Group', 'Sue Grabbit & Runne'],
  municipal: ['City of {city}', '{city} Public Works', '{city} City Hall', '{city} County'],
  police: ['{city} Police Department'],
  fire: ['{city} Fire Department'],
  school: ['{city} School District', '{city} Unified School District', '{last} Academy'],
  university: ['University of {city}', '{city} State University', '{last} University', '{last} College'],
  airline: ['SkyHigh Airways', 'Jetstream Air', 'Pelican Airlines', 'Cloud Nine Airlines', 'Albatross Air', 'Blue Yonder Airlines', 'Wingit Airlines'],
  newspaper: ['The {city} Tribune', '{city} Daily Herald', 'The {city} Gazette', 'The Morning Chronicle', '{city} Courier'],
  publisher: ['Inkwell Publishing', 'Dog-Eared Press', '{last} & Sons Publishing', 'Paper Tiger Books', 'Quill & Quire Media'],
  film: ['Starlight Studios', 'Silver Screen Pictures', 'Popcorn Studios', 'Lighthouse Films', 'Big Picture Productions'],
  record: ['Loud Noises Records', 'Vinyl Countdown Records', 'Bassline Music Group', 'Golden Ear Records', '{city} Sound Studios'],
  restaurant: ["{last}'s Diner", 'The Hungry Hippo', 'Le Petit Bistro', 'The Rusty Spoon', 'Olive Garden of Eden', 'Chez {first}', 'The Salty Pickle', 'Fork & Knife Grill'],
  fastfood: ['Burger Barn', "Cluckin' Good", 'Taco Tsunami', 'Noodle Nook', 'Wiener Wagon', 'Pizza Palooza', 'Fry Guys', 'Sub Marine Sandwiches'],
  retail: ['MegaMart', 'BargainBarn', 'ValueVille', 'Shop Till You Drop', 'Thrifty Threads', "{last}'s Department Store", 'Everything Emporium'],
  grocery: ['FreshCo Market', "{last}'s Grocery", 'Green Basket Foods', 'Corner Market', 'Price Slasher Supermarket'],
  salon: ['Shear Genius Salon', 'Curl Up & Dye', 'Hair Force One', 'The Mane Event', 'Nail It Spa'],
  trades: ["{last}'s Plumbing & Heating", '{last} Construction', 'Hammer Time Builders', '{last} Electric', 'Nuts & Bolts Repair', 'Rock Solid Contractors'],
  smallbiz: ["{last}'s Shop", '{last} & Co.', '{city} Odd Jobs', "{first}'s Workshop", 'Mom & Pop Enterprises'],
  circus: ['Cirque du Chaos', 'Big Top Bonanza', "{last} Brothers' Traveling Circus", 'Ringmaster Spectacular'],
  museum: ['{city} Museum of History', '{city} Art Museum', 'Museum of Curious Things', '{city} Natural History Museum'],
  realestate: ['{last} Realty', 'Dream Home Realty', 'Sold Sign Properties', '{city} Real Estate Group'],
  travel: ['Wanderlust Travel', 'Jet Set Getaways', 'Bon Voyage Agency', '{city} Travel Co.'],
  fishery: ['Deadliest Catch Fisheries', 'Salty Dog Fishing Co.', '{last} Seafood', 'Northern Waters Fishing'],
  rideshare: ['Zoomr', 'RideNow', 'LyftOff', 'CarPoolio'],
  trucking: ['{last} Freight', 'Big Rig Logistics', 'Long Haul Trucking', 'Eighteen Wheels Inc.'],
  mortuary: ['{last} Funeral Home', 'Eternal Rest Mortuary', 'Peaceful Pines Funeral Services'],
  church: ['{city} Cathedral', "St. {first}'s Parish", 'Our Lady of {city}', 'Holy Spirit Monastery'],
  farm: ['{last} Family Farm', 'Green Acres Farm', 'Sunny Meadows Ranch', 'Old MacDonald Farms'],
  casino: ['Lucky Seven Casino', 'The Golden Chip', 'High Roller Resort & Casino', 'Royal Flush Casino'],
  gym: ['Muscle Factory Gym', 'Iron Paradise Fitness', '{city} Athletic Club', 'Sweat Shop Fitness', 'Planet Pecs'],
  hotel: ['The Grand {city} Hotel', 'Comfy Pillow Inn', 'Sleepy Time Motel', 'The Ritzy Hotel', '{city} Plaza Hotel'],
  mall: ['{city} Mall', 'Galleria Mall', 'Sunset Plaza Mall', 'MegaMall of {city}'],
  pool: ['{city} Aquatic Center', 'Splash Zone', 'Cannonball Swim Club'],
  cafe: ['Daily Grind Coffee', 'Bean There Cafe', 'Brew Ha Ha', 'Sweet Spot Creamery', 'Holey Donuts'],
  nightclub: ['Club Neon', 'The Velvet Rope', 'Bottoms Up Bar', 'The Thirsty Moose', 'Last Call Lounge'],
  library: ['{city} Public Library', '{last} Memorial Library'],
  science: ['{last} Research Institute', 'Helix BioLabs', 'Petri Dish Laboratories', 'Green Planet Research', '{city} Science Center'],
  design: ['Pixel Perfect Studio', 'Blueprint Design Co.', '{last} Design Group', 'Kerning & Co.'],
  factory: ['{city} Manufacturing', 'Widget Works', 'Assembly Line Industries', '{last} Steel'],
} as const
